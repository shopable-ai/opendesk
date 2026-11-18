// macOS Calculator Agent-to-Recipe example.
//
// Run from the OpenDesk repository root after granting Screen Recording and
// Accessibility. Native input and the final Display oracle do not use OCR:
//   ./dist/opendesk ai run examples/ai-cli/macos-calculator-recipe.js --input '{"expression":"16*3","expected":"48"}'
//
// The text-locator acceptance case resolves canonical `*` to one qualified
// native Calculator name (or the verified OCR glyph), then reads real Display:
//   ./dist/opendesk ai run examples/ai-cli/macos-calculator-recipe.js --input '{"expression":"12*3","expected":"36"}'
//
// A dependent follow-up uses the first verified Calculator Display result:
//   ./dist/opendesk ai run examples/ai-cli/macos-calculator-recipe.js --input '{"expression":"125*8","expected":"1000","followUp":{"expression":"{result}/4+37","expected":"287"}}'
//
// Native input/read targets must qualify from a complete exact-window semantic
// snapshot; they do not consume the old visual key-point/Display-ROI template.
// Only explicit OCR fallback retains the previously verified 232x321 geometry.
// Changed candidate/platform scope requires fresh independent qualification.

const CALCULATOR_BUNDLE_ID = 'com.apple.calculator';

const CALCULATOR_LAYOUT = Object.freeze({
  name: 'macOS Calculator Standard/Basic 232x321',
  safeSize: Object.freeze({ width: 232, height: 321, tolerance: 2 }),
  displayRegion: Object.freeze({ x: 0.03, y: 0.09, width: 0.94, height: 0.16 }),
  // Geometry.regionPercent uses percentages in [0, 100]. This verified rule
  // excludes the display and is re-projected from the current window before
  // every OCR observation instead of caching a screen-coordinate rectangle.
  keypadRegion: Object.freeze({ left: 0, top: 25.2, width: 100, height: 74.8 }),
  // A slightly expanded first keypad cell gives Apple Vision enough context
  // to distinguish the visible C / AC state without including the Display.
  clearRegion: Object.freeze({ left: 0, top: 25.2, width: 31, height: 21.2 }),
  // These are verified layout rules, not cached screen coordinates. Every
  // action re-projects the relevant point from the current WindowInfo.
  keyPoints: Object.freeze({
    clear: Object.freeze({ x: 12.1, y: 32.7 }),
    '/': Object.freeze({ x: 87.1, y: 32.7 }),
    '7': Object.freeze({ x: 12.1, y: 47.4 }),
    '8': Object.freeze({ x: 36.6, y: 47.4 }),
    '9': Object.freeze({ x: 61.6, y: 47.4 }),
    '*': Object.freeze({ x: 87.1, y: 47.4 }),
    '4': Object.freeze({ x: 12.1, y: 62.3 }),
    '5': Object.freeze({ x: 36.6, y: 62.3 }),
    '6': Object.freeze({ x: 61.6, y: 62.3 }),
    '-': Object.freeze({ x: 87.1, y: 62.3 }),
    '1': Object.freeze({ x: 12.1, y: 77.3 }),
    '2': Object.freeze({ x: 36.6, y: 77.3 }),
    '3': Object.freeze({ x: 61.6, y: 77.3 }),
    '+': Object.freeze({ x: 87.1, y: 77.3 }),
    '0': Object.freeze({ x: 24.5, y: 92.5 }),
    '.': Object.freeze({ x: 61.6, y: 92.5 }),
    '=': Object.freeze({ x: 87.1, y: 92.5 }),
  }),
});

const CALCULATOR_BUTTON_TEXT = Object.freeze({
  '/': '÷',
  '*': '×',
  '-': '−',
  '+': '+',
  '.': '.',
  '=': '=',
});

// Exact native names observed in complete Calculator snapshots. Visual OCR
// continues to use CALCULATOR_BUTTON_TEXT alone; aliases are never rewritten.
const CALCULATOR_SEMANTIC_OPERATOR_NAMES = Object.freeze({
  '/': Object.freeze(['÷', '除']),
  '*': Object.freeze(['×', '乘']),
  '-': Object.freeze(['−', '减']),
  '+': Object.freeze(['+', '加']),
  '.': Object.freeze(['.', '点']),
  '=': Object.freeze(['=', '等于']),
});

function calculatorSemanticButtonNames(canonicalKey) {
  return CALCULATOR_SEMANTIC_OPERATOR_NAMES[canonicalKey] || [calculatorButtonText(canonicalKey)];
}

const CALCULATOR_TEXT_LOCATOR_PROFILES = Object.freeze([
  Object.freeze({ provider: 'apple', lang: 'ch', minConfidence: 0.5 }),
  Object.freeze({ provider: 'paddle', lang: 'en', minConfidence: 0.5 }),
  Object.freeze({ provider: 'local', lang: 'en', minConfidence: 0.5 }),
]);

const CALCULATOR_ACCESSIBILITY_PROFILE = Object.freeze({
  backend: 'accessibility-snapshot+UI.tapTargets',
  role: 'button',
  match: 'exact',
  maxDepth: 16, // Complete current StandardInputView subtree observed at depth 6.
  maxNodes: 100,
  timeoutMs: 15000,
  displayNames: Object.freeze(['主显示器']), // Also accepts the observed StandardInputView subtree below.
});

const CALCULATOR_ACCESSIBILITY_CLEAR_STATES = Object.freeze({
  entryClear: Object.freeze(['清除', 'Clear', 'C']),
  allClear: Object.freeze(['全部清除', 'All Clear', 'AC']),
});

const DISPLAY_READY_TIMEOUT_MS = 30000;
const DISPLAY_POLLING_MS = 100;
const FAILURE_EVIDENCE_TIMEOUT_MS = 5000;

let calculatorRun = null;
let resultDocument = null;

function errorMessage(error) {
  return String(error && error.message ? error.message : error);
}

function errorEvidence(error) {
  if (!error) return null;
  const evidence = {
    code: String(error.code || 'ERROR'),
    operation: error.operation ? String(error.operation) : null,
    message: errorMessage(error),
  };
  if (error.stage) evidence.stage = String(error.stage);
  if (Number.isInteger(error.candidateCount)) evidence.candidateCount = error.candidateCount;
  if (Array.isArray(error.candidates)) evidence.candidates = error.candidates;
  if (error.expected !== undefined) evidence.expected = error.expected;
  if (error.actual !== undefined) evidence.actual = error.actual;
  if (Number.isFinite(error.timeoutMs)) evidence.timeoutMs = error.timeoutMs;
  if (error.backend) evidence.backend = String(error.backend);
  if (error.phase) evidence.phase = String(error.phase);
  if (error.requestId) evidence.requestId = String(error.requestId);
  if (error.actionState) evidence.actionState = String(error.actionState);
  if (Array.isArray(error.attempts)) evidence.attempts = error.attempts;
  if (Array.isArray(error.observations)) evidence.observations = error.observations;
  if (Array.isArray(error.resultPersistenceErrors)) evidence.resultPersistenceErrors = error.resultPersistenceErrors;
  if (error.sidecarPersistenceError) evidence.sidecarPersistenceError = error.sidecarPersistenceError;
  if (error.cause && error.cause !== error) evidence.cause = errorEvidence(error.cause);
  return evidence;
}

function calculatorError(code, operation, message, details) {
  const error = new Error(message);
  error.code = code;
  error.operation = operation;
  if (details && typeof details === 'object') Object.assign(error, details);
  return error;
}

function compactBounds(info) {
  return {
    x: Number(info.x),
    y: Number(info.y),
    width: Number(info.width),
    height: Number(info.height),
  };
}

function withinTolerance(actual, expected, tolerance) {
  return Math.abs(Number(actual) - Number(expected)) <= tolerance;
}

async function writeResultDocument() {
  if (!resultDocument || !Execution.artifactDir) return;
  await File.writeJSON(
    File.join(Execution.artifactDir, 'calculator-result.json'),
    resultDocument,
    { spaces: 2, createDirs: true },
  );
}

async function tryWriteResultDocument() {
  try {
    await writeResultDocument();
    return null;
  } catch (error) {
    return errorEvidence(error);
  }
}

function validateInput(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('Execution.input must be a JSON object');
  }
  if (typeof input.expression !== 'string' || input.expression.trim() === '') {
    throw new Error('Execution.input.expression must be a non-empty string');
  }
  tokenizeCalculatorExpression(input.expression);
  if (!['string', 'number'].includes(typeof input.expected)) {
    throw new Error('Execution.input.expected must be a string or number');
  }
  normalizeExpected(input.expected);
  if (input.visualFallback !== undefined && input.visualFallback !== 'ocr') {
    throw new Error('Execution.input.visualFallback, when provided, must equal "ocr"');
  }
  if (input.followUp !== undefined) {
    const followUp = input.followUp;
    if (!followUp || typeof followUp !== 'object' || Array.isArray(followUp)) {
      throw new Error('Execution.input.followUp must be an object when provided');
    }
    if (typeof followUp.expression !== 'string' || followUp.expression.trim() === '') {
      throw new Error('Execution.input.followUp.expression must be a non-empty string');
    }
    if (!followUp.expression.includes('{result}')) {
      throw new Error('followUp.expression must contain {result}');
    }
    substituteFirstResult(followUp.expression, normalizeExpected(input.expected));
    if (!['string', 'number'].includes(typeof followUp.expected)) {
      throw new Error('Execution.input.followUp.expected must be a string or number');
    }
    normalizeExpected(followUp.expected);
  }
  return input;
}

function tokenizeCalculatorExpression(expression) {
  const compact = String(expression).replace(/\s+/g, '');
  if (compact === '') throw new Error('Calculator expression must not be empty');
  if (/[^0-9.+\-*/=]/.test(compact)) {
    throw new Error(`Unsupported Calculator expression character in ${JSON.stringify(expression)}`);
  }
  const equalsCount = (compact.match(/=/g) || []).length;
  if (equalsCount > 1 || (equalsCount === 1 && !compact.endsWith('='))) {
    throw new Error('Calculator expression may contain one optional trailing equals sign');
  }
  const body = compact.endsWith('=') ? compact.slice(0, -1) : compact;
  if (body === '') throw new Error('Calculator expression must contain an operand');
  const parts = body.split(/([+\-*/])/);
  if (parts.length % 2 === 0) throw new Error('Calculator expression has a missing operand');
  for (let index = 0; index < parts.length; index += 1) {
    const part = parts[index];
    if (index % 2 === 1) {
      if (!/^[+\-*/]$/.test(part)) throw new Error(`Invalid operator ${JSON.stringify(part)}`);
    } else if (!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(part)) {
      throw new Error(`Invalid numeric operand ${JSON.stringify(part)}`);
    }
  }
  return body.split('').concat('=');
}

function calculatorButtonText(key) {
  if (/^[0-9]$/.test(key)) return key;
  const text = CALCULATOR_BUTTON_TEXT[key];
  if (!text) throw new Error(`Unsupported canonical Calculator key: ${JSON.stringify(key)}`);
  return text;
}

function calculatorInputSequence(expression) {
  const canonicalKeys = Object.freeze(tokenizeCalculatorExpression(expression).slice());
  const visibleTexts = Object.freeze(canonicalKeys.map(calculatorButtonText));
  return { canonicalKeys, visibleTexts };
}

async function resolveCalculatorWindow() {
  const application = await App.launch(
    { bundleId: CALCULATOR_BUNDLE_ID },
    { waitUntilReady: 'window', timeout: 15000 },
  );
  if (application.bundleId !== CALCULATOR_BUNDLE_ID || !Array.isArray(application.pids) || application.pids.length === 0) {
    throw new Error('App.launch did not resolve the Calculator bundle/PID group');
  }
  const pids = new Set(application.pids.map(Number));
  const matches = [];
  for (const pid of pids) matches.push(...await window.list({ pid }));
  if (matches.length !== 1) {
    throw calculatorError(
      matches.length === 0 ? 'TARGET_NOT_FOUND' : 'AMBIGUOUS_TARGET',
      'Calculator.resolveWindow',
      `Calculator window identity is ambiguous: expected 1 PID-group window, found ${matches.length}`,
      { candidateCount: matches.length },
    );
  }
  const target = matches[0];
  if (
    !target.id
    || /:unresolved$/.test(String(target.id))
    || Number(target.pid) <= 0
    || Number(target.width) <= 0
    || Number(target.height) <= 0
  ) {
    throw new Error('Calculator window metadata is incomplete');
  }
  return { application, window: target, pids };
}

