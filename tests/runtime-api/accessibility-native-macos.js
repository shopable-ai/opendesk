// Explicit macOS native acceptance against the repository-owned AppKit fixture.
// This file is not part of the ordinary catalog: run it through the opt-in
// accessibility-native-macos gate after launching a fresh fixture instance.

'use strict';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function requiredEnvironment(name) {
  const value = Execution.env[name];
  assert(typeof value === 'string' && value.length > 0, `missing ${name}`);
  return value;
}

function errorDetails(error) {
  const detail = {
    name: String(error && error.name || 'Error'),
    message: String(error && error.message || error),
  };
  for (const key of [
    'code', 'operation', 'backend', 'phase', 'requestId', 'actionState',
    'failedLevel', 'completedLevels', 'expansionOccurred',
  ]) {
    if (error && error[key] !== undefined) detail[key] = error[key];
  }
  return detail;
}

const rootDir = path.resolve(Execution.workdir);
const allowedRoot = path.resolve(rootDir, '.runtime', 'tests', 'accessibility');
const fixtureRoot = path.resolve(allowedRoot, 'macos');
const expectedAppPath = path.resolve(fixtureRoot, 'OpenDeskAccessibilityFixture.app');
const expectedExecutable = path.resolve(expectedAppPath, 'Contents', 'MacOS', 'OpenDeskAccessibilityFixture');
const pid = Number(requiredEnvironment('OPENDESK_ACCESSIBILITY_TARGET_PID'));
const windowId = requiredEnvironment('OPENDESK_ACCESSIBILITY_WINDOW_ID');
const statePath = path.resolve(requiredEnvironment('OPENDESK_ACCESSIBILITY_STATE_PATH'));
const appPath = path.resolve(requiredEnvironment('OPENDESK_ACCESSIBILITY_APP_PATH'));
const evidenceDir = path.resolve(requiredEnvironment('OPENDESK_ACCESSIBILITY_EVIDENCE_DIR'));
const runId = requiredEnvironment('OPENDESK_RUNTIME_API_RUN_ID');

assert(Number.isInteger(pid) && pid > 0, 'explicit fixture PID must be a positive integer');
assert(appPath === expectedAppPath, 'fixture app path is not the repository-owned fixture');
assert(statePath.startsWith(fixtureRoot + path.sep), 'fixture state path is outside the fixture runtime directory');
assert(evidenceDir.startsWith(allowedRoot + path.sep), 'native evidence path is outside .runtime/tests/accessibility');
assert(File.isFile(statePath), 'fixture state file is missing');
assert(File.isFile(expectedExecutable), 'fixture executable is missing');
File.ensureDir(evidenceDir);
assert(!File.exists(File.join(evidenceDir, 'result.json')), 'native result already exists; choose a fresh evidence directory');

function state() {
  const value = JSON.parse(File.read(statePath));
  assert(value && value.schemaVersion === 1, 'fixture state schema changed');
  assert(Number(value.pid) === pid, 'fixture state PID changed');
  assert(value.bundleIdentifier === 'com.opendesk.accessibility-fixture', 'fixture bundle identity changed');
  assert(windowId === `darwin:${pid}:native:${Number(value.windowNumber)}`, 'fixture window identity changed');
  return value;
}

function stateSummary(value) {
  return {
    invokeCount: Number(value.invokeCount),
    setValueCount: Number(value.setValueCount),
    checkboxActionCount: Number(value.checkboxActionCount),
    radioActionCount: Number(value.radioActionCount),
    menuInvokeCount: Number(value.menuInvokeCount),
    menuCheckCount: Number(value.menuCheckCount),
    menuRadioCount: Number(value.menuRadioCount),
    dynamicRevealCount: Number(value.dynamicRevealCount),
    checkboxChecked: value.checkboxChecked,
    selectedRadio: value.selectedRadio,
    menuChecked: value.menuChecked,
    selectedMenuRadio: value.selectedMenuRadio,
    delayedItemMaterialized: value.delayedItemMaterialized,
  };
}

function assertStateTransition(before, after, changes, label) {
  const expected = { ...before, ...changes };
  assert(JSON.stringify(after) === JSON.stringify(expected), `${label} changed unexpected fixture state`);
}

