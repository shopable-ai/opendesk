'use strict';

const result = await Agent.run({
  backend: 'claude-code',
  prompt: '返回一句简短的任务确认。',
});

console.log(result.data);
