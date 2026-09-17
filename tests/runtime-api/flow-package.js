// Real OpenDesk Runtime coverage for .odflow B0. This test never executes a
// packaged Flow entry; it only calls the production CLI through Command.run().
(0, eval)(File.read(File.join(File.cwd(), 'tests/runtime-api/framework.js')));
RuntimeAPITest.load('tests/runtime-api/manifest.js');

(() => {
  const { assert, equal, test } = RuntimeAPITest;
  const binary = System.getExecutablePath();
  const root = File.join(Execution.workdir, '.runtime', 'tests', 'flow-package', Execution.id);
  const fixtures = File.join(Execution.workdir, 'tests', 'flow-distribution', 'fixtures');
  const sentinel = File.join(root, 'BUSINESS_EXECUTED.txt');
  const sourceToken = 'FLOW_SOURCE_MUST_NOT_APPEAR_IN_INSPECT_7f4b8b';

  File.ensureDir(root);

  const harnessFile = File.join(Execution.workdir, 'tests', 'runtime-api', 'support', 'flow-package-harness.js');
  const createHarness = (0, eval)(File.read(harnessFile) + '\n//# sourceURL=' + harnessFile);
  const {
    cli, assertNeverExecuted, setupTrust, tamperStoredASCII, tamperEntryByte,
    publisherPrivate, publisherPublic, licenseIssuerPublic, contentKey,
  } = createHarness({ assert, binary, root, fixtures, sentinel, sourceToken });

  test({
    name: 'flow pack/inspect/verify builds a signed ordinary .odflow without executing business code',
    tier: 'unit',
    covers: ['Command.run', 'File.readBytes', 'File.writeBytes'],
  }, async () => {
    const flowRoot = File.join(root, 'ordinary');
    const assets = File.join(flowRoot, 'assets');
    File.ensureDir(assets);
    setupTrust(flowRoot);
    File.write(File.join(flowRoot, 'main.js'), `// ${sourceToken}\nFile.write(${JSON.stringify(sentinel)}, 'unexpected execution');\n`);
    File.write(File.join(assets, 'template.txt'), 'FLOW_ASSET_TAMPER_TARGET_19dca5\n');
    const output = File.join(root, 'ordinary.odflow');
    const packed = await cli([
      'flow', 'pack', flowRoot,
      '-o', output,
      '--flow-id', 'com.opendesk.test.ordinary',
      '--name', 'B0 Ordinary Flow',
      '--version', '1.0.0',
      '--publisher-id', 'com.opendesk.tests',
      '--publisher-key-id', 'publisher-test-v1',
      '--entry', 'main.js',
      '--minimum-runtime-version', '0.0.0',
      '--platform', 'darwin', '--platform', 'linux', '--platform', 'windows',
      '--file', 'main.js', '--file', 'assets/template.txt', '--file', 'trust/publisher.pub',
      '--signing-key', publisherPrivate,
    ]);
    equal(packed.result.manifest.entry, 'main.js', 'ordinary entry');
    equal(packed.result.manifest.files.length, 3, 'ordinary file inventory');
    assertNeverExecuted();

    const inspected = await cli(['flow', 'inspect', output]);
    equal(inspected.result.verification.signature, 'not_checked', 'inspect signature state');
    equal(inspected.result.verification.publisherTrust, 'not_evaluated', 'inspect trust state');
    equal(inspected.result.verification.authorization, 'not_evaluated', 'inspect authorization state');
    assert(!JSON.stringify(inspected).includes(sourceToken), 'inspect leaked JavaScript source');
    assertNeverExecuted();

    const verified = await cli(['flow', 'verify', output, '--public-key', publisherPublic]);
    equal(verified.result.verification.signature, 'verified_candidate_key', 'verify signature state');
    equal(verified.result.verification.publisherTrust, 'not_evaluated', 'verify must not create publisher trust');
    equal(verified.result.verification.authorization, 'not_evaluated', 'verify must not authorize execution');
    assertNeverExecuted();

    const overwrite = await cli([
      'flow', 'pack', flowRoot,
      '-o', output,
      '--flow-id', 'com.opendesk.test.ordinary', '--name', 'B0 Ordinary Flow', '--version', '1.0.0',
      '--publisher-id', 'com.opendesk.tests', '--publisher-key-id', 'publisher-test-v1',
      '--entry', 'main.js', '--minimum-runtime-version', '0.0.0', '--platform', 'darwin',
      '--file', 'main.js', '--file', 'assets/template.txt', '--file', 'trust/publisher.pub',
      '--signing-key', publisherPrivate,
    ], false);
    equal(overwrite.error.code, 'output_exists', 'existing output must not be overwritten');
    assertNeverExecuted();
  });

  test({
    name: 'flow pack reuses .odpkg verification for protected entries without activation or execution',
    tier: 'unit',
    covers: ['Command.run'],
  }, async () => {
    const flowRoot = File.join(root, 'protected');
    File.ensureDir(flowRoot);
    setupTrust(flowRoot, true);
    const protectedSource = File.join(root, 'protected-source.js');
    File.write(protectedSource, `// ${sourceToken}\nFile.write(${JSON.stringify(sentinel)}, 'unexpected protected execution');\n`);
    const protectedEntry = File.join(flowRoot, 'main.odpkg');
    const inner = await cli([
      'package', 'protect', protectedSource,
      '-o', protectedEntry,
      '--package-id', 'com.opendesk.test.protected.package',
      '--product-id', 'com.opendesk.test.product',
      '--publisher-id', 'com.opendesk.tests',
      '--publisher-key-id', 'publisher-test-v1',
      '--content-key-id', 'content-test-v1',
      '--minimum-runtime-version', '0.0.0',
      '--signing-key', publisherPrivate,
      '--content-key', contentKey,
      '--license-required=false',
    ]);
    assert(inner.ok === true, 'inner .odpkg build failed');
    assertNeverExecuted();

    const output = File.join(root, 'protected.odflow');
    const packed = await cli([
      'flow', 'pack', flowRoot,
      '-o', output,
      '--flow-id', 'com.opendesk.test.protected', '--name', 'B0 Protected Flow', '--version', '1.0.0',
      '--publisher-id', 'com.opendesk.tests', '--publisher-key-id', 'publisher-test-v1',
      '--entry', 'main.odpkg', '--minimum-runtime-version', '0.0.0', '--platform', 'darwin', '--platform', 'windows',
      '--file', 'main.odpkg', '--file', 'trust/publisher.pub', '--file', 'trust/license-issuer.pub',
      '--product-id', 'com.opendesk.test.product', '--license-issuer-key-id', 'issuer-test-v1', '--purpose', 'run',
      '--signing-key', publisherPrivate,
    ]);
    equal(packed.result.manifest.entry, 'main.odpkg', 'protected entry');
    assertNeverExecuted();
    const inspected = await cli(['flow', 'inspect', output]);
    assert(!JSON.stringify(inspected).includes(sourceToken), 'protected inspect leaked plaintext source');
    await cli(['flow', 'verify', output, '--public-key', publisherPublic]);
    assertNeverExecuted();
  });

  test({
    name: 'flow verification rejects tampered packages and invalid pack inputs with zero business execution',
    tier: 'unit',
    covers: ['Command.run', 'File.readBytes', 'File.writeBytes'],
  }, async () => {
    const source = File.join(root, 'ordinary.odflow');
    assert(File.isFile(source), 'ordinary fixture package missing');

    const entryTampered = File.join(root, 'tampered-entry.odflow');
    tamperStoredASCII(source, entryTampered, sourceToken);
    const entryFailure = await cli(['flow', 'verify', entryTampered, '--public-key', publisherPublic], false);
    assert(entryFailure.error.code !== '', 'entry tamper was not rejected');
    assertNeverExecuted();

    const assetTampered = File.join(root, 'tampered-asset.odflow');
    tamperStoredASCII(source, assetTampered, 'FLOW_ASSET_TAMPER_TARGET_19dca5');
    const assetFailure = await cli(['flow', 'verify', assetTampered, '--public-key', publisherPublic], false);
    assert(assetFailure.error.code !== '', 'asset tamper was not rejected');
    assertNeverExecuted();

    const manifestTampered = File.join(root, 'tampered-manifest.odflow');
    tamperStoredASCII(source, manifestTampered, 'B0 Ordinary Flow');
    const manifestFailure = await cli(['flow', 'verify', manifestTampered, '--public-key', publisherPublic], false);
    assert(manifestFailure.error.code !== '', 'manifest tamper was not rejected');
    assertNeverExecuted();

    const signatureTampered = File.join(root, 'tampered-signature.odflow');
    tamperEntryByte(source, signatureTampered, 'flow.sig');
    const signatureFailure = await cli(['flow', 'verify', signatureTampered, '--public-key', publisherPublic], false);
    assert(signatureFailure.error.code !== '', 'signature tamper was not rejected');
    assertNeverExecuted();

    const invalidOutput = File.join(root, 'invalid.odflow');
    const duplicateInput = await cli([
      'flow', 'pack', File.join(root, 'ordinary'),
      '-o', invalidOutput,
      '--flow-id', 'com.opendesk.test.invalid', '--name', 'Invalid Flow', '--version', '1.0.0',
      '--publisher-id', 'com.opendesk.tests', '--publisher-key-id', 'publisher-test-v1',
      '--entry', 'main.js', '--minimum-runtime-version', '0.0.0', '--platform', 'darwin',
      '--file', 'main.js', '--file', 'main.js', '--file', 'trust/publisher.pub',
      '--signing-key', publisherPrivate,
    ], false);
    equal(duplicateInput.error.code, 'invalid_path', 'duplicate input classification');
    assert(!File.exists(invalidOutput), 'invalid pack left an output file');
    assertNeverExecuted();

    const wrongKey = await cli(['flow', 'verify', source, '--public-key', licenseIssuerPublic], false);
    equal(wrongKey.error.code, 'invalid_signature', 'wrong candidate key classification');
    assertNeverExecuted();
  });
})();

await RuntimeAPITest.run('RUNTIME-API-FLOW-PACKAGE');
