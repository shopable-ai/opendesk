// Conditional installed-CLI qualification. This is intentionally not part of
// the deterministic catalog: it uses the user's existing CLI installation and
// saved authentication, and never installs, logs in, or changes credentials.
'use strict';

const backend = Execution.env.OPENDESK_REAL_AGENT_BACKEND || 'codex';
const profile = Execution.env.OPENDESK_REAL_AGENT_PROFILE || null;
if (backend !== 'codex' && backend !== 'claude-code') {
  throw new Error('OPENDESK_REAL_AGENT_BACKEND must be codex or claude-code');
}

const output = {
  type: 'json',
  name: 'integer_5_to_15',
  validation: 'native',
  schema: {
    type: 'object',
    properties: {value: {type: 'integer', minimum: 5, maximum: 15}},
    required: ['value'],
    additionalProperties: false,
  },
};

const timeoutMs = Number(Execution.env.OPENDESK_REAL_AGENT_TIMEOUT_MS || 120000);
if (!Number.isInteger(timeoutMs) || timeoutMs < 1) {
  throw new Error('OPENDESK_REAL_AGENT_TIMEOUT_MS must be a positive integer');
}
const common = {timeoutMs};
const selected = profile ? {...common, profile, backend} : (backend === 'codex' ? common : {...common, backend});
const text = await Agent.run({
  ...selected,
  prompt: 'Return exactly the text opendesk-agent-ready. Do not use tools.',
});
if (typeof text.data !== 'string' || !text.data.includes('opendesk-agent-ready')) {
  throw new Error('real ' + backend + ' text result.data did not match');
}

const structured = await Agent.run({
  ...selected,
  prompt: 'Return one integer from 5 through 15 in the required structured output. Do not use tools.',
  output,
});
if (!structured.data || !Number.isInteger(structured.data.value)
    || structured.data.value < 5 || structured.data.value > 15) {
  throw new Error('real ' + backend + ' structured result.data did not pass the business check');
}

const evidence = {
  backend,
  text: text.data,
  structured: structured.data,
  textMeta: text.meta,
  structuredMeta: structured.meta,
};
const evidencePath = File.join(Execution.artifactDir, 'real-agent-result.json');
await File.writeJSON(evidencePath, evidence, {spaces: 2, createDirs: true});
console.log(JSON.stringify({...evidence, evidencePath}));
