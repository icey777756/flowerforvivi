#!/usr/bin/env node
/**
 * Zero-dependency static server for 指尖生花.
 *
 *   node server.mjs
 *   PORT=8080 node server.mjs
 *
 * Camera access requires a secure context. Browsers treat localhost / 127.0.0.1
 * as secure, so opening http://127.0.0.1:5178 is enough.
 */

import http from "node:http";
import { createReadStream, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 5178);
const HOST = process.env.HOST || "127.0.0.1";

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".wasm": "application/wasm",
  ".data": "application/octet-stream",
  ".binarypb": "application/octet-stream",
  ".tflite": "application/octet-stream",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".txt": "text/plain; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
};

function safePath(pathname) {
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return null;
  }

  if (decoded.includes("\0")) return null;

  const relative = decoded.replace(/^[/\\]+/, "");
  if (relative.split(/[/\\]+/).some((part) => part === ".." || part.startsWith("."))) {
    return null;
  }

  const target = path.resolve(ROOT, relative || "index.html");
  if (target !== ROOT && !target.startsWith(`${ROOT}${path.sep}`)) return null;
  return target;
}

function sendError(res, status, message) {
  res.writeHead(status, {
    "Content-Type": "text/plain; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(`${status} ${message}\n`);
}

const server = http.createServer((req, res) => {
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.writeHead(405, { Allow: "GET, HEAD" });
    res.end("Method not allowed\n");
    return;
  }

  let pathname;
  try {
    pathname = new URL(req.url, `http://${req.headers.host || "localhost"}`).pathname;
  } catch {
    sendError(res, 400, "Bad request");
    return;
  }

  let filePath = safePath(pathname);
  if (!filePath) {
    sendError(res, 403, "Forbidden");
    return;
  }

  try {
    let stat = statSync(filePath);
    if (stat.isDirectory()) {
      filePath = path.join(filePath, "index.html");
      stat = statSync(filePath);
    }
    if (!stat.isFile()) throw new Error("not a file");

    const ext = path.extname(filePath).toLowerCase();
    const headers = {
      "Content-Type": MIME[ext] || "application/octet-stream",
      "Content-Length": stat.size,
      "Cache-Control": "no-cache, no-store, must-revalidate",
      "X-Content-Type-Options": "nosniff",
    };

    res.writeHead(200, headers);
    if (req.method === "HEAD") {
      res.end();
      return;
    }
    createReadStream(filePath).pipe(res);
  } catch {
    sendError(res, 404, "Not found");
  }
});

server.listen(PORT, HOST, () => {
  console.log(`\n  指尖生花 · Bloom at Your Fingertips\n`);
  console.log(`  Local:   http://${HOST}:${PORT}/`);
  console.log(`  Demo:    http://${HOST}:${PORT}/?demo=1\n`);
  console.log("  Press Ctrl+C to stop.\n");
});

server.on("error", (error) => {
  if (error.code === "EADDRINUSE") {
    console.error(`Port ${PORT} is already in use. Try: PORT=5179 node server.mjs`);
  } else {
    console.error(error);
  }
  process.exitCode = 1;
});
