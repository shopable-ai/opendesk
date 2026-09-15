// Explicit LIVE gate. Not included in ordinary CI and not a simulated pass.
// Reuses the maintained Calculator-115 gate's window/display observation helpers.
// Run from repo root, on the already-qualified basic Calculator layout:
// OPENDESK_CALCULATOR_GENERATION_CONFIRM=authorized-calculator-fixture ./dist/opendesk -allow-recorder-capture -script tests/runtime-api/recorder-generation-calculator-macos.js -console-mode script
'use strict';
const CALCULATOR = Object.freeze({
  bundleId: 'com.apple.calculator',
  executablePath: '/System/Applications/Calculator.app/Contents/MacOS/Calculator',
  title: 'Calculator', width: 232, height: 321,
});
const CLEAR_NAMES = new Set(['全部清除', '清除', 'All Clear', 'Clear', 'AC', 'C']);
const ACCESSIBILITY_OPTIONS = Object.freeze({timeout: 10000, maxDepth: 12, maxNodes: 2000});
function fail(message, details) {
  throw new Error(details === undefined ? message : `${message}: ${JSON.stringify(details)}`);
}

function assert(condition, message, details) {
  if (!condition) fail(message, details);
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

function sameWindow(left, right) {
  if (String(left.id || '') && String(right.id || '')) {
    return String(left.id) === String(right.id);
  }
  return Number(left.pid) === Number(right.pid)
    && String(left.title || '') === String(right.title || '');
}

function errorDetails(error) {
  return {
    name: String(error && error.name || 'Error'),
    message: String(error && error.message || error),
    code: error && error.code ? String(error.code) : null,
    operation: error && error.operation ? String(error.operation) : null,
    actionState: error && error.actionState ? String(error.actionState) : null,
  };
}

async function requireActiveCalculator(target) {
  const active = await window.getActiveWindow();
  assert(sameWindow(active, target), 'Calculator is no longer the exact active window', {target, active});
  assert(String(active.exePath || '') === CALCULATOR.executablePath,
    'active executable is not the system Calculator', active);
  assert(Number(active.width) === CALCULATOR.width && Number(active.height) === CALCULATOR.height,
    'Calculator layout changed during qualification', active);
  return active;
}

async function refreshCalculatorTarget() {
  const active = await window.getActiveWindow();
  return requireActiveCalculator(active);
}

async function resolveCalculator() {
  const platform = System.getPlatformInfo();
  assert(platform && platform.os === 'darwin', 'this qualification requires macOS', platform);

  const capabilities = Accessibility.getCapabilities();
  assert(capabilities.hostAuthorization && capabilities.hostAuthorization.enabled === true,
    'Accessibility is disabled for this execution', capabilities);
  assert(capabilities.implementation && capabilities.implementation.available === true,
    'native Accessibility is unavailable', capabilities);
  assert(capabilities.permission && capabilities.permission.granted === true,
    'native Accessibility permission is not granted', capabilities);

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
  assert(Number(target.width) === CALCULATOR.width && Number(target.height) === CALCULATOR.height,
    'Calculator does not use the qualified layout', target);

  const active = await window.getActiveWindow();
  if (!sameWindow(active, target)) {
    await window.bringToTop(target.title, Number(target.pid));
    await sleep(200);
  }
  await requireActiveCalculator(target);
  return target;
}

async function readDisplay(target) {
  const active = await requireActiveCalculator(target);
  const snapshot = await Accessibility.snapshot({
    within: active,
    ...ACCESSIBILITY_OPTIONS,
    properties: ['role', 'value'],
  });
  assert(snapshot && snapshot.complete === true && snapshot.truncated === false && snapshot.root,
    'Calculator Accessibility snapshot is incomplete', snapshot && {
      complete: snapshot.complete,
      truncated: snapshot.truncated,
      reason: snapshot.reason,
    });
  const displays = flatten(snapshot.root)
    .filter((node) => node.role === 'staticText' && numericDisplay(node.value) !== null)
    .map((node) => numericDisplay(node.value));
  assert(displays.length === 1, 'expected exactly one numeric Calculator display', {displays});
  return displays[0];
}

async function waitForDisplay(target, expected, timeoutMs = 3000) {
  const deadline = Date.now() + timeoutMs;
  let actual = null;
  while (Date.now() < deadline) {
    actual = await readDisplay(target);
    if (actual === expected) return actual;
    await sleep(50);
  }
  fail('Calculator display transition failed', {expected, actual});
}


async function clearCurrentCalculator(target) {
  // C/AC are live states, not an implicit clear inside tapTexts. The approved
  // fixture setup explicitly performs two clear activations and observes zero.
  for (let index = 0; index < 2; index += 1) {
    const active = await requireActiveCalculator(target);
    const snapshot = await Accessibility.snapshot({within: active, ...ACCESSIBILITY_OPTIONS,
      properties: ['role', 'name', 'identifier', 'enabled', 'actions']});
    assert(snapshot.complete === true && snapshot.truncated === false && snapshot.root, 'clear observation incomplete');
    const matches = flatten(snapshot.root).filter(node => node.role === 'button' && CLEAR_NAMES.has(node.name)
      && node.enabled === true && Array.isArray(node.actions) && node.actions.includes('invoke'));
    assert(matches.length === 1, 'clear control is not uniquely identified');
    const selector = {role: 'button', name: matches[0].name};
    if (matches[0].identifier) selector.identifier = matches[0].identifier;
    await UI.tapTargets([selector], {within: active});
  }
  await waitForDisplay(target, '0');
  return refreshCalculatorTarget();
}

async function preflightTexts(target, texts) {
  const snapshot = await Accessibility.snapshot({within: await requireActiveCalculator(target),
    ...ACCESSIBILITY_OPTIONS, properties: ['role', 'name', 'enabled', 'actions']});
  assert(snapshot.complete === true && snapshot.truncated === false && snapshot.root, 'target preflight incomplete');
  const nodes = flatten(snapshot.root);
  for (const text of [...new Set(texts)]) {
    const matches = nodes.filter(node => node.name === text && node.enabled === true
      && Array.isArray(node.actions) && node.actions.includes('invoke'));
    assert(matches.length === 1, 'target preflight did not establish unique native support', {text, count: matches.length});
  }
  await readDisplay(target);
}

async function buttonPoint(target, name) {
  const active = await requireActiveCalculator(target);
  const snapshot = await Accessibility.snapshot({within: active, ...ACCESSIBILITY_OPTIONS,
    properties: ['role', 'name', 'enabled', 'actions', 'nativeBounds']});
  assert(snapshot.complete === true && snapshot.truncated === false && snapshot.root,
    'Calculator button observation is incomplete');
  const matches = flatten(snapshot.root).filter(node => node.role === 'button' && node.name === name
    && node.enabled === true && Array.isArray(node.actions) && node.actions.includes('invoke'));
  assert(matches.length === 1, 'Calculator button is not uniquely invokable for recording', {name, count: matches.length});
  const bounds = matches[0].nativeBounds;
  assert(bounds && [bounds.x, bounds.y, bounds.width, bounds.height].every(Number.isFinite)
    && bounds.width > 0 && bounds.height > 0, 'Calculator button has invalid native bounds', {name, bounds});
  return {x: Math.round(bounds.x + bounds.width / 2), y: Math.round(bounds.y + bounds.height / 2)};
}

async function waitForAccepted(session, minimum) {
  const deadline = Date.now() + 3000;
  let status = session.status();
  while (Date.now() < deadline) {
    status = session.status();
    if (Number(status.counts && status.counts.accepted) >= minimum) return status;
    await sleep(25);
  }
  fail('Recorder did not accept the expected Calculator pointer actions', status);
}

async function recordCalculatorTargetSemantics(target, labels, expectedDisplay) {
  const recorderCapabilities = Recorder.getCapabilities();
  assert(recorderCapabilities.capture && recorderCapabilities.capture.available === true,
    'Recorder capture is unavailable for the explicitly authorized live fixture', recorderCapabilities.capture);
  let session = null;
  try {
    const scope = {processId: Number(target.pid || target.processID), title: String(target.title || '')};
    assert(Number.isInteger(scope.processId) && scope.processId > 0 && scope.title,
      'Calculator recording scope is incomplete', {target, scope});
    session = await Recorder.start({within: scope, captureKeyboard: false, evidence: 'target-semantics', maxDurationMs: 60000});
    for (let index = 0; index < labels.length; index += 1) {
      const point = await buttonPoint(target, labels[index]);
      await mouse.click(point.x, point.y, {button: 'left', clickCount: 1, delay: 30});
      await waitForAccepted(session, (index + 1) * 3);
    }
    // Target snapshots are post-event correlated. Observe the actual first
    // result before closing the session so the last accepted pointer context
    // can finish its bounded Accessibility probe; this is not a replay retry.
    await waitForDisplay(target, expectedDisplay);
    const saved = await session.stop();
    session = null;
    const built = await Recorder.buildActions(saved.recordingDir);
    const actions = await File.readJSON(built.actionsFile);
    const manifest = await File.readJSON(saved.manifestFile);
    assert(built.readiness === 'ready' && actions.actions.length === labels.length,
      'Recorder did not build the exact target-semantics click sequence', {built, actions: actions.actions});
    assert(manifest.capture && manifest.capture.evidence === 'target-semantics',
      'live recording did not use target-semantics evidence', manifest.capture);
    assert(actions.actions.every((action, index) => action.kind === 'click'
      && action.strategy === 'mouse.click' && action.target && action.target.semanticStatus === 'verified'
      && action.target.element && action.target.element.source === 'accessibility'
      && action.target.element.role === 'button' && action.target.element.name === labels[index]
      && action.target.element.enabled === true && action.target.element.nativeActions.includes('AXPress')
      && !Object.prototype.hasOwnProperty.call(action.target.element, 'children')),
    'actions must retain only target-level Accessibility snapshots, never an OCR observation or full UI tree', actions.actions);
    assert(!JSON.stringify(actions).toLowerCase().includes('ocr'),
      'target-semantics actions must not claim OCR evidence');
    return {saved, built, actions};
  } finally {
    if (session) {
      try { await session.stop(); } catch (error) { console.error('Recorder cleanup failed:', error && error.message || String(error)); }
    }
  }
}

async function captureEvidence(target, name) {
  await requireActiveCalculator(target);
  return page.screenshot({
    target: 'activeWindow',
    path: File.join(runDir, name),
    returnType: 'path',
  });
}

const runDir = File.join(File.cwd(), '.runtime', 'tests', 'recorder-generation-calculator', Execution.id);
const result = {generated: 'not-run', generatedRecipeExecution: 'not-run', business: 'not-run',
  firstResult: null, finalResult: null, executionId: Execution.id, live: true};
File.ensureDir(runDir);
try {
  assert(Execution.env.OPENDESK_CALCULATOR_GENERATION_CONFIRM === 'authorized-calculator-fixture',
    'explicit Calculator fixture consent is required before desktop input');
  const labels = ['2', '5', '×', '4', '+', '1', '0', '='];
  let target = await resolveCalculator();
  await preflightTexts(target, ['0','1','2','3','4','5','6','7','8','9','×','+','=']);
  target = await clearCurrentCalculator(target);
  const recorded = await recordCalculatorTargetSemantics(target, labels, '110');
  const source = recorded.actions;
  assert(source.actions.every(action => action.target.window && action.target.window.title === CALCULATOR.title
    && action.target.window.application.identityKind === 'executable-path'
    && action.target.window.application.identityValue === CALCULATOR.executablePath),
  'saved recording must retain the exact Calculator window provenance');
  // The native owner independently verifies raw/manifest/actions lineage.
  const generated = await Recorder.generateScript(recorded.built.actionsFile, {mode: 'semantic', outputFile: 'qualification-' + Execution.id + '.recipe.js'});
  result.generated = 'passed'; result.candidate = generated;
  const recipeSource = File.read(generated.scriptFile);
  assert(recipeSource.includes('UI.tapTexts(') && !recipeSource.includes('mouse.'), 'generator did not select text activation');
  target = await clearCurrentCalculator(target);
  // Execute ordinary generated JS. Do not turn actions.json into a replay interpreter.
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  await new AsyncFunction(recipeSource)();
  result.generatedActual = await waitForDisplay(target, '110');
  target = await refreshCalculatorTarget();
  result.generatedScreenshot = await captureEvidence(target, '01-generated-first-result.png');
  result.generatedRecipeExecution = 'passed';
  target = await clearCurrentCalculator(target);
  result.firstActions = await UI.tapTexts(['2','5','×','4','+','1','0','='], {within: target});
  result.firstResult = await waitForDisplay(target, '110'); // actual display, expected only as oracle
  target = await refreshCalculatorTarget();
  result.firstResultScreenshot = await captureEvidence(target, '02-first-result.png');
  assert(/^\d+$/.test(result.firstResult), 'firstResult is not a supported digit string');
  target = await clearCurrentCalculator(target);
  const secondInputs = ['6','×',...result.firstResult,'=']; // dataflow from actual UI, never expected
  result.secondActions = await UI.tapTexts(secondInputs, {within: target});
  result.finalResult = await waitForDisplay(target, '660');
  result.finalResultScreenshot = await captureEvidence(target, '03-final-result.png');
  result.business = 'passed';
  console.log(JSON.stringify({firstResult: result.firstResult, finalResult: result.finalResult}));
} catch (error) {
  result.error = errorDetails(error);
  if (error && error.resolution) result.resolution = error.resolution;
  if (error && error.completed) result.completed = error.completed;
  throw error;
} finally {
  await File.writeJSON(File.join(runDir, 'result.json'), result);
}