async function getCalculatorWindow() {
  if (!calculatorRun) throw new Error('Calculator has not been resolved for this execution');
  const matches = [];
  for (const pid of calculatorRun.pids) matches.push(...await window.list({ pid }));
  if (matches.length !== 1) {
    throw calculatorError('STALE_TARGET', 'Calculator.getWindow', `Calculator window became ambiguous or stale: found ${matches.length}`);
  }
  const current = matches[0];
  if (String(current.id) !== String(calculatorRun.window.id) || Number(current.pid) !== Number(calculatorRun.window.pid)) {
    throw calculatorError('STALE_TARGET', 'Calculator.getWindow', 'Calculator window lifecycle identity changed during execution');
  }
  calculatorRun.window = current;
  return current;
}

async function getCalculatorBounds() {
  return compactBounds(await getCalculatorWindow());
}

async function ensureCalculatorActive(allowRefocus = false, identityAlreadyVerified = false) {
  let active = await window.getActiveWindow();
  let matches = active
    && Number(active.pid) === Number(calculatorRun.window.pid)
    && String(active.id) === String(calculatorRun.window.id)
    && active.isForeground === true
    && active.hasFocus === true;
  if (!matches && allowRefocus) {
    const beforeRefocus = active && {
      id: String(active.id || ''),
      pid: Number(active.pid || 0),
      title: String(active.title || ''),
    };
    if (!identityAlreadyVerified) await getCalculatorBounds();
    await window.focus(calculatorRun.window.title);
    await page.waitForTimeout(80);
    active = await window.getActiveWindow();
    matches = active
      && Number(active.pid) === Number(calculatorRun.window.pid)
      && String(active.id) === String(calculatorRun.window.id)
      && active.isForeground === true
      && active.hasFocus === true;
    if (matches) {
      // Close the refocus-to-dispatch race: refresh PID-group uniqueness once
      // more, then cross-check the foreground observation against that exact
      // native window before returning authority to an action caller.
      await currentVerifiedCalculatorWindowIdentity();
      active = await window.getActiveWindow();
      matches = active
        && Number(active.pid) === Number(calculatorRun.window.pid)
        && String(active.id) === String(calculatorRun.window.id)
        && active.isForeground === true
        && active.hasFocus === true;
    }
    if (matches && resultDocument && Array.isArray(resultDocument.focusRecoveries)) {
      resultDocument.focusRecoveries.push({
        sequence: resultDocument.focusRecoveries.length + 1,
        before: beforeRefocus,
        after: { id: String(active.id), pid: Number(active.pid), title: String(active.title || '') },
        targetWindowId: String(calculatorRun.window.id),
        outcome: 'exact-target-refocused',
      });
    }
  }
  if (!matches) {
    throw calculatorError(
      'STALE_TARGET',
      'Calculator.ensureActive',
      'Calculator is not the confirmed foreground/focused resolved PID/window identity',
      {
        expected: { id: calculatorRun.window.id, pid: calculatorRun.window.pid, isForeground: true, hasFocus: true },
        actual: active && {
          id: active.id,
          pid: active.pid,
          isForeground: active.isForeground,
          hasFocus: active.hasFocus,
        },
      },
    );
  }
  return active;
}

function requireVerifiedCalculatorLayout(win) {
  const safe = CALCULATOR_LAYOUT.safeSize;
  if (
    !win
    || String(win.id) !== String(calculatorRun.window.id)
    || Number(win.pid) !== Number(calculatorRun.window.pid)
    || !withinTolerance(win.width, safe.width, safe.tolerance)
    || !withinTolerance(win.height, safe.height, safe.tolerance)
  ) {
    throw calculatorError(
      'STALE_TARGET',
      'Calculator.verifyLayout',
      'Calculator window no longer matches the verified identity and Standard/Basic layout',
    );
  }
  return win;
}

async function currentVerifiedCalculatorWindow(allowRefocus = false) {
  // Every action/screenshot gate first proves that the original PID group
  // still has exactly one window with the same resolved native identity.
  await currentVerifiedCalculatorWindowIdentity();
  const current = requireCalculatorWindowIdentity(await ensureCalculatorActive(allowRefocus, true));
  calculatorRun.window = current;
  return current;
}

function requireCalculatorWindowIdentity(win) {
  if (!win || String(win.id) !== String(calculatorRun.window.id)
    || Number(win.pid) !== Number(calculatorRun.window.pid)
    || ![win.x, win.y, win.width, win.height].every(Number.isFinite)
    || win.width <= 0 || win.height <= 0) {
    throw calculatorError('STALE_TARGET', 'Calculator.verifyIdentity', 'Calculator exact window identity/bounds are unavailable');
  }
  return win;
}

async function currentVerifiedCalculatorWindowIdentity() {
  return requireCalculatorWindowIdentity(await getCalculatorWindow());
}

function requireUnchangedCalculatorSnapshot(before, after) {
  for (const key of ['id', 'pid', 'handle', 'title', 'x', 'y', 'width', 'height']) {
    if (before[key] !== after[key]) {
      throw calculatorError('STALE_TARGET', 'Calculator.verifySnapshot', 'Calculator window changed during its semantic observation');
    }
  }
}

function calculatorKeypadRegion(currentWin) {
  requireVerifiedCalculatorLayout(currentWin);
  return Geometry.regionPercent(currentWin, CALCULATOR_LAYOUT.keypadRegion);
}

function calculatorClearRegion(currentWin) {
  requireVerifiedCalculatorLayout(currentWin);
  return Geometry.regionPercent(currentWin, CALCULATOR_LAYOUT.clearRegion);
}

function calculatorKeyPoint(currentWin, canonicalKey) {
  requireVerifiedCalculatorLayout(currentWin);
  const rule = CALCULATOR_LAYOUT.keyPoints[canonicalKey];
  if (!rule) throw new Error(`Unsupported Calculator key point: ${JSON.stringify(canonicalKey)}`);
  const point = Geometry.pointPercent(currentWin, rule.x, rule.y);
  const keypad = calculatorKeypadRegion(currentWin);
  if (!Geometry.contains(keypad, point)) {
    throw calculatorError(
      'STALE_TARGET',
      'Calculator.projectKeyPoint',
      `Calculator key ${JSON.stringify(canonicalKey)} projected outside the verified keypad region`,
    );
  }
  return point;
}

function calculatorAccessibilityCapabilities() {
  if (typeof Accessibility !== 'object' || Accessibility === null || typeof Accessibility.getCapabilities !== 'function') {
    return null;
  }
  return Accessibility.getCapabilities();
}

function isUsableCalculatorAccessibility(capabilities) {
  return !!capabilities
    && capabilities.hostAuthorization
    && capabilities.hostAuthorization.enabled === true
    && capabilities.implementation
    && capabilities.implementation.available === true
    && capabilities.implementation.actions
    && capabilities.implementation.actions.invoke === true
    && capabilities.permission
    && capabilities.permission.granted === true
    && typeof Accessibility.snapshot === 'function'
    && typeof UI === 'object'
    && UI !== null
    && typeof UI.tapTargets === 'function';
}

function accessibilityCapabilityEvidence(capabilities) {
  if (!capabilities) return null;
  return {
    backend: String(capabilities.backend || ''),
    platform: String(capabilities.platform || ''),
    hostEnabled: capabilities.hostAuthorization && capabilities.hostAuthorization.enabled === true,
    implementationAvailable: capabilities.implementation && capabilities.implementation.available === true,
    invokeAvailable: capabilities.implementation
      && capabilities.implementation.actions
      && capabilities.implementation.actions.invoke === true,
    permissionGranted: capabilities.permission && capabilities.permission.granted === true,
    tapTargetsAvailable: typeof UI === 'object'
      && UI !== null
      && typeof UI.tapTargets === 'function',
  };
}

function calculatorAccessibilityClearState(name) {
  const normalized = String(name || '').trim();
  if (CALCULATOR_ACCESSIBILITY_CLEAR_STATES.entryClear.includes(normalized)) return 'entry-clear';
  if (CALCULATOR_ACCESSIBILITY_CLEAR_STATES.allClear.includes(normalized)) return 'all-clear';
  return null;
}

function flattenAccessibilityNodes(node, result = []) {
  if (!node || typeof node !== 'object') return result;
  result.push(node);
  if (Array.isArray(node.children)) {
    for (const child of node.children) flattenAccessibilityNodes(child, result);
  }
  return result;
}

function compactNativeBounds(bounds) {
  const coordinateSpace = String(bounds && bounds.coordinateSpace || '').trim();
  if (
    !bounds
    || ![bounds.x, bounds.y, bounds.width, bounds.height].every(Number.isFinite)
    || Number(bounds.width) <= 0
    || Number(bounds.height) <= 0
    || coordinateSpace === ''
  ) return null;
  return {
    x: Number(bounds.x),
    y: Number(bounds.y),
    width: Number(bounds.width),
    height: Number(bounds.height),
    coordinateSpace,
  };
}

function requireAccessibilityRootMatchesWindow(rootBounds, currentWindow, operation) {
  const currentBounds = compactBounds(currentWindow);
  const tolerance = 2; // AX/WindowInfo alignment, independent of the visual template.
  if (
    !withinTolerance(rootBounds.x, currentBounds.x, tolerance)
    || !withinTolerance(rootBounds.y, currentBounds.y, tolerance)
    || !withinTolerance(rootBounds.width, currentBounds.width, tolerance)
    || !withinTolerance(rootBounds.height, currentBounds.height, tolerance)
  ) {
    throw calculatorError(
      'STALE_TARGET',
      operation,
      'Calculator Accessibility root does not match the freshly resolved window bounds',
      { expected: currentBounds, actual: rootBounds },
    );
  }
  return rootBounds;
}

function accessibilityRelativeCenter(node, rootBounds) {
  const bounds = compactNativeBounds(node && node.nativeBounds);
  if (!bounds || !rootBounds || bounds.coordinateSpace !== rootBounds.coordinateSpace) {
    throw calculatorError(
      'STALE_TARGET',
      'Calculator.accessibilityLayout',
      'Calculator Accessibility target lacks comparable native bounds',
    );
  }
  return {
    x: ((bounds.x + bounds.width / 2 - rootBounds.x) / rootBounds.width) * 100,
    y: ((bounds.y + bounds.height / 2 - rootBounds.y) / rootBounds.height) * 100,
  };
}

function calculatorAccessibilityTargetEvidence(node, rootBounds, canonicalKey) {
  const relativeCenterPercent = accessibilityRelativeCenter(node, rootBounds);
  return {
    source: 'accessibility-snapshot',
    role: String(node.role || ''),
    nativeRole: String(node.nativeRole || ''),
    name: node.name === null || node.name === undefined ? null : String(node.name),
    identifier: node.identifier === null || node.identifier === undefined ? null : String(node.identifier),
    enabled: node.enabled === true,
    actions: Array.isArray(node.actions) ? node.actions.slice() : [],
    nativeBounds: compactNativeBounds(node.nativeBounds),
    relativeCenterPercent,
  };
}

function requireCalculatorAccessibilityTarget(node, rootBounds, canonicalKey, operation) {
  if (!node || node.role !== 'button' || node.enabled !== true || !Array.isArray(node.actions) || !node.actions.includes('invoke')) {
    throw calculatorError(
      'ACTION_NOT_SUPPORTED',
      operation,
      `Calculator key ${JSON.stringify(canonicalKey)} is not one enabled invokable Accessibility button`,
    );
  }
  const evidence = calculatorAccessibilityTargetEvidence(node, rootBounds, canonicalKey);
  const targetBounds = evidence.nativeBounds;
  const rootTolerancePoints = 4;
  if (
    targetBounds.x < rootBounds.x - rootTolerancePoints
    || targetBounds.y < rootBounds.y - rootTolerancePoints
    || targetBounds.x + targetBounds.width > rootBounds.x + rootBounds.width + rootTolerancePoints
    || targetBounds.y + targetBounds.height > rootBounds.y + rootBounds.height + rootTolerancePoints
  ) {
    throw calculatorError(
      'STALE_TARGET',
      operation,
      `Calculator Accessibility key ${JSON.stringify(canonicalKey)} falls outside the verified window root`,
      { expected: rootBounds, actual: targetBounds },
    );
  }
  return evidence;
}

