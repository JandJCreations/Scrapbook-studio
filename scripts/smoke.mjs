#!/usr/bin/env node
// Browser smoke tests for Scrapbook Studio, driven by the agent-browser CLI.
//
// Usage:
//   npm run dev            # in one terminal
//   npm run smoke          # in another
//
// Env:
//   SMOKE_BASE_URL       App URL (default http://localhost:3000)
//   SMOKE_TEST_EMAIL     Optional: a dedicated test account. When set together with
//   SMOKE_TEST_PASSWORD  the password, the signed-in checks run too.
//
// Requires `agent-browser` on PATH (npm i -g agent-browser && agent-browser install).
// Set AGENT_BROWSER_EXECUTABLE_PATH to reuse an existing Chrome/Chromium.

import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { deflateSync } from "node:zlib";

const BASE = (process.env.SMOKE_BASE_URL || "http://localhost:3000").replace(/\/$/, "");
const EMAIL = process.env.SMOKE_TEST_EMAIL;
const PASSWORD = process.env.SMOKE_TEST_PASSWORD;
const SESSION = `scrapbook-smoke-${process.pid}`;
// A pretend microphone (a test tone) that is always allowed, for the voiceover checks.
process.env.AGENT_BROWSER_ARGS ??= "--use-fake-ui-for-media-stream,--use-fake-device-for-media-stream";

function ab(...args) {
  try {
    return execFileSync("agent-browser", ["--session", SESSION, ...args], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      shell: process.platform === "win32",
    }).trim();
  } catch (err) {
    // Say which step failed, not just how.
    const detail = (err.stderr || err.message || String(err)).toString().trim();
    throw new Error(`${args.join(" ").slice(0, 100)}: ${detail}`);
  }
}

function currentPath() {
  return new URL(ab("get", "url").split("\n").pop()).pathname;
}

function waitForPath(predicate, timeoutMs = 15000) {
  const end = Date.now() + timeoutMs;
  let path = currentPath();
  while (!predicate(path) && Date.now() < end) {
    ab("wait", "500");
    path = currentPath();
  }
  return path;
}

function expect(cond, message) {
  if (!cond) throw new Error(message);
}

// Polls the interactive snapshot until `pattern` shows up (or times out).
function waitForSnapshot(pattern, timeoutMs = 15000) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    const snap = ab("snapshot", "-i");
    if (pattern.test(snap)) return snap;
    ab("wait", "400");
  }
  throw new Error(`timed out waiting for ${pattern}`);
}

// Clicks the first element whose snapshot line matches.
function clickFirst(pattern) {
  const line = ab("snapshot", "-i").split("\n").find((l) => pattern.test(l));
  const ref = line && line.match(/ref=(e\d+)/);
  if (!ref) throw new Error(`no element matching ${pattern}`);
  ab("click", `@${ref[1]}`);
}

function clickButton(name) {
  ab("find", "role", "button", "click", "--name", name);
}

// A small solid-colour PNG, so the checks have photos to import.
function writePng(dir, name, [r, g, b]) {
  const width = 64;
  const height = 48;
  const row = Buffer.concat([Buffer.from([0]), Buffer.alloc(width * 3, 0).fill(Buffer.from([r, g, b]))]);
  const raw = Buffer.concat(Array.from({ length: height }, () => row));
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (buf) => {
    let c = 0xffffffff;
    for (const byte of buf) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type), data]);
    const sum = Buffer.alloc(4);
    sum.writeUInt32BE(crc(body));
    return Buffer.concat([len, body, sum]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.set([8, 2, 0, 0, 0], 8);
  const file = join(dir, name);
  writeFileSync(
    file,
    Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      chunk("IHDR", header),
      chunk("IDAT", deflateSync(raw)),
      chunk("IEND", Buffer.alloc(0)),
    ]),
  );
  return file;
}

const checks = [];
const check = (name, fn) => checks.push({ name, fn });

check("landing page shows the hero heading", () => {
  ab("open", `${BASE}/`);
  const snap = ab("snapshot");
  expect(/heading "Turn your memories into living scrapbooks"/.test(snap), "hero heading not found");
  expect(/link "Log in"/.test(snap), "Log in link not found");
});

check("login page shows the sign-in form", () => {
  ab("open", `${BASE}/login`);
  const snap = ab("snapshot", "-i");
  expect(/textbox "Email"/.test(snap), "Email field not found");
  expect(/textbox "Password"/.test(snap), "Password field not found");
  expect(/button "Sign in"/.test(snap), "Sign in button not found");
});

