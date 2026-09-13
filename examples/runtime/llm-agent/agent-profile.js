'use strict';

// Configure this named Profile in OPENDESK_AGENT_CONFIG before running.
const capabilities = Agent.getCapabilities({profile: 'team-codex'});
console.log('[PREFLIGHT] ' + JSON.stringify({
  kind: capabilities.kind,
  enabled: capabilities.enabled,
  supported: capabilities.supported,
  configured: capabilities.configured,
  backend: capabilities.backend,
  profile: capabilities.profile,
  executableFound: capabilities.executableFound,
  authenticated: capabilities.authenticated,
  available: capabilities.available,
  selectionError: capabilities.selectionError,
}));

const result = await Agent.run({
  profile: 'team-codex',
  prompt: '返回一句简短的任务确认。',
});

console.log('[RESULT] ' + JSON.stringify({data: result.data, meta: result.meta}));
