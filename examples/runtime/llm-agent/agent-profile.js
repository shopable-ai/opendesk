'use strict';

// Configure this named Profile in OPENDESK_AGENT_CONFIG before running.
const result = await Agent.run({
  profile: 'team-codex',
  prompt: '返回一句简短的任务确认。',
});

console.log(result.data);
