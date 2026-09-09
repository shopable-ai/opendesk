RuntimeAPITest.contractObject('Recorder');

(() => {
  const { assert, equal, test } = RuntimeAPITest;

  function rawEvent(sequence, libraryEvent, fields = {}) {
    return {
      formatVersion: 'opendesk.recorder.raw-event/v2',
      eventId: `e${String(sequence).padStart(12, '0')}`,
      sequence: String(sequence),
      libraryEvent,
      nativeTime: String(1000 + sequence * 10),
      nativeClock: 'fixture-monotonic',
      nativeUnit: 'milliseconds',
      receivedAt: new Date(1700000000000 + sequence * 10).toISOString(),
      modifierMask: 0,
      modifiers: [],
      source: 'unknown',
      scopeRef: 'within:fixture',
      ...fields,
    };
  }

  function writeFixture(recordingDir, recordingId, customEvents, options = {}) {
    const raw = customEvents || [
      rawEvent(1, 'MOUSE_PRESSED', {button: 'left', clicks: 1, x: 20, y: 30, coordinateSpace: 'screen-logical', coordinateVerified: true, displayRef: 'fixture-display'}),
      rawEvent(2, 'MOUSE_RELEASED', {button: 'left', clicks: 1, x: 20, y: 30, coordinateSpace: 'screen-logical', coordinateVerified: true, displayRef: 'fixture-display'}),
      rawEvent(3, 'MOUSE_CLICKED', {button: 'left', clicks: 1, x: 20, y: 30, coordinateSpace: 'screen-logical', coordinateVerified: true, displayRef: 'fixture-display'}),
      rawEvent(4, 'KEY_PRESSED', {keycode: 30, rawcode: 65, keychar: 65535}),
      rawEvent(5, 'KEY_TYPED', {keycode: 0, rawcode: 65, keychar: 97, gaps: ['key-typed-is-not-an-ime-commit']}),
      rawEvent(6, 'KEY_RELEASED', {keycode: 30, rawcode: 65, keychar: 65535}),
    ];
    const rawPayload = raw.map((event) => JSON.stringify(event)).join('\n') + '\n';
	const keyboardContextEventIds = new Set(options.keyboardContextEventIds || []);
    const platform = System.getPlatformInfo().os;
    const stoppedAt = '2024-01-01T00:00:01Z';
    const manifest = {
      formatVersion: 'opendesk.recorder.recording/v2',
      recordingId,
      executionId: Execution.id,
      state: 'stopped',
      within: {processId: 4242, title: 'Recorder Fixture'},
      initialWindow: {
        id: 'fixture-window', title: 'Recorder Fixture', handle: 4242, index: 0, isPopup: false,
        application: {
          processId: 4242, executableName: 'RecorderFixture', executablePath: '/fixture/recorder',
          identityKind: 'executable-path', identityValue: '/fixture/recorder',
        },
        bounds: {x: 0, y: 0, width: 800, height: 600}, observedAt: '2024-01-01T00:00:00Z',
      },
      capture: {
        library: 'libuiohook', libraryVersion: '1.2.2',
        libraryCommit: '23acecfe207f8a8b5161bec97a8a6fd6ad0aea88',
        platform, backend: 'synthetic-fixture', permission: 'not-required',
        captureKeyboard: true, keyboardContent: 'non-sensitive-test', evidence: 'target-semantics',
        coordinateSpace: 'screen-logical', pointerMotionPolicy: 'button-held-only', limitations: [],
      },
      queue: {capacity: 4096, contextCapacity: 128},
      startedAt: '2024-01-01T00:00:00Z',
      stoppedAt,
      cutoff: {sequence: String(raw.length), time: stoppedAt},
      counts: {observed: raw.length, accepted: raw.length, persisted: raw.length, filtered: 0, paused: 0, dropped: 0, late: 0},
      storage: {state: 'saved', rawFile: 'raw/events.ndjson', manifestFile: 'manifest.json', rawBytes: rawPayload.length},
      displays: [{index: 1, id: 'fixture-display', hardwareId: 'fixture', isPrimary: true, isBuiltin: false, vendor: 0, model: 0, serial: 0, unit: 0, x: 0, y: 0, width: 800, height: 600, pixelWidth: 800, pixelHeight: 600, scale: 1}],
	  inputContexts: raw.filter(event => event.libraryEvent === 'MOUSE_PRESSED' || event.libraryEvent === 'MOUSE_RELEASED' || event.libraryEvent === 'KEY_TYPED' || (event.libraryEvent === 'MOUSE_WHEEL' && options.includeWheelContexts !== false) || keyboardContextEventIds.has(event.eventId)).map(event => ({
        eventId: event.eventId,
		kind: event.libraryEvent.startsWith('KEY_') ? 'keyboard' : 'pointer',
        ...(event.libraryEvent === 'MOUSE_PRESSED' ? {phase: 'pressed'} : {}),
        ...(event.libraryEvent === 'MOUSE_RELEASED' ? {phase: 'released'} : {}),
		...(event.libraryEvent === 'MOUSE_WHEEL' ? {phase: 'wheel'} : {}),
		...(event.libraryEvent === 'KEY_PRESSED' ? {phase: 'pressed'} : {}),
        status: 'verified', resolutionDelayMs: 1,
		semanticStatus: event.libraryEvent.startsWith('KEY_') || event.libraryEvent === 'MOUSE_WHEEL' ? 'not-applicable' : 'unavailable',
		...(!event.libraryEvent.startsWith('KEY_') && event.libraryEvent !== 'MOUSE_WHEEL' ? {semanticReason: 'synthetic fixture has no accessibility target'} : {}),
        window: {
          id: 'fixture-window', title: 'Recorder Fixture', handle: 4242, index: 0, isPopup: false,
          application: {
            processId: 4242, executableName: 'RecorderFixture', executablePath: '/fixture/recorder',
            identityKind: 'executable-path', identityValue: '/fixture/recorder',
          },
          bounds: {x: 0, y: 0, width: 800, height: 600}, observedAt: event.receivedAt,
        },
      })),
	  textEdits: options.textEdits || [],
      issues: [],
    };
    const editableContextEventIds = new Set(options.editableContextEventIds || []);
    for (const context of manifest.inputContexts) {
      if (!editableContextEventIds.has(context.eventId)) continue;
      const event = raw.find(item => item.eventId === context.eventId);
	  const descriptor = {
        role: 'textField', nativeRole: 'AXTextField', subrole: 'AXSearchField', name: 'Search', identifier: 'search-input',
        enabled: true, focused: true, valueSettable: true, nativeActions: [],
        bounds: {x: 100, y: 100, width: 300, height: 140},
      };
      context.semanticStatus = 'verified';
      delete context.semanticReason;
      context.element = {
        source: 'accessibility', resolution: 'focused-input-fallback', ...descriptor,
        hit: {...descriptor}, ancestors: [],
        point: {
          offsetX: event.x - descriptor.bounds.x, offsetY: event.y - descriptor.bounds.y,
          xRatio: (event.x - descriptor.bounds.x) / descriptor.bounds.width,
          yRatio: (event.y - descriptor.bounds.y) / descriptor.bounds.height,
        },
        observedAt: event.receivedAt,
      };
    }
	const nonEditableContextEventIds = new Set(options.nonEditableContextEventIds || []);
	for (const context of manifest.inputContexts) {
	  if (!nonEditableContextEventIds.has(context.eventId)) continue;
	  const event = raw.find(item => item.eventId === context.eventId);
	  const descriptor = {
		role: 'button', nativeRole: 'AXButton', name: 'Not an input', identifier: 'not-an-input',
		enabled: true, focused: false, valueSettable: false, nativeActions: ['AXPress'],
		bounds: {x: 100, y: 100, width: 300, height: 140},
	  };
	  context.semanticStatus = 'verified';
	  delete context.semanticReason;
	  context.element = {
		source: 'accessibility', resolution: 'point-hit', ...descriptor,
		hit: {...descriptor}, ancestors: [],
		point: {
		  offsetX: event.x - descriptor.bounds.x, offsetY: event.y - descriptor.bounds.y,
		  xRatio: (event.x - descriptor.bounds.x) / descriptor.bounds.width,
		  yRatio: (event.y - descriptor.bounds.y) / descriptor.bounds.height,
		},
		observedAt: event.receivedAt,
	  };
	}
	const alternateWindowContextEventIds = new Set(options.alternateWindowContextEventIds || []);
	for (const context of manifest.inputContexts) {
	  if (alternateWindowContextEventIds.has(context.eventId)) context.window.id = 'fixture-window-other';
	}
    const desktopContextEventIds = new Set(options.desktopContextEventIds || []);
    for (const context of manifest.inputContexts) {
      if (!desktopContextEventIds.has(context.eventId)) continue;
      context.status = 'unverified';
      context.reason = 'pointer release is outside the resolved active window';
      context.semanticStatus = 'not-applicable';
      context.window.bounds.height = 500;
      delete context.semanticReason;
    }
    File.ensureDir(File.join(recordingDir, 'raw'));
    File.write(File.join(recordingDir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
    File.write(File.join(recordingDir, 'raw', 'events.ndjson'), rawPayload);
  }

  test({
    name: 'Recorder capability query and denied start have no capture or storage side effects',
    tier: 'unit',
    covers: ['Recorder.getCapabilities', 'Recorder.start'],
  }, async () => {
    const capabilities = Recorder.getCapabilities();
    equal(capabilities.capture.hostAuthorized, false, 'ordinary local invocation must not authorize capture');
    equal(capabilities.capture.available, false, 'capture availability includes host authorization');
    equal(capabilities.capture.evidenceModes.join(','), 'none,target-semantics', 'Recorder evidence modes');
    equal(capabilities.actions.available, true, 'saved-file actions remain available');
    assert(capabilities.actions.actionSubset.includes('drag.left.straight'), JSON.stringify(capabilities.actions));
	assert(capabilities.actions.actionSubset.includes('drag.left.text-selection-natural'), JSON.stringify(capabilities.actions));
	assert(capabilities.actions.actionSubset.includes('wheel.xy.burst'), JSON.stringify(capabilities.actions));
	assert(capabilities.actions.actionSubset.includes('text.focused-value-patch'), JSON.stringify(capabilities.actions));
	assert(capabilities.actions.actionSubset.includes('keyboard.shortcut'), JSON.stringify(capabilities.actions));
	assert(capabilities.actions.actionSubset.includes('keyboard.special-key'), JSON.stringify(capabilities.actions));
    equal(capabilities.basicGeneration.available, true, 'saved-file generation remains available');
    assert(Object.isFrozen(Recorder), 'JS facade must preserve and freeze the one native Recorder object');

    const deniedOutput = File.join('.runtime', 'recordings', `denied-${Date.now()}`);
    let denied = null;
    try {
      await Recorder.start({within: {processId: 1, title: 'must-not-be-probed'}, outputDir: deniedOutput});
    } catch (error) {
      denied = error;
    }
    assert(denied && denied.code === 'RECORDER_CAPTURE_DENIED', String(denied));
    assert(!File.exists(deniedOutput), 'denied start created storage');

    for (const invalid of [
      {within: {processId: '1', title: 'must-not-be-probed'}},
      {within: {processId: 1, title: 'must-not-be-probed'}, captureKeyboard: 'false'},
      {within: {processId: 1, title: 'must-not-be-probed'}, controlKeycodes: ['67']},
    ]) {
      let invalidError = null;
      try { await Recorder.start(invalid); } catch (error) { invalidError = error; }
      assert(invalidError && invalidError.code === 'INVALID_ARGUMENT', String(invalidError));
    }
  });

  test({
	name: 'Recorder preserves wheel coordinates and generates window or display relative scrolling',
	tier: 'unit',
	covers: ['Recorder.buildActions', 'Recorder.generateScript'],
  }, async () => {
	const root = File.join(Execution.workdir, '.runtime', 'recordings');
	const windowId = `rec-wheel-window-${Date.now()}`;
	const displayId = `rec-wheel-display-${Date.now()}`;
	const windowDir = File.join(root, windowId);
	const displayDir = File.join(root, displayId);
	const wheelEvents = [
	  rawEvent(1, 'MOUSE_WHEEL', {x: 120, y: 140, coordinateSpace: 'screen-logical', coordinateVerified: true, displayRef: 'fixture-display', wheelAmount: 3, wheelRotation: 2, wheelDirection: 3}),
	  rawEvent(2, 'MOUSE_WHEEL', {x: 121, y: 141, coordinateSpace: 'screen-logical', coordinateVerified: true, displayRef: 'fixture-display', wheelAmount: 2, wheelRotation: 1, wheelDirection: 3}),
	  rawEvent(3, 'MOUSE_WHEEL', {x: 121, y: 141, coordinateSpace: 'screen-logical', coordinateVerified: true, displayRef: 'fixture-display', wheelAmount: 4, wheelRotation: -1, wheelDirection: 4}),
	];
	try {
	  writeFixture(windowDir, windowId, wheelEvents);
	  const built = await Recorder.buildActions(windowDir);
	  equal(built.readiness, 'ready', JSON.stringify(built.issues));
	  equal(built.actionCount, 2, 'axis change must split wheel bursts');
	  const actions = JSON.parse(File.read(built.actionsFile));
	  equal(actions.actions[0].kind, 'wheel', 'vertical wheel action kind');
	  equal(actions.actions[0].source.basis, 'libuiohook contiguous same-axis wheel burst', 'auditable wheel basis');
	  equal(actions.actions[0].position.x, 120, 'wheel burst preserves its initial x coordinate');
	  equal(actions.actions[0].position.y, 140, 'wheel burst preserves its initial y coordinate');
	  equal(actions.actions[0].target.kind, 'window', 'verified wheel context uses a window-relative target');
	  equal(actions.actions[0].position.window.offsetX, 120, 'wheel window-relative x offset');
	  equal(actions.actions[0].position.window.offsetY, 140, 'wheel window-relative y offset');
	  equal(actions.actions[0].args.deltaY, 8, 'vertical wheel deltas are accumulated');
	  equal(actions.actions[0].args.steps, 2, 'wheel event count becomes bounded replay steps');
	  equal(actions.actions[0].args.delayMs, 5, 'wheel burst duration becomes per-step delay');
	  equal(actions.actions[1].args.deltaX, -4, 'horizontal wheel direction and sign');
	  const generated = await Recorder.generateScript(built.actionsFile);
	  const source = File.read(generated.scriptFile);
	  const move = 'await mouse.move(__recorderWheelPoint1.x, __recorderWheelPoint1.y);';
	  const wheel = 'await mouse.wheel({ deltaX: 0, deltaY: 8, steps: 2, delay: 5 });';
	  assert(source.includes('__recorderPoint(__recorderWindow1') && source.indexOf(move) >= 0 && source.indexOf(move) < source.indexOf(wheel), source);

	  writeFixture(displayDir, displayId, wheelEvents, {includeWheelContexts: false});
	  const fallback = await Recorder.buildActions(displayDir);
	  equal(fallback.readiness, 'ready', JSON.stringify(fallback.issues));
	  const fallbackActions = JSON.parse(File.read(fallback.actionsFile));
	  equal(fallbackActions.actions[0].target.kind, 'display', 'saved recordings without wheel contexts use a display-relative target');
	  equal(fallbackActions.actions[0].position.display.offsetX, 120, 'display-relative wheel x offset');
	  const fallbackGenerated = await Recorder.generateScript(fallback.actionsFile);
	  const fallbackSource = File.read(fallbackGenerated.scriptFile);
	  assert(fallbackSource.includes('__recorderPoint(__recorderDisplay1') && fallbackSource.indexOf(move) >= 0 && fallbackSource.indexOf(move) < fallbackSource.indexOf(wheel), fallbackSource);
	} finally {
	  File.removeDir(windowDir);
	  File.removeDir(displayDir);
	}
  });

  test({
	name: 'Recorder separates verified Unicode text edits from shortcuts and special keys',
	tier: 'unit',
	covers: ['Recorder.buildActions', 'Recorder.generateScript'],
  }, async () => {
	const recordingId = `rec-keyboard-${Date.now()}`;
	const recordingDir = File.join(Execution.workdir, '.runtime', 'recordings', recordingId);
	const windowSnapshot = {
	  id: 'fixture-window', title: 'Recorder Fixture', handle: 4242, index: 0, isPopup: false,
	  application: {
		processId: 4242, executableName: 'RecorderFixture', executablePath: '/fixture/recorder',
		identityKind: 'executable-path', identityValue: '/fixture/recorder',
	  },
	  bounds: {x: 0, y: 0, width: 800, height: 600}, observedAt: '2024-01-01T00:00:00Z',
	};
	const events = [
	  rawEvent(1, 'KEY_PRESSED', {keycode: 30, rawcode: 0, keychar: 65535}),
	  rawEvent(2, 'KEY_RELEASED', {keycode: 30, rawcode: 0, keychar: 65535}),
	  rawEvent(3, 'KEY_PRESSED', {keycode: 0xe05b, rawcode: 55, keychar: 65535, modifierMask: 1 << 2, modifiers: ['meta-left']}),
	  rawEvent(4, 'KEY_PRESSED', {keycode: 0x002e, rawcode: 8, keychar: 65535, modifierMask: 1 << 2, modifiers: ['meta-left']}),
	  rawEvent(5, 'KEY_RELEASED', {keycode: 0x002e, rawcode: 8, keychar: 65535, modifierMask: 1 << 2, modifiers: ['meta-left']}),
	  rawEvent(6, 'KEY_RELEASED', {keycode: 0xe05b, rawcode: 55, keychar: 65535}),
	  rawEvent(7, 'KEY_PRESSED', {keycode: 0x001c, rawcode: 36, keychar: 65535}),
	  rawEvent(8, 'KEY_RELEASED', {keycode: 0x001c, rawcode: 36, keychar: 65535}),
	];
	try {
	  writeFixture(recordingDir, recordingId, events, {
		keyboardContextEventIds: ['e000000000004', 'e000000000007'],
		textEdits: [{
		  id: 't0001', status: 'verified', sourceEventIds: ['e000000000001', 'e000000000002'],
		  window: windowSnapshot,
		  element: {role: 'textField', nativeRole: 'AXTextField', name: 'Editor', identifier: 'editor', focused: true, valueSettable: true, nativeActions: [], bounds: {x: 10, y: 10, width: 300, height: 40}},
		  before: {sha256: '86f55afa3b3ad99dea93fc26587d8ea6a88cf2c2c4961d0b3ca03efaee2cbc15', utf16Units: 6},
		  patch: {unit: 'utf16-code-unit', start: 6, deleteCount: 0, insertText: '世界'},
		  after: {sha256: 'b75e62dbbc22a24c45daa78d96ebab29e972babf1d779b2903ab9757219c32df', utf16Units: 8},
		  observedAt: '2024-01-01T00:00:00.020Z',
		}],
	  });
	  const built = await Recorder.buildActions(recordingDir);
	  equal(built.readiness, 'ready', JSON.stringify(built.issues));
	  equal(built.actionCount, 3, 'text edit, shortcut, and special key actions');
	  const actions = JSON.parse(File.read(built.actionsFile));
	  equal(actions.actions.map(action => action.kind).join(','), 'text-edit,shortcut,key', JSON.stringify(actions.actions));
	  equal(actions.actions[0].args.textEdit.patch.insertText, '世界', 'explicit non-sensitive text patch');
	  equal(actions.actions[1].args.keys.join(','), 'Meta,C', 'shortcut chord');
	  equal(actions.actions[2].args.key, 'Enter', 'special key');
	  const generated = await Recorder.generateScript(built.actionsFile);
	  const source = File.read(generated.scriptFile);
	  assert(source.includes('editable value precondition mismatch')
		&& source.includes('Accessibility.perform(ref, { action: "setValue", value: next })')
		&& source.includes('text edit postcondition mismatch')
		&& source.includes('await keyboard.combination(...["Meta","C"])')
		&& source.includes('await keyboard.press("Enter")'), source);
	} finally {
	  File.removeDir(recordingDir);
	}
  });

  test({
    name: 'Recorder normalizes input and generates adjustable recorded timing between actions',
    tier: 'unit',
    covers: ['Recorder.buildActions', 'Recorder.generateScript'],
  }, async () => {
    const root = File.join(Execution.workdir, '.runtime', 'recordings');
    const jitterId = `rec-jitter-${Date.now()}`;
    const clickSeriesId = `rec-click-series-${Date.now()}`;
    const spatialDoubleId = `rec-spatial-double-${Date.now()}`;
    const controlId = `rec-control-${Date.now()}`;
    const timingId = `rec-timing-${Date.now()}`;
    const desktopId = `rec-desktop-${Date.now()}`;
    const dragId = `rec-drag-${Date.now()}`;
    const curvedDragId = `rec-curved-drag-${Date.now()}`;
	const naturalSelectionId = `rec-natural-selection-${Date.now()}`;
	const nonTextDragId = `rec-natural-non-text-${Date.now()}`;
	const crossWindowDragId = `rec-natural-cross-window-${Date.now()}`;
	const semanticCurveId = `rec-natural-curve-${Date.now()}`;
	const semanticBacktrackId = `rec-natural-backtrack-${Date.now()}`;
    const recordingDirs = [jitterId, clickSeriesId, spatialDoubleId, controlId, timingId, desktopId, dragId, curvedDragId, naturalSelectionId, nonTextDragId, crossWindowDragId, semanticCurveId, semanticBacktrackId].map(id => File.join(root, id));
    try {
      writeFixture(recordingDirs[0], jitterId, [
        rawEvent(1, 'MOUSE_PRESSED', {button: 'left', clicks: 1, x: 20, y: 30, coordinateSpace: 'screen-logical', coordinateVerified: true, displayRef: 'fixture-display'}),
        rawEvent(2, 'MOUSE_DRAGGED', {button: 'none', x: 21, y: 30, modifierMask: 1 << 8, coordinateSpace: 'screen-logical', coordinateVerified: true, displayRef: 'fixture-display'}),
        rawEvent(3, 'MOUSE_RELEASED', {button: 'left', clicks: 1, x: 21, y: 30, coordinateSpace: 'screen-logical', coordinateVerified: true, displayRef: 'fixture-display'}),
      ]);
      const jitter = await Recorder.buildActions(recordingDirs[0]);
      equal(jitter.readiness, 'ready', JSON.stringify(jitter.issues));
      const jitterActions = JSON.parse(File.read(jitter.actionsFile));
      equal(jitterActions.actions.length, 1, 'bounded production drag shape should become one click');
      equal(jitterActions.actions[0].source.basis, 'libuiohook press/release with bounded drag jitter and no CLICKED event', 'auditable jitter basis');
      equal(jitterActions.actions[0].position.x, 21, 'release position is authoritative');
      const jitterGenerated = await Recorder.generateScript(jitter.actionsFile);
      const jitterSource = File.read(jitterGenerated.scriptFile);
      assert(jitterSource.includes('await mouse.clickPoint(__recorderPoint1'), jitterSource);

      writeFixture(recordingDirs[6], dragId, [
        rawEvent(1, 'MOUSE_PRESSED', {button: 'left', clicks: 1, x: 300, y: 200, coordinateSpace: 'screen-logical', coordinateVerified: true, displayRef: 'fixture-display'}),
        rawEvent(2, 'MOUSE_DRAGGED', {button: 'none', x: 280, y: 200, modifierMask: 1 << 8, coordinateSpace: 'screen-logical', coordinateVerified: true, displayRef: 'fixture-display'}),
        rawEvent(3, 'MOUSE_DRAGGED', {button: 'none', x: 250, y: 201, modifierMask: 1 << 8, coordinateSpace: 'screen-logical', coordinateVerified: true, displayRef: 'fixture-display'}),
        rawEvent(4, 'MOUSE_RELEASED', {button: 'left', clicks: 1, x: 240, y: 201, coordinateSpace: 'screen-logical', coordinateVerified: true, displayRef: 'fixture-display'}),
      ], {editableContextEventIds: ['e000000000001', 'e000000000004']});
      const drag = await Recorder.buildActions(recordingDirs[6]);
      equal(drag.readiness, 'ready', JSON.stringify(drag.issues));
      const dragActions = JSON.parse(File.read(drag.actionsFile));
      equal(dragActions.actions.length, 1, 'straight drag should become one action');
      equal(dragActions.actions[0].kind, 'drag', 'drag action kind');
      equal(dragActions.actions[0].destination.x, 240, 'drag release endpoint');
      equal(dragActions.actions[0].target.pointer.classification, 'text-selection', 'matching editable endpoints classify text selection');
	  equal(dragActions.actions[0].target.pointer.press.window.id, 'fixture-window', 'press endpoint window evidence');
	  equal(dragActions.actions[0].target.pointer.release.window.id, 'fixture-window', 'release endpoint window evidence');
      equal(dragActions.actions[0].target.pointer.press.element.subrole, 'AXSearchField', 'input subrole evidence');
      equal(dragActions.actions[0].target.pointer.release.element.valueSettable, true, 'input editability evidence');
      assert(!File.read(drag.actionsFile).includes('selectedText') && !File.read(drag.actionsFile).includes('"value"'), 'input content must not be recorded');
      const dragGenerated = await Recorder.generateScript(drag.actionsFile);
      const dragSource = File.read(dragGenerated.scriptFile);
      assert(dragSource.includes('await mouse.move(__recorderDragStart1.x, __recorderDragStart1.y)')
        && dragSource.includes('await mouse.down({ button: "left" })')
        && dragSource.includes('try {')
        && dragSource.includes('await mouse.move(__recorderDragEnd1.x, __recorderDragEnd1.y, { steps: 2 })')
        && dragSource.includes('finally {')
        && dragSource.includes('await mouse.up({ button: "left" })'), dragSource);

      writeFixture(recordingDirs[7], curvedDragId, [
        rawEvent(1, 'MOUSE_PRESSED', {button: 'left', clicks: 1, x: 100, y: 100, coordinateSpace: 'screen-logical', coordinateVerified: true, displayRef: 'fixture-display'}),
        rawEvent(2, 'MOUSE_DRAGGED', {button: 'none', x: 150, y: 180, modifierMask: 1 << 8, coordinateSpace: 'screen-logical', coordinateVerified: true, displayRef: 'fixture-display'}),
        rawEvent(3, 'MOUSE_RELEASED', {button: 'left', clicks: 1, x: 200, y: 100, coordinateSpace: 'screen-logical', coordinateVerified: true, displayRef: 'fixture-display'}),
      ]);
      const curvedDrag = await Recorder.buildActions(recordingDirs[7]);
      equal(curvedDrag.readiness, 'blocked', JSON.stringify(curvedDrag));
      assert(curvedDrag.issues.some(issue => issue.code === 'drag-unsupported'), JSON.stringify(curvedDrag.issues));

	  const naturalEvents = () => [
		rawEvent(1, 'MOUSE_PRESSED', {button: 'left', clicks: 1, x: 350, y: 220, modifierMask: 1 << 8, coordinateSpace: 'screen-logical', coordinateVerified: true, displayRef: 'fixture-display'}),
		...[ [348, 220], [317, 216], [278, 211], [224, 206], [188, 206], [180, 209], [163, 216], [140, 220] ].map((point, index) => rawEvent(index + 2, 'MOUSE_DRAGGED', {button: 'none', x: point[0], y: point[1], modifierMask: 1 << 8, coordinateSpace: 'screen-logical', coordinateVerified: true, displayRef: 'fixture-display'})),
		rawEvent(10, 'MOUSE_RELEASED', {button: 'left', clicks: 1, x: 132, y: 220, coordinateSpace: 'screen-logical', coordinateVerified: true, displayRef: 'fixture-display'}),
	  ];
	  const endpointIds = ['e000000000001', 'e000000000010'];
	  writeFixture(recordingDirs[8], naturalSelectionId, naturalEvents(), {editableContextEventIds: endpointIds});
	  const naturalSelection = await Recorder.buildActions(recordingDirs[8]);
	  equal(naturalSelection.readiness, 'ready', JSON.stringify(naturalSelection));
	  const naturalSelectionActions = JSON.parse(File.read(naturalSelection.actionsFile));
	  equal(naturalSelectionActions.actions.length, 1, 'latest natural near-linear shape should become one semantic drag');
	  equal(naturalSelectionActions.actions[0].source.basis, 'libuiohook left press/motion/release natural near-linear text selection', 'natural text selection has an auditable source basis');
	  equal(naturalSelectionActions.actions[0].target.pointer.classification, 'text-selection', 'real matching editable endpoint evidence gates natural selection');
	  const naturalPayload = File.read(naturalSelection.actionsFile);
	  assert(!naturalPayload.includes('"value":') && !naturalPayload.includes('selectedText') && !naturalPayload.includes('"selection":'), 'natural endpoint evidence must remain content-free');
	  const naturalGenerated = await Recorder.generateScript(naturalSelection.actionsFile);
	  assert(File.read(naturalGenerated.scriptFile).includes('await mouse.up({ button: "left" })'), 'natural text selection must preserve finally-up generation');

	  writeFixture(recordingDirs[9], nonTextDragId, naturalEvents(), {nonEditableContextEventIds: endpointIds});
	  const nonTextDrag = await Recorder.buildActions(recordingDirs[9]);
	  equal(nonTextDrag.readiness, 'blocked', JSON.stringify(nonTextDrag));
	  assert(nonTextDrag.issues.some(issue => issue.code === 'drag-unsupported'), JSON.stringify(nonTextDrag.issues));

	  writeFixture(recordingDirs[10], crossWindowDragId, naturalEvents(), {editableContextEventIds: endpointIds, alternateWindowContextEventIds: ['e000000000010']});
	  const crossWindowDrag = await Recorder.buildActions(recordingDirs[10]);
	  equal(crossWindowDrag.readiness, 'blocked', JSON.stringify(crossWindowDrag));
	  assert(crossWindowDrag.issues.some(issue => issue.code === 'drag-unsupported'), JSON.stringify(crossWindowDrag.issues));

	  const curvedNaturalEvents = naturalEvents();
	  curvedNaturalEvents[4] = {...curvedNaturalEvents[4], y: 140};
	  writeFixture(recordingDirs[11], semanticCurveId, curvedNaturalEvents, {editableContextEventIds: endpointIds});
	  const semanticCurve = await Recorder.buildActions(recordingDirs[11]);
	  equal(semanticCurve.readiness, 'blocked', JSON.stringify(semanticCurve));
	  assert(semanticCurve.issues.some(issue => issue.code === 'drag-unsupported'), JSON.stringify(semanticCurve.issues));

	  const backtrackingEvents = naturalEvents();
	  backtrackingEvents[3] = {...backtrackingEvents[3], x: 340};
	  writeFixture(recordingDirs[12], semanticBacktrackId, backtrackingEvents, {editableContextEventIds: endpointIds});
	  const semanticBacktrack = await Recorder.buildActions(recordingDirs[12]);
	  equal(semanticBacktrack.readiness, 'blocked', JSON.stringify(semanticBacktrack));
	  assert(semanticBacktrack.issues.some(issue => issue.code === 'drag-unsupported'), JSON.stringify(semanticBacktrack.issues));

      writeFixture(recordingDirs[1], clickSeriesId, [
        rawEvent(1, 'MOUSE_PRESSED', {button: 'left', clicks: 1, x: 20, y: 30, coordinateSpace: 'screen-logical', coordinateVerified: true, displayRef: 'fixture-display'}),
        rawEvent(2, 'MOUSE_RELEASED', {button: 'left', clicks: 1, x: 20, y: 30, coordinateSpace: 'screen-logical', coordinateVerified: true, displayRef: 'fixture-display'}),
        rawEvent(3, 'MOUSE_CLICKED', {button: 'left', clicks: 1, x: 20, y: 30, coordinateSpace: 'screen-logical', coordinateVerified: true, displayRef: 'fixture-display'}),
        rawEvent(4, 'MOUSE_PRESSED', {button: 'left', clicks: 2, x: 20, y: 80, coordinateSpace: 'screen-logical', coordinateVerified: true, displayRef: 'fixture-display'}),
        rawEvent(5, 'MOUSE_RELEASED', {button: 'left', clicks: 2, x: 20, y: 80, coordinateSpace: 'screen-logical', coordinateVerified: true, displayRef: 'fixture-display'}),
        rawEvent(6, 'MOUSE_CLICKED', {button: 'left', clicks: 2, x: 20, y: 80, coordinateSpace: 'screen-logical', coordinateVerified: true, displayRef: 'fixture-display'}),
      ]);
      const clickSeries = await Recorder.buildActions(recordingDirs[1]);
      equal(clickSeries.readiness, 'ready', JSON.stringify(clickSeries.issues));
      const clickSeriesActions = JSON.parse(File.read(clickSeries.actionsFile));
      equal(clickSeriesActions.actions.length, 2, 'quick clicks at distinct points must remain two physical clicks');
      assert(clickSeriesActions.actions.every(action => action.args.clickCount === 1), JSON.stringify(clickSeriesActions.actions));

      writeFixture(recordingDirs[2], spatialDoubleId, [
        rawEvent(1, 'MOUSE_PRESSED', {button: 'left', clicks: 1, x: 20, y: 30, coordinateSpace: 'screen-logical', coordinateVerified: true, displayRef: 'fixture-display'}),
        rawEvent(2, 'MOUSE_RELEASED', {button: 'left', clicks: 1, x: 20, y: 30, coordinateSpace: 'screen-logical', coordinateVerified: true, displayRef: 'fixture-display'}),
        rawEvent(3, 'MOUSE_CLICKED', {button: 'left', clicks: 1, x: 20, y: 30, coordinateSpace: 'screen-logical', coordinateVerified: true, displayRef: 'fixture-display'}),
        rawEvent(4, 'MOUSE_PRESSED', {button: 'left', clicks: 2, x: 21, y: 30, coordinateSpace: 'screen-logical', coordinateVerified: true, displayRef: 'fixture-display'}),
        rawEvent(5, 'MOUSE_RELEASED', {button: 'left', clicks: 2, x: 21, y: 30, coordinateSpace: 'screen-logical', coordinateVerified: true, displayRef: 'fixture-display'}),
        rawEvent(6, 'MOUSE_CLICKED', {button: 'left', clicks: 2, x: 21, y: 30, coordinateSpace: 'screen-logical', coordinateVerified: true, displayRef: 'fixture-display'}),
      ]);
      const spatialDouble = await Recorder.buildActions(recordingDirs[2]);
      equal(spatialDouble.readiness, 'blocked', JSON.stringify(spatialDouble));
      assert(spatialDouble.issues.some(issue => issue.code === 'click-count-unsupported'), JSON.stringify(spatialDouble.issues));

      const receivedAt = '2024-01-01T00:00:00.070Z';
      writeFixture(recordingDirs[3], controlId, [
        rawEvent(1, 'MOUSE_PRESSED', {button: 'left', clicks: 1, x: 20, y: 30, coordinateSpace: 'screen-logical', coordinateVerified: true, displayRef: 'fixture-display'}),
        rawEvent(2, 'MOUSE_RELEASED', {button: 'left', clicks: 1, x: 20, y: 30, coordinateSpace: 'screen-logical', coordinateVerified: true, displayRef: 'fixture-display'}),
        rawEvent(3, 'MOUSE_CLICKED', {button: 'left', clicks: 1, x: 20, y: 30, coordinateSpace: 'screen-logical', coordinateVerified: true, displayRef: 'fixture-display'}),
        rawEvent(4, 'MOUSE_PRESSED', {receivedAt: '2024-01-01T00:00:00.040Z', button: 'left', clicks: 1, x: 300, y: 400, coordinateSpace: 'screen-logical', coordinateVerified: true, displayRef: 'fixture-display'}),
        rawEvent(5, 'MOUSE_RELEASED', {receivedAt: '2024-01-01T00:00:00.050Z', button: 'left', clicks: 1, x: 300, y: 400, coordinateSpace: 'screen-logical', coordinateVerified: true, displayRef: 'fixture-display'}),
        rawEvent(6, 'MOUSE_CLICKED', {receivedAt: '2024-01-01T00:00:00.060Z', button: 'left', clicks: 1, x: 300, y: 400, coordinateSpace: 'screen-logical', coordinateVerified: true, displayRef: 'fixture-display'}),
        rawEvent(7, 'RECORDER_CONTROL_CLICK', {
          source: 'recorder', receivedAt,
          metadata: {
            windowId: 'scriptRecorderTray', targetId: 'trayStop',
            uiTimestamp: '2024-01-01T00:00:00.069Z',
            triggerEventIds: '["e000000000004","e000000000005","e000000000006"]',
            controlBounds: '{"x":290,"y":390,"width":40,"height":40}',
            matchStatus: 'matched',
          },
        }),
        rawEvent(8, 'RECORDER_CONTROL_CLICK', {
          source: 'recorder', receivedAt: '2024-01-01T00:00:00.090Z',
          metadata: {
            windowId: 'scriptRecorderTray', targetId: 'trayGenerate',
            uiTimestamp: '2024-01-01T00:00:00.089Z', triggerEventIds: '[]',
            controlBounds: '{"x":500,"y":500,"width":40,"height":40}',
            matchStatus: 'not-observed',
          },
        }),
      ]);
      const control = await Recorder.buildActions(recordingDirs[3]);
      equal(control.readiness, 'ready', JSON.stringify(control.issues));
      const controlActions = JSON.parse(File.read(control.actionsFile));
      equal(controlActions.actions.length, 1, 'the explicit control click must not become a target action');
      assert(controlActions.eventDisposition.slice(3).every(item => item.disposition === 'excluded'), JSON.stringify(controlActions.eventDisposition));

      writeFixture(recordingDirs[4], timingId, [
        rawEvent(1, 'MOUSE_PRESSED', {nativeTime: '1000', button: 'left', clicks: 1, x: 20, y: 30, coordinateSpace: 'screen-logical', coordinateVerified: true, displayRef: 'fixture-display'}),
        rawEvent(2, 'MOUSE_RELEASED', {nativeTime: '1010', button: 'left', clicks: 1, x: 20, y: 30, coordinateSpace: 'screen-logical', coordinateVerified: true, displayRef: 'fixture-display'}),
        rawEvent(3, 'MOUSE_CLICKED', {nativeTime: '1010', button: 'left', clicks: 1, x: 20, y: 30, coordinateSpace: 'screen-logical', coordinateVerified: true, displayRef: 'fixture-display'}),
        rawEvent(4, 'MOUSE_PRESSED', {nativeTime: '1400', button: 'left', clicks: 1, x: 40, y: 50, coordinateSpace: 'screen-logical', coordinateVerified: true, displayRef: 'fixture-display'}),
        rawEvent(5, 'MOUSE_RELEASED', {nativeTime: '1410', button: 'left', clicks: 1, x: 40, y: 50, coordinateSpace: 'screen-logical', coordinateVerified: true, displayRef: 'fixture-display'}),
        rawEvent(6, 'MOUSE_CLICKED', {nativeTime: '1410', button: 'left', clicks: 1, x: 40, y: 50, coordinateSpace: 'screen-logical', coordinateVerified: true, displayRef: 'fixture-display'}),
        rawEvent(7, 'MOUSE_PRESSED', {nativeTime: '5000', button: 'left', clicks: 1, x: 60, y: 70, coordinateSpace: 'screen-logical', coordinateVerified: true, displayRef: 'fixture-display'}),
        rawEvent(8, 'MOUSE_RELEASED', {nativeTime: '5010', button: 'left', clicks: 1, x: 60, y: 70, coordinateSpace: 'screen-logical', coordinateVerified: true, displayRef: 'fixture-display'}),
        rawEvent(9, 'MOUSE_CLICKED', {nativeTime: '5010', button: 'left', clicks: 1, x: 60, y: 70, coordinateSpace: 'screen-logical', coordinateVerified: true, displayRef: 'fixture-display'}),
      ]);
      const timing = await Recorder.buildActions(recordingDirs[4]);
      equal(timing.readiness, 'ready', JSON.stringify(timing.issues));
      const generated = await Recorder.generateScript(timing.actionsFile);
      const source = File.read(generated.scriptFile);
      assert(source.includes('await sleep(500); // recorded gap: 390ms'), source);
      assert(source.includes('await sleep(3590); // recorded gap: 3590ms'), source);
      equal(generated.timing.minimumDelayMs, 500, 'default timing floor');
      equal(generated.timing.maximumDelayMs, 30000, 'default timing ceiling');
      equal(generated.timing.speedMultiplier, 1, 'default timing speed');
      const candidate = JSON.parse(File.read(generated.candidateFile));
      equal(candidate.formatVersion, 'opendesk.recorder.basic-candidate/v3', 'window-relative candidate version');
      equal(candidate.timing.minimumDelayMs, 500, 'candidate records resolved timing');
      assert(candidate.mappings.every(item => Number.isInteger(item.line) && item.line > 20), JSON.stringify(candidate.mappings));
      assert(source.includes('await window.get({ ...identity, title: target.title })')
        && source.includes('return await window.get(identity)')
        && source.includes('Geometry.pointOffset')
        && source.includes('Geometry.contains(Geometry.rect(row), point)')
        && source.includes('await mouse.clickPoint(__recorderPoint1'), source);
      assert(!source.includes('await window.list()'), source);
      assert(!source.includes('row.x + position.offsetX') && !source.includes('row.y + position.offsetY'), source);
      assert(!source.includes('target.id') && !source.includes('target.handle') && !source.includes('target.index'), source);
      assert(!source.includes('target.application.processId') && !source.includes('"processId":4242') && !source.includes('"handle":4242'), source);
      assert(source.includes('error.code !== "NOT_FOUND" || error.cause !== undefined'), source);
      assert(generated.constraints.some(item => item.includes('each action uses window.get')), JSON.stringify(generated.constraints));
      assert(generated.constraints.some(item => item.includes('clamped to 500..30000 milliseconds')), JSON.stringify(generated.constraints));

      writeFixture(recordingDirs[5], desktopId, [
        rawEvent(1, 'MOUSE_PRESSED', {button: 'left', clicks: 1, x: 100, y: 550, coordinateSpace: 'screen-logical', coordinateVerified: true, displayRef: 'fixture-display'}),
        rawEvent(2, 'MOUSE_RELEASED', {button: 'left', clicks: 1, x: 100, y: 550, coordinateSpace: 'screen-logical', coordinateVerified: true, displayRef: 'fixture-display'}),
        rawEvent(3, 'MOUSE_CLICKED', {button: 'left', clicks: 1, x: 100, y: 550, coordinateSpace: 'screen-logical', coordinateVerified: true, displayRef: 'fixture-display'}),
      ], {desktopContextEventIds: ['e000000000002']});
      const desktop = await Recorder.buildActions(recordingDirs[5]);
      equal(desktop.readiness, 'ready', JSON.stringify(desktop.issues));
      const desktopActions = JSON.parse(File.read(desktop.actionsFile));
      equal(desktopActions.actions[0].target.kind, 'display', 'desktop chrome click target');
      equal(desktopActions.actions[0].target.display.id, 'fixture-display', 'desktop click display identity');
      equal(desktopActions.actions[0].position.display.offsetY, 550, 'desktop-relative click offset');
      const desktopGenerated = await Recorder.generateScript(desktop.actionsFile);
      const desktopSource = File.read(desktopGenerated.scriptFile);
      assert(desktopSource.includes('Screen.getDisplays()')
        && desktopSource.includes('Geometry.pointOffset')
        && desktopSource.includes('__recorderPoint(__recorderDisplay1')
        && desktopSource.includes('await mouse.clickPoint(__recorderPoint1'), desktopSource);
      assert(!desktopSource.includes('row.x + position.offsetX') && !desktopSource.includes('row.y + position.offsetY'), desktopSource);
      assert(desktopGenerated.constraints.some(item => item.includes('desktop-level clicks resolve exactly one current display')), JSON.stringify(desktopGenerated.constraints));

      const adjusted = await Recorder.generateScript(timing.actionsFile, {
        mode: 'basic', outputFile: 'adjusted.recipe.js',
        timing: {minimumDelayMs: 250, maximumDelayMs: 1000, speedMultiplier: 2},
      });
      const adjustedSource = File.read(adjusted.scriptFile);
      assert(adjustedSource.includes('await sleep(250); // recorded gap: 390ms'), adjustedSource);
      assert(adjustedSource.includes('await sleep(1000); // recorded gap: 3590ms'), adjustedSource);
      equal(adjusted.timing.speedMultiplier, 2, 'custom timing speed');

      let invalidTiming = null;
      try {
        await Recorder.generateScript(timing.actionsFile, {
          outputFile: 'invalid.recipe.js',
          timing: {minimumDelayMs: 501, maximumDelayMs: 500},
        });
      } catch (error) {
        invalidTiming = error;
      }
      assert(invalidTiming && invalidTiming.code === 'INVALID_ARGUMENT', String(invalidTiming));
    } finally {
      for (const recordingDir of recordingDirs) File.removeDir(recordingDir);
    }
  });

  test({
    name: 'Recorder builds fixed actions, rereads bytes, revisions manual edits, and generates non-overwriting basic JS',
    tier: 'unit',
    covers: ['Recorder.buildActions', 'Recorder.generateScript'],
  }, async () => {
    const recordingId = `rec-fixture-${Date.now()}`;
    const recordingDir = File.join(Execution.workdir, '.runtime', 'recordings', recordingId);
    try {
      writeFixture(recordingDir, recordingId);
      const first = await Recorder.buildActions(recordingDir);
      equal(first.revision, 1, 'first revision');
      equal(first.actionCount, 2, 'one click plus one text action');
      equal(first.readiness, 'ready', JSON.stringify(first.issues));

      const original = JSON.parse(File.read(first.actionsFile));
      assert(Array.isArray(original.issues), 'actions issues must be a stable JSON array');
      equal(original.revisionReason, 'initial deterministic build from fixed raw bytes', 'initial revision reason');
      equal(original.revisionBasis, 'Recorder.buildActions/opendesk.recorder.actions-v2', 'revision basis');
      equal(original.actions[0].kind, 'click', 'click action order');
      equal(original.actions[0].target.window.application.identityValue, '/fixture/recorder', 'stable application identity');
      equal(original.actions[0].target.semanticStatus, 'unavailable', 'semantic target availability is explicit');
      equal(original.actions[0].target.semanticReason, 'synthetic fixture has no accessibility target', 'semantic target failure reason');
      equal(original.actions[0].position.window.offsetX, 20, 'window-relative x');
      equal(original.actions[0].position.window.offsetY, 30, 'window-relative y');
      equal(original.actions[1].kind, 'text', 'text action order');
      equal(original.actions[1].target.semanticStatus, 'not-applicable', 'keyboard target semantics are explicit');
      equal(original.actions[1].args.text, 'a', 'typed text');
      assert(original.eventDisposition.every((item) => ['consumed', 'evidence', 'excluded'].includes(item.disposition)), JSON.stringify(original.eventDisposition));

      // The next invocation must reread the actual bytes. An execution-affecting
      // unknown field is rejected instead of using an in-memory prior value.
      const edited = {...original, extraParameters: {button: 'right'}};
      File.write(first.actionsFile, JSON.stringify(edited, null, 2) + '\n');
      let editedError = null;
      try { await Recorder.generateScript(first.actionsFile); } catch (error) { editedError = error; }
      assert(editedError && editedError.code === 'INVALID_RECORDING', String(editedError));

      const rebuilt = await Recorder.buildActions(recordingDir);
      equal(rebuilt.revision, 2, 'manual actions file must not be overwritten');
      assert(rebuilt.actionsFile.endsWith('actions.r002.json'), rebuilt.actionsFile);
      const rebuiltActions = JSON.parse(File.read(rebuilt.actionsFile));
      equal(rebuiltActions.revisionReason, 'prior actions revision had different bytes; rebuilt from fixed raw without overwriting it', 'rebuild revision reason');
      const generated = await Recorder.generateScript(rebuilt.actionsFile);
      equal(generated.verification, 'not-run', 'generation is not replay verification');
      assert(File.isFile(generated.scriptFile) && File.isFile(generated.candidateFile), JSON.stringify(generated));
      const source = File.read(generated.scriptFile);
      assert(source.includes('Geometry.pointOffset')
        && source.includes('Geometry.contains(Geometry.rect(row), point)')
        && source.includes('await mouse.clickPoint(__recorderPoint1'), source);
      assert(!source.includes('row.x + position.offsetX') && !source.includes('row.y + position.offsetY'), source);
      assert(source.includes('await keyboard.type("a");'), source);
      assert(!source.includes('actions.json') && !source.includes('for ('), source);
      const candidate = JSON.parse(File.read(generated.candidateFile));
      equal(candidate.actions.revision, 2, 'candidate pinned revision');
      equal(candidate.verification, 'not-run', 'candidate qualification');

      let overwrite = null;
      try { await Recorder.generateScript(rebuilt.actionsFile); } catch (error) { overwrite = error; }
      assert(overwrite && overwrite.code === 'WOULD_OVERWRITE', String(overwrite));
    } finally {
      File.removeDir(recordingDir);
    }
  });

  test({
    name: 'Recorder recovers only a validated prefix from an unterminated package and blocks generation',
    tier: 'unit',
    covers: ['Recorder.buildActions', 'Recorder.generateScript'],
  }, async () => {
    const recordingId = `rec-recovery-${Date.now()}`;
    const recordingDir = File.join(Execution.workdir, '.runtime', 'recordings', recordingId);
    try {
      writeFixture(recordingDir, recordingId);
      const manifestFile = File.join(recordingDir, 'manifest.json');
      const manifest = JSON.parse(File.read(manifestFile));
      manifest.state = 'recording';
      delete manifest.stoppedAt;
      manifest.storage.state = 'open';
      File.write(manifestFile, JSON.stringify(manifest, null, 2) + '\n');
      File.append(File.join(recordingDir, 'raw', 'events.ndjson'), '{"formatVersion":');

      const recovered = await Recorder.buildActions(recordingDir);
      equal(recovered.readiness, 'blocked', JSON.stringify(recovered));
      equal(recovered.actionCount, 2, 'validated prefix should remain inspectable');
      assert(recovered.issues.some((issue) => issue.code === 'terminal-manifest-missing'), JSON.stringify(recovered.issues));
      assert(recovered.issues.some((issue) => issue.code === 'raw-tail-damaged'), JSON.stringify(recovered.issues));
      let blocked = null;
      try { await Recorder.generateScript(recovered.actionsFile); } catch (error) { blocked = error; }
      assert(blocked && blocked.code === 'GENERATION_BLOCKED', String(blocked));
    } finally {
      File.removeDir(recordingDir);
    }
  });
})();