async function inspectCalculatorAccessibilityTargets(inputSequence, calculationNumber, stage) {
  const capabilities = calculatorAccessibilityCapabilities();
  if (!isUsableCalculatorAccessibility(capabilities)) {
    throw calculatorError(
      'CAPABILITY_DISABLED',
      'Calculator.accessibilityPreflight',
      'Calculator Accessibility snapshot/invoke capability is unavailable',
      { actual: accessibilityCapabilityEvidence(capabilities) },
    );
  }
  // Refresh the exact PID/native-handle window without requiring foreground.
  // Accessibility independently re-resolves the same identity in its native
  // scope, so a different active window cannot redirect this semantic read.
  const before = await currentVerifiedCalculatorWindowIdentity();
  const snapshot = await Accessibility.snapshot({
    within: before,
    maxDepth: CALCULATOR_ACCESSIBILITY_PROFILE.maxDepth,
    maxNodes: CALCULATOR_ACCESSIBILITY_PROFILE.maxNodes,
    properties: ['role', 'nativeRole', 'name', 'identifier', 'enabled', 'actions', 'nativeBounds'],
    timeout: CALCULATOR_ACCESSIBILITY_PROFILE.timeoutMs,
  });
  if (!snapshot || snapshot.complete !== true || snapshot.truncated === true || !snapshot.root) {
    throw calculatorError(
      'SEARCH_INCOMPLETE',
      'Calculator.accessibilityPreflight',
      'Calculator Accessibility snapshot was not complete',
      { actual: snapshot && { complete: snapshot.complete, truncated: snapshot.truncated, reason: snapshot.reason } },
    );
  }
  const rootBounds = compactNativeBounds(snapshot.root.nativeBounds);
  if (!rootBounds) {
    throw calculatorError(
      'STALE_TARGET',
      'Calculator.accessibilityPreflight',
      'Calculator Accessibility root lacks positive bounds in one explicit native coordinate space',
      { actual: rootBounds },
    );
  }
  requireAccessibilityRootMatchesWindow(rootBounds, before, 'Calculator.accessibilityPreflight');
  requireUnchangedCalculatorSnapshot(before, await currentVerifiedCalculatorWindowIdentity());

  const buttons = flattenAccessibilityNodes(snapshot.root).filter(node => node.role === 'button');
  const distinct = [];
  const seenKeys = new Set();
  for (const canonicalKey of inputSequence.canonicalKeys) {
    if (seenKeys.has(canonicalKey)) continue;
    seenKeys.add(canonicalKey);
    distinct.push({ canonicalKey, names: calculatorSemanticButtonNames(canonicalKey) });
  }
  const targets = distinct.map(item => {
    const matches = buttons.filter(node => item.names.includes(String(node.name || '')));
    if (matches.length !== 1) {
      throw targetCountError(
        item.canonicalKey,
        matches.map(node => ({
          name: String(node.name || ''),
          identifier: node.identifier || null,
          nativeBounds: compactNativeBounds(node.nativeBounds),
        })),
        'Calculator.accessibilityPreflight',
      );
    }
    return {
      canonicalKey: item.canonicalKey,
      visibleText: String(matches[0].name),
      ...requireCalculatorAccessibilityTarget(
        matches[0],
        rootBounds,
        item.canonicalKey,
        'Calculator.accessibilityPreflight',
      ),
    };
  });

  const clearCandidates = buttons.filter(node => calculatorAccessibilityClearState(node.name) !== null);
  if (clearCandidates.length !== 1) {
    throw calculatorError(
      clearCandidates.length === 0 ? 'TARGET_NOT_FOUND' : 'AMBIGUOUS_TARGET',
      'Calculator.accessibilityPreflight',
      `Expected one exact-name semantic Calculator clear button, found ${clearCandidates.length}`,
      { candidateCount: clearCandidates.length },
    );
  }
  const clearTarget = requireCalculatorAccessibilityTarget(
    clearCandidates[0],
    rootBounds,
    'clear',
    'Calculator.accessibilityPreflight',
  );
  if (!clearTarget.name) {
    throw calculatorError(
      'TARGET_NOT_FOUND',
      'Calculator.accessibilityPreflight',
      'Calculator clear button has no Accessibility name',
    );
  }
  const clearState = calculatorAccessibilityClearState(clearTarget.name);
  if (!clearState) {
    throw calculatorError(
      'ACTION_NOT_SUPPORTED',
      'Calculator.accessibilityPreflight',
      `Calculator clear button has an unverified Accessibility state name: ${JSON.stringify(clearTarget.name)}`,
    );
  }
  clearTarget.clearState = clearState;

  return {
    calculationNumber,
    stage,
    backend: CALCULATOR_ACCESSIBILITY_PROFILE.backend,
    profile: { ...CALCULATOR_ACCESSIBILITY_PROFILE },
    capability: accessibilityCapabilityEvidence(capabilities),
    snapshot: {
      requestId: String(snapshot.requestId || ''),
      complete: snapshot.complete === true,
      truncated: snapshot.truncated === true,
      stats: snapshot.stats || null,
    },
    windowIdentity: { id: String(before.id), pid: Number(before.pid) },
    windowBounds: compactBounds(before),
    rootNativeBounds: rootBounds,
    keypadRegionPercent: null, // Semantic selectors do not consume visual geometry.
    distinctTexts: targets.map(item => item.name),
    targets,
    clearTarget,
    verified: true,
  };
}

function normalizeCalculatorAccessibilityValue(rawValue) {
  const raw = String(rawValue === undefined || rawValue === null ? '' : rawValue).trim();
  const compact = raw
    .replace(/^\u200e/, '') // Observed leading LRM in StandardInputView; no general bidi stripping.
    .replace(/[\u00a0\u202f\s]/g, '')
    .replace(/\u2212/g, '-');
  if (!/^[+-]?(?:\d+(?:[.,]\d*)?|[.,]\d+)$/.test(compact)) {
    throw calculatorError(
      'DISPLAY_PARSE_FAILED',
      'Calculator.normalizeAccessibilityDisplay',
      `Calculator Accessibility Display is not one exact numeric value: ${JSON.stringify(raw)}`,
    );
  }
  return compact.replace(',', '.').replace(/^\+/, '');
}

function requireCalculatorDisplayBounds(node, parentBounds) {
  const displayNativeBounds = compactNativeBounds(node.nativeBounds);
  if (!displayNativeBounds || displayNativeBounds.coordinateSpace !== parentBounds.coordinateSpace) {
    throw calculatorError('STALE_TARGET', 'Calculator.accessibilityDisplay',
      'Calculator Display lacks comparable native bounds');
  }
  const rootTolerancePoints = 4;
  if (
    displayNativeBounds.x < parentBounds.x - rootTolerancePoints
    || displayNativeBounds.y < parentBounds.y - rootTolerancePoints
    || displayNativeBounds.x + displayNativeBounds.width > parentBounds.x + parentBounds.width + rootTolerancePoints
    || displayNativeBounds.y + displayNativeBounds.height > parentBounds.y + parentBounds.height + rootTolerancePoints
  ) {
    throw calculatorError(
      'STALE_TARGET',
      'Calculator.accessibilityDisplay',
      'Calculator Accessibility Display falls outside the verified window root',
      { expected: parentBounds, actual: displayNativeBounds },
    );
  }
  return displayNativeBounds;
}

async function inspectCalculatorAccessibilityDisplay(calculationNumber, stage, timeoutMs) {
  const before = await currentVerifiedCalculatorWindowIdentity();
  const snapshot = await Accessibility.snapshot({
    within: before,
    maxDepth: CALCULATOR_ACCESSIBILITY_PROFILE.maxDepth,
    maxNodes: CALCULATOR_ACCESSIBILITY_PROFILE.maxNodes,
    properties: ['role', 'nativeRole', 'name', 'value', 'identifier', 'enabled', 'actions', 'nativeBounds'],
    timeout: timeoutMs,
  });
  if (!snapshot || snapshot.complete !== true || snapshot.truncated === true || !snapshot.root) {
    throw calculatorError(
      'SEARCH_INCOMPLETE',
      'Calculator.accessibilityDisplay',
      'Calculator Accessibility snapshot was not complete while reading the Display',
      { actual: snapshot && { complete: snapshot.complete, truncated: snapshot.truncated, reason: snapshot.reason } },
    );
  }
  const rootBounds = compactNativeBounds(snapshot.root.nativeBounds);
  if (!rootBounds) {
    throw calculatorError(
      'STALE_TARGET',
      'Calculator.accessibilityDisplay',
      'Calculator Accessibility root lacks positive bounds in one explicit native coordinate space',
    );
  }
  requireAccessibilityRootMatchesWindow(rootBounds, before, 'Calculator.accessibilityDisplay');
  requireUnchangedCalculatorSnapshot(before, await currentVerifiedCalculatorWindowIdentity());

  const nodes = flattenAccessibilityNodes(snapshot.root);
  const namedDisplays = nodes.filter(node => node.role === 'staticText'
    && CALCULATOR_ACCESSIBILITY_PROFILE.displayNames.includes(node.name));
  // Current Calculator exposes an unnamed value under this exact native owner.
  // Count owners and staticText descendants before inspecting values: neither
  // expected nor numeric-looking content may choose an owner or break a tie.
  const owners = nodes.filter(node => node.identifier === 'StandardInputView');
  if (owners.length > 1) {
    throw calculatorError('AMBIGUOUS_TARGET', 'Calculator.accessibilityDisplay',
      'Multiple exact StandardInputView owners in the complete window snapshot');
  }
  let structuralDisplay = null;
  if (owners.length === 1) {
    const owner = owners[0];
    if (owner.nativeRole !== 'AXScrollArea') {
      throw calculatorError('STALE_TARGET', 'Calculator.accessibilityDisplay',
        'StandardInputView native role no longer matches the observed Display owner');
    }
    const descendants = flattenAccessibilityNodes(owner).slice(1).filter(node => node.role === 'staticText');
    if (descendants.length !== 1) {
      throw calculatorError(descendants.length === 0 ? 'TARGET_NOT_FOUND' : 'AMBIGUOUS_TARGET',
        'Calculator.accessibilityDisplay', 'StandardInputView must own exactly one staticText descendant');
    }
    structuralDisplay = descendants[0];
    requireCalculatorDisplayBounds(owner, rootBounds);
    requireCalculatorDisplayBounds(structuralDisplay, compactNativeBounds(owner.nativeBounds));

  }
  const displayCandidates = Array.from(new Set([
    ...namedDisplays, ...(structuralDisplay ? [structuralDisplay] : []),
  ]));
  if (displayCandidates.length !== 1) {
    throw calculatorError(
      displayCandidates.length === 0 ? 'TARGET_NOT_FOUND' : 'AMBIGUOUS_TARGET',
      'Calculator.accessibilityDisplay',
      `Expected one unique named or structurally owned Accessibility Display staticText, found ${displayCandidates.length}`,
      { candidateCount: displayCandidates.length },
    );
  }
  const clearCandidates = nodes.filter(node => node.role === 'button' && calculatorAccessibilityClearState(node.name) !== null);
  if (clearCandidates.length !== 1) {
    throw calculatorError(
      clearCandidates.length === 0 ? 'TARGET_NOT_FOUND' : 'AMBIGUOUS_TARGET',
      'Calculator.accessibilityDisplay',
      `Expected one exact-name semantic Calculator clear button, found ${clearCandidates.length}`,
      { candidateCount: clearCandidates.length },
    );
  }

  const displayNode = displayCandidates[0];
  if (displayNode.value === null || displayNode.value === undefined || String(displayNode.value).trim() === '') {
    throw calculatorError('TARGET_NOT_FOUND', 'Calculator.accessibilityDisplay', 'Display has no readable value');
  }
  const displayNativeBounds = requireCalculatorDisplayBounds(displayNode, rootBounds);
  const clearTarget = requireCalculatorAccessibilityTarget(
    clearCandidates[0],
    rootBounds,
    'clear',
    'Calculator.accessibilityDisplay',
  );
  if (!clearTarget.name) {
    throw calculatorError(
      'TARGET_NOT_FOUND',
      'Calculator.accessibilityDisplay',
      'Calculator clear button has no Accessibility name',
    );
  }
  const clearState = calculatorAccessibilityClearState(clearTarget.name);
  if (!clearState) {
    throw calculatorError(
      'ACTION_NOT_SUPPORTED',
      'Calculator.accessibilityDisplay',
      `Calculator clear button has an unverified Accessibility state name: ${JSON.stringify(clearTarget.name)}`,
    );
  }
  clearTarget.clearState = clearState;
  const rawValue = String(displayNode.value);
  return {
    calculationNumber,
    stage,
    backend: 'accessibility-snapshot',
    windowIdentity: { id: String(before.id), pid: Number(before.pid) },
    windowBounds: compactBounds(before),
    rootNativeBounds: rootBounds,
    snapshot: {
      requestId: String(snapshot.requestId || ''),
      complete: snapshot.complete === true,
      truncated: snapshot.truncated === true,
      stats: snapshot.stats || null,
    },
    display: {
      role: String(displayNode.role || ''),
      nativeRole: String(displayNode.nativeRole || ''),
      name: displayNode.name === null || displayNode.name === undefined ? null : String(displayNode.name),
      identifier: displayNode.identifier === null || displayNode.identifier === undefined
        ? null
        : String(displayNode.identifier),
      rawValue,
      channel: structuralDisplay === displayNode ? 'StandardInputView/staticText' : 'named-staticText',
      ownerIdentifier: structuralDisplay === displayNode ? 'StandardInputView' : null,
      normalizedResult: normalizeCalculatorAccessibilityValue(rawValue),
      nativeBounds: displayNativeBounds,
      relativeCenterPercent: accessibilityRelativeCenter(displayNode, rootBounds),
    },
    clearTarget,
    qualification: {
      snapshot: { requestId: String(snapshot.requestId || '') },
      windowIdentity: { id: String(before.id), pid: Number(before.pid) },
      windowBounds: compactBounds(before),
      rootNativeBounds: rootBounds,
      clearTarget,
    },
  };
}

