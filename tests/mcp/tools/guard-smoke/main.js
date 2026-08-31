#!/usr/bin/env node

"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");

const MCP_PROTOCOL_VERSION = "2024-11-05";
const DEFAULT_TIMEOUT_MS = 15_000;
const SHUTDOWN_TIMEOUT_MS = 5_000;
const KNOWN_SCHEMA_TYPES = new Set([
  "array",
  "boolean",
  "integer",
  "null",
  "number",
  "object",
  "string",
]);

function usage() {
  return [
    "Usage:",
    "  node tests/mcp/tools/guard-smoke/main.js \\",
    "    --binary /absolute/path/to/opendesk-mcp \\",
    "    --evidence /absolute/path/to/.runtime/tests/mcp/<run-id> \\",
    "    [--timeout-ms 15000]",
    "",
    "This harness starts the real MCP binary over stdio and performs only plan-only",
    "calls or intentionally failing guard cases. It sends no unguarded action call.",
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
  const timeoutMs = Number(values["timeout-ms"] || DEFAULT_TIMEOUT_MS);
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0 || timeoutMs > 120_000) {
    throw new Error("--timeout-ms must be an integer in the range 1..120000");
  }

  const binary = fs.realpathSync(path.resolve(values.binary));
  const stat = fs.statSync(binary);
  if (!stat.isFile()) {
    throw new Error(`--binary is not a file: ${binary}`);
  }
  fs.accessSync(binary, fs.constants.X_OK);
  return {
    help: false,
    binary,
    evidence: path.resolve(values.evidence),
    timeoutMs,
  };
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function serializeError(error) {
  return {
    name: String(error?.name || "Error"),
    message: String(error?.message || error || "unknown error"),
    ...(error?.code !== undefined ? { code: error.code } : {}),
    ...(error?.data !== undefined ? { data: error.data } : {}),
    ...(error?.stack ? { stack: String(error.stack) } : {}),
  };
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function sessionID() {
  return `${new Date().toISOString().replace(/[-:.]/g, "")}-${process.pid}`;
}

class Recorder {
  constructor(root, id) {
    this.root = root;
    this.id = id;
    this.ndjsonPath = path.join(root, `guard-smoke-${id}.ndjson`);
    this.stdoutPath = path.join(root, `guard-smoke-${id}.stdout.log`);
    this.stderrPath = path.join(root, `guard-smoke-${id}.stderr.log`);
  }

  event(event, fields = {}) {
    fs.appendFileSync(
      this.ndjsonPath,
      `${JSON.stringify({ timestamp: new Date().toISOString(), sessionId: this.id, event, ...fields })}\n`,
      "utf8",
    );
  }

  json(name, value) {
    const destination = path.join(this.root, name);
    fs.writeFileSync(destination, `${JSON.stringify(value, null, 2)}\n`, "utf8");
    return destination;
  }
}

class JSONRPCError extends Error {
  constructor(method, responseError) {
    super(`${method} failed (${responseError.code}): ${responseError.message}`);
    this.name = "JSONRPCError";
    this.code = responseError.code;
    this.data = responseError.data;
  }
}

class MCPClient {
  constructor(config, recorder) {
    this.config = config;
    this.recorder = recorder;
    this.child = null;
    this.exit = null;
    this.exitPromise = null;
    this.nextID = 1;
    this.pending = new Map();
    this.stdoutBuffer = "";
    this.protocolViolations = [];
  }

  async start() {
    this.child = spawn(this.config.binary, [], {
      cwd: process.cwd(),
      env: process.env,
      stdio: ["pipe", "pipe", "pipe"],
      detached: process.platform !== "win32",
    });
    this.exitPromise = new Promise((resolve) => {
      this.child.once("close", (code, signal) => {
        this.flushStdout();
        this.exit = { code, signal };
        this.recorder.event("process_exit", this.exit);
        this.rejectPending(new Error(`MCP process exited: code=${code} signal=${signal}`));
        resolve(this.exit);
      });
    });
    this.child.stdout.on("data", (chunk) => {
      fs.appendFileSync(this.recorder.stdoutPath, chunk);
      this.consumeStdout(chunk.toString("utf8"));
    });
    this.child.stderr.on("data", (chunk) => {
      fs.appendFileSync(this.recorder.stderrPath, chunk);
      this.recorder.event("stderr", { text: chunk.toString("utf8") });
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
    this.recorder.event("process_spawn", {
      pid: this.child.pid,
      binary: this.config.binary,
      cwd: process.cwd(),
    });
  }

  consumeStdout(text) {
    this.stdoutBuffer += text;
    for (;;) {
      const newline = this.stdoutBuffer.indexOf("\n");
      if (newline < 0) {
        return;
      }
      const line = this.stdoutBuffer.slice(0, newline).replace(/\r$/, "");
      this.stdoutBuffer = this.stdoutBuffer.slice(newline + 1);
      if (line.trim()) {
        this.handleLine(line);
      }
    }
  }

  flushStdout() {
    const line = this.stdoutBuffer.replace(/\r$/, "");
    this.stdoutBuffer = "";
    if (line.trim()) {
      this.handleLine(line);
    }
  }

  handleLine(line) {
    let message;
    try {
      message = JSON.parse(line);
    } catch (error) {
      this.protocolViolation("non_json_stdout", { line, parseError: String(error.message || error) });
      return;
    }
    this.recorder.event("response", { message });
    if (!isObject(message) || message.jsonrpc !== "2.0") {
      this.protocolViolation("invalid_jsonrpc_response", { message });
      return;
    }
    if (!Object.prototype.hasOwnProperty.call(message, "id") || message.id === null) {
      this.protocolViolation("unexpected_idless_response", { message });
      return;
    }
    const key = String(message.id);
    const pending = this.pending.get(key);
    if (!pending) {
      this.protocolViolation("unexpected_response_id", { message });
      return;
    }
    this.pending.delete(key);
    clearTimeout(pending.timer);
    if (message.error) {
      pending.reject(new JSONRPCError(pending.method, message.error));
    } else {
      pending.resolve(message.result);
    }
  }

  protocolViolation(reason, fields) {
    const violation = { reason, ...fields };
    this.protocolViolations.push(violation);
    this.recorder.event("protocol_violation", violation);
    this.rejectPending(new Error(`MCP protocol violation: ${reason}`));
  }

  rejectPending(error) {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.pending.clear();
  }

  write(message) {
    if (!this.child || this.exit) {
      return Promise.reject(new Error("MCP process is not running"));
    }
    return new Promise((resolve, reject) => {
      this.child.stdin.write(`${JSON.stringify(message)}\n`, "utf8", (error) => {
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      });
    });
  }

  request(method, params = {}) {
    const id = this.nextID;
    this.nextID += 1;
    const message = { jsonrpc: "2.0", id, method, params };
    this.recorder.event("request", { message });
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(String(id));
        const error = new Error(`${method} timed out after ${this.config.timeoutMs}ms`);
        error.code = "request_timeout";
        reject(error);
      }, this.config.timeoutMs);
      this.pending.set(String(id), { method, resolve, reject, timer });
      this.write(message).catch((error) => {
        const pending = this.pending.get(String(id));
        if (pending) {
          clearTimeout(pending.timer);
          this.pending.delete(String(id));
          pending.reject(error);
        }
      });
    });
  }

  notify(method, params = {}) {
    const message = { jsonrpc: "2.0", method, params };
    this.recorder.event("notification", { message });
    return this.write(message);
  }

  async close() {
    if (!this.child) {
      return null;
    }
    if (!this.exit) {
      this.child.stdin.end();
    }
    let result = await Promise.race([
      this.exitPromise,
      delay(SHUTDOWN_TIMEOUT_MS).then(() => null),
    ]);
    if (!result) {
      await this.terminate("SIGTERM");
      result = this.exit;
    }
    return result;
  }

  async terminate(signal) {
    if (!this.child || this.exit) {
      return this.exit;
    }
    this.recorder.event("process_terminate", { signal });
    try {
      if (process.platform !== "win32" && this.child.pid) {
        process.kill(-this.child.pid, signal);
      } else {
        this.child.kill(signal);
      }
    } catch (_) {
      this.child.kill(signal);
    }
    let result = await Promise.race([this.exitPromise, delay(1_000).then(() => null)]);
    if (!result && signal !== "SIGKILL") {
      result = await this.terminate("SIGKILL");
    }
    return result;
  }
}

