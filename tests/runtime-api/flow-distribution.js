// Flow distribution behavior is the independent formal Runtime qualification
// gate. It exercises the product CLI and never imports the Go implementation
// directly. Run it from the repository root with the current dist/opendesk.
'use strict';

const runDir = File.path(String(Execution.env.OPENDESK_RUNTIME_API_RUN_DIR || '.runtime/tests/runtime-api/flow-direct'));
const binary = String(Execution.env.OPENDESK_RUNTIME_API_BINARY || '');
if (!binary) throw new Error('runtime Flow gate requires OPENDESK_RUNTIME_API_BINARY');
File.ensureDir(runDir);
File.ensureDir(File.join(runDir, 'results'));
const appData = File.join(runDir, 'flow-fixture', 'app-data');
const sourceRoot = File.join(runDir, 'flow-fixture', 'source');
const fixtureRoot = File.join(Execution.workdir, 'tests', 'fixtures', 'flow-install-test');
const alternateCwd = File.join(runDir, 'flow-fixture', 'alternate-cwd');
const publicKeyPath = File.join(runDir, 'flow-fixture', 'publisher-test-only.pub');
const privateKeyPath = File.join(runDir, 'flow-fixture', 'publisher-test-only.pem');
const archiveDir = File.join(runDir, 'flow-fixture', '深层 路径', '二级', '安装包');
const archivePath = File.join(archiveDir, 'OpenDesk 安装测试.odflow');
const explicitRunText = 'OpenDesk Install Test: explicit run succeeded';
const localSourcePath = File.join(runDir, 'flow-fixture', 'local-script.js');
const runLogRoot = File.join(runDir, 'flow-fixture', 'run-logs');
const opensslBinary = String(Execution.env.OPENDESK_OPENSSL_BINARY || 'openssl');

function fail(message) {
  throw new Error(message);
}

function parseEnvelope(result, label) {
  if (result.exitCode !== 0) fail(`${label} exited ${result.exitCode}: ${result.stderr || result.stdout}`);
  let value;
  try {
    value = JSON.parse(result.stdout);
  } catch (error) {
    fail(`${label} did not return JSON: ${error.message}`);
  }
  if (!value || value.ok !== true) fail(`${label} returned failure: ${result.stdout}`);
  return value;
}

function assert(condition, message) {
  if (!condition) fail(message);
}

async function command(args, options = {}) {
  return contextCommand(binary, args, {
    cwd: options.cwd || Execution.workdir,
    env: {
      OPENDESK_APP_DATA_DIR: appData,
      OPENDESK_PROTECTED_RECIPE_ROOT: File.join(appData, 'protected'),
      ...(options.env || {}),
    },
    timeout: options.timeout || 120_000,
    maxOutputBytes: 16 * 1024 * 1024,
  });
}

// The formal suite injects this small adapter before execution. Keeping the
// test body plain JS makes the same assertions readable in evidence.
async function contextCommand(commandPath, args, options) {
  try {
    return await Command.run(commandPath, args, options);
  } catch (error) {
    return {
      exitCode: Number.isInteger(error && error.exitCode) ? error.exitCode : 1,
      stdout: String(error && error.stdout || ''),
      stderr: String(error && error.stderr || error && error.message || ''),
    };
  }
}

File.ensureDir(File.join(sourceRoot, 'assets'));
File.ensureDir(File.join(sourceRoot, 'payload'));
File.ensureDir(archiveDir);
File.ensureDir(alternateCwd);
assert(File.exists(File.join(fixtureRoot, 'main.js')), 'OpenDesk Install Test fixture main.js is missing');
assert(File.exists(File.join(fixtureRoot, 'assets', 'value.txt')), 'OpenDesk Install Test fixture resource is missing');
File.copy(File.join(fixtureRoot, 'main.js'), File.join(sourceRoot, 'payload', 'main.js'));
File.copy(File.join(fixtureRoot, 'assets', 'value.txt'), File.join(sourceRoot, 'assets', 'value.txt'));

