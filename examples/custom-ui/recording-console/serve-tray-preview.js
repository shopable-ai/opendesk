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

// This browser-only bridge deliberately lives outside tray.html: Custom UI v1
// rejects business scripts in file-backed HTML, while the preview still needs
// to demonstrate the same visible state transitions as its JS controller.
function previewBridge() {
  return `<script>
(() => {
  const byID = id => document.getElementById(id);
  const expanded = byID("trayExpanded");
  const expand = byID("trayExpand");
  const state = byID("trayState");
  const modes = ["全屏", "区域", "窗口"];
  const modeControls = ["traySourceFull", "traySourceRegion", "traySourceWindow"];
  let modeIndex = 0;
  let recording = "idle";

  function setExpanded(visible) {
    expanded.hidden = !visible;
    expand.textContent = visible ? "收起" : "展开";
    document.documentElement.dataset.previewExpanded = visible ? "true" : "false";
  }

  function setMode(index) {
    modeIndex = index;
    byID("trayMode").textContent = modes[index];
    modeControls.forEach((id, candidate) => {
      byID(id).classList.toggle("is-selected", candidate === index);
    });
  }

  function setRecording(next) {
    recording = next;
    const active = next === "recording";
    const paused = next === "paused";
    state.textContent = active ? "录制中" : paused ? "已暂停" : "待命";
    state.className = "tray-state" + (active ? " is-recording" : paused ? " is-paused" : "");
    byID("trayStart").disabled = active || paused;
    byID("trayPause").disabled = next === "idle";
    byID("trayStop").disabled = next === "idle";
    byID("trayPause").textContent = paused ? "继续" : "暂停";
  }

  function toggleOption(id, label) {
    const button = byID(id);
    const enabled = !button.classList.contains("is-enabled");
    button.classList.toggle("is-enabled", enabled);
    button.textContent = label + "：" + (enabled ? "开" : "关");
  }

  expand.addEventListener("click", () => setExpanded(expanded.hidden));
  byID("trayMode").addEventListener("click", () => setMode((modeIndex + 1) % modes.length));
  byID("trayRegion").addEventListener("click", () => setMode(1));
  modeControls.forEach((id, index) => byID(id).addEventListener("click", () => setMode(index)));
  byID("trayAudio").addEventListener("click", () => {
    const enabled = byID("trayAudio").textContent !== "声音开";
    byID("trayAudio").textContent = enabled ? "声音开" : "声音关";
    toggleOption("trayOptionSystemAudio", "系统声音");
    toggleOption("trayOptionMicrophone", "麦克风");
  });
  byID("trayCamera").addEventListener("click", () => {
    const enabled = byID("trayCamera").textContent !== "摄像头开";
    byID("trayCamera").textContent = enabled ? "摄像头开" : "摄像头关";
    toggleOption("trayOptionCamera", "摄像头");
  });
  [
    ["trayOptionSystemAudio", "系统声音"], ["trayOptionMicrophone", "麦克风"],
    ["trayOptionCamera", "摄像头"], ["trayOptionMousePointer", "显示鼠标"]
  ].forEach(([id, label]) => byID(id).addEventListener("click", () => toggleOption(id, label)));
  byID("trayStart").addEventListener("click", () => setRecording("recording"));
  byID("trayPause").addEventListener("click", () => setRecording(recording === "paused" ? "recording" : "paused"));
  byID("trayStop").addEventListener("click", () => setRecording("idle"));
  byID("trayCapture").addEventListener("click", () => { state.textContent = "已截图"; });
  byID("trayWorkspace").addEventListener("click", () => { state.textContent = "工作台已请求"; });
  const params = new URLSearchParams(location.search);
  setExpanded(params.get("expanded") === "1");
  setMode(params.get("mode") === "region" ? 1 : params.get("mode") === "window" ? 2 : 0);
  setRecording("idle");
})();
</script>`;
}

function previewDocument() {
  const html = source("tray.html");
  const css = source("tray.css");
  return html
    .replace("</head>", `<style>${css}</style></head>`)
    .replace("</body>", `${previewBridge()}</body>`);
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
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src 'self'",
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