function schemaValueMatchesType(value, type) {
  switch (type) {
    case "array":
      return Array.isArray(value);
    case "boolean":
      return typeof value === "boolean";
    case "integer":
      return Number.isInteger(value);
    case "null":
      return value === null;
    case "number":
      return typeof value === "number" && Number.isFinite(value);
    case "object":
      return isObject(value);
    case "string":
      return typeof value === "string";
    default:
      return false;
  }
}

function validateSchema(schema, location, checks) {
  assert(isObject(schema), `${location} must be a JSON Schema object`);
  if (schema.type !== undefined) {
    assert(typeof schema.type === "string", `${location}.type must be a string`);
    assert(KNOWN_SCHEMA_TYPES.has(schema.type), `${location}.type is unsupported: ${schema.type}`);
  }
  if (schema.description !== undefined) {
    assert(typeof schema.description === "string", `${location}.description must be a string`);
  }
  if (schema.enum !== undefined) {
    assert(Array.isArray(schema.enum) && schema.enum.length > 0, `${location}.enum must be non-empty`);
    assert(new Set(schema.enum.map((value) => JSON.stringify(value))).size === schema.enum.length, `${location}.enum has duplicates`);
    if (schema.type) {
      for (const value of schema.enum) {
        assert(schemaValueMatchesType(value, schema.type), `${location}.enum value does not match ${schema.type}`);
      }
    }
  }
  if (schema.properties !== undefined) {
    assert(isObject(schema.properties), `${location}.properties must be an object`);
    for (const [name, child] of Object.entries(schema.properties)) {
      validateSchema(child, `${location}.properties.${name}`, checks);
    }
  }
  if (schema.required !== undefined) {
    assert(Array.isArray(schema.required), `${location}.required must be an array`);
    assert(new Set(schema.required).size === schema.required.length, `${location}.required has duplicates`);
    for (const name of schema.required) {
      assert(typeof name === "string" && name, `${location}.required contains an invalid name`);
      assert(schema.properties && Object.prototype.hasOwnProperty.call(schema.properties, name), `${location}.required references missing property ${name}`);
    }
  }
  if (schema.additionalProperties !== undefined) {
    assert(
      typeof schema.additionalProperties === "boolean" || isObject(schema.additionalProperties),
      `${location}.additionalProperties must be boolean or a schema`,
    );
    if (isObject(schema.additionalProperties)) {
      validateSchema(schema.additionalProperties, `${location}.additionalProperties`, checks);
    }
  }
  if (schema.items !== undefined) {
    validateSchema(schema.items, `${location}.items`, checks);
  }
  checks.push(location);
}

