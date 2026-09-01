(() => {
  const { assert, equal, expectThrow, test } = RuntimeAPITest;
  RuntimeAPITest.contractObject('globalShortcut');

  test({ name: 'globalShortcut normalizes aliases and reports invalid accelerators', tier: 'unit', covers: ['globalShortcut.register'] }, async () => {
    let error = null;
    try {
      globalShortcut.register(' Ctrl + ctrl + a ', () => {});
    } catch (caught) {
      error = caught;
    }
    assert(error && error.code === 'INVALID_ACCELERATOR', 'duplicate aliases must produce INVALID_ACCELERATOR');
    await expectThrow(() => globalShortcut.register('CommandOrControl+Shift', () => {}), 'INVALID_ACCELERATOR');
  });

  test({ name: 'globalShortcut unregister is idempotent and registration state is local to its Runtime', tier: 'unit', covers: ['globalShortcut.unregister', 'globalShortcut.isRegistered', 'globalShortcut.unregisterAll'] }, async () => {
    equal(globalShortcut.isRegistered('CmdOrCtrl+Shift+9'), false, 'fresh Runtime must not contain a shortcut');
    globalShortcut.unregister('CommandOrControl+Shift+9');
    globalShortcut.unregisterAll();
    equal(globalShortcut.isRegistered('CommandOrControl+Shift+9'), false, 'unregisterAll must leave the Runtime registry empty');
  });
})();
