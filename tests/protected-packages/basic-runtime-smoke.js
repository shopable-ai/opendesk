// Fast protected-package smoke test: plain JS -> .odpkg -> P1 authorization -> protected run -> compare.
//
// Run from the repository root:
// ./dist/opendesk -script "$PWD/tests/protected-packages/basic-runtime-smoke.js" -console-mode script
//
// This intentionally does NOT depend on Screen Recording, Accessibility, OCR,
// Calculator, or native UI interaction. On macOS it creates a dedicated temporary
// Keychain so the production P1 device-key provider can be exercised without
// reusing the user's normal OpenDesk device identity.
'use strict';

const root = Execution.workdir;
const binary = File.join(root, 'dist', 'opendesk');
const sourcePath = File.join(root, 'examples', 'protected-packages', 'basic.js');
const runToken = Execution.id;
const runDir = File.join(root, '.runtime', 'tests', 'protected-packages-basic', runToken);
const commandsDir = File.join(runDir, 'commands');
const packageDir = File.join(runDir, 'package');
const keysDir = File.join(runDir, 'keys');
const lanesDir = File.join(runDir, 'lanes');
const licenseRoot = File.join(runDir, 'installed-p1');
const devicePublic = File.join(runDir, 'device-public.json');
const packagePath = File.join(packageDir, 'basic.odpkg');
const contentKey = File.join(packageDir, 'basic.content-key');
const licensePath = File.join(packageDir, 'basic.odlicense');
const publisherPrivate = File.join(keysDir, 'publisher-private.pem');
const publisherPublic = File.join(keysDir, 'publisher-public.pem');
const issuerPrivate = File.join(keysDir, 'license-issuer-private.pem');
const issuerPublic = File.join(keysDir, 'license-issuer-public.pem');
const deviceKeychainPath = File.join(runDir, 'p1-device.keychain-db');
const summaryPath = File.join(runDir, 'basic-runtime-smoke-summary.json');
const installationEnvironment = {OPENDESK_PROTECTED_RECIPE_ROOT: licenseRoot};

// This exact marker also exists in examples/protected-packages/basic.js but is
// never written to business-result.json or stdout by that example. Its purpose
// is to detect accidental plaintext inclusion in the generated .odpkg or the
// protected execution artifacts.
const SOURCE_ONLY_SENTINEL = 'OPENDESK_PROTECTED_SOURCE_SENTINEL_7A4F19C2D86E31B5';

const keychainState = {
  originalDefault: '',
  originalSearchList: [],
};

const secretFiles = [publisherPrivate, issuerPrivate, contentKey, licensePath];
const phases = [];
let activePhase = 'preflight';

class StageError extends Error {
  constructor(phase, message) {
    super(message);
    this.name = 'StageError';
    this.phase = phase;
  }
}

function fail(message) {
  throw new StageError(activePhase, message);
}

function assert(condition, message) {
  if (!condition) fail(message);
}

function beginPhase(name) {
  activePhase = name;
  phases.push({name, status: 'running', startedAt: new Date().toISOString()});
  console.log(`[PROTECTED-PACKAGE-BASIC] phase=${name}`);
}

function passPhase(details) {
  const item = phases[phases.length - 1];
  item.status = 'passed';
  item.completedAt = new Date().toISOString();
  if (details) item.details = details;
}

function parseJSON(text, label) {
  try {
    return JSON.parse(text);
  } catch (_) {
    fail(`${label} did not return valid JSON`);
  }
}

function writeJSON(path, value) {
  if (File.exists(path)) fail(`refusing to overwrite evidence: ${path}`);
  File.write(path, JSON.stringify(value, null, 2) + '\n');
}

function readJSON(path, label) {
  assert(File.isFile(path), `${label} is missing: ${path}`);
  return parseJSON(File.read(path), label);
}

function cleanLabel(value) {
  return String(value).replace(/[^A-Za-z0-9._-]/g, '-');
}

