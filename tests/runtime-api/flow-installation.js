// Real OpenDesk Runtime coverage for .odflow B1 installation. All product
// operations go through Command.run(current opendesk binary) and an isolated
// OPENDESK_APP_DATA_DIR under .runtime/tests.
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
    publisherPrivate, publisherPublic,
  } = createHarness({ assert, binary, root, sentinel, sourceToken });

  const installEnv = (name) => ({ OPENDESK_APP_DATA_DIR: File.join(root, 'app-data', name) });

  async function packOrdinary(name, options = {}) {
    const flowRoot = File.join(root, 'inputs', name);
    File.ensureDir(flowRoot);
    setupTrust(flowRoot, Boolean(options.commercial));
    const entrySource = options.source || `// ${sourceToken}\nFile.write(${JSON.stringify(sentinel)}, 'unexpected execution');\n`;
    File.write(File.join(flowRoot, 'main.js'), entrySource);
    const files = ['main.js', 'trust/publisher.pub'];
    for (const asset of options.assets || []) {
      File.write(File.join(flowRoot, asset.path), asset.content);
      files.push(asset.path);
    }
    if (options.commercial) files.push('trust/license-issuer.pub');
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
      '--platform', 'darwin', '--platform', 'windows',
    ];
    for (const file of files) args.push('--file', file);
    if (options.commercial) {
      args.push('--product-id', 'com.opendesk.tests.product');
      args.push('--license-issuer-key-id', 'issuer-test-v1');
      args.push('--purpose', 'run');
    }
    args.push('--signing-key', publisherPrivate);
    await cli(args);
    assertNeverExecuted();
    return output;
  }

  test({
    name: 'flow install separates signature, publisher trust, authorization, catalog persistence and idempotency',
    tier: 'unit',
    covers: ['Command.run', 'File.write', 'File.read'],
  }, async () => {
    const env = installEnv('basic');
    const ordinary = await packOrdinary('ordinary-install', { flowId: 'com.opendesk.tests.install-basic', displayName: 'Duplicate Friendly Name' });

    const untrusted = await cli(['flow', 'install', ordinary], false, env);
    equal(untrusted.error.code, 'publisher_trust_required', 'valid candidate signature must not imply publisher trust');
    const empty = await cli(['flow', 'list'], true, env);
    equal(empty.result.flows.length, 0, 'untrusted install must not register catalog content');
    assertNeverExecuted();

    const trust = await cli(['flow', 'trust', 'approve', ordinary, '--scope', 'flow'], true, env);
    equal(trust.result.status, 'trusted', 'flow trust status');
    equal(trust.result.authorization, 'not_evaluated', 'trust command must not authorize commercial execution');
    const installed = await cli(['flow', 'install', ordinary], true, env);
    equal(installed.result.entry.state, 'ready', 'ordinary installed state');
    equal(installed.result.verification.signature, 'verified_candidate_key', 'signature status');
    equal(installed.result.verification.publisherTrust, 'trusted_flow', 'publisher trust state');
    equal(installed.result.verification.authorization, 'not_required', 'ordinary authorization state');
    assertNeverExecuted();

    const listed = await cli(['flow', 'list'], true, env);
    equal(listed.result.flows.length, 1, 'installed flow survives a new CLI process and catalog reload');
    equal(listed.result.flows[0].installId, installed.result.entry.installId, 'stable installId across list');

    const repeated = await cli(['flow', 'install', ordinary], true, env);
    assert(repeated.result.idempotent === true, 'same digest install was not idempotent');
    equal(repeated.result.entry.installId, installed.result.entry.installId, 'idempotent install changed installId');

    const conflict = await packOrdinary('ordinary-install-conflict', {
      flowId: 'com.opendesk.tests.install-basic',
      displayName: 'A Different Display Name Cannot Change Identity',
      version: '1.0.0',
      source: `// ${sourceToken}\nFile.write(${JSON.stringify(sentinel)}, 'different bytes');\n`,
    });
    const conflictResult = await cli(['flow', 'install', conflict], false, env);
    equal(conflictResult.error.code, 'install_conflict', 'same identity/version with different digest must reject');
    const afterConflict = await cli(['flow', 'list'], true, env);
    equal(afterConflict.result.flows.length, 1, 'conflicting install changed catalog cardinality');
    equal(afterConflict.result.flows[0].packageDigest, installed.result.entry.packageDigest, 'conflicting install replaced existing package');
    assertNeverExecuted();
  });

  test({
    name: 'commercial install is needs-activation and a paid update cannot replace an active ready version',
    tier: 'unit',
    covers: ['Command.run', 'File.read'],
  }, async () => {
    const env = installEnv('commercial');
    const commercial = await packOrdinary('commercial-first', {
      flowId: 'com.opendesk.tests.commercial-first',
      commercial: true,
    });
    const installedCommercial = await cli(['flow', 'install', commercial, '--trust', 'publisher'], true, env);
    equal(installedCommercial.result.entry.state, 'needs-activation', 'commercial flow must not be ready before entitlement');
    equal(installedCommercial.result.verification.authorization, 'needs_activation', 'commercial authorization state');
    assertNeverExecuted();

    const readyV1 = await packOrdinary('ready-v1', {
      flowId: 'com.opendesk.tests.pending-update',
      version: '1.0.0',
      source: `// ${sourceToken}\nFile.write(${JSON.stringify(sentinel)}, 'ready-v1-executed');\n`,
    });
    const active = await cli(['flow', 'install', readyV1], true, env);
    equal(active.result.entry.state, 'ready', 'publisher trust from first install should permit ordinary sibling flow');

    const paidV2 = await packOrdinary('paid-v2', {
      flowId: 'com.opendesk.tests.pending-update',
      version: '2.0.0',
      commercial: true,
      source: `// ${sourceToken}\nFile.write(${JSON.stringify(sentinel)}, 'paid-v2-executed');\n`,
    });
    const pending = await cli(['flow', 'install', paidV2], true, env);
    assert(pending.result.pendingUpdate === true, 'commercial update was not staged as pending');
    equal(pending.result.entry.version, '1.0.0', 'pending commercial update replaced active version');
    equal(pending.result.entry.pending.version, '2.0.0', 'pending update version');
    equal(pending.result.entry.pending.state, 'needs-activation', 'pending update state');
    const activeSource = File.read(File.join(env.OPENDESK_APP_DATA_DIR, 'flows', active.result.entry.installId, 'main.js'));
    assert(activeSource.includes('ready-v1-executed'), 'active v1 content was replaced while v2 still needs activation');
    assertNeverExecuted();
  });

  test({
    name: 'flow install rejects tamper, traversal, reserved/ADS names, duplicate aliases and symlink ZIP entries with zero business execution',
    tier: 'unit',
    covers: ['Command.run', 'File.readBytes', 'File.writeBytes'],
  }, async () => {
    const env = installEnv('attacks');
    const valid = await packOrdinary('attack-base', {
      flowId: 'com.opendesk.tests.attack-base',
      assets: [{ path: 'res.txt', content: 'FLOW_B1_ASSET_TAMPER_91f2a0\n' }],
    });

    const attacks = [];
    const assetTampered = File.join(root, 'attack-asset-tampered.odflow');
    tamperStoredASCII(valid, assetTampered, 'FLOW_B1_ASSET_TAMPER_91f2a0');
    attacks.push([assetTampered, null]);
    const signatureTampered = File.join(root, 'attack-signature-tampered.odflow');
    tamperEntryByte(valid, signatureTampered, 'flow.sig');
    attacks.push([signatureTampered, 'invalid_signature']);
    for (const [suffix, replacement] of [
      ['traversal', '../x.txt'],
      ['reserved', 'NUL.txt'],
      ['ads', 'a:b.txt'],
      ['unexpected', 'new.txt'],
    ]) {
      const target = File.join(root, `attack-${suffix}.odflow`);
      rewriteZipEntryNameSameLength(valid, target, 'res.txt', replacement);
      attacks.push([target, suffix === 'unexpected' ? 'file_mismatch' : 'invalid_path']);
    }
    const symlink = File.join(root, 'attack-symlink.odflow');
    markZipEntrySymlink(valid, symlink, 'res.txt');
    attacks.push([symlink, 'invalid_package']);

    const duplicateBase = await packOrdinary('duplicate-base', {
      flowId: 'com.opendesk.tests.duplicate-base',
      assets: [{ path: 'aa.txt', content: 'a' }, { path: 'bb.txt', content: 'b' }],
    });
    const duplicate = File.join(root, 'attack-duplicate.odflow');
    rewriteZipEntryNameSameLength(duplicateBase, duplicate, 'bb.txt', 'aa.txt');
    attacks.push([duplicate, 'invalid_path']);

    for (const [packagePath, expectedCode] of attacks) {
      const failure = await cli(['flow', 'install', packagePath, '--trust', 'flow'], false, env);
      if (expectedCode) equal(failure.error.code, expectedCode, `attack classification for ${packagePath}`);
      assertNeverExecuted();
    }
    const listed = await cli(['flow', 'list'], true, env);
    equal(listed.result.flows.length, 0, 'rejected packages left installed catalog entries');
    assertNeverExecuted();
  });

  test({
    name: 'publisher trust scope, display-name isolation, orphan staging recovery and uninstall isolation survive separate CLI processes',
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
    const installedA = await cli(['flow', 'install', flowA, '--trust', 'publisher'], true, env);
    const installedB = await cli(['flow', 'install', flowB], true, env);
    assert(installedA.result.entry.installId !== installedB.result.entry.installId, 'display name was used as install identity');

    const dataA = File.join(env.OPENDESK_APP_DATA_DIR, 'flow-data', installedA.result.entry.installId, 'user-state.txt');
    File.write(dataA, 'keep');
    const orphan = File.join(env.OPENDESK_APP_DATA_DIR, 'flow-state', 'transactions', '11111111111111111111111111111111');
    File.ensureDir(orphan);
    const beforeUninstall = await cli(['flow', 'list'], true, env);
    equal(beforeUninstall.result.flows.length, 2, 'catalog should contain both same-name flows');
    assert(!File.exists(orphan), 'orphan staging transaction without journal was not recovered');

    await cli(['flow', 'uninstall', installedA.result.entry.installId], true, env);
    assert(File.isFile(dataA), 'default uninstall removed Flow user data');
    const afterUninstall = await cli(['flow', 'list'], true, env);
    equal(afterUninstall.result.flows.length, 1, 'uninstall damaged another Flow');
    equal(afterUninstall.result.flows[0].installId, installedB.result.entry.installId, 'wrong Flow survived uninstall');

    const flowC = await packOrdinary('lifecycle-c', { flowId: 'com.opendesk.tests.lifecycle-c' });
    const installedC = await cli(['flow', 'install', flowC], true, env);
    equal(installedC.result.verification.publisherTrust, 'trusted_publisher', 'uninstall removed shared publisher trust');

    const rejected = await packOrdinary('lifecycle-rejected', { flowId: 'com.opendesk.tests.lifecycle-rejected' });
    await cli(['flow', 'trust', 'reject', rejected, '--scope', 'flow'], true, env);
    const rejection = await cli(['flow', 'install', rejected, '--trust', 'flow'], false, env);
    equal(rejection.error.code, 'publisher_rejected', 'explicit reject was bypassed by install approval');
    assertNeverExecuted();
  });
})();

await RuntimeAPITest.run('RUNTIME-API-FLOW-INSTALLATION');
