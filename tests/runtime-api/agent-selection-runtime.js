// One-call selection probe. tests/runtime-api/ai-runtime.js invokes this with
// separate frozen Execution.env snapshots for each precedence rule.
'use strict';

const expected = Execution.env.OPENDESK_EXPECTED_AGENT_BACKEND;
if (expected !== 'codex' && expected !== 'claude-code') {
  throw new Error('OPENDESK_EXPECTED_AGENT_BACKEND must be codex or claude-code');
}
const directory = File.join(Execution.artifactDir, 'selection-probe');
File.ensureDir(directory);
const caps = Agent.getCapabilities();
if (caps.backend !== expected) {
  throw new Error('capability selection mismatch: ' + JSON.stringify(caps));
}
const result = await Agent.run({prompt: 'CASE:text-ok', cwd: directory});
if (!result || !result.meta || result.meta.backend !== expected) {
  throw new Error('run selection mismatch: ' + JSON.stringify(result));
}
const expectedText = expected === 'codex' ? 'codex-text' : 'claude-text';
if (result.data !== expectedText) {
  throw new Error('selected backend used wrong protocol fixture: ' + JSON.stringify(result));
}
console.log('[AGENT-SELECTION PASS] ' + expected);
