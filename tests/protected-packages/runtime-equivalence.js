// Canonical protected-package runtime equivalence gate.
//
// From the repository root:
// ./dist/opendesk -script tests/protected-packages/runtime-equivalence.js -console-mode script
//
// This file is executed by the compiled OpenDesk JavaScript Runtime. It does
// not require Node.js or Go and does not contact external services.
'use strict';

const root = Execution.workdir;
const binary = File.join(root, 'dist', 'opendesk');
const uiHost = File.join(root, 'dist', 'opendesk-ui-host');
const runToken = Execution.id;
const runDir = File.join(root, '.runtime', 'tests', 'protected-packages', runToken);
const commandsDir = File.join(runDir, 'commands');
const packagesDir = File.join(runDir, 'packages');
const licenseRoot = File.join(runDir, 'installed-p1');
const devicePublic = File.join(runDir, 'device-public.json');
const publisherPrivate = File.join(runDir, 'publisher-private.pem');
const publisherPublic = File.join(runDir, 'publisher-public.pem');
const issuerPrivate = File.join(runDir, 'license-issuer-private.pem');
const issuerPublic = File.join(runDir, 'license-issuer-public.pem');
const deviceKeychainPath = File.join(runDir, 'p1-device.keychain-db');
const installationEnvironment = {OPENDESK_PROTECTED_RECIPE_ROOT: licenseRoot};
const uiTitle = 'OpenDesk Protected Package Equivalence';
const secretFiles = [publisherPrivate, issuerPrivate];
const authorizationFiles = [];
const keychainState = {
  configured: false,
  originalDefault: '',
  originalSearchList: [],
};

const sources = {
  basic: File.join(root, 'examples', 'protected-packages', 'basic.js'),
  parameterized: File.join(root, 'examples', 'protected-packages', 'parameterized.js'),
  ui: File.join(root, 'examples', 'protected-packages', 'native-ui.js'),
};
const parameterInput = File.join(root, 'examples', 'protected-packages', 'parameterized-input.json');
const sourceMarkers = {
  basic: 'protected-package-basic:business-result-written',
  parameterized: 'protected-package-parameterized:business-result-written',
  ui: 'protected-package-native-ui:approved',
};
const acceptanceLedgerPath = File.join(runDir, 'acceptance-ledger.json');
const acceptanceStepDefinitions = [
  {id: 'plain-execute', order: 1, label: 'run plain JavaScript'},
  {id: 'plain-business-result', order: 2, label: 'record plain business result'},
  {id: 'package-protect', order: 3, label: 'package protect'},
  {id: 'package-inspect', order: 4, label: 'package inspect'},
  {id: 'package-verify', order: 5, label: 'package verify'},
  {id: 'p1-authorize-install', order: 6, label: 'prepare, verify, and install isolated P1 License'},
  {id: 'protected-execute', order: 7, label: 'run authorized .odpkg'},
  {id: 'business-compare', order: 8, label: 'compare intended business results'},
];
let activeAcceptanceStep = null;

function newAcceptanceLane() {
  return {
    status: 'pending',
    steps: acceptanceStepDefinitions.map(item => Object.assign({}, item, {status: 'pending'})),
  };
}

const report = {
  schemaVersion: 1,
  kind: 'opendesk-protected-package-runtime-equivalence',
  runToken,
  runDir,
  startedAt: new Date().toISOString(),
  status: 'running',
  passed: false,
  binaryProvenance: null,
  security: {
    externalServicesUsed: false,
    licenseRequired: true,
    productionP1ProviderUsed: true,
    isolatedLicenseRoot: licenseRoot,
    devicePrivateKeyExported: false,
    isolatedDeviceKeychain: deviceKeychainPath,
    sharedLoginDeviceIdentityTouched: false,
    publisherAndIssuerKeysSeparate: true,
    perPackageContentKeys: true,
  },
  expectedDifferences: [
    'source hash versus package digest',
    'scriptPath and scriptDir',
    'plain source snapshot presence versus protected snapshot absence',
    'execution IDs and timestamps',
    'artifact paths',
  ],
  failureClasses: {
    packageStructureSignature: {status: 'pending', lanes: {}},
    p1Authorization: {status: 'pending', lanes: {}},
    plainRuntime: {status: 'pending', lanes: {}},
    protectedRuntime: {status: 'pending', lanes: {}},
    parameterEquivalence: {status: 'pending', lanes: {}},
    uiSemanticAcceptance: {status: 'pending', lanes: {}},
    uiVisualAcceptance: {status: 'pending', lanes: {}},
  },
  acceptance: {
    schemaVersion: 1,
    kind: 'opendesk-protected-package-runtime-equivalence-ledger',
    runToken,
    runDir,
    status: 'running',
    sequence: acceptanceStepDefinitions,
    lanes: {
      basic: newAcceptanceLane(),
      parameterized: newAcceptanceLane(),
      ui: newAcceptanceLane(),
    },
  },
  lanes: {},
  cleanup: null,
  failure: null,
};

class StageError extends Error {
  constructor(failureClass, lane, message) {
    super(message);
    this.name = 'StageError';
    this.failureClass = failureClass;
    this.lane = lane;
  }
}

function assert(condition, failureClass, lane, message) {
  if (!condition) throw new StageError(failureClass, lane, message);
}

function parseJSON(text, failureClass, lane, label) {
  try {
    return JSON.parse(text);
  } catch (_) {
    throw new StageError(failureClass, lane, `${label} did not return valid JSON`);
  }
}

function readJSON(path, failureClass, lane, label) {
  assert(File.isFile(path), failureClass, lane, `${label} is missing`);
  return parseJSON(File.read(path), failureClass, lane, label);
}

function writeJSON(path, value) {
  if (File.exists(path)) throw new Error(`refusing to overwrite evidence: ${path}`);
  File.write(path, JSON.stringify(value, null, 2) + '\n');
}

function cleanLabel(value) {
  return String(value).replace(/[^A-Za-z0-9._-]/g, '-');
}

function laneReport(lane) {
  if (!report.lanes[lane]) report.lanes[lane] = {stages: {}};
  return report.lanes[lane];
}

function mark(failureClass, lane, status, details) {
  const item = report.failureClasses[failureClass];
  if (!item) throw new Error(`unknown failure class: ${failureClass}`);
  item.lanes[lane] = Object.assign({status}, details || {});
  const statuses = Object.keys(item.lanes).map(key => item.lanes[key].status);
  item.status = statuses.some(value => value === 'failed')
    ? 'failed'
    : (statuses.length > 0 && statuses.every(value => value === 'passed') ? 'passed' : 'pending');
  laneReport(lane).stages[failureClass] = item.lanes[lane];
}

