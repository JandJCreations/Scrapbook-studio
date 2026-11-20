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
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
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
    importFiles(photos.map((photo, i) => writePng(dir, photo, colours[i % colours.length])));
  }

  // Imports files into the open project's library and waits until each one can be added.
  function importFiles(files) {
    if (files.length === 0) return;
    ab("upload", "input[type=file]", ...files);
    for (const file of files) {
      const name = basename(file).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      waitForSnapshot(new RegExp(`button "Add ${name} to the video"`), 30000);
    }
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

  // Carries on in the "Beach day" video made above.
  check("the video exports as an MP4 with its sound", () => {
    clickFirst(/button "Export"/);
    waitForSnapshot(/combobox "Resolution"/);
    ab("wait", "500"); // let the dialog finish opening
    ab("select", '[aria-label="Resolution"]', "720p");
    ab("eval", '[...document.querySelectorAll("[role=dialog] button")].find((b) => b.textContent.trim() === "Export").click()');
    const end = Date.now() + 180000;
    let snap = "";
    while (Date.now() < end) {
      snap = ab("snapshot");
      if (/Saved as .*\.mp4/.test(snap)) return;
      const failure = snap.match(/alert[^\n]*(\n[^\n]*){0,2}/);
      if (failure) throw new Error(`export failed: ${failure[0].replace(/\s+/g, " ")}`);
      ab("wait", "1000");
    }
    throw new Error("the export did not finish in 3 minutes");
  });

  check("switching to portrait reshapes the video, and undo brings landscape back", () => {
    ab("press", "Escape"); // close the export dialog
    ab("select", '[aria-label="Frame size"]', "portrait");
    waitForSnapshot(/combobox "Frame size"[^\n]*Portrait/);
    clickButton("Undo");
    waitForSnapshot(/combobox "Frame size"[^\n]*Landscape/);
  });

  // A real video file (2 s, VP8 + Opus) from scripts/fixtures, imported on its own.
  check("an imported video clip goes on the timeline as a video", () => {
    newVideoWithPhotos("Clip test", []);
    importFiles([join(dirname(fileURLToPath(import.meta.url)), "fixtures", "clip.webm")]);
    clickButton("Add clip.webm to the video");
    waitForSnapshot(/button "clip\.webm"/);
    // The clip's tooltip names its kind, so a video that was read as a photo or a song fails here.
    const title = ab("get", "attr", 'button[title^="clip.webm"]', "title");
    expect(/\(video\)/.test(title), `expected the clip to be a video, got "${title}"`);
  });

  // A file that can't be used stays in view with the reason and can be taken away, instead of quietly vanishing.
  check("a file that can't be uploaded says why and can be removed", () => {
    const dir = mkdtempSync(join(tmpdir(), "smoke-"));
    const notes = join(dir, "notes.txt");
    writeFileSync(notes, "not a photo");
    ab("upload", "input[type=file]", notes);
    waitForSnapshot(/button "Remove notes\.txt"/);
    expect(/can't be used/.test(ab("get", "text", "body")), "expected a reason next to the failed file");
    clickButton("Remove notes.txt");
    const end = Date.now() + 10000;
    while (/Remove notes\.txt/.test(ab("snapshot", "-i")) && Date.now() < end) ab("wait", "400");
    expect(!/Remove notes\.txt/.test(ab("snapshot", "-i")), "the failed file was not removed");
  });

  // The editing checks below share one video: a 3-second photo, a 5-second photo and the 2-second clip.
  // Runs JavaScript in the page and gives back what it returned.
  function evalValue(js) {
    return JSON.parse(ab("eval", js).split("\n").pop());
  }
  // The clips on the main strip, left to right, by name.
  function stripOrder() {
    return JSON.parse(
      evalValue(`JSON.stringify([...document.querySelectorAll("main button[data-clip-id]")]
        .filter((b) => /[(](image|video)[)]$/.test(b.title))
        .sort((a, b) => a.getBoundingClientRect().x - b.getBoundingClientRect().x)
        .map((b) => b.title.replace(/ [(].*/, "")))`),
    );
  }
  // The video's length as the player shows it ("0:00.0 / 0:12.0" gives "0:12.0").
  function videoLength() {
    return evalValue('document.querySelector("main").innerText.match(/[/] (\\d+:\\d+[.]\\d)/)?.[1] ?? ""');
  }
  function waitFor(read, want, timeoutMs = 10000) {
    const end = Date.now() + timeoutMs;
    let got = read();
    while (JSON.stringify(got) !== JSON.stringify(want) && Date.now() < end) {
      ab("wait", "300");
      got = read();
    }
    expect(JSON.stringify(got) === JSON.stringify(want), `expected ${JSON.stringify(want)}, got ${JSON.stringify(got)}`);
  }
  const chip = (name) => `main button[data-clip-id][title^="${name} ("]`;
  function boxOf(selector) {
    return JSON.parse(ab("get", "box", selector, "--json")).data;
  }
  // Presses a clip near its top (clear of the round transition button on each cut) and drags it to x.
  function dragClip(name, toX) {
    const box = boxOf(chip(name));
    const y = box.y + 15;
    ab("mouse", "move", String(box.x + box.width / 2), String(y));
    ab("mouse", "down");
    ab("mouse", "move", String(toX), String(y), "--steps", "15");
    ab("mouse", "up");
  }
  // Moves the playhead by clicking the ruler above the timeline.
  function seekTo(x) {
    const ruler = boxOf('[aria-label="Timeline ruler"]');
    ab("mouse", "move", String(x), String(ruler.y + ruler.height / 2));
    ab("mouse", "down");
    ab("mouse", "up");
  }

  check("a photo's length can be changed, and undo puts it back", () => {
    newVideoWithPhotos("Editing test", ["short.png", "long.png"]);
    importFiles([join(dirname(fileURLToPath(import.meta.url)), "fixtures", "clip.webm")]);
    for (const name of ["short.png", "long.png", "clip.webm"]) clickButton(`Add ${name} to the video`);
    waitFor(stripOrder, ["short.png", "long.png", "clip.webm"]);
    waitFor(videoLength, "0:12.0");
    // Zoom the timeline out so every clip is in view for the drags below.
    ab("focus", '[aria-label="Timeline zoom"]');
    for (let i = 0; i < 10; i++) ab("press", "ArrowLeft");
    ab("click", chip("short.png"));
    waitForSnapshot(/slider "Duration \(seconds\)"/);
    ab("focus", '[aria-label="Duration (seconds)"]');
    ab("press", "Home"); // the shortest a photo can be: half a second
    waitFor(videoLength, "0:07.5");
    clickButton("Undo");
    waitFor(videoLength, "0:12.0");
    clickButton("Redo");
    waitFor(videoLength, "0:07.5");
    clickButton("Undo");
    // Three seconds, half a second a step, for the checks below.
    ab("focus", '[aria-label="Duration (seconds)"]');
    for (let i = 0; i < 4; i++) ab("press", "ArrowLeft");
    waitFor(videoLength, "0:10.0");
  });

  check("a longer clip can be dragged in front of a shorter one", () => {
    const first = boxOf(chip("short.png"));
    dragClip("long.png", first.x + 10);
    waitFor(stripOrder, ["long.png", "short.png", "clip.webm"]);
    // ...and back to the end, past the video clip's middle.
    const last = boxOf(chip("clip.webm"));
    dragClip("long.png", last.x + last.width - 2);
    waitFor(stripOrder, ["short.png", "clip.webm", "long.png"]);
    clickButton("Undo");
    waitFor(stripOrder, ["long.png", "short.png", "clip.webm"]);
  });

  check("a clip can be split at the playhead, and a piece deleted", () => {
    const long = boxOf(chip("long.png"));
    seekTo(long.x + long.width / 2);
    ab("click", chip("long.png"));
    clickButton("Split");
    waitFor(stripOrder, ["long.png", "long.png", "short.png", "clip.webm"]);
    waitFor(videoLength, "0:10.0");
    ab("click", chip("long.png"));
    clickButton("Delete");
    waitFor(stripOrder, ["long.png", "short.png", "clip.webm"]);
    waitFor(videoLength, "0:07.5");
    clickButton("Undo");
    waitFor(videoLength, "0:10.0");
  });

  check("a video clip can be trimmed from its end", () => {
    const clip = boxOf(chip("clip.webm"));
    const y = clip.y + 15;
    ab("mouse", "move", String(clip.x + clip.width - 2), String(y));
    ab("mouse", "down");
    ab("mouse", "move", String(clip.x + clip.width / 2), String(y), "--steps", "10");
    ab("mouse", "up");
    const length = videoLength();
    expect(length > "0:08.0" && length < "0:10.0", `expected the video to get shorter than 0:10.0, got ${length}`);
  });

  check("a photo gets a look and a caption", () => {
    ab("click", chip("short.png"));
    ab("find", "role", "tab", "click", "--name", "filters");
    clickButton("Filter Mono");
    const pressed = ab("get", "attr", '[aria-label="Filter Mono"]', "aria-pressed");
    expect(/true/.test(pressed), `expected Mono to be picked, got ${pressed}`);
    ab("find", "role", "tab", "click", "--name", "text");
    clickButton("Caption for selected slide");
    waitForSnapshot(/textbox "Text"/);
    ab("fill", 'textarea[aria-label="Text"]', "Sunny day");
    waitForSnapshot(/button "Sunny day"/);
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
