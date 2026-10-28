// Safe public-contract coverage for Accessibility. This file is both a
// standalone OpenDesk Runtime test and a loadable unit-catalog test. It never
// resolves a live target or traverses the desktop.
'use strict';

const accessibilityStandalone = typeof globalThis.RuntimeAPITest === 'undefined';
if (accessibilityStandalone) {
  (0, eval)(File.read(File.join(File.cwd(), 'tests/runtime-api/framework.js')));
  RuntimeAPITest.load('tests/runtime-api/manifest.js');
}

(() => {
  const { assert, equal, test } = RuntimeAPITest;
  const applicationScope = { app: { pid: 1 }, root: 'application' };
  const forgedRef = {
    kind: 'AccessibilityElementRef',
    id: 'axref-forged-1',
    role: 'button',
    nativeRole: 'AXButton',
  };

  function assertStructuredError(error, code, operation, options = {}) {
    assert(error && typeof error === 'object', `${operation} must reject with an error object`);
    equal(error.code, code, `${operation} error code`);
    equal(error.operation, operation, `${operation} error operation`);
    assert(typeof error.backend === 'string' && error.backend.length > 0, `${operation} backend is required`);
    assert(typeof error.phase === 'string' && error.phase.length > 0, `${operation} phase is required`);
    assert(typeof error.requestId === 'string', `${operation} requestId must be a string`);
    if (!options.allowEmptyRequestId) {
      assert(/^axreq-[A-Za-z0-9]+-[1-9][0-9]*$/.test(error.requestId), `${operation} requestId is not opaque`);
    }
    equal(error.actionState, 'not_started', `${operation} validation actionState`);
    return error;
  }

  async function expectRejection(invoke, code, operation) {
    let promise;
    try {
      promise = invoke();
    } catch (error) {
      throw new Error(`${operation} threw synchronously instead of returning a rejected Promise: ${error && error.stack || error}`);
    }
    assert(promise && typeof promise.then === 'function', `${operation} must return a Promise`);
    let caught = null;
    try {
      await promise;
    } catch (error) {
      caught = error;
    }
    assert(caught, `${operation} unexpectedly resolved`);
    return assertStructuredError(caught, code, operation);
  }

  test({
    name: 'Accessibility exposes only its six public methods and a truthful non-prompting capability summary',
    tier: 'unit',
    covers: [
      'Accessibility.getCapabilities', 'Accessibility.snapshot', 'Accessibility.find',
      'Accessibility.read', 'Accessibility.perform', 'Accessibility.release',
    ],
  }, async () => {
    const expectedMethods = ['find', 'getCapabilities', 'perform', 'read', 'release', 'snapshot'];
    equal(JSON.stringify(Object.keys(Accessibility).sort()), JSON.stringify(expectedMethods), 'Accessibility public method set');
    assert(globalThis.AccessibilityRuntime === undefined, 'internal AccessibilityRuntime must not be public');
    assert(globalThis.MenuRuntime === undefined, 'a parallel MenuRuntime must not be public');

    const capabilities = Accessibility.getCapabilities();
    equal(capabilities.schemaVersion, 1, 'capability schemaVersion');
    assert(typeof capabilities.platform === 'string' && capabilities.platform.length > 0, 'capability platform');
    assert(typeof capabilities.backend === 'string' && capabilities.backend.length > 0, 'capability backend');
    equal(capabilities.hostAuthorization.enabled, true, 'trusted local script authorization');
    assert(typeof capabilities.implementation.available === 'boolean', 'implementation availability');
    assert(typeof capabilities.implementation.status === 'string' && capabilities.implementation.status.length > 0, 'implementation status');
    assert(typeof capabilities.implementation.menus === 'boolean', 'menu implementation summary');
    assert(typeof capabilities.implementation.coordinateMapping === 'boolean', 'coordinate mapping summary');
    assert(typeof capabilities.implementation.notes === 'string', 'capability notes');
    for (const action of ['invoke', 'setValue', 'prepareTextAppend', 'expand', 'collapse', 'select', 'setChecked']) {
      assert(typeof capabilities.implementation.actions[action] === 'boolean', `action capability ${action}`);
    }
    equal(capabilities.implementation.actions.prepareTextAppend, false,
      'unqualified composition providers must not advertise append preparation');
    assert(typeof capabilities.permission.required === 'boolean', 'permission required');
    assert(typeof capabilities.permission.state === 'string' && capabilities.permission.state.length > 0, 'permission state');
    assert(typeof capabilities.permission.granted === 'boolean', 'permission granted');
    assert(typeof capabilities.permission.cached === 'boolean', 'permission cached');
    equal(
      capabilities.available,
      capabilities.hostAuthorization.enabled && capabilities.implementation.available && capabilities.permission.granted,
      'available must include authorization, implementation, and permission',
    );
    equal(capabilities.limits.defaultTimeoutMs, 3000, 'default timeout');
    equal(capabilities.limits.maxTimeoutMs, 30000, 'maximum timeout');
    equal(capabilities.limits.defaultMaxDepth, 8, 'default depth');
    equal(capabilities.limits.maxMaxDepth, 64, 'maximum depth');
    equal(capabilities.limits.defaultMaxNodes, 1000, 'default nodes');
    equal(capabilities.limits.maxMaxNodes, 5000, 'maximum nodes');
    equal(capabilities.limits.maxActiveRefs, 256, 'active ref limit');
    equal(capabilities.limits.maxQueuedRequests, 32, 'queue limit');
    equal(capabilities.cancellation.hardCancel, false, 'hard cancellation claim');

    let synchronousError = null;
    try {
      Accessibility.getCapabilities({ prompt: true });
    } catch (error) {
      synchronousError = error;
    }
    assert(synchronousError, 'getCapabilities must reject extra arguments synchronously');
    assertStructuredError(synchronousError, 'INVALID_ARGUMENT', 'Accessibility.getCapabilities', { allowEmptyRequestId: true });
  });

  test({
    name: 'Accessibility rejects invalid selectors, scopes, traversal limits, and property lists before native access',
    tier: 'unit',
    covers: ['Accessibility.snapshot', 'Accessibility.find'],
  }, async () => {
    await expectRejection(() => Accessibility.snapshot(), 'INVALID_ARGUMENT', 'Accessibility.snapshot');
    await expectRejection(() => Accessibility.snapshot(null), 'INVALID_ARGUMENT', 'Accessibility.snapshot');
    await expectRejection(
      () => Accessibility.snapshot({ within: applicationScope }, 'extra'),
      'INVALID_ARGUMENT',
      'Accessibility.snapshot',
    );
    await expectRejection(() => Accessibility.snapshot({ within: 42 }), 'INVALID_ARGUMENT', 'Accessibility.snapshot');
    await expectRejection(
      () => Accessibility.snapshot({ within: { app: { pid: 1 } } }),
      'INVALID_ARGUMENT',
      'Accessibility.snapshot',
    );
    await expectRejection(
      () => Accessibility.snapshot({ within: { app: { pid: 1 }, root: 'desktop' } }),
      'INVALID_ARGUMENT',
      'Accessibility.snapshot',
    );
    for (const options of [
      { within: applicationScope, timeout: 0 },
      { within: applicationScope, timeout: 30001 },
      { within: applicationScope, timeout: 1.5 },
      { within: applicationScope, timeout: NaN },
      { within: applicationScope, timeout: Infinity },
      { within: applicationScope, timeout: '1000' },
      { within: applicationScope, maxDepth: 0 },
      { within: applicationScope, maxDepth: 65 },
      { within: applicationScope, maxDepth: 1.5 },
      { within: applicationScope, maxNodes: 0 },
      { within: applicationScope, maxNodes: 5001 },
      { within: applicationScope, maxNodes: -Infinity },
      { within: applicationScope, properties: [] },
      { within: applicationScope, properties: 'role' },
      { within: applicationScope, properties: ['role', 'role'] },
      { within: applicationScope, properties: ['role', null] },
      { within: applicationScope, properties: ['password'] },
      { within: applicationScope, unexpected: true },
      { within: applicationScope, properties: ['textInputState'] },
    ]) {
      await expectRejection(() => Accessibility.snapshot(options), 'INVALID_ARGUMENT', 'Accessibility.snapshot');
    }

    for (const selector of [
      null,
      {},
      { role: '' },
      { role: 'button', name: 7 },
      { role: 'native-widget' },
      { name: 'x'.repeat(1025) },
      { identifier: 'x'.repeat(1025) },
      { role: 'button', contains: 'Save' },
    ]) {
      await expectRejection(
        () => Accessibility.find(selector, { within: applicationScope }),
        'INVALID_ARGUMENT',
        'Accessibility.find',
      );
    }
    await expectRejection(
      () => Accessibility.find({ role: 'button' }),
      'INVALID_ARGUMENT',
      'Accessibility.find',
    );
    await expectRejection(
      () => Accessibility.find({ role: 'button' }, { within: applicationScope, properties: ['role'] }),
      'INVALID_ARGUMENT',
      'Accessibility.find',
    );
    await expectRejection(
      () => Accessibility.find({ role: 'button' }, { within: applicationScope, timeout: NaN }),
      'INVALID_ARGUMENT',
      'Accessibility.find',
    );
    await expectRejection(
      () => Accessibility.find({ role: 'button' }, { within: applicationScope }, 'extra'),
      'INVALID_ARGUMENT',
      'Accessibility.find',
    );

    const secret = 'OPENDESK_ACCESSIBILITY_SECRET_VALUE_9f4d';
    const privacyError = await expectRejection(
      () => Accessibility.find({ name: secret }, { within: applicationScope, unsupportedOption: true }),
      'INVALID_ARGUMENT',
      'Accessibility.find',
    );
    const rendered = String(privacyError && privacyError.message || privacyError) + JSON.stringify(privacyError);
    assert(!rendered.includes(secret), 'validation error leaked selector content');
  });

  test({
    name: 'Accessibility refuses forged references for read, action, release, and nested scope authority',
    tier: 'unit',
    covers: ['Accessibility.snapshot', 'Accessibility.read', 'Accessibility.perform', 'Accessibility.release'],
  }, async () => {
    await expectRejection(() => Accessibility.read(), 'INVALID_ARGUMENT', 'Accessibility.read');
    await expectRejection(() => Accessibility.perform(), 'INVALID_ARGUMENT', 'Accessibility.perform');
    await expectRejection(() => Accessibility.release(), 'INVALID_ARGUMENT', 'Accessibility.release');
    await expectRejection(
      () => Accessibility.snapshot({ within: forgedRef }),
      'INVALID_ARGUMENT',
      'Accessibility.snapshot',
    );
    await expectRejection(() => Accessibility.read(forgedRef), 'INVALID_ARGUMENT', 'Accessibility.read');
    await expectRejection(
      () => Accessibility.read(forgedRef, { properties: ['textInputState'] }),
      'INVALID_ARGUMENT',
      'Accessibility.read',
    );
    await expectRejection(
      () => Accessibility.perform(forgedRef, { action: 'invoke' }),
      'INVALID_ARGUMENT',
      'Accessibility.perform',
    );
    await expectRejection(
      () => Accessibility.perform(forgedRef, { action: 'prepareTextAppend', value: '' }),
      'INVALID_ARGUMENT',
      'Accessibility.perform',
    );
    await expectRejection(() => Accessibility.release(forgedRef), 'INVALID_ARGUMENT', 'Accessibility.release');
    await expectRejection(() => Accessibility.release(forgedRef, forgedRef), 'INVALID_ARGUMENT', 'Accessibility.release');
  });
  test({
    name: 'Accessibility does not trust empty-name AXTextArea metadata as text append authority',
    tier: 'unit',
    covers: ['Accessibility.read', 'Accessibility.perform'],
  }, async () => {
    // A role/name/nativeRole observation is data, not an execution-owned ref.
    // Exercise empty drafts and UTF-16-sensitive drafts without native access.
    const textRef = { ...forgedRef, role: 'textField', nativeRole: 'AXTextArea', name: '' };
    await expectRejection(
      () => Accessibility.read(textRef, { properties: ['value', 'textInputState'] }),
      'INVALID_ARGUMENT',
      'Accessibility.read',
    );
    for (const draft of ['', '原稿\n\n', '草稿😀e\u0301\u0000尾']) {
      const error = await expectRejection(
        () => Accessibility.perform(textRef, { action: 'prepareTextAppend', value: draft }),
        'INVALID_ARGUMENT',
        'Accessibility.perform',
      );
      if (draft) {
        const rendered = String(error.message || error) + JSON.stringify(error);
        assert(!rendered.includes(draft), 'text append rejection leaked the draft');
      }
    }
  });
  // Explicitly opt in only when the caller already verified this OpenCode PID.
  // No process discovery, activation, screenshots, values, or input actions.
  // The exact window excludes unrelated, unmaterialized app menu subtrees.
  const probePID = System.getEnv('OPENDESK_AX_READONLY_PROBE_PID');
  const claudePID = System.getEnv('OPENDESK_AX_CLAUDE_PROBE_PID');
  if (claudePID !== undefined) {
    test({
      name: 'Accessibility optional Claude Code deep tree and description-name observation',
      tier: 'live',
      covers: ['Accessibility.snapshot', 'Accessibility.find', 'Accessibility.read', 'Accessibility.release'],
    }, async () => {
      assert(/^[1-9][0-9]*$/.test(claudePID), 'one verified Claude PID required');
      const exePath = '/Applications/Claude.app/Contents/MacOS/Claude';
      const win = await window.getAppWindow({pid:Number(claudePID),exePath});
      assert(win, 'Claude must already be foreground; test never activates it');
      const tree = await Accessibility.snapshot({within:win,maxDepth:64,maxNodes:2000,
        properties:['role','nativeRole','name','bounds']});
      assert(tree.complete === true && tree.truncated === false, 'deep search must be complete');
      const stack=[tree.root],nodes=[];
      while(stack.length){const node=stack.pop();nodes.push(node);stack.push(...node.children);}
      equal(nodes.filter(n=>n.nativeRole==='AXHeading'&&n.name==='Claude Code').length,1,'native Code heading');
      equal(nodes.filter(n=>n.role==='group'&&n.name==='Primary pane').length,1,'description-based pane name');
      const ref=await Accessibility.find({role:'textField',name:'Prompt'},
        {within:win,maxDepth:64,maxNodes:2000});
      assert(ref,'description-based Prompt must be unique');
      try{
        const read=await Accessibility.read(ref,{properties:['name','nativeRole','bounds','textInputState']});
        equal(read.properties.name,'Prompt','description name survives ref read');
        equal(read.properties.nativeRole,'AXTextArea','native composer role');
        assert(read.properties.bounds?.height>0,'calibrated visible composer bounds');
        equal(read.properties.textInputState.composition,'unknown','unqualified provider stays unknown');
        console.log('[AX-CLAUDE-CODE] '+JSON.stringify({pid:Number(claudePID),stats:tree.stats,observed:read.properties}));
      }finally{await Accessibility.release(ref);}
      const fresh=await window.getAppWindow({pid:Number(claudePID),exePath});
      assert(fresh?.id===win.id&&fresh.handle===win.handle,'same foreground window after observation');
    });
  }
  if (probePID !== undefined) {
    test({
      name: 'Accessibility optional scoped OpenCode geometry and text-state observation',
      tier: 'live',
      covers: ['Accessibility.find', 'Accessibility.read', 'Accessibility.release'],
    }, async () => {
      assert(System.getEnv('OPENDESK_AX_READONLY_PROBE_TARGET') === 'OpenCode',
        'caller must confirm the already verified OpenCode target');
      assert(/^[1-9][0-9]*$/.test(probePID) && Number.isSafeInteger(Number(probePID)),
        'probe requires one explicit positive PID');
      const exePath = System.getEnv('OPENDESK_AX_READONLY_PROBE_EXE');
      assert(typeof exePath === 'string' && /\/OpenCode\.app\/Contents\/MacOS\//i.test(exePath)
        && !/codex/i.test(exePath), 'verified OpenCode executable path required');
      const application = await Accessibility.snapshot({
        within: {app: {pid: Number(probePID)}, root: 'application'},
        maxDepth: 1, maxNodes: 1, properties: ['bounds'],
      });
      assert(application.root, 'application root missing');
      equal(application.root.bounds, null, 'application scope has no coordinate mapping');
      const win = await window.getAppWindow({pid: Number(probePID), exePath});
      assert(win, 'verified target must already be foreground; probe never activates it');
      const ref = await Accessibility.find({ role: 'textField' }, {
        within: win,
        timeout: 5000, maxDepth: 32, maxNodes: 2500,
      });
      assert(ref, 'scope has no unique textField');
      try {
        const result = await Accessibility.read(ref, {
          properties: ['role', 'nativeRole', 'name', 'nativeBounds', 'bounds', 'textInputState', 'actions'],
          timeout: 5000,
        });
        const observed = result.properties;
        assert(observed.nativeRole === 'AXTextArea',
          'unique scoped field must remain an AXTextArea');
        assert(Object.prototype.hasOwnProperty.call(observed, 'nativeBounds'), 'nativeBounds result is missing');
        if (observed.nativeBounds !== null) {
          for (const key of ['x', 'y', 'width', 'height']) {
            assert(Number.isFinite(observed.nativeBounds[key]), `nativeBounds.${key} must be finite`);
          }
          assert(observed.nativeBounds.width >= 0 && observed.nativeBounds.height >= 0,
            'native geometry must not have negative dimensions');
          equal(observed.nativeBounds.coordinateSpace, 'macos-global-display-points-top-left',
            'native coordinate space');
        }
        console.log('[AX-READONLY-PROBE] ' + JSON.stringify({
          pid: Number(probePID), observed,
          geometry: observed.nativeBounds === null ? 'native_geometry_unavailable'
            : observed.bounds === null ? 'native_geometry_present_projection_unavailable' : 'projected',
          settableAttributes: 'not exposed by the public API; requires scoped native read-only inspection',
        }));
        assert(observed.bounds && observed.bounds.coordinateSpace === 'screen',
          'window-scoped field requires qualified geometry');
      } finally {
        await Accessibility.release(ref);
      }
    });
    if (System.getEnv('OPENDESK_AX_READONLY_PROBE_WINDOW') === '1') {
      test({
        name: 'Accessibility optional exact-window coordinate calibration survives repeated reads',
        tier: 'live',
        covers: ['Accessibility.snapshot', 'Accessibility.find', 'Accessibility.read', 'Accessibility.release'],
      }, async () => {
        assert(System.getEnv('OPENDESK_AX_READONLY_PROBE_TARGET') === 'OpenCode', 'explicit OpenCode target required');
        const exePath = System.getEnv('OPENDESK_AX_READONLY_PROBE_EXE');
        assert(typeof exePath === 'string' && /\/OpenCode\.app\/Contents\/MacOS\//i.test(exePath)
          && !/codex/i.test(exePath), 'verified OpenCode executable path required');
        const win = await window.getAppWindow({ pid: Number(probePID), exePath });
        assert(win, 'verified target must already be foreground; probe never activates it');
        await verifyAccessibilityWindowMapping(win);
      });
    }
  }
})();

