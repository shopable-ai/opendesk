'use strict';

const codexCapabilities = Agent.getCapabilities({backend: 'codex'});
const claudeCapabilities = Agent.getCapabilities({backend: 'claude-code'});
console.log('[PREFLIGHT] ' + JSON.stringify({
  codex: {
    configured: codexCapabilities.configured,
    executableFound: codexCapabilities.executableFound,
    authenticated: codexCapabilities.authenticated,
    available: codexCapabilities.available,
    selectionError: codexCapabilities.selectionError,
  },
  claudeCode: {
    configured: claudeCapabilities.configured,
    executableFound: claudeCapabilities.executableFound,
    authenticated: claudeCapabilities.authenticated,
    available: claudeCapabilities.available,
    selectionError: claudeCapabilities.selectionError,
  },
}));

const codex = await Agent.run({
  backend: 'codex',
  prompt: '只返回 codex-ready。',
});

const claude = await Agent.run({
  backend: 'claude-code',
  prompt: '只返回 claude-ready。',
});

console.log('[RESULT] ' + JSON.stringify({
  codex: {data: codex.data, meta: codex.meta},
  claudeCode: {data: claude.data, meta: claude.meta},
}));
