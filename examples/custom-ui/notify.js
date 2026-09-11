// From the repository root:
// ./dist/opendesk -ui -script examples/custom-ui/notify.js -console-mode script
// Windows: .\dist\opendesk.exe -ui -script examples/custom-ui/notify.js -console-mode script
// Historical filename retained for compatibility; the public API is ui.toast().
'use strict';
const toast = await ui.toast({message: '准备执行示例任务', timeoutMs: 0, closable: true});
try {
  for (let step = 1; step <= 5; step++) {
    await toast.update({message: `第 ${step} / 5 步 · 演示状态更新`, caption: '此示例不操作其他应用', progress: {min: 0, max: 5, value: step - 1}});
    await new Promise(resolve => setTimeout(resolve, 700));
  }
  await toast.update({message: '示例完成', level: 'success', progress: {min: 0, max: 5, value: 5}, timeoutMs: 1500, timeoutProgress: true});
  await toast.waitUntilClosed();
} finally { await toast.close(); }