async function waitForCalculatorAccessibilityDisplay(expected, expectedClearState, calculationNumber, stage) {
  const normalizedExpected = normalizeExpected(expected);
  const started = Date.now();
  const deadlineAt = started + DISPLAY_READY_TIMEOUT_MS;
  const observations = [];
  let expectedStreak = 0;

  while (Date.now() <= deadlineAt) {
    const remainingMs = Math.max(1, Math.floor(deadlineAt - Date.now()));
    try {
      const [observation] = await page.waitForAll([
        inspectCalculatorAccessibilityDisplay(
          calculationNumber,
          stage,
          Math.min(CALCULATOR_ACCESSIBILITY_PROFILE.timeoutMs, remainingMs),
        ),
      ], { timeout: remainingMs, signal: null });
      const observedAt = Date.now();
      const withinDeadline = observedAt <= deadlineAt;
      observations.push({
        elapsedMs: observedAt - started,
        requestId: observation.snapshot.requestId,
        windowIdentity: observation.windowIdentity,
        windowBounds: observation.windowBounds,
        rootNativeBounds: observation.rootNativeBounds,
        rawValue: observation.display.rawValue,
        normalizedResult: observation.display.normalizedResult,
        clearAccessibleName: observation.clearTarget.name,
        clearState: observation.clearTarget.clearState,
        withinDeadline,
      });
      expectedStreak = withinDeadline
        && observation.display.normalizedResult === normalizedExpected
        && observation.clearTarget.clearState === expectedClearState
        ? expectedStreak + 1
        : 0;
      if (expectedStreak >= 2) {
        return {
          ...observation,
          expected: normalizedExpected,
          expectedClearState,
          observations,
          stable: true,
          matchedExpected: true,
        };
      }
      if (!withinDeadline) break;
    } catch (error) {
      if (!error || !['DISPLAY_PARSE_FAILED', 'TARGET_NOT_FOUND', 'SEARCH_INCOMPLETE', 'TIMEOUT', 'BACKEND_FAILED'].includes(error.code)) {
        throw error;
      }
      const observedAt = Date.now();
      observations.push({
        elapsedMs: observedAt - started,
        error: errorEvidence(error),
        withinDeadline: observedAt <= deadlineAt,
      });
      expectedStreak = 0;
    }
    const remainingAfterObservationMs = Math.floor(deadlineAt - Date.now());
    if (remainingAfterObservationMs <= 0) break;
    await page.waitForTimeout(Math.min(DISPLAY_POLLING_MS, remainingAfterObservationMs));
  }

  throw calculatorError(
    'TIMEOUT',
    'Calculator.waitForAccessibilityDisplay',
    `Calculator Accessibility state did not become stably ${expectedClearState} with Display ${JSON.stringify(normalizedExpected)}`,
    { expected: { display: normalizedExpected, clearState: expectedClearState }, observations, timeoutMs: DISPLAY_READY_TIMEOUT_MS },
  );
}

async function selectBasicCalculatorLayout() {
  await ensureCalculatorActive(true);
  await keyboard.down('Meta');
  try {
    await keyboard.press('1');
  } finally {
    await keyboard.up('Meta');
  }
  await page.waitForTimeout(400);
  await ensureCalculatorActive();
}

async function normalizeAndVerifyLayout() {
  const capabilities = calculatorAccessibilityCapabilities();
  if (capabilities && capabilities.permission && capabilities.permission.granted === false) {
    throw calculatorError('PERMISSION_DENIED', 'Calculator.accessibilityPreflight',
      'Calculator Accessibility system permission is unavailable');
  }
  if (isUsableCalculatorAccessibility(capabilities)) {
    const current = await currentVerifiedCalculatorWindowIdentity();
    const bounds = compactBounds(current);
    resultDocument.layout = {
      strategy: 'exact-window-semantic-snapshot',
      verifiedLayout: null,
      initialBounds: { ...bounds }, finalBounds: { ...bounds },
      recoveryActions: [], recovered: false, verified: false,
      qualification: 'required before input; no visual template claim',
    };
    return bounds;
  }
  if (!resultDocument.input || resultDocument.input.visualFallback !== 'ocr') {
    throw calculatorError('CAPABILITY_DISABLED', 'Calculator.accessibilityPreflight',
      'Native semantic input is unavailable and visual fallback was not explicitly enabled');
  }
  const safe = CALCULATOR_LAYOUT.safeSize;
  let bounds = await getCalculatorBounds();
  const initialBounds = { ...bounds };
  const layoutEvidence = {
    strategy: 'B',
    verifiedLayout: CALCULATOR_LAYOUT.name,
    initialBounds,
    recoveryActions: [],
    recovered: false,
  };
  resultDocument.layout = layoutEvidence;

  if (!withinTolerance(bounds.width, safe.width, safe.tolerance) || !withinTolerance(bounds.height, safe.height, safe.tolerance)) {
    await selectBasicCalculatorLayout();
    layoutEvidence.recoveryActions.push('select-basic-with-command-1');
    bounds = await getCalculatorBounds();
  }
  if (!withinTolerance(bounds.width, safe.width, safe.tolerance) || !withinTolerance(bounds.height, safe.height, safe.tolerance)) {
    await window.setWindowBounds(
      calculatorRun.window.title,
      initialBounds.x,
      initialBounds.y,
      safe.width,
      safe.height,
    );
    layoutEvidence.recoveryActions.push('restore-safe-bounds');
    await page.waitForTimeout(250);
    bounds = await getCalculatorBounds();
  }
  if (!withinTolerance(bounds.x, initialBounds.x, safe.tolerance) || !withinTolerance(bounds.y, initialBounds.y, safe.tolerance)) {
    await window.setWindowBounds(
      calculatorRun.window.title,
      initialBounds.x,
      initialBounds.y,
      safe.width,
      safe.height,
    );
    layoutEvidence.recoveryActions.push('restore-detected-position');
    await page.waitForTimeout(250);
    bounds = await getCalculatorBounds();
  }
  layoutEvidence.finalBounds = { ...bounds };
  if (!withinTolerance(bounds.width, safe.width, safe.tolerance) || !withinTolerance(bounds.height, safe.height, safe.tolerance)) {
    throw new Error(
      `Unsupported Calculator layout/size ${bounds.width}x${bounds.height}; expected verified Standard/Basic ${safe.width}x${safe.height}`,
    );
  }
  if (!withinTolerance(bounds.x, initialBounds.x, safe.tolerance) || !withinTolerance(bounds.y, initialBounds.y, safe.tolerance)) {
    throw new Error(
      `Calculator Basic layout changed position from (${initialBounds.x},${initialBounds.y}) to (${bounds.x},${bounds.y})`,
    );
  }
  layoutEvidence.recovered = layoutEvidence.recoveryActions.length > 0;
  layoutEvidence.verified = true;
  return bounds;
}

function isUsableTextProvider(capability) {
  if (!capability || capability.implemented !== true) return false;
  if (capability.provider === 'apple') return capability.available === true;
  if (capability.endpointRequired) return capability.endpointConfigured === true;
  return capability.available !== false;
}

function calculatorTextOptions(verifiedWindow, profile) {
  if (!Number.isFinite(profile.minConfidence) || profile.minConfidence < 0 || profile.minConfidence > 1) {
    throw new Error('Calculator text locator minConfidence must be between 0 and 1');
  }
  return {
    within: verifiedWindow,
    region: calculatorKeypadRegion,
    match: 'exact',
    caseSensitive: true,
    normalizeWhitespace: true,
    provider: profile.provider,
    lang: profile.lang,
    minConfidence: profile.minConfidence,
  };
}

function calculatorClearTextOptions(verifiedWindow, profile) {
  return {
    ...calculatorTextOptions(verifiedWindow, profile),
    region: calculatorClearRegion,
  };
}

function targetEvidence(target) {
  if (!target) return null;
  if (target.source === 'accessibility-snapshot') return target;
  return {
    text: String(target.text || ''),
    confidence: Number(target.confidence),
    provider: String(target.provider || ''),
    bounds: target.bounds,
    center: target.center,
  };
}

function requireTargetProvider(target, expectedProvider, operation) {
  const actual = String(target && target.provider || '');
  if (actual !== expectedProvider && !actual.endsWith(`/${expectedProvider}`)) {
    const error = new Error(`Calculator OCR provider changed from ${expectedProvider} to ${actual || '<missing>'}`);
    error.code = 'OCR_FAILED';
    error.operation = operation;
    error.expected = expectedProvider;
    error.actual = actual;
    throw error;
  }
  return target;
}

function targetCountError(text, candidates, operation) {
  const error = new Error(
    candidates.length === 0
      ? `Calculator button ${JSON.stringify(text)} was not found in the verified keypad region`
      : `Calculator button ${JSON.stringify(text)} is ambiguous in the verified keypad region: found ${candidates.length}`,
  );
  error.code = candidates.length === 0 ? 'TARGET_NOT_FOUND' : 'AMBIGUOUS_TARGET';
  error.operation = operation;
  error.candidateCount = candidates.length;
  error.candidates = candidates.map(targetEvidence);
  return error;
}

async function findUniqueCalculatorText(text, options, operation) {
  await currentVerifiedCalculatorWindow(true);
  const candidates = await UI.findTexts(text, options);
  if (candidates.length !== 1) throw targetCountError(text, candidates, operation);
  return requireTargetProvider(candidates[0], options.provider, operation);
}

function canTryAnotherTextProfile(error) {
  return !!error && ['OCR_FAILED', 'TARGET_NOT_FOUND', 'AMBIGUOUS_TARGET'].includes(error.code);
}

function canFallbackFromAccessibilityPreflight(error) {
  return !!error && [
    'CAPABILITY_DISABLED',
    'NOT_SUPPORTED',
    'SEARCH_INCOMPLETE',
    'TARGET_NOT_FOUND',
    'AMBIGUOUS_TARGET',
    'ACTION_NOT_SUPPORTED',
    'TIMEOUT',
    'BACKEND_FAILED',
  ].includes(error.code);
}

