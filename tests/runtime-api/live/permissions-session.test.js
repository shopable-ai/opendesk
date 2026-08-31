(() => {
  const { assert, test } = RuntimeAPITest;
  test({ name: 'macOS live session records permission state and foreground fixture identity', tier: 'live', covers: ['page.checkPermissions'] }, async () => {
    const checked = await page.checkPermissions({ capabilities: ['screenCapture', 'accessibility'] });
    const active = await window.getActiveWindow();
    assert(checked && checked.ok, JSON.stringify(checked));
    assert(active && String(active.title || '').includes(RuntimeLive.fixture.title) && active.isForeground, JSON.stringify(active));
    globalThis.RuntimeLiveSession = {
      ...globalThis.RuntimeLiveSession,
      permissions: checked,
      window: active,
    };
  });
})();