check("editor redirects to login when signed out", () => {
  ab("open", `${BASE}/editor/smoke-test`);
  const path = waitForPath((p) => p === "/login");
  expect(path === "/login", `expected /login, got ${path}`);
});

if (EMAIL && PASSWORD) {
  check("test account can sign in and reach the dashboard", () => {
    ab("open", `${BASE}/login`);
    ab("find", "label", "Email", "fill", EMAIL);
    ab("find", "label", "Password", "fill", PASSWORD);
    ab("find", "role", "button", "click", "--name", "Sign in");
    const path = waitForPath((p) => p.startsWith("/dashboard"));
    expect(path.startsWith("/dashboard"), `expected /dashboard after sign-in, got ${path}`);
  });

  // The checks below share one new video project.
  // Opens a brand-new video project in the editor and imports some photos into its library.
  function newVideoWithPhotos(name, photos) {
    ab("open", `${BASE}/dashboard`);
    // The welcome tour is checked on its own; here it would only cover the editor.
    ab("eval", 'localStorage.setItem("scrapbook-studio:tour-seen", "1")');
    ab("find", "role", "button", "click", "--name", "New project");
    waitForSnapshot(/button "Create video"/);
    ab("wait", "500"); // let the dialog finish opening, or its backdrop takes the click
    ab("find", "label", "Name", "fill", name);
    clickButton("Create video");
    const path = waitForPath((p) => p.startsWith("/editor/"));
    expect(path.startsWith("/editor/"), `expected the editor, got ${path}`);
    waitForSnapshot(/button "Import"/);
    const dir = mkdtempSync(join(tmpdir(), "smoke-"));
    const colours = [[240, 120, 80], [80, 140, 240], [120, 200, 120]];
    ab("upload", "input[type=file]", ...photos.map((photo, i) => writePng(dir, photo, colours[i % colours.length])));
    for (const photo of photos) waitForSnapshot(new RegExp(`button "Add ${photo.replace(".", "\\.")} to the video"`));
  }

  // The voiceover check carries on in the project this one makes.
  check("a new video opens in the editor and photos go on the timeline", () => {
    newVideoWithPhotos("Smoke test video", ["sunrise.png", "sea.png"]);
    ab("find", "role", "button", "click", "--name", "Add sunrise.png to the video");
    ab("find", "role", "button", "click", "--name", "Add sea.png to the video");
    waitForSnapshot(/button "sea\.png"/);
  });

  check("a voiceover can be recorded and lowers the music while it plays", () => {
    ab("find", "role", "tab", "click", "--name", "audio");
    waitForSnapshot(/button "Add .* as music"/);
    clickFirst(/button "Add .* as music"/);
    clickButton("Record voiceover");
    waitForSnapshot(/button "Stop recording voiceover"/);
    ab("wait", "1500");
    clickButton("Stop recording voiceover");
    // The take lands on its own Voiceover lane, which dips the music by default.
    waitForSnapshot(/button "Lower other sound while speaking"/);
    const pressed = ab("get", "attr", '[aria-label="Lower other sound while speaking"]', "aria-pressed");
    expect(/true/.test(pressed), `expected the music dip to be on, got ${pressed}`);
  });

  check("Make a video turns ticked photos into a titled video with music", () => {
    newVideoWithPhotos("Beach day", ["one.png", "two.png", "three.png"]);
    for (const photo of ["one.png", "two.png", "three.png"]) ab("find", "label", `Select ${photo}`, "check");
    clickButton("Make a video");
    // A title with the project's name opens it, and a song plays underneath.
    waitForSnapshot(/button "Beach day"/);
    waitForSnapshot(/button "Confetti"/);
    // Later photos come in with a transition (the ⇄ on the clip).
    waitForSnapshot(/button "⇄ three\.png"/);
  });
}

let failed = 0;
try {
  for (const { name, fn } of checks) {
    try {
      fn();
      console.log(`✓ ${name}`);
    } catch (err) {
      failed++;
      console.log(`✗ ${name}\n    ${(err.stderr || err.message || String(err)).toString().trim()}`);
    }
  }
} finally {
  try {
    ab("close");
  } catch {}
}

if (!EMAIL || !PASSWORD) {
  console.log("- signed-in checks skipped (set SMOKE_TEST_EMAIL and SMOKE_TEST_PASSWORD)");
}
console.log(`\n${checks.length - failed}/${checks.length} passed`);
process.exit(failed ? 1 : 0);
