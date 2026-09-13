// Direct deterministic P0 qualification entrypoint.
// From the repository root:
// ./dist/opendesk -script tests/runtime-api/ai-runtime.js -console-mode script
'use strict';

if (System.getPlatformInfo().os === 'windows') {
  throw new Error('The current deterministic fixture executables are POSIX-only; Windows live qualification is separate.');
}

const root = File.join(Execution.workdir, '.runtime', 'tests', 'ai-runtime', Execution.id);
const ready = File.join(root, 'llm-ready.json');
const serverOut = File.join(root, 'llm-server.stdout.log');
const serverErr = File.join(root, 'llm-server.stderr.log');
const binary = Execution.env.OPENDESK_AI_RUNTIME_BINARY
  || File.join(Execution.workdir, 'dist', 'opendesk');
const codexFixture = File.join(Execution.workdir, 'tests', 'runtime-api', 'fixture', 'agent-codex.sh');
const claudeFixture = File.join(Execution.workdir, 'tests', 'runtime-api', 'fixture', 'agent-claude.sh');
const profiles = File.join(Execution.workdir, 'tests', 'runtime-api', 'fixture', 'agent-profiles.json');
const defaultClaudeProfiles = File.join(Execution.workdir, 'tests', 'runtime-api', 'fixture', 'agent-profiles-default-claude.json');
const llmProfiles = File.join(Execution.workdir, 'tests', 'runtime-api', 'fixture', 'llm-profiles.json');
const serverScript = File.join(Execution.workdir, 'tests', 'runtime-api', 'fixture', 'llm-server.py');
const aiRunLifecycleScript = File.join(Execution.workdir, 'tests', 'runtime-api', 'fixture', 'agent-ai-run-lifecycle.js');
const executableProbeScript = File.join(Execution.workdir, 'tests', 'runtime-api', 'agent-executable-runtime.js');
const executableRoot = File.join(root, 'executable-fixtures');
const primaryBin = File.join(executableRoot, 'primary-bin');
const secondaryBin = File.join(executableRoot, 'secondary-bin');
const explicitBin = File.join(executableRoot, 'explicit-bin');
const nonExecutableBin = File.join(executableRoot, 'non-executable-bin');
const primaryCodex = File.join(primaryBin, 'codex');
const primaryClaude = File.join(primaryBin, 'claude');
const secondaryCodex = File.join(secondaryBin, 'codex');
const explicitCodex = File.join(explicitBin, 'codex-explicit');
const nonExecutableCodex = File.join(nonExecutableBin, 'codex');
const missingBin = File.join(executableRoot, 'missing-bin');
File.ensureDir(root);

function quote(value) {
  return "'" + String(value).replace(/'/g, "'\\''") + "'";
}

function writeEnv(name, values) {
  const file = File.join(root, name + '.env');
  const lines = Object.keys(values).sort().map((key) => key + '=' + values[key]);
  File.write(file, lines.join('\n') + '\n');
  return file;
}

function executableWrapper(target, identity) {
  return '#!/bin/sh\n'
    + 'set -eu\n'
    + "printf '%s\\n' " + quote(identity) + ' >"$PWD/agent-executable-identity.txt"\n'
    + 'exec ' + quote(target) + ' "$@"\n';
}

function childProcessEnvironment(pathValue) {
  const values = {PATH: pathValue};
  for (const key of ['HOME', 'TMPDIR', 'TMP', 'TEMP', 'LANG', 'LC_ALL', 'LC_CTYPE']) {
    if (typeof Execution.env[key] === 'string') values[key] = Execution.env[key];
  }
  return values;
}

async function runRuntime(name, script, envFile, input, runtimePath) {
  const logDir = File.join(root, name + '-logs');
  const args = ['-script', script, '-console-mode', 'script', '-env-file', envFile, '-log-dir', logDir];
  if (input !== undefined) args.push('-input', JSON.stringify(input));
  const result = await Command.run(binary, args, {
    cwd: Execution.workdir,
    envMode: 'replace',
    env: childProcessEnvironment(runtimePath || controlledPath),
    timeout: 90_000,
    maxOutputBytes: 4 * 1024 * 1024,
  });
  File.write(File.join(root, name + '.stdout.log'), result.stdout);
  File.write(File.join(root, name + '.stderr.log'), result.stderr);
  const summaryPath = File.join(logDir, 'summary.json');
  if (!File.exists(summaryPath)) throw new Error(name + ' did not write an execution summary');
  const summary = JSON.parse(File.read(summaryPath));
  if (!summary || summary.success !== true || summary.status !== 'succeeded') {
    throw new Error(name + ' child execution did not succeed: ' + JSON.stringify({
      success: summary && summary.success,
      status: summary && summary.status,
      error: summary && summary.error,
    }));
  }
  return result;
}

function parseAIEnvelope(stdout, label) {
  let envelope = null;
  try {
    envelope = JSON.parse(String(stdout || '').trim());
  } catch (error) {
    throw new Error(label + ' did not emit one JSON envelope: ' + String(error));
  }
  if (!envelope || typeof envelope !== 'object') throw new Error(label + ' emitted an invalid envelope');
  return envelope;
}

async function waitForFile(file, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (!File.exists(file)) {
    if (Date.now() >= deadline) throw new Error('timed out waiting for ' + file);
    await delay(10);
  }
}

async function assertDead(pid, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      await Command.run('/bin/kill', ['-0', String(pid)], {timeout: 500});
    } catch (_) {
      return;
    }
    await delay(20);
  }
  throw new Error('ai run teardown left Agent descendant alive: ' + pid);
}

