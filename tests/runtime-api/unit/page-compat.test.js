(() => {
  const { assert, test } = RuntimeAPITest;
  test({ name: 'page exposes documented browser and context compatibility accessors', tier: 'unit', covers: ['page.browser', 'page.context'] }, async () => {
    const owningBrowser = page.browser();
    const owningContext = page.context();
    assert(owningBrowser && typeof owningBrowser.newContext === 'function', 'page.browser did not return a callable Runtime browser');
    assert(owningContext && typeof owningContext.browser === 'function', 'page.context did not return a callable Runtime context');
    const contextBrowser = owningContext.browser();
    assert(contextBrowser && typeof contextBrowser.newContext === 'function', 'page context did not retain its browser relationship');
  });
})();
