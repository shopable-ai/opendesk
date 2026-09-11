#!/usr/bin/env node
// Browser-only layout preview for the self-contained tray.html source.

const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");

const root = __dirname;

function argument(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

const host = argument("--host", "127.0.0.1");
const port = Number(argument("--port", "8000"));
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("--port must be an integer from 1 through 65535");
}

function source(name) {
  return fs.readFileSync(path.join(root, name), "utf8");
}

function previewDocument() {
  const html = source("tray.html");
  const css = source("tray.css");
  // The browser preview is deliberately static. Actual state transitions are
  // owned by controller.js inside OpenDesk and are covered by the native UI test.
  return html.replace("</head>", `<style>${css}</style></head>`);
}

function respond(response, status, headers, body) {
  response.writeHead(status, headers);
  response.end(body);
}

const server = http.createServer((request, response) => {
  if (request.method !== "GET" && request.method !== "HEAD") {
    respond(response, 405, { Allow: "GET, HEAD" }, "Method Not Allowed\n");
    return;
  }

  const pathname = new URL(request.url, "http://preview.local").pathname;
  if (pathname === "/") {
    response.writeHead(302, { Location: "/tray.html", "Cache-Control": "no-store" });
    response.end();
    return;
  }

  if (pathname !== "/tray.html") {
    respond(response, 404, { "Content-Type": "text/plain; charset=utf-8" }, "Not Found\n");
    return;
  }

  try {
    const body = previewDocument();
    const headers = {
      "Cache-Control": "no-store",
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; img-src 'self' data:",
      "Content-Type": "text/html; charset=utf-8"
    };
    respond(response, 200, headers, request.method === "HEAD" ? "" : body);
  } catch (error) {
    const detail = error && error.message ? error.message : String(error);
    respond(response, 500, { "Content-Type": "text/plain; charset=utf-8" }, `Preview failed: ${detail}\n`);
  }
});

server.listen(port, host, () => {
  console.log(`OpenDesk tray preview: http://${host}:${port}/tray.html`);
  console.log("Refresh the browser after editing tray.html or tray.css. Press Ctrl-C to stop.");
});