async function runCommand(command, args, options, label) {
  try {
    return await Command.run(command, args, Object.assign({
      cwd: root,
      timeout: 60_000,
      maxOutputBytes: 4 * 1024 * 1024,
    }, options || {}));
  } catch (error) {
    const code = error && error.code ? String(error.code) : 'UNKNOWN';
    const exitCode = error && Number.isInteger(error.exitCode) ? error.exitCode : null;
    const stderr = String(error && error.stderr || '').trim();
    throw new StageError(activePhase,
      `${label} failed (${code}${exitCode === null ? '' : ` exit=${exitCode}`})${stderr ? `: ${stderr}` : ''}`);
  }
}

async function runEnvelope(args, label, expectedCommand) {
  let child;
  try {
    child = await Command.run(binary, args, {
      cwd: root,
      timeout: 60_000,
      maxOutputBytes: 4 * 1024 * 1024,
      env: installationEnvironment,
    });
  } catch (error) {
    const stdout = String(error && error.stdout || '').trim();
    if (stdout) {
      try {
        writeJSON(File.join(commandsDir, cleanLabel(label) + '-failure.json'), JSON.parse(stdout));
      } catch (_) {
        // Keep failure evidence minimal when stdout is not a JSON envelope.
      }
    }
    const code = error && error.code ? String(error.code) : 'UNKNOWN';
    const exitCode = error && Number.isInteger(error.exitCode) ? error.exitCode : null;
    throw new StageError(activePhase,
      `${label} failed (${code}${exitCode === null ? '' : ` exit=${exitCode}`})`);
  }
  const envelope = parseJSON(child.stdout, label);
  writeJSON(File.join(commandsDir, cleanLabel(label) + '.json'), envelope);
  assert(envelope && envelope.ok === true, `${label} returned ok != true`);
  if (expectedCommand) assert(envelope.command === expectedCommand, `${label} command identity mismatch`);
  return envelope;
}

async function sha256(path) {
  const result = await runCommand('/usr/bin/shasum', ['-a', '256', path], null, `sha256 ${path}`);
  const value = String(result.stdout || '').trim().split(/\s+/)[0];
  assert(/^[0-9a-f]{64}$/.test(value), `invalid SHA-256 output for ${path}`);
  return value;
}

function containsSnapshot(directory) {
  if (!File.isDir(directory)) return false;
  return File.listDir(directory).some(name => String(name).includes('script_snapshot'));
}

function textFilesUnder(directory) {
  const out = [];
  if (!File.isDir(directory)) return out;
  for (const name of File.listDir(directory)) {
    const path = File.join(directory, name);
    if (File.isDir(path)) {
      out.push(...textFilesUnder(path));
      continue;
    }
    if (!File.isFile(path)) continue;
    if (/\.(json|ndjson|log|txt)$/i.test(String(name))) out.push(path);
  }
  return out;
}

function assertNoSentinelInTextArtifacts(directory) {
  for (const path of textFilesUnder(directory)) {
    const content = File.read(path);
    assert(!String(content).includes(SOURCE_ONLY_SENTINEL),
      `protected artifact disclosed source-only sentinel: ${path}`);
  }
}

function parseKeychainPaths(stdout) {
  const paths = [];
  const pattern = /"([^"]+)"/g;
  let match;
  while ((match = pattern.exec(String(stdout))) !== null) paths.push(match[1]);
  return paths;
}

async function setupIsolatedDeviceKeychain() {
  const defaultResult = await runCommand('/usr/bin/security', ['default-keychain', '-d', 'user'], null,
    'read default user Keychain');
  const listResult = await runCommand('/usr/bin/security', ['list-keychains', '-d', 'user'], null,
    'read user Keychain search list');
  keychainState.originalDefault = parseKeychainPaths(defaultResult.stdout)[0] || '';
  keychainState.originalSearchList = parseKeychainPaths(listResult.stdout);
  assert(keychainState.originalDefault && keychainState.originalSearchList.length > 0,
    'could not snapshot current user Keychain configuration');
  assert(!File.exists(deviceKeychainPath), 'temporary device Keychain already exists');

  // The empty password is intentional for a short-lived test Keychain. The
  // actual device private material is still created and owned by the production
  // macOS Keychain provider, and this whole Keychain is deleted in cleanup.
  await runCommand('/usr/bin/security', ['create-keychain', '-p', '', deviceKeychainPath], null,
    'create isolated device Keychain');
  await runCommand('/usr/bin/security', ['unlock-keychain', '-p', '', deviceKeychainPath], null,
    'unlock isolated device Keychain');
  await runCommand('/usr/bin/security', ['set-keychain-settings', '-lut', '3600', deviceKeychainPath], null,
    'configure isolated device Keychain');
  await runCommand('/usr/bin/security', ['list-keychains', '-d', 'user', '-s', deviceKeychainPath], null,
    'select isolated Keychain search list');
  await runCommand('/usr/bin/security', ['default-keychain', '-d', 'user', '-s', deviceKeychainPath], null,
    'select isolated default Keychain');
}

