// Focused native Label entry. The catalog-owned custom-ui.js remains the full
// formal suite; this direct test isolates Label behavior when an earlier UI
// scenario has already failed the shared native driver closed.
(0, eval)(File.read(File.join(File.cwd(), 'tests/runtime-api/framework.js')));
RuntimeAPITest.load('tests/runtime-api/manifest.js');

globalThis.FloatingToolbarTest = (() => {
  const { assert, equal } = RuntimeAPITest;
  const root = File.join(RuntimeAPITest.context.runDir, 'runtime-logs', 'custom-ui-label');
  const evidence = { schemaVersion: 1, product: 'FloatingWindow native Label' };

  async function screenshot(name, bounds) {
    const path = File.join(root, name + '.png');
    await File.ensureDir(root);
    const result = await Screen.screenshot({ clip: bounds, path, returnType: 'object' });
    assert(result.sizeBytes > 100 && await File.exists(path), name + ' screenshot was not written');
    return { path, sizeBytes: result.sizeBytes, bounds };
  }

  async function state(toolbar, id) {
    const value = await toolbar.getButtonState(id);
    assert(value.localBounds.width === 40 && value.localBounds.height === 40, id + ' is not a 40x40 native button');
    return value;
  }

  async function expectUIError(invoke, code, operation) {
    let caught = null;
    try { await invoke(); } catch (error) { caught = error; }
    assert(caught, operation + ' did not fail');
    equal(caught.code, code, operation + ' returned the wrong code');
    equal(caught.operation, operation, operation + ' returned the wrong operation');
    return caught;
  }

  function persist() {
    File.ensureDir(root);
    File.write(File.join(root, 'result.json'), JSON.stringify(evidence, null, 2));
  }

  return { assert, equal, root, evidence, screenshot, state, expectUIError, persist };
})();

RuntimeAPITest.load('tests/runtime-api/custom-ui/floating-window-label.test.js');
await RuntimeAPITest.run('RUNTIME-API-CUSTOM-UI-LABEL');
