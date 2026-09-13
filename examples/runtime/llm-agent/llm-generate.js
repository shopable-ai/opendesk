'use strict';

const result = await LLM.generate({
  prompt: '用一句话说明确定性自动化为什么仍应由普通 JavaScript 控制。',
});

console.log(result.data);