async function executeVariant(variant, inputPath) {
  const artifactDir = File.join(lanesDir, variant);
  assert(!File.exists(artifactDir), `${variant} artifact directory already exists`);
  const child = await runCommand(binary, [
    '-script', inputPath,
    '-log-dir', artifactDir,
    '-console-mode', 'script',
  ], {env: installationEnvironment}, `${variant} Runtime execution`);

  const resultPath = File.join(artifactDir, 'business-result.json');
  const summaryFile = File.join(artifactDir, 'summary.json');
  const businessResult = readJSON(resultPath, `${variant} business result`);
  const executionSummary = readJSON(summaryFile, `${variant} execution summary`);

  if (variant === 'plain') {
    assert(containsSnapshot(artifactDir), 'plain execution should keep its normal source snapshot');
  } else {
    assert(!containsSnapshot(artifactDir), 'protected execution wrote a source snapshot');
    assert(!executionSummary.scriptSnapshotPath, 'protected execution summary advertised a source snapshot');
    assert(!String(child.stdout || '').includes(SOURCE_ONLY_SENTINEL),
      'protected stdout disclosed source-only sentinel');
    assert(!String(child.stderr || '').includes(SOURCE_ONLY_SENTINEL),
      'protected stderr disclosed source-only sentinel');
    assertNoSentinelInTextArtifacts(artifactDir);
  }
  return {artifactDir, resultPath, businessResult, executionSummary};
}

async function cleanupSecurityState() {
  const removed = [];
  const failures = [];

  async function cleanupSecurity(args, label) {
    try {
      await Command.run('/usr/bin/security', args, {
        cwd: root,
        timeout: 20_000,
        maxOutputBytes: 1024 * 1024,
      });
      return true;
    } catch (_) {
      failures.push(label);
      return false;
    }
  }

  if (keychainState.originalSearchList.length > 0) {
    await cleanupSecurity(['list-keychains', '-d', 'user', '-s'].concat(keychainState.originalSearchList),
      'restore user Keychain search list');
  }
  if (keychainState.originalDefault) {
    await cleanupSecurity(['default-keychain', '-d', 'user', '-s', keychainState.originalDefault],
      'restore default user Keychain');
  }
  if (File.exists(deviceKeychainPath)) {
    if (await cleanupSecurity(['delete-keychain', deviceKeychainPath], 'delete temporary device Keychain')) {
      removed.push(deviceKeychainPath);
    }
  }

  for (const path of secretFiles) {
    if (!File.exists(path)) continue;
    try {
      File.remove(path);
      removed.push(path);
    } catch (_) {
      failures.push(`remove secret ${path}`);
    }
  }

  if (File.exists(licenseRoot)) {
    try {
      File.removeDir(licenseRoot);
      removed.push(licenseRoot);
    } catch (_) {
      failures.push(`remove installed P1 root ${licenseRoot}`);
    }
  }

  const stillPresent = secretFiles.filter(path => File.exists(path));
  if (File.exists(deviceKeychainPath)) stillPresent.push(deviceKeychainPath);
  if (File.exists(licenseRoot)) stillPresent.push(licenseRoot);

  return {
    status: failures.length === 0 && stillPresent.length === 0 ? 'passed' : 'failed',
    removed,
    failures,
    stillPresent,
    retainedSafeEvidence: [packagePath, publisherPublic, issuerPublic, devicePublic, commandsDir, lanesDir],
  };
}

