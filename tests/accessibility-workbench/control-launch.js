"use strict";

const assert = require("node:assert/strict");

const pageValue = process.env.OPENDESK_WORKBENCH_URL ||
  "http://127.0.0.1:60844/accessibility-workbench/";
const pageURL = new URL(pageValue);
assert.equal(pageURL.pathname, "/accessibility-workbench/");
const origin = pageURL.origin;
const controlURL = new URL("/api/accessibility-workbench/v1/launch", origin);

const browserHeaders = {
  Origin: origin,
  "Sec-Fetch-Site": "same-origin",
  "Sec-Fetch-Mode": "cors",
};
const controlHeaders = {
  ...browserHeaders,
  "Content-Type": "application/json",
  "X-OpenDesk-Workbench-Control": "1",
};

async function launch() {
  const response = await fetch(controlURL, {
    method: "POST",
    headers: controlHeaders,
    body: "{}",
  });
  const payload = await response.json();
  assert.equal(response.status, 200, JSON.stringify(payload));
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(response.headers.get("access-control-allow-origin"), null);
  assert.equal(payload.code, 0);
  assert.ok(["local-only", "trusted-lan"].includes(payload.data.mode));
  assert.equal(payload.data.listener, pageURL.host);
  return new URL(payload.data.url);
}

async function main() {
  const pageResponse = await fetch(pageURL);
  assert.equal(pageResponse.status, 200);
  assert.equal(pageResponse.headers.get("cache-control"), "no-store");
  assert.match(pageResponse.headers.get("content-security-policy") || "", /connect-src 'self'/);
  assert.match(await pageResponse.text(), /<title>OpenDesk Inspector<\/title>/);

  for (const [name, contentType] of [
    ["app.css", "text/css"],
    ["model.js", "javascript"],
    ["app.js", "javascript"],
  ]) {
    const assetResponse = await fetch(new URL(`assets/${name}`, pageURL));
    assert.equal(assetResponse.status, 200);
    assert.match(assetResponse.headers.get("content-type") || "", new RegExp(contentType));
    assert.ok((await assetResponse.text()).length > 0);
  }
  const arbitraryFile = await fetch(new URL("README.md", pageURL));
  assert.equal(arbitraryFile.status, 404);

  const launchURL = await launch();
  assert.equal(launchURL.origin, origin);
  assert.equal(launchURL.pathname, pageURL.pathname);
  const fragment = new URLSearchParams(launchURL.hash.slice(1));
  const pairCode = fragment.get("pair");
  assert.ok(pairCode);
  assert.equal(fragment.get("api"), null);

  const duplicate = await fetch(controlURL, {
    method: "POST", headers: controlHeaders, body: "{}",
  });
  assert.equal(duplicate.status, 409);
  await duplicate.arrayBuffer();

  const inspectorHeaders = {
    ...browserHeaders,
    "Content-Type": "application/json",
    "X-OpenDesk-Inspector": "1",
  };
  const pairResponse = await fetch(new URL("/api/accessibility-inspector/v1/pair", origin), {
    method: "POST",
    headers: inspectorHeaders,
    body: JSON.stringify({ code: pairCode }),
  });
  const paired = await pairResponse.json();
  assert.equal(pairResponse.status, 200, JSON.stringify(paired));
  assert.equal(typeof paired.data.token, "string");

  const replayResponse = await fetch(new URL("/api/accessibility-inspector/v1/pair", origin), {
    method: "POST", headers: inspectorHeaders, body: JSON.stringify({ code: pairCode }),
  });
  assert.equal(replayResponse.status, 401);
  await replayResponse.arrayBuffer();

  const mutatingRoute = await fetch(new URL("/api/accessibility-inspector/v1/perform", origin), {
    method: "POST",
    headers: { ...inspectorHeaders, Authorization: `Bearer ${paired.data.token}` },
    body: JSON.stringify({ action: "invoke" }),
  });
  assert.equal(mutatingRoute.status, 404);
  await mutatingRoute.arrayBuffer();

  const statusResponse = await fetch(new URL("/status", origin));
  assert.equal(statusResponse.status, 200, "the fixed OpenDesk listener must remain alive");
  await statusResponse.arrayBuffer();

  const revokeResponse = await fetch(new URL("/api/accessibility-inspector/v1/authorization", origin), {
    method: "DELETE",
    headers: { ...inspectorHeaders, Authorization: `Bearer ${paired.data.token}` },
  });
  assert.equal(revokeResponse.status, 200);
  await revokeResponse.arrayBuffer();

  const inactiveResponse = await fetch(new URL("/api/accessibility-inspector/v1/capabilities", origin), {
    headers: { ...inspectorHeaders, Authorization: `Bearer ${paired.data.token}` },
  });
  assert.equal(inactiveResponse.status, 404);
  await inactiveResponse.arrayBuffer();
  const stillServed = await fetch(pageURL);
  assert.equal(stillServed.status, 200);
  await stillServed.arrayBuffer();

  process.stdout.write(JSON.stringify({
    ok: true,
    fixedPort: pageURL.port === "60844",
    sameOriginPageControlAndData: true,
    frontendAssetsAvailable: true,
    arbitraryAssetsRejected: true,
    noCORSBridge: true,
    noRandomAPIOrigin: true,
    duplicateLaunchRejected: true,
    pairReplayRejected: true,
    mutatingInspectorRouteRejected: true,
    authorizationRevokedWithoutClosing60844: true,
  }) + "\n");
}

main().catch((error) => {
  process.stderr.write((error && error.stack) || String(error));
  process.stderr.write("\n");
  process.exitCode = 1;
});
