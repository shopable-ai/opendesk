(() => {
  const { assert, equal, test } = RuntimeAPITest;
  RuntimeAPITest.contractObject('context');
  test({
    name: 'context compatibility facade preserves storage, session and cookies in an isolated context',
    tier: 'unit',
    covers: ['context.browser', 'context.newPage', 'context.adoptPage', 'context.pages', 'context.lastPage', 'context.isClosed', 'context.cookies', 'context.setCookies', 'context.clearCookies', 'context.storage', 'context.setStorage', 'context.getStorage', 'context.clearStorage', 'context.session', 'context.setSessionValue', 'context.getSessionValue', 'context.clearSession'],
  }, async () => {
    const isolated = browser.newContext();
    const owningBrowser = isolated.browser();
    assert(owningBrowser && typeof owningBrowser.newContext === 'function', 'isolated context has no callable browser relationship');
    isolated.setStorage('runtime-api', 'ok');
    equal(isolated.getStorage('runtime-api'), 'ok');
    isolated.setSessionValue('run', 1);
    equal(isolated.getSessionValue('run'), 1);
    isolated.setCookies([{ name: 'runtime-api', value: 'ok' }]);
    assert(isolated.cookies().length === 1, 'cookies were not retained');
    const created = isolated.newPage();
    isolated.adoptPage(created);
    assert(isolated.pages().length >= 1 && isolated.lastPage(), 'pages were not retained');
    isolated.clearCookies();
    isolated.clearStorage();
    isolated.clearSession();
    assert(isolated.cookies().length === 0 && Object.keys(isolated.storage()).length === 0 && Object.keys(isolated.session()).length === 0, 'isolated context cleanup failed');
  });
})();
