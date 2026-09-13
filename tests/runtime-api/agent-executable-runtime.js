// One-call deterministic executable-selection probe. The parent ai-runtime
// harness supplies a frozen Execution.env for each discovery/error case.
'use strict';

const expectedCode = Execution.env.OPENDESK_EXPECTED_AGENT_ERROR;
const expectedIdentity = Execution.env.OPENDESK_EXPECTED_AGENT_EXECUTABLE_IDENTITY;
const expectedOverride = Execution.env.OPENDESK_EXPECTED_AGENT_OVERRIDE;
const directory = File.join(Execution.artifactDir, 'executable-probe');
const identityFile = File.join(directory, 'agent-executable-identity.txt');
const claudeStarted = File.join(directory, 'claude-started.txt');
File.ensureDir(directory);

if (expectedOverride === 'absent' && Execution.env.OPENDESK_CODEX_EXECUTABLE !== undefined) {
  throw new Error('default discovery unexpectedly received OPENDESK_CODEX_EXECUTABLE');
}

if (typeof Command.__resolveExecutable !== 'undefined') {
  throw new Error('private Command executable resolver leaked into user JavaScript');
}

const capabilities = Agent.getCapabilities();
if (capabilities.checked !== false || capabilities.available !== null) {
  throw new Error('capability query performed a version/login/process probe: ' + JSON.stringify(capabilities));
}
if (File.exists(identityFile) || File.exists(claudeStarted)) {
  throw new Error('capability query launched a CLI process');
}

let result = null;
let error = null;
try {
  result = await Agent.run({prompt: 'CASE:text-ok', cwd: directory});
} catch (caught) {
  error = caught;
}

if (expectedCode) {
  if (!error || error.code !== expectedCode) {
    throw new Error(`expected ${expectedCode}, received ${String(error && error.stack || error)} result=${JSON.stringify(result)}`);
  }
  if (File.exists(identityFile) || File.exists(claudeStarted)) {
    throw new Error('failed Codex executable selection launched a process or fell back to Claude');
  }
  console.log('[AGENT-EXECUTABLE PASS] ' + expectedCode);
} else {
  if (error) throw error;
  if (!result || result.data !== 'codex-text' || result.meta.backend !== 'codex') {
    throw new Error('resolved executable returned the wrong Agent result: ' + JSON.stringify(result));
  }
  if (!expectedIdentity || !File.exists(identityFile)) {
    throw new Error('resolved executable did not leave deterministic identity evidence');
  }
  const actualIdentity = File.read(identityFile).trim();
  if (actualIdentity !== expectedIdentity) {
    throw new Error(`executable identity ${actualIdentity} did not match ${expectedIdentity}`);
  }
  console.log('[AGENT-EXECUTABLE PASS] ' + actualIdentity);
}
