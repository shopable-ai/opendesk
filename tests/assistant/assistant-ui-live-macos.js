'use strict';

// Explicit macOS acceptance for the official Assistant UI, not a direct
// Calculator capability invocation. Launch the product test instance first,
// then run from the repository root:
// OPENDESK_ASSISTANT_UI_LIVE=authorized \
// OPENDESK_ASSISTANT_APP_PID=<app-mode-opendesk-pid> \
// ./dist/opendesk -script tests/assistant/assistant-ui-live-macos.js -console-mode script

const AUTHORIZATION = 'authorized';
const enabled = Execution.env.OPENDESK_ASSISTANT_UI_LIVE === AUTHORIZATION;
const appPID = Number(Execution.env.OPENDESK_ASSISTANT_APP_PID || '0');
const prompt = '打开计算器，点击 3 5 × 2 + 1 0 - 5 =，读取显示区的真实结果。';
const expectedPreview = '3 5 × 2 + 1 0 - 5 =';
const expectedResult = '75';
const evidencePath = File.join(
  Execution.workdir,
  '.runtime',
  'tests',
  'assistant-ui',
  `assistant-ui-live-${Execution.id}.json`,
);
const report = {
  status: enabled ? 'running' : 'skipped',
  appPID: Number.isInteger(appPID) && appPID > 0 ? appPID : null,
  prompt,
  menu: null,
  beforeConfirmation: null,
  confirmation: null,
  result: null,
  error: null,
};

function assert(condition, message, details) {
  if (!condition) throw new Error(details === undefined ? message : `${message}: ${JSON.stringify(details)}`);
}

function errorDetails(error) {
  return {
    name: String(error && error.name || 'Error'),
    code: error && error.code ? String(error.code) : null,
    operation: error && error.operation ? String(error.operation) : null,
    actionState: error && error.actionState ? String(error.actionState) : null,
    message: String(error && error.message || error),
  };
}

function flatten(node, output = []) {
  if (!node || typeof node !== 'object') return output;
  output.push(node);
  for (const child of Array.isArray(node.children) ? node.children : []) flatten(child, output);
  return output;
}

function numericDisplay(value) {
  const normalized = String(value === undefined || value === null ? '' : value)
    .replace(/[\u00a0\u202f\s,]/g, '')
    .replace(/\u2212/g, '-');
  return /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(normalized) ? normalized : null;
}

async function waitFor(read, predicate, label, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let latest = null;
  while (Date.now() <= deadline) {
    latest = await read();
    if (predicate(latest)) return latest;
    await sleep(250);
  }
  throw new Error(`${label} timed out: ${JSON.stringify(latest)}`);
}

async function openAssistantFromProductMenu(pid) {
  assert(Number.isInteger(pid) && pid > 0, 'OPENDESK_ASSISTANT_APP_PID must be a positive integer');
  const script = [
    'tell application "System Events"',
    `  tell (first process whose unix id is ${pid})`,
    '    click menu bar item 1 of menu bar 1',
    '    delay 0.2',
    '    click menu item "AI 助手" of menu 1 of menu bar item 1 of menu bar 1',
    '  end tell',
    'end tell',
  ].join('\n');
  const result = await Command.run('/usr/bin/osascript', ['-e', script], {
    timeout: 10_000,
    maxOutputBytes: 16 * 1024,
    emitOutput: false,
  });
  assert(result.exitCode === 0, 'native product menu invocation failed', result);
  return {exitCode: result.exitCode, stdout: result.stdout.trim()};
}

async function assistantWindow() {
  const hostPath = File.join(Execution.workdir, 'dist', 'opendesk-ui-host');
  return waitFor(
    async () => (await window.list()).filter(candidate =>
      String(candidate.title || '') === 'OpenDesk · AI 助手'
        && String(candidate.exePath || '') === hostPath),
    candidates => candidates.length === 1,
    'official Assistant window',
    20_000,
  ).then(candidates => candidates[0]);
}

async function assistantSnapshot(target) {
  const snapshot = await Accessibility.snapshot({
    within: target,
    timeout: 10_000,
    maxDepth: 16,
    maxNodes: 3000,
    properties: ['role', 'name', 'value', 'enabled', 'actions'],
  });
  assert(snapshot.complete === true && snapshot.truncated === false && snapshot.root,
    'Assistant Accessibility snapshot is incomplete', {
      complete: snapshot.complete,
      truncated: snapshot.truncated,
      reason: snapshot.reason,
    });
  return snapshot;
}