async function qualifyAIRunLifecycle(environment) {
  const successDir = File.join(root, 'ai-run-success');
  const successResult = File.join(successDir, 'result.json');
  const successEnv = writeEnv('ai-run-success', {
    ...environment,
    OPENDESK_AGENT_LIFECYCLE_DIR: successDir,
    OPENDESK_AGENT_LIFECYCLE_PROMPT: 'CASE:text-ok',
    OPENDESK_AGENT_LIFECYCLE_RESULT: successResult,
  });
  const success = await Command.run(binary, [
    'ai', 'run', aiRunLifecycleScript,
    '--env-file', successEnv,
    '--timeout', '5s',
  ], {
    cwd: Execution.workdir,
    envMode: 'replace',
    env: childProcessEnvironment(environment.PATH),
    timeout: 10_000,
    maxOutputBytes: 1024 * 1024,
  });
  const successEnvelope = parseAIEnvelope(success.stdout, 'ai run success');
  if (successEnvelope.ok !== true || successEnvelope.command !== 'run') {
    throw new Error('ai run did not succeed: ' + success.stdout);
  }
  const accepted = JSON.parse(File.read(successResult));
  if (accepted.data !== 'codex-text' || !accepted.meta || accepted.meta.backend !== 'codex') {
    throw new Error('ai run did not expose the default Codex result.data contract');
  }

  const teardownDir = File.join(root, 'ai-run-teardown');
  const teardownEnv = writeEnv('ai-run-teardown', {
    ...environment,
    OPENDESK_AGENT_LIFECYCLE_DIR: teardownDir,
    OPENDESK_AGENT_LIFECYCLE_PROMPT: 'CASE:cancel',
  });
  let timedOut = null;
  try {
    await Command.run(binary, [
      'ai', 'run', aiRunLifecycleScript,
      '--env-file', teardownEnv,
      '--timeout', '250ms',
    ], {
      cwd: Execution.workdir,
      envMode: 'replace',
      env: childProcessEnvironment(environment.PATH),
      timeout: 10_000,
      maxOutputBytes: 1024 * 1024,
    });
  } catch (error) {
    timedOut = error;
  }
  if (!timedOut) throw new Error('ai run timeout unexpectedly resolved');
  const timeoutEnvelope = parseAIEnvelope(timedOut.stdout, 'ai run timeout');
  if (timeoutEnvelope.ok !== false || !timeoutEnvelope.error || timeoutEnvelope.error.code !== 'timeout') {
    throw new Error('ai run timeout returned the wrong envelope: ' + timedOut.stdout);
  }
  const childPIDFile = File.join(teardownDir, 'codex-child.pid');
  await waitForFile(childPIDFile, 1000);
  await assertDead(Number(File.read(childPIDFile).trim()), 1500);
}

const fixtureEnvironment = {
  OPENDESK_AGENT_CONFIG: profiles,
  OPENDESK_TEST_CODEX_EXECUTABLE: codexFixture,
  OPENDESK_TEST_CLAUDE_EXECUTABLE: claudeFixture,
  PATH: '',
  BUSINESS_SECRET: 'business-secret-must-not-reach-agent',
  OPENDESK_LLM_API_KEY: 'http-key-must-not-reach-agent',
  CODEX_API_KEY: 'ambient-codex-key-must-not-reach-saved-auth',
  ANTHROPIC_API_KEY: 'ambient-claude-key-must-not-reach-saved-auth',
  DUMMY_CODEX_AUTH: 'selected-codex-fixture-auth',
  DUMMY_CLAUDE_AUTH: 'selected-claude-fixture-auth',
};

