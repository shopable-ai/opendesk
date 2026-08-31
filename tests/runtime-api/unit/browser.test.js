(() => {
  const { assert, test } = RuntimeAPITest;
  RuntimeAPITest.contractObject('browser');
  test({
    name: 'browser compatibility facade creates isolated contexts without closing the singleton',
    tier: 'unit',
    covers: ['browser.newPage', 'browser.newContext', 'browser.defaultContext', 'browser.contexts', 'browser.pages', 'browser.lastPage', 'browser.isClosed'],
  }, async () => {
    const beforeContexts = browser.contexts();
    const created = browser.newContext();
    assert(created && typeof created.newPage === 'function', 'browser.newContext did not return a context');
    const createdPage = created.newPage();
    assert(createdPage && typeof createdPage.waitFor === 'function', 'context.newPage did not return a page');
    assert(browser.contexts().length >= beforeContexts.length + 1, 'new context not retained');
    assert(browser.defaultContext() && !browser.isClosed(), 'singleton browser unexpectedly closed');
  });
})();