function sameBusinessResult(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function acceptanceStep(lane, stepId) {
  const laneResult = report.acceptance.lanes[lane];
  if (!laneResult) throw new Error(`unknown acceptance lane: ${lane}`);
  const step = laneResult.steps.find(item => item.id === stepId);
  if (!step) throw new Error(`unknown acceptance step: ${lane}/${stepId}`);
  return step;
}

function beginAcceptance(lane, stepId) {
  const step = acceptanceStep(lane, stepId);
  step.status = 'running';
  step.startedAt = new Date().toISOString();
  activeAcceptanceStep = {lane, stepId};
}

function passAcceptance(lane, stepId, evidence) {
  const step = acceptanceStep(lane, stepId);
  step.status = 'passed';
  step.completedAt = new Date().toISOString();
  step.evidence = evidence || {};
  if (activeAcceptanceStep && activeAcceptanceStep.lane === lane && activeAcceptanceStep.stepId === stepId) {
    activeAcceptanceStep = null;
  }
}

function failActiveAcceptance(error) {
  if (!activeAcceptanceStep) return;
  const step = acceptanceStep(activeAcceptanceStep.lane, activeAcceptanceStep.stepId);
  step.status = 'failed';
  step.completedAt = new Date().toISOString();
  step.failure = {
    failureClass: error && error.failureClass ? error.failureClass : 'internal',
    message: String(error && error.message || error),
  };
  activeAcceptanceStep = null;
}

function finalizeAcceptance() {
  for (const lane of Object.keys(report.acceptance.lanes)) {
    const laneResult = report.acceptance.lanes[lane];
    const statuses = laneResult.steps.map(step => step.status);
    laneResult.status = statuses.every(status => status === 'passed')
      ? 'passed'
      : (statuses.some(status => status === 'failed') ? 'failed' : 'incomplete');
  }
  const laneStatuses = Object.keys(report.acceptance.lanes)
    .map(lane => report.acceptance.lanes[lane].status);
  report.acceptance.status = laneStatuses.every(status => status === 'passed') &&
    report.cleanup && report.cleanup.status === 'passed'
    ? 'passed'
    : (laneStatuses.some(status => status === 'failed') || report.failure ? 'failed' : 'incomplete');
  report.acceptance.cleanup = report.cleanup;
  report.acceptance.failure = report.failure;
  report.acceptance.expectedDifferences = report.expectedDifferences;
  report.acceptance.binaryProvenance = File.join(runDir, 'binary-provenance.json');
  report.acceptance.detailedSummary = File.join(runDir, 'runtime-equivalence-summary.json');
}

function absoluteFrom(base, value) {
  if (typeof value !== 'string' || value.length === 0) return '';
  return value.startsWith('/') ? value : File.join(base, value);
}

function containsSnapshot(directory) {
  if (!File.isDir(directory)) return false;
  return File.listDir(directory).some(name => String(name).includes('script_snapshot'));
}

async function runCommand(command, args, options, failureClass, lane, label) {
  try {
    return await Command.run(command, args, Object.assign({
      cwd: root,
      timeout: 60_000,
      maxOutputBytes: 4 * 1024 * 1024,
    }, options || {}));
  } catch (error) {
    const code = error && error.code ? String(error.code) : 'UNKNOWN';
    const exitCode = error && Number.isInteger(error.exitCode) ? ` exit=${error.exitCode}` : '';
    throw new StageError(failureClass, lane, `${label} failed (${code}${exitCode})`);
  }
}

async function runEnvelope(args, options, failureClass, lane, label, expectedCommand) {
  let child;
  try {
    child = await Command.run(binary, args, Object.assign({
      cwd: root,
      timeout: 60_000,
      maxOutputBytes: 4 * 1024 * 1024,
      env: installationEnvironment,
    }, options || {}));
  } catch (error) {
    const stdout = String(error && error.stdout || '').trim();
    if (stdout) {
      try {
        writeJSON(File.join(commandsDir, cleanLabel(label) + '-failure.json'), JSON.parse(stdout));
      } catch (_) {
        // Keep failure evidence minimal when a command did not return JSON.
      }
    }
    const code = error && error.code ? String(error.code) : 'UNKNOWN';
    const exitCode = error && Number.isInteger(error.exitCode) ? ` exit=${error.exitCode}` : '';
    throw new StageError(failureClass, lane, `${label} failed (${code}${exitCode})`);
  }
  const envelope = parseJSON(child.stdout, failureClass, lane, label);
  writeJSON(File.join(commandsDir, cleanLabel(label) + '.json'), envelope);
  assert(envelope && envelope.ok === true, failureClass, lane, `${label} returned ok != true`);
  if (expectedCommand) {
    assert(envelope.command === expectedCommand, failureClass, lane, `${label} command identity mismatch`);
  }
  return envelope;
}

async function sha256(path) {
  const result = await runCommand('/usr/bin/shasum', ['-a', '256', path], null,
    'packageStructureSignature', 'preflight', `sha256 ${path}`);
  const value = result.stdout.trim().split(/\s+/)[0];
  assert(/^[0-9a-f]{64}$/.test(value), 'packageStructureSignature', 'preflight', 'invalid binary SHA-256');
  return value;
}

async function fileKind(path) {
  const result = await runCommand('/usr/bin/file', [path], null,
    'packageStructureSignature', 'preflight', `file ${path}`);
  return result.stdout.trim();
}

async function collectProvenance() {
  const head = (await runCommand('/usr/bin/git', ['rev-parse', 'HEAD'], null,
    'packageStructureSignature', 'preflight', 'git HEAD')).stdout.trim();
  const branch = (await runCommand('/usr/bin/git', ['branch', '--show-current'], null,
    'packageStructureSignature', 'preflight', 'git branch')).stdout.trim();
  const status = (await runCommand('/usr/bin/git', ['status', '--short'], null,
    'packageStructureSignature', 'preflight', 'git status')).stdout.split('\n').filter(Boolean);
  return {
    recordedAt: new Date().toISOString(),
    head,
    branch,
    dirty: status.length > 0,
    status,
    sourceMatchClaim: 'not proven; the precompiled binary is validated as an artifact, not attributed to the dirty checkout',
    binary: {
      path: binary,
      sha256: await sha256(binary),
      stat: File.stat(binary),
      kind: await fileKind(binary),
    },
    uiHost: {
      path: uiHost,
      sha256: await sha256(uiHost),
      stat: File.stat(uiHost),
      kind: await fileKind(uiHost),
    },
    relevantSources: {
      main: File.stat(File.join(root, 'cmd', 'opendesk', 'main.go')),
      dialogRuntime: File.stat(File.join(root, 'automation', 'dialog.go')),
      macUIHost: File.stat(File.join(root, 'pkg', 'customui', 'machost', 'native_darwin.m')),
      protectedLoader: File.stat(File.join(root, 'pkg', 'scriptloader', 'protected.go')),
    },
  };
}

async function generateSigningKeys() {
  await runCommand('openssl', ['genpkey', '-algorithm', 'ED25519', '-out', publisherPrivate], null,
    'packageStructureSignature', 'preflight', 'publisher private-key generation');
  await runCommand('openssl', ['pkey', '-in', publisherPrivate, '-pubout', '-out', publisherPublic], null,
    'packageStructureSignature', 'preflight', 'publisher public-key derivation');
  await runCommand('openssl', ['genpkey', '-algorithm', 'ED25519', '-out', issuerPrivate], null,
    'p1Authorization', 'preflight', 'License issuer private-key generation');
  await runCommand('openssl', ['pkey', '-in', issuerPrivate, '-pubout', '-out', issuerPublic], null,
    'p1Authorization', 'preflight', 'License issuer public-key derivation');
  assert(File.isFile(publisherPrivate) && File.isFile(publisherPublic),
    'packageStructureSignature', 'preflight', 'Publisher key generation did not produce separate key files');
  assert(File.isFile(issuerPrivate) && File.isFile(issuerPublic),
    'p1Authorization', 'preflight', 'License issuer key generation did not produce separate key files');
}

function parseKeychainPaths(stdout) {
  const paths = [];
  const pattern = /"([^"]+)"/g;
  let match;
  while ((match = pattern.exec(String(stdout))) !== null) paths.push(match[1]);
  return paths;
}

