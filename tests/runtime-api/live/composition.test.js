(() => {
  const { assert, equal, test } = RuntimeAPITest;

  function hex(value) {
    return String(value || '').trim().toLowerCase();
  }

  function maxChannelDelta(left, right) {
    const parse = (value) => {
      const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(value);
      return match ? match.slice(1).map((part) => parseInt(part, 16)) : null;
    };
    const a = parse(left);
    const b = parse(right);
    assert(a && b, JSON.stringify({ left, right }));
    return Math.max(...a.map((channel, index) => Math.abs(channel - b[index])));
  }

  function clickEvents(snapshot) {
    return RuntimeLive.events(snapshot, 'click');
  }

  async function moveAndConfirm(id) {
    const target = RuntimeLive.target(id);
    let actual = null;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      await mouse.move(target.point.x, target.point.y, { steps: 10 });
      await page.waitFor(25);
      actual = await mouse.getPos();
      if (Math.abs(actual.x - target.point.x) <= 2 && Math.abs(actual.y - target.point.y) <= 2) break;
    }
    assert(Math.abs(actual.x - target.point.x) <= 2 && Math.abs(actual.y - target.point.y) <= 2, JSON.stringify({ id, target, actual }));
    return target;
  }

  async function clickAndWait(id, expectedClicks) {
    const target = await moveAndConfirm(id);
    await mouse.click(target.point.x, target.point.y, { delay: 30 });
    const snapshot = await RuntimeLive.waitForExactCount('click', expectedClicks);
    const matching = clickEvents(snapshot).filter((event) => (event.target || event.detail && event.detail.target) === id);
    assert(matching.length >= 1, JSON.stringify({ id, expectedClicks, snapshot }));
    return { target, snapshot };
  }

  test({
    name: 'composition multi-control Test Lab closes the semantic and pixel feedback loop',
    tier: 'composition',
    covers: [
      'mouse.move', 'mouse.getPos', 'mouse.click', 'keyboard.type', 'keyboard.press',
      'page.screenshot', 'Screen.pixel', 'File.ensureDir', 'File.write',
    ],
  }, async () => {
    let originalWindow = null;
    let evidenceDir = null;
    try {
      const opened = await RuntimeLive.openWith('openURLInApp', 'composition-test-lab');
      originalWindow = opened.windowInfo;
      await RuntimeLive.resetUI();
      await RuntimeLive.reset();

      const initial = await RuntimeLive.state();
      assert(initial.telemetry.viewport.width > 0 && initial.telemetry.viewport.height > 0, JSON.stringify(initial));
      for (const id of ['input-name', 'input-command', 'textarea-notes', 'button-primary', 'button-color', 'button-counter', 'button-reset', 'button-disabled', 'color-swatch', 'feedback']) {
        assert(initial.telemetry.elements[id] && initial.telemetry.elements[id].width > 0, `missing geometry for ${id}`);
      }

      evidenceDir = File.join(RuntimeAPITest.context.runDir, 'evidence', 'composition');
      await File.ensureDir(evidenceDir);
      const preRegion = RuntimeLive.region(['input-name', 'input-command', 'button-primary', 'color-swatch', 'feedback']);
      const preShot = await RuntimeLive.capture(File.join(evidenceDir, 'pre.png'), preRegion);

      const nameTarget = await moveAndConfirm('input-name');
      await mouse.click(nameTarget.point.x, nameTarget.point.y, { delay: 30 });
      let snapshot = await RuntimeLive.waitForExactCount('click', 1);
      assert(clickEvents(snapshot).some((event) => event.target === 'input-name'), JSON.stringify(snapshot));
      await keyboard.type('Ada Lovelace');
      snapshot = await RuntimeLive.waitForEvent('input', (event) => (
        event.target === 'input-name'
        && String(event.detail && event.detail.value || '') === 'Ada Lovelace'
      ));

      const commandTarget = await moveAndConfirm('input-command');
      await mouse.click(commandTarget.point.x, commandTarget.point.y, { delay: 30 });
      snapshot = await RuntimeLive.waitForExactCount('click', 2);
      assert(clickEvents(snapshot).some((event) => event.target === 'input-command'), JSON.stringify(snapshot));
      await keyboard.type('run-check');
      snapshot = await RuntimeLive.waitForEvent('input', (event) => (
        event.target === 'input-command'
        && String(event.detail && event.detail.value || '') === 'run-check'
      ));
      await keyboard.press('Enter');
      snapshot = await RuntimeLive.waitForCount('keyup', 1);
      assert(RuntimeLive.events(snapshot, 'keydown').some((event) => event.detail && event.detail.key === 'Enter'), JSON.stringify(snapshot));

      const primaryTarget = await moveAndConfirm('button-primary');
      await mouse.click(primaryTarget.point.x, primaryTarget.point.y, { delay: 30 });
      await RuntimeLive.waitForCount('primary-action', 1);
      await RuntimeLive.waitForExactCount('click', 3);
      await RuntimeLive.waitForExactCount('pointerdown', 3);
      await RuntimeLive.waitForExactCount('pointerup', 3);
      snapshot = await RuntimeLive.waitForCount('visual-settled', 1);
      assert(snapshot.telemetry.uiState.primary === 'success', JSON.stringify(snapshot));
      assert(snapshot.telemetry.uiState.name === 'Ada Lovelace' && snapshot.telemetry.uiState.command === 'run-check', JSON.stringify(snapshot));
      assert(snapshot.telemetry.uiState.feedback.includes('Ada Lovelace'), JSON.stringify(snapshot));
      assert(snapshot.telemetry.uiState.feedback.includes('run-check'), JSON.stringify(snapshot));
      equal(hex(snapshot.telemetry.colors.primaryButton), '#15803d', JSON.stringify(snapshot.telemetry.colors));
      assert(snapshot.counts.pointerdown === 3 && snapshot.counts.pointerup === 3, JSON.stringify(snapshot));
      assert(clickEvents(snapshot).filter((event) => event.target === 'button-primary').length === 1, JSON.stringify(snapshot));

      await clickAndWait('button-color', 4);
      snapshot = await RuntimeLive.waitForCount('color-action', 1);
      equal(snapshot.telemetry.uiState.color, 'purple', JSON.stringify(snapshot));
      equal(hex(snapshot.telemetry.colors.swatch), '#a855f7', JSON.stringify(snapshot.telemetry.colors));

      await clickAndWait('button-counter', 5);
      await clickAndWait('button-counter', 6);
      snapshot = await RuntimeLive.waitForCount('counter-action', 2);
      await RuntimeLive.waitForExactCount('pointerdown', 6);
      snapshot = await RuntimeLive.waitForExactCount('pointerup', 6);
      equal(Number(snapshot.telemetry.uiState.count), 2, JSON.stringify(snapshot));
      assert(snapshot.counts.pointerdown === 6 && snapshot.counts.pointerup === 6, JSON.stringify(snapshot));

      const swatchTarget = RuntimeLive.target('color-swatch');
      const expectedPixel = hex(snapshot.telemetry.colors.swatch);
      let actualPixel = '';
      for (let attempt = 0; attempt < 3; attempt += 1) {
        actualPixel = hex(await Screen.pixel(swatchTarget.point.x, swatchTarget.point.y));
        if (maxChannelDelta(actualPixel, expectedPixel) <= 12) break;
        await page.waitFor(100);
      }
      const pixelDelta = maxChannelDelta(actualPixel, expectedPixel);
      assert(pixelDelta <= 12, JSON.stringify({ point: swatchTarget.point, expectedPixel, actualPixel, pixelDelta, telemetry: snapshot.telemetry }));

      const postRegion = RuntimeLive.region(['input-name', 'input-command', 'button-primary', 'color-swatch', 'feedback']);
      const postShot = await RuntimeLive.capture(File.join(evidenceDir, 'post.png'), postRegion);
      const finalState = await RuntimeLive.state();
      const evidence = {
        schemaVersion: '1.0.0',
        manifest: {
          kind: 'OpenDesk JavaScript Runtime API Conformance Lab composition',
          flow: ['open fixture', 'read geometry', 'move/getPos', 'name input', 'command input', 'primary success', 'purple swatch', 'counter=2', 'Screen.pixel', 'region screenshot'],
          window: originalWindow,
          viewport: finalState.telemetry.viewport,
          viewportOrigin: swatchTarget.viewportOrigin,
          targets: ['input-name', 'input-command', 'button-primary', 'button-color', 'button-counter', 'color-swatch'],
          region: postRegion,
          pixel: { point: swatchTarget.point, expected: expectedPixel, actual: actualPixel, maxChannelDelta: pixelDelta, tolerance: 12 },
          screenshots: { pre: preShot, post: postShot },
          eventArtifacts: ['events.json', 'events.ndjson'],
        },
        state: { initial, final: finalState },
        events: finalState.events,
      };
      await RuntimeLive.writeEvidence(evidenceDir, evidence);
      assert(Number(finalState.eventCount) >= finalState.events.length && finalState.events.length > 0, JSON.stringify(finalState));
      console.log(`[RUNTIME-API-COMPOSITION STATE] ${JSON.stringify({ evidenceDir, window: originalWindow, viewport: finalState.telemetry.viewport, targets: evidence.manifest.targets, uiState: finalState.telemetry.uiState, counts: finalState.counts, pixel: evidence.manifest.pixel, screenshots: evidence.manifest.screenshots })}`);
    } finally {
      for (const key of ['Meta', 'Shift', 'Control', 'Alt']) {
        try { await keyboard.up(key); } catch (_) {}
      }
      if (originalWindow) {
        try { await RuntimeLive.restoreWindow(originalWindow); } catch (_) {}
        try { await RuntimeLive.resetUI(); } catch (_) {}
      }
    }
  });
})();
