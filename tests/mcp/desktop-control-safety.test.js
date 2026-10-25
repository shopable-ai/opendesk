"use strict";

// Failure injection tests only; these do not claim real desktop acceptance.
const test = require("node:test");
const assert = require("node:assert/strict");
const { MCPStdioClient } = require("./tools/macos-smoke/main.js");
const { requireFixture, fixtureCapture, requireCapture, safeFailure, finalize, privateRecorder } = require("./tools/desktop-control/safety.js");
const title = "OpenDesk Accessibility Fixture";
const secret = "PRIVATE-document-title-and-input";
const active = { title, pid: 123, isForeground: true, hasFocus: true, x: 10, y: 20, width: 720, height: 442 };
const bounds = { x: 10, y: 20, width: 720, height: 442 };
const displays = [{ x: 0, y: 0, width: 1728, height: 1117, scale: 2 }];

test("failed identity checks and emitted failure summaries never contain private titles", () => {
  let caught;
  try { requireFixture({ ...active, title: secret }, 123); } catch (error) { caught = error; }
  assert(caught);
  assert(!String(caught.stack).includes(secret));
  assert(!JSON.stringify({ error: safeFailure("tm_type") }).includes(secret));
});

test("protocol audit discards nested guard failures, unrelated windows, stderr and pollution bodies", () => {
  const rows = [];
  const recorder = privateRecorder({ append: (row) => rows.push(row) }, () => 123);
  for (const [run, id, name] of [["full", 1, "tm_type"], ["read-only", 1, "tm_list_windows"]]) {
    recorder.append({ run, event: "request", message: { id, params: { name } } });
  }
  recorder.append({ run: "full", event: "response", message: { id: 1, result: { isError: true,
    content: [{ type: "text", text: JSON.stringify({ error: secret, activeWindow: { title: secret }, actualWindowTitle: secret }) }] } } });
  recorder.append({ run: "read-only", event: "response", message: { id: 1, result: { content: [{ type: "text",
    text: JSON.stringify({ windows: [active, { pid: 456, title: secret }] }) }] } } });
  recorder.append({ event: "response", message: { id: secret, error: { code: -1, message: secret, data: secret } } });
  recorder.append({ event: "response", message: null });
  for (const id of [{ toString: null }, { toString: { secret } }, [], true]) {
    assert.doesNotThrow(() => recorder.append({ event: "response", message: { id, result: { content: [] } } }));
  }
  for (const content of [secret, {}, [null], [{ type: "text", text: { secret } }]]) {
    assert.doesNotThrow(() => recorder.append({ run: "full", event: "response", message: { id: 1, result: { content } } }));
  }
  recorder.append({ event: "stderr_chunk", text: secret });
  recorder.append({ event: "stdout_pollution", line: secret, parseError: secret });
  const serialized = JSON.stringify(rows);
  assert(!serialized.includes(secret));
  assert(serialized.includes(title));
  assert(rows.find((row) => row.run === "full" && row.event === "response").message.result.isError);
});

test("capture refuses missing, conflicting or cross-display bounds before issuing a screenshot", () => {
  const observed = { pid: 123, windowBounds: bounds };
  const expected = fixtureCapture(active, 123, observed, displays);
  assert.deepEqual(expected.clip, bounds);
  assert.equal(expected.pixelWidth, 1440);
  assert.equal(expected.pixelHeight, 884);
  assert(!Object.hasOwn(expected, "target"), "activeWindow fallback must not be requested");
  assert.throws(() => fixtureCapture({ ...active, width: 0 }, 123, observed, displays));
  assert.throws(() => fixtureCapture(active, 123, { ...observed, windowBounds: { ...bounds, x: 11 } }, displays));
  assert.throws(() => fixtureCapture({ ...active, x: 1500 }, 123,
    { ...observed, windowBounds: { ...bounds, x: 1500 } }, displays));
  assert.throws(() => requireCapture({ source: "screen", width: 1440, height: 884 }, expected));
  assert.throws(() => requireCapture({ source: "clip", width: 720, height: 442 }, expected));
  requireCapture({ source: "clip", width: 1440, height: 884 }, expected);
});

for (const pollutedClient of [0, 1]) for (const invalidID of [false, true]) {
  test(`trailing ${invalidID ? "invalid ID" : "stdout pollution"} during client ${pollutedClient} close makes final acceptance fail`, async () => {
    const rows = [];
    const recorder = privateRecorder({ append: (row) => rows.push(row) }, () => 123);
    const output = invalidID ? JSON.stringify({ jsonrpc: "2.0", id: { toString: null }, result: { content: [] } }) : secret;
    const client = new MCPStdioClient({ binary: process.execPath, args: ["-e",
      `process.stdin.resume(); process.stdin.on('end', () => process.stdout.write(${JSON.stringify(output)}));`],
    cwd: process.cwd(), timeoutMs: 1000, runName: "failure-injection", recorder,
    stdoutPath: "/dev/null", stderrPath: "/dev/null" });
    await client.start();
    const before = { ok: false, stepsCompleted: true, mcpExit: { code: 0 }, readOnlyExit: { code: 0 }, fixtureExit: { signal: "SIGTERM" } };
    const clean = { protocolViolations: [] };
    assert(finalize(before, [clean, clean]));
    const exit = await client.close();
    assert.equal(exit.code, 0, "fixture deliberately exits successfully despite trailing pollution");
    const clients = [clean, clean];
    clients[pollutedClient] = client;
    const exitCode = finalize(before, clients) ? 0 : 1;
    assert.equal(before.ok, false);
    assert.equal(exitCode, 1);
    assert.equal(client.protocolViolations.length, 1);
    assert.equal((pollutedClient === 0 ? before.protocolViolations : before.readOnlyProtocolViolations)[0].reason,
      invalidID ? "invalid_response_id" : "non_json_stdout");
    assert(!JSON.stringify({ before, rows }).includes(secret));
  });
}

test("shared stdio client rejects poisonous response IDs with an ordinary recorder too", async () => {
  const client = new MCPStdioClient({ binary: process.execPath, args: ["-e",
    'process.stdin.resume(); process.stdin.on("end", () => process.stdout.write(JSON.stringify({jsonrpc:"2.0",id:{toString:null},result:{}})));'],
  cwd: process.cwd(), timeoutMs: 1000, runName: "invalid-id", recorder: { append() {} },
  stdoutPath: "/dev/null", stderrPath: "/dev/null" });
  await client.start();
  assert.equal((await client.close()).code, 0);
  assert.deepEqual(client.protocolViolations, [{ reason: "invalid_response_id" }]);
});
