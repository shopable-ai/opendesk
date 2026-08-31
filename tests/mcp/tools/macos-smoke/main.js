#!/usr/bin/env node

"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");

const MCP_PROTOCOL_VERSION = "2024-11-05";
const DEFAULT_RUNS = 5;
const DEFAULT_REQUEST_TIMEOUT_MS = 15_000;
const SHUTDOWN_TIMEOUT_MS = 5_000;

const READ_ONLY_TOOL_ORDER = Object.freeze([
  "tm_status",
  "tm_permissions",
  "tm_list_displays",
  "tm_list_windows",
  "tm_get_active_window",
  "tm_screenshot",
  "tm_inspect_desktop",
]);

function usage() {
  return [
    "Usage:",
    "  node tests/mcp/tools/macos-smoke/main.js \\",
    "    --binary /absolute/path/to/opendesk-mcp \\",
    "    --evidence /absolute/path/to/evidence \\",
    "    [--runs 5] [--timeout-ms 15000]",
    "",
    "The harness only calls the fixed read-only tool chain:",
    `  ${READ_ONLY_TOOL_ORDER.join(" -> ")}`,
  ].join("\n");
}

function parseCLI(argv) {
  const values = {};
  for (let index = 0; index < argv.length; index += 1) {
    const raw = argv[index];
    if (raw === "--help" || raw === "-h") {
      values.help = true;
      continue;
    }
    if (!raw.startsWith("--")) {
      throw new Error(`unexpected positional argument: ${raw}`);
    }
    const equals = raw.indexOf("=");
    if (equals >= 0) {
      values[raw.slice(2, equals)] = raw.slice(equals + 1);
      continue;
    }
    const key = raw.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      throw new Error(`missing value for --${key}`);
    }
    values[key] = next;
    index += 1;
  }

  if (values.help) {
    return { help: true };
  }
  if (!values.binary) {
    throw new Error("--binary is required");
  }
  if (!values.evidence) {
    throw new Error("--evidence is required");
  }

  const runs = parsePositiveInteger(values.runs || String(DEFAULT_RUNS), "--runs", 100);
  const timeoutMs = parsePositiveInteger(
    values["timeout-ms"] || String(DEFAULT_REQUEST_TIMEOUT_MS),
    "--timeout-ms",
    120_000,
  );
  const binaryInput = path.resolve(values.binary);
  const binary = fs.realpathSync(binaryInput);
  const binaryStat = fs.statSync(binary);
  if (!binaryStat.isFile()) {
    throw new Error(`--binary is not a file: ${binary}`);
  }
  fs.accessSync(binary, fs.constants.X_OK);

  return {
    help: false,
    binary,
    evidence: path.resolve(values.evidence),
    runs,
    timeoutMs,
  };
}

function parsePositiveInteger(raw, name, maximum) {
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value <= 0 || value > maximum) {
    throw new Error(`${name} must be an integer in the range 1..${maximum}`);
  }
  return value;
}

function sessionID() {
  const stamp = new Date().toISOString().replace(/[-:.]/g, "").replace("Z", "Z");
  return `${stamp}-${process.pid}`;
}

