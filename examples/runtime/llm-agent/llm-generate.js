'use strict';

const capabilities = LLM.getCapabilities();
console.log('[PREFLIGHT] ' + JSON.stringify({
  kind: capabilities.kind,
  enabled: capabilities.enabled,
  supported: capabilities.supported,
  configured: capabilities.configured,
  profile: capabilities.profile,
  protocol: capabilities.protocol,
  authenticated: capabilities.authenticated,
  available: capabilities.available,
  selectionError: capabilities.selectionError,
}));

const result = await LLM.generate({
  prompt: '用一句话说明确定性自动化为什么仍应由普通 JavaScript 控制。',
});

console.log('[RESULT] ' + JSON.stringify({data: result.data, meta: result.meta}));
