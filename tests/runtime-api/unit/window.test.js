(() => {
  const { assert, expectThrow, test } = RuntimeAPITest;
  RuntimeAPITest.contractObject('window');

  test({ name: 'window.list returns normalized window rows', tier: 'unit', covers: ['window.list'] }, async () => {
    const list = await window.list();
    assert(Array.isArray(list), `window.list=${JSON.stringify(list)}`);
    if (list.length > 0) {
      assert(typeof list[0].title === 'string' && typeof list[0].pid === 'number', JSON.stringify(list[0]));
    }
  });

  test({
    name: 'unsupported macOS top-most controls fail explicitly',
    tier: 'unit',
    covers: ['window.setAlwaysOnTop', 'window.unsetTopMost'],
  }, async () => {
    await expectThrow(() => window.setAlwaysOnTop('__opendesk_fixture__', true), 'not supported');
    await expectThrow(() => window.unsetTopMost('__opendesk_fixture__'), 'not supported');
  });
})();