function serializeError(error) {
  if (!error) {
    return { name: "Error", message: "unknown error" };
  }
  const result = {
    name: String(error.name || "Error"),
    message: String(error.message || error),
  };
  if (error.code !== undefined) {
    result.code = error.code;
  }
  if (error.data !== undefined) {
    result.data = error.data;
  }
  if (error.stack) {
    result.stack = String(error.stack);
  }
  return result;
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

class EvidenceRecorder {
  constructor(root, id) {
    this.root = root;
    this.id = id;
    this.screenshotsDir = path.join(root, "screenshots");
    this.ndjsonPath = path.join(root, `macos-smoke-${id}.ndjson`);
    fs.mkdirSync(this.screenshotsDir, { recursive: true });
  }

  append(event) {
    const row = {
      timestamp: new Date().toISOString(),
      sessionId: this.id,
      ...event,
    };
    fs.appendFileSync(this.ndjsonPath, `${JSON.stringify(row)}\n`, "utf8");
  }

  writeJSON(name, value) {
    const target = path.join(this.root, name);
    fs.writeFileSync(target, `${JSON.stringify(value, null, 2)}\n`, "utf8");
    return target;
  }
}

class MCPRequestError extends Error {
  constructor(method, responseError) {
    super(`${method} failed (${responseError.code}): ${responseError.message}`);
    this.name = "MCPRequestError";
    this.code = responseError.code;
    this.data = responseError.data;
  }
}

class MCPStdioClient {
  constructor(options) {
    this.binary = options.binary;
    this.cwd = options.cwd;
    this.timeoutMs = options.timeoutMs;
    this.runName = options.runName;
    this.recorder = options.recorder;
    this.stdoutPath = options.stdoutPath;
    this.stderrPath = options.stderrPath;
    this.nextID = 1;
    this.pending = new Map();
    this.stdoutBuffer = "";
    this.protocolViolations = [];
    this.child = null;
    this.exitInfo = null;
    this.exitPromise = null;
  }

  async start() {
    const detached = process.platform !== "win32";
    this.child = spawn(this.binary, [], {
      cwd: this.cwd,
      env: process.env,
      stdio: ["pipe", "pipe", "pipe"],
      detached,
    });
    this.exitPromise = new Promise((resolve) => {
      this.child.once("close", (code, signal) => {
        this._flushTrailingStdout();
        this.exitInfo = { code, signal };
        this.recorder.append({
          run: this.runName,
          event: "process_exit",
          code,
          signal,
        });
        const error = new Error(`MCP process exited while requests were pending: code=${code} signal=${signal}`);
        this._rejectPending(error);
        resolve(this.exitInfo);
      });
    });

    this.child.stdout.on("data", (chunk) => {
      fs.appendFileSync(this.stdoutPath, chunk);
      this._consumeStdout(chunk.toString("utf8"));
    });
    this.child.stderr.on("data", (chunk) => {
      fs.appendFileSync(this.stderrPath, chunk);
      this.recorder.append({
        run: this.runName,
        event: "stderr_chunk",
        text: chunk.toString("utf8"),
      });
    });

    await new Promise((resolve, reject) => {
      const onSpawn = () => {
        this.child.off("error", onError);
        resolve();
      };
      const onError = (error) => {
        this.child.off("spawn", onSpawn);
        reject(error);
      };
      this.child.once("spawn", onSpawn);
      this.child.once("error", onError);
    });

    this.recorder.append({
      run: this.runName,
      event: "process_spawn",
      pid: this.child.pid,
      binary: this.binary,
      cwd: this.cwd,
    });
  }

  _consumeStdout(text) {
    this.stdoutBuffer += text;
    for (;;) {
      const newline = this.stdoutBuffer.indexOf("\n");
      if (newline < 0) {
        break;
      }
      const line = this.stdoutBuffer.slice(0, newline).replace(/\r$/, "");
      this.stdoutBuffer = this.stdoutBuffer.slice(newline + 1);
      if (line.trim()) {
        this._handleStdoutLine(line);
      }
    }
  }

  _flushTrailingStdout() {
    const line = this.stdoutBuffer.replace(/\r$/, "");
    this.stdoutBuffer = "";
    if (line.trim()) {
      this._handleStdoutLine(line);
    }
  }

  _handleStdoutLine(line) {
    let message;
    try {
      message = JSON.parse(line);
    } catch (error) {
      const violation = {
        reason: "non_json_stdout",
        line,
        parseError: String(error.message || error),
      };
      this.protocolViolations.push(violation);
      this.recorder.append({ run: this.runName, event: "stdout_pollution", ...violation });
      this._rejectPending(new Error(`non-JSON content on MCP stdout: ${line}`));
      return;
    }

    this.recorder.append({ run: this.runName, event: "response", message });
    if (!isObject(message) || message.jsonrpc !== "2.0") {
      const violation = { reason: "invalid_jsonrpc_response", message };
      this.protocolViolations.push(violation);
      this._rejectPending(new Error("invalid JSON-RPC response on MCP stdout"));
      return;
    }

    const hasID = Object.prototype.hasOwnProperty.call(message, "id") && message.id !== null;
    if (!hasID) {
      if (typeof message.method === "string" && message.method) {
        return;
      }
      const violation = { reason: "unexpected_idless_response", message };
      this.protocolViolations.push(violation);
      this.recorder.append({ run: this.runName, event: "protocol_violation", ...violation });
      return;
    }

    const key = String(message.id);
    const pending = this.pending.get(key);
    if (!pending) {
      const violation = { reason: "unexpected_response_id", message };
      this.protocolViolations.push(violation);
      this.recorder.append({ run: this.runName, event: "protocol_violation", ...violation });
      return;
    }
    this.pending.delete(key);
    clearTimeout(pending.timer);
    if (message.error) {
      pending.reject(new MCPRequestError(pending.method, message.error));
      return;
    }
    pending.resolve(message.result);
  }

  _rejectPending(error) {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.pending.clear();
  }

  _write(message) {
    if (!this.child || this.exitInfo) {
      return Promise.reject(new Error("MCP process is not running"));
    }
    const line = `${JSON.stringify(message)}\n`;
    return new Promise((resolve, reject) => {
      this.child.stdin.write(line, "utf8", (error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  }

  async notify(method, params = {}) {
    const message = { jsonrpc: "2.0", method, params };
    this.recorder.append({ run: this.runName, event: "notification", message });
    await this._write(message);
  }

  request(method, params = {}) {
    if (!this.child || this.exitInfo) {
      return Promise.reject(new Error("MCP process is not running"));
    }
    const id = this.nextID;
    this.nextID += 1;
    const message = { jsonrpc: "2.0", id, method, params };
    this.recorder.append({ run: this.runName, event: "request", message });

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(String(id));
        const error = new Error(`${method} timed out after ${this.timeoutMs}ms`);
        error.code = "request_timeout";
        this.recorder.append({
          run: this.runName,
          event: "request_timeout",
          id,
          method,
          timeoutMs: this.timeoutMs,
        });
        reject(error);
      }, this.timeoutMs);
      this.pending.set(String(id), { method, resolve, reject, timer });
      this._write(message).catch((error) => {
        const pending = this.pending.get(String(id));
        if (pending) {
          clearTimeout(pending.timer);
          this.pending.delete(String(id));
          pending.reject(error);
        }
      });
    });
  }

  async close() {
    if (!this.child) {
      return { code: null, signal: null };
    }
    if (!this.exitInfo) {
      this.child.stdin.end();
    }
    let exit = await Promise.race([
      this.exitPromise,
      delay(SHUTDOWN_TIMEOUT_MS).then(() => null),
    ]);
    if (!exit) {
      this.recorder.append({ run: this.runName, event: "shutdown_timeout" });
      await this.terminate("SIGTERM");
      exit = this.exitInfo;
    }
    return exit;
  }

  async terminate(signal = "SIGTERM") {
    if (!this.child || this.exitInfo) {
      return this.exitInfo;
    }
    this.recorder.append({ run: this.runName, event: "process_terminate", signal });
    try {
      if (process.platform !== "win32" && this.child.pid) {
        process.kill(-this.child.pid, signal);
      } else {
        this.child.kill(signal);
      }
    } catch (_) {
      try {
        this.child.kill(signal);
      } catch (_) {}
    }
    let exit = await Promise.race([this.exitPromise, delay(1_000).then(() => null)]);
    if (!exit && signal !== "SIGKILL") {
      exit = await this.terminate("SIGKILL");
    }
    return exit;
  }
}

async function callTool(client, recorder, runName, name, args) {
  assert(READ_ONLY_TOOL_ORDER.includes(name), `refusing non-read-only MCP tool: ${name}`);
  const result = await client.request("tools/call", { name, arguments: args });
  assert(isObject(result), `${name} result must be an object`);
  assert(result.isError !== true, `${name} returned isError=true`);
  assert(Array.isArray(result.content), `${name} result.content must be an array`);
  const textBlock = result.content.find((block) => isObject(block) && block.type === "text");
  assert(textBlock && typeof textBlock.text === "string", `${name} must return text content`);
  let payload;
  try {
    payload = JSON.parse(textBlock.text);
  } catch (error) {
    throw new Error(`${name} returned non-JSON tool text: ${error.message}`);
  }
  assert(isObject(payload), `${name} tool payload must be an object`);
  recorder.append({ run: runName, event: "tool_result", tool: name, payload });
  return payload;
}

function validateStatus(payload) {
  assert(payload.status === "ok", `tm_status status is not ok: ${JSON.stringify(payload)}`);
}

function validatePermissions(payload) {
  assert(typeof payload.screenCapture === "boolean", "tm_permissions.screenCapture must be boolean");
  assert(typeof payload.accessibility === "boolean", "tm_permissions.accessibility must be boolean");
  assert(typeof payload.ok === "boolean", "tm_permissions.ok must be boolean");
}

function validateDisplays(payload) {
  assert(Array.isArray(payload.displays), "tm_list_displays.displays must be an array");
  assert(Number(payload.count) === payload.displays.length, "tm_list_displays count mismatch");
  assert(payload.displays.length > 0, "tm_list_displays returned no displays");
  for (const display of payload.displays) {
    assert(isObject(display), "display row must be an object");
    assert(Number(display.width) > 0 && Number(display.height) > 0, "display dimensions must be positive");
  }
}

function validateWindows(payload) {
  assert(Array.isArray(payload.windows), "tm_list_windows.windows must be an array");
  assert(Number(payload.count) === payload.windows.length, "tm_list_windows count mismatch");
  assert(payload.windows.length > 0, "tm_list_windows returned no windows");
}

function validateActiveWindow(payload) {
  assert(typeof payload.title === "string" && payload.title.trim(), "active window title must be non-empty");
  assert(Number(payload.width) > 0 && Number(payload.height) > 0, "active window dimensions must be positive");
}

function inspectPNG(filePath, screenshotPayload) {
  assert(typeof screenshotPayload.path === "string" && screenshotPayload.path, "screenshot result.path is required");
  assert(path.resolve(screenshotPayload.path) === filePath, "screenshot result.path does not match requested path");
  const stat = fs.statSync(filePath);
  assert(stat.isFile(), "screenshot path is not a regular file");
  assert(stat.size > 0, "screenshot file is empty");
  const bytes = fs.readFileSync(filePath);
  const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  assert(bytes.length >= 33, "screenshot is too small to be a PNG");
  assert(bytes.subarray(0, 8).equals(pngSignature), "screenshot PNG signature is invalid");
  assert(bytes.subarray(12, 16).toString("ascii") === "IHDR", "screenshot PNG is missing IHDR");
  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);
  assert(width > 0 && height > 0, "screenshot PNG dimensions must be positive");
  assert(Number(screenshotPayload.width) === width, "screenshot response/file width mismatch");
  assert(Number(screenshotPayload.height) === height, "screenshot response/file height mismatch");
  assert(Number(screenshotPayload.sizeBytes) === stat.size, "screenshot response/file size mismatch");
  return {
    path: filePath,
    sizeBytes: stat.size,
    width,
    height,
    mimeType: screenshotPayload.mimeType,
    source: screenshotPayload.source,
    backend: screenshotPayload.backend,
  };
}