function validateRegistry(result) {
  assert(isObject(result), "tools/list result must be an object");
  assert(Array.isArray(result.tools), "tools/list result.tools must be an array");
  assert(result.tools.length > 0, "tools/list returned no tools");
  const names = [];
  const checks = [];
  for (const tool of result.tools) {
    assert(isObject(tool), "each tools/list entry must be an object");
    assert(typeof tool.name === "string" && tool.name, "tool name must be non-empty");
    assert(typeof tool.description === "string" && tool.description, `${tool.name} description must be non-empty`);
    names.push(tool.name);
    validateSchema(tool.inputSchema, `tools.${tool.name}.inputSchema`, checks);
    assert(tool.inputSchema.type === "object", `${tool.name} inputSchema.type must be object`);
  }
  assert(new Set(names).size === names.length, "tools/list contains duplicate tool names");

  const act = result.tools.find((tool) => tool.name === "tm_act_on_target");
  assert(act, "tools/list is missing tm_act_on_target");
  const schema = act.inputSchema;
  const required = new Set(schema.required || []);
  assert(required.has("target") && required.has("action"), "tm_act_on_target must require target and action");
  const properties = schema.properties;
  assert(properties.target?.type === "object", "tm_act_on_target.target must be object");
  const actionEnum = properties.action?.enum;
  assert(Array.isArray(actionEnum), "tm_act_on_target.action enum is missing");
  assert(
    actionEnum.length === 3 && ["click", "type", "focus"].every((value) => actionEnum.includes(value)),
    "tm_act_on_target.action enum mismatch",
  );
  for (const name of ["previewOnly", "dryRun", "allowAmbiguous"]) {
    assert(properties[name]?.type === "boolean", `tm_act_on_target.${name} must be boolean`);
  }
  for (const name of ["expectedWindowTitle", "expectedTargetText"]) {
    assert(properties[name]?.type === "string", `tm_act_on_target.${name} must be string`);
  }
  const targetProperties = properties.target.properties;
  assert(targetProperties.capturedAt?.type === "string", "target.capturedAt must be string");
  assert(targetProperties.staleAfterMs?.type === "integer", "target.staleAfterMs must be integer");
  assert(targetProperties.ambiguous?.type === "boolean", "target.ambiguous must be boolean");

  return {
    toolCount: result.tools.length,
    names,
    uniqueNames: true,
    schemaNodesChecked: checks.length,
    actOnTarget: {
      required: schema.required,
      actionEnum: properties.action.enum,
      guardFields: [
        "previewOnly",
        "dryRun",
        "allowAmbiguous",
        "expectedWindowTitle",
        "expectedTargetText",
        "target.capturedAt",
        "target.staleAfterMs",
        "target.ambiguous",
      ],
    },
  };
}