File.ensureDir(primaryBin);
File.ensureDir(secondaryBin);
File.ensureDir(explicitBin);
File.ensureDir(nonExecutableBin);
File.write(primaryCodex, executableWrapper(codexFixture, 'path-primary'));
File.write(primaryClaude, executableWrapper(claudeFixture, 'path-claude'));
File.write(secondaryCodex, executableWrapper(codexFixture, 'path-secondary'));
File.write(explicitCodex, executableWrapper(codexFixture, 'explicit-absolute'));
File.write(nonExecutableCodex, executableWrapper(codexFixture, 'must-not-run'));
const controlledPath = [primaryBin, secondaryBin, '/usr/bin', '/bin'].join(':');
fixtureEnvironment.PATH = controlledPath;

let serverPID = null;
try {
  await Command.run('/bin/chmod', ['+x', codexFixture, claudeFixture, primaryCodex, primaryClaude, secondaryCodex, explicitCodex], {timeout: 5000});
  const start = await Command.run('/bin/sh', ['-c',
    '/usr/bin/python3 ' + quote(serverScript) + ' --ready ' + quote(ready)
      + ' >' + quote(serverOut) + ' 2>' + quote(serverErr) + ' & echo $!',
  ], {cwd: Execution.workdir, timeout: 10_000, maxOutputBytes: 4096});
  serverPID = Number(String(start.stdout || '').trim());
  if (!Number.isInteger(serverPID) || serverPID <= 0) throw new Error('LLM fixture server did not report a PID');
  const readyDeadline = Date.now() + 10_000;
  while (!File.exists(ready)) {
    if (Date.now() >= readyDeadline) throw new Error('LLM fixture server did not become ready');
    await delay(20);
  }
  const server = JSON.parse(File.read(ready));
  if (!server || typeof server.baseURL !== 'string') throw new Error('invalid LLM fixture ready file');

  await runRuntime('agent-protocols', 'tests/runtime-api/agent-runtime.js', writeEnv('agent-protocols', fixtureEnvironment));
  await qualifyAIRunLifecycle(fixtureEnvironment);

  await runRuntime('agent-executable-path-priority', executableProbeScript, writeEnv('agent-executable-path-priority', {
    ...fixtureEnvironment,
    OPENDESK_EXPECTED_AGENT_EXECUTABLE_IDENTITY: 'path-primary',
    OPENDESK_EXPECTED_AGENT_OVERRIDE: 'absent',
  }));
  await runRuntime('agent-executable-explicit-absolute', executableProbeScript, writeEnv('agent-executable-explicit-absolute', {
    ...fixtureEnvironment,
    OPENDESK_CODEX_EXECUTABLE: explicitCodex,
    OPENDESK_EXPECTED_AGENT_EXECUTABLE_IDENTITY: 'explicit-absolute',
  }));
  await runRuntime('agent-executable-path-skip-non-executable', executableProbeScript, writeEnv('agent-executable-path-skip-non-executable', {
    ...fixtureEnvironment,
    PATH: [nonExecutableBin, secondaryBin, '/usr/bin', '/bin'].join(':'),
    OPENDESK_EXPECTED_AGENT_EXECUTABLE_IDENTITY: 'path-secondary',
    OPENDESK_EXPECTED_AGENT_OVERRIDE: 'absent',
  }), undefined, [nonExecutableBin, secondaryBin, '/usr/bin', '/bin'].join(':'));
  await runRuntime('agent-executable-missing', executableProbeScript, writeEnv('agent-executable-missing', {
    ...fixtureEnvironment,
    PATH: missingBin,
    OPENDESK_EXPECTED_AGENT_ERROR: 'PROGRAM_NOT_FOUND',
    OPENDESK_EXPECTED_AGENT_OVERRIDE: 'absent',
  }), undefined, missingBin);
  await runRuntime('agent-executable-directory', executableProbeScript, writeEnv('agent-executable-directory', {
    ...fixtureEnvironment,
    OPENDESK_CODEX_EXECUTABLE: primaryBin,
    OPENDESK_EXPECTED_AGENT_ERROR: 'PROGRAM_NOT_EXECUTABLE',
  }));
  await runRuntime('agent-executable-non-executable', executableProbeScript, writeEnv('agent-executable-non-executable', {
    ...fixtureEnvironment,
    OPENDESK_CODEX_EXECUTABLE: nonExecutableCodex,
    OPENDESK_EXPECTED_AGENT_ERROR: 'PROGRAM_NOT_EXECUTABLE',
  }));
  await runRuntime('agent-executable-relative-override', executableProbeScript, writeEnv('agent-executable-relative-override', {
    ...fixtureEnvironment,
    OPENDESK_CODEX_EXECUTABLE: 'codex',
    OPENDESK_EXPECTED_AGENT_ERROR: 'PROGRAM_NOT_CONFIGURED',
  }));

  await runRuntime('selection-config-default', 'tests/runtime-api/agent-selection-runtime.js', writeEnv('selection-config-default', {
    ...fixtureEnvironment,
    OPENDESK_AGENT_CONFIG: defaultClaudeProfiles,
    OPENDESK_EXPECTED_AGENT_BACKEND: 'claude-code',
  }));
  await runRuntime('selection-env-profile', 'tests/runtime-api/agent-selection-runtime.js', writeEnv('selection-env-profile', {
    ...fixtureEnvironment,
    OPENDESK_AGENT_CONFIG: defaultClaudeProfiles,
    OPENDESK_AGENT_DEFAULT_PROFILE: 'codex-test',
    OPENDESK_EXPECTED_AGENT_BACKEND: 'codex',
  }));
  await runRuntime('selection-env-backend', 'tests/runtime-api/agent-selection-runtime.js', writeEnv('selection-env-backend', {
    ...fixtureEnvironment,
    OPENDESK_AGENT_BACKEND: 'claude-code',
    OPENDESK_EXPECTED_AGENT_BACKEND: 'claude-code',
  }));

  for (const protocol of ['openai-responses', 'openai-chat-completions']) {
    await runRuntime('llm-' + protocol, 'tests/runtime-api/llm-runtime.js', writeEnv('llm-' + protocol, {
      OPENDESK_LLM_PROTOCOL: protocol,
      OPENDESK_LLM_BASE_URL: server.baseURL + '/v1',
      OPENDESK_LLM_MODEL: 'fixture-model',
      OPENDESK_LLM_API_KEY: 'fixture-secret',
      OPENDESK_LLM_ALLOW_INSECURE_LOCALHOST: 'true',
      OPENDESK_LLM_CONFIG: llmProfiles,
      OPENDESK_LLM_FIXTURE_BASE_URL: server.baseURL + '/v1',
      OPENDESK_LLM_PROFILE_KEY: 'fixture-profile-secret',
      ...(protocol === 'openai-chat-completions' ? {OPENDESK_LLM_DEFAULT_PROFILE: 'default'} : {}),
      BUSINESS_SECRET: 'must-remain-in-execution-only',
    }));
  }

  await runRuntime('example-agent-default', 'examples/runtime/llm-agent/agent-run.js', writeEnv('example-agent-default', fixtureEnvironment));
  await runRuntime('example-agent-claude', 'examples/runtime/llm-agent/agent-claude-code.js', writeEnv('example-agent-claude', fixtureEnvironment));
  await runRuntime('example-agent-profile', 'examples/runtime/llm-agent/agent-profile.js', writeEnv('example-agent-profile', fixtureEnvironment));
  await runRuntime('example-agent-structured', 'examples/runtime/llm-agent/agent-structured-output.js', writeEnv('example-agent-structured', fixtureEnvironment));
  await runRuntime('example-backend-switch', 'examples/runtime/llm-agent/backend-switch.js', writeEnv('example-backend-switch', fixtureEnvironment));
  await runRuntime('example-llm-generate', 'examples/runtime/llm-agent/llm-generate.js', writeEnv('example-llm-generate', {
    OPENDESK_LLM_PROTOCOL: 'openai-responses',
    OPENDESK_LLM_BASE_URL: server.baseURL + '/v1',
    OPENDESK_LLM_MODEL: 'fixture-model',
    OPENDESK_LLM_API_KEY: 'fixture-secret',
    OPENDESK_LLM_ALLOW_INSECURE_LOCALHOST: 'true',
  }));

  console.log('[AI-RUNTIME PASS] deterministic Codex, Claude Code, ai run lifecycle, selection, HTTP fixtures, and public example smokes passed');
} finally {
  if (serverPID) {
    try { await Command.run('/bin/kill', ['-TERM', String(serverPID)], {timeout: 5000}); }
    catch (_) { console.warn('[AI-RUNTIME] fixture server already stopped'); }
  }
}
