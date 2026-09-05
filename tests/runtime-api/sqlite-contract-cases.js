// Shared handle-shape contracts. SQLite.open is contracted as the only
// SQLite global method by RuntimeAPITest.contractObject('SQLite'); these
// checks intentionally exercise only the returned handle shape.

globalThis.RuntimeAPISQLiteContractCases = (() => {
  const handleMethods = ['query', 'exec', 'batch', 'close'];

  function assertPromise(value, label) {
    RuntimeAPITest.assert(value && typeof value.then === 'function', label + ' must return a Promise');
    return value;
  }

  async function openHandle() {
    const pending = SQLite.open({ path: ':memory:', mode: 'rwc' });
    const db = await assertPromise(pending, 'SQLite.open');
    RuntimeAPITest.assert(db && typeof db === 'object', 'SQLite.open must resolve a database handle');
    return db;
  }

  function registerHandleContracts() {
    for (const method of handleMethods) {
      RuntimeAPITest.test({
        name: 'SQLiteDatabase.' + method + ' is exposed by SQLite.open()',
        tier: 'unit',
        verification: 'contract',
        covers: ['SQLiteDatabase.' + method],
      }, async () => {
        const db = await openHandle();
        try {
          RuntimeAPITest.assert(typeof db[method] === 'function', 'missing SQLiteDatabase.' + method);
          if (method === 'close') await assertPromise(db.close(), 'SQLiteDatabase.close');
        } finally {
          // Close is explicitly idempotent, so this also leaves every
          // contract probe with no persistent handle.
          await assertPromise(db.close(), 'SQLiteDatabase.close');
        }
      });
    }
  }

  return { registerHandleContracts };
})();