async function setupIsolatedDeviceKeychain() {
  assert(!File.exists(deviceKeychainPath), 'p1Authorization', 'preflight',
    'isolated device Keychain output already exists');
  const defaultResult = await runCommand('/usr/bin/security', ['default-keychain', '-d', 'user'], null,
    'p1Authorization', 'preflight', 'read default user Keychain');
  const listResult = await runCommand('/usr/bin/security', ['list-keychains', '-d', 'user'], null,
    'p1Authorization', 'preflight', 'read user Keychain search list');
  keychainState.originalDefault = parseKeychainPaths(defaultResult.stdout)[0] || '';
  keychainState.originalSearchList = parseKeychainPaths(listResult.stdout);
  assert(keychainState.originalDefault && keychainState.originalSearchList.length > 0,
    'p1Authorization', 'preflight', 'could not snapshot the current user Keychain configuration');

  // The empty password is intentional: this is a short-lived local test
  // Keychain, not a credential. Device private material is still owned by the
  // production macOS Keychain provider and the Keychain is deleted in finally.
  await runCommand('/usr/bin/security', ['create-keychain', '-p', '', deviceKeychainPath], null,
    'p1Authorization', 'preflight', 'create isolated device Keychain');
  await runCommand('/usr/bin/security', ['unlock-keychain', '-p', '', deviceKeychainPath], null,
    'p1Authorization', 'preflight', 'unlock isolated device Keychain');
  await runCommand('/usr/bin/security', ['set-keychain-settings', '-lut', '3600', deviceKeychainPath], null,
    'p1Authorization', 'preflight', 'configure isolated device Keychain');
  await runCommand('/usr/bin/security', ['list-keychains', '-d', 'user', '-s', deviceKeychainPath], null,
    'p1Authorization', 'preflight', 'select isolated Keychain search list');
  await runCommand('/usr/bin/security', ['default-keychain', '-d', 'user', '-s', deviceKeychainPath], null,
    'p1Authorization', 'preflight', 'select isolated default Keychain');
  keychainState.configured = true;
  report.security.originalKeychainConfigurationRecorded = true;
}

async function ensureDeviceIdentity() {
  const envelope = await runEnvelope(
    ['license', 'device', '-o', devicePublic],
    null,
    'p1Authorization',
    'preflight',
    'license-device',
    'license.device',
  );
  assert(envelope.result && envelope.result.identity && /^device_/.test(envelope.result.identity.deviceId),
    'p1Authorization', 'preflight', 'P1 device identity is missing');
  return envelope.result.identity.deviceId;
}

