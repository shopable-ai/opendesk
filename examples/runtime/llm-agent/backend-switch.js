'use strict';

const codex = await Agent.run({
  backend: 'codex',
  prompt: '只返回 codex-ready。',
});

const claude = await Agent.run({
  backend: 'claude-code',
  prompt: '只返回 claude-ready。',
});

console.log(JSON.stringify({codex: codex.data, claude: claude.data}));
