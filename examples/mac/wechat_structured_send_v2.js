const entry = File.read('examples/mac/wechat_steps/main.js');
if (!entry) {
  throw new Error('缺少入口脚本: examples/mac/wechat_steps/main.js');
}

await eval(`(async () => {
${entry}
})()`);
