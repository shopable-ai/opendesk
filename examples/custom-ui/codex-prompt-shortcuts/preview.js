// From the repository root:
// ./dist/OpenDesk.app/Contents/MacOS/opendesk -ui -script examples/custom-ui/codex-prompt-shortcuts/preview.js -console-mode script -log-dir .runtime/examples/custom-ui/codex-prompt-shortcuts-preview
// Appearance-only example: no external app/window access, prompt library,
// clipboard, keyboard input, or business callbacks. Uses the native component
// used by main.js; it does not implement a second prompt manager.
const toolbar = new FloatingWindow({
  title: 'OpenDesk 提示词预览', orientation: 'vertical',
  alwaysOnTop: true, draggable: true,
  position: {mode: 'absolute', x: 420, y: 240}
});

for (const [id, text, label] of [
  ['review', '审阅', '审阅当前改动，核对错误处理与边界情况'],
  ['fix', '修复', '修复问题后报告验证结果与剩余风险'],
  ['plan', '计划', '先制定执行计划，再逐项实施并验证'],
  ['next', '下一', '预览下一组按钮的提示；当前窗口只演示外观'],
  ['manage', '管理', '独立外观预览；提示词管理请使用完整示例']
]) toolbar.addButton(id, label, {text});

const state = await toolbar.show();
if (!state.visible || !state.onScreen || !state.hostPid || !state.nativeWindowId) {
  await toolbar.close();
  throw new Error('Preview window did not become visible');
}
console.log('CODEX_SHORTCUT_PREVIEW_READY=' + JSON.stringify({
  scope: 'OWN_WINDOW_MANUAL_PREVIEW_ONLY', state,
  instructions: '悬停查看提示；拖动顶部移动；点击原生关闭按钮退出。按钮不执行操作。'
}));
await toolbar.waitUntilClosed();
console.log('CODEX_SHORTCUT_PREVIEW_CLOSED');
