#!/usr/bin/env node
// A tiny in-memory stand-in for Supabase, so the signed-in smoke checks can
// run without a real project or test account.
//
// It speaks just enough of the auth (GoTrue), REST (PostgREST) and storage
// APIs for the app's own calls. Data lives in memory and is gone when the
// process exits.
//
// Usage:
//   node scripts/mock-supabase.mjs                 # listens on :54329
//   NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54329 \
//   NEXT_PUBLIC_SUPABASE_ANON_KEY=mock-anon-key npm run dev   (or build + start)
//   SMOKE_TEST_EMAIL=smoke@example.com SMOKE_TEST_PASSWORD=smoke-pass npm run smoke
//
// Any email/password signs in; each email is its own user.

import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const PORT = Number(process.env.MOCK_SUPABASE_PORT || 54329);

// Column lists come from the generated types, so new columns just work.
const typesPath = fileURLToPath(new URL("../src/lib/supabase/database.types.ts", import.meta.url));
const COLUMNS = parseColumns(readFileSync(typesPath, "utf8"));

function parseColumns(source) {
  const tables = {};
  const re = /^ {6}([a-z_]+): \{\n {8}Row: \{\n([\s\S]*?)\n {8}\};/gm;
  for (const [, table, body] of source.matchAll(re)) {
    tables[table] = {};
    for (const line of body.split("\n")) {
      const m = line.match(/^\s+([a-z_0-9]+): (.+);$/);
      if (m) tables[table][m[1]] = m[2];
    }
  }
  return tables;
}

const SPECIAL_DEFAULTS = { frame_width: 1080, frame_height: 1080, volume: 1 };

function defaultFor(column, type) {
  if (column in SPECIAL_DEFAULTS) return SPECIAL_DEFAULTS[column];
  if (column === "id") return randomUUID();
  if (column.endsWith("_at") && !type.includes("null")) return new Date().toISOString();
  if (type.includes("null") || type === "unknown") return null;
  if (type.startsWith("boolean")) return false;
  if (type.startsWith("number")) return 0;
  if (type.startsWith("Json") || type.includes("Record")) return {};
  if (type.endsWith("[]")) return [];
  return "";
}

const db = {}; // table -> rows
const rows = (table) => (db[table] ??= []);
const users = new Map(); // token -> user

function withDefaults(table, row) {
  const cols = COLUMNS[table] ?? {};
  const out = {};
  for (const [col, type] of Object.entries(cols)) out[col] = defaultFor(col, type);
  return Object.assign(out, row);
}

// ---------------------------------------------------------------- auth

function b64url(obj) {
  return Buffer.from(JSON.stringify(obj)).toString("base64url");
}

function session(email) {
  const id = randomUUID();
  const now = Math.floor(Date.now() / 1000);
  const user = {
    id,
    aud: "authenticated",
    role: "authenticated",
    email,
    email_confirmed_at: new Date().toISOString(),
    app_metadata: { provider: "email" },
    user_metadata: {},
    created_at: new Date().toISOString(),
  };
  const existing = [...users.values()].find((u) => u.email === email);
  const finalUser = existing ?? user;
  const access_token = `${b64url({ alg: "HS256", typ: "JWT" })}.${b64url({
    sub: finalUser.id,
    email,
    role: "authenticated",
    aud: "authenticated",
    iat: now,
    exp: now + 3600 * 24,
    session_id: randomUUID(),
  })}.mock`;
  const refresh_token = randomUUID();
  users.set(access_token, finalUser);
  users.set(`refresh:${refresh_token}`, finalUser);
  return {
    access_token,
    token_type: "bearer",
    expires_in: 3600 * 24,
    expires_at: now + 3600 * 24,
    refresh_token,
    user: finalUser,
  };
}

function userFrom(req) {
  const auth = req.headers.authorization || "";
  return users.get(auth.replace(/^Bearer /i, "")) ?? null;
}

// ---------------------------------------------------------------- rest

function parseValue(raw) {
  if (raw === "null") return null;
  if (raw === "true") return true;
  if (raw === "false") return false;
  return raw;
}

function matches(row, key, expr) {
  const negate = expr.startsWith("not.");
  if (negate) expr = expr.slice(4);
  const dot = expr.indexOf(".");
  const op = expr.slice(0, dot);
  const raw = expr.slice(dot + 1);
  const v = row[key];
  let ok;
  switch (op) {
    case "eq":
      ok = String(v) === raw;
      break;
    case "neq":
      ok = String(v) !== raw;
      break;
    case "is":
      ok = v === parseValue(raw);
      break;
    case "in": {
      const list = raw.replace(/^\(|\)$/g, "").split(",").map((s) => s.replace(/^"|"$/g, ""));
      ok = list.includes(String(v));
      break;
    }
    case "gt":
      ok = v > raw;
      break;
    case "gte":
      ok = v >= raw;
      break;
    case "lt":
      ok = v < raw;
      break;
    case "lte":
      ok = v <= raw;
      break;
    default:
      ok = true;
  }
  return negate ? !ok : ok;
}

const RESERVED = new Set(["select", "order", "limit", "offset", "on_conflict", "columns"]);

function filterRows(list, params, user) {
  return list.filter((row) => {
    // Row-level security, roughly: you only see your own rows.
    if (user && "owner_id" in row && row.owner_id && row.owner_id !== user.id) return false;
    for (const [key, expr] of params) {
      if (RESERVED.has(key)) continue;
      if (!matches(row, key, expr)) return false;
    }
    return true;
  });
}

function project(row, select) {
  if (!select || select === "*") return row;
  const out = {};
  for (const col of select.split(",").map((s) => s.trim())) {
    if (col === "*") Object.assign(out, row);
    else if (col in row) out[col] = row[col];
  }
  return out;
}

function sortRows(list, order) {
  if (!order) return list;
  const keys = order.split(",").map((part) => {
    const [col, dir] = part.split(".");
    return { col, desc: dir === "desc" };
  });
  return [...list].sort((a, b) => {
    for (const { col, desc } of keys) {
      if (a[col] === b[col]) continue;
      const r = a[col] > b[col] ? 1 : -1;
      return desc ? -r : r;
    }
    return 0;
  });
}

function send(res, status, body, headers = {}) {
  res.writeHead(status, {
    "content-type": "application/json",
    "access-control-allow-origin": "*",
    "access-control-allow-headers": "*",
    "access-control-allow-methods": "GET,POST,PATCH,PUT,DELETE,OPTIONS,HEAD",
    "access-control-expose-headers": "content-range",
    ...headers,
  });
  res.end(body === undefined ? "" : typeof body === "string" ? body : JSON.stringify(body));
}

function respondRows(req, res, list, select, status = 200) {
  const out = list.map((r) => project(r, select));
  const prefer = req.headers.prefer || "";
  if (req.method !== "GET" && !prefer.includes("return=representation")) {
    return send(res, status === 201 ? 201 : 204);
  }
  if ((req.headers.accept || "").includes("vnd.pgrst.object")) {
    if (out.length !== 1) {
      return send(res, 406, {
        code: "PGRST116",
        message: "JSON object requested, multiple (or no) rows returned",
        details: `The result contains ${out.length} rows`,
        hint: null,
      });
    }
    return send(res, status, out[0]);
  }
  send(res, status, out, { "content-range": `0-${Math.max(0, out.length - 1)}/${out.length}` });
}

function handleRest(req, res, table, url, body) {
  const user = userFrom(req);
  const params = [...url.searchParams.entries()];
  const select = url.searchParams.get("select");
  const list = rows(table);

  if (req.method === "GET" || req.method === "HEAD") {
    let found = sortRows(filterRows(list, params, user), url.searchParams.get("order"));
    const limit = url.searchParams.get("limit");
    if (limit) found = found.slice(0, Number(limit));
    return respondRows(req, res, found, select);
  }

  if (req.method === "POST") {
    const items = Array.isArray(body) ? body : [body];
    const prefer = req.headers.prefer || "";
    const upsert = prefer.includes("resolution=merge-duplicates");
    const ignore = prefer.includes("resolution=ignore-duplicates");
    const conflictCols = (url.searchParams.get("on_conflict") || "id").split(",");
    const written = [];
    for (const item of items) {
      const existing =
        upsert || ignore
          ? list.find((r) => conflictCols.every((c) => item[c] !== undefined && r[c] === item[c]))
          : undefined;
      if (existing) {
        if (upsert) Object.assign(existing, item, { updated_at: new Date().toISOString() });
        written.push(existing);
      } else {
        const row = withDefaults(table, item);
        list.push(row);
        written.push(row);
      }
    }
    return respondRows(req, res, written, select, 201);
  }

  if (req.method === "PATCH") {
    const found = filterRows(list, params, user);
    for (const row of found) Object.assign(row, body);
    return respondRows(req, res, found, select);
  }

  if (req.method === "DELETE") {
    const found = filterRows(list, params, user);
    db[table] = list.filter((r) => !found.includes(r));
    return respondRows(req, res, found, select);
  }

  send(res, 405, { message: "method not allowed" });
}

// ---------------------------------------------------------------- storage

const files = new Map(); // bucket/path -> { type, data }

// supabase-js sends a File as multipart form data: keep only the file part, as real storage does.
function uploadedFile(type, raw) {
  const boundary = type.match(/^multipart\/form-data;\s*boundary=(.+)$/)?.[1];
  if (!boundary) return { type, data: raw };
  const delimiter = Buffer.from(`--${boundary}`);
  let at = raw.indexOf(delimiter);
  while (at !== -1) {
    const next = raw.indexOf(delimiter, at + delimiter.length);
    if (next === -1) break;
    const part = raw.subarray(at + delimiter.length + 2, next - 2); // drop the CRLFs around the part
    const split = part.indexOf("\r\n\r\n");
    const headers = part.subarray(0, split).toString();
    if (/filename=/.test(headers)) {
      const partType = headers.match(/content-type:\s*([^\r\n]+)/i)?.[1] ?? "application/octet-stream";
      return { type: partType, data: part.subarray(split + 4) };
    }
    at = next;
  }
  return { type, data: raw };
}

function handleStorage(req, res, rest, raw) {
  // object/<bucket>/<path>, object/sign/<bucket>/<path>, object/public/<bucket>/<path>
  const [kind, ...parts] = rest.split("/");
  if (kind !== "object") return send(res, 200, []);
  if (parts[0] === "sign") {
    if (req.method === "POST" && parts.length === 2) {
      // Batch sign: { paths: [...] }
      const { paths = [] } = JSON.parse(raw.toString() || "{}");
      return send(
        res,
        200,
        paths.map((p) => ({ path: p, signedURL: `/object/public/${parts[1]}/${p}`, error: null })),
      );
    }
    const key = parts.slice(1).join("/");
    return send(res, 200, { signedURL: `/object/public/${key}` });
  }
  if (parts[0] === "public") {
    const file = files.get(parts.slice(1).join("/"));
    if (!file) return send(res, 404, { message: "not found" });
    res.writeHead(200, { "content-type": file.type, "access-control-allow-origin": "*" });
    return res.end(file.data);
  }
  const key = parts.join("/");
  if (req.method === "POST" || req.method === "PUT") {
    files.set(key, uploadedFile(req.headers["content-type"] || "application/octet-stream", raw));
    return send(res, 200, { Key: key, Id: randomUUID() });
  }
  if (req.method === "DELETE") {
    const { prefixes = [] } = JSON.parse(raw.toString() || "{}");
    for (const p of prefixes) files.delete(`${parts[0]}/${p}`);
    return send(res, 200, []);
  }
  send(res, 200, {});
}

// ---------------------------------------------------------------- server

createServer((req, res) => {
  const chunks = [];
  req.on("data", (c) => chunks.push(c));
  req.on("end", () => {
    const raw = Buffer.concat(chunks);
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (req.method === "OPTIONS") return send(res, 204);
    try {
      const path = url.pathname;
      if (path.startsWith("/auth/v1/")) {
        const route = path.slice("/auth/v1/".length);
        const body = raw.length ? JSON.parse(raw.toString()) : {};
        if (route === "token") {
          const grant = url.searchParams.get("grant_type");
          if (grant === "refresh_token") {
            const user = users.get(`refresh:${body.refresh_token}`);
            if (!user) return send(res, 400, { error: "invalid_grant", error_description: "bad refresh token" });
            return send(res, 200, session(user.email));
          }
          return send(res, 200, session(body.email));
        }
        if (route === "signup") return send(res, 200, session(body.email));
        if (route === "user") {
          const user = userFrom(req);
          if (!user) return send(res, 401, { code: 401, error_code: "no_authorization", msg: "no user" });
          return send(res, 200, user);
        }
        if (route === "logout") return send(res, 204);
        return send(res, 200, {});
      }
      if (path.startsWith("/rest/v1/")) {
        const table = path.slice("/rest/v1/".length);
        const body = raw.length ? JSON.parse(raw.toString()) : {};
        return handleRest(req, res, table, url, body);
      }
      if (path.startsWith("/storage/v1/")) {
        return handleStorage(req, res, path.slice("/storage/v1/".length), raw);
      }
      send(res, 404, { message: `mock-supabase: no route for ${path}` });
    } catch (err) {
      console.error(err);
      send(res, 500, { message: String(err) });
    }
  });
}).listen(PORT, "127.0.0.1", () => {
  console.log(`mock supabase listening on http://127.0.0.1:${PORT}`);
});