// Parent may also call this with an owned fixture WindowInfo. An optional
// callback lets the parent move/resize that fixture while this Runtime retains
// its ref. This helper never moves or resizes a window by itself.
async function verifyAccessibilityWindowMapping(win, changeGeometry) {
  const { assert, equal } = RuntimeAPITest;
  const root = await Accessibility.snapshot({
    within: win, properties: ['nativeBounds', 'bounds'], maxDepth: 1, maxNodes: 1,
  });
  assert(root.root && root.root.nativeBounds && root.root.bounds, 'exact window anchor must calibrate');
  const anchor = root.root.nativeBounds;
  for (const key of ['x', 'y', 'width', 'height']) {
    assert(Math.abs(anchor[key] - win[key]) <= 1, `anchor ${key} exceeds one point tolerance`);
  }
  equal(root.root.bounds.coordinateSpace, 'screen', 'root bounds tag');
  const ref = await Accessibility.find({ role: 'textField' }, { within: win, maxDepth: 32, maxNodes: 2500 });
  assert(ref, 'fixture must contain one unique textField');
  try {
    for (let sample = 0; sample < 2; sample++) {
      const read = await Accessibility.read(ref, { properties: ['nativeBounds', 'bounds'] });
      const { nativeBounds: native, bounds } = read.properties;
      assert(native && bounds, 'window-scoped field must preserve calibrated bounds across read');
      equal(bounds.coordinateSpace, 'screen', 'field bounds tag');
      const expected = {
        x: win.x + (native.x - anchor.x) * win.width / anchor.width,
        y: win.y + (native.y - anchor.y) * win.height / anchor.height,
        width: native.width * win.width / anchor.width,
        height: native.height * win.height / anchor.height,
      };
      for (const key of ['x', 'y', 'width', 'height']) {
        assert(Number.isFinite(bounds[key]) && Math.abs(bounds[key] - expected[key]) <= 0.000001,
          `field ${key} does not use the calibrated anchor`);
      }
    }
    // A narrow read must preserve the same fresh geometry and expose only
    // requested fields. It must not depend on the previous read's projection.
    for (const property of ['role', 'nativeRole', 'focused', 'value', 'textInputState', 'bounds']) {
      const narrow = await Accessibility.read(ref, { properties: [property] });
      equal(JSON.stringify(Object.keys(narrow.properties)), JSON.stringify([property]),
        'narrow read must not expose unrequested properties');
      if (property === 'bounds') {
        assert(narrow.properties.bounds && narrow.properties.bounds.coordinateSpace === 'screen',
          'bounds-only read must still validate and project its own geometry');
      }
      if (property === 'textInputState' && narrow.properties.textInputState !== null) {
        equal(narrow.properties.textInputState.unit, 'utf16', 'text state unit');
        equal(narrow.properties.textInputState.composition, 'unknown', 'provider remains unqualified');
      }
    }
    if (changeGeometry !== undefined) {
      assert(typeof changeGeometry === 'function', 'geometry change must be parent-controlled');
      await changeGeometry();
      let rejected;
      try { await Accessibility.read(ref, { properties: ['bounds'] }); } catch (error) { rejected = error; }
      assert(rejected, 'old mapping must not survive a confirmed window move/resize');
      equal(rejected.code, 'STALE_TARGET', 'changed window mapping rejection');
    }
    console.log('[AX-WINDOW-MAPPING] verified anchor and repeated ref reads; geometry-change check=' + (changeGeometry !== undefined));
  } finally {
    await Accessibility.release(ref);
  }
}

if (accessibilityStandalone) {
  const keepAlive = setInterval(() => {}, 60000);
  RuntimeAPITest.run('RUNTIME-API-ACCESSIBILITY').then(
    () => clearInterval(keepAlive),
    (error) => {
      clearInterval(keepAlive);
      throw error;
    },
  );
}
