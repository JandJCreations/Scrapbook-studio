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

const BASE = (process.env.SMOKE_BASE_URL || "http://localhost:3000").replace(/\/$/, "");
const EMAIL = process.env.SMOKE_TEST_EMAIL;
const PASSWORD = process.env.SMOKE_TEST_PASSWORD;
const SESSION = `scrapbook-smoke-${process.pid}`;

function ab(...args) {
  return execFileSync("agent-browser", ["--session", SESSION, ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    shell: process.platform === "win32",
  }).trim();
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
