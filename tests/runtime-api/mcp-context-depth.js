// Invoked by tests/mcp/runtime-context-depth.test.js through the production
// MCP ScriptService or Runner with a host-bound synthetic environment.
function contextCheck(value, message) {
  if (!value) throw new Error('context-depth: ' + message);
}
if (Execution.input.scenario === 'command') {
  const observed = await Command.run('/bin/pwd');
  const explicit = await Command.run('/bin/pwd', [], {cwd: Execution.input.explicitDirectory});
  const result = {workdir: Execution.workdir, observed: observed.stdout.trim(), explicit: explicit.stdout.trim(), hostDirectory: System.getWorkingDirectory()};
  File.write('context-result.json', JSON.stringify(result));
  contextCheck(result.observed === Execution.workdir, 'default cwd must equal execution workdir');
  contextCheck(result.explicit === Execution.input.explicitDirectory, 'explicit cwd must win');
  contextCheck(result.hostDirectory !== Execution.workdir, 'System cwd remains host-owned');
} else if (Execution.input.scenario === 'environment') {
  contextCheck(System.getEnv('OPENDESK_CONTEXT_FIXTURE') === 'present', 'present synthetic key');
  contextCheck(System.getEnv('OPENDESK_CONTEXT_EMPTY', 'fallback') === '', 'empty key preserved');
  contextCheck(System.getEnv('OPENDESK_CONTEXT_MISSING', 'fallback') === 'fallback', 'missing fallback');
  const cases = [];
  for (const key of ['OPENDESK_CONTEXT_FIXTURE', 'OPENDESK_CONTEXT_EMPTY', 'OPENDESK_CONTEXT_MISSING']) {
    let rejected = false;
    try { System.getEnv(key, 123); } catch (error) { rejected = error instanceof TypeError; }
    cases.push({key, rejected});
  }
  File.write('environment-result.json', JSON.stringify(cases));
  contextCheck(cases.every(row => row.rejected), 'invalid fallback rejected independent of key presence');
} else throw new Error('unknown context fixture scenario');
console.log(JSON.stringify({test: 'mcp-context-depth', ok: true, scenario: Execution.input.scenario}));