async function qualifyCalculatorClearStateLocator(verifiedWindow, providers) {
  const attempts = [];
  for (const profile of CALCULATOR_TEXT_LOCATOR_PROFILES) {
    const capability = providers.find(item => item.provider === profile.provider);
    if (!isUsableTextProvider(capability)) {
      attempts.push({ profile, usable: false, error: 'provider is unavailable' });
      continue;
    }
    const options = calculatorClearTextOptions(verifiedWindow, profile);
    try {
      const currentText = await currentClearText(options);
      return {
        profile: { ...profile },
        options,
        currentText,
        clearRegionPercent: { ...CALCULATOR_LAYOUT.clearRegion },
        priorAttempts: attempts,
        verified: true,
      };
    } catch (error) {
      if (!canTryAnotherTextProfile(error)) throw error;
      attempts.push({ profile, usable: true, error: errorEvidence(error) });
    }
  }
  throw calculatorError(
    'TARGET_NOT_FOUND',
    'Calculator.clearStatePreflight',
    `No OCR profile uniquely resolved the Calculator C / AC state: ${JSON.stringify(attempts)}`,
    { attempts },
  );
}

async function qualifyCalculatorTextLocator(inputSequence, verifiedWindow, calculationNumber) {
  const visibleTexts = inputSequence.visibleTexts;
  const distinctTexts = Array.from(new Set(visibleTexts));
  const attempts = [];

  const accessibilityCapabilities = calculatorAccessibilityCapabilities();
  if (accessibilityCapabilities && accessibilityCapabilities.permission
    && accessibilityCapabilities.permission.granted === false) {
    throw calculatorError('PERMISSION_DENIED', 'Calculator.accessibilityPreflight',
      'Calculator Accessibility system permission is unavailable');
  }
  if (isUsableCalculatorAccessibility(accessibilityCapabilities)) {
    let qualification = null;
    try {
      qualification = await inspectCalculatorAccessibilityTargets(
        inputSequence,
        calculationNumber,
        'provider-calibration',
      );
    } catch (error) {
      if (!canFallbackFromAccessibilityPreflight(error)) throw error;
      attempts.push({
        profile: { ...CALCULATOR_ACCESSIBILITY_PROFILE },
        usable: true,
        error: errorEvidence(error),
      });
    }
    if (qualification) {
      // Prove the independent Display identity/value channel before even clear
      // input. Expected values are only consumed later by result assertions.
      const displayPreflight = await inspectCalculatorAccessibilityDisplay(
        calculationNumber, 'provider-calibration', CALCULATOR_ACCESSIBILITY_PROFILE.timeoutMs,
      );
      qualification.display = displayPreflight.display;
      resultDocument.textLocatorQualifications.push(qualification);
      calculatorRun.textLocator = {
        backend: 'accessibility',
        profile: { ...CALCULATOR_ACCESSIBILITY_PROFILE },
      };
      await writeResultDocument();
      return {
        backend: 'accessibility',
        profile: { ...CALCULATOR_ACCESSIBILITY_PROFILE },
        options: { within: verifiedWindow },
        qualification,
      };
    }
  } else {
    attempts.push({
      profile: { ...CALCULATOR_ACCESSIBILITY_PROFILE },
      usable: false,
      error: 'Accessibility snapshot/invoke capability is unavailable',
      capability: accessibilityCapabilityEvidence(accessibilityCapabilities),
    });
  }

  if (!resultDocument.input || resultDocument.input.visualFallback !== 'ocr') {
    resultDocument.textLocatorQualificationFailures.push({ calculationNumber, distinctTexts, attempts });
    await writeResultDocument();
    throw calculatorError(
      'CAPABILITY_DISABLED',
      'Calculator.accessibilityPreflight',
      'Calculator Accessibility input did not qualify and OCR fallback was not explicitly enabled',
      { attempts },
    );
  }

  // Explicit fallback cannot inherit semantic bounds as qualified visual geometry.
  requireVerifiedCalculatorLayout(verifiedWindow);
  const capabilities = await Vision.getCapabilities({});
  const providers = Array.isArray(capabilities.providers) ? capabilities.providers : [];

  for (const profile of CALCULATOR_TEXT_LOCATOR_PROFILES) {
    const capability = providers.find(item => item.provider === profile.provider);
    if (!isUsableTextProvider(capability)) {
      attempts.push({ profile, usable: false, error: 'provider is unavailable' });
      continue;
    }

    const options = calculatorTextOptions(verifiedWindow, profile);
    const clearOptions = calculatorClearTextOptions(verifiedWindow, profile);
    const targets = [];
    try {
      for (const text of distinctTexts) {
        const target = await findUniqueCalculatorText(text, options, 'Calculator.textPreflight');
        targets.push(targetEvidence(target));
      }
      const clearText = await currentClearText(clearOptions);
      const qualification = {
        calculationNumber,
        stage: 'provider-calibration',
        profile: { ...profile },
        keypadRegionPercent: { ...CALCULATOR_LAYOUT.keypadRegion },
        clearRegionPercent: { ...CALCULATOR_LAYOUT.clearRegion },
        distinctTexts: distinctTexts.slice(),
        targets,
        currentClearText: clearText,
        priorAttempts: attempts.slice(),
        verified: true,
      };
      resultDocument.textLocatorQualifications.push(qualification);
      calculatorRun.textLocatorProfile = { ...profile };
      calculatorRun.textLocator = { backend: 'ocr', profile: { ...profile } };
      await writeResultDocument();
      return { backend: 'ocr', profile: { ...profile }, options, clearOptions, qualification };
    } catch (error) {
      if (!canTryAnotherTextProfile(error)) throw error;
      attempts.push({ profile, usable: true, error: errorEvidence(error) });
    }
  }

  resultDocument.textLocatorQualificationFailures.push({ calculationNumber, distinctTexts, attempts });
  await writeResultDocument();
  throw new Error(`No safe Calculator input locator qualified: ${JSON.stringify(attempts)}`);
}

async function preflightCalculatorTexts(inputSequence, locator, calculationNumber) {
  if (locator.backend === 'accessibility') {
    const evidence = await inspectCalculatorAccessibilityTargets(
      inputSequence,
      calculationNumber,
      'post-reset-preflight',
    );
    resultDocument.textLocatorQualifications.push(evidence);
    await writeResultDocument();
    return evidence;
  }

  const visibleTexts = inputSequence.visibleTexts;
  const options = locator.options;
  const distinctTexts = Array.from(new Set(visibleTexts));
  const targets = [];
  for (const text of distinctTexts) {
    const target = await findUniqueCalculatorText(text, options, 'Calculator.postResetTextPreflight');
    targets.push(targetEvidence(target));
  }
  const evidence = {
    calculationNumber,
    stage: 'post-reset-preflight',
    profile: {
      provider: options.provider,
      lang: options.lang,
      minConfidence: options.minConfidence,
    },
    keypadRegionPercent: { ...CALCULATOR_LAYOUT.keypadRegion },
    distinctTexts,
    targets,
    verified: true,
  };
  resultDocument.textLocatorQualifications.push(evidence);
  await writeResultDocument();
  return evidence;
}

function calculatorTapOptions(rawOptions) {
  if (rawOptions.backend === 'accessibility') {
    return {
      backend: 'accessibility',
      within: rawOptions.within,
    };
  }
  return {
    backend: 'ocr',
    within: rawOptions.within,
    region: rawOptions.region,
    match: rawOptions.match,
    caseSensitive: rawOptions.caseSensitive,
    normalizeWhitespace: rawOptions.normalizeWhitespace,
    provider: rawOptions.provider,
    lang: rawOptions.lang,
    minConfidence: rawOptions.minConfidence,
  };
}

async function recordFailedCalculatorAction(failure) {
  resultDocument.failedAction = failure;
  const resultPersistenceErrors = [];
  const initialWriteError = await tryWriteResultDocument();
  if (initialWriteError) resultPersistenceErrors.push(initialWriteError);
  try {
    const display = await readCalculatorDisplay(
      `failure-${failure.calculationNumber}-${failure.failedIndex + 1}`,
      Date.now() + FAILURE_EVIDENCE_TIMEOUT_MS,
    );
    failure.displayAfterFailure = {
      screenshot: display.screenshot.path,
      rawDisplay: display.rawDisplay,
      normalizedResult: display.normalizedResult,
      ocrProvider: display.ocr.provider,
    };
  } catch (error) {
    failure.displayEvidenceError = errorEvidence(error);
  }
  if (resultPersistenceErrors.length > 0) failure.resultPersistenceErrors = resultPersistenceErrors;
  const finalWriteError = await tryWriteResultDocument();
  if (finalWriteError) {
    resultPersistenceErrors.push(finalWriteError);
    failure.resultPersistenceErrors = resultPersistenceErrors;
  }
}

function calculatorAccessibilitySequenceTarget(qualification, canonicalKey) {
  const matches = canonicalKey === 'clear'
    ? [qualification && qualification.clearTarget].filter(Boolean)
    : (qualification && Array.isArray(qualification.targets) ? qualification.targets : [])
      .filter(item => item.canonicalKey === canonicalKey);
  const target = matches.length === 1 ? matches[0] : null;
  if (!target || target.role !== 'button' || !target.name
    || (canonicalKey !== 'clear' && !calculatorSemanticButtonNames(canonicalKey).includes(target.name))) {
    throw calculatorError(
      'TARGET_NOT_FOUND',
      'Calculator.tapTargets',
      `Calculator key ${JSON.stringify(canonicalKey)} lacks one qualified Accessibility locator`,
    );
  }
  const locator = { role: 'button', name: target.name };
  if (target.identifier) locator.identifier = target.identifier;
  return { target, step: { locator } };
}

