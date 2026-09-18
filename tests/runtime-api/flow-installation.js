// Real OpenDesk Runtime coverage for canonical B1 Flow installation.
// All product operations go through Command.run(current opendesk binary) and
// an isolated OPENDESK_APP_DATA_DIR. Installation must never execute Flow code.
(0, eval)(File.read(File.join(File.cwd(), 'tests/runtime-api/framework.js')));
RuntimeAPITest.load('tests/runtime-api/manifest.js');

(() => {
  const { assert, equal, test } = RuntimeAPITest;
  const binary = System.getExecutablePath();
  const root = File.join(Execution.workdir, '.runtime', 'tests', 'flow-installation', Execution.id);
  const sentinel = File.join(root, 'BUSINESS_EXECUTED.txt');
  const sourceToken = 'FLOW_INSTALL_BUSINESS_MUST_NOT_EXECUTE_64d91a';
  File.ensureDir(root);

  const harnessFile = File.join(Execution.workdir, 'tests', 'runtime-api', 'support', 'flow-package-harness.js');
  const createHarness = (0, eval)(File.read(harnessFile) + '\n//# sourceURL=' + harnessFile);
  const {
    cli, assertNeverExecuted, setupTrust, tamperStoredASCII, tamperEntryByte,
    rewriteZipEntryNameSameLength, markZipEntrySymlink,
    publisherPrivate, publisherPublic, contentKey,
  } = createHarness({ assert, binary, root, sentinel, sourceToken });

  const installEnv = (name) => ({ OPENDESK_APP_DATA_DIR: File.join(root, 'app-data', name) });
  const parentDir = (path) => {
    const normalized = String(path);
    const index = Math.max(normalized.lastIndexOf('/'), normalized.lastIndexOf('\\'));
    return index > 0 ? normalized.slice(0, index) : '.';
  };

  async function packOrdinary(name, options = {}) {
    const flowRoot = File.join(root, 'inputs', name);
    File.ensureDir(flowRoot);
    const entrySource = options.source || `// ${sourceToken}\nFile.write(${JSON.stringify(sentinel)}, 'unexpected execution');\n`;
    File.write(File.join(flowRoot, 'main.js'), entrySource);
    const files = ['main.js'];
    for (const asset of options.assets || []) {
      const assetPath = File.join(flowRoot, asset.path);
      File.ensureDir(parentDir(assetPath));
      File.write(assetPath, asset.content);
      files.push(asset.path);
    }
    const output = File.join(root, `${name}.odflow`);
    const args = [
      'flow', 'pack', flowRoot,
      '-o', output,
      '--flow-id', options.flowId || `com.opendesk.tests.${name}`,
      '--name', options.displayName || name,
      '--version', options.version || '1.0.0',
      '--publisher-id', 'com.opendesk.tests',
      '--publisher-key-id', 'publisher-test-v1',
      '--entry', 'main.js',
      '--minimum-runtime-version', '0.0.0',
      '--platforms', 'darwin,linux,windows',
      '--public-key', publisherPublic,
    ];
    for (const file of files) args.push('--file', file);
    args.push('--signing-key', publisherPrivate);
    await cli(args);
    assertNeverExecuted();
    return output;
  }

  async function packProtected(name, options = {}) {
    const flowRoot = File.join(root, 'inputs', name);
    File.ensureDir(flowRoot);
    setupTrust(flowRoot, true);
    const protectedSource = File.join(root, `${name}-protected-source.js`);
    File.write(protectedSource, options.source || `// ${sourceToken}\nFile.write(${JSON.stringify(sentinel)}, 'unexpected protected execution');\n`);
    const protectedEntry = File.join(flowRoot, 'main.odpkg');
    await cli([
      'package', 'protect', protectedSource,
      '-o', protectedEntry,
      '--package-id', options.packageId || `com.opendesk.tests.${name}.package`,
      '--product-id', options.productId || 'com.opendesk.tests.product',
      '--publisher-id', 'com.opendesk.tests',
      '--publisher-key-id', 'publisher-test-v1',
      '--content-key-id', options.contentKeyId || `content-${name}`,
      '--minimum-runtime-version', '0.0.0',
      '--signing-key', publisherPrivate,
      '--content-key', contentKey,
      '--license-required=true',
    ]);
    const output = File.join(root, `${name}.odflow`);
    await cli([
      'flow', 'pack', flowRoot,
      '-o', output,
      '--flow-id', options.flowId || `com.opendesk.tests.${name}`,
      '--name', options.displayName || name,
      '--version', options.version || '1.0.0',
      '--publisher-id', 'com.opendesk.tests',
      '--publisher-key-id', 'publisher-test-v1',
      '--entry', 'main.odpkg',
      '--minimum-runtime-version', '0.0.0',
      '--platforms', 'darwin,linux,windows',
      '--public-key', publisherPublic,
      '--license-issuer-key-id', 'issuer-test-v1',
      '--file', 'main.odpkg',
      '--file', 'trust/license-issuer.pub',
      '--signing-key', publisherPrivate,
    ]);
    assertNeverExecuted();
    return output;
  }

  test({
    name: 'install keeps candidate signature, publisher trust, catalog identity and execution separate',
    tier: 'unit',
    covers: ['Command.run', 'File.write', 'File.read'],
  }, async () => {
    const env = installEnv('basic');
    const ordinary = await packOrdinary('ordinary-install', {
      flowId: 'com.opendesk.tests.install-basic',
      displayName: 'Duplicate Friendly Name',
    });

    const untrusted = await cli(['flow', 'install', ordinary], false, env);
    equal(untrusted.error.code, 'flow_trust_required', 'valid package signature must not imply publisher trust');
    const empty = await cli(['flow', 'list'], true, env);
    equal(empty.result.flows.length, 0, 'untrusted install must not register catalog content');
    assertNeverExecuted();

    const installed = await cli(['flow', 'install', ordinary, '--trust-flow'], true, env);
    equal(installed.result.record.state, 'ready', 'ordinary installed state');
    assertNeverExecuted();

    const listed = await cli(['flow', 'list'], true, env);
    equal(listed.result.flows.length, 1, 'installed Flow survives a new CLI process and catalog reload');
    equal(listed.result.flows[0].installId, installed.result.record.installId, 'stable installId across list');

    const repeated = await cli(['flow', 'install', ordinary], true, env);
    assert(repeated.result.idempotent === true, 'same digest install was not idempotent');
    equal(repeated.result.record.installId, installed.result.record.installId, 'idempotent install changed installId');

    const conflict = await packOrdinary('ordinary-install-conflict', {
      flowId: 'com.opendesk.tests.install-basic',
      displayName: 'A Different Display Name Cannot Change Identity',
      version: '1.0.0',
      source: `// ${sourceToken}\nFile.write(${JSON.stringify(sentinel)}, 'different bytes');\n`,
    });
    const conflictResult = await cli(['flow', 'install', conflict], false, env);
    equal(conflictResult.error.code, 'flow_version_conflict', 'same identity/version with different digest must reject');
    const afterConflict = await cli(['flow', 'list'], true, env);
    equal(afterConflict.result.flows.length, 1, 'conflicting install changed catalog cardinality');
    equal(afterConflict.result.flows[0].archiveDigest, installed.result.record.archiveDigest, 'conflicting install replaced existing package');
    assertNeverExecuted();
  });

  test({
    name: 'checked-in Notify Demo package matches its public main.js and installs without an implicit run',
    tier: 'unit',
    covers: ['Command.run', 'File.read'],
  }, async () => {
    const env = installEnv('notify-demo-example');
    const exampleRoot = File.join(Execution.workdir, 'examples', 'flow-distribution', 'notify-demo');
    const sourcePath = File.join(exampleRoot, 'main.js');
    const configPath = File.join(exampleRoot, 'clawdesk.runtime.json');
    const manifestPath = File.join(exampleRoot, 'flow.json');
    const packagePath = File.join(exampleRoot, 'notify-demo.odflow');

    assert(File.isFile(sourcePath), 'Notify Demo main.js is missing');
    assert(File.isFile(configPath), 'Notify Demo UI runtime configuration is missing');
    assert(File.isFile(manifestPath), 'Notify Demo flow.json is missing');
    assert(File.isFile(packagePath), 'Notify Demo .odflow is missing');

    const inspected = await cli(['flow', 'inspect', packagePath]);
    equal(inspected.result.manifest.flowId, 'com.example.opendesk.notify-demo', 'Notify Demo flowId');
    equal(inspected.result.manifest.name, 'Notify Demo', 'Notify Demo display name');
    equal(inspected.result.manifest.entry, 'main.js', 'Notify Demo entry');
    assert(inspected.result.manifest.files.some(file => file.path === 'clawdesk.runtime.json'), 'Notify Demo package omits its UI runtime configuration');
    equal(JSON.stringify(inspected.result.manifest), File.read(manifestPath).trim(), 'checked-in flow.json differs from packaged manifest');

    const installed = await cli(['flow', 'install', packagePath, '--trust-flow'], true, env);
    equal(installed.result.record.state, 'ready', 'Notify Demo installed state');
    equal(installed.result.record.name, 'Notify Demo', 'Notify Demo Catalog name');
    equal(installed.result.record.origin, 'odflow', 'Notify Demo Catalog origin');

    const installedSource = File.join(
      env.OPENDESK_APP_DATA_DIR,
      'flows',
      installed.result.record.installId,
      'main.js',
    );
    equal(File.read(installedSource), File.read(sourcePath), 'packaged Notify Demo main.js differs from public source');
    assert(File.read(sourcePath).includes('ui.toast('), 'Notify Demo must use canonical ui.toast() feedback');
    assert(!/^\s*notify\s*\(/m.test(File.read(sourcePath)), 'Notify Demo must not use the operating-system notify() API');
    equal(
      File.read(File.join(env.OPENDESK_APP_DATA_DIR, 'flows', installed.result.record.installId, 'clawdesk.runtime.json')),
      File.read(configPath),
      'packaged Notify Demo UI runtime configuration differs from public source',
    );

    const listed = await cli(['flow', 'list'], true, env);
    equal(listed.result.flows.length, 1, 'Notify Demo install did not create exactly one Catalog record');
    equal(listed.result.flows[0].installId, installed.result.record.installId, 'Notify Demo Catalog identity changed');
    assertNeverExecuted();

    await cli(['flow', 'uninstall', installed.result.record.installId, '--remove-data'], true, env);
  });

  test({
    name: 'raw Flow import carries its adjacent UI runtime configuration into explicit flow run',
    tier: 'unit',
    covers: ['Command.run', 'File.read'],
  }, async () => {
    const env = installEnv('notify-demo-local-ui-config');
    const exampleRoot = File.join(Execution.workdir, 'examples', 'flow-distribution', 'notify-demo');
    const sourceRoot = File.join(root, 'notify-demo-local-ui-config-source');
    const sourcePath = File.join(sourceRoot, 'main.js');
    const configPath = File.join(exampleRoot, 'clawdesk.runtime.json');
    File.ensureDir(sourceRoot);
    File.write(
      sourcePath,
      "const capabilities = ui.getCapabilities(); if (!capabilities.enabled || capabilities.activationSource !== 'projectConfig') throw new Error('adjacent UI config was not activated'); console.log('FLOW_LOCAL_UI_CONFIG=projectConfig');\n",
    );
    File.copy(configPath, File.join(sourceRoot, 'clawdesk.runtime.json'));
    const installed = await cli(['flow', 'install', sourcePath], true, env);
    equal(installed.result.record.origin, 'js', 'raw Notify Demo import origin');
    equal(
      File.read(File.join(env.OPENDESK_APP_DATA_DIR, 'flows', installed.result.record.installId, 'payload', 'clawdesk.runtime.json')),
      File.read(configPath),
      'raw Notify Demo import did not preserve its adjacent UI runtime configuration',
    );
    assertNeverExecuted();
    const runLogDir = File.join(root, 'notify-demo-local-ui-config-run');
    const ran = await cli(['flow', 'run', installed.result.record.installId, '--log-dir', runLogDir], true, env);
    equal(ran.result.execution.status, 'succeeded', 'raw Flow explicit run status');
    assert(
      File.read(File.join(runLogDir, 'stdout.log')).includes('FLOW_LOCAL_UI_CONFIG=projectConfig'),
      'raw Flow explicit run did not load its adjacent UI runtime configuration',
    );
    await cli(['flow', 'uninstall', installed.result.record.installId, '--remove-data'], true, env);
  });

  test({
    name: 'first protected install can wait for activation but an update cannot replace a ready version while activation is missing',
    tier: 'unit',
    covers: ['Command.run', 'File.read'],
  }, async () => {
    const env = installEnv('activation');
    const protectedFirst = await packProtected('protected-first', {
      flowId: 'com.opendesk.tests.protected-first',
    });
    const pendingFirst = await cli(['flow', 'install', protectedFirst, '--trust-publisher', '--install-pending'], true, env);
    equal(pendingFirst.result.record.state, 'needs-activation', 'first protected install must remain not-ready without entitlement');
    const notReady = await cli(['flow', 'run', pendingFirst.result.record.installId], false, env);
    equal(notReady.error.code, 'flow_not_ready', 'needs-activation Flow became runnable');
    assertNeverExecuted();

    const readyV1 = await packOrdinary('ready-update-base', {
      flowId: 'com.opendesk.tests.activation-update',
      version: '0.5.0',
      source: `// ${sourceToken}\nFile.write(${JSON.stringify(sentinel)}, 'ready-v1-executed');\n`,
    });
    const active = await cli(['flow', 'install', readyV1], true, env);
    equal(active.result.record.state, 'ready', 'publisher-wide trust should permit sibling Flow install');

    const protectedV2 = await packProtected('protected-update', {
      flowId: 'com.opendesk.tests.activation-update',
      version: '1.0.0',
      source: `// ${sourceToken}\nFile.write(${JSON.stringify(sentinel)}, 'protected-v2-executed');\n`,
    });
    const blockedUpdate = await cli(['flow', 'install', protectedV2, '--install-pending'], false, env);
    equal(blockedUpdate.error.code, 'flow_activation_required', 'not-ready update must not replace a ready version');
    const after = await cli(['flow', 'list'], true, env);
    const activeAfter = after.result.flows.find((entry) => entry.installId === active.result.record.installId);
    assert(activeAfter, 'ready Flow disappeared after activation-blocked update');
    equal(activeAfter.version, '0.5.0', 'activation-blocked update replaced current version');
    equal(activeAfter.state, 'ready', 'activation-blocked update changed current state');
    const activeSource = File.read(File.join(env.OPENDESK_APP_DATA_DIR, 'flows', active.result.record.installId, 'main.js'));
    assert(activeSource.includes('ready-v1-executed'), 'active ready content was replaced before activation');
    assertNeverExecuted();
  });

  test({
    name: 'installer rejects tamper, traversal, reserved and ADS names, duplicate aliases and symlink ZIP entries without side effects',
    tier: 'unit',
    covers: ['Command.run', 'File.readBytes', 'File.writeBytes'],
  }, async () => {
    const env = installEnv('attacks');
    const valid = await packOrdinary('attack-base', {
      flowId: 'com.opendesk.tests.attack-base',
      assets: [{ path: 'safe.txt', content: 'FLOW_B1_ASSET_TAMPER_91f2a0\n' }],
    });

    const attacks = [];
    const assetTampered = File.join(root, 'attack-asset-tampered.odflow');
    tamperStoredASCII(valid, assetTampered, 'FLOW_B1_ASSET_TAMPER_91f2a0');
    attacks.push(assetTampered);
    const signatureTampered = File.join(root, 'attack-signature-tampered.odflow');
    tamperEntryByte(valid, signatureTampered, 'flow.sig');
    attacks.push(signatureTampered);
    for (const [suffix, replacement] of [
      ['traversal', '../x.txt'],
      ['reserved', 'NUL.txt'],
      ['ads', 'a:b.tx'],
      ['unexpected', 'newx.txt'],
    ]) {
      const source = suffix === 'reserved' || suffix === 'ads'
        ? await packOrdinary(`attack-${suffix}-base`, {
            flowId: `com.opendesk.tests.attack-${suffix}`,
            assets: [{ path: suffix === 'reserved' ? 'good.tx' : 'aa.txt', content: 'x' }],
          })
        : valid;
      const fromName = suffix === 'reserved' ? 'good.tx' : (suffix === 'ads' ? 'aa.txt' : 'safe.txt');
      const target = File.join(root, `attack-${suffix}.odflow`);
      rewriteZipEntryNameSameLength(source, target, fromName, replacement);
      attacks.push(target);
    }
    const symlink = File.join(root, 'attack-symlink.odflow');
    markZipEntrySymlink(valid, symlink, 'safe.txt');
    attacks.push(symlink);

    const duplicateBase = await packOrdinary('duplicate-base', {
      flowId: 'com.opendesk.tests.duplicate-base',
      assets: [{ path: 'aa.txt', content: 'a' }, { path: 'bb.txt', content: 'b' }],
    });
    const duplicate = File.join(root, 'attack-duplicate.odflow');
    rewriteZipEntryNameSameLength(duplicateBase, duplicate, 'bb.txt', 'aa.txt');
    attacks.push(duplicate);

    for (const packagePath of attacks) {
      const failure = await cli(['flow', 'install', packagePath, '--trust-flow'], false, env);
      assert(failure.error.code, `attack was not classified: ${packagePath}`);
      assertNeverExecuted();
    }
    const listed = await cli(['flow', 'list'], true, env);
    equal(listed.result.flows.length, 0, 'rejected packages left installed catalog entries');
    assertNeverExecuted();
  });

  test({
    name: 'publisher trust scope, display-name isolation and transactional uninstall preserve sibling Flow and user data policy',
    tier: 'unit',
    covers: ['Command.run', 'File.write'],
  }, async () => {
    const env = installEnv('lifecycle');
    const flowA = await packOrdinary('lifecycle-a', {
      flowId: 'com.opendesk.tests.lifecycle-a',
      displayName: 'Same Visible Name',
    });
    const flowB = await packOrdinary('lifecycle-b', {
      flowId: 'com.opendesk.tests.lifecycle-b',
      displayName: 'Same Visible Name',
    });
    const installedA = await cli(['flow', 'install', flowA, '--trust-publisher'], true, env);
    const installedB = await cli(['flow', 'install', flowB], true, env);
    assert(installedA.result.record.installId !== installedB.result.record.installId, 'display name was used as install identity');

    const dataA = File.join(env.OPENDESK_APP_DATA_DIR, 'flow-data', installedA.result.record.installId, 'user-state.txt');
    File.ensureDir(parentDir(dataA));
    File.write(dataA, 'keep');
    await cli(['flow', 'uninstall', installedA.result.record.installId], true, env);
    assert(File.isFile(dataA), 'default uninstall removed Flow user data');
    const afterUninstall = await cli(['flow', 'list'], true, env);
    equal(afterUninstall.result.flows.length, 1, 'uninstall damaged another Flow');
    equal(afterUninstall.result.flows[0].installId, installedB.result.record.installId, 'wrong Flow survived uninstall');

    const flowC = await packOrdinary('lifecycle-c', { flowId: 'com.opendesk.tests.lifecycle-c' });
    const installedC = await cli(['flow', 'install', flowC], true, env);
    equal(installedC.result.record.state, 'ready', 'uninstall removed shared publisher trust');

    const dataB = File.join(env.OPENDESK_APP_DATA_DIR, 'flow-data', installedB.result.record.installId, 'delete-me.txt');
    File.ensureDir(parentDir(dataB));
    File.write(dataB, 'delete');
    await cli(['flow', 'uninstall', installedB.result.record.installId, '--remove-data'], true, env);
    assert(!File.exists(parentDir(dataB)), '--remove-data left Flow data root behind');
    assertNeverExecuted();
  });
})();

await RuntimeAPITest.run('RUNTIME-API-FLOW-INSTALLATION');