function validateInspect(payload) {
  assert(payload.ok === true, "tm_inspect_desktop.ok must be true");
  assert(isObject(payload.status), "tm_inspect_desktop.status must be an object");
  assert(isObject(payload.permissions), "tm_inspect_desktop.permissions must be an object");
  assert(isObject(payload.activeWindow), "tm_inspect_desktop.activeWindow must be an object");
  assert(Array.isArray(payload.displays), "tm_inspect_desktop.displays must be an array");
  assert(Number(payload.displayCount) === payload.displays.length, "tm_inspect_desktop displayCount mismatch");
}

async function runOnce(config, recorder, id, index) {
  const runName = `run-${String(index).padStart(2, "0")}`;
  const prefix = `${runName}-${id}`;
  const screenshotPath = path.join(recorder.screenshotsDir, `${prefix}.png`);
  const stdoutPath = path.join(config.evidence, `${prefix}.stdout.log`);
  const stderrPath = path.join(config.evidence, `${prefix}.stderr.log`);
  const runResult = {
    run: runName,
    ok: false,
    permissionsReady: false,
    toolOrder: [],
    screenshot: null,
    protocolViolations: [],
    exit: null,
    error: null,
  };
  const client = new MCPStdioClient({
    binary: config.binary,
    cwd: process.cwd(),
    timeoutMs: config.timeoutMs,
    runName,
    recorder,
    stdoutPath,
    stderrPath,
  });

  recorder.append({ run: runName, event: "run_start", screenshotPath });
  try {
    await client.start();
    const initialized = await client.request("initialize", {
      protocolVersion: MCP_PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: { name: "opendesk-macos-read-only-smoke", version: "1.0.0" },
    });
    assert(isObject(initialized), "initialize result must be an object");
    assert(initialized.protocolVersion === MCP_PROTOCOL_VERSION, "initialize protocolVersion mismatch");
    await client.notify("notifications/initialized", {});

    const status = await callTool(client, recorder, runName, "tm_status", {});
    runResult.toolOrder.push("tm_status");
    validateStatus(status);

    const permissions = await callTool(client, recorder, runName, "tm_permissions", {});
    runResult.toolOrder.push("tm_permissions");
    validatePermissions(permissions);
    runResult.permissionsReady = permissions.ok === true;

    const displays = await callTool(client, recorder, runName, "tm_list_displays", {});
    runResult.toolOrder.push("tm_list_displays");
    validateDisplays(displays);

    const windows = await callTool(client, recorder, runName, "tm_list_windows", {});
    runResult.toolOrder.push("tm_list_windows");
    validateWindows(windows);

    const activeWindow = await callTool(client, recorder, runName, "tm_get_active_window", {});
    runResult.toolOrder.push("tm_get_active_window");
    validateActiveWindow(activeWindow);

    const screenshot = await callTool(client, recorder, runName, "tm_screenshot", {
      target: "screen",
      returnType: "object",
      path: screenshotPath,
    });
    runResult.toolOrder.push("tm_screenshot");
    runResult.screenshot = inspectPNG(screenshotPath, screenshot);

    const inspect = await callTool(client, recorder, runName, "tm_inspect_desktop", {
      captureScreenshot: false,
    });
    runResult.toolOrder.push("tm_inspect_desktop");
    validateInspect(inspect);

    assert(
      JSON.stringify(runResult.toolOrder) === JSON.stringify(READ_ONLY_TOOL_ORDER),
      `read-only tool order drifted: ${runResult.toolOrder.join(" -> ")}`,
    );
    runResult.protocolViolations = client.protocolViolations.slice();
    assert(runResult.protocolViolations.length === 0, "MCP stdout/protocol violations were observed");
    runResult.ok = true;
  } catch (error) {
    runResult.error = serializeError(error);
    runResult.protocolViolations = client.protocolViolations.slice();
    recorder.append({ run: runName, event: "run_error", error: runResult.error });
  } finally {
    try {
      runResult.exit = runResult.error ? await client.terminate() : await client.close();
    } catch (error) {
      runResult.exit = { error: serializeError(error) };
      if (!runResult.error) {
        runResult.error = serializeError(error);
        runResult.ok = false;
      }
    }
    if (runResult.exit && runResult.exit.code !== 0) {
      runResult.ok = false;
      if (!runResult.error) {
        runResult.error = {
          name: "ProcessExitError",
          message: `MCP process exit was not clean: ${JSON.stringify(runResult.exit)}`,
        };
      }
    }
  }

  recorder.append({ run: runName, event: "run_complete", result: runResult });
  recorder.writeJSON(`${prefix}.json`, runResult);
  return runResult;
}

