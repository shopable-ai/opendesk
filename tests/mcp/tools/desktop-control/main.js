#!/usr/bin/env node
"use strict";

// Opt-in live acceptance: writes only to a newly launched repository fixture.
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { spawn, spawnSync } = require("node:child_process");
const { MCPStdioClient, EvidenceRecorder, inspectPNG } = require("../macos-smoke/main.js");
const { requireFixture, fixtureCapture, requireCapture, safeFailure, finalize, privateRecorder } = require("./safety.js");
const root = path.resolve(__dirname, "../../../..");
const title = "OpenDesk Accessibility Fixture";
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function command(executable, args) {
  const result = spawnSync(executable, args, { cwd: root, encoding: "utf8", timeout: 30_000 });
  assert.equal(result.status, 0, `${executable}: ${result.error || result.stderr}`);
  return result.stdout.trim();
}

async function waitFor(read, ready) {
  const deadline = Date.now() + 8_000;
  while (Date.now() < deadline) {
    const value = read();
    if (ready(value)) return value;
    await pause(100);
  }
  throw new Error("fixture observation deadline exceeded; no input will be retried");
}

async function main() {
  assert.equal(process.platform, "darwin", "requires a real macOS desktop");
  assert(process.argv.includes("--allow-fixture-input"), "explicit --allow-fixture-input required");
  const evidenceIndex = process.argv.indexOf("--evidence");
  const evidence = path.resolve(evidenceIndex < 0
    ? path.join(root, ".runtime/tests/mcp-desktop-control", new Date().toISOString().replace(/[:.]/g, "-"))
    : process.argv[evidenceIndex + 1]);
  assert(evidence.startsWith(path.join(root, ".runtime/")), "evidence must stay under .runtime/");
  fs.mkdirSync(evidence, { recursive: true, mode: 0o700 });
  const binary = path.join(root, "dist/opendesk-mcp");
  const fixtureRoot = path.join(root, ".runtime/tests/accessibility/macos");
  const fixtureApp = path.join(fixtureRoot, "OpenDeskAccessibilityFixture.app");
  const fixtureBinary = path.join(fixtureApp, "Contents/MacOS/OpenDeskAccessibilityFixture");
  const helper = path.join(evidence, "observe-fixture");
  const source = path.join(root, "tests/accessibility/fixtures/macos");
  const statePath = path.join(evidence, "fixture-state.json");
  assert(!fs.existsSync(statePath), "use a fresh evidence directory; prior input must not be replayed");
  const processes = command("/bin/ps", ["-axo", "comm="]).split("\n").map((line) => line.trim());
  assert(!processes.includes(fixtureBinary), "existing fixture belongs to another run");
  fs.mkdirSync(path.dirname(fixtureBinary), { recursive: true });
  fs.copyFileSync(path.join(source, "Info.plist"), path.join(fixtureApp, "Contents/Info.plist"));
  command("/usr/bin/xcrun", ["clang", "-fobjc-arc", "-Wall", "-Wextra", "-Werror", "-framework", "AppKit",
    path.join(source, "main.m"), "-o", fixtureBinary]);
  // Reuse the established fixture's bundle ID, path and ad-hoc test signing.
  command("/usr/bin/codesign", ["--force", "--sign", "-", fixtureApp]);
  command("/usr/bin/codesign", ["--verify", "--strict", fixtureApp]);
  command("/usr/bin/xcrun", ["clang", "-fobjc-arc", "-Wall", "-Wextra", "-Werror", "-framework", "AppKit",
    "-framework", "ApplicationServices", path.join(__dirname, "observe.m"), "-o", helper]);

  const evidenceRecorder = new EvidenceRecorder(evidence, "desktop-control");
  const recorder = privateRecorder(evidenceRecorder, () => fixture?.pid);
  const client = new MCPStdioClient({ binary, cwd: root, timeoutMs: 15_000, runName: "desktop-control", recorder,
    stdoutPath: "/dev/null", stderrPath: "/dev/null" });
  const readOnlyClient = new MCPStdioClient({ binary, args: ["--read-only"], cwd: root, timeoutMs: 15_000,
    runName: "read-only-policy", recorder, stdoutPath: "/dev/null", stderrPath: "/dev/null" });
  let fixture;
  let fixtureExit;
  const summary = { ok: false, cloud: "NOT_TESTED", evidence, inputAttempts: 0, checks: [], stage: "initialize" };
  const save = (name, value) => fs.writeFileSync(path.join(evidence, name), JSON.stringify(value, null, 2) + "\n");
  const readState = () => fs.existsSync(statePath) ? JSON.parse(fs.readFileSync(statePath, "utf8")) : null;
  const observe = () => JSON.parse(command(helper, [String(fixture.pid)]));
  async function tool(name, args = {}) {
    summary.stage = name;
    const result = await client.request("tools/call", { name, arguments: args });
    assert(result.isError !== true, `${name} failed; result body withheld`);
    const block = result.content.find((item) => item.type === "text");
    assert(block, `${name} missing text result`);
    const payload = JSON.parse(block.text);
    assert(payload.ok !== false, `${name} failed; result body withheld`);
    summary.checks.push(name);
    return payload;
  }
  async function activeFixture() {
    const active = await tool("tm_get_active_window");
    requireFixture(active, fixture.pid);
    return active;
  }
  try {
    await client.start();
    const init = await client.request("initialize", { protocolVersion: "2025-06-18", capabilities: {},
      clientInfo: { name: "opendesk-real-desktop-acceptance", version: "1.0" } });
    save("initialize.json", init);
    await client.notify("notifications/initialized");
    const registry = await client.request("tools/list");
    save("tools.json", registry);
    for (const name of ["tm_status", "tm_permissions", "tm_list_windows", "tm_get_active_window", "tm_focus_window", "tm_type", "tm_screenshot"])
      assert(registry.tools.some((entry) => entry.name === name), `missing ${name}`);
    const status = await tool("tm_status");
    assert.equal(status.status, "ok");
    const permissions = await tool("tm_permissions");
    save("permissions.json", permissions);
    assert.equal(permissions.accessibility, true);
    assert.equal(permissions.screenCapture, true);
    fixture = spawn(fixtureBinary, ["--state", statePath], { cwd: root, stdio: "ignore" });
    fixtureExit = new Promise((resolve) => fixture.once("close", (code, signal) => resolve({ code, signal })));
    const initial = await waitFor(readState, (value) => value?.pid === fixture.pid && value.windowNumber > 0);
    assert.equal(initial.bundleIdentifier, "com.opendesk.accessibility-fixture");
    save("fixture-before.json", initial);
    const windows = await tool("tm_list_windows");
    const target = windows.windows.filter((row) => row.title === title && row.pid === fixture.pid);
    assert.equal(target.length, 1, "must resolve one exact fixture window");
    save("target-window.json", target[0]); // Never persist unrelated window titles.
    await tool("tm_get_active_window");
    await tool("tm_focus_window", { title });
    await activeFixture();
    let field = observe();
    assert.equal(field.executable, fixtureBinary);
    assert.equal(field.enabled, true);
    assert.equal(field.role, "AXTextField");
    save("field-before.json", field);
    if (!field.focused) {
      const bounds = field.bounds;
      await tool("tm_click", { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2, expectedWindowTitle: title });
      field = await waitFor(observe, (value) => value.focused === true);
    }
    assert.equal(field.focused, true);
    await activeFixture();
    const rejected = await client.request("tools/call", { name: "tm_type", arguments: {
      text: "MUST_NOT_BE_TYPED", processId: fixture.pid, pressEnter: true, expectedWindowTitle: title,
    } });
    assert.equal(rejected.isError, true, "PID-scoped Enter must be a tool error before any input");
    assert.match(rejected.content[0].text, /no input was sent/);
    assert.equal(observe().value, field.value, "rejected combination must not type its prefix");
    summary.pidEnterRejectedBeforeInput = true;
    const text = `OpenDesk MCP 实机 ${crypto.randomUUID().slice(0, 8)}`;
    assert(!field.value.includes(text));
    summary.inputAttempts += 1;
    await tool("tm_type", { text, processId: fixture.pid, expectedWindowTitle: title });
    const actual = await waitFor(readState, (value) => value?.pid === fixture.pid && value.editableValue.includes(text));
    const observed = observe();
    assert.equal(observed.value, actual.editableValue, "independent AX value must agree with AppKit event state");
    assert.notEqual(actual.editableValue, initial.editableValue);
    save("fixture-after.json", actual);
    save("field-after.json", observed);
    const activeBeforeCapture = await activeFixture();
    const displays = await tool("tm_list_displays");
    const captureBounds = fixtureCapture(activeBeforeCapture, fixture.pid, observe(), displays.displays);
    summary.captureBounds = captureBounds;
    // Recheck identity after display discovery, immediately before capture.
    assert.deepEqual(await activeFixture(), activeBeforeCapture, "fixture changed before capture");
    const capturePath = path.join(evidence, "fixture-after.png");
    const capture = await tool("tm_screenshot", { clip: captureBounds.clip, path: capturePath, returnType: "object" });
    summary.screenshot = inspectPNG(capturePath, capture);
    requireCapture(summary.screenshot, captureBounds);
    assert.deepEqual(await activeFixture(), activeBeforeCapture, "fixture changed during capture");
    summary.stage = "read-only policy";
    await readOnlyClient.start();
    const readOnlyInit = await readOnlyClient.request("initialize", { protocolVersion: "2025-11-25", capabilities: {},
      clientInfo: { name: "opendesk-tunnel-policy-acceptance", version: "1.0" } });
    assert.equal(readOnlyInit.protocolVersion, "2025-11-25");
    await readOnlyClient.notify("notifications/initialized");
    const readOnlyTools = await readOnlyClient.request("tools/list");
    assert.equal(readOnlyTools.tools.length, 7);
    assert(readOnlyTools.tools.every((entry) => entry.annotations.readOnlyHint === true));
    assert(!readOnlyTools.tools.some((entry) => entry.name === "tm_type"));
    const canary = path.join(evidence, "read-only-canary.txt");
    fs.writeFileSync(canary, "must stay unchanged");
    for (const [name, args] of [
      ["tm_type", { text: "MUST_NOT_BE_TYPED" }],
      ["tm_screenshot", { path: canary }],
      ["tm_screenshot", { Path: canary }],
      ["tm_screenshot", { returnType: "object" }],
    ]) {
      await assert.rejects(readOnlyClient.request("tools/call", { name, arguments: args }),
        (error) => error.code === -32602);
    }
    assert.equal(fs.readFileSync(canary, "utf8"), "must stay unchanged");
    assert.equal(observe().value, actual.editableValue);
    assert.deepEqual(await activeFixture(), activeBeforeCapture, "fixture changed before read-only capture");
    summary.stage = "read-only capture";
    const readOnlyCapture = await readOnlyClient.request("tools/call", {
      name: "tm_screenshot", arguments: { clip: captureBounds.clip },
    });
    assert.notEqual(readOnlyCapture.isError, true);
    const dataURL = JSON.parse(readOnlyCapture.content[0].text).result;
    assert.equal(typeof dataURL, "string");
    assert(dataURL.startsWith("data:image/png;base64,"));
    const png = Buffer.from(dataURL.slice("data:image/png;base64,".length), "base64");
    assert.equal(png.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
    assert.equal(png.readUInt32BE(16), summary.screenshot.width);
    assert.equal(png.readUInt32BE(20), summary.screenshot.height);
    assert.deepEqual(await activeFixture(), activeBeforeCapture, "fixture changed during read-only capture");
    summary.readOnlyPolicy = { toolCount: 7, deniedCalls: 4, canaryUnchanged: true,
      screenshotBase64Bytes: png.length };
    assert.equal(readOnlyClient.protocolViolations.length, 0);
    assert.equal(client.protocolViolations.length, 0);
    summary.fixturePid = fixture.pid;
    summary.windowNumber = initial.windowNumber;
    summary.actual = actual.editableValue;
    summary.expectedSubstring = text;
    summary.provenance = {
      head: command("git", ["rev-parse", "HEAD"]),
      binarySha256: crypto.createHash("sha256").update(fs.readFileSync(binary)).digest("hex"),
      buildInfo: command(process.env.OPENDESK_GO || "go", ["version", "-m", binary]).split("\n")
        .filter((line, index) => index === 0 || /^\s*(path|mod|build)\s/.test(line)).join("\n"),
      fixtureSourceSha256: crypto.createHash("sha256").update(fs.readFileSync(path.join(source, "main.m"))).digest("hex"),
    };
    summary.stepsCompleted = true;
  } catch {
    summary.error = safeFailure(summary.stage);
  } finally {
    summary.mcpExit = await client.close();
    if (readOnlyClient.child) {
      summary.readOnlyExit = await readOnlyClient.close();
    }
    if (fixture) {
      // Only the child created by this run; never terminate an existing desktop app.
      fixture.kill("SIGTERM");
      summary.fixtureExit = await Promise.race([fixtureExit, pause(2000).then(() => null)]);
    }
    // close() flushes the trailing stdout line; only now can PASS be decided.
    process.exitCode = finalize(summary, [client, readOnlyClient]) ? 0 : 1;
    save("summary.json", summary);
  }
  console.log(JSON.stringify(summary, null, 2));
}

if (require.main === module) main().catch(() => {
  console.error(safeFailure("setup or cleanup")); process.exitCode = 1;
});
