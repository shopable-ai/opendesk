"use strict";

const assert = require("node:assert/strict");

const controlURL = process.env.OPENDESK_WORKBENCH_CONTROL_URL;
const frontendURL = process.env.OPENDESK_WORKBENCH_FRONTEND_URL;
if (!controlURL || !frontendURL) {
  throw new Error("OPENDESK_WORKBENCH_CONTROL_URL and OPENDESK_WORKBENCH_FRONTEND_URL are required");
}

const controlHeaders = {
  "Content-Type": "application/json",
  "X-OpenDesk-Workbench-Control": "1"
};
const frontendOrigin = new URL(frontendURL).origin;
controlHeaders.Origin = frontendOrigin;
controlHeaders["Sec-Fetch-Site"] = "same-site";
controlHeaders["Sec-Fetch-Mode"] = "cors";

async function preflightBrowserControl() {
  const response = await fetch(controlURL, {
    method: "OPTIONS",
    headers: {
      Origin: frontendOrigin,
      "Access-Control-Request-Method": "POST",
      "Access-Control-Request-Headers": "content-type, x-opendesk-workbench-control"
    }
  });
  assert.equal(response.status, 204);
  assert.equal(response.headers.get("access-control-allow-origin"), frontendOrigin);
}

async function launch() {
  const response = await fetch(controlURL, {
    method: "POST",
    headers: controlHeaders,
    body: JSON.stringify({ frontendUrl: frontendURL })
  });
  const payload = await response.json();
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(payload.code, 0);
  assert.equal(payload.data.mode, "loopback");
  assert.equal(typeof payload.data.url, "string");
  return payload.data.url;
}

async function waitForListenerClose(pageURL) {
  const deadline = Date.now() + 3000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(pageURL, { headers: { Connection: "close" } });
      await response.arrayBuffer();
    } catch (_) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error("on-demand Workbench listener remained open after authorization revocation");
}

async function main() {
  await preflightBrowserControl();
  const launchURL = new URL(await launch());
  assert.equal(launchURL.protocol, "http:");
  assert.equal(launchURL.hostname, "127.0.0.1");
  const fragment = new URLSearchParams(launchURL.hash.slice(1));
  const pairCode = fragment.get("pair");
  assert.ok(pairCode);
  const apiOrigin = fragment.get("api") || launchURL.origin;
  assert.ok(fragment.get("api"));
  assert.equal(launchURL.origin + launchURL.pathname, new URL(frontendURL).origin + new URL(frontendURL).pathname);
  assert.notEqual(apiOrigin, launchURL.origin);
  for (const path of ["/", "/accessibility-workbench", "/accessibility-workbench/assets/app.js"]) {
    const response = await fetch(new URL(path, apiOrigin));
    assert.equal(response.status, 404, `API listener unexpectedly served ${path}`);
    await response.arrayBuffer();
  }
  launchURL.hash = "";
  const pageURL = launchURL;

  const pageResponse = await fetch(pageURL);
  assert.equal(pageResponse.status, 200);
  const pageSource = await pageResponse.text();
  assert.match(pageSource, /Accessibility Workbench/);
  for (const [name, contentType] of [
    ["app.css", "text/css"],
    ["model.js", "javascript"],
    ["app.js", "javascript"]
  ]) {
    const assetURL = new URL(`./assets/${name}`, pageURL);
    const assetResponse = await fetch(assetURL);
    assert.equal(assetResponse.status, 200);
    assert.match(assetResponse.headers.get("content-type"), new RegExp(contentType));
    assert.ok((await assetResponse.text()).length > 0);
  }

  const duplicate = await fetch(controlURL, {
    method: "POST",
    headers: controlHeaders,
    body: JSON.stringify({ frontendUrl: frontendURL })
  });
  assert.equal(duplicate.status, 409);
  await duplicate.arrayBuffer();

  const inspectorHeaders = {
    "Content-Type": "application/json",
    "X-OpenDesk-Inspector": "1",
    Origin: launchURL.origin,
    "Sec-Fetch-Site": "same-origin",
    "Sec-Fetch-Mode": "cors"
  };
  const pairResponse = await fetch(new URL("/api/accessibility-inspector/v1/pair", apiOrigin), {
    method: "POST",
    headers: inspectorHeaders,
    body: JSON.stringify({ code: pairCode })
  });
  const paired = await pairResponse.json();
  assert.equal(pairResponse.status, 200);
  assert.equal(typeof paired.data.token, "string");

  const revokeResponse = await fetch(new URL("/api/accessibility-inspector/v1/authorization", apiOrigin), {
    method: "DELETE",
    headers: { ...inspectorHeaders, Authorization: `Bearer ${paired.data.token}` }
  });
  assert.equal(revokeResponse.status, 200);
  await revokeResponse.arrayBuffer();
  await waitForListenerClose(new URL("/api/accessibility-inspector/v1/capabilities", apiOrigin));

  process.stdout.write(JSON.stringify({
    ok: true,
    reusedRunningProcess: true,
    onDemandListener: true,
    independentFrontend: true,
    browserSelfLaunch: true,
    frontendAssetsAvailable: true,
    apiServesNoFrontend: true,
    duplicateLaunchRejected: true,
    listenerReleasedAfterRevoke: true
  }) + "\n");
}

main().catch((error) => {
  process.stderr.write((error && error.stack) || String(error));
  process.stderr.write("\n");
  process.exitCode = 1;
});
