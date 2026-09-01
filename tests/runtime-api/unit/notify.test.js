(() => {
  const { assert, equal, expectThrow, test, withGlobal } = RuntimeAPITest;
  RuntimeAPITest.contractGlobals();

  test({
    name: 'notify normalizes documented JavaScript calls and rejects invalid input',
    tier: 'unit',
    covers: ['global.notify'],
  }, async () => {
    const originalInject = notify____Inject;
    const calls = [];
    await withGlobal('notify____Inject', (options) => {
      calls.push(options);
      return undefined;
    }, async () => {
      equal(notify('job complete'), undefined, 'string notify result');
      equal(notify({ title: 'OpenDesk', message: 'done', sound: false, timeout: 25 }), undefined, 'object notify result');
      await expectThrow(() => notify(), 'notify expects a string or an options object');
      await expectThrow(() => notify(null), 'notify expects a string or an options object');
      await expectThrow(() => notify([]), 'notify expects a string or an options object');
      await expectThrow(() => notify(42), 'notify expects a string or an options object');
    });
    assert(notify____Inject === originalInject, 'notify bridge was not restored');
    assert(calls.length === 2, JSON.stringify(calls));
    assert(calls[0].title === 'job complete' && calls[0].message === '' && calls[0].sound === true, JSON.stringify(calls[0]));
    assert(calls[1].title === 'OpenDesk' && calls[1].message === 'done' && calls[1].sound === false && calls[1].timeout === 25, JSON.stringify(calls[1]));
  });
})();
