const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const launchValue = process.env.OPENDESK_WORKBENCH_URL;
if (!launchValue) throw new Error('OPENDESK_WORKBENCH_URL is required');
const launch = new URL(launchValue);
const expectedHost = process.env.OPENDESK_WORKBENCH_EXPECT_HOST || '127.0.0.1';
assert.equal(launch.hostname, expectedHost);
const pairParameters = new URLSearchParams(launch.hash.replace(/^#/, ''));
let pairCode = pairParameters.get('pair') || '';
assert.ok(pairCode, 'trusted launch URL is missing its pair fragment');
assert.equal(pairParameters.get('api'), null, 'Workbench must not return a separate API origin');
assert.ok(Number(launch.port) > 0, 'Workbench URL must include the actual Runtime port');
const frontendOrigin = launch.origin;
launch.hash = '';
const base = launch.origin;

let bearer = '';
let sessionId = '';
let sessionToken = '';
const commonHeaders = {
  Origin: frontendOrigin,
  'X-OpenDesk-Inspector': '1',
  'X-OpenDesk-Inspector-Client': 'non-browser',
};

async function api(relativePath, options = {}) {
  const headers = { ...commonHeaders, ...(options.headers || {}) };
  if (bearer) headers.Authorization = `Bearer ${bearer}`;
  if (sessionToken) headers['X-OpenDesk-Inspector-Session'] = sessionToken;
  let body;
  if (Object.prototype.hasOwnProperty.call(options, 'body')) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(options.body);
  }
  const response = await fetch(`${base}/api/accessibility-inspector/v1${relativePath}`, {
    method: options.method || 'GET', headers, body,
  });
  const payload = await response.json();
  if (options.expectedStatus) {
    assert.equal(response.status, options.expectedStatus, JSON.stringify(payload));
    return payload;
  }
  assert.equal(response.status, 200, JSON.stringify(payload));
  assert.equal(payload.code, 0, JSON.stringify(payload));
  return payload.data;
}

function findNode(root, predicate) {
  if (!root || typeof root !== 'object') return null;
  if (predicate(root)) return root;
  for (const child of Array.isArray(root.children) ? root.children : []) {
    const found = findNode(child, predicate);
    if (found) return found;
  }
  return null;
}

function flattenTree(root, depth = 0, parentId = null, output = []) {
  if (!root || typeof root !== 'object') return output;
  output.push({ node: root, depth, parentId });
  for (const child of Array.isArray(root.children) ? root.children : []) {
    flattenTree(child, depth + 1, root.nodeId, output);
  }
  return output;
}

function semanticTreeShape(root) {
  return flattenTree(root).map(({ node, depth, parentId }) => ({
    depth, parentId, nodeId: node.nodeId, role: node.role, nativeRole: node.nativeRole,
    nativeSubrole: node.nativeSubrole, name: node.name, identifier: node.identifier,
  }));
}

function assertObservationTree(observation, fixtureReceipt) {
  assert.equal(observation.schemaVersion, 'opendesk.inspector.observation/v1');
  assert.equal(observation.window.pid, fixtureReceipt.pid);
  assert.equal(observation.backend, 'macos-ax');
  assert.equal(observation.complete, true);
  assert.equal(observation.truncated, false);
  assert.equal(observation.freshness, 'current');
  assert.match(observation.sourceHash, /^sha256:/);
  assert.ok(observation.root, 'live observation root is missing');
  assert.equal(observation.root.role, 'window');
  assert.equal(observation.root.nativeRole, 'AXWindow');
  assert.equal(observation.root.name, 'OpenDesk Accessibility Fixture');
  assert.equal(observation.root.identifier, 'fixture.window.main');
  assert.ok(observation.root.nativeSubrole === null || typeof observation.root.nativeSubrole === 'string');
  const rows = flattenTree(observation.root);
  assert.equal(rows.length, observation.stats.nodes);
  assert.equal(Math.max(...rows.map((row) => row.depth)), observation.stats.maxDepth);
  assert.ok(rows.length >= 20, `fixture tree has too few nodes: ${rows.length}`);
  for (const { node, depth, parentId } of rows) {
    assert.match(node.nodeId, /^node-[1-9][0-9]*$/);
    assert.equal(Object.prototype.hasOwnProperty.call(node, 'value'), false, `value leaked at ${node.nodeId}`);
    assert.equal(Array.isArray(node.children), true, `children missing at ${node.nodeId}`);
    assert.equal(typeof node.role, 'string');
    assert.equal(typeof node.nativeRole, 'string');
    assert.ok(node.nativeSubrole === null || typeof node.nativeSubrole === 'string');
    assert.ok(node.name === null || typeof node.name === 'string');
    assert.ok(node.identifier === null || typeof node.identifier === 'string');
    for (const key of ['enabled', 'focused', 'selected', 'checked', 'expanded']) {
      assert.ok(node[key] === null || typeof node[key] === 'boolean', `${key} shape at ${node.nodeId}`);
    }
    assert.equal(Array.isArray(node.actions), true);
    assert.ok(node.bounds === null || (Number.isFinite(node.bounds.x) && Number.isFinite(node.bounds.y) &&
      Number.isFinite(node.bounds.width) && Number.isFinite(node.bounds.height)));
    assert.ok(node.nativeBounds === null || (Number.isFinite(node.nativeBounds.x) && Number.isFinite(node.nativeBounds.y) &&
      Number.isFinite(node.nativeBounds.width) && Number.isFinite(node.nativeBounds.height) &&
      typeof node.nativeBounds.coordinateSpace === 'string'));
    if (depth === 0) assert.equal(parentId, null);
    else assert.equal(typeof parentId, 'string');
  }
  const identifierOrder = observation.root.children.map((node) => node.identifier).filter(Boolean);
  assert.deepEqual(identifierOrder.slice(0, 14), [
    'fixture.heading', 'fixture.status', 'fixture.invoke', 'fixture.duplicate.first',
    'fixture.duplicate.second', 'fixture.disabled', 'fixture.text.editable',
    'fixture.text.readonly', 'fixture.text.disabled', 'fixture.text.protected',
    'fixture.checkbox', 'fixture.radio.one', 'fixture.radio.two', 'fixture.dynamic.reveal',
  ]);
  const byIdentifier = new Map(rows.filter(({ node }) => node.identifier).map(({ node }) => [node.identifier, node]));
  assert.equal(byIdentifier.get('fixture.heading').name,
    '<img src=x onerror=globalThis.__axInjected=1><script>globalThis.__axScript=1</script>');
  assert.equal(byIdentifier.get('fixture.invoke').role, 'button');
  assert.equal(byIdentifier.get('fixture.invoke').enabled, true);
  assert.ok(byIdentifier.get('fixture.invoke').actions.includes('invoke'));
  assert.equal(byIdentifier.get('fixture.disabled').enabled, false);
  assert.equal(byIdentifier.get('fixture.checkbox').role, 'checkbox');
  assert.equal(byIdentifier.get('fixture.checkbox').checked, false);
  assert.equal(byIdentifier.get('fixture.radio.one').selected, true);
  assert.equal(byIdentifier.get('fixture.radio.two').selected, false);
  assert.equal(byIdentifier.get('fixture.text.protected').nativeSubrole, 'AXSecureTextField');
  // The macOS backend intentionally exposes AX display points only as
  // nativeBounds until mixed-scale OpenDesk screen mapping can be proven.
  assert.equal(observation.root.bounds, null);
  assert.ok(observation.root.nativeBounds);
  return rows;
}

function runFixtureScript(relativePath) {
  const result = spawnSync(path.join(process.cwd(), 'dist', 'opendesk'), [
    '-script', relativePath, '-console-mode', 'script',
  ], { cwd: process.cwd(), encoding: 'utf8', timeout: 120000 });
  assert.equal(result.status, 0, `${relativePath} failed: ${result.stderr || result.stdout}`);
  return result;
}

function clickFixtureButton(pid, buttonName) {
  const result = spawnSync('/usr/bin/osascript', [
    '-e', 'tell application "System Events"',
    '-e', `tell first process whose unix id is ${Number(pid)}`,
    '-e', `click button ${JSON.stringify(buttonName)} of window "OpenDesk Accessibility Fixture"`,
    '-e', 'end tell',
    '-e', 'end tell',
  ], { cwd: process.cwd(), encoding: 'utf8', timeout: 10000 });
  assert.equal(result.status, 0, `failed to click fixture button ${buttonName}: ${result.stderr || result.stdout}`);
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function main() {
  const page = await fetch(launch.href);
  assert.equal(page.status, 200);
  const pageSource = await page.text();
  assert.match(pageSource, /<title>OpenDesk Inspector<\/title>/);
  assert.match(pageSource, /http-equiv="Content-Security-Policy"/);
  assert.match(pageSource, /<meta name="referrer" content="no-referrer">/);

  const ordinaryStatus = await fetch(`${base}/status`);
  assert.equal(ordinaryStatus.status, 200, 'same listener must remain the ordinary OpenDesk server');
  await ordinaryStatus.arrayBuffer();

  const paired = await api('/pair', { method: 'POST', body: { code: pairCode } });
  pairCode = '';
  bearer = paired.token;
  assert.equal(paired.tokenType, 'Bearer');

  const replay = await api('/pair', {
    method: 'POST', body: { code: 'already-consumed' }, expectedStatus: 401,
  });
  assert.notEqual(replay.code, 0);

  const capabilities = await api('/capabilities');
  assert.equal(capabilities.accessibility.hostAuthorization.readOnly, true);
  assert.equal(capabilities.accessibility.hostAuthorization.valueAllowed, false);
  assert.equal(capabilities.accessibility.implementation.available, true);
  assert.equal(capabilities.accessibility.permission.granted, true);

  let fixtureReceipt = JSON.parse(fs.readFileSync(path.join(
    process.cwd(), '.runtime', 'tests', 'accessibility', 'macos', 'launch.json',
  ), 'utf8'));
  const windows = await api('/windows');
  const fixtureWindow = windows.find((candidate) =>
    candidate.pid === fixtureReceipt.pid && candidate.title === 'OpenDesk Accessibility Fixture');
  assert.ok(fixtureWindow, 'the exact repository-owned fixture window was not listed');

  const session = await api('/sessions', {
    method: 'POST',
    body: { windowId: fixtureWindow.windowId, limits: { timeout: 5000, maxDepth: 6, maxNodes: 500 } },
  });
  sessionId = session.sessionId;
  sessionToken = session.sessionToken;
  assert.equal(session.window.pid, fixtureReceipt.pid);

  const observation = await api(`/sessions/${encodeURIComponent(sessionId)}/observations`, {
    method: 'POST', body: {},
  });
  const firstRows = assertObservationTree(observation, fixtureReceipt);

  const repeated = await api(`/sessions/${encodeURIComponent(sessionId)}/observations`, {
    method: 'POST', body: {},
  });
  const repeatedRows = assertObservationTree(repeated, fixtureReceipt);
  assert.deepEqual(semanticTreeShape(repeated.root), semanticTreeShape(observation.root),
    'unchanged fixture tree order or display node IDs were not stable across refresh');

  const constrained = await api(`/sessions/${encodeURIComponent(sessionId)}/observations`, {
    method: 'POST', body: { limits: { timeout: 5000, maxDepth: 6, maxNodes: 1 } },
  });
  assert.equal(constrained.complete, false);
  assert.equal(constrained.truncated, true);
  assert.ok(['maxNodes', 'controllerMaxNodes'].includes(constrained.reason));
  assert.equal(constrained.stats.nodes, 1);

  const currentObservation = await api(`/sessions/${encodeURIComponent(sessionId)}/observations`, {
    method: 'POST', body: {},
  });
  assertObservationTree(currentObservation, fixtureReceipt);

  const visual = await api(`/sessions/${encodeURIComponent(sessionId)}/visual-captures`, {
    method: 'POST',
    body: { observationId: currentObservation.observationId, generation: currentObservation.generation },
  });
  assert.equal(visual.schemaVersion, 'opendesk.inspector.visual-capture/v1');
  assert.equal(visual.sessionId, sessionId);
  assert.equal(visual.observationId, currentObservation.observationId);
  assert.equal(visual.generation, currentObservation.generation);
  assert.equal(visual.image.mimeType, 'image/png');
  assert.match(visual.image.dataUrl, /^data:image\/png;base64,/);
  assert.ok(visual.image.sizeBytes > 0 && visual.image.sizeBytes <= 5 * 1024 * 1024);
  assert.ok(visual.image.width > 0 && visual.image.height > 0);
  const visualBytes = Buffer.from(visual.image.dataUrl.slice('data:image/png;base64,'.length), 'base64');
  assert.equal(visualBytes.length, visual.image.sizeBytes);
  assert.equal(visual.captureProvenance.focusChanged, false);
  assert.equal(visual.captureProvenance.persisted, false);
  assert.equal(typeof visual.captureProvenance.foregroundVerified, 'boolean');
  assert.equal(typeof visual.captureProvenance.occlusionRisk, 'boolean');
  assert.ok(['exact-window', 'visible-bounds'].includes(visual.captureProvenance.scope));
  assert.deepEqual(
    [visual.window.x, visual.window.y, visual.window.width, visual.window.height],
    [currentObservation.window.x, currentObservation.window.y, currentObservation.window.width, currentObservation.window.height],
  );

  const invokeNode = findNode(currentObservation.root, (node) => node.identifier === 'fixture.invoke');
  assert.ok(invokeNode, 'fixture.invoke is missing from the live observation');
  const locator = { role: 'button', name: 'Invoke Once', identifier: 'fixture.invoke' };
  const validation = await api(`/sessions/${encodeURIComponent(sessionId)}/validate`, {
    method: 'POST', body: { locator },
  });
  assert.equal(validation.status, 'UNIQUE');
  assert.equal(validation.performedAction, false);

  const saved = await api(`/sessions/${encodeURIComponent(sessionId)}/review`, {
    method: 'PUT',
    body: {
      observationId: currentObservation.observationId,
      selectedNodeId: invokeNode.nodeId,
      businessAlias: 'Fixture invoke control',
      humanNote: '<img src=x onerror=alert(1)> is untrusted test data',
      intendedUsage: 'Generate one separately authorized fixture action',
      locator,
    },
  });
  assert.equal(saved.handoff.locatorCandidate.validationStatus, 'UNIQUE');
  assert.equal(saved.handoff.observation.selectedElementFacts.nativeSubrole, invokeNode.nativeSubrole);
  assert.equal(saved.handoff.recipeVerification, 'not-run');
  assert.equal(saved.handoff.agentStatus, 'waiting-for-agent');
  const serialized = JSON.stringify(saved.handoff);
  for (const secret of [bearer, sessionToken]) assert.equal(serialized.includes(secret), false);
  for (const forbidden of ['"nodeId"', '"children"', '"value"']) assert.equal(serialized.includes(forbidden), false);

  const artifactPath = path.resolve(saved.artifactPath);
  const expectedRoot = path.resolve(process.cwd(), '.runtime', 'accessibility-inspector');
  assert.ok(artifactPath.startsWith(`${expectedRoot}${path.sep}`));
  assert.equal(fs.statSync(artifactPath).mode & 0o077, 0);

  const imported = structuredClone(saved.handoff);
  imported.locatorCandidate.selector = { role: 'button', name: 'Different control' };
  imported.locatorCandidate.validationStatus = 'UNIQUE';
  const importedResult = await api(`/sessions/${encodeURIComponent(sessionId)}/import`, {
    method: 'POST', body: { selectedNodeId: invokeNode.nodeId, handoff: imported },
  });
  assert.equal(importedResult.validationStatus, 'NOT_VALIDATED');
  assert.equal(importedResult.handoff.locatorCandidate.validationStatus, 'NOT_VALIDATED');

  await api(`/sessions/${encodeURIComponent(sessionId)}/review`, {
    method: 'PUT',
    body: {
      observationId: currentObservation.observationId,
      selectedNodeId: invokeNode.nodeId,
      businessAlias: 'Fixture invoke control',
      humanNote: 'Restored the locally validated locator after the import trust-boundary check',
      intendedUsage: 'Generate one separately authorized fixture action',
      locator,
    },
  });
  const handoff = await api(`/sessions/${encodeURIComponent(sessionId)}/handoff`);
  assert.equal(handoff.agentStatus, 'waiting-for-agent');
  assert.equal(handoff.locatorCandidate.validationStatus, 'UNIQUE');

  const summary = {
    fixturePid: fixtureReceipt.pid,
    window: { windowId: fixtureWindow.windowId, title: fixtureWindow.title, pid: fixtureWindow.pid },
    backend: currentObservation.backend,
    nodes: currentObservation.stats.nodes,
    maxDepth: currentObservation.stats.maxDepth,
    complete: currentObservation.complete,
    root: {
      role: currentObservation.root.role,
      nativeRole: currentObservation.root.nativeRole,
      nativeSubrole: currentObservation.root.nativeSubrole,
      name: currentObservation.root.name,
      identifier: currentObservation.root.identifier,
      childCount: currentObservation.root.children.length,
      bounds: currentObservation.root.bounds,
      nativeBounds: currentObservation.root.nativeBounds,
    },
    stableRefreshNodes: repeatedRows.length,
    stableNodeIDs: firstRows.map((row) => row.node.nodeId).join(',') === repeatedRows.map((row) => row.node.nodeId).join(','),
    directChildIdentifiers: currentObservation.root.children.map((node) => node.identifier),
    fieldAvailability: Object.fromEntries([
      'nativeSubrole', 'name', 'identifier', 'enabled', 'focused', 'selected', 'checked',
      'expanded', 'nativeBounds', 'bounds',
    ].map((key) => [key, {
      nonNull: firstRows.filter(({ node }) => node[key] !== null).length,
      null: firstRows.filter(({ node }) => node[key] === null).length,
    }])),
    semantics: {
      invokeEnabled: findNode(currentObservation.root, (node) => node.identifier === 'fixture.invoke').enabled,
      disabledEnabled: findNode(currentObservation.root, (node) => node.identifier === 'fixture.disabled').enabled,
      checkboxChecked: findNode(currentObservation.root, (node) => node.identifier === 'fixture.checkbox').checked,
      radioOneSelected: findNode(currentObservation.root, (node) => node.identifier === 'fixture.radio.one').selected,
      radioTwoSelected: findNode(currentObservation.root, (node) => node.identifier === 'fixture.radio.two').selected,
      protectedSubrole: findNode(currentObservation.root, (node) => node.identifier === 'fixture.text.protected').nativeSubrole,
    },
    constrained: { complete: constrained.complete, truncated: constrained.truncated, reason: constrained.reason, stats: constrained.stats },
    observationId: currentObservation.observationId,
    sourceHash: currentObservation.sourceHash,
    validationStatus: validation.status,
    performedAction: validation.performedAction,
    importedValidationStatus: importedResult.validationStatus,
    visual: {
      captureId: visual.captureId,
      pixels: `${visual.image.width}x${visual.image.height}`,
      sizeBytes: visual.image.sizeBytes,
      scope: visual.captureProvenance.scope,
      method: visual.captureProvenance.method,
      foregroundVerified: visual.captureProvenance.foregroundVerified,
      occlusionRisk: visual.captureProvenance.occlusionRisk,
      persisted: visual.captureProvenance.persisted,
    },
    handoffPath: saved.artifactPath,
  };

  if (process.env.OPENDESK_WORKBENCH_DYNAMIC === '1') {
    clickFixtureButton(fixtureReceipt.pid, 'Reveal Dynamic Control');
    await delay(500);
    const materialized = await api(`/sessions/${encodeURIComponent(sessionId)}/observations`, {
      method: 'POST', body: {},
    });
    assertObservationTree(materialized, fixtureReceipt);
    assert.ok(materialized.stats.maxDepth >= 3);
    assert.ok(findNode(materialized.root, (node) => node.identifier === 'fixture.dynamic.child'));

    clickFixtureButton(fixtureReceipt.pid, 'Reveal Dynamic Control');
    await delay(100);
    const partial = await api(`/sessions/${encodeURIComponent(sessionId)}/observations`, {
      method: 'POST', body: {},
    });
    assert.equal(partial.complete, false);
    assert.equal(partial.truncated, false);
    assert.equal(partial.reason, 'unmaterialized');
    assert.ok(partial.root, 'partial observation must retain its real root');
    assert.ok(findNode(partial.root, (node) => node.identifier === 'fixture.dynamic.container'));
    assert.equal(findNode(partial.root, (node) => node.identifier === 'fixture.dynamic.child'), null);

    clickFixtureButton(fixtureReceipt.pid, 'Reveal Dynamic Control');
    await delay(500);
    const rematerialized = await api(`/sessions/${encodeURIComponent(sessionId)}/observations`, {
      method: 'POST', body: {},
    });
    assertObservationTree(rematerialized, fixtureReceipt);
    assert.ok(findNode(rematerialized.root, (node) => node.identifier === 'fixture.dynamic.child'));
    summary.dynamic = {
      materialized: { complete: materialized.complete, nodes: materialized.stats.nodes, maxDepth: materialized.stats.maxDepth },
      partial: { complete: partial.complete, truncated: partial.truncated, reason: partial.reason, nodes: partial.stats.nodes, maxDepth: partial.stats.maxDepth },
      rematerialized: { complete: rematerialized.complete, nodes: rematerialized.stats.nodes, maxDepth: rematerialized.stats.maxDepth },
    };
  }

  if (process.env.OPENDESK_WORKBENCH_LIFECYCLE === '1') {
    const originalPID = fixtureReceipt.pid;
    const originalWindowId = fixtureWindow.windowId;
    runFixtureScript('tests/accessibility/fixtures/macos/stop.js');
    const stale = await api(`/sessions/${encodeURIComponent(sessionId)}/observations`, {
      method: 'POST', body: {}, expectedStatus: 409,
    });
    assert.notEqual(stale.code, 0);
    const staleStatus = await api(`/sessions/${encodeURIComponent(sessionId)}`);
    assert.equal(staleStatus.latestObservation.freshness, 'stale');
    assert.ok(['STALE_TARGET', 'NOT_FOUND'].includes(staleStatus.latestObservation.staleReason),
      `unexpected stale reason: ${staleStatus.latestObservation.staleReason}`);
    assert.equal(staleStatus.hasReview, false);
    await api(`/sessions/${encodeURIComponent(sessionId)}/handoff`, { expectedStatus: 409 });
    await api(`/sessions/${encodeURIComponent(sessionId)}`, { method: 'DELETE' });
    sessionId = '';
    sessionToken = '';

    runFixtureScript('tests/accessibility/fixtures/macos/launch.js');
    fixtureReceipt = JSON.parse(fs.readFileSync(path.join(
      process.cwd(), '.runtime', 'tests', 'accessibility', 'macos', 'launch.json',
    ), 'utf8'));
    assert.notEqual(fixtureReceipt.pid, originalPID);
    const reopenedWindows = await api('/windows');
    await api('/sessions', {
      method: 'POST', body: { windowId: originalWindowId }, expectedStatus: 409,
    });
    const reopened = reopenedWindows.find((candidate) => candidate.pid === fixtureReceipt.pid &&
      candidate.title === 'OpenDesk Accessibility Fixture');
    assert.ok(reopened, 'reopened fixture was not present in the refreshed window list');
    const reopenedSession = await api('/sessions', {
      method: 'POST', body: { windowId: reopened.windowId, limits: { timeout: 5000, maxDepth: 6, maxNodes: 500 } },
    });
    sessionId = reopenedSession.sessionId;
    sessionToken = reopenedSession.sessionToken;
    const reopenedObservation = await api(`/sessions/${encodeURIComponent(sessionId)}/observations`, {
      method: 'POST', body: {},
    });
    assertObservationTree(reopenedObservation, fixtureReceipt);
    summary.lifecycle = {
      closedPid: originalPID, reopenedPid: fixtureReceipt.pid,
      staleObservation: staleStatus.latestObservation.freshness,
      staleReason: staleStatus.latestObservation.staleReason,
      oldWindowIdRejected: true, reopenedTreeNodes: reopenedObservation.stats.nodes,
    };
  }

  const evidenceDirectory = process.env.OPENDESK_WORKBENCH_EVIDENCE_DIR;
  if (evidenceDirectory) {
    const resolvedEvidenceDirectory = path.resolve(evidenceDirectory);
    fs.mkdirSync(resolvedEvidenceDirectory, { recursive: true, mode: 0o700 });
    const visualPath = path.join(resolvedEvidenceDirectory, 'target-window.png');
    const summaryPath = path.join(resolvedEvidenceDirectory, 'http-live-summary.json');
    fs.writeFileSync(visualPath, visualBytes, { mode: 0o600 });
    fs.writeFileSync(summaryPath, `${JSON.stringify(summary, null, 2)}\n`, { mode: 0o600 });
    summary.localTestEvidence = { visualPath, summaryPath };
  }

  await api(`/sessions/${encodeURIComponent(sessionId)}`, { method: 'DELETE' });
  sessionId = '';
  sessionToken = '';
  await api('/authorization', { method: 'DELETE' });
  bearer = '';
  console.log(JSON.stringify(summary));
}

main().catch((error) => {
  console.error(error && error.stack || error);
  process.exitCode = 1;
});