async function tapCalculatorAccessibilityTargets(canonicalKeys, rawOptions) {
  const before = await currentVerifiedCalculatorWindow(true);
  const qualification = rawOptions.qualification;
  const qualifiedIdentity = qualification && qualification.windowIdentity;
  const qualifiedBounds = qualification && qualification.windowBounds;
  const beforeBounds = compactBounds(before);
  if (
    !rawOptions.within
    || String(rawOptions.within.id) !== String(before.id)
    || Number(rawOptions.within.pid) !== Number(before.pid)
    || !qualifiedIdentity
    || String(qualifiedIdentity.id) !== String(before.id)
    || Number(qualifiedIdentity.pid) !== Number(before.pid)
    || !qualifiedBounds
    || Number(qualifiedBounds.x) !== beforeBounds.x
    || Number(qualifiedBounds.y) !== beforeBounds.y
    || Number(qualifiedBounds.width) !== beforeBounds.width
    || Number(qualifiedBounds.height) !== beforeBounds.height
  ) {
    throw calculatorError(
      'STALE_TARGET',
      'Calculator.tapTargets',
      'Calculator Accessibility qualification no longer matches the fixed window',
      {
        expected: { identity: qualifiedIdentity || null, bounds: qualifiedBounds || null },
        actual: { identity: { id: before.id, pid: before.pid }, bounds: beforeBounds },
      },
    );
  }

  const qualified = canonicalKeys.map(canonicalKey => calculatorAccessibilitySequenceTarget(
    qualification,
    canonicalKey,
  ));
  const observedSequence = qualified.map(item => item.target.name);
  let receipt;
  try {
    receipt = await UI.tapTargets(qualified.map(item => item.step), {
      within: before,
      timeout: CALCULATOR_ACCESSIBILITY_PROFILE.timeoutMs,
      maxDepth: CALCULATOR_ACCESSIBILITY_PROFILE.maxDepth,
      maxNodes: CALCULATOR_ACCESSIBILITY_PROFILE.maxNodes,
    });
  } catch (error) {
    const nativeCompleted = Array.isArray(error && error.completed) ? error.completed : [];
    const completed = nativeCompleted.map((item, completedIndex) => {
      const index = Number.isInteger(item.index) ? item.index : completedIndex;
      const action = {
        sequence: resultDocument.actionTrace.length + 1,
        calculationNumber: rawOptions.calculationNumber,
        phase: String(rawOptions.phase || 'expression'),
        phaseOrdinal: Number.isInteger(rawOptions.phaseOrdinal) ? rawOptions.phaseOrdinal + index : index + 1,
        keyIndex: index,
        canonicalKey: canonicalKeys[index],
        visibleText: observedSequence[index],
        windowIdentity: { id: String(before.id), pid: Number(before.pid) },
        windowBounds: beforeBounds,
        target: qualified[index].target,
        point: null,
        dispatch: {
          backend: 'UI.tapTargets/Accessibility.perform',
          nativeBackend: item.backend,
          requestId: item.requestId,
          actionState: item.actionState,
        },
        preActionWindowBounds: beforeBounds,
        outcome: 'native-invoke-returned',
      };
      resultDocument.actionTrace.push(action);
      return action;
    });
    const failedIndex = Number.isInteger(error && error.failedIndex) ? error.failedIndex : completed.length;
    const failure = {
      calculationNumber: rawOptions.calculationNumber,
      phase: String(rawOptions.phase || 'expression'),
      failedIndex,
      canonicalKey: canonicalKeys[failedIndex] || null,
      visibleText: observedSequence[failedIndex] || null,
      stage: error && error.failedPhase ? String(error.failedPhase) : 'action',
      completedPrefix: completed.map(item => item.visibleText),
      inputOutcome: error && error.actionState === 'unknown' ? 'unknown' : 'not-dispatched',
      cause: errorEvidence(error),
    };
    await recordFailedCalculatorAction(failure);
    const wrapped = new Error(
      `Calculator Accessibility input stopped at key ${failedIndex}: ${errorMessage(error)}`,
    );
    wrapped.code = error && error.code ? error.code : 'CALCULATOR_INPUT_FAILED';
    wrapped.operation = 'tapCalculatorTexts';
    wrapped.failedIndex = failedIndex;
    wrapped.failedText = failure.visibleText;
    wrapped.completed = completed;
    wrapped.cause = error;
    throw wrapped;
  }

  const after = await currentVerifiedCalculatorWindow(false);
  const completed = receipt.completed.map((item, index) => {
    const action = {
      sequence: resultDocument.actionTrace.length + 1,
      calculationNumber: rawOptions.calculationNumber,
      phase: String(rawOptions.phase || 'expression'),
      phaseOrdinal: Number.isInteger(rawOptions.phaseOrdinal) ? rawOptions.phaseOrdinal + index : index + 1,
      keyIndex: index,
      canonicalKey: canonicalKeys[index],
      visibleText: observedSequence[index],
      windowIdentity: { id: String(after.id), pid: Number(after.pid) },
      windowBounds: compactBounds(after),
      target: qualified[index].target,
      point: null,
      dispatch: {
        backend: 'UI.tapTargets/Accessibility.perform',
        nativeBackend: item.backend,
        requestId: item.requestId,
        actionState: item.actionState,
      },
      preActionWindowBounds: beforeBounds,
      outcome: 'native-invoke-returned',
    };
    resultDocument.actionTrace.push(action);
    return action;
  });
  try {
    await writeResultDocument();
  } catch (error) {
    const checkpointFailure = {
      calculationNumber: rawOptions.calculationNumber,
      phase: String(rawOptions.phase || 'expression'),
      afterKeyIndex: completed.length - 1,
      afterCanonicalKey: canonicalKeys[completed.length - 1],
      afterVisibleText: observedSequence[completed.length - 1],
      completedPrefix: completed.map(item => item.visibleText),
      inputOutcome: 'dispatched-checkpoint-failed',
      cause: errorEvidence(error),
    };
    resultDocument.checkpointFailure = checkpointFailure;
    const wrapped = new Error(`Calculator action checkpoint failed after Accessibility sequence: ${errorMessage(error)}`);
    wrapped.code = 'RESULT_PERSISTENCE_FAILED';
    wrapped.operation = 'Calculator.actionCheckpoint';
    wrapped.completed = completed;
    wrapped.cause = error;
    throw wrapped;
  }
  return { ok: true, action: 'tapCalculatorTexts', backend: receipt.backend, completed };
}

async function tapCalculatorTexts(texts, rawOptions) {
  if (!Array.isArray(texts) || texts.length === 0 || texts.some(text => typeof text !== 'string' || text.length === 0)) {
    throw new Error('tapCalculatorTexts texts must be a non-empty string array');
  }
  if (!rawOptions || typeof rawOptions !== 'object') throw new Error('tapCalculatorTexts options are required');

  // Keep the recipe deterministic and permit per-key state/evidence checks by
  // taking an immutable snapshot. The preferred backend first verifies the
  // Calculator profile with a complete Accessibility snapshot, then delegates
  // the whole sequence to the reusable Accessibility-first UI.tapTargets API.
  // An explicitly selected OCR fallback still uses PID-scoped AXPress.
  const sequence = Object.freeze(texts.slice());
  const canonicalKeys = Object.freeze((rawOptions.canonicalKeys || sequence).slice());
  if (canonicalKeys.length !== sequence.length) throw new Error('canonicalKeys must match the visible Calculator text sequence');
  const options = calculatorTapOptions(rawOptions);
  if (options.backend === 'accessibility') {
    return tapCalculatorAccessibilityTargets(canonicalKeys, rawOptions);
  }
  const completed = [];

  for (let index = 0; index < sequence.length; index += 1) {
    const visibleText = sequence[index];
    const canonicalKey = canonicalKeys[index];
    let inputDispatched = false;
    let stage = 'precheck';
    try {
      // Refocus only the already-resolved exact window before an action. The
      // refocus path first proves that the cached native identity is current.
      const before = await currentVerifiedCalculatorWindow(true);
      let target;
      let point;
      let dispatch;
      if (typeof mouse !== 'object' || mouse === null || typeof mouse.clickForPID !== 'function') {
        throw calculatorError(
          'ACTION_NOT_SUPPORTED',
          'Calculator.tapCalculatorTexts',
          'OCR-located Calculator input requires PID-scoped AXPress support',
        );
      }
      const ocrOptions = { ...options, within: before };
      const located = await findUniqueCalculatorText(
        visibleText,
        ocrOptions,
        'Calculator.tapCalculatorTexts',
      );
      // Do not refocus after OCR: a focus change makes the observation stale
      // and must stop this sequence rather than authorize a click from it.
      const actionWindow = await currentVerifiedCalculatorWindow(false);
      const beforeBounds = compactBounds(before);
      const actionBounds = compactBounds(actionWindow);
      if (
        beforeBounds.x !== actionBounds.x
        || beforeBounds.y !== actionBounds.y
        || beforeBounds.width !== actionBounds.width
        || beforeBounds.height !== actionBounds.height
      ) {
        throw calculatorError(
          'STALE_TARGET',
          'Calculator.tapCalculatorTexts',
          `Calculator key ${JSON.stringify(visibleText)} OCR observation no longer matches the current window bounds`,
          { expected: beforeBounds, actual: actionBounds },
        );
      }
      const locatedBounds = located.bounds;
      const locatedCenter = located.center;
      const expectedPoint = calculatorKeyPoint(actionWindow, canonicalKey);
      if (
        !locatedBounds
        || ![locatedBounds.x, locatedBounds.y, locatedBounds.width, locatedBounds.height].every(Number.isFinite)
        || Number(locatedBounds.width) <= 0
        || Number(locatedBounds.height) <= 0
        || String(locatedBounds.coordinateSpace || '') !== 'screen'
        || !locatedCenter
        || !Number.isFinite(locatedCenter.x)
        || !Number.isFinite(locatedCenter.y)
        || String(locatedCenter.coordinateSpace || '') !== 'screen'
        || !Geometry.contains(calculatorKeypadRegion(actionWindow), locatedCenter)
      ) {
        throw calculatorError(
          'STALE_TARGET',
          'Calculator.tapCalculatorTexts',
          `Calculator key ${JSON.stringify(visibleText)} OCR geometry is invalid or outside the current verified keypad`,
        );
      }
      const targetInsetPoints = Math.min(2, locatedBounds.width / 4, locatedBounds.height / 4);
      const centerDeltaPercent = {
        x: Math.abs(locatedCenter.x - expectedPoint.x) / Number(actionWindow.width) * 100,
        y: Math.abs(locatedCenter.y - expectedPoint.y) / Number(actionWindow.height) * 100,
      };
      const tolerance = CALCULATOR_ACCESSIBILITY_PROFILE.keyPointTolerancePercent;
      if (
        expectedPoint.x < locatedBounds.x + targetInsetPoints
        || expectedPoint.y < locatedBounds.y + targetInsetPoints
        || expectedPoint.x > locatedBounds.x + locatedBounds.width - targetInsetPoints
        || expectedPoint.y > locatedBounds.y + locatedBounds.height - targetInsetPoints
        || centerDeltaPercent.x > tolerance
        || centerDeltaPercent.y > tolerance
      ) {
        throw calculatorError(
          'STALE_TARGET',
          'Calculator.tapCalculatorTexts',
          `Calculator key ${JSON.stringify(visibleText)} OCR target does not bind to its verified layout key point`,
          {
            expected: expectedPoint,
            actual: { bounds: locatedBounds, center: locatedCenter, centerDeltaPercent },
          },
        );
      }
      point = expectedPoint;
      stage = 'tap';
      await mouse.clickForPID(Number(actionWindow.pid), point.x, point.y);
      inputDispatched = true;
      target = targetEvidence(located);
      dispatch = {
        backend: 'UI.findTexts+mouse.clickForPID/AXPress',
        callState: 'returned',
        provider: options.provider,
      };
      stage = 'postcheck';
      const after = await currentVerifiedCalculatorWindow(false);
      const action = {
        sequence: resultDocument.actionTrace.length + 1,
        calculationNumber: rawOptions.calculationNumber,
        phase: String(rawOptions.phase || 'expression'),
        phaseOrdinal: Number.isInteger(rawOptions.phaseOrdinal) ? rawOptions.phaseOrdinal + index : index + 1,
        keyIndex: index,
        canonicalKey,
        visibleText,
        windowIdentity: { id: String(after.id), pid: Number(after.pid) },
        windowBounds: compactBounds(after),
        target,
        point,
        dispatch,
        preActionWindowBounds: compactBounds(before),
        outcome: 'input-dispatched',
      };
      resultDocument.actionTrace.push(action);
      completed.push(action);
      stage = 'persist';
      await writeResultDocument();
    } catch (error) {
      if (stage === 'persist' && inputDispatched) {
        const checkpointFailure = {
          calculationNumber: rawOptions.calculationNumber,
          phase: String(rawOptions.phase || 'expression'),
          afterKeyIndex: index,
          afterCanonicalKey: canonicalKey,
          afterVisibleText: visibleText,
          completedPrefix: completed.map(item => item.visibleText),
          inputOutcome: 'dispatched-checkpoint-failed',
          cause: errorEvidence(error),
        };
        resultDocument.checkpointFailure = checkpointFailure;
        const checkpointPersistenceError = await tryWriteResultDocument();
        if (checkpointPersistenceError) checkpointFailure.resultPersistenceError = checkpointPersistenceError;
        const wrapped = new Error(
          `Calculator action checkpoint failed after key ${index} (${JSON.stringify(visibleText)}): ${errorMessage(error)}`,
        );
        wrapped.code = 'RESULT_PERSISTENCE_FAILED';
        wrapped.operation = 'Calculator.actionCheckpoint';
        wrapped.completed = completed;
        wrapped.cause = error;
        throw wrapped;
      }
      const failure = {
        calculationNumber: rawOptions.calculationNumber,
        phase: String(rawOptions.phase || 'expression'),
        failedIndex: index,
        canonicalKey,
        visibleText,
        stage,
        completedPrefix: completed.map(item => item.visibleText),
        inputOutcome: stage === 'precheck'
          ? 'not-dispatched'
          : inputDispatched
            ? 'dispatched-postcheck-failed'
            : 'unknown',
        cause: errorEvidence(error),
      };
      await recordFailedCalculatorAction(failure);
      const wrapped = new Error(`Calculator input stopped at key ${index} (${JSON.stringify(visibleText)}): ${errorMessage(error)}`);
      wrapped.code = error && error.code ? error.code : 'CALCULATOR_INPUT_FAILED';
      wrapped.operation = 'tapCalculatorTexts';
      wrapped.failedIndex = index;
      wrapped.failedText = visibleText;
      wrapped.completed = completed;
      wrapped.cause = error;
      throw wrapped;
    }
  }

  return { ok: true, action: 'tapCalculatorTexts', completed };
}