function assertFresh(value) {
  const actual = stateSummary(value);
  const expected = {
    invokeCount: 0, setValueCount: 0, checkboxActionCount: 0, radioActionCount: 0,
    menuInvokeCount: 0, menuCheckCount: 0, menuRadioCount: 0, dynamicRevealCount: 0,
    checkboxChecked: false, selectedRadio: 'one', menuChecked: false,
    selectedMenuRadio: 'one', delayedItemMaterialized: false,
  };
  assert(JSON.stringify(actual) === JSON.stringify(expected), 'fixture must be freshly launched with pristine state');
  assert(value.editableValue === 'initial value', 'fixture editable state is not pristine');
  assert(value.lastAction === 'launched', 'fixture action history is not pristine');
}

async function waitForState(predicate, label) {
  return page.waitForFunction(() => {
    const value = state();
    return predicate(value) && value;
  }, { timeout: 3000, polling: 20 }).catch(() => {
    throw new Error(`${label} state did not become observable`);
  });
}

async function expectError(run, expectedCodes, label, expectedState = 'not_started') {
  let caught = null;
  try {
    await run();
  } catch (error) {
    caught = error;
  }
  assert(caught, `${label} unexpectedly succeeded`);
  assert(expectedCodes.includes(caught.code), `${label} returned an unexpected error code`);
  assert(caught.actionState === expectedState, `${label} returned an unexpected actionState`);
  assert(typeof caught.operation === 'string' && caught.operation.length > 0, `${label} omitted operation`);
  assert(caught.backend === 'macos-ax', `${label} used an unexpected backend`);
  assert(typeof caught.phase === 'string' && caught.phase.length > 0, `${label} omitted phase`);
  assert(/^axreq-[A-Za-z0-9]+-[1-9][0-9]*$/.test(caught.requestId), `${label} omitted requestId`);
  return caught;
}

function windowInfo(row) {
  return {
    id: row.id, title: row.title, pid: Number(row.pid),
    x: Number(row.x), y: Number(row.y), width: Number(row.width), height: Number(row.height),
    exeName: row.exeName, exePath: row.exePath, isForeground: row.isForeground,
    hasFocus: row.hasFocus, handle: Number(row.handle), isPopup: row.isPopup, index: Number(row.index),
  };
}

let fixtureGroup = null;
function instanceFingerprint(instance) {
  return JSON.stringify({
    pid: Number(instance.pid),
    name: instance.name,
    bundleId: instance.bundleId,
    path: path.resolve(instance.path),
    executablePath: path.resolve(instance.executablePath),
    activationPolicy: Number(instance.activationPolicy),
    launchedAt: instance.launchedAt,
  });
}

function requireFixtureGroup(group, label) {
  assert(group && group.pids.length === 1 && Number(group.pids[0]) === pid,
    `${label} did not identify only the reviewed PID`);
  assert(group.instances.length === 1 && Number(group.instances[0].pid) === pid,
    `${label} returned an ambiguous instance set`);
  assert(group.identity && group.identity.kind === 'path' && path.resolve(String(group.identity.value)) === appPath,
    `${label} stable target identity changed`);
  assert(group.bundleId === 'com.opendesk.accessibility-fixture', `${label} bundle identity changed`);
  assert(path.resolve(group.path) === appPath, `${label} app path identity changed`);
  assert(path.resolve(group.instances[0].path) === appPath, `${label} instance app path changed`);
  assert(path.resolve(group.instances[0].executablePath) === expectedExecutable,
    `${label} executable identity changed`);
  return group.instances[0];
}

async function focusFixture() {
  const before = App.get({ path: appPath });
  const beforeInstance = requireFixtureGroup(before, 'pre-activation fixture lookup');
  assert(instanceFingerprint(beforeInstance) === instanceFingerprint(fixtureGroup.instances[0]),
    'fixture instance fingerprint changed before activation');
  const activated = await App.launch({ path: appPath }, {
    activate: true, waitUntilReady: 'window', timeout: 10000,
  });
  const activatedInstance = requireFixtureGroup(activated, 'fixture activation');
  assert(instanceFingerprint(activatedInstance) === instanceFingerprint(beforeInstance),
    'fixture activation changed the reviewed instance fingerprint');
  const deadline = Date.now() + 3000;
  do {
    const matches = (await window.list()).filter((row) => Number(row.pid) === pid && row.id === windowId);
    assert(matches.length <= 1, 'explicit fixture window identity became ambiguous');
    if (matches.length === 1) {
      assert(path.resolve(matches[0].exePath) === expectedExecutable,
        'fixture window executable identity changed');
      if (matches[0].isForeground === true && matches[0].hasFocus === true) return windowInfo(matches[0]);
    }
    if (Date.now() >= deadline) break;
    await delay(50);
  } while (true);
  throw new Error('fixture did not become the verified foreground window');
}

