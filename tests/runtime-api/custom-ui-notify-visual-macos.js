// Focused macOS live/visual regression for notification sizing and lifecycle.
// Exactly three external screenshots are requested: compact timed, bounded long,
// and persistent manual-close. Other behavior is asserted from native state.
//
// From the repository root:
// OPENDESK_CUSTOM_UI_NOTIFY_VISUAL=authorized-native-ui-visual \
// OPENDESK_CUSTOM_UI_NOTIFY_VISUAL_RUN=<unique-run-name> \
// ./dist/opendesk -ui -script tests/runtime-api/custom-ui-notify-visual-macos.js -console-mode script
'use strict';

const CONFIRM = 'authorized-native-ui-visual';
const token = String(Execution.env.OPENDESK_CUSTOM_UI_NOTIFY_VISUAL_RUN || '');
if (Execution.env.OPENDESK_CUSTOM_UI_NOTIFY_VISUAL !== CONFIRM || !/^[a-zA-Z0-9._-]+$/.test(token)) {
  throw new Error('visual acceptance requires explicit confirmation and a safe run token');
}
if (System.getPlatformInfo().os !== 'darwin') throw new Error('visual acceptance requires macOS');
const capabilities = ui.getCapabilities();
if (!capabilities.enabled || !capabilities.available || !capabilities.window.notify) {
  throw new Error('matching enabled native notification host is required');
}

const runDir = File.join(Execution.workdir, '.runtime', 'tests', 'custom-ui-notify', token);
const checkpointFile = File.join(runDir, 'current.json');
const ackDir = File.join(runDir, 'acks');
const screenshotsDir = File.join(runDir, 'screenshots');
await File.ensureDir(ackDir);
await File.ensureDir(screenshotsDir);

const result = {
  schemaVersion: 2,
  kind: 'custom-ui-notify-macos-focused-visual',
  passed: false,
  executionId: Execution.id,
  startedAt: new Date().toISOString(),
  runDir,
  capabilities,
  checkpoints: [],
  focusStable: true,
  compactTimed: false,
  boundedLong: false,
  sameHandleUpdate: false,
  persistentClose: false,
  defaultExpiry: false,
  cleanup: false,
  error: null,
};
const liveHandles = new Set();
let checkpointIndex = 0;

function identity(value) {
  return {
    id: String(value && value.id || ''),
    pid: Number(value && (value.pid || value.processID) || 0),
    title: String(value && value.title || ''),
    exePath: String(value && value.exePath || ''),
  };
}

function sameIdentity(left, right) {
  if (left.id && right.id) return left.id === right.id;
  return left.pid === right.pid && left.title === right.title && left.exePath === right.exePath;
}

async function waitFor(predicate, message, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await sleep(40);
  }
  throw new Error(message);
}

const baselineActive = identity(await window.getActiveWindow());

async function checkpoint(name, hint, extra = {}) {
  const state = await hint.getState();
  const active = identity(await window.getActiveWindow());
  if (!sameIdentity(active, baselineActive)) result.focusStable = false;
  const index = ++checkpointIndex;
  const ack = File.join(ackDir, String(index) + '.ack');
  const item = {
    index,
    name,
    screenshot: File.join(screenshotsDir, String(index).padStart(2, '0') + '-' + name + '.png'),
    notification: state,
    active,
    extra,
  };
  result.checkpoints.push(item);
  await File.writeJSON(checkpointFile, item);
  await waitFor(() => File.exists(ack), 'external screenshot acknowledgement timed out: ' + name, 30000);
  if (!sameIdentity(identity(await window.getActiveWindow()), baselineActive)) result.focusStable = false;
  return state;
}

async function create(options) {
  const hint = await ui.notify(options);
  liveHandles.add(hint);
  return hint;
}

async function close(hint) {
  const state = await hint.close();
  liveHandles.delete(hint);
  return state;
}

