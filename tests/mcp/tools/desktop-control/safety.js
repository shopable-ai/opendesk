"use strict";

const assert = require("node:assert/strict");
const title = "OpenDesk Accessibility Fixture";
const boundsKeys = ["x", "y", "width", "height"];

function requireFixture(active, pid) {
  // Boolean assertions never attach a private title as actual/expected.
  assert(active?.title === title && active.pid === pid && active.isForeground === true && active.hasFocus === true,
    "authorized fixture is not the focused window");
}

function fixtureCapture(active, pid, observed, displays) {
  requireFixture(active, pid);
  const clip = Object.fromEntries(boundsKeys.map((key) => [key, active[key]]));
  assert(boundsKeys.every((key) => Number.isFinite(clip[key])) && clip.width > 0 && clip.height > 0,
    "fixture bounds unavailable; capture refused");
  assert(observed.pid === pid && boundsKeys.every((key) => observed.windowBounds?.[key] === clip[key]),
    "independent fixture bounds disagree; capture refused");
  const contained = displays.filter((display) => clip.x >= display.x && clip.y >= display.y &&
    clip.x + clip.width <= display.x + display.width && clip.y + clip.height <= display.y + display.height);
  assert(contained.length === 1 && Number.isFinite(contained[0].scale) && contained[0].scale > 0,
    "fixture must fit one known display; capture refused");
  // Explicit clip takes precedence in the existing Runtime, eliminating its
  // activeWindow -> full-screen fallback before any pixels are captured.
  return { clip, pixelWidth: Math.round(clip.width * contained[0].scale),
    pixelHeight: Math.round(clip.height * contained[0].scale), scale: contained[0].scale };
}

function requireCapture(capture, expected) {
  assert(capture.source === "clip" && capture.width === expected.pixelWidth && capture.height === expected.pixelHeight,
    "capture source or display-scaled bounds mismatch");
}

function safeFailure(stage) {
  return `desktop acceptance failed at ${stage}; raw error withheld`;
}

function safeViolations(client) {
  const known = new Set(["non_json_stdout", "invalid_jsonrpc_response", "invalid_response_id", "unexpected_idless_response", "unexpected_response_id"]);
  return client.protocolViolations.map((item) => ({ reason: known.has(item.reason) ? item.reason : "protocol_violation" }));
}

function finalize(summary, clients) {
  summary.protocolViolations = safeViolations(clients[0]);
  summary.readOnlyProtocolViolations = safeViolations(clients[1]);
  summary.ok = summary.stepsCompleted === true && summary.mcpExit?.code === 0 && summary.readOnlyExit?.code === 0 &&
    (summary.fixtureExit?.code === 0 || summary.fixtureExit?.signal === "SIGTERM") &&
    clients.every((client) => client.protocolViolations.length === 0);
  return summary.ok;
}

function privateRecorder(recorder, fixturePID) {
  const requests = new Map();
  return { append(event) {
    const id = event.message?.id;
    const validID = typeof id === "string" || (typeof id === "number" && Number.isInteger(id));
    const key = validID ? `${event.run}:${id}` : null;
    if (event.event === "request" && validID) requests.set(key, event.message.params?.name);
    if (event.event === "response") {
      const message = event.message && typeof event.message === "object" && !Array.isArray(event.message) ? event.message : {};
      // Error bodies and tool guard payloads can embed private active windows.
      // Retain only allowlisted evidence, never arbitrary nested response data.
      let result = { bodyOmitted: true, isError: message.result?.isError === true };
      const name = requests.get(key);
      const content = message.result?.content;
      const block = Array.isArray(content) ? content.find((item) => item?.type === "text" && typeof item.text === "string") : undefined;
      if (block && (name === "tm_list_windows" || name === "tm_get_active_window")) {
        try {
          const payload = JSON.parse(block.text);
          const rows = name === "tm_list_windows" ? payload.windows : [payload];
          result = { windows: rows.filter((row) => row.pid === fixturePID() && row.title === title)
            .map((row) => Object.fromEntries(["pid", "title", "handle", ...boundsKeys].map((field) => [field, row[field]]))),
          unrelatedWindowsRedacted: true };
        } catch { /* malformed/untrusted body stays omitted */ }
      }
      recorder.append({ run: event.run, event: "response", message: { jsonrpc: message.jsonrpc === "2.0" ? "2.0" : "invalid",
        id: requests.has(key) ? message.id : null,
        ...(message.error ? { error: { code: Number.isInteger(message.error.code) ? message.error.code : null,
          message: "response error body omitted" } } : { result }) } });
    } else if (["stderr_chunk", "stdout_pollution", "protocol_violation"].includes(event.event)) {
      recorder.append({ run: event.run, event: event.event, bodyOmitted: true });
    } else {
      recorder.append(event);
    }
  } };
}

module.exports = { requireFixture, fixtureCapture, requireCapture, safeFailure, finalize, privateRecorder };