async function main() {
  const config = parseCLI(process.argv.slice(2));
  if (config.help) {
    process.stdout.write(`${usage()}\n`);
    return;
  }
  fs.mkdirSync(config.evidence, { recursive: true });
  const id = sessionID();
  const recorder = new EvidenceRecorder(config.evidence, id);
  const startedAt = new Date().toISOString();
  recorder.append({
    event: "session_start",
    binary: config.binary,
    evidence: config.evidence,
    runs: config.runs,
    timeoutMs: config.timeoutMs,
    cwd: process.cwd(),
    platform: process.platform,
    arch: process.arch,
    node: process.version,
    toolOrder: READ_ONLY_TOOL_ORDER,
  });

  const results = [];
  for (let index = 1; index <= config.runs; index += 1) {
    results.push(await runOnce(config, recorder, id, index));
  }

  const passed = results.filter((result) => result.ok).length;
  const permissionsReady = results.filter((result) => result.permissionsReady).length;
  const summary = {
    ok: passed === config.runs,
    startedAt,
    finishedAt: new Date().toISOString(),
    binary: config.binary,
    evidence: config.evidence,
    ndjson: recorder.ndjsonPath,
    requestedRuns: config.runs,
    passedRuns: passed,
    permissionsReadyRuns: permissionsReady,
    failedRuns: config.runs - passed,
    toolOrder: READ_ONLY_TOOL_ORDER,
    results,
  };
  const summaryPath = recorder.writeJSON(`macos-smoke-${id}-summary.json`, summary);
  recorder.append({ event: "session_complete", summaryPath, summary });
  process.stdout.write(`${JSON.stringify({ ...summary, results: undefined, summaryPath }, null, 2)}\n`);
  if (!summary.ok) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  process.stderr.write(`${serializeError(error).stack || error.message || String(error)}\n`);
  process.stderr.write(`${usage()}\n`);
  process.exitCode = 1;
});
