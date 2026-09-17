// Read-only native layout check for an already-open production Flow Runner manager.
// From the repository root:
// OPENDESK_FLOW_RUNNER_HOST_PID=<ui-host-pid> \
//   ./dist/opendesk -script tests/runtime-api/flow-runner-manager-layout-native-macos.js -console-mode script
'use strict';

function assert(condition, message, details) {
  if (condition) return;
  throw new Error(message + (details === undefined ? '' : ': ' + JSON.stringify(details)));
}

function collectNames(node, names) {
  if (!node || typeof node !== 'object') return;
  if (typeof node.name === 'string' && node.name) names.push(node.name);
  for (const child of Array.isArray(node.children) ? node.children : []) collectNames(child, names);
}

function collectButtons(node, buttons) {
  if (!node || typeof node !== 'object') return;
  if (node.role === 'button') {
    buttons.push({name: node.name, enabled: node.enabled, bounds: node.bounds});
  }
  for (const child of Array.isArray(node.children) ? node.children : []) collectButtons(child, buttons);
}

if (System.getPlatformInfo().os !== 'darwin') {
  console.log('[SKIP] Flow Runner manager native layout check requires macOS.');
} else {
  const hostPID = Number(Execution.env.OPENDESK_FLOW_RUNNER_HOST_PID || 0);
  assert(Number.isInteger(hostPID) && hostPID > 0,
    'OPENDESK_FLOW_RUNNER_HOST_PID must identify the already-open UI Host');

  const evidenceDir = File.join(
    Execution.workdir, '.runtime', 'tests', 'flow-runner', 'manager-layout-native-macos',
    String(Date.now()) + '-' + Execution.id,
  );
  File.ensureDir(evidenceDir);

  const candidates = (await window.list()).filter(item => item.pid === hostPID
    && item.title === 'OpenDesk — 自动化'
    && item.width >= 800 && item.height >= 500);
  assert(candidates.length === 1, 'expected one full-sized Flow Runner manager window', candidates);
  const manager = candidates[0];

  const screenshot = await Screen.screenshot({
    clip: {x: manager.x, y: manager.y, width: manager.width, height: manager.height},
    path: File.join(evidenceDir, 'flow-runner-manager.png'),
    returnType: 'object',
  });
  assert(screenshot && screenshot.sizeBytes > 100,
    'Flow Runner manager screenshot was not written', screenshot);

  const snapshot = await Accessibility.snapshot({
    within: manager,
    timeout: 10000,
    maxDepth: 8,
    maxNodes: 1000,
    properties: ['role', 'name', 'identifier', 'enabled', 'bounds'],
  });
  const names = [];
  collectNames(snapshot.root, names);
  const buttons = [];
  collectButtons(snapshot.root, buttons);
  const deleteControls = buttons.filter(control => typeof control.name === 'string'
    && control.name.startsWith('删除'));
  // Snapshot bounds are unavailable with some native UI hosts. A row action is
  // distinguishable from the preallocated hidden controls by its named entry
  // and enabled state; the matching screenshot above is the visual evidence.
  const activeDeleteControls = deleteControls.filter(control => control.enabled
    && /^删除\s+/.test(control.name));
  assert(activeDeleteControls.length > 0,
    'Flow Runner manager exposes no enabled row delete action', {deleteControls, buttons});

  const result = {
    schemaVersion: 1,
    platform: 'darwin',
    hostPID,
    manager,
    screenshot: {path: screenshot.path, sizeBytes: screenshot.sizeBytes, width: screenshot.width, height: screenshot.height},
    accessibility: {
      complete: snapshot.complete,
      truncated: snapshot.truncated,
      stats: snapshot.stats,
      deleteControls,
      activeDeleteControls,
    },
  };
  File.write(File.join(evidenceDir, 'result.json'), JSON.stringify(result, null, 2) + '\n');
  console.log('FLOW_RUNNER_MANAGER_LAYOUT_NATIVE_MACOS_OK=' + JSON.stringify(result));
}