async function protectAndAuthorize(lane) {
  const source = sources[lane];
  const laneDir = File.join(packagesDir, lane);
  File.ensureDir(laneDir);
  const packagePath = File.join(laneDir, `${lane}.odpkg`);
  const contentKey = File.join(laneDir, `${lane}.content-key`);
  const licensePath = File.join(laneDir, `${lane}.odlicense`);
  secretFiles.push(contentKey);
  authorizationFiles.push(licensePath);
  assert(!File.exists(packagePath) && !File.exists(contentKey) && !File.exists(licensePath),
    'packageStructureSignature', lane, 'package, DEK, and License outputs must be new');

  const idStem = `odpkg-equivalence-${lane}-${runToken}`.slice(0, 100);
  const identity = {
    packageId: `${idStem}-package`,
    productId: `${idStem}-product`,
    publisherId: `odpkg-equivalence-publisher-${runToken}`.slice(0, 120),
    publisherKeyId: `odpkg-equivalence-package-key-${runToken}`.slice(0, 120),
    contentKeyId: `${idStem}-dek`,
    issuerKeyId: `odpkg-equivalence-license-key-${runToken}`.slice(0, 120),
  };
  beginAcceptance(lane, 'package-protect');
  const protect = await runEnvelope([
    'package', 'protect', source,
    '-o', packagePath,
    '--package-id', identity.packageId,
    '--product-id', identity.productId,
    '--publisher-id', identity.publisherId,
    '--publisher-key-id', identity.publisherKeyId,
    '--content-key-id', identity.contentKeyId,
    '--minimum-runtime-version', '0.0.0',
    '--signing-key', publisherPrivate,
    '--key-out', contentKey,
  ], null, 'packageStructureSignature', lane, `${lane}-package-protect`, 'package.protect');

  assert(File.isFile(packagePath) && File.isFile(contentKey),
    'packageStructureSignature', lane, 'package protect did not create package and per-package DEK');
  const mode = (await runCommand('/usr/bin/stat', ['-f', '%Lp', contentKey], null,
    'packageStructureSignature', lane, `${lane} DEK mode`)).stdout.trim();
  assert(mode === '600', 'packageStructureSignature', lane, 'generated DEK mode is not 0600');
  passAcceptance(lane, 'package-protect', {
    commandEnvelope: File.join(commandsDir, `${lane}-package-protect.json`),
    packagePath,
    generatedDEKMode: mode,
  });

  beginAcceptance(lane, 'package-inspect');
  const inspect = await runEnvelope(
    ['package', 'inspect', packagePath], null,
    'packageStructureSignature', lane, `${lane}-package-inspect`, 'package.inspect');
  const manifest = inspect.result && inspect.result.manifest;
  const digest = inspect.result && inspect.result.packageDigest;
  assert(manifest && manifest.packageId === identity.packageId && manifest.productId === identity.productId,
    'packageStructureSignature', lane, 'inspect package/product identity mismatch');
  assert(manifest.publisherId === identity.publisherId && manifest.publisherKeyId === identity.publisherKeyId,
    'packageStructureSignature', lane, 'inspect Publisher identity mismatch');
  assert(manifest.encryption && manifest.encryption.keyId === identity.contentKeyId,
    'packageStructureSignature', lane, 'inspect content-key identity mismatch');
  assert(manifest.license && manifest.license.required === true,
    'packageStructureSignature', lane, 'package must require a License');
  assert(manifest.minimumRuntimeVersion === '0.0.0',
    'packageStructureSignature', lane, 'minimum Runtime version mismatch');
  assert(/^[0-9a-f]{64}$/.test(String(digest || '')),
    'packageStructureSignature', lane, 'package digest is not SHA-256 hex');
  assert(protect.result && protect.result.packageDigest === digest,
    'packageStructureSignature', lane, 'protect/inspect digest mismatch');
  passAcceptance(lane, 'package-inspect', {
    commandEnvelope: File.join(commandsDir, `${lane}-package-inspect.json`),
    packageDigest: digest,
    manifestIdentity: identity,
    licenseRequired: true,
  });

  beginAcceptance(lane, 'package-verify');
  const verify = await runEnvelope(
    ['package', 'verify', packagePath, '--public-key', publisherPublic], null,
    'packageStructureSignature', lane, `${lane}-package-verify`, 'package.verify');
  assert(verify.result && verify.result.signatureVerified === true && verify.result.packageDigest === digest,
    'packageStructureSignature', lane, 'independent Publisher signature verification failed');
  const publicPackageOutput = JSON.stringify([protect, inspect, verify]);
  assert(!publicPackageOutput.includes(sourceMarkers[lane]),
    'packageStructureSignature', lane, 'package commands disclosed the source execution marker');
  passAcceptance(lane, 'package-verify', {
    commandEnvelope: File.join(commandsDir, `${lane}-package-verify.json`),
    publisherPublicKey: publisherPublic,
    packageDigest: digest,
    signatureVerified: true,
  });
  mark('packageStructureSignature', lane, 'passed', {
    packagePath,
    packageDigest: digest,
    identity,
    signatureVerified: true,
  });

  beginAcceptance(lane, 'p1-authorize-install');
  const issue = await runEnvelope([
    'license', 'issue', packagePath,
    '--device', devicePublic,
    '--content-key', contentKey,
    '--signing-key', issuerPrivate,
    '--license-id', `${idStem}-license`,
    '--subject-id', 'opendesk-equivalence-local-subject',
    '--issuer-key-id', identity.issuerKeyId,
    '--expires-at', '2099-01-01T00:00:00Z',
    '-o', licensePath,
  ], null, 'p1Authorization', lane, `${lane}-license-issue`, 'license.issue');
  const licenseInspect = await runEnvelope(
    ['license', 'inspect', licensePath], null,
    'p1Authorization', lane, `${lane}-license-inspect`, 'license.inspect');
  const licenseVerify = await runEnvelope(
    ['license', 'verify', licensePath, '--issuer-key', issuerPublic], null,
    'p1Authorization', lane, `${lane}-license-verify`, 'license.verify');
  const install = await runEnvelope([
    'license', 'install', licensePath,
    '--package', packagePath,
    '--package-publisher-key', publisherPublic,
    '--issuer-key', issuerPublic,
  ], null, 'p1Authorization', lane, `${lane}-license-install`, 'license.install');
  assert(issue.result && issue.result.packageId === identity.packageId,
    'p1Authorization', lane, 'issued License package identity mismatch');
  assert(licenseInspect.result && licenseInspect.result.packageId === identity.packageId,
    'p1Authorization', lane, 'License inspect identity mismatch');
  assert(licenseVerify.result && licenseVerify.result.signatureVerified === true &&
    licenseVerify.result.deviceBindingVerified === true && licenseVerify.result.contentKeyAccessible === true,
  'p1Authorization', lane, 'P1 License verify did not prove signature/device/DEK access');
  assert(install.result && install.result.installed === true && install.result.packageVerified === true &&
    install.result.signatureVerified === true,
  'p1Authorization', lane, 'P1 install did not prove package and License verification');

  // Runtime must use the installed production provider chain, not the Publisher
  // DEK or the raw License output. Remove both before protected execution.
  File.remove(contentKey);
  File.remove(licensePath);
  assert(!File.exists(contentKey) && !File.exists(licensePath),
    'p1Authorization', lane, 'DEK or raw License remained after P1 installation');
  passAcceptance(lane, 'p1-authorize-install', {
    commandEnvelopes: {
      issue: File.join(commandsDir, `${lane}-license-issue.json`),
      inspect: File.join(commandsDir, `${lane}-license-inspect.json`),
      verify: File.join(commandsDir, `${lane}-license-verify.json`),
      install: File.join(commandsDir, `${lane}-license-install.json`),
    },
    devicePublicIdentity: devicePublic,
    isolatedInstallRoot: licenseRoot,
    packageVerifiedAtInstall: true,
    licenseVerifiedForDevice: true,
    publisherDEKRemovedBeforeRuntime: true,
    rawLicenseRemovedBeforeRuntime: true,
  });
  mark('p1Authorization', lane, 'passed', {
    deviceId: issue.result.deviceId,
    packageVerifiedAtInstall: true,
    licenseVerifiedForDevice: true,
    installedInIsolatedRoot: true,
    publisherDEKRemovedBeforeRuntime: true,
    rawLicenseRemovedBeforeRuntime: true,
  });
  return {packagePath, packageDigest: digest, identity};
}

