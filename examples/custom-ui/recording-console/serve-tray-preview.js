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
  const shell = byID("trayShell");
  const state = byID("trayState");
  const modes = ["全屏", "区域", "窗口"];
  const quickTools = [
    ["traySourceFull", "截图"], ["traySourceRegion", "聚光灯"],
    ["traySourceWindow", "涂鸦"], ["trayOptionSystemAudio", "排除窗口"],
    ["trayOptionMicrophone", "添加水印"], ["trayOptionCamera", "提词器"],
    ["trayOptionMousePointer", "按键显示"], ["trayQuickSchedule", "定时录制"]
  ];
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
    byID("trayRunningTarget").classList.toggle("is-active", index === 1);
    byID("trayRunningWindow").classList.toggle("is-active", index === 2);
  }

  function setRecording(next) {
    recording = next;
    const active = next === "recording";
    const paused = next === "paused";
    state.textContent = active ? "录制中" : paused ? "已暂停" : "待命";
    state.className = "tray-state" + (active ? " is-recording" : paused ? " is-paused" : "");
    shell.className = "tray-shell " + (active || paused ? "is-running" : "is-idle") + (paused ? " is-paused" : "");
    if (active || paused) setExpanded(false);
    byID("trayStart").disabled = active || paused;
    byID("trayPause").disabled = next === "idle";
    byID("trayStop").disabled = next === "idle";
    byID("trayPause").textContent = paused ? "继续" : "暂停";
  }

  function activateQuickTool(id, label) {
    quickTools.forEach(([candidate]) => byID(candidate).classList.toggle("is-active", candidate === id));
    state.textContent = id === "traySourceFull" ? "已截图" : label + "已就绪";
  }

  expand.addEventListener("click", () => setExpanded(expanded.hidden));
  byID("trayMode").addEventListener("click", () => setMode((modeIndex + 1) % modes.length));
  byID("trayRegion").addEventListener("click", () => setMode(1));
  quickTools.forEach(([id, label]) => byID(id).addEventListener("click", () => activateQuickTool(id, label)));
  byID("trayAudio").addEventListener("click", () => {
    const enabled = byID("trayAudio").textContent !== "声音开";
    byID("trayAudio").textContent = enabled ? "声音开" : "声音关";
  });
  byID("trayCamera").addEventListener("click", () => {
    const enabled = byID("trayCamera").textContent !== "摄像头开";
    byID("trayCamera").textContent = enabled ? "摄像头开" : "摄像头关";
    byID("trayRunningCamera").classList.toggle("is-active", enabled);
  });
  byID("trayRunningTarget").addEventListener("click", () => setMode(1));
  byID("trayRunningCamera").addEventListener("click", () => {
    const enabled = !byID("trayRunningCamera").classList.contains("is-active");
    byID("trayRunningCamera").classList.toggle("is-active", enabled);
    byID("trayCamera").textContent = enabled ? "摄像头开" : "摄像头关";
  });
  byID("trayRunningDraw").addEventListener("click", () => activateQuickTool("traySourceWindow", "涂鸦"));
  byID("trayRunningWindow").addEventListener("click", () => setMode(2));
  byID("trayStart").addEventListener("click", () => setRecording("recording"));
  byID("trayPause").addEventListener("click", () => setRecording(recording === "paused" ? "recording" : "paused"));
  byID("trayStop").addEventListener("click", () => setRecording("idle"));
  byID("trayCapture").addEventListener("click", () => { state.textContent = "已截图"; });
  byID("trayWorkspace").addEventListener("click", () => {
    byID("trayWorkspace").classList.toggle("is-active");
    state.textContent = "工作台已请求";
  });
  const params = new URLSearchParams(location.search);
  setExpanded(params.get("expanded") === "1");
  setMode(params.get("mode") === "region" ? 1 : params.get("mode") === "window" ? 2 : 0);
  setRecording(params.get("state") === "recording" ? "recording" : params.get("state") === "paused" ? "paused" : "idle");
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
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src 'self' data:",
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
