(() => {
  const { assert, expectThrow, test } = RuntimeAPITest;
  RuntimeAPITest.contractObject('window');

  test({ name: 'window capability matrix is explicit for the current platform', tier: 'unit', covers: ['window.getCapabilities'] }, async () => {
    const result = window.getCapabilities();
    assert(result && typeof result.platform === 'string', JSON.stringify(result));
    assert(result.backend && result.coordinateSpace && result.identity && result.spaceBehavior, JSON.stringify(result));
    const expected = [
      'window.list', 'window.active', 'window.findByTitle', 'window.focus',
      'window.getBounds', 'window.setBounds', 'window.minimize', 'window.maximize',
      'window.restore', 'window.close', 'window.alwaysOnTop', 'window.bringToTop',
    ];
    for (const name of expected) {
      const capability = result.capabilities && result.capabilities[name];
      assert(capability && ['Stable', 'Partial', 'Unsupported', 'Experimental'].includes(capability.status), `${name}=${JSON.stringify(capability)}`);
      assert(typeof capability.supported === 'boolean', `${name}=${JSON.stringify(capability)}`);
    }
  });

  test({ name: 'window.list returns normalized window rows', tier: 'unit', covers: ['window.list'] }, async () => {
    const list = await window.list();
    assert(Array.isArray(list), `window.list=${JSON.stringify(list)}`);
    if (list.length > 0) {
      assert(typeof list[0].title === 'string' && typeof list[0].pid === 'number', JSON.stringify(list[0]));
      assert(typeof list[0].id === 'string' && list[0].id.includes(':'), JSON.stringify(list[0]));
      if (list[0].id.includes(':native:')) assert(typeof list[0].handle === 'number' && list[0].handle > 0, JSON.stringify(list[0]));
    }
  });

  test({
    name: 'unsupported top-most controls fail explicitly without touching a window',
    tier: 'unit',
    covers: ['window.setAlwaysOnTop', 'window.unsetTopMost'],
  }, async () => {
    const capability = window.getCapabilities().capabilities['window.alwaysOnTop'];
    if (capability.status !== 'Unsupported') {
      assert(capability.supported === true, JSON.stringify(capability));
      return;
    }
    let first;
    let second;
    try { await window.setAlwaysOnTop('__opendesk_fixture__', true); } catch (error) { first = error; }
    try { await window.unsetTopMost('__opendesk_fixture__'); } catch (error) { second = error; }
    assert(first && first.code === 'NOT_SUPPORTED' && first.operation === 'window.setAlwaysOnTop', JSON.stringify(first));
    assert(second && second.code === 'NOT_SUPPORTED' && second.operation === 'window.unsetTopMost', JSON.stringify(second));
    assert(first.capability === 'window.alwaysOnTop' && typeof first.platform === 'string', JSON.stringify(first));
    await expectThrow(() => { throw first; }, 'not supported');
  });

  test({ name: 'window validates targets and geometry with structured errors', tier: 'unit', covers: ['window.getWindowByTitle', 'window.setWindowBounds'] }, async () => {
    let targetError;
    let boundsError;
    try { await window.getWindowByTitle(''); } catch (error) { targetError = error; }
    try { window.setWindowBounds('fixture', 0, 0, 0, 100); } catch (error) { boundsError = error; }
    assert(targetError && targetError.code === 'INVALID_ARGUMENT', JSON.stringify(targetError));
    assert(targetError.operation === 'window.getWindowByTitle', JSON.stringify(targetError));
    assert(boundsError && boundsError.code === 'INVALID_ARGUMENT', JSON.stringify(boundsError));
    assert(boundsError.operation === 'window.setWindowBounds', JSON.stringify(boundsError));
  });
})();