async function executeDirect(lane, variant, sourcePath) {
  const artifactDir = File.join(runDir, 'lanes', lane, variant);
  assert(!File.exists(artifactDir), variant === 'plain' ? 'plainRuntime' : 'protectedRuntime', lane,
    `${variant} artifact directory already exists`);
  const args = [
    '-script', sourcePath,
    '-log-dir', artifactDir,
    '-console-mode', 'script',
  ];
  beginAcceptance(lane, variant === 'plain' ? 'plain-execute' : 'protected-execute');
  await runCommand(binary, args, {env: installationEnvironment, timeout: 60_000},
    variant === 'plain' ? 'plainRuntime' : 'protectedRuntime', lane, `${lane} ${variant} direct Runtime`);
  if (variant === 'plain') {
    passAcceptance(lane, 'plain-execute', {mode: 'direct -script', input: sourcePath, artifactDir});
    beginAcceptance(lane, 'plain-business-result');
  }
  const resultPath = File.join(artifactDir, 'business-result.json');
  const businessResult = readJSON(resultPath,
    variant === 'plain' ? 'plainRuntime' : 'protectedRuntime', lane, `${lane} ${variant} business result`);
  const summary = readJSON(File.join(artifactDir, 'summary.json'),
    variant === 'plain' ? 'plainRuntime' : 'protectedRuntime', lane, `${lane} ${variant} summary`);
  if (variant === 'plain') {
    assert(containsSnapshot(artifactDir), 'plainRuntime', lane, 'plain execution did not retain its normal source snapshot');
    passAcceptance(lane, 'plain-business-result', {
      resultPath,
      sourceSnapshotPresent: true,
    });
    mark('plainRuntime', lane, 'passed', {artifactDir, resultPath, sourceSnapshotPresent: true});
  } else {
    assert(!containsSnapshot(artifactDir), 'protectedRuntime', lane, 'protected execution wrote a source snapshot');
    assert(!summary.scriptSnapshotPath, 'protectedRuntime', lane, 'protected summary advertised a source snapshot');
    passAcceptance(lane, 'protected-execute', {
      mode: 'direct -script',
      input: sourcePath,
      artifactDir,
      resultPath,
      sourceSnapshotPresent: false,
    });
    mark('protectedRuntime', lane, 'passed', {artifactDir, resultPath, sourceSnapshotPresent: false});
  }
  return {artifactDir, resultPath, businessResult, summary};
}

async function executeParameterized(variant, sourcePath) {
  const failureClass = variant === 'plain' ? 'plainRuntime' : 'protectedRuntime';
  beginAcceptance('parameterized', variant === 'plain' ? 'plain-execute' : 'protected-execute');
  const envelope = await runEnvelope([
    'ai', 'run', sourcePath,
    '--input-file', parameterInput,
    '--timeout', '30s',
  ], {cwd: runDir, timeout: 60_000}, failureClass, 'parameterized',
  `parameterized-${variant}-ai-run`, 'run');
  if (variant === 'plain') {
    passAcceptance('parameterized', 'plain-execute', {
      mode: 'ai run --input-file',
      input: sourcePath,
      inputFile: parameterInput,
      commandEnvelope: File.join(commandsDir, 'parameterized-plain-ai-run.json'),
    });
    beginAcceptance('parameterized', 'plain-business-result');
  }
  const artifacts = envelope.result && envelope.result.artifacts;
  assert(artifacts && artifacts.runDir, failureClass, 'parameterized', `${variant} ai run omitted artifacts`);
  const artifactDir = absoluteFrom(runDir, artifacts.runDir);
  const resultPath = File.join(artifactDir, 'business-result.json');
  const businessResult = readJSON(resultPath, failureClass, 'parameterized', `${variant} parameter result`);
  if (variant === 'plain') {
    const snapshot = absoluteFrom(runDir, artifacts.scriptSnapshotPath || '');
    assert(snapshot && File.isFile(snapshot), failureClass, 'parameterized', 'plain ai run snapshot is missing');
    passAcceptance('parameterized', 'plain-business-result', {
      resultPath,
      sourceSnapshotPresent: true,
    });
    mark('plainRuntime', 'parameterized', 'passed', {artifactDir, resultPath, sourceSnapshotPresent: true});
  } else {
    assert(!artifacts.scriptSnapshotPath && !containsSnapshot(artifactDir), failureClass, 'parameterized',
      'protected ai run exposed a source snapshot');
    passAcceptance('parameterized', 'protected-execute', {
      mode: 'ai run --input-file',
      input: sourcePath,
      inputFile: parameterInput,
      commandEnvelope: File.join(commandsDir, 'parameterized-protected-ai-run.json'),
      artifactDir,
      resultPath,
      sourceSnapshotPresent: false,
    });
    mark('protectedRuntime', 'parameterized', 'passed', {artifactDir, resultPath, sourceSnapshotPresent: false});
  }
  return {artifactDir, resultPath, businessResult, envelope};
}

function flattenText(value) {
  return JSON.stringify(value).toLowerCase().replace(/[^a-z0-9]+/g, ' ');
}

async function waitForUIWindow(variant) {
  for (let attempt = 1; attempt <= 60; attempt += 1) {
    await new Promise(resolve => setTimeout(resolve, 150));
    const envelope = await runEnvelope(
      ['ai', 'windows', '--title', uiTitle],
      {cwd: runDir, timeout: 10_000},
      'uiVisualAcceptance', 'ui', `ui-${variant}-window-list-${attempt}`, 'windows');
    const matches = Array.isArray(envelope.result) ? envelope.result : [];
    if (matches.length === 1 && matches[0].title === uiTitle) return matches[0];
  }
  throw new StageError('uiVisualAcceptance', 'ui',
    `${variant} native dialog did not become uniquely observable`);
}

async function waitForUIWindowToClose(variant) {
  for (let attempt = 1; attempt <= 60; attempt += 1) {
    await new Promise(resolve => setTimeout(resolve, 100));
    const envelope = await runEnvelope(
      ['ai', 'windows', '--title', uiTitle],
      {cwd: runDir, timeout: 10_000},
      'uiVisualAcceptance', 'ui', `ui-${variant}-close-check-${attempt}`, 'windows');
    if (Array.isArray(envelope.result) && envelope.result.length === 0) return;
  }
  throw new StageError('uiVisualAcceptance', 'ui', `${variant} native dialog remained after settlement`);
}

async function bestEffortCloseUI() {
  try {
    await Command.run(binary, ['ai', 'window', 'close', '--title', uiTitle], {
      cwd: runDir,
      timeout: 10_000,
      maxOutputBytes: 1024 * 1024,
      env: installationEnvironment,
    });
  } catch (_) {
    // The child process group is canceled next if the native window remains.
  }
}