async function currentClearText(options) {
  await currentVerifiedCalculatorWindow(true);
  const observations = [];
  for (const text of ['AC', 'C']) {
    const candidates = (await UI.findTexts(text, options)).map(target => (
      requireTargetProvider(target, options.provider, 'Calculator.clear')
    ));
    observations.push({ text, candidates });
  }
  const matches = observations.filter(item => item.candidates.length === 1);
  const ambiguous = observations.find(item => item.candidates.length > 1);
  if (ambiguous) throw targetCountError(ambiguous.text, ambiguous.candidates, 'Calculator.clear');
  if (matches.length !== 1) {
    const error = new Error(`Expected exactly one Calculator clear state (AC or C), found ${matches.length}`);
    error.code = 'TARGET_NOT_FOUND';
    error.operation = 'Calculator.clear';
    throw error;
  }
  return matches[0].text;
}

async function waitForClearText(expected, options) {
  const started = Date.now();
  let lastError = null;
  let lastObservedClearText = null;
  while (Date.now() - started <= DISPLAY_READY_TIMEOUT_MS) {
    try {
      const current = await currentClearText(options);
      lastObservedClearText = current;
      if (current === expected) return current;
    } catch (error) {
      if (!error || error.code !== 'TARGET_NOT_FOUND') throw error;
      lastError = error;
    }
    if (Date.now() - started >= DISPLAY_READY_TIMEOUT_MS) break;
    await page.waitForTimeout(DISPLAY_POLLING_MS);
  }
  throw calculatorError(
    'TIMEOUT',
    'Calculator.waitForClearText',
    `Calculator clear button did not settle to ${expected}; last observed ${lastObservedClearText || '<none>'}`,
    { expected, actual: lastObservedClearText, cause: lastError, timeoutMs: DISPLAY_READY_TIMEOUT_MS },
  );
}

async function clearCalculator(verifiedWindow, locator, calculationNumber) {
  if (locator.backend === 'accessibility') {
    const firstActionOptions = {
      backend: 'accessibility',
      within: verifiedWindow,
      qualification: locator.qualification,
      canonicalKeys: ['clear'],
      calculationNumber,
      phase: 'clear',
      phaseOrdinal: 1,
    };
    const clearName = locator.qualification
      && locator.qualification.clearTarget
      && locator.qualification.clearTarget.name;
    if (!clearName) throw new Error('Calculator semantic clear target is unavailable');
    const actionStart = resultDocument.actionTrace.length;

    // In Calculator Basic mode, two consecutive presses of the one verified
    // clear control cover both possible states: C then AC, or AC then AC.
    // They are deliberate state-machine actions, not retries. A fresh complete
    // AX snapshot proves a stable zero Display and re-qualifies the exact clear
    // target between the actions; no expression key is dispatched on failure.
    await tapCalculatorTexts([clearName], firstActionOptions);
    const afterFirstClear = await waitForCalculatorAccessibilityDisplay(
      '0',
      'all-clear',
      calculationNumber,
      'after-first-clear',
    );
    const secondClearName = afterFirstClear.clearTarget.name;
    await tapCalculatorTexts([secondClearName], {
      ...firstActionOptions,
      qualification: afterFirstClear.qualification,
      phaseOrdinal: 2,
    });
    const afterSecondClear = await waitForCalculatorAccessibilityDisplay(
      '0',
      'all-clear',
      calculationNumber,
      'after-second-clear',
    );
    const screenshot = await captureCalculatorDisplay(`${calculationNumber}-clear`, true);
    const reset = {
      calculationNumber,
      strategy: 'two-semantic-clear-actions+stable-accessibility-display',
      allClearInvariant: 'For verified Basic-mode states entry-clear and all-clear, applying the clear transition twice ends in all-clear.',
      clearStateProfile: {
        entryClearNames: CALCULATOR_ACCESSIBILITY_CLEAR_STATES.entryClear.slice(),
        allClearNames: CALCULATOR_ACCESSIBILITY_CLEAR_STATES.allClear.slice(),
      },
      clearAccessibleNames: {
        firstAction: clearName,
        secondAction: secondClearName,
        afterSecondAction: afterSecondClear.clearTarget.name,
      },
      actions: resultDocument.actionTrace.slice(actionStart),
      display: {
        screenshot: screenshot.path,
        source: 'Accessibility.snapshot',
        rawDisplay: afterSecondClear.display.rawValue,
        normalizedResult: afterSecondClear.display.normalizedResult,
        stable: afterSecondClear.stable,
        matchedExpected: afterSecondClear.matchedExpected,
        afterFirstClear: {
          display: afterFirstClear.display,
          observations: afterFirstClear.observations,
        },
        afterSecondClear: {
          display: afterSecondClear.display,
          observations: afterSecondClear.observations,
        },
      },
      verified: resultDocument.actionTrace.length - actionStart === 2
        && afterFirstClear.stable === true
        && afterFirstClear.matchedExpected === true
        && afterFirstClear.display.normalizedResult === '0'
        && afterFirstClear.clearTarget.clearState === 'all-clear'
        && afterSecondClear.stable === true
        && afterSecondClear.matchedExpected === true
        && afterSecondClear.display.normalizedResult === '0'
        && afterSecondClear.clearTarget.clearState === 'all-clear',
    };
    resultDocument.resets.push(reset);
    await writeResultDocument();
    if (!reset.verified) throw new Error('Calculator did not reach a verified All Clear / display 0 initial state');
    return reset;
  }

  const options = locator.clearOptions || calculatorClearTextOptions(verifiedWindow, locator.profile);
  const initialClearText = await currentClearText(options);
  const actionStart = resultDocument.actionTrace.length;

  await tapCalculatorTexts([initialClearText], {
    ...options,
    backend: 'ocr',
    canonicalKeys: ['clear'],
    calculationNumber,
    phase: 'clear',
  });

  if (initialClearText === 'C') {
    await waitForClearText('AC', options);
    await tapCalculatorTexts(['AC'], {
      ...options,
      backend: 'ocr',
      canonicalKeys: ['clear'],
      calculationNumber,
      phase: 'clear',
    });
  }

  const finalClearText = await waitForClearText('AC', options);
  const display = await waitForCalculatorDisplay('0', `${calculationNumber}-clear`);
  const reset = {
    calculationNumber,
    initialClearText,
    finalClearText,
    actions: resultDocument.actionTrace.slice(actionStart),
    display: {
      screenshot: display.screenshot.path,
      rawDisplay: display.rawDisplay,
      normalizedResult: display.normalizedResult,
      ocrProvider: display.ocr.provider,
      stable: display.stable,
      matchedExpected: display.matchedExpected,
      observations: display.observations,
    },
    verified: display.stable === true
      && display.matchedExpected === true
      && display.normalizedResult === '0'
      && finalClearText === 'AC',
  };
  resultDocument.resets.push(reset);
  await writeResultDocument();
  if (!reset.verified) throw new Error('Calculator did not reach a verified AC / display 0 initial state');
  return reset;
}

function displayEvidenceName(value) {
  const name = String(value);
  if (!/^[a-zA-Z0-9-]+$/.test(name)) throw new Error(`Invalid Calculator display evidence name: ${JSON.stringify(name)}`);
  return name;
}

async function captureCalculatorDisplay(calculationNumber, semantic = false) {
  const active = await currentVerifiedCalculatorWindow(true);
  const bounds = compactBounds(active);
  if (!semantic) requireVerifiedCalculatorLayout(active);
  const region = CALCULATOR_LAYOUT.displayRegion;
  // Semantic evidence captures the whole exact window, not an unqualified ROI.
  const clip = semantic ? bounds : {
    x: bounds.x + region.x * bounds.width,
    y: bounds.y + region.y * bounds.height,
    width: region.width * bounds.width,
    height: region.height * bounds.height,
  };
  const evidenceName = displayEvidenceName(calculationNumber);
  const path = File.join(Execution.artifactDir, `calculator-display-${evidenceName}.png`);
  const screenshot = await page.screenshot({ clip, path, returnType: 'object' });
  if (!screenshot || !screenshot.path || Number(screenshot.width) <= 0 || Number(screenshot.height) <= 0) {
    throw new Error(`Calculator display ${evidenceName} screenshot is unavailable`);
  }
  const after = await currentVerifiedCalculatorWindow(false);
  const afterBounds = compactBounds(after);
  if (
    String(after.id) !== String(active.id)
    || Number(after.pid) !== Number(active.pid)
    || afterBounds.x !== bounds.x
    || afterBounds.y !== bounds.y
    || afterBounds.width !== bounds.width
    || afterBounds.height !== bounds.height
  ) {
    throw calculatorError(
      'STALE_TARGET',
      'Calculator.captureDisplay',
      'Calculator window identity or bounds changed while capturing the Display ROI',
      { expected: { id: active.id, pid: active.pid, bounds }, actual: { id: after.id, pid: after.pid, bounds: afterBounds } },
    );
  }
  return screenshot;
}