async function invokeControl(target, name) {
  const ref = await Accessibility.find({role: 'button', name}, {
    within: target,
    timeout: 10_000,
    maxDepth: 16,
    maxNodes: 3000,
  });
  assert(ref, `Assistant control is missing: ${name}`);
  try {
    const details = await Accessibility.read(ref, {properties: ['enabled', 'actions'], timeout: 10_000});
    assert(details.properties.enabled === true, `Assistant control is disabled: ${name}`, details.properties);
    assert(Array.isArray(details.properties.actions) && details.properties.actions.includes('invoke'),
      `Assistant control cannot invoke: ${name}`, details.properties);
    const invoked = await Accessibility.perform(ref, {action: 'invoke'}, {timeout: 10_000});
    assert(invoked.actionState === 'acknowledged', `Assistant control was not acknowledged: ${name}`, invoked);
    return {name, actionState: invoked.actionState};
  } finally {
    await Accessibility.release(ref);
  }
}

async function setPrompt(target, value) {
  const ref = await Accessibility.find({role: 'textField', name: '聊天消息'}, {
    within: target,
    timeout: 10_000,
    maxDepth: 16,
    maxNodes: 3000,
  });
  assert(ref, 'Assistant message input is missing');
  try {
    const written = await Accessibility.perform(ref, {action: 'setValue', value}, {timeout: 10_000});
    assert(written.actionState === 'acknowledged', 'Assistant message input was not acknowledged', written);
    const readback = await Accessibility.read(ref, {properties: ['value'], timeout: 10_000});
    assert(readback.properties.value === value, 'Assistant message input did not round-trip', readback.properties);
  } finally {
    await Accessibility.release(ref);
  }
}

async function conversationTitle(target) {
  const ref = await Accessibility.find({role: 'textField', name: '对话标题'}, {
    within: target,
    timeout: 10_000,
    maxDepth: 16,
    maxNodes: 3000,
  });
  assert(ref, 'Assistant conversation title is missing');
  try {
    const readback = await Accessibility.read(ref, {properties: ['value'], timeout: 10_000});
    return String(readback.properties.value || '');
  } finally {
    await Accessibility.release(ref);
  }
}

async function calculatorDisplay() {
  const target = await window.get({
    title: 'Calculator',
    exePath: '/System/Applications/Calculator.app/Contents/MacOS/Calculator',
  });
  assert(Number(target.width) === 232 && Number(target.height) === 321,
    'Calculator is not in the qualified Basic layout', target);
  const snapshot = await Accessibility.snapshot({
    within: target,
    timeout: 10_000,
    maxDepth: 12,
    maxNodes: 2000,
    properties: ['role', 'value'],
  });
  assert(snapshot.complete === true && snapshot.truncated === false && snapshot.root,
    'Calculator display snapshot is incomplete');
  const displays = flatten(snapshot.root)
    .filter(node => node.role === 'staticText' && numericDisplay(node.value) !== null)
    .map(node => numericDisplay(node.value));
  assert(displays.length === 1, 'Calculator display is ambiguous', {displays});
  return displays[0];
}

if (!enabled) {
  console.log('ASSISTANT_UI_LIVE=' + JSON.stringify(report));
} else {
  try {
    assert(Command.getCapabilities().enabled === true, 'Command capability is required for native status-menu entry');
    const ax = Accessibility.getCapabilities();
    assert(ax.hostAuthorization.enabled && ax.implementation.available && ax.permission.granted,
      'Accessibility is unavailable for Assistant UI acceptance', ax);

    report.menu = await openAssistantFromProductMenu(appPID);
    const target = await assistantWindow();
    await invokeControl(target, '新建对话');
    const displayBefore = await calculatorDisplay();
    await setPrompt(target, prompt);
    await invokeControl(target, '发送消息');

    const preview = await waitFor(
      () => assistantSnapshot(target),
      snapshot => {
        return flatten(snapshot.root).some(node => node.role === 'button'
          && node.name === '确认执行' && node.enabled === true);
      },
      'trusted preview and confirmation',
      120_000,
    );
    const displayBeforeConfirmation = await calculatorDisplay();
    assert(displayBeforeConfirmation === displayBefore,
      'Calculator changed before the user confirmed the frozen preview', {
        before: displayBefore,
        beforeConfirmation: displayBeforeConfirmation,
      });
    report.beforeConfirmation = {
      calculatorDisplay: displayBeforeConfirmation,
      expectedPreview,
      confirmationControlEnabled: flatten(preview.root).some(node => node.role === 'button'
        && node.name === '确认执行' && node.enabled === true),
    };

    report.confirmation = await invokeControl(target, '确认执行');
    const completed = await waitFor(
      calculatorDisplay,
      display => display === expectedResult,
      'Calculator actual result after Assistant confirmation',
      45_000,
    );
    const title = await conversationTitle(target);
    report.result = {
      calculatorDisplay: completed,
      conversationTitle: title,
    };
    assert(title && prompt.startsWith(title.replace(/…$/, '')),
      'Assistant result is no longer associated with the submitted conversation', {title});
    report.status = 'passed';
  } catch (error) {
    report.status = 'failed';
    report.error = errorDetails(error);
    throw error;
  } finally {
    await File.writeJSON(evidencePath, report, {spaces: 2, createDirs: true});
    console.log('ASSISTANT_UI_LIVE=' + JSON.stringify(report));
  }
}