function decodeToolPayload(result, toolName) {
  assert(isObject(result), `${toolName} tools/call result must be an object`);
  assert(result.isError !== true, `${toolName} tools/call returned isError=true`);
  assert(Array.isArray(result.content), `${toolName} result.content must be an array`);
  const block = result.content.find((item) => isObject(item) && item.type === "text");
  assert(block && typeof block.text === "string", `${toolName} result must contain text`);
  let payload;
  try {
    payload = JSON.parse(block.text);
  } catch (error) {
    throw new Error(`${toolName} result text is not JSON: ${error.message}`);
  }
  assert(isObject(payload), `${toolName} payload must be an object`);
  return payload;
}

async function callActOnTarget(client, recorder, testCase) {
  const result = await client.request("tools/call", {
    name: "tm_act_on_target",
    arguments: testCase.arguments,
  });
  const payload = decodeToolPayload(result, "tm_act_on_target");
  assert(payload.executed === false, `${testCase.name} must return executed=false: ${JSON.stringify(payload)}`);
  testCase.validate(payload);
  const recorded = {
    name: testCase.name,
    expectedDisposition: testCase.expectedDisposition,
    ok: true,
    executed: payload.executed,
    guard: payload.guard || null,
    previewOnly: payload.previewOnly === true,
    dryRun: payload.dryRun === true,
    payload,
  };
  recorder.event("guard_case", recorded);
  return recorded;
}