async function runDisplayOCR(imagePath, deadlineAt) {
  const capabilities = await Vision.getCapabilities({});
  const providers = Array.isArray(capabilities.providers) ? capabilities.providers : [];
  const preferred = calculatorRun && calculatorRun.textLocatorProfile;
  const configured = [
    preferred && { name: preferred.provider, lang: preferred.lang, recognitionLevel: preferred.provider === 'apple' ? 'accurate' : undefined },
    { name: 'apple', lang: 'ch', recognitionLevel: 'accurate' },
    { name: 'paddle', lang: 'en' },
    { name: 'local', lang: 'en' },
  ].filter(Boolean);
  const seen = new Set();
  const candidates = configured.filter(candidate => {
    const key = `${candidate.name}:${candidate.lang}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return isUsableTextProvider(providers.find(item => item.provider === candidate.name));
  });
  const attempts = [];

  for (const provider of candidates) {
    const remainingMs = deadlineAt === undefined ? undefined : Math.floor(deadlineAt - Date.now());
    if (remainingMs !== undefined && remainingMs <= 0) break;
    try {
      const request = {
        imagePath,
        provider: provider.name,
        lang: provider.lang,
        includeRaw: true,
      };
      if (provider.recognitionLevel) request.recognitionLevel = provider.recognitionLevel;
      if (remainingMs !== undefined) request.timeoutMs = Math.max(1, remainingMs);
      const response = await Vision.runOCR(request);
      const normalizedResult = normalizeCalculatorDisplay(response.text);
      return {
        provider: `Vision/${response.provider || provider.name}`,
        rawText: response.text,
        lines: Array.isArray(response.lines) ? response.lines : [],
        raw: response.raw,
        normalizedResult,
        capabilities,
        attempts,
      };
    } catch (error) {
      attempts.push({ provider: provider.name, lang: provider.lang, error: errorEvidence(error) });
    }
  }

  const nativeRemainingMs = deadlineAt === undefined ? undefined : Math.floor(deadlineAt - Date.now());
  if (
    (nativeRemainingMs === undefined || nativeRemainingMs > 0)
    && globalThis.NativeExtensions
    && NativeExtensions.macosVision
    && typeof NativeExtensions.macosVision.ocr === 'function'
  ) {
    try {
      const params = {
        imagePath,
        recognitionLevel: 'accurate',
        languages: ['en-US'],
      };
      const response = nativeRemainingMs === undefined
        ? NativeExtensions.macosVision.ocr(params)
        : NativeExtensions.macosVision.ocr(params, { timeoutMs: Math.min(60000, Math.max(1, nativeRemainingMs)) });
      const normalizedResult = normalizeCalculatorDisplay(response.text);
      return {
        provider: 'NativeExtensions/macosVision',
        rawText: response.text,
        lines: Array.isArray(response.items) ? response.items : [],
        normalizedResult,
        capabilities,
        attempts,
      };
    } catch (error) {
      attempts.push({ provider: 'NativeExtensions/macosVision', error: errorEvidence(error) });
    }
  }

  throw calculatorError(
    'OCR_FAILED',
    'Calculator.displayOCR',
    `No usable OCR provider for Calculator display: ${JSON.stringify(attempts)}`,
    { attempts },
  );
}

function normalizeCalculatorDisplay(rawText) {
  const raw = String(rawText === undefined || rawText === null ? '' : rawText);
  const cleaned = raw
    .replace(/[\s,，'’]/g, '')
    .replace(/[−–—﹣－]/g, '-')
    .replace(/^[^0-9+\-.]+/, '')
    .replace(/[^0-9.]+$/, '');
  const matches = cleaned.match(/[+-]?(?:\d+(?:\.\d*)?|\.\d+)/g) || [];
  if (matches.length !== 1) {
    throw calculatorError(
      'DISPLAY_PARSE_FAILED',
      'Calculator.normalizeDisplay',
      `Calculator display OCR is not one unambiguous numeric value: ${JSON.stringify(raw)}`,
    );
  }
  return matches[0].replace(/^\+/, '');
}

async function readCalculatorDisplay(calculationNumber, deadlineAt) {
  const evidenceName = displayEvidenceName(calculationNumber);
  const screenshot = await captureCalculatorDisplay(calculationNumber);
  try {
    const ocr = await runDisplayOCR(screenshot.path, deadlineAt);
    const normalizedResult = ocr.normalizedResult;
    return { screenshot, ocr, rawDisplay: ocr.rawText, normalizedResult };
  } catch (error) {
    try {
      File.write(
        File.join(Execution.artifactDir, `calculator-display-${evidenceName}-ocr-error.json`),
        JSON.stringify({ screenshot, error: errorEvidence(error) }, null, 2) + '\n',
      );
    } catch (sidecarError) {
      error.sidecarPersistenceError = errorEvidence(sidecarError);
    }
    throw error;
  }
}

async function waitForCalculatorDisplay(expected, evidenceName) {
  const normalizedExpected = normalizeExpected(expected);
  const started = Date.now();
  const deadlineAt = started + DISPLAY_READY_TIMEOUT_MS;
  const observations = [];
  let lastDisplay = null;
  let lastError = null;
  let expectedStreak = 0;
  let attempt = 0;

  while (Date.now() - started <= DISPLAY_READY_TIMEOUT_MS) {
    attempt += 1;
    try {
      const display = await readCalculatorDisplay(
        `${displayEvidenceName(evidenceName)}-attempt-${attempt}`,
        deadlineAt,
      );
      const observedAt = Date.now();
      const withinDeadline = observedAt <= deadlineAt;
      lastDisplay = display;
      observations.push({
        elapsedMs: observedAt - started,
        screenshot: display.screenshot.path,
        rawDisplay: display.rawDisplay,
        normalizedResult: display.normalizedResult,
        ocrProvider: display.ocr.provider,
        withinDeadline,
      });
      if (!withinDeadline) {
        expectedStreak = 0;
        break;
      }
      expectedStreak = display.normalizedResult === normalizedExpected ? expectedStreak + 1 : 0;
      if (expectedStreak >= 2) return { ...display, observations, stable: true, matchedExpected: true };
    } catch (error) {
      if (!error || !['OCR_FAILED', 'DISPLAY_PARSE_FAILED'].includes(error.code)) throw error;
      lastError = error;
      expectedStreak = 0;
      observations.push({ elapsedMs: Date.now() - started, error: errorEvidence(error) });
    }

    if (Date.now() - started >= DISPLAY_READY_TIMEOUT_MS) break;
    await page.waitForTimeout(DISPLAY_POLLING_MS);
  }

  if (lastDisplay) return { ...lastDisplay, observations, stable: false, matchedExpected: false };
  throw calculatorError(
    lastError && lastError.code ? lastError.code : 'OCR_FAILED',
    'Calculator.waitForDisplay',
    `Calculator display could not be read: ${errorMessage(lastError)}`,
    { cause: lastError, observations, timeoutMs: DISPLAY_READY_TIMEOUT_MS },
  );
}

async function waitForCalculatorResultDisplay(expected, calculationNumber, locator) {
  if (locator.backend !== 'accessibility') {
    const visual = await waitForCalculatorDisplay(expected, calculationNumber);
    return { ...visual, backend: 'ocr' };
  }
  const semantic = await waitForCalculatorAccessibilityDisplay(
    expected,
    'all-clear',
    calculationNumber,
    'result-oracle',
  );
  const screenshot = await captureCalculatorDisplay(`${calculationNumber}-accessibility-result-oracle`, true);
  return {
    backend: 'accessibility-snapshot',
    rawDisplay: semantic.display.rawValue,
    normalizedResult: semantic.display.normalizedResult,
    stable: semantic.stable,
    matchedExpected: semantic.matchedExpected,
    observations: semantic.observations,
    screenshot,
    accessibility: {
      requestId: semantic.snapshot.requestId,
      windowIdentity: semantic.windowIdentity,
      windowBounds: semantic.windowBounds,
      rootNativeBounds: semantic.rootNativeBounds,
      display: semantic.display,
      clearTarget: semantic.clearTarget,
    },
    ocr: null,
  };
}

function normalizeExpected(expected) {
  return normalizeCalculatorDisplay(String(expected));
}

function verifyCalculatorResult(observed, expected) {
  if (expected === undefined) return false;
  const normalizedExpected = normalizeExpected(expected);
  if (observed !== normalizedExpected) {
    throw new Error(`Calculator result mismatch: expected ${JSON.stringify(normalizedExpected)}, observed ${JSON.stringify(observed)}`);
  }
  return true;
}

async function evaluateCalculatorExpression(expression, expected, calculationNumber) {
  const normalizedExpected = normalizeExpected(expected);
  const inputSequence = calculatorInputSequence(expression);
  const verifiedWindow = await currentVerifiedCalculatorWindow(true);
  const locator = await qualifyCalculatorTextLocator(inputSequence, verifiedWindow, calculationNumber);
  const reset = await clearCalculator(verifiedWindow, locator, calculationNumber);
  const targetPreflight = await preflightCalculatorTexts(inputSequence, locator, calculationNumber);
  const actionStart = resultDocument.actionTrace.length;
  const inputTexts = locator.backend === 'accessibility'
    ? inputSequence.canonicalKeys.map(key => calculatorAccessibilitySequenceTarget(targetPreflight, key).target.name)
    : inputSequence.visibleTexts;

  const inputReceipt = await tapCalculatorTexts(inputTexts, {
    ...locator.options,
    backend: locator.backend,
    qualification: targetPreflight,
    canonicalKeys: inputSequence.canonicalKeys,
    calculationNumber,
    phase: 'expression',
  });

  const display = await waitForCalculatorResultDisplay(normalizedExpected, calculationNumber, locator);
  const calculation = {
    expression,
    canonicalKeys: inputSequence.canonicalKeys.slice(),
    visibleTexts: inputReceipt.completed.map(action => action.visibleText),
    inputBackend: locator.backend,
    locatorProfile: { ...locator.profile },
    ocrProfile: locator.backend === 'ocr' ? { ...locator.profile } : null,
    keypadRegionPercent: locator.backend === 'ocr' ? { ...CALCULATOR_LAYOUT.keypadRegion } : null,
    reset,
    targetPreflight,
    keyActions: resultDocument.actionTrace.slice(actionStart),
    rawDisplay: display.rawDisplay,
    normalizedResult: display.normalizedResult,
    expected: normalizedExpected,
    verified: false,
    displayScreenshot: display.screenshot.path,
    displayRead: {
      backend: display.backend,
      stable: display.stable,
      matchedExpected: display.matchedExpected,
      timeoutMs: DISPLAY_READY_TIMEOUT_MS,
      pollingMs: DISPLAY_POLLING_MS,
      observations: display.observations,
    },
    accessibilityOracle: display.accessibility || null,
    ocr: display.ocr ? {
      provider: display.ocr.provider,
      lines: display.ocr.lines,
    } : null,
  };
  resultDocument.calculations.push(calculation);
  await writeResultDocument();
  if (!display.stable || !display.matchedExpected) {
    verifyCalculatorResult(display.normalizedResult, normalizedExpected);
    throw new Error(`Calculator display matched ${JSON.stringify(normalizedExpected)} only once and did not become stable`);
  }
  calculation.verified = verifyCalculatorResult(display.normalizedResult, expected);
  await writeResultDocument();
  return display.normalizedResult;
}

function substituteFirstResult(expression, firstResult) {
  if (typeof expression !== 'string' || !expression.includes('{result}')) {
    throw new Error('followUp.expression must contain {result}');
  }
  const substituted = expression.split('{result}').join(firstResult);
  if (/[{}]/.test(substituted)) throw new Error('followUp.expression contains an unsupported placeholder');
  tokenizeCalculatorExpression(substituted);
  return substituted;
}

async function main() {
  const input = Execution.input;
  resultDocument = {
    executionId: Execution.id,
    application: {
      bundleId: CALCULATOR_BUNDLE_ID,
      pid: 0,
      windowId: '',
      windowTitle: '',
    },
    windowBounds: {},
    verifiedWindow: null,
    input,
    desktopActionOwnership: {
      requirement: 'one external desktop-action owner for the whole execution',
      runtimeLeaseEnforced: false,
    },
    actionTraceSemantics: 'dispatch-only: Accessibility input uses UI.tapTargets after complete profile qualification; business completion is proven separately by two stable Accessibility Display snapshots. Explicit OCR fallback retains its own independent visual Display oracle.',
    actionTrace: [],
    failedAction: null,
    checkpointFailure: null,
    focusRecoveries: [],
    resets: [],
    textLocatorQualifications: [],
    textLocatorQualificationFailures: [],
    calculations: [],
    finalResult: null,
    passed: false,
  };

  try {
    validateInput(input);
    await page.ensurePermissions({
      capabilities: ['screenCapture', 'accessibility'],
      openSettings: false,
    });
    calculatorRun = await resolveCalculatorWindow();
    resultDocument.application.pid = Number(calculatorRun.window.pid);
    resultDocument.application.windowId = String(calculatorRun.window.id);
    resultDocument.application.windowTitle = String(calculatorRun.window.title || '');

    await window.focus(calculatorRun.window.title);
    await page.waitForTimeout(250);
    await ensureCalculatorActive();
    const bounds = await normalizeAndVerifyLayout();
    const verifiedWindow = await currentVerifiedCalculatorWindow(false);
    resultDocument.windowBounds = bounds;
    resultDocument.verifiedWindow = {
      id: String(verifiedWindow.id),
      pid: Number(verifiedWindow.pid),
      title: String(verifiedWindow.title || ''),
      bounds: compactBounds(verifiedWindow),
      layout: resultDocument.layout.verifiedLayout,
    };

    // Window bounds are logical points; screenshot dimensions are measured
    // image pixels. Reuse the exact-window capture and its before/after guard.
    const initialScreenshot = await captureCalculatorDisplay('window-initial', true);
    resultDocument.initialScreenshot = initialScreenshot.path;
    resultDocument.initialCapture = {
      screenBounds: { ...bounds },
      imageWidth: Number(initialScreenshot.width),
      imageHeight: Number(initialScreenshot.height),
    };
    await writeResultDocument();

    const firstResult = await evaluateCalculatorExpression(input.expression, input.expected, 1);
    let finalResult = firstResult;
    if (input.followUp) {
      const dependentExpression = substituteFirstResult(input.followUp.expression, firstResult);
      resultDocument.followUpExpression = dependentExpression;
      finalResult = await evaluateCalculatorExpression(dependentExpression, input.followUp.expected, 2);
    }

    resultDocument.finalResult = finalResult;
    resultDocument.passed = resultDocument.failedAction === null
      && resultDocument.checkpointFailure === null
      && resultDocument.resets.every(item => item.verified === true)
      && resultDocument.calculations.every(item => item.verified === true);
    await writeResultDocument();
    console.log(JSON.stringify({
      executionId: Execution.id,
      artifactDir: Execution.artifactDir,
      calculations: resultDocument.calculations.map(item => ({
        expression: item.expression,
        result: item.normalizedResult,
        verified: item.verified,
      })),
      finalResult,
      passed: resultDocument.passed,
    }));
    return resultDocument;
  } catch (error) {
    resultDocument.error = errorMessage(error);
    resultDocument.errorDetails = errorEvidence(error);
    resultDocument.passed = false;
    try {
      const display = await readCalculatorDisplay(
        'terminal-failure',
        Date.now() + FAILURE_EVIDENCE_TIMEOUT_MS,
      );
      resultDocument.terminalFailureDisplay = {
        screenshot: display.screenshot.path,
        rawDisplay: display.rawDisplay,
        normalizedResult: display.normalizedResult,
        ocrProvider: display.ocr.provider,
      };
    } catch (displayError) {
      resultDocument.terminalFailureDisplayError = errorEvidence(displayError);
    }
    try {
      await writeResultDocument();
    } catch (writeError) {
      error.resultPersistenceError = errorEvidence(writeError);
    }
    throw error;
  }
}

main();