try {
  let keygen = await contextCommand(opensslBinary, ['genpkey', '-algorithm', 'Ed25519', '-out', privateKeyPath], {
    cwd: Execution.workdir,
    timeout: 30_000,
    maxOutputBytes: 1024 * 1024,
  });
  assert(keygen.exitCode === 0, `generate ephemeral Flow signing key failed: ${keygen.stderr || keygen.stdout}`);
  keygen = await contextCommand(opensslBinary, ['pkey', '-in', privateKeyPath, '-pubout', '-out', publicKeyPath], {
    cwd: Execution.workdir,
    timeout: 30_000,
    maxOutputBytes: 1024 * 1024,
  });
  assert(keygen.exitCode === 0, `derive ephemeral Flow public key failed: ${keygen.stderr || keygen.stdout}`);

  let result = await command(['flow', 'pack', sourceRoot, '-o', archivePath,
    '--flow-id', 'opendesk-install-test', '--name', 'OpenDesk Install Test', '--version', '1.0.0',
    '--publisher-id', 'opendesk-install-test-publisher', '--publisher-key-id', 'opendesk-install-test-key',
    '--entry', 'payload/main.js', '--public-key', publicKeyPath, '--signing-key', privateKeyPath,
    '--file', 'payload/main.js', '--file', 'assets/value.txt']);
  parseEnvelope(result, 'flow pack');

  parseEnvelope(await command(['flow', 'inspect', archivePath]), 'flow inspect');
  const verified = parseEnvelope(await command(['flow', 'verify', archivePath, '--public-key', publicKeyPath]), 'flow verify');
  assert(verified.result && verified.result.signatureVerified === true, 'flow verify did not report signatureVerified');

  result = await command(['flow', 'install', archivePath]);
  assert(result.exitCode !== 0, 'unknown publisher installed without explicit trust');
  assert(result.stdout.includes('flow_trust_required'), `unexpected trust refusal: ${result.stdout}`);

  const installed = parseEnvelope(await command(['flow', 'install', archivePath, '--trust-flow']), 'flow install');
  const record = installed.result && installed.result.record;
  assert(record && /^flow-[0-9a-f]{32}$/.test(record.installId), 'install did not return a Flow installId');
  const installId = record.installId;
  const dataDir = File.join(appData, 'flow-data', installId);
  const markerPath = File.join(dataDir, 'install-test.marker');
  const resultPath = File.join(dataDir, 'result.json');
  assert(!File.exists(markerPath), 'install created the business marker before explicit run');
  assert(!File.exists(resultPath), 'install created the business result before explicit run');
  assert(!File.exists(File.join(dataDir, 'run.json')), 'install executed the Flow before explicit run');

  const repeated = parseEnvelope(await command(['flow', 'install', archivePath, '--trust-flow']), 'idempotent flow install');
  assert(repeated.result && repeated.result.idempotent === true, 'same artifact reinstall was not idempotent');
  assert(repeated.result.record && repeated.result.record.installId === installId, 'idempotent reinstall changed Catalog identity');
  assert(!File.exists(markerPath) && !File.exists(resultPath), 'idempotent reinstall executed business JavaScript');

  const listed = parseEnvelope(await command(['flow', 'list']), 'flow list');
  assert(Array.isArray(listed.result.flows) && listed.result.flows.length === 1, 'flow list did not contain exactly one Flow');
  assert(listed.result.flows[0].name === 'OpenDesk Install Test', 'flow list exposed the wrong display name');
  assert(listed.result.flows[0].version === '1.0.0', 'flow list exposed the wrong version');
  assert(listed.result.flows[0].publisherId === 'opendesk-install-test-publisher', 'flow list exposed the wrong publisher');

  parseEnvelope(await command(['flow', 'run', installId, '-log-dir', runLogRoot]), 'flow run from repository cwd');
  assert(File.read(markerPath) === explicitRunText + '\n', 'explicit run did not create the expected marker text');
  const businessResult = JSON.parse(File.read(resultPath));
  assert(businessResult.message === explicitRunText, 'explicit run did not create the expected business result');
  const first = JSON.parse(File.read(File.join(dataDir, 'run.json')));
  assert(first.resource === 'resource-ok', 'Flow.resolve returned the wrong resource');
  assert(first.root === File.join(appData, 'flows', installId), 'Flow.root was not bound to the installed Flow');
  assert(first.dataDir === dataDir, 'Flow.dataDir was not bound to the isolated data root');
  assert(first.cwd === Execution.workdir, 'first Flow execution cwd is unexpected');

  File.remove(File.join(dataDir, 'run.json'));
  parseEnvelope(await command(['flow', 'run', installId, '-log-dir', File.join(runLogRoot, 'alternate')], {cwd: alternateCwd}), 'flow run from alternate cwd');
  const second = JSON.parse(File.read(File.join(dataDir, 'run.json')));
  assert(second.root === first.root && second.dataDir === first.dataDir, 'Flow roots changed with cwd');
  assert(second.cwd === alternateCwd, 'Flow execution did not observe the alternate cwd');

  parseEnvelope(await command(['flow', 'uninstall', installId, '--remove-data']), 'flow uninstall');
  assert(!File.exists(File.join(appData, 'flows', installId)), 'uninstall left the installed Flow tree');
  assert(!File.exists(dataDir), 'uninstall --remove-data left Flow data');

  File.write(localSourcePath, `
File.write(File.join(Flow.dataDir, 'local-ran.txt'), JSON.stringify({root: Flow.root, cwd: Execution.workdir}));
`);
  const localInstalled = parseEnvelope(await command(['flow', 'install', localSourcePath]), 'local JS import');
  const localRecord = localInstalled.result && localInstalled.result.record;
  assert(localRecord && localRecord.origin === 'js' && /^local-[0-9a-f]{32}$/.test(localRecord.installId), 'local JS import did not create a local Flow record');
  const localDataDir = File.join(appData, 'flow-data', localRecord.installId);
  assert(!File.exists(File.join(localDataDir, 'local-ran.txt')), 'local JS import executed the script');
  parseEnvelope(await command(['flow', 'run', localRecord.installId, '-log-dir', File.join(runLogRoot, 'local')], {cwd: alternateCwd}), 'local Flow run');
  const localRun = JSON.parse(File.read(File.join(localDataDir, 'local-ran.txt')));
  assert(localRun.root === File.join(appData, 'flows', localRecord.installId), 'local Flow.root is not installed-root bound');
  assert(localRun.cwd === alternateCwd, 'local Flow did not preserve the caller cwd');
  parseEnvelope(await command(['flow', 'uninstall', localRecord.installId, '--remove-data']), 'local Flow uninstall');
  assert(!File.exists(localDataDir), 'local Flow data survived uninstall');
  File.write(File.join(runDir, 'results', 'flow.json'), JSON.stringify({
    status: 'passed',
    fixture: {
      flowId: 'opendesk-install-test',
      name: 'OpenDesk Install Test',
      version: '1.0.0',
      publisherId: 'opendesk-install-test-publisher',
      archivePath,
      markerPath,
      explicitRunText,
    },
    installId,
    installAutorun: false,
    idempotentReinstallAutorun: false,
    explicitRunObserved: true,
    first,
    second,
    localInstallId: localRecord.installId,
    localRun,
    signatureVerified: true,
  }));
} finally {
  if (File.exists(privateKeyPath)) File.remove(privateKeyPath);
  if (File.exists(publicKeyPath)) File.remove(publicKeyPath);
}
