// Deterministic P0 Agent protocol and lifecycle qualification.
// Run through tests/runtime-api/ai-runtime.js so fixture paths and profiles are
// supplied by an isolated env file.
'use strict';

(0, eval)(File.read(File.join(File.cwd(), 'tests/runtime-api/framework.js')));
RuntimeAPITest.load('tests/runtime-api/manifest.js');

const AI_ROOT = File.join(Execution.artifactDir, 'agent-runtime');
File.ensureDir(AI_ROOT);

const integerOutput = (validation) => ({
  type: 'json',
  name: 'integer_5_to_15',
  validation,
  schema: {
    type: 'object',
    properties: {value: {type: 'integer', minimum: 5, maximum: 15}},
    required: ['value'],
    additionalProperties: false,
  },
});

const environmentOutput = {
  type: 'json',
  name: 'agent_environment_safety',
  validation: 'native',
  schema: {
    type: 'object',
    properties: {
      businessSecretPresent: {type: 'boolean', const: false},
      llmKeyPresent: {type: 'boolean', const: false},
      otherBackendKeyPresent: {type: 'boolean', const: false},
      selectedAuthPresent: {type: 'boolean', const: true},
      authSourceNamePresent: {type: 'boolean', const: false},
    },
    required: ['businessSecretPresent', 'llmKeyPresent', 'otherBackendKeyPresent', 'selectedAuthPresent', 'authSourceNamePresent'],
    additionalProperties: false,
  },
};

function caseDirectory(name) {
  const directory = File.join(AI_ROOT, name);
  File.ensureDir(directory);
  return directory;
}

async function expectCode(options, expected) {
  let error = null;
  try {
    await Agent.run(options);
  } catch (caught) {
    error = caught;
  }
  RuntimeAPITest.assert(error, 'expected Agent.run to reject with ' + expected);
  RuntimeAPITest.equal(error.code, expected, String(error && error.stack || error));
  return error;
}

async function waitForFile(file, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (!File.exists(file)) {
    if (Date.now() >= deadline) throw new Error('timed out waiting for fixture file ' + file);
    await delay(10);
  }
}

async function waitForDead(pid, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      await Command.run('/bin/kill', ['-0', String(pid)], {timeout: 500});
    } catch (_) {
      return;
    }
    await delay(20);
  }
  throw new Error('fixture descendant remained alive after cancellation: ' + pid);
}

