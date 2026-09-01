(() => {
  const { assert, equal, test } = RuntimeAPITest;
  RuntimeAPITest.contractObject('NativeExtensions');

  const fixture = RuntimeAPITest.context.nativeExtensions && RuntimeAPITest.context.nativeExtensions.goBasic;

  test({
    name: 'NativeExtensions discovers the run-local manifest bundle beside the binary',
    tier: 'unit',
    covers: ['NativeExtensions.list'],
  }, async () => {
    const context = RuntimeAPITest.context;
    const binary = context.binary || {};
    equal(binary.path, File.join(context.runDir, 'bin', 'opendesk'));
    equal(fixture && fixture.bundlePath, File.join(context.runDir, 'bin', 'native-extensions', 'com.example.go-basic'));
    equal(fixture && fixture.path, File.join(fixture.bundlePath, 'bin', 'native-ext-go-basic'));
    assert(File.exists(File.join(fixture.bundlePath, 'extension.json')), 'run-local manifest is missing');
    assert(File.exists(fixture.path), 'run-local Native Extension executable is missing');

    const listed = NativeExtensions.list();
    const goBasic = listed.find((plugin) => plugin.id === 'com.example.go-basic');
    assert(goBasic, `goBasic was not discovered: ${JSON.stringify(listed)}`);
    equal(goBasic.namespace, 'goBasic');
    equal(goBasic.rootKind, 'portable');
    equal(goBasic.methods.join(','), 'add,hello');
    assert(!('wireMethod' in goBasic) && !('path' in goBasic) && !('executable' in goBasic), 'list leaked routing details');
    equal(goBasic.executableSha256, fixture.sha256);
  });

  test({
    name: 'NativeExtensions is Experimental and registry gate does not expose unsafe NativeExtension.call',
    tier: 'unit',
    covers: ['NativeExtensions.list'],
  }, async () => {
    equal(RuntimeAPIObjects.NativeExtensions.status, 'experimental');
    const index = JSON.parse(File.read(File.join(File.cwd(), 'docs-user-api', 'runtime-api.ai.json')));
    const documented = (index.globals || []).find((item) => item.name === 'NativeExtensions');
    assert(documented, 'runtime-api.ai.json is missing NativeExtensions');
    equal(documented.status, 'experimental');
    equal(typeof NativeExtension, 'undefined', 'registry gate exposed unsafe V0 compatibility global');
  });

  test({
    name: 'NativeExtensions root namespace and methods are immutable null-prototype bindings',
    tier: 'unit',
    covers: ['NativeExtensions.get'],
  }, async () => {
    equal(Object.getPrototypeOf(NativeExtensions), null);
    equal(Object.getPrototypeOf(NativeExtensions.goBasic), null);
    assert(Object.isFrozen(NativeExtensions), 'NativeExtensions root is not frozen');
    assert(Object.isFrozen(NativeExtensions.goBasic), 'goBasic namespace is not frozen');
    assert(Object.isFrozen(NativeExtensions.goBasic.hello), 'hello closure is not frozen');
    equal(NativeExtensions.get('com.example.go-basic'), NativeExtensions.goBasic);
    equal(typeof NativeExtensions.goBasic.missing, 'undefined', 'undeclared method was exposed');

    for (const [owner, property] of [
      [globalThis, 'NativeExtensions'],
      [NativeExtensions, 'goBasic'],
      [NativeExtensions.goBasic, 'hello'],
    ]) {
      const descriptor = Object.getOwnPropertyDescriptor(owner, property);
      assert(descriptor, `missing descriptor for ${property}`);
      equal(descriptor.writable, false);
      equal(descriptor.configurable, false);
      const original = owner[property];
      try { owner[property] = () => 'replaced'; } catch (_) {}
      try { delete owner[property]; } catch (_) {}
      equal(owner[property], original, `${property} was changed`);
    }
  });

  test({
    name: 'NativeExtensions.goBasic.hello uses only business params and a bound route',
    tier: 'unit',
    covers: ['NativeExtensions.goBasic.hello'],
  }, async () => {
    const result = NativeExtensions.goBasic.hello({
      name: 'OpenDesk',
      executable: '/tmp/must-not-route',
      extension: 'must-not-route',
      wireMethod: 'must-not-route',
      method: 'must-not-route',
      protocol: 'must-not-route',
      version: 999,
      discoveryRoot: '/tmp/must-not-route',
    });
    equal(result && result.message, 'Hello OpenDesk');
  });

  test({
    name: 'NativeExtensions.goBasic.add uses manifest timeout and safe optional override',
    tier: 'unit',
    covers: ['NativeExtensions.goBasic.add'],
  }, async () => {
    const sum = NativeExtensions.goBasic.add({ a: 20, b: 22 });
    equal(sum && sum.value, 42);
    const overridden = NativeExtensions.goBasic.add({ a: 19, b: 23 }, { timeoutMs: 3000 });
    equal(overridden && overridden.value, 42);
  });

  test({
    name: 'NativeExtensions preserves structured extension and local option errors',
    tier: 'unit',
    covers: ['NativeExtensions.goBasic.add'],
  }, async () => {
    let caught = null;
    try {
      NativeExtensions.goBasic.add({ a: 20 });
    } catch (error) {
      caught = error;
    }
    assert(caught instanceof Error, 'extension failure was not a JavaScript Error');
    equal(caught.name, 'NativeExtensionsError');
    equal(caught.code, 'extension_error');
    equal(caught.pluginId, 'com.example.go-basic');
    equal(caught.namespace, 'goBasic');
    equal(caught.method, 'add');
    equal(caught.extensionCode, 'invalid_params');
    assert(caught.evidence && caught.evidence.status === 'failed', JSON.stringify(caught.evidence));
    equal(caught.evidence.exitCode, 0);
    for (const privateField of ['params', 'result', 'stdout', 'stderrSummary']) {
      assert(!(privateField in caught.evidence), `evidence leaked ${privateField}`);
    }

    for (const key of ['executable', 'extension', 'wireMethod', 'method', 'protocol', 'version', 'root', 'discoveryRoot', 'nativeExtensionRoots']) {
      let invalid = null;
      try {
        NativeExtensions.goBasic.add({}, { [key]: key === 'version' ? 999 : '/tmp/evil' });
      } catch (error) {
        invalid = error;
      }
      equal(invalid && invalid.code, 'invalid_params', `${key} route option was accepted`);
    }
  });

  test({
    name: 'NativeExtensions diagnostics are privacy-minimized and never contain absolute roots',
    tier: 'unit',
    covers: ['NativeExtensions.diagnostics'],
  }, async () => {
    const diagnostics = NativeExtensions.diagnostics();
    const encoded = JSON.stringify(diagnostics);
    assert(diagnostics.some((item) => item.pluginId === 'com.example.go-basic' && item.status === 'discovered'), encoded);
    assert(!encoded.includes(RuntimeAPITest.context.runDir), 'diagnostics leaked the run directory');
    assert(!encoded.includes('/Users/'), 'diagnostics leaked a home path');
  });
})();
