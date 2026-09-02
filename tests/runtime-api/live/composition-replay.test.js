(() => {
  const { assert, equal, test } = RuntimeAPITest;

  async function clickTarget(id) {
    const target = RuntimeLive.target(id);
    let actual = null;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      await mouse.move(target.point.x, target.point.y, { steps: 8 });
      // Quartz posts moves asynchronously. Read only after a short settle and
      // retry the exact same target; never click until the strict geometry
      // check has observed the requested global point.
      await page.waitFor(25);
      actual = await mouse.getPos();
      if (Math.abs(actual.x - target.point.x) <= 2 && Math.abs(actual.y - target.point.y) <= 2) break;
    }
    assert(Math.abs(actual.x - target.point.x) <= 2 && Math.abs(actual.y - target.point.y) <= 2, JSON.stringify({ id, target, actual }));
    await mouse.click(target.point.x, target.point.y, { delay: 30 });
    await RuntimeLive.waitForEvent('click', (event) => event.target === id);
    return target;
  }

  test({
    name: 'composition replays the complete multi-control flow after Safari window relocation',
    tier: 'composition',
    covers: ['window.setWindowBounds', 'window.getActiveWindow', 'mouse.move', 'mouse.getPos', 'mouse.click', 'keyboard.type', 'page.screenshot'],
  }, async () => {
    const opened = await RuntimeLive.openWith('openURLInApp', 'composition-window-replay');
    const original = opened.windowInfo;
    const moved = {
      x: Math.max(20, Number(original.x) + 24),
      y: Math.max(20, Number(original.y) + 18),
      width: Math.max(760, Number(original.width) - 40),
      height: Math.max(560, Number(original.height) - 30),
    };
    try {
      await window.setWindowBounds(original.title, moved.x, moved.y, moved.width, moved.height);
      await page.waitFor(350);
      const relocatedTarget = await RuntimeLive.refreshTarget();
      const relocated = relocatedTarget.windowInfo;
      assert(Math.abs(relocated.x - original.x) >= 8 || Math.abs(relocated.y - original.y) >= 8, JSON.stringify({ original, relocated }));

      await RuntimeLive.resetUI();
      await RuntimeLive.reset();
      const evidenceDir = File.join(RuntimeAPITest.context.runDir, 'evidence', 'composition');
      const pre = await RuntimeLive.capture(File.join(evidenceDir, 'replay-pre.png'), RuntimeLive.region(['input-name', 'input-command', 'button-primary', 'color-swatch']));

      await clickTarget('input-name');
      await keyboard.type('Grace Hopper');
      await RuntimeLive.waitForEvent('input', (event) => event.target === 'input-name' && String(event.detail && event.detail.value || '') === 'Grace Hopper');
      await clickTarget('input-command');
      await keyboard.type('replay-check');
      await RuntimeLive.waitForEvent('input', (event) => event.target === 'input-command' && String(event.detail && event.detail.value || '') === 'replay-check');
      await clickTarget('button-primary');
      let state = await RuntimeLive.waitForCount('primary-action', 1);
      equal(state.telemetry.uiState.primary, 'success', JSON.stringify(state));
      assert(state.telemetry.uiState.feedback.includes('Grace Hopper') && state.telemetry.uiState.feedback.includes('replay-check'), JSON.stringify(state));
      await clickTarget('button-color');
      await RuntimeLive.waitForCount('color-action', 1);
      await clickTarget('button-counter');
      await clickTarget('button-counter');
      state = await RuntimeLive.waitForCount('counter-action', 2);
      await RuntimeLive.waitForExactCount('pointerdown', 6);
      await RuntimeLive.waitForExactCount('pointerup', 6);
      state = await RuntimeLive.waitForExactCount('click', 6);
      equal(state.telemetry.uiState.primary, 'success', JSON.stringify(state));
      equal(state.telemetry.uiState.color, 'purple', JSON.stringify(state));
      equal(Number(state.telemetry.uiState.count), 2, JSON.stringify(state));
      assert(state.counts.pointerdown === 6 && state.counts.pointerup === 6 && state.counts.click === 6, JSON.stringify(state.counts));

      const post = await RuntimeLive.capture(File.join(evidenceDir, 'replay-post.png'), RuntimeLive.region(['input-name', 'input-command', 'button-primary', 'color-swatch']));
      const replayPath = File.join(evidenceDir, 'replay.json');
      const replay = {
        schemaVersion: '1.0.0',
        runId: RuntimeAPITest.context.runId,
        originalWindow: original,
        relocatedWindow: relocated,
        viewport: state.telemetry.viewport,
        state,
        screenshots: { pre, post },
      };
      File.write(replayPath, JSON.stringify(replay, null, 2));
      globalThis.RuntimeLiveEvidence = { ...globalThis.RuntimeLiveEvidence, replay: { path: replayPath, sha256: RuntimeAPICrypto.hashFile(replayPath), screenshots: { pre, post } } };
      console.log('[RUNTIME-API-COMPOSITION REPLAY] ' + JSON.stringify({ original, relocated, viewport: state.telemetry.viewport, counts: state.counts, replayPath }));
    } finally {
      try { await RuntimeLive.restoreWindow(original); } catch (_) {}
      for (const key of ['Meta', 'Shift', 'Control', 'Alt']) {
        try { await keyboard.up(key); } catch (_) {}
      }
    }
  });
})();
