// Deterministic Recorder action/generation cases. Run from repository root:
// ./dist/opendesk -script tests/human-to-recipe/coordinate-recipe.js -console-mode script
// This script uses only synthetic, non-sensitive files and replaces every
// generated input/environment global before evaluating a candidate.
'use strict';

(0, eval)(File.read(File.join(File.cwd(), 'tests/runtime-api/framework.js')));
RuntimeAPITest.load('tests/runtime-api/manifest.js');

(() => {
  const { assert, equal, test, withGlobal } = RuntimeAPITest;
  const created = [];
  const platform = System.getPlatformInfo().os;

  // Exercise the real public query implementation over synthetic native rows.
  // Do not duplicate the resolver or enumerate the actual desktop in this fixture.
  const windowSource = File.read(File.join(File.cwd(), 'polyfills/003-window.js'));
  function fixtureWindow(rows, active) {
    const host = { window: {
      list: () => rows,
      getCapabilities: () => ({ platform: 'fixture' }),
      getActiveWindow: () => active,
      getWindowByTitle: () => null,
      getFocusWindow: () => null,
    } };
    new Function('globalThis', 'window', windowSource)(host, host.window);
    return host.window;
  }

  function event(sequence, kind, fields = {}, nativeTime = 1000 + sequence * 10) {
    return {
      formatVersion: 'opendesk.recorder.raw-event/v2', eventId: `e${String(sequence).padStart(12, '0')}`,
      sequence: String(sequence), libraryEvent: kind, nativeTime: String(nativeTime),
      nativeClock: 'fixture-monotonic', nativeUnit: 'milliseconds',
      receivedAt: new Date(1700000000000 + sequence * 10).toISOString(),
      modifierMask: 0, modifiers: [], source: 'unknown', scopeRef: 'within:fixture', ...fields,
    };
  }

  function mouse(sequence, kind, fields = {}, nativeTime) {
    return event(sequence, kind, {
      button: 'left', clicks: 1, x: 20, y: 30, coordinateSpace: 'screen-logical',
      coordinateVerified: true, displayRef: 'fixture-display', ...fields,
    }, nativeTime);
  }

  function packageFor(label, rawEvents) {
    const recordingId = `rec-coordinate-${label}-${Date.now()}-${created.length}`;
    const dir = File.join(Execution.workdir, '.runtime', 'recordings', recordingId);
    created.push(dir);
    const raw = rawEvents.map((item) => JSON.stringify(item)).join('\n') + '\n';
    const snapshot = (observedAt = '2024-01-01T00:00:00Z') => ({
      id: 'fixture-window', title: 'Recorder Fixture', handle: 4242, index: 0, isPopup: false,
      application: {
        processId: 4242, executableName: 'RecorderFixture', executablePath: '/fixture/recorder',
        identityKind: 'executable-path', identityValue: '/fixture/recorder',
      },
      bounds: {x: 0, y: 0, width: 800, height: 600}, observedAt,
    });
    const manifest = {
      formatVersion: 'opendesk.recorder.recording/v2', recordingId, executionId: Execution.id, state: 'stopped',
      within: {processId: 4242, title: 'Recorder Fixture'},
      initialWindow: snapshot(),
      capture: {library: 'libuiohook', libraryVersion: '1.2.2', libraryCommit: '23acecfe207f8a8b5161bec97a8a6fd6ad0aea88', platform, backend: 'synthetic-fixture', permission: 'not-required', captureKeyboard: true, keyboardContent: 'non-sensitive-test', evidence: 'target-semantics', coordinateSpace: 'screen-logical', pointerMotionPolicy: 'button-held-only', limitations: []},
      queue: {capacity: 4096, contextCapacity: 128}, startedAt: '2024-01-01T00:00:00Z', stoppedAt: '2024-01-01T00:00:01Z',
      cutoff: {sequence: String(rawEvents.length), time: '2024-01-01T00:00:01Z'},
      counts: {observed: rawEvents.length, accepted: rawEvents.length, persisted: rawEvents.length, filtered: 0, dropped: 0, late: 0},
      storage: {state: 'saved', rawFile: 'raw/events.ndjson', manifestFile: 'manifest.json', rawBytes: raw.length},
      displays: [{index: 1, id: 'fixture-display', hardwareId: 'fixture', isPrimary: true, isBuiltin: false, vendor: 0, model: 0, serial: 0, unit: 0, x: 0, y: 0, width: 800, height: 600, pixelWidth: 800, pixelHeight: 600, scale: 1}],
      inputContexts: rawEvents.filter(item => item.libraryEvent === 'MOUSE_RELEASED' || item.libraryEvent === 'KEY_TYPED').map(item => ({
        eventId: item.eventId, kind: item.libraryEvent === 'MOUSE_RELEASED' ? 'pointer' : 'keyboard',
		status: 'verified', resolutionDelayMs: 1,
		semanticStatus: item.libraryEvent === 'MOUSE_RELEASED' ? 'unavailable' : 'not-applicable',
		...(item.libraryEvent === 'MOUSE_RELEASED' ? {semanticReason: 'synthetic fixture has no accessibility target'} : {}),
		window: snapshot(item.receivedAt),
      })),
      issues: [],
    };
    File.ensureDir(File.join(dir, 'raw'));
    File.write(File.join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
    File.write(File.join(dir, 'raw', 'events.ndjson'), raw);
    return dir;
  }

  function basicEvents(equalTimestamps = false) {
    const times = equalTimestamps ? [1000, 1000, 1000, 1000, 1000, 1000] : [];
    return [
      mouse(1, 'MOUSE_PRESSED', {}, times[0]), mouse(2, 'MOUSE_RELEASED', {}, times[1]), mouse(3, 'MOUSE_CLICKED', {}, times[2]),
      event(4, 'KEY_PRESSED', {keycode: 30, rawcode: 65, keychar: 65535}, times[3]),
      event(5, 'KEY_TYPED', {keycode: 0, rawcode: 65, keychar: 97, textInputSource: 'keyboard-layout'}, times[4]),
      event(6, 'KEY_RELEASED', {keycode: 30, rawcode: 65, keychar: 65535}, times[5]),
    ];
  }

  async function expectBlocked(label, events, issueCode) {
    const result = await Recorder.buildActions(packageFor(label, events));
    equal(result.readiness, 'blocked', `${label}: ${JSON.stringify(result)}`);
    assert(result.issues.some((issue) => issue.code === issueCode), `${label}: ${JSON.stringify(result.issues)}`);
    return result;
  }

  test({name: 'Calculator production recipe matches its golden and the qualification gate freezes actual source bytes', tier: 'composition', covers: ['Geometry.pointOffset', 'Geometry.contains', 'mouse.clickForPID']}, async () => {
    const recipePath = File.join(Execution.workdir, 'examples', 'human-to-recipe', 'calculator-115.semantic.recipe.js');
    const goldenPath = File.join(Execution.workdir, 'workflows', 'human-to-recipe', 'golden-samples', 'calculator.js');
    const gatePath = File.join(Execution.workdir, 'tests', 'runtime-api', 'calculator-115-semantic-recipe-macos.js');
    const recipe = File.read(recipePath);
    equal(recipe, File.read(goldenPath), 'Calculator golden drifted from the maintained production recipe');
    assert(recipe.includes('Geometry.pointOffset(active, offset.x, offset.y)')
      && recipe.includes('Geometry.contains(Geometry.rect(active), point)')
      && recipe.includes('mouse.clickForPID(Number(active.pid), point.x, point.y)'), recipe);
    assert(!recipe.includes('active.x + offset.x') && !recipe.includes('active.y + offset.y'), recipe);
    for (const forbidden of ['expectedDisplay', 'finalDisplay', 'page.screenshot', 'File.writeJSON', '[PASS]']) {
      assert(!recipe.includes(forbidden), `production recipe contains qualification-only code: ${forbidden}`);
    }
    assert(recipe.includes('Accessibility.snapshot({'),
      'production recipe must observe the confirmed final business result before reporting success');

    (0, eval)(File.read(File.join(Execution.workdir, 'tests', 'runtime-api', 'crypto.js')));
    const recipeSha256 = RuntimeAPICrypto.hashFile(recipePath);
    const gate = File.read(gatePath);
    assert(gate.includes(`const RECIPE_SHA256 = '${recipeSha256}';`), 'qualification gate does not freeze the current production recipe hash');
    assert(gate.includes('runQualifiedRecipe(')
      && gate.includes('qualifiedSource.recipeSource')
      && gate.includes('result.notificationTrace'),
    'qualification gate does not execute and observe the frozen production source');
    assert(gate.includes('await (0, eval)(`(async () => {'), 'qualification gate does not evaluate the exact production bytes in its harness');
  });

  test({name: 'basic mode preserves source order, follows window translation, and rejects ambiguous app windows', tier: 'composition', covers: ['Recorder.buildActions', 'Recorder.generateScript']}, async () => {
    const dir = packageFor('isolated', basicEvents(true));
    const actionsResult = await Recorder.buildActions(dir);
    equal(actionsResult.readiness, 'ready', JSON.stringify(actionsResult.issues));
    const actions = JSON.parse(File.read(actionsResult.actionsFile));
    equal(actions.actions.map((action) => action.kind).join(','), 'click,text', 'equal timestamps reversed source order');
    const generated = await Recorder.generateScript(actionsResult.actionsFile);
    const source = File.read(generated.scriptFile);
    assert(source.includes('await window.get('), 'generated helper must use public window.get');
    assert(!source.includes('identityMatches') && !source.includes('await window.list()'), 'generated helper must not own window enumeration');
    const calls = [];
    await withGlobal('System', {getPlatformInfo: () => ({os: platform})}, () =>
      withGlobal('window', fixtureWindow(
        [{id: 'current-window', pid: 9001, title: 'Recorder Fixture', exeName: 'RecorderFixture', exePath: '/fixture/recorder', x: 100, y: 80, width: 800, height: 600}],
        {id: 'current-window', pid: 9001, title: 'Recorder Fixture', exeName: 'RecorderFixture', exePath: '/fixture/recorder'}
      ), () =>
        withGlobal('mouse', {clickPoint: async (point, options) => { calls.push(['click', point.x, point.y, options]); }}, () =>
          withGlobal('keyboard', {type: async (...args) => { calls.push(['type', ...args]); }}, () =>
            withGlobal('sleep', async (...args) => { calls.push(['sleep', ...args]); }, async () => {
              await (0, eval)(`(async () => {\n${source}\n})()`);
            })))));
    equal(calls.length, 3, JSON.stringify(calls));
    equal(calls[0][0], 'click', JSON.stringify(calls));
    equal(calls[0][1], 120, `translated window x was not applied: ${JSON.stringify(calls)}`);
    equal(calls[0][2], 110, `translated window y was not applied: ${JSON.stringify(calls)}`);
    equal(calls[1][0], 'sleep', JSON.stringify(calls));
    equal(calls[1][1], 500, JSON.stringify(calls));
    equal(calls[2][0], 'type', JSON.stringify(calls));
    equal(calls[2][1], 'a', JSON.stringify(calls));

    let ambiguousClicks = 0;
    let ambiguousError = null;
    try {
      await withGlobal('System', {getPlatformInfo: () => ({os: platform})}, () =>
        withGlobal('window', fixtureWindow([
          {id: 'duplicate-1', pid: 9001, title: 'Recorder Fixture', exeName: 'RecorderFixture', exePath: '/fixture/recorder', x: 0, y: 0, width: 800, height: 600},
          {id: 'duplicate-2', pid: 9002, title: 'Recorder Fixture', exeName: 'RecorderFixture', exePath: '/fixture/recorder', x: 50, y: 50, width: 800, height: 600},
        ], null), () =>
          withGlobal('mouse', {clickPoint: async () => { ambiguousClicks += 1; }}, () =>
            withGlobal('keyboard', {type: async () => {}}, () =>
              withGlobal('sleep', async () => {}, async () => {
                await (0, eval)(`(async () => {\n${source}\n})()`);
              })))));
    } catch (error) {
      ambiguousError = error;
    }
    assert(ambiguousError && ambiguousError.code === 'AMBIGUOUS_TARGET', String(ambiguousError));
    equal(ambiguousClicks, 0, 'ambiguous same-application windows must fail before input');

    let outsideClicks = 0;
    let outsideError = null;
    try {
      await withGlobal('System', {getPlatformInfo: () => ({os: platform})}, () =>
        withGlobal('window', fixtureWindow([
          {id: 'current-window', pid: 9001, title: 'Recorder Fixture', exeName: 'RecorderFixture', exePath: '/fixture/recorder', x: -300, y: 80, width: 10, height: 20},
        ], null), () =>
          withGlobal('mouse', {clickPoint: async () => { outsideClicks += 1; }}, () =>
            withGlobal('keyboard', {type: async () => {}}, () =>
              withGlobal('sleep', async () => {}, async () => {
                await (0, eval)(`(async () => {\n${source}\n})()`);
              })))));
    } catch (error) {
      outsideError = error;
    }
    assert(outsideError && String(outsideError).includes('relative point is outside current window bounds'), String(outsideError));
    equal(outsideClicks, 0, 'window resize must fail before an out-of-bounds click');
  });

  test({name: 'unsupported drag shapes, spatial multi-click, Control-click, missing release and composition never downgrade silently', tier: 'composition', covers: ['Recorder.buildActions']}, async () => {
    await expectBlocked('curved-drag', [
      mouse(1, 'MOUSE_PRESSED'),
      mouse(2, 'MOUSE_DRAGGED', {button: 'none', clicks: 0, modifierMask: 1 << 8, x: 80, y: 90}),
      mouse(3, 'MOUSE_RELEASED', {x: 140, y: 30}),
    ], 'drag-unsupported');
    const counted = await Recorder.buildActions(packageFor('cross-position-click-series', [
      mouse(1, 'MOUSE_PRESSED'), mouse(2, 'MOUSE_RELEASED'), mouse(3, 'MOUSE_CLICKED'),
      mouse(4, 'MOUSE_PRESSED', {clicks: 2, y: 80}), mouse(5, 'MOUSE_RELEASED', {clicks: 2, y: 80}),
      mouse(6, 'MOUSE_CLICKED', {clicks: 2, y: 80}),
    ]));
    equal(counted.readiness, 'ready', JSON.stringify(counted.issues));
    equal(JSON.parse(File.read(counted.actionsFile)).actions.length, 2, 'time/button click counter must not merge distinct points');
    await expectBlocked('double', [
      mouse(1, 'MOUSE_PRESSED'), mouse(2, 'MOUSE_RELEASED'), mouse(3, 'MOUSE_CLICKED'),
      mouse(4, 'MOUSE_PRESSED', {clicks: 2, x: 21}), mouse(5, 'MOUSE_RELEASED', {clicks: 2, x: 21}),
      mouse(6, 'MOUSE_CLICKED', {clicks: 2, x: 21}),
    ], 'click-count-unsupported');
    await expectBlocked('control-click', [mouse(1, 'MOUSE_PRESSED'), mouse(2, 'MOUSE_RELEASED'), mouse(3, 'MOUSE_CLICKED', {modifierMask: 1 << 1, modifiers: ['control-left']})], 'modified-click-unsupported');
    await expectBlocked('missing-release', [mouse(1, 'MOUSE_PRESSED')], 'missing-release-at-stop');
    await expectBlocked('composition', [event(1, 'KEY_TYPED', {keycode: 0, rawcode: 229, keychar: 65535, gaps: ['key-typed-is-not-an-ime-commit']})], 'composition-unsupported');
  });

  test({name: 'invalid source order and unsafe identifiers are rejected before actions are saved', tier: 'composition', covers: ['Recorder.buildActions']}, async () => {
    const reversed = basicEvents();
    reversed[1].sequence = '1';
    let reversedError = null;
    try { await Recorder.buildActions(packageFor('reversed', reversed)); } catch (error) { reversedError = error; }
    assert(reversedError && reversedError.code === 'INVALID_RECORDING', String(reversedError));

    const injected = basicEvents();
    injected[0].eventId = 'event\nawait mouse.click(1,1)';
    let injectedError = null;
    try { await Recorder.buildActions(packageFor('id-injection', injected)); } catch (error) { injectedError = error; }
    assert(injectedError && injectedError.code === 'INVALID_RECORDING', String(injectedError));

    const falseGeometryDir = packageFor('false-geometry', [mouse(1, 'MOUSE_PRESSED', {x: 900}), mouse(2, 'MOUSE_RELEASED', {x: 900}), mouse(3, 'MOUSE_CLICKED', {x: 900})]);
    let geometryError = null;
    try { await Recorder.buildActions(falseGeometryDir); } catch (error) { geometryError = error; }
    assert(geometryError && geometryError.code === 'INVALID_RECORDING', String(geometryError));
  });

  test({name: 'dangling references, missing required evidence declarations, empty text and extra parameters fail strict generation', tier: 'composition', covers: ['Recorder.generateScript']}, async () => {
    const dir = packageFor('strict-generation', basicEvents());
    const built = await Recorder.buildActions(dir);
    const base = JSON.parse(File.read(built.actionsFile));
    const invalid = [
      {...base, actions: base.actions.map((action, index) => index ? action : {...action, source: {...action.source, eventIds: ['missing-event']}})},
      {...base, actions: base.actions.map((action, index) => index ? action : {...action, id: 'bad\nid'})},
      {...base, actions: base.actions.map((action) => action.kind === 'text' ? {...action, args: {...action.args, text: ''}} : action)},
      {...base, actions: base.actions.map((action, index) => index ? action : {...action, beforeRequired: true})},
      {...base, actions: base.actions.map((action, index) => index ? action : {...action, args: {...action.args, delay: 1}})},
      {...base, eventDisposition: base.eventDisposition.slice(1)},
      {...base, actions: base.actions.map((action, index) => index ? action : {...action, source: {...action.source, basis: 'unverified'}})},
    ];
    for (let index = 0; index < invalid.length; index += 1) {
      invalid[index].revision = 10 + index;
      invalid[index].revisionReason = 'prior actions revision had different bytes; rebuilt from fixed raw without overwriting it';
      const file = File.join(dir, `actions.r0${10 + index}.json`);
      File.write(file, JSON.stringify(invalid[index], null, 2) + '\n');
      let failure = null;
      try { await Recorder.generateScript(file, {mode: 'basic', outputFile: `invalid-${index}.js`}); } catch (error) { failure = error; }
      assert(failure && (failure.code === 'INVALID_RECORDING' || failure.code === 'GENERATION_BLOCKED'), `case ${index}: ${String(failure)}`);
    }
  });

  test({name: 'basic mode does not require a fabricated before screenshot', tier: 'composition', covers: ['Recorder.buildActions', 'Recorder.generateScript']}, async () => {
    const dir = packageFor('no-before', [mouse(1, 'MOUSE_PRESSED'), mouse(2, 'MOUSE_RELEASED'), mouse(3, 'MOUSE_CLICKED')]);
    const built = await Recorder.buildActions(dir);
    equal(built.readiness, 'ready', JSON.stringify(built.issues));
    const generated = await Recorder.generateScript(built.actionsFile);
    assert(File.isFile(generated.scriptFile), JSON.stringify(generated));
  });

  test({name: 'cleanup synthetic recording packages', tier: 'quality', covers: ['Recorder.buildActions']}, () => {
    for (const dir of created) File.removeDir(dir);
    assert(created.every((dir) => !File.exists(dir)), JSON.stringify(created));
  });
})();

await RuntimeAPITest.run('HUMAN-TO-RECIPE-COORDINATE');