try {
  const compact = await create({
    message: '处理完成',
    timeoutMs: 10000,
    closable: false,
    position: {mode: 'anchor', horizontal: 'center', vertical: 'center', margin: 24, display: 'active'},
  });
  const compactState = await checkpoint('short-timed', compact);
  result.compactTimed = compactState.bounds.width === 280
    && compactState.bounds.height === 52
    && compactState.notification.timeoutMs === 10000
    && compactState.notification.closable === false;
  if (!result.compactTimed) throw new Error('short timed notification is not compact and passive');
  await close(compact);

  const persistent = await create({
    message: '这是一条较长的中文状态提示，用于验证主文按原生字体受控换行；内容继续增长时只保留有限行数并在尾部截断，不会把窗口异常拉宽。',
    caption: '补充说明同样允许有限换行；完整 message 与 caption 仍保留在 getState() 中，视觉表面只承担紧凑、可退出的运行状态。',
    level: 'info',
    timeoutMs: 0,
    closable: false,
    progress: {min: 0, max: 3, value: 1},
    position: {mode: 'anchor', horizontal: 'center', vertical: 'center', margin: 24, display: 'active'},
  });
  const longState = await checkpoint('long-bounded', persistent);
  result.boundedLong = longState.bounds.width === 480
    && longState.bounds.height > compactState.bounds.height
    && longState.bounds.height <= 124
    && longState.notification.closable === true;
  if (!result.boundedLong) throw new Error('long persistent notification is not bounded or closable');

  const updated = await persistent.update({
    message: '长任务仍在运行',
    caption: '可随时关闭此提示；任务本身不会取消。',
    level: 'warning',
    progress: {min: 0, max: 3, value: 2},
  });
  const closeState = await checkpoint('persistent-close', persistent, {
    sameNativeWindow: updated.state.nativeWindowId === longState.nativeWindowId,
  });
  result.sameHandleUpdate = updated.applied
    && updated.state.nativeWindowId === longState.nativeWindowId
    && closeState.bounds.width === 280
    && closeState.bounds.width < longState.bounds.width
    && closeState.bounds.height >= 52
    && closeState.bounds.height <= longState.bounds.height;
  if (!result.sameHandleUpdate) throw new Error('same-handle update did not reflow in place');
  await mouse.click(closeState.bounds.x + closeState.bounds.width - 18, closeState.bounds.y + 18);
  const persistentEnd = await persistent.waitUntilClosed();
  liveHandles.delete(persistent);
  const late = await persistent.update({message: '不得重新出现'});
  result.persistentClose = persistentEnd.status === 'closed'
    && persistentEnd.notification.closeReason === 'user'
    && late.applied === false
    && late.reason === 'closed';
  if (!result.persistentClose) throw new Error('persistent manual close or harmless late update failed');

  const ordinary = await create({message: '默认自动关闭检查'});
  const ordinaryState = await ordinary.getState();
  const ordinaryEnd = await ordinary.waitUntilClosed();
  liveHandles.delete(ordinary);
  result.defaultExpiry = ordinaryState.notification.timeoutMs === 3000
    && ordinaryState.notification.closable === false
    && ordinaryEnd.notification.closeReason === 'timeout';
  if (!result.defaultExpiry) throw new Error('ordinary notification did not use the default timeout');

  result.cleanup = liveHandles.size === 0;
  result.passed = result.focusStable && result.compactTimed && result.boundedLong
    && result.sameHandleUpdate && result.persistentClose && result.defaultExpiry && result.cleanup;
  result.completedAt = new Date().toISOString();
  await File.writeJSON(File.join(runDir, 'result.json'), result);
  console.log('CUSTOM_UI_NOTIFY_VISUAL_PASS=' + runDir);
} catch (error) {
  result.error = {
    name: String(error && error.name || 'Error'),
    code: error && error.code ? String(error.code) : null,
    message: String(error && error.message || error),
  };
  result.completedAt = new Date().toISOString();
  await File.writeJSON(File.join(runDir, 'result.json'), result);
  throw error;
} finally {
  for (const hint of liveHandles) {
    try { await hint.close(); } catch (_) { /* best-effort cleanup after recorded failure */ }
  }
}