const result = {
  schemaVersion: 1,
  status: 'running',
  gate: 'accessibility-native-macos',
  runId,
  platform: 'darwin',
  fixture: { pid, windowId, bundleIdentifier: 'com.opendesk.accessibility-fixture' },
  covers: [
    'Accessibility.getCapabilities', 'Accessibility.snapshot', 'Accessibility.find',
    'Accessibility.read', 'Accessibility.perform', 'Accessibility.release',
    'UI.getMenuItems', 'UI.findMenuItem', 'UI.tapMenuItem',
  ],
  stages: [],
};
const refs = [];
let failure = null;

async function stage(name, run) {
  const started = Date.now();
  console.log(`[ACCESSIBILITY-NATIVE-MACOS STEP] ${name}`);
  try {
    const detail = await run();
    result.stages.push({ name, status: 'passed', durationMs: Date.now() - started, detail: detail || null });
    return detail;
  } catch (error) {
    result.stages.push({ name, status: 'failed', durationMs: Date.now() - started, error: errorDetails(error) });
    throw error;
  }
}

async function find(selector, within) {
  const ref = await Accessibility.find(selector, { within, timeout: 10000, maxDepth: 8, maxNodes: 1000 });
  assert(ref, 'fixture selector did not resolve');
  refs.push(ref);
  return ref;
}

async function releaseRemaining(strict) {
  let releaseFailure = null;
  for (let index = refs.length - 1; index >= 0; index -= 1) {
    try {
      const released = await Accessibility.release(refs[index]);
      if (strict) assert(released === true, 'owned fixture ref was not released exactly once');
    } catch (error) {
      releaseFailure = releaseFailure || error;
    }
  }
  refs.length = 0;
  if (releaseFailure && strict) throw releaseFailure;
}

async function expectMenuFailure(label, pathValue, finalAction, expectedCodes, expectedCompleted) {
  const within = await focusFixture();
  const caught = await expectError(() => UI.tapMenuItem(pathValue, {
    within, timeout: 10000, maxDepth: 8, maxNodes: 1000, finalAction,
  }), expectedCodes, label);
  assert(caught.failedLevel === pathValue.length - 1, `${label} failedLevel`);
  assert(caught.completedLevels === expectedCompleted, `${label} completedLevels`);
  assert(caught.expansionOccurred === true, `${label} expansionOccurred`);
  await focusFixture();
  return errorDetails(caught);
}

async function invokeMenu(label, pathValue, expectedCount) {
  const before = stateSummary(state());
  assert(before.menuInvokeCount === expectedCount - 1, `${label} baseline changed`);
  const within = await focusFixture();
  const value = await UI.tapMenuItem(pathValue, {
    within, timeout: 10000, maxDepth: 8, maxNodes: 1000,
    finalAction: { action: 'invoke' },
  });
  assert(value.action === 'invoke' && value.actionState === 'acknowledged', `${label} action result`);
  assert(value.completedLevels === pathValue.length && value.expansionOccurred === true, `${label} path result`);
  const observed = await waitForState((current) => current.menuInvokeCount === expectedCount, label);
  const changes = { menuInvokeCount: expectedCount };
  if (pathValue.some((segment) => segment.identifier === 'fixture.menu.delayed.command')) {
    changes.delayedItemMaterialized = true;
  }
  assertStateTransition(before, stateSummary(observed), changes, label);
  return {
    action: value.action, actionState: value.actionState,
    completedLevels: value.completedLevels, expansionOccurred: value.expansionOccurred,
  };
}

