(() => {
  const { assert, equal, test } = RuntimeAPITest;
  RuntimeAPITest.contractObject('AppStorage');

  test({
    name: 'AppStorage round trip preserves unrelated persistent keys',
    tier: 'unit',
    covers: ['AppStorage.getItem', 'AppStorage.setItem', 'AppStorage.removeItem', 'AppStorage.getLength', 'AppStorage.key'],
  }, async () => {
    const key = `__clawdesk_runtime_api_${Date.now()}__`;
    const before = AppStorage.getLength();
    try {
      AppStorage.setItem(key, 'fixture-value');
      equal(AppStorage.getItem(key), 'fixture-value');
      assert(AppStorage.getLength() === before + 1, JSON.stringify({ before, after: AppStorage.getLength() }));
      let found = false;
      for (let i = 0; i < AppStorage.getLength(); i += 1) {
        if (AppStorage.key(i) === key) found = true;
      }
      assert(found, 'AppStorage.key did not enumerate the temporary key');
    } finally {
      AppStorage.removeItem(key);
    }
    equal(AppStorage.getItem(key), '');
    equal(AppStorage.getLength(), before);
  });
})();