async function main() {
  const config = parseCLI(process.argv.slice(2));
  if (config.help) {
    process.stdout.write(`${usage()}\n`);
    return;
  }
  fs.mkdirSync(config.evidence, { recursive: true });
  const id = sessionID();
  const recorder = new Recorder(config.evidence, id);
  const client = new MCPClient(config, recorder);
  const startedAt = new Date().toISOString();
  let exit = null;
  let summary;
  recorder.event("session_start", {
    binary: config.binary,
    evidence: config.evidence,
    timeoutMs: config.timeoutMs,
    platform: process.platform,
    arch: process.arch,
    node: process.version,
  });

  try {
    await client.start();
    const initialize = await client.request("initialize", {
      protocolVersion: MCP_PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: { name: "opendesk-guard-smoke", version: "1.0.0" },
    });
    assert(isObject(initialize), "initialize result must be an object");
    assert(initialize.protocolVersion === MCP_PROTOCOL_VERSION, "initialize protocolVersion mismatch");
    await client.notify("notifications/initialized", {});

    const toolsList = await client.request("tools/list", {});
    const registry = validateRegistry(toolsList);
    const toolsListPath = recorder.json("guard-tools-list.json", toolsList);

    const neverMatch = `__OPENDESK_GUARD_SMOKE_NEVER_MATCH_${id}__`;
    const candidate = () => ({
      source: "guard_smoke",
      title: neverMatch,
      capturedAt: new Date().toISOString(),
      staleAfterMs: 60_000,
      ambiguous: false,
    });
    const cases = [
      {
        name: "preview_only",
        expectedDisposition: "preview",
        arguments: { target: candidate(), action: "focus", previewOnly: true },
        validate(payload) {
          assert(payload.ok === true, "preview_only must return ok=true");
          assert(payload.previewOnly === true, "preview_only must echo previewOnly=true");
          assert(payload.dryRun !== true, "preview_only must not be mislabeled dryRun");
        },
      },
      {
        name: "dry_run",
        expectedDisposition: "preview",
        arguments: { target: candidate(), action: "focus", dryRun: true },
        validate(payload) {
          assert(payload.ok === true, "dry_run must return ok=true");
          assert(payload.dryRun === true, "dry_run must echo dryRun=true");
          assert(payload.previewOnly !== true, "dry_run must not be mislabeled previewOnly");
        },
      },
      {
        name: "stale_candidate",
        expectedDisposition: "blocked",
        arguments: {
          target: {
            source: "guard_smoke",
            title: neverMatch,
            capturedAt: "2000-01-01T00:00:00Z",
            staleAfterMs: 1,
          },
          action: "focus",
        },
        validate(payload) {
          assert(payload.ok === false, "stale_candidate must return ok=false");
          assert(payload.guard === "staleTarget", `stale_candidate guard mismatch: ${payload.guard}`);
        },
      },
      {
        name: "ambiguous_candidate",
        expectedDisposition: "blocked",
        arguments: {
          target: { ...candidate(), ambiguous: true, ambiguityReason: "intentional guard smoke ambiguity" },
          action: "focus",
        },
        validate(payload) {
          assert(payload.ok === false, "ambiguous_candidate must return ok=false");
          assert(payload.guard === "ambiguousTarget", `ambiguous_candidate guard mismatch: ${payload.guard}`);
        },
      },
      {
        name: "impossible_expected_window",
        expectedDisposition: "blocked",
        arguments: {
          target: candidate(),
          action: "focus",
          previewOnly: true,
          expectedWindowTitle: neverMatch,
        },
        validate(payload) {
          assert(payload.ok === false, "impossible_expected_window must return ok=false");
          assert(payload.guard === "expectedWindowTitle", `window guard mismatch: ${payload.guard}`);
          assert(payload.expectedWindowTitle === neverMatch, "window guard did not echo expected title");
          assert(payload.actualWindowTitle !== neverMatch, "impossible title unexpectedly matched active window");
        },
      },
    ];

    const results = [];
    for (const testCase of cases) {
      results.push(await callActOnTarget(client, recorder, testCase));
    }
    assert(results.every((result) => result.executed === false), "one or more guard cases executed an action");
    assert(client.protocolViolations.length === 0, "MCP stdout/protocol violations were observed");

    exit = await client.close();
    assert(exit && exit.code === 0 && exit.signal === null, `MCP process did not exit cleanly: ${JSON.stringify(exit)}`);
    summary = {
      ok: true,
      startedAt,
      finishedAt: new Date().toISOString(),
      binary: config.binary,
      evidence: config.evidence,
      protocolVersion: initialize.protocolVersion,
      serverInfo: initialize.serverInfo,
      toolsListPath,
      registry,
      cases: results,
      casesPassed: results.length,
      casesFailed: 0,
      executedTrueCount: 0,
      desktopActionsExecuted: 0,
      unguardedActionCalls: 0,
      protocolViolations: [],
      stdoutPollutionCount: 0,
      processExit: exit,
      ndjson: recorder.ndjsonPath,
      stdout: recorder.stdoutPath,
      stderr: recorder.stderrPath,
    };
  } catch (error) {
    if (!exit) {
      try {
        exit = await client.terminate("SIGTERM");
      } catch (_) {}
    }
    summary = {
      ok: false,
      startedAt,
      finishedAt: new Date().toISOString(),
      binary: config.binary,
      evidence: config.evidence,
      error: serializeError(error),
      executedTrueCount: null,
      desktopActionsExecuted: null,
      unguardedActionCalls: 0,
      protocolViolations: client.protocolViolations,
      stdoutPollutionCount: client.protocolViolations.filter((item) => item.reason === "non_json_stdout").length,
      processExit: exit,
      ndjson: recorder.ndjsonPath,
      stdout: recorder.stdoutPath,
      stderr: recorder.stderrPath,
    };
    process.exitCode = 1;
  }

  const summaryPath = recorder.json("contract-results.json", summary);
  recorder.event("session_complete", { summaryPath, summary });
  process.stdout.write(`${JSON.stringify({ ...summary, cases: undefined, summaryPath }, null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message || String(error)}\n`);
  process.stderr.write(`${usage()}\n`);
  process.exitCode = 1;
});
