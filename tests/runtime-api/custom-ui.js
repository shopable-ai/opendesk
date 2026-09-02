(0, eval)(File.read(File.join(File.cwd(), 'tests/runtime-api/framework.js')));
RuntimeAPITest.load('tests/runtime-api/manifest.js');
RuntimeAPITest.load('tests/runtime-api/crypto.js');

globalThis.FloatingToolbarTest = (() => {
  const { assert, equal } = RuntimeAPITest;
  const root = File.join(RuntimeAPITest.context.runDir, 'runtime-logs', 'custom-ui', 'floating-toolbar');
  const evidence = {
    schemaVersion: 1,
    runId: RuntimeAPITest.context.runId,
    product: 'FloatingWindow v1 native AppKit toolbar',
    layout: {},
    accessibility: {},
    callbacks: {},
    routes: {},
    focus: {},
    lifecycle: {},
    negative: {},
  };

  async function waitFor(predicate, message, timeoutMs = 5000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (await predicate()) return;
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    throw new Error(message);
  }

  function toolbar(count, options = {}) {
    const value = new FloatingWindow({
      x: options.x ?? 180, y: options.y ?? 120, theme: 'dark', alwaysOnTop: true,
      ...(options.toolbar ? { toolbar: options.toolbar } : {}),
    });
    const icons = ['play.fill', 'pause.fill', 'stop.fill', 'gearshape.fill', 'paperplane.fill', 'timer'];
    for (let index = 0; index < count; index += 1) {
      const label = options.labelFor ? options.labelFor(index) : 'Button ' + index;
      value.addButton('button' + index, label, icons[index % icons.length], options.callback);
    }
    return value;
  }

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
    assert(value.screenBounds.width === 40 && value.screenBounds.height === 40, id + ' has no native screen bounds');
    return value;
  }

  async function pointer(toolbar, id) {
    const value = await state(toolbar, id);
    await mouse.click(value.screenBounds.x + 20, value.screenBounds.y + 20);
  }

  async function axPress(toolbar, shown, id) {
    const value = await state(toolbar, id);
    return mouse.clickForPID(shown.hostPid, value.screenBounds.x + 20, value.screenBounds.y + 20);
  }

  function persist() {
    File.ensureDir(root);
    File.write(File.join(root, 'result.json'), JSON.stringify(evidence, null, 2));
  }

  async function expectUIError(invoke, code, operation) {
    let caught = null;
    try { await invoke(); } catch (error) { caught = error; }
    assert(caught, operation + ' did not fail');
    equal(caught.code, code, operation + ' returned the wrong code');
    equal(caught.operation, operation, operation + ' returned the wrong operation');
    return caught;
  }

  return { assert, equal, root, evidence, persist, waitFor, toolbar, screenshot, state, pointer, axPress, expectUIError };
})();

const floatingToolbarTestFiles = [
  'tests/runtime-api/custom-ui/window.test.js',
  'tests/runtime-api/custom-ui/icon-catalog.test.js',
  'tests/runtime-api/custom-ui/floating-window-layout.test.js',
  'tests/runtime-api/custom-ui/floating-window-tooltip.test.js',
  'tests/runtime-api/custom-ui/floating-window-vertical.test.js',
  'tests/runtime-api/custom-ui/floating-window-callback.test.js',
  'tests/runtime-api/custom-ui/floating-window-lifecycle.test.js',
  'tests/runtime-api/custom-ui/floating-window-negative.test.js',
];
const testSourceRoot = File.join(FloatingToolbarTest.root, 'test-sources');
File.ensureDir(testSourceRoot);
const testSources = floatingToolbarTestFiles.map((relativePath) => {
  const sourcePath = File.join(File.cwd(), relativePath);
  const snapshotPath = File.join(testSourceRoot, relativePath.slice(relativePath.lastIndexOf('/') + 1));
  File.write(snapshotPath, File.read(sourcePath));
  return {
    relativePath,
    snapshotPath,
    sizeBytes: new Uint8Array(File.readBytes(snapshotPath)).length,
    sha256: RuntimeAPICrypto.hashFile(snapshotPath),
  };
});
File.write(File.join(FloatingToolbarTest.root, 'test-sources.json'), JSON.stringify({ schemaVersion: 1, testSources }, null, 2));
FloatingToolbarTest.evidence.testSources = testSources;
FloatingToolbarTest.persist();
for (const source of testSources) {
  (0, eval)(File.read(source.snapshotPath) + '\n//# sourceURL=' + source.snapshotPath);
}

await RuntimeAPITest.run('RUNTIME-API-CUSTOM-UI-BEHAVIOR');