const report = {
  schemaVersion: 1,
  kind: 'opendesk-protected-package-basic-runtime-smoke',
  runToken,
  runDir,
  sourcePath,
  packagePath,
  startedAt: new Date().toISOString(),
  platform: null,
  keys: {
    policy: 'ephemeral-per-run',
    publisherSigningKey: 'generated for this run; private removed during cleanup; public retained',
    licenseIssuerKey: 'generated separately for this run; private removed during cleanup; public retained',
    contentKey: 'fresh package DEK generated by package protect --key-out; removed before protected execution',
    devicePrivateKey: 'created by production P1 provider in a dedicated temporary macOS Keychain; never exported',
  },
  phases,
  passed: false,
  failure: null,
  cleanup: null,
};

let failure = null;
try {
  beginPhase('preflight');
  const platform = System.getPlatformInfo();
  report.platform = platform;
  assert(platform && platform.os === 'darwin',
    'basic P1 smoke currently requires macOS because it isolates the production device provider in a temporary Keychain');
  const commandCapabilities = Command.getCapabilities();
  assert(commandCapabilities && commandCapabilities.enabled && commandCapabilities.supported,
    'local Command capability is required');
  assert(File.isFile(binary), `compiled Runtime is missing: ${binary}`);
  assert(File.isFile(sourcePath), `basic example is missing: ${sourcePath}`);
  const sourceText = File.read(sourcePath);
  assert(sourceText.includes(SOURCE_ONLY_SENTINEL),
    'basic example source-only sentinel is missing or out of sync with the smoke test');
  assert(!File.exists(runDir), `refusing to reuse smoke evidence directory: ${runDir}`);
  File.ensureDir(commandsDir);
  File.ensureDir(packageDir);
  File.ensureDir(keysDir);
  File.ensureDir(lanesDir);
  console.log(`[PROTECTED-PACKAGE-BASIC] evidence=${runDir}`);
  console.log('[PROTECTED-PACKAGE-BASIC] keys=ephemeral Publisher + separate License issuer + per-package random DEK');
  passPhase({sourcePath, binary});

  beginPhase('plain-execute');
  const plain = await executeVariant('plain', sourcePath);
  passPhase({resultPath: plain.resultPath, sourceSnapshotPresent: true});

  beginPhase('generate-test-keys');
  await runCommand('openssl', ['genpkey', '-algorithm', 'ED25519', '-out', publisherPrivate], null,
    'generate Publisher private key');
  await runCommand('openssl', ['pkey', '-in', publisherPrivate, '-pubout', '-out', publisherPublic], null,
    'derive Publisher public key');
  await runCommand('openssl', ['genpkey', '-algorithm', 'ED25519', '-out', issuerPrivate], null,
    'generate License issuer private key');
  await runCommand('openssl', ['pkey', '-in', issuerPrivate, '-pubout', '-out', issuerPublic], null,
    'derive License issuer public key');
  assert(File.isFile(publisherPrivate) && File.isFile(publisherPublic), 'Publisher test keypair was not created');
  assert(File.isFile(issuerPrivate) && File.isFile(issuerPublic), 'License issuer test keypair was not created');
  await setupIsolatedDeviceKeychain();
  const device = await runEnvelope(['license', 'device', '-o', devicePublic], 'license-device', 'license.device');
  assert(device.result && device.result.identity && device.result.identity.deviceId,
    'P1 device identity was not created');
  passPhase({deviceId: device.result.identity.deviceId, publisherAndIssuerKeysSeparate: true});

  beginPhase('package-protect');
  const idStem = `odpkg-basic-${runToken}`.slice(0, 90);
  const identity = {
    packageId: `${idStem}-package`,
    productId: `${idStem}-product`,
    publisherId: `odpkg-basic-publisher-${runToken}`.slice(0, 120),
    publisherKeyId: `odpkg-basic-publisher-key-${runToken}`.slice(0, 120),
    contentKeyId: `${idStem}-dek`,
    issuerKeyId: `odpkg-basic-license-key-${runToken}`.slice(0, 120),
  };
  const protect = await runEnvelope([
    'package', 'protect', sourcePath,
    '-o', packagePath,
    '--package-id', identity.packageId,
    '--product-id', identity.productId,
    '--publisher-id', identity.publisherId,
    '--publisher-key-id', identity.publisherKeyId,
    '--content-key-id', identity.contentKeyId,
    '--minimum-runtime-version', '0.0.0',
    '--signing-key', publisherPrivate,
    '--key-out', contentKey,
  ], 'package-protect', 'package.protect');
  assert(File.isFile(packagePath) && File.stat(packagePath).size > 0, 'package protect did not create a non-empty .odpkg');
  assert(File.isFile(contentKey), 'package protect did not create the per-package DEK');
  const keyMode = (await runCommand('/usr/bin/stat', ['-f', '%Lp', contentKey], null,
    'check generated DEK permissions')).stdout.trim();
  assert(keyMode === '600', `generated DEK mode must be 0600, got ${keyMode}`);
  passPhase({packagePath, generatedContentKeyFile: protect.result.generatedContentKeyFile, generatedDEKMode: keyMode});

  beginPhase('package-inspect-verify');
  const inspect = await runEnvelope(['package', 'inspect', packagePath], 'package-inspect', 'package.inspect');
  const verify = await runEnvelope([
    'package', 'verify', packagePath,
    '--public-key', publisherPublic,
  ], 'package-verify', 'package.verify');
  const manifest = inspect.result && inspect.result.manifest;
  const digest = inspect.result && inspect.result.packageDigest;
  assert(manifest && manifest.packageId === identity.packageId, 'package inspect returned the wrong packageId');
  assert(manifest.productId === identity.productId, 'package inspect returned the wrong productId');
  assert(manifest.publisherId === identity.publisherId, 'package inspect returned the wrong publisherId');
  assert(manifest.publisherKeyId === identity.publisherKeyId, 'package inspect returned the wrong publisherKeyId');
  assert(manifest.encryption && manifest.encryption.keyId === identity.contentKeyId,
    'package inspect returned the wrong contentKeyId');
  assert(manifest.license && manifest.license.required === true, 'basic smoke package must require a License');
  assert(verify.result && verify.result.signatureVerified === true, 'Publisher signature verification did not pass');
  assert(verify.result.packageDigest === digest, 'package inspect/verify digest mismatch');
  assert(/^[0-9a-f]{64}$/.test(String(digest || '')), 'package digest is not SHA-256 hex');
  assert(JSON.stringify([protect, inspect, verify]).indexOf(SOURCE_ONLY_SENTINEL) === -1,
    'package command envelopes disclosed the source-only sentinel');
  const sourceHash = await sha256(sourcePath);
  const packageHash = await sha256(packagePath);
  assert(sourceHash !== packageHash, 'generated .odpkg unexpectedly has the same bytes as source JavaScript');
  const packageStrings = await runCommand('/usr/bin/strings', [packagePath], null, 'scan package printable strings');
  assert(!String(packageStrings.stdout || '').includes(SOURCE_ONLY_SENTINEL),
    'generated .odpkg contains the source-only sentinel in printable plaintext');
  passPhase({packageDigest: digest, signatureVerified: true, sourceSentinelAbsent: true});

  beginPhase('p1-authorize-install');
  const issue = await runEnvelope([
    'license', 'issue', packagePath,
    '--device', devicePublic,
    '--content-key', contentKey,
    '--signing-key', issuerPrivate,
    '--license-id', `${idStem}-license`,
    '--subject-id', 'opendesk-basic-smoke-local-subject',
    '--issuer-key-id', identity.issuerKeyId,
    '--expires-at', '2099-01-01T00:00:00Z',
    '-o', licensePath,
  ], 'license-issue', 'license.issue');
  const licenseInspect = await runEnvelope(['license', 'inspect', licensePath], 'license-inspect', 'license.inspect');
  const licenseVerify = await runEnvelope([
    'license', 'verify', licensePath,
    '--issuer-key', issuerPublic,
  ], 'license-verify', 'license.verify');
  const install = await runEnvelope([
    'license', 'install', licensePath,
    '--package', packagePath,
    '--package-publisher-key', publisherPublic,
    '--issuer-key', issuerPublic,
  ], 'license-install', 'license.install');
  assert(issue.result && issue.result.packageId === identity.packageId, 'issued License package identity mismatch');
  assert(licenseInspect.result && licenseInspect.result.packageId === identity.packageId,
    'License inspect package identity mismatch');
  assert(licenseVerify.result && licenseVerify.result.signatureVerified === true &&
    licenseVerify.result.deviceBindingVerified === true && licenseVerify.result.contentKeyAccessible === true,
  'License verify did not prove signature, device binding, and content-key accessibility');
  assert(install.result && install.result.installed === true && install.result.packageVerified === true &&
    install.result.signatureVerified === true,
  'License install did not prove package and License verification');

  // Critical test condition: protected execution must not have direct access to
  // Publisher-side DEK or the raw .odlicense file. It must use the installed P1
  // provider chain, so remove both before running the .odpkg.
  File.remove(contentKey);
  File.remove(licensePath);
  assert(!File.exists(contentKey) && !File.exists(licensePath),
    'Publisher DEK or raw License remained before protected execution');
  passPhase({
    packageVerifiedAtInstall: true,
    licenseVerifiedForDevice: true,
    publisherDEKRemovedBeforeRuntime: true,
    rawLicenseRemovedBeforeRuntime: true,
  });

  beginPhase('protected-execute');
  const protectedRun = await executeVariant('protected', packagePath);
  passPhase({resultPath: protectedRun.resultPath, sourceSnapshotPresent: false});

  beginPhase('business-compare');
  assert(JSON.stringify(plain.businessResult) === JSON.stringify(protectedRun.businessResult),
    'plain and protected business-result.json differ');
  passPhase({
    oracle: 'exact deterministic business-result.json equality',
    plainResult: plain.resultPath,
    protectedResult: protectedRun.resultPath,
    result: plain.businessResult,
  });

  beginPhase('source-disclosure-check');
  assertNoSentinelInTextArtifacts(protectedRun.artifactDir);
  assert(!containsSnapshot(protectedRun.artifactDir), 'protected execution created a source snapshot');
  passPhase({sourceOnlySentinelAbsent: true, protectedSourceSnapshotAbsent: true});

  report.package = {
    path: packagePath,
    digest: inspect.result.packageDigest,
    identity,
    sourceSentinelAbsent: true,
  };
  report.results = {
    plain: plain.resultPath,
    protected: protectedRun.resultPath,
    equal: true,
  };
  report.passed = true;
} catch (error) {
  failure = error;
  const item = phases[phases.length - 1];
  if (item && item.status === 'running') {
    item.status = 'failed';
    item.completedAt = new Date().toISOString();
    item.message = String(error && error.message || error);
  }
  report.failure = {
    phase: error && error.phase ? error.phase : activePhase,
    message: String(error && error.message || error),
  };
} finally {
  report.cleanup = await cleanupSecurityState();
  if (report.cleanup.status !== 'passed') {
    report.passed = false;
    report.failure = report.failure || {
      phase: 'cleanup',
      message: 'ephemeral private keys, DEK, raw License, P1 install root, or temporary Keychain could not be fully removed',
    };
    if (!failure) failure = new StageError('cleanup', report.failure.message);
  }
  report.completedAt = new Date().toISOString();
  if (File.isDir(runDir)) {
    if (File.exists(summaryPath)) File.remove(summaryPath);
    File.write(summaryPath, JSON.stringify(report, null, 2) + '\n');
  }
}

if (failure || !report.passed) {
  console.log('[PROTECTED-PACKAGE-BASIC] failed ' + JSON.stringify({
    runDir,
    packagePath: File.isFile(packagePath) ? packagePath : null,
    failure: report.failure,
    cleanup: report.cleanup && report.cleanup.status,
  }));
  throw new Error(`[${report.failure.phase}] ${report.failure.message}; evidence=${runDir}`);
}

console.log('[PROTECTED-PACKAGE-BASIC] passed ' + JSON.stringify({
  runDir,
  packagePath,
  plainResult: report.results.plain,
  protectedResult: report.results.protected,
  signatureVerified: true,
  sourceDisclosure: 'passed',
  cleanup: report.cleanup.status,
}));
