// Real macOS Calculator flow: deterministic UI -> one model call ->
// deterministic UI. JavaScript arithmetic is used only as an independent
// oracle after both values have been read from Calculator's display.
'use strict';

const CONFIRM = 'authorized-calculator-hybrid';
const CALCULATOR = Object.freeze({
  bundleId: 'com.apple.calculator',
  executablePath: '/System/Applications/Calculator.app/Contents/MacOS/Calculator',
  title: 'Calculator',
});
const ACCESSIBILITY = Object.freeze({timeout: 10000, maxDepth: 12, maxNodes: 2000});
const modelKind = Execution.env.OPENDESK_CALCULATOR_MODEL_KIND;

function assert(condition, message, details) {
  if (!condition) throw new Error(details === undefined ? message : `${message}: ${JSON.stringify(details)}`);
}

function sameWindow(left, right) {
  if (String(left && left.id || '') && String(right && right.id || '')) {
    return String(left.id) === String(right.id);
  }
  return Number(left && left.pid) === Number(right && right.pid)
    && String(left && left.title || '') === String(right && right.title || '');
}

function flatten(node, output = []) {
  if (!node || typeof node !== 'object') return output;
  output.push(node);
  for (const child of Array.isArray(node.children) ? node.children : []) flatten(child, output);
  return output;
}

function comparableTree(node) {
  if (!node || typeof node !== 'object') return null;
  return {
    role: node.role ?? null,
    name: node.name ?? null,
    value: node.value ?? null,
    enabled: node.enabled ?? null,
    focused: node.focused ?? null,
    selected: node.selected ?? null,
    checked: node.checked ?? null,
    children: (Array.isArray(node.children) ? node.children : []).map(comparableTree),
  };
}

function numericDisplay(value) {
  const normalized = String(value === undefined || value === null ? '' : value)
    .replace(/[\u00a0\u202f\s,]/g, '')
    .replace(/\u2212/g, '-');
  return /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(normalized) ? normalized : null;
}

async function requireActiveCalculator(target) {
  const active = await window.getActiveWindow();
  assert(sameWindow(active, target), 'Calculator is no longer the exact active window', {target, active});
  assert(String(active.exePath || '') === CALCULATOR.executablePath, 'active executable is not Calculator', active);
  return active;
}

async function readCalculatorState(target) {
  const active = await requireActiveCalculator(target);
  const snapshot = await Accessibility.snapshot({
    within: active,
    ...ACCESSIBILITY,
    properties: ['role', 'name', 'value', 'enabled', 'focused', 'selected', 'checked'],
  });
  assert(snapshot && snapshot.complete === true && snapshot.truncated === false && snapshot.root,
    'Calculator Accessibility snapshot is incomplete');
  const displays = flatten(snapshot.root)
    .filter((node) => node.role === 'staticText' && numericDisplay(node.value) !== null)
    .map((node) => numericDisplay(node.value));
  assert(displays.length === 1, 'expected exactly one numeric Calculator display', {displays});
  return {
    display: displays[0],
    fingerprint: JSON.stringify(comparableTree(snapshot.root)),
  };
}

async function captureCalculator(target, path) {
  await requireActiveCalculator(target);
  return page.screenshot({target: 'activeWindow', path, returnType: 'object'});
}

async function press(target, name) {
  const active = await requireActiveCalculator(target);
  const ref = await Accessibility.find({role: 'button', name}, {within: active, ...ACCESSIBILITY});
  assert(ref, `Calculator button ${name} was not found`);
  try {
    const state = await Accessibility.read(ref, {
      properties: ['role', 'name', 'enabled', 'actions'],
      timeout: ACCESSIBILITY.timeout,
    });
    const properties = state && state.properties || {};
    assert(properties.role === 'button'
      && properties.name === name
      && properties.enabled === true
      && Array.isArray(properties.actions)
      && properties.actions.includes('invoke'),
    `Calculator button ${name} is not uniquely invokable`, properties);
    const action = await Accessibility.perform(ref, {action: 'invoke'}, {timeout: ACCESSIBILITY.timeout});
    assert(action.actionState === 'acknowledged',
      `Calculator button ${name} was not submitted`, action);
  } finally {
    await Accessibility.release(ref);
  }
  await sleep(80);
}

async function clearCalculator(target) {
  for (const name of ['全部清除', '清除', 'All Clear', 'Clear', 'AC', 'C']) {
    const active = await requireActiveCalculator(target);
    const ref = await Accessibility.find({role: 'button', name}, {within: active, ...ACCESSIBILITY});
    if (!ref) continue;
    await Accessibility.release(ref);
    await press(target, name);
    return;
  }
  throw new Error('Calculator clear button was not found');
}

