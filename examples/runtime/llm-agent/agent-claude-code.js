'use strict';

const capabilities = Agent.getCapabilities({backend: 'claude-code'});
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
  backend: 'claude-code',
  prompt: '返回一句简短的任务确认。',
});

console.log('[RESULT] ' + JSON.stringify({data: result.data, meta: result.meta}));