try {
  const initial = state();
  assertFresh(initial);
  result.fixture.initial = stateSummary(initial);

  await stage('identity-and-capabilities', async () => {
    fixtureGroup = App.get({ path: appPath });
    requireFixtureGroup(fixtureGroup, 'fixture app path');
    const within = await focusFixture();
    const capabilities = Accessibility.getCapabilities();
    assert(capabilities.platform === 'darwin' && capabilities.backend === 'macos-ax' && capabilities.available === true,
      'macOS AX backend is unavailable');
    assert(capabilities.hostAuthorization.enabled === true, 'Accessibility host authorization is disabled');
    assert(capabilities.implementation.available === true, 'macOS AX implementation is unavailable');
    assert(capabilities.permission.granted === true, 'macOS Accessibility permission is not granted');
    return { backend: capabilities.backend, permission: capabilities.permission.state, windowRoleScope: within.id };
  });

  await stage('menu-read-only', async () => {
    const before = stateSummary(state());
    const within = { app: { pid }, root: 'menuBar' };
    const observed = await UI.getMenuItems({ within, timeout: 10000, maxDepth: 8, maxNodes: 1000 });
    assert(observed.complete === false && observed.truncated === false && observed.reason === 'unmaterialized',
      'collapsed menu observation did not report incomplete materialization');
    const roots = observed.items.filter((item) => item.identifier === 'fixture.menu.root');
    assert(roots.length === 1 && roots[0].children.length === 0, 'read-only menu observation expanded the fixture menu');
    const root = await UI.findMenuItem([{ identifier: 'fixture.menu.root' }], {
      within, timeout: 10000, maxDepth: 8, maxNodes: 1000,
    });
    assert(root && root.identifier === 'fixture.menu.root' && root.children.length === 0,
      'read-only root lookup did not remain collapsed');
    const deepError = await expectError(() => UI.findMenuItem([
      { identifier: 'fixture.menu.root' }, { identifier: 'fixture.menu.invoke' },
    ], { within, timeout: 10000, maxDepth: 8, maxNodes: 1000 }), ['SEARCH_INCOMPLETE'], 'collapsed menu find');
    assert(deepError.failedLevel === 0 && deepError.completedLevels === 0 && deepError.expansionOccurred === false,
      'read-only collapsed lookup reported an expansion');
    assert(JSON.stringify(stateSummary(state())) === JSON.stringify(before),
      'read-only menu observation changed fixture state');
    return { complete: observed.complete, truncated: observed.truncated, reason: observed.reason, stats: observed.stats };
  });

  const within = await focusFixture();
  await stage('snapshot-and-find', async () => {
    const snapshot = await Accessibility.snapshot({
      within, timeout: 10000, maxDepth: 8, maxNodes: 1000,
      properties: [
        'role', 'nativeRole', 'name', 'identifier', 'enabled', 'focused', 'selected',
        'checked', 'expanded', 'actions', 'nativeBounds', 'bounds',
      ],
    });
    assert(snapshot.root && snapshot.root.role === 'window' && snapshot.root.identifier === 'fixture.window.main',
      'window snapshot root identity changed');
    assert(snapshot.complete === true && snapshot.truncated === false && snapshot.reason === null,
      'full fixture snapshot is incomplete');
    assert(snapshot.stats.nodes >= 15, 'fixture snapshot returned too few nodes');
    assert(!JSON.stringify(snapshot).includes('fixture secret'), 'default snapshot leaked a protected value');
    const constrained = await Accessibility.snapshot({ within, timeout: 10000, maxDepth: 8, maxNodes: 1 });
    assert(constrained.complete === false && constrained.truncated === true && constrained.reason === 'maxNodes',
      'snapshot node limit did not report truncation');
    const missing = await Accessibility.find({ identifier: 'fixture.missing' }, {
      within, timeout: 10000, maxDepth: 8, maxNodes: 1000,
    });
    assert(missing === null, 'complete zero-candidate find did not return null');
    await expectError(() => Accessibility.find({ role: 'button', name: 'Duplicate' }, {
      within, timeout: 10000, maxDepth: 8, maxNodes: 1000,
    }), ['AMBIGUOUS_TARGET'], 'duplicate-name find');
    await expectError(() => Accessibility.find({ identifier: 'fixture.missing' }, {
      within, timeout: 10000, maxDepth: 8, maxNodes: 1,
    }), ['SEARCH_INCOMPLETE'], 'bounded incomplete find');
    return { complete: snapshot.complete, truncated: snapshot.truncated, reason: snapshot.reason, stats: snapshot.stats };
  });

  await stage('element-actions', async () => {
    let invokeRef = await find({ role: 'button', identifier: 'fixture.invoke' }, within);
    let before = stateSummary(state());
    const invokeBefore = before.invokeCount;
    const invoked = await Accessibility.perform(invokeRef, { action: 'invoke' }, { timeout: 10000 });
    assert(invoked.actionState === 'acknowledged', 'invoke was not acknowledged');
    let observed = await waitForState((value) => value.invokeCount === invokeBefore + 1, 'invoke');
    assertStateTransition(before, stateSummary(observed), { invokeCount: invokeBefore + 1 }, 'invoke');

    const editableRef = await find({ role: 'textField', identifier: 'fixture.text.editable' }, within);
    before = stateSummary(state());
    const editBefore = before.setValueCount;
    const newValue = `native\u0000fixture value ${editBefore + 1}`;
    const edited = await Accessibility.perform(editableRef, { action: 'setValue', value: newValue }, { timeout: 10000 });
    assert(edited.actionState === 'acknowledged', 'setValue was not acknowledged');
    observed = await waitForState((value) => value.editableValue === newValue && value.setValueCount === editBefore + 1, 'setValue');
    assertStateTransition(before, stateSummary(observed), { setValueCount: editBefore + 1 }, 'setValue');
    const editRead = await Accessibility.read(editableRef, { properties: ['value', 'actions'], timeout: 10000 });
    assert(editRead.properties.value === newValue, 'setValue readback changed');

    const disabledRef = await find({ role: 'button', identifier: 'fixture.disabled' }, within);
    before = stateSummary(state());
    await expectError(() => Accessibility.perform(disabledRef, { action: 'invoke' }, { timeout: 10000 }),
      ['ELEMENT_DISABLED'], 'disabled invoke');
    assertStateTransition(before, stateSummary(state()), {}, 'disabled invoke');

    const readOnlyRef = await find({ identifier: 'fixture.text.readonly' }, within);
    before = stateSummary(state());
    const readOnlyBefore = await Accessibility.read(readOnlyRef, { properties: ['value'], timeout: 10000 });
    await expectError(() => Accessibility.perform(readOnlyRef, { action: 'setValue', value: 'must not write' }, { timeout: 10000 }),
      ['ACTION_NOT_SUPPORTED'], 'read-only setValue');
    const readOnlyAfter = await Accessibility.read(readOnlyRef, { properties: ['value'], timeout: 10000 });
    assert(readOnlyAfter.properties.value === readOnlyBefore.properties.value, 'read-only field changed');
    assertStateTransition(before, stateSummary(state()), {}, 'read-only setValue');

    const protectedRef = await find({ role: 'textField', identifier: 'fixture.text.protected' }, within);
    before = stateSummary(state());
    await expectError(() => Accessibility.read(protectedRef, { properties: ['value'], timeout: 10000 }),
      ['PERMISSION_DENIED'], 'protected value read');
    assertStateTransition(before, stateSummary(state()), {}, 'protected value read');

    const checkboxRef = await find({ role: 'checkbox', identifier: 'fixture.checkbox' }, within);
    before = stateSummary(state());
    const checkBefore = before.checkboxActionCount;
    const checked = await Accessibility.perform(checkboxRef, { action: 'setChecked', checked: true }, { timeout: 10000 });
    assert(checked.actionState === 'acknowledged', 'setChecked was not acknowledged');
    observed = await waitForState((value) => value.checkboxChecked === true && value.checkboxActionCount === checkBefore + 1,
      'setChecked true');
    let after = stateSummary(observed);
    assertStateTransition(before, after, { checkboxActionCount: checkBefore + 1, checkboxChecked: true }, 'setChecked true');
    const alreadyChecked = await Accessibility.perform(checkboxRef, { action: 'setChecked', checked: true }, { timeout: 10000 });
    assert(alreadyChecked.actionState === 'not_needed', 'setChecked did not preserve an already satisfied state');
    assertStateTransition(after, stateSummary(state()), {}, 'not-needed setChecked');

    const radioRef = await find({ role: 'radioButton', identifier: 'fixture.radio.two' }, within);
    before = stateSummary(state());
    const radioBefore = before.radioActionCount;
    const selected = await Accessibility.perform(radioRef, { action: 'select' }, { timeout: 10000 });
    assert(selected.actionState === 'acknowledged', 'select was not acknowledged');
    observed = await waitForState((value) => value.selectedRadio === 'two' && value.radioActionCount === radioBefore + 1,
      'radio select');
    after = stateSummary(observed);
    assertStateTransition(before, after, { radioActionCount: radioBefore + 1, selectedRadio: 'two' }, 'radio select');
    const alreadySelected = await Accessibility.perform(radioRef, { action: 'select' }, { timeout: 10000 });
    assert(alreadySelected.actionState === 'not_needed', 'select did not preserve an already selected state');
    assertStateTransition(after, stateSummary(state()), {}, 'not-needed select');

    assert(await Accessibility.release(invokeRef) === true, 'first release did not return true');
    assert(await Accessibility.release(invokeRef) === false, 'second release did not return false');
    await expectError(() => Accessibility.read(invokeRef), ['STALE_TARGET'], 'released ref read');
    refs.splice(refs.indexOf(invokeRef), 1);
    invokeRef = null;
    return stateSummary(state());
  });

  await stage('release-owned-refs', async () => {
    await releaseRemaining(true);
    return { released: true };
  });

  await stage('menu-fail-closed', async () => {
    const before = stateSummary(state());
    const setCheckedError = await expectMenuFailure('menu setChecked', [
      { identifier: 'fixture.menu.root' }, { identifier: 'fixture.menu.checked' },
    ], { action: 'setChecked', checked: true }, ['STATE_UNKNOWN', 'ACTION_NOT_SUPPORTED'], 1);
    let current = stateSummary(state());
    assertStateTransition(before, current, {}, 'failed menu setChecked');
    const selectError = await expectMenuFailure('menu select', [
      { identifier: 'fixture.menu.root' }, { identifier: 'fixture.menu.radio.two' },
    ], { action: 'select' }, ['ACTION_NOT_SUPPORTED'], 1);
    current = stateSummary(state());
    assertStateTransition(before, current, {}, 'failed menu select');
    const ambiguityError = await expectMenuFailure('menu ambiguity', [
      { identifier: 'fixture.menu.root' }, { identifier: 'fixture.menu.nested' }, { name: 'Duplicate Command' },
    ], { action: 'invoke' }, ['AMBIGUOUS_TARGET'], 2);
    current = stateSummary(state());
    assertStateTransition(before, current, {}, 'ambiguous menu path');
    return {
      setChecked: setCheckedError, select: selectError, ambiguity: ambiguityError,
      counters: current,
    };
  });

  await stage('menu-actions', async () => {
    const baseline = state().menuInvokeCount;
    const twoLevel = await invokeMenu('two-level menu invoke', [
      { identifier: 'fixture.menu.root' }, { identifier: 'fixture.menu.invoke' },
    ], baseline + 1);
    assert(state().delayedItemMaterialized === false, 'two-level path materialized the delayed submenu');
    const threeLevel = await invokeMenu('three-level menu invoke', [
      { identifier: 'fixture.menu.root' }, { identifier: 'fixture.menu.nested' },
      { identifier: 'fixture.menu.deep' },
    ], baseline + 2);
    assert(state().delayedItemMaterialized === false, 'three-level path materialized the delayed submenu');
    const delayed = await invokeMenu('delayed four-level menu invoke', [
      { identifier: 'fixture.menu.root' }, { identifier: 'fixture.menu.nested' },
      { identifier: 'fixture.menu.delayed' }, { identifier: 'fixture.menu.delayed.command' },
    ], baseline + 3);
    await waitForState((value) => value.delayedItemMaterialized === true, 'delayed submenu materialization');
    return { twoLevel, threeLevel, delayed, counters: stateSummary(state()) };
  });
} catch (error) {
  failure = error;
}

try {
  await releaseRemaining(false);
} catch (error) {
  failure = failure || error;
}

try {
  result.fixture.final = stateSummary(state());
} catch (error) {
  result.fixture.final = null;
  result.finalStateError = errorDetails(error);
  failure = failure || error;
}
result.status = failure ? 'failed' : 'passed';
if (failure) result.error = errorDetails(failure);
await File.writeJSON(File.join(evidenceDir, 'result.json'), result, { spaces: 2, createDirs: true });
console.log(`[ACCESSIBILITY-NATIVE-MACOS ${failure ? 'FAIL' : 'PASS'}] ${JSON.stringify({
  runId, status: result.status, stages: result.stages.map((entry) => ({ name: entry.name, status: entry.status })),
  counters: result.fixture.final,
})}`);
if (failure) throw failure;
