// Interactive native fixture, not a headless pass/fail test.
// From the repository root, using a matching, freshly built Runtime/UI host:
// ./dist/opendesk -ui -script tests/runtime-api/ui-editing-shortcuts.js -console-mode script
// Contract and manual matrix: docs/custom-ui/text-editing.md
(async function testUIEditingShortcuts() {
  'use strict';
  const capabilities = ui.getCapabilities();
  if (!capabilities.enabled || !capabilities.available) {
    throw new Error('UI editing fixture requires an authorized native UI host: ' + String(capabilities.reason || capabilities.platform));
  }
  const mac = /darwin|macos/i.test(String(capabilities.platform));
  const primary = mac ? '⌘' : 'Ctrl+';
  const shortcuts = `${primary}A 全选 · ${primary}C 复制 · ${primary}X 剪切 · ${primary}V 粘贴 · ${primary}Z 撤销`;
  const sample = 'COPY 中文 😀\nsecond line';
  const panel = await ui.createWindow({
    id: 'editingShortcuts',
    kind: 'normal',
    title: 'OpenDesk 文字编辑快捷键验收',
    position: {
      mode: 'anchor', size: {width: 720, height: 620},
      horizontal: 'center', vertical: 'center', display: 'active',
    },
    content: {
      html: `<main>
        <p class="heading"><strong>文字编辑快捷键验收</strong></p>
        <p>使用鼠标选择下方只读文本并复制，再到输入框粘贴。此窗口不会连接模型或执行桌面任务。</p>
        <p id="sample" class="sample">${sample}</p>
        <label for="titleInput">对话标题：独立检查焦点与全选范围</label>
        <input id="titleInput" value="原始标题" title="${shortcuts}" aria-label="对话标题">
        <label for="composer">消息输入框：检查剪切、粘贴、撤销、重做、中文输入法</label>
        <textarea id="composer" rows="5" title="${shortcuts}" aria-label="消息输入框">原始草稿</textarea>
        <p>先完成复制、剪切、撤销和重做，再粘贴示例文本。Enter 只换行；发送仅由按钮触发。</p>
        <div><button id="inspect">读取当前观察结果</button><button id="send">发送（仅计数）</button><button id="close">关闭</button></div>
        <p id="status">尚未验收。窗口打开不代表快捷键已经通过。</p>
      </main>`,
      css: 'body{font:14px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;margin:0}main{padding:20px}.heading{margin:0 0 12px;font-size:1.5em}p{line-height:1.5}label{display:block;margin:12px 0 6px}input,textarea{box-sizing:border-box;width:100%;font:inherit;padding:8px}textarea,.sample{white-space:pre-wrap}.sample{padding:10px;border:1px solid #888}button{margin:8px 8px 0 0;padding:8px}#status{white-space:pre-wrap}',
    },
  });
  const subscriptions = [];
  const inputs = {titleInput: 0, composer: 0};
  let sends = 0;
  let observations = 0;
  try {
    for (const id of ['titleInput', 'composer']) {
      subscriptions.push(panel.control(id).on('input', () => { inputs[id] += 1; }));
    }
    subscriptions.push(panel.control('send').on('click', async () => {
      sends += 1;
      await panel.control('status').update({text: `发送按钮计数：${sends}（未连接模型）`});
    }));
    subscriptions.push(panel.control('inspect').on('click', async () => {
      const composer = await panel.control('composer').getState();
      const title = await panel.control('titleInput').getState();
      const readonly = await panel.control('sample').getState();
      const result = {
        observation: ++observations,
        composerMatchesSample: composer.value === sample,
        titleUnchanged: title.value === '原始标题',
        readonlyUnchanged: readonly.text === sample,
        sendCount: sends,
        inputEvents: {...inputs},
        nativeShortcutsVerdict: 'manual-review-required',
      };
      // Never log clipboard contents or arbitrary user-entered text.
      console.log('UI_EDITING_OBSERVATION=' + JSON.stringify(result));
      await panel.control('status').update({text: JSON.stringify(result, null, 2)});
    }));
    subscriptions.push(panel.control('close').on('click', () => panel.close()));
    await panel.show();
    console.log('UI_EDITING_READY: manual native keyboard/menu verification required');
    await panel.waitUntilClosed();
  } finally {
    for (const off of subscriptions) off();
    await panel.close();
  }
})().catch(error => {
  console.error('UI_EDITING_ERROR=' + String(error && error.message || error));
  throw error;
});