(() => {
  const {assert, equal, test} = RuntimeAPITest;

  test({
    name: 'Agent globals and capabilities are present without launching a model process',
    tier: 'unit',
    covers: ['Agent.getCapabilities', 'Agent.run'],
  }, async () => {
    equal(typeof Agent, 'object');
    equal(typeof Agent.run, 'function');
    equal(typeof Agent.getCapabilities, 'function');
    const directory = caseDirectory('capabilities-no-side-effect');
    const caps = Agent.getCapabilities();
    equal(caps.enabled, true);
    equal(caps.defaultBackend, 'codex');
    equal(caps.backend, 'codex');
    equal(caps.supported, true);
    equal(caps.configured, true);
    equal(caps.executableFound, true);
    equal(caps.checked, false);
    equal(caps.authenticated, 'unknown');
    equal(caps.available, null);
    assert(caps.supportedBackends.includes('claude-code'));
    equal(typeof Command.__resolveExecutable, 'undefined', 'private executable resolver leaked into public Command');
    assert(!File.exists(File.join(directory, 'codex-started.txt')), 'capability query launched Codex fixture');
    assert(!File.exists(File.join(directory, 'claude-started.txt')), 'capability query launched Claude fixture');
  });

  test({
    name: 'Agent backend and named profile selection are deterministic',
    tier: 'unit',
    covers: ['Agent.run'],
  }, async () => {
    const byDefault = await Agent.run({prompt: 'CASE:text-ok', cwd: caseDirectory('default-codex')});
    equal(byDefault.data, 'codex-text');
    equal(byDefault.meta.backend, 'codex');
    equal(byDefault.meta.adapter, 'codex-exec');
    equal(File.read(File.join(caseDirectory('default-codex'), 'agent-executable-identity.txt')).trim(), 'path-primary');

    const claude = await Agent.run({backend: 'claude-code', prompt: 'CASE:text-ok', cwd: caseDirectory('explicit-claude')});
    equal(claude.data, 'claude-text');
    equal(claude.meta.backend, 'claude-code');
    equal(claude.meta.adapter, 'claude-code-print');

    const named = await Agent.run({profile: 'codex-test', prompt: 'CASE:text-ok', cwd: caseDirectory('named-profile')});
    equal(named.data, 'codex-text');
    equal(named.meta.profile, 'codex-test');
  });

  test({
    name: 'Agent rejects selection, executable, option, auth, and policy errors before fallback',
    tier: 'unit',
    covers: ['Agent.run'],
  }, async () => {
    await expectCode({backend: 'claude-code', profile: 'codex-test', prompt: 'CASE:text-ok'}, 'BACKEND_PROFILE_CONFLICT');
    await expectCode({profile: 'does-not-exist', prompt: 'CASE:text-ok'}, 'PROFILE_NOT_FOUND');
    await expectCode({backend: 'unknown-fixture', prompt: 'CASE:text-ok'}, 'UNKNOWN_BACKEND');
    await expectCode({backend: 'gemini', prompt: 'CASE:text-ok'}, 'BACKEND_NOT_IMPLEMENTED');
    await expectCode({backend: 'json-cli', prompt: 'CASE:text-ok'}, 'BACKEND_NOT_IMPLEMENTED');
    await expectCode({profile: 'missing-program', prompt: 'CASE:text-ok'}, 'PROGRAM_NOT_CONFIGURED');
    await expectCode({profile: 'relative-program', prompt: 'CASE:text-ok'}, 'PROGRAM_NOT_CONFIGURED');
    const noFallback = caseDirectory('nonexistent-no-fallback');
    await expectCode({profile: 'nonexistent-program', prompt: 'CASE:text-ok', cwd: noFallback}, 'PROGRAM_NOT_FOUND');
    assert(!File.exists(File.join(noFallback, 'claude-started.txt')), 'failed Codex selection fell back to Claude');
    await expectCode({backend: 'codex', model: 42, prompt: 'CASE:text-ok'}, 'INVALID_ARGUMENT');
    await expectCode({backend: 'codex', prompt: 'CASE:text-ok', backendOptions: {claude: {}}}, 'BACKEND_OPTIONS_CONFLICT');
    await expectCode({backend: 'codex', prompt: 'CASE:text-ok', backendOptions: {codex: {unknown: true}}}, 'INVALID_ARGUMENT');
    await expectCode({backend: 'claude-code', prompt: 'CASE:text-ok', backendOptions: {'claude-code': {maxTurns: 2}}}, 'INVALID_ARGUMENT');
    await expectCode({backend: 'codex', prompt: 'CASE:text-ok', extraArgs: ['--json']}, 'INVALID_ARGUMENT');
    await expectCode({profile: 'raw-args', prompt: 'CASE:text-ok'}, 'INVALID_ARGUMENT');
    await expectCode({profile: 'bad-auth', prompt: 'CASE:text-ok'}, 'UNSUPPORTED_AUTH_MODE');
    await expectCode({profile: 'bad-policy', prompt: 'CASE:text-ok'}, 'UNSUPPORTED_PERMISSION_POLICY');
  });

  test({
    name: 'Codex adapter enforces JSONL completion and final-message protocol',
    tier: 'unit',
    covers: ['Agent.run'],
  }, async () => {
    const cases = [
      ['no-terminal', 'PROTOCOL_INCOMPLETE'],
      ['turn-failed', 'AGENT_PROTOCOL_FAILED'],
      ['error-event', 'AGENT_PROTOCOL_FAILED'],
      ['invalid-jsonl', 'PROTOCOL_ERROR'],
      ['duplicate-terminal', 'PROTOCOL_ERROR'],
      ['missing-final', 'RESULT_FILE_MISSING'],
      ['final-too-large', 'RESULT_FILE_LIMIT'],
      ['nonzero', 'PROCESS_FAILED'],
    ];
    for (const [name, code] of cases) {
      await expectCode({backend: 'codex', prompt: 'CASE:' + name, cwd: caseDirectory('codex-' + name)}, code);
    }
  });

  test({
    name: 'Claude Code adapter enforces its result envelope and structured_output',
    tier: 'unit',
    covers: ['Agent.run'],
  }, async () => {
    const cases = [
      ['failure', null, 'AGENT_PROTOCOL_FAILED'],
      ['is-error', null, 'AGENT_PROTOCOL_FAILED'],
      ['missing-structured', integerOutput('native'), 'PROTOCOL_INCOMPLETE'],
      ['missing-result', null, 'PROTOCOL_INCOMPLETE'],
      ['invalid-envelope', null, 'PROTOCOL_ERROR'],
      ['nonzero', null, 'PROCESS_FAILED'],
    ];
    for (const [name, output, code] of cases) {
      const options = {backend: 'claude-code', prompt: 'CASE:' + name, cwd: caseDirectory('claude-' + name)};
      if (output) options.output = output;
      await expectCode(options, code);
    }
  });

  test({
    name: 'Agent structured output is strict and native/local stay distinct',
    tier: 'unit',
    covers: ['Agent.run'],
  }, async () => {
    for (const backend of ['codex', 'claude-code']) {
      for (const value of [5, 10, 15]) {
        const result = await Agent.run({backend, prompt: 'CASE:native-' + value, output: integerOutput('native'), cwd: caseDirectory(backend + '-native-' + value)});
        equal(result.data.value, value);
      }
      for (const name of ['string', 'low', 'high', 'float', 'extra', 'missing']) {
        await expectCode({backend, prompt: 'CASE:native-' + name, output: integerOutput('native'), cwd: caseDirectory(backend + '-invalid-' + name)}, 'OUTPUT_VALIDATION_FAILED');
      }
    }
    await expectCode({backend: 'codex', prompt: 'CASE:native-explanation', output: integerOutput('native'), cwd: caseDirectory('codex-explanation')}, 'OUTPUT_PARSE_FAILED');
    const codexLocal = await Agent.run({backend: 'codex', prompt: 'CASE:local-ok', output: integerOutput('local'), cwd: caseDirectory('codex-local')});
    equal(codexLocal.data.value, 11);
    const claudeLocal = await Agent.run({backend: 'claude-code', prompt: 'CASE:local-ok', output: integerOutput('local'), cwd: caseDirectory('claude-local')});
    equal(claudeLocal.data.value, 12);
    await expectCode({backend: 'gemini', prompt: 'CASE:local-ok', output: integerOutput('native')}, 'BACKEND_NOT_IMPLEMENTED');
  });

  test({
    name: 'Agent adapters own model flags and reject cross-protocol argument substitution',
    tier: 'unit',
    covers: ['Agent.run'],
  }, async () => {
    const codexDir = caseDirectory('codex-argv');
    await Agent.run({backend: 'codex', model: 'codex-fixture-model', prompt: 'CASE:argv', cwd: codexDir, backendOptions: {codex: {reasoningEffort: 'low'}}});
    const codexArgs = File.read(File.join(codexDir, 'codex-args.txt')).split('\n');
    assert(codexArgs.includes('exec') && codexArgs.includes('--json') && codexArgs.includes('--output-last-message'));
    assert(codexArgs.includes('--ignore-user-config'), 'Codex was allowed to load user-configured MCP servers');
    const disabledCodexFeatures = [];
    for (let index = 0; index < codexArgs.length; index += 1) {
      if (codexArgs[index] === '--disable') disabledCodexFeatures.push(codexArgs[index + 1]);
    }
    equal(JSON.stringify(disabledCodexFeatures), JSON.stringify([
      'shell_tool',
      'unified_exec',
      'computer_use',
      'browser_use',
      'browser_use_external',
      'in_app_browser',
      'in_app_local_automation',
      'apps',
      'multi_agent',
    ]), 'Codex model-callable tool features were not disabled by fixed adapter arguments');
    assert(codexArgs.includes('--model') && codexArgs.includes('codex-fixture-model'));
    assert(codexArgs.includes('model_reasoning_effort="low"'));
    assert(!codexArgs.includes('--output-format'), 'Codex received Claude protocol flags');

    const codexResult = await Agent.run({backend: 'codex', model: 'requested-only', prompt: 'CASE:text-ok', cwd: caseDirectory('codex-model-fact')});
    equal(codexResult.meta.requestedModel, 'requested-only');
    equal(codexResult.meta.model, null);

    const claudeDir = caseDirectory('claude-argv');
    const claudeResult = await Agent.run({backend: 'claude-code', model: 'claude-fixture-model', prompt: 'CASE:argv', cwd: claudeDir, backendOptions: {'claude-code': {maxBudgetUsd: 0.25}}});
    const claudeArgs = File.read(File.join(claudeDir, 'claude-args.txt')).split('\n');
    assert(claudeArgs.includes('-p') && claudeArgs.includes('--output-format') && claudeArgs.includes('json'));
    assert(claudeArgs.includes('--permission-mode') && claudeArgs.includes('plan'));
    assert(claudeArgs.includes('--no-session-persistence'));
    assert(claudeArgs.includes('--strict-mcp-config'), 'Claude was allowed to load ambient MCP servers');
    const toolsIndex = claudeArgs.indexOf('--tools');
    assert(toolsIndex >= 0 && claudeArgs[toolsIndex + 1] === '', 'Claude built-in tools were not disabled');
    assert(claudeArgs.includes('--model') && claudeArgs.includes('claude-fixture-model'));
    assert(!claudeArgs.includes('--max-turns'), 'Claude received an unsupported max-turns flag');
    assert(claudeArgs.includes('--max-budget-usd') && claudeArgs.includes('0.25'));
    assert(!claudeArgs.includes('exec') && !claudeArgs.includes('--output-last-message'), 'Claude received Codex protocol flags');
    equal(claudeResult.meta.requestedModel, 'claude-fixture-model');
    equal(claudeResult.meta.model, 'claude-fixture');
  });

  test({
    name: 'Agent child environment is replace-only and backend auth is isolated',
    tier: 'unit',
    covers: ['Agent.run'],
  }, async () => {
    const codex = await Agent.run({profile: 'codex-env-auth', prompt: 'CASE:env-safety', output: environmentOutput, cwd: caseDirectory('codex-env')});
    equal(codex.data.selectedAuthPresent, true);
    const claude = await Agent.run({profile: 'claude-env-auth', prompt: 'CASE:env-safety', output: environmentOutput, cwd: caseDirectory('claude-env')});
    equal(claude.data.selectedAuthPresent, true);
  });

  test({
    name: 'Agent pre-cancel, in-flight cancel, timeout, and process-group cleanup are enforced',
    tier: 'unit',
    covers: ['Agent.run'],
  }, async () => {
    const preDir = caseDirectory('pre-cancel');
    const pre = new AbortController();
    pre.abort('before Agent.run');
    await expectCode({backend: 'codex', prompt: 'CASE:cancel', cwd: preDir, signal: pre.signal}, 'CANCELED');
    assert(!File.exists(File.join(preDir, 'codex-started.txt')), 'pre-canceled Agent launched a CLI');

    for (const backend of ['codex', 'claude-code']) {
      const prefix = backend === 'codex' ? 'codex' : 'claude';
      const cancelDir = caseDirectory(prefix + '-cancel');
      const controller = new AbortController();
      let canceled = null;
      const pending = Agent.run({backend, prompt: 'CASE:cancel', cwd: cancelDir, timeoutMs: 5000, signal: controller.signal})
        .catch((error) => { canceled = error; });
      await waitForFile(File.join(cancelDir, prefix + '-child.pid'), 1000);
      const child = Number(File.read(File.join(cancelDir, prefix + '-child.pid')).trim());
      controller.abort('fixture cancel');
      await pending;
      assert(canceled && canceled.code === 'CANCELED', String(canceled));
      await waitForDead(child, 1500);

      const timeoutDir = caseDirectory(prefix + '-timeout');
      await expectCode({backend, prompt: 'CASE:timeout', cwd: timeoutDir, timeoutMs: 80}, 'TIMEOUT');
      await waitForFile(File.join(timeoutDir, prefix + '-child.pid'), 500);
      const timedOutChild = Number(File.read(File.join(timeoutDir, prefix + '-child.pid')).trim());
      await waitForDead(timedOutChild, 1500);
    }
  });
})();

await RuntimeAPITest.run('RUNTIME-API-AGENT');