async function launchCalculator() {
  assert(System.getPlatformInfo().os === 'darwin', 'this example requires macOS');
  const capabilities = Accessibility.getCapabilities();
  assert(capabilities && capabilities.available === true,
    'Accessibility must be enabled and granted for this local execution', capabilities);
  await App.launch({bundleId: CALCULATOR.bundleId}, {
    activate: true,
    waitUntilReady: 'window',
    timeout: 10000,
  });
  const matches = (await window.list()).filter((candidate) =>
    String(candidate.exePath || '') === CALCULATOR.executablePath
      && String(candidate.title || '') === CALCULATOR.title);
  assert(matches.length === 1, 'expected exactly one Calculator window', {count: matches.length});
  const target = matches[0];
  const active = await window.getActiveWindow();
  if (!sameWindow(active, target)) {
    await window.bringToTop(target.title, Number(target.pid));
    await sleep(200);
  }
  await requireActiveCalculator(target);
  return target;
}

async function generateIncrement(baseResult) {
  const output = {
    type: 'json',
    name: 'calculator_increment',
    validation: 'native',
    schema: {
      type: 'object',
      properties: {value: {type: 'integer', minimum: 5, maximum: 15}},
      required: ['value'],
      additionalProperties: false,
    },
  };
  const prompt = `给定计算器真实显示值 ${baseResult}，返回一个 5 到 15 的整数。只决定增量，不执行计算器操作。`;
  if (modelKind === 'llm') return LLM.generate({prompt, output, timeoutMs: 60000});
  if (modelKind === 'agent') return Agent.run({prompt, output, timeoutMs: 120000});
  throw new Error('OPENDESK_CALCULATOR_MODEL_KIND must be llm or agent');
}

assert(Execution.env.OPENDESK_CALCULATOR_HYBRID_CONFIRM === CONFIRM,
  `set OPENDESK_CALCULATOR_HYBRID_CONFIRM=${CONFIRM} to authorize real Calculator input`);
assert(modelKind === 'llm' || modelKind === 'agent',
  'set OPENDESK_CALCULATOR_MODEL_KIND=llm or agent');

const evidenceDir = File.join(
  Execution.workdir,
  '.runtime',
  'tests',
  'llm-agent-calculator',
  Execution.id,
);
File.ensureDir(evidenceDir);

const target = await launchCalculator();
await clearCalculator(target);
await press(target, '2');
await press(target, '5');
await press(target, '×');
await press(target, '4');
await press(target, '=');

const baseState = await readCalculatorState(target);
const baseResult = baseState.display;
const expectedBase = 25 * 4;
assert(Number(baseResult) === expectedBase, 'Calculator base result failed independent oracle', {
  baseResult,
  expectedBase,
});
const baseScreenshot = await captureCalculator(target, File.join(evidenceDir, 'base-result.png'));

// This is the only model/Agent call. The accepted increment is retained and
// never regenerated during the deterministic continuation.
const generated = await generateIncrement(baseResult);
const increment = generated.data.value;
assert(Number.isInteger(increment) && increment >= 5 && increment <= 15,
  'validated model result is outside the business range', generated.data);

// Waiting for the model may have changed focus or Calculator state. Stop
// before any further input unless the original target and display still match.
const resumedState = await readCalculatorState(target);
assert(resumedState.display === baseResult && resumedState.fingerprint === baseState.fingerprint,
  'Calculator state changed while waiting for the model', {
  baseResult,
  resumedBaseResult: resumedState.display,
  accessibilityStateMatches: resumedState.fingerprint === baseState.fingerprint,
});

await press(target, '+');
for (const digit of String(increment)) await press(target, digit);
await press(target, '=');

const finalResult = (await readCalculatorState(target)).display;
const expectedFinal = Number(baseResult) + increment;
assert(Number(finalResult) === expectedFinal, 'Calculator final result failed independent oracle', {
  baseResult,
  increment,
  finalResult,
  expectedFinal,
});
const finalScreenshot = await captureCalculator(target, File.join(evidenceDir, 'final-result.png'));

const evidence = {
  modelKind,
  backend: generated.meta.backend,
  baseResult,
  increment,
  finalResult,
  expectedBase,
  expectedFinal,
  modelMeta: generated.meta,
  screenshots: {
    base: baseScreenshot,
    final: finalScreenshot,
  },
};
const evidencePath = File.join(evidenceDir, 'result.json');
await File.writeJSON(evidencePath, evidence, {spaces: 2, createDirs: true});
console.log(JSON.stringify({...evidence, evidencePath}));