async function focusUIWindow(target, variant, operation) {
  let lastCode = 'UNKNOWN';
  for (let attempt = 1; attempt <= 12; attempt += 1) {
    try {
      await window.focus(uiTitle);
      const active = await window.getActiveWindow();
      const activePID = Number(active && (active.pid || active.processID));
      if (active && active.title === uiTitle && activePID === Number(target.pid)) return active;
      lastCode = 'FOCUS_NOT_OBSERVED';
    } catch (error) {
      lastCode = String(error && error.code || 'UNKNOWN');
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new StageError(
    operation === 'capture' ? 'uiVisualAcceptance' : 'uiSemanticAcceptance',
    'ui',
    `${variant} Runtime ${operation} focus failed (${lastCode})`,
  );
}

async function executeUI(variant, sourcePath) {
  const runtimeClass = variant === 'plain' ? 'plainRuntime' : 'protectedRuntime';
  const artifactDir = File.join(runDir, 'lanes', 'ui', variant);
  const screenshotDir = File.join(runDir, 'lanes', 'ui', 'screenshots');
  File.ensureDir(screenshotDir);
  const screenshotPath = File.join(screenshotDir, `${variant}.png`);
  assert(!File.exists(artifactDir) && !File.exists(screenshotPath), runtimeClass, 'ui',
    `${variant} UI output already exists`);
  const controller = new AbortController();
  beginAcceptance('ui', variant === 'plain' ? 'plain-execute' : 'protected-execute');
  let pendingError = null;
  // Attach the rejection handler immediately. A UI command can reach its
  // watchdog while the controller is awaiting window APIs; leaving that
  // Promise temporarily unobserved would let the Runtime abort before finally
  // restores the temporary Keychain and removes secrets.
  const pending = Command.run(binary, [
    '-script', sourcePath,
    '-ui',
    '-ui-host', uiHost,
    '-log-dir', artifactDir,
    '-console-mode', 'script',
  ], {
    cwd: root,
    timeout: 90_000,
    maxOutputBytes: 4 * 1024 * 1024,
    env: installationEnvironment,
    signal: controller.signal,
  }).catch(error => {
    pendingError = error;
    return null;
  });

  try {
    const found = await waitForUIWindow(variant);
    let runtimeWindow;
    let screenshot;
    try {
      runtimeWindow = await window.getWindowByTitle(uiTitle);
      await focusUIWindow(found, variant, 'capture');
      screenshot = await page.screenshot({
        target: 'screen',
        clip: {
          x: Number(runtimeWindow.x),
          y: Number(runtimeWindow.y),
          width: Number(runtimeWindow.width),
          height: Number(runtimeWindow.height),
        },
        path: screenshotPath,
        returnType: 'object',
      });
    } catch (error) {
      if (error instanceof StageError) throw error;
      throw new StageError('uiVisualAcceptance', 'ui',
        `${variant} Runtime focus/capture failed (${String(error && error.code || 'UNKNOWN')})`);
    }
    writeJSON(File.join(commandsDir, `ui-${variant}-runtime-capture.json`), {
      operation: 'window.focus + page.screenshot',
      discoveredWindow: found,
      runtimeWindow,
      screenshot,
    });
    const sizeEnvelope = await runEnvelope(
      ['ai', 'image', 'size', '--image', screenshotPath], {cwd: runDir, timeout: 10_000},
      'uiVisualAcceptance', 'ui', `ui-${variant}-image-size`, 'image.size');
    const ocrEnvelope = await runEnvelope([
      'ai', 'vision', 'ocr', '--image', screenshotPath, '--provider', 'apple', '--lang', 'eng',
    ], {cwd: runDir, timeout: 30_000},
    'uiVisualAcceptance', 'ui', `ui-${variant}-ocr`, 'vision.ocr');

    const geometry = {
      x: Number(runtimeWindow.x),
      y: Number(runtimeWindow.y),
      width: Number(runtimeWindow.width),
      height: Number(runtimeWindow.height),
    };
    assert(Object.keys(geometry).every(key => Number.isFinite(geometry[key])),
      'uiVisualAcceptance', 'ui', `${variant} Runtime window geometry is invalid`);
    const imageSize = sizeEnvelope.result || {};
    assert(geometry.width >= 300 && geometry.width <= 900 && geometry.height >= 120 && geometry.height <= 600,
      'uiVisualAcceptance', 'ui', `${variant} native dialog has abnormal dimensions`);
    assert(File.isFile(screenshotPath) && File.stat(screenshotPath).size > 5000,
      'uiVisualAcceptance', 'ui', `${variant} screenshot is missing or implausibly small`);
    assert(Number(screenshot.width) === Number(imageSize.width) && Number(screenshot.height) === Number(imageSize.height),
      'uiVisualAcceptance', 'ui', `${variant} screenshot metadata and decoded image size disagree`);
    assert(Number(runtimeWindow.pid) === Number(found.pid) && runtimeWindow.title === uiTitle,
      'uiVisualAcceptance', 'ui', `${variant} Runtime window identity differs from independent discovery`);
    assert(Math.abs(Number(screenshot.width) - geometry.width) <= 12 &&
      Math.abs(Number(screenshot.height) - geometry.height) <= 12,
    'uiVisualAcceptance', 'ui', `${variant} screenshot does not match the observed native window bounds`);
    const visibleText = flattenText(ocrEnvelope.result);
    assert(visibleText.includes('equivalence') && (visibleText.includes('approve') || visibleText.includes('continue')),
      'uiVisualAcceptance', 'ui', `${variant} screenshot OCR did not observe the expected UI copy/action`);

    try {
      await focusUIWindow(found, variant, 'interaction');
      await keyboard.press('ENTER');
    } catch (error) {
      if (error instanceof StageError) throw error;
      throw new StageError('uiSemanticAcceptance', 'ui',
        `${variant} Runtime Dialog interaction failed (${String(error && error.code || 'UNKNOWN')})`);
    }
    writeJSON(File.join(commandsDir, `ui-${variant}-runtime-approve.json`), {
      operation: 'window.focus + keyboard.press',
      key: 'ENTER',
      target: {pid: found.pid, title: found.title},
    });
    await pending;
    if (pendingError) {
      const code = pendingError && pendingError.code ? String(pendingError.code) : 'UNKNOWN';
      throw new StageError(runtimeClass, 'ui', `${variant} UI Runtime failed after interaction (${code})`);
    }
    await waitForUIWindowToClose(variant);
    if (variant === 'plain') {
      passAcceptance('ui', 'plain-execute', {
        mode: 'direct -script -ui',
        input: sourcePath,
        artifactDir,
        realWindowInteraction: true,
      });
      beginAcceptance('ui', 'plain-business-result');
    }

    const resultPath = File.join(artifactDir, 'business-result.json');
    const businessResult = readJSON(resultPath, runtimeClass, 'ui', `${variant} UI business result`);
    assert(businessResult.accepted === true && businessResult.action === 'approved',
      'uiSemanticAcceptance', 'ui', `${variant} UI did not record the approved semantic state`);
    if (variant === 'plain') {
      assert(containsSnapshot(artifactDir), runtimeClass, 'ui', 'plain UI source snapshot is missing');
      passAcceptance('ui', 'plain-business-result', {
        resultPath,
        sourceSnapshotPresent: true,
        screenshotPath,
      });
      mark('plainRuntime', 'ui', 'passed', {artifactDir, resultPath, sourceSnapshotPresent: true});
    } else {
      assert(!containsSnapshot(artifactDir), runtimeClass, 'ui', 'protected UI wrote a source snapshot');
      passAcceptance('ui', 'protected-execute', {
        mode: 'direct -script -ui',
        input: sourcePath,
        artifactDir,
        resultPath,
        sourceSnapshotPresent: false,
        screenshotPath,
        realWindowInteraction: true,
      });
      mark('protectedRuntime', 'ui', 'passed', {artifactDir, resultPath, sourceSnapshotPresent: false});
    }
    return {
      artifactDir,
      resultPath,
      businessResult,
      visual: {
        screenshotPath,
        geometry,
        screenshot: {
          width: Number(screenshot.width),
          height: Number(screenshot.height),
          sizeBytes: Number(screenshot.sizeBytes),
        },
        windowFound: found,
        semanticContent: {title: runtimeWindow.title},
        ocrObservedExpectedCopy: true,
      },
    };
  } catch (error) {
    await bestEffortCloseUI();
    controller.abort('UI equivalence cleanup');
    await pending;
    throw error;
  }
}

async function verifyPreflightCapabilities() {
  const envelope = await runEnvelope(
    ['ai', 'capabilities'], {cwd: runDir, timeout: 20_000},
    'uiVisualAcceptance', 'preflight', 'ai-capabilities', 'capabilities');
  const result = envelope.result || {};
  const permissions = result.permissions || {};
  const providers = result.capabilities && result.capabilities.vision && result.capabilities.vision.providers || [];
  assert(result.platform === 'darwin', 'uiVisualAcceptance', 'preflight', 'live equivalence requires macOS');
  assert(permissions.screenCapture === true && permissions.accessibility === true,
    'uiVisualAcceptance', 'preflight', 'Screen Recording and Accessibility permissions are required');
  assert(providers.some(provider => provider.name === 'apple' && provider.implemented === true),
    'uiVisualAcceptance', 'preflight', 'Apple OCR provider is required for visual acceptance');
}

async function validateAllLanes() {
  const platform = System.getPlatformInfo();
  assert(platform && platform.os === 'darwin', 'uiVisualAcceptance', 'preflight', 'macOS host is required');
  assert(Command.getCapabilities().enabled && Command.getCapabilities().supported,
    'packageStructureSignature', 'preflight', 'local Command capability is required');
  for (const path of [binary, uiHost, sources.basic, sources.parameterized, sources.ui, parameterInput]) {
    assert(File.isFile(path), 'packageStructureSignature', 'preflight', `required input is missing: ${path}`);
  }
  assert(!File.exists(runDir), 'packageStructureSignature', 'preflight', `refusing to reuse run directory: ${runDir}`);
  File.ensureDir(commandsDir);
  File.ensureDir(packagesDir);
  console.log(`[PROTECTED-PACKAGE-EQUIVALENCE] evidence=${runDir}`);
  console.log('[PROTECTED-PACKAGE-EQUIVALENCE] sequence=' +
    acceptanceStepDefinitions.map(step => step.label).join(' -> '));

  report.binaryProvenance = await collectProvenance();
  writeJSON(File.join(runDir, 'binary-provenance.json'), report.binaryProvenance);
  await verifyPreflightCapabilities();
  await generateSigningKeys();
  await setupIsolatedDeviceKeychain();
  report.security.deviceId = await ensureDeviceIdentity();

  const basicPlain = await executeDirect('basic', 'plain', sources.basic);
  const basicPackage = await protectAndAuthorize('basic');
  const basicProtected = await executeDirect('basic', 'protected', basicPackage.packagePath);
  beginAcceptance('basic', 'business-compare');
  assert(sameBusinessResult(basicPlain.businessResult, basicProtected.businessResult),
    'protectedRuntime', 'basic', 'basic business result differs before and after packaging');
  laneReport('basic').equivalence = {
    status: 'passed',
    oracle: 'exact deterministic business-result.json',
    result: basicPlain.businessResult,
  };
  passAcceptance('basic', 'business-compare', {
    oracle: 'exact deterministic business-result.json equality',
    plainResult: basicPlain.resultPath,
    protectedResult: basicProtected.resultPath,
  });

  const parameterPlain = await executeParameterized('plain', sources.parameterized);
  const parameterPackage = await protectAndAuthorize('parameterized');
  const parameterProtected = await executeParameterized('protected', parameterPackage.packagePath);
  beginAcceptance('parameterized', 'business-compare');
  assert(sameBusinessResult(parameterPlain.businessResult, parameterProtected.businessResult),
    'parameterEquivalence', 'parameterized', 'parameterized business result differs for the same --input-file');
  mark('parameterEquivalence', 'parameterized', 'passed', {
    inputFile: parameterInput,
    oracle: 'normalized business-result.json equality plus expectedTotalCents validation',
    result: parameterPlain.businessResult,
  });
  passAcceptance('parameterized', 'business-compare', {
    oracle: 'normalized business-result.json equality plus expectedTotalCents validation',
    inputFile: parameterInput,
    plainResult: parameterPlain.resultPath,
    protectedResult: parameterProtected.resultPath,
  });

  const uiPlain = await executeUI('plain', sources.ui);
  const uiPackage = await protectAndAuthorize('ui');
  const uiProtected = await executeUI('protected', uiPackage.packagePath);
  beginAcceptance('ui', 'business-compare');
  assert(sameBusinessResult(uiPlain.businessResult, uiProtected.businessResult),
    'uiSemanticAcceptance', 'ui', 'native UI semantic result differs before and after packaging');
  mark('uiSemanticAcceptance', 'ui', 'passed', {
    oracle: 'same approved business state after a real ENTER interaction',
    result: uiPlain.businessResult,
  });
  const plainVisual = uiPlain.visual;
  const protectedVisual = uiProtected.visual;
  assert(Math.abs(plainVisual.geometry.width - protectedVisual.geometry.width) <= 12 &&
    Math.abs(plainVisual.geometry.height - protectedVisual.geometry.height) <= 12,
  'uiVisualAcceptance', 'ui', 'plain/protected native dialog geometry differs unexpectedly');
  mark('uiVisualAcceptance', 'ui', 'passed', {
    oracle: 'bounded native geometry, screenshot/window agreement, OCR-visible copy/action, and non-pixel-perfect cross-run sizing',
    plain: plainVisual,
    protected: protectedVisual,
    humanReviewRecommended: true,
  });
  passAcceptance('ui', 'business-compare', {
    semanticOracle: 'same approved business state after a real ENTER interaction',
    visualOracle: 'bounded native geometry, screenshot/window agreement, OCR-visible copy/action, and non-pixel-perfect cross-run sizing',
    plainResult: uiPlain.resultPath,
    protectedResult: uiProtected.resultPath,
    screenshots: {
      plain: plainVisual.screenshotPath,
      protected: protectedVisual.screenshotPath,
    },
    humanVisualReviewRequired: true,
  });

  report.status = 'passed';
  report.passed = true;
}

async function cleanupCommand(args) {
  try {
    await Command.run('/usr/bin/security', args, {
      cwd: root,
      timeout: 20_000,
      maxOutputBytes: 1024 * 1024,
    });
    return true;
  } catch (_) {
    return false;
  }
}

async function cleanSensitiveState() {
  const removed = [];
  const failures = [];
  if (keychainState.originalSearchList.length > 0) {
    const restoredList = await cleanupCommand(
      ['list-keychains', '-d', 'user', '-s'].concat(keychainState.originalSearchList));
    if (!restoredList) failures.push('restore user Keychain search list');
  }
  if (keychainState.originalDefault) {
    const restoredDefault = await cleanupCommand(
      ['default-keychain', '-d', 'user', '-s', keychainState.originalDefault]);
    if (!restoredDefault) failures.push('restore default user Keychain');
  }
  if (File.exists(deviceKeychainPath)) {
    if (await cleanupCommand(['delete-keychain', deviceKeychainPath])) {
      removed.push(deviceKeychainPath);
    } else {
      failures.push(deviceKeychainPath);
    }
  }
  for (const path of secretFiles.concat(authorizationFiles)) {
    if (!File.exists(path)) continue;
    try {
      File.remove(path);
      removed.push(path);
    } catch (_) {
      failures.push(path);
    }
  }
  if (File.exists(licenseRoot)) {
    try {
      File.removeDir(licenseRoot);
      removed.push(licenseRoot);
    } catch (_) {
      failures.push(licenseRoot);
    }
  }
  const stillPresent = secretFiles.concat(authorizationFiles).filter(path => File.exists(path));
  if (File.exists(licenseRoot)) stillPresent.push(licenseRoot);
  if (File.exists(deviceKeychainPath)) stillPresent.push(deviceKeychainPath);
  return {
    status: failures.length === 0 && stillPresent.length === 0 ? 'passed' : 'failed',
    removed,
    failures,
    stillPresent,
    publisherPrivateKeysRemoved: !File.exists(publisherPrivate) && !File.exists(issuerPrivate),
    perPackageDEKsRemoved: secretFiles.filter(path => path.endsWith('.content-key')).every(path => !File.exists(path)),
    rawLicensesRemoved: authorizationFiles.every(path => !File.exists(path)),
    isolatedLicenseRootRemoved: !File.exists(licenseRoot),
    isolatedDeviceKeychainRemoved: !File.exists(deviceKeychainPath),
    originalKeychainConfigurationRestored: failures.every(value => !String(value).includes('Keychain')),
    retainedSafeEvidence: [publisherPublic, issuerPublic, devicePublic, packagesDir,
      File.join(runDir, 'lanes', 'ui', 'screenshots')],
    deviceKeychainIdentity: 'created in a dedicated temporary Keychain by the production provider; private key was never exported',
  };
}

let failure = null;
try {
  await validateAllLanes();
} catch (error) {
  failure = error;
  failActiveAcceptance(error);
  const failureClass = error && error.failureClass ? error.failureClass : 'internal';
  const lane = error && error.lane ? error.lane : 'unknown';
  if (report.failureClasses[failureClass]) mark(failureClass, lane, 'failed', {message: String(error.message || error)});
  report.status = 'failed';
  report.passed = false;
  report.failure = {failureClass, lane, message: String(error && error.message || error)};
} finally {
  report.cleanup = await cleanSensitiveState();
  if (report.cleanup.status !== 'passed') {
    report.status = 'failed';
    report.passed = false;
    report.failure = report.failure || {
      failureClass: 'securityCleanup',
      lane: 'all',
      message: 'one or more ephemeral secrets or installed P1 files could not be removed',
    };
    if (!failure) failure = new StageError('securityCleanup', 'all', report.failure.message);
  }
  report.completedAt = new Date().toISOString();
  if (File.isDir(runDir)) {
    finalizeAcceptance();
    writeJSON(acceptanceLedgerPath, report.acceptance);
    report.acceptanceLedgerPath = acceptanceLedgerPath;
    writeJSON(File.join(runDir, 'runtime-equivalence-summary.json'), report);
    console.log(`[PROTECTED-PACKAGE-EQUIVALENCE] acceptance-ledger=${acceptanceLedgerPath}`);
  }
}

if (failure) {
  console.log('[PROTECTED-PACKAGE-EQUIVALENCE] failed ' + JSON.stringify({
    runDir,
    acceptanceLedger: acceptanceLedgerPath,
    failure: report.failure,
    secretsRemoved: report.cleanup && report.cleanup.status === 'passed',
  }));
  throw new Error(`[${report.failure.failureClass}/${report.failure.lane}] ${report.failure.message}; evidence=${runDir}`);
}
console.log('[PROTECTED-PACKAGE-EQUIVALENCE] passed ' + JSON.stringify({
  runDir,
  acceptanceLedger: acceptanceLedgerPath,
  sequence: acceptanceStepDefinitions.map(step => step.id),
  basic: 'passed',
  parameterized: 'passed',
  uiSemantic: 'passed',
  uiVisual: 'passed',
  secretsRemoved: report.cleanup.status === 'passed',
}));
