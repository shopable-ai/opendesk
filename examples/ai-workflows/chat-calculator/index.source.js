import {pressAndRead, twoStage} from './calculator.js';
import {planTask} from './planner.js';
import {
  TASK_IDS,
  buildTrustedPreview,
  freezeTaskEnvelope,
} from './task-contract.js';
import {createTaskSession} from './task-session.js';

function errorText(error) {
  if (!error) return '未知错误';
  const code = String(error.code || error.name || 'ERROR');
  return `${code}: ${String(error.message || error)}`;
}

function progressText(progress) {
  if (!progress) return '';
  const stage = progress.stage ? `（${progress.stage}）` : '';
  switch (progress.phase) {
    case 'opening': return `正在打开并检查计算器${stage}`;
    case 'clearing': return `正在清空当前计算器输入${stage}`;
    case 'click': return `正在点击 ${progress.key}${stage}`;
    case 'reading': return `正在读取计算器显示区${stage}`;
    case 'read': return `已读取真实显示值 ${progress.value}${stage}`;
    case 'starting': return '准备执行已确认任务';
    case 'stopping': return '正在停止；已提交的单次原生点击不会撤销';
    case 'stopped': return '已停止';
    case 'completed': return '已完成';
    default: return String(progress.phase || '处理中');
  }
}

async function executeEnvelope(envelope, context) {
  if (envelope.task === TASK_IDS.PRESS_AND_READ) {
    return pressAndRead({
      buttons: envelope.buttons,
      signal: context.signal,
      onProgress: context.onProgress,
    });
  }
  if (envelope.task === TASK_IDS.TWO_STAGE) {
    return twoStage({
      buttons: envelope.buttons,
      multiplier: envelope.multiplier,
      signal: context.signal,
      onProgress: context.onProgress,
    });
  }
  const error = new Error(`Unsupported task: ${envelope.task}`);
  error.code = 'UNSUPPORTED_TASK';
  throw error;
}

async function main() {
  const panel = await ui.createWindow({
    id: 'chatCalculatorP0',
    kind: 'normal',
    title: 'OpenDesk · Calculator Chat P0',
    theme: 'dark',
    bounds: {x: 160, y: 100, width: 760, height: 700},
    content: {
      html: `<!doctype html><html><head><meta charset="utf-8"></head><body>
        <main>
          <header>
            <div><strong>OpenDesk Calculator</strong></div>
            <p class="hint">Codex 只负责理解任务；执行前由 OpenDesk 校验并等待确认。</p>
          </header>
          <div class="messages"><p id="messages">可以输入：打开计算器，计算 25 乘以 4。</p></div>
          <div class="composer">
            <label for="prompt">任务</label>
            <input id="prompt" type="text" value="" placeholder="例如：先计算 25 乘以 4 加 10，再把结果乘以 6">
            <button id="send">规划</button>
          </div>
          <div class="previewCard">
            <div class="sectionTitle">可信执行预览</div>
            <p id="preview">尚未生成。确认前不会清空或点击计算器。</p>
          </div>
          <div class="statusRow">
            <span id="status">空闲</span>
            <div class="actions">
              <button id="execute" disabled>执行</button>
              <button id="cancel" disabled>取消</button>
            </div>
          </div>
        </main>
      </body></html>`,
      css: `
        :root{color-scheme:dark;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
        html,body{margin:0;height:100%;background:#101216;color:#f3f4f6}
        main{box-sizing:border-box;height:100%;padding:18px;display:grid;grid-template-rows:auto minmax(210px,1fr) auto auto auto;gap:12px}
        header{display:grid;gap:5px}header strong{font-size:19px}.hint{margin:0;color:#a8b0bd;font-size:12px}
        .messages,.previewCard{border:1px solid #303641;border-radius:12px;background:#171a20;min-height:0}
        .messages{overflow:auto}.messages p{min-height:100%;box-sizing:border-box}
        #messages,#preview{margin:0;padding:14px;white-space:pre-wrap;overflow-wrap:anywhere;font:13px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
        .composer{display:grid;grid-template-columns:auto minmax(0,1fr) auto;gap:9px;align-items:center}
        .composer label{color:#c7cdd7}.composer input,.composer button,.actions button{font:inherit}
        .composer input{min-width:0;padding:10px 12px;border:1px solid #3b4350;border-radius:9px;background:#11141a;color:#fff}
        button{padding:9px 14px;border:0;border-radius:9px;background:#3568d4;color:#fff}button:disabled{opacity:.42}
        .previewCard{max-height:185px;overflow:auto}.sectionTitle{padding:11px 14px 0;color:#9ca7b6;font-size:12px}
        .statusRow{display:flex;gap:12px;justify-content:space-between;align-items:center;color:#cbd2dc}
        .actions{display:flex;gap:8px}.actions #cancel{background:#555f6e}
      `,
    },
  });

  const messages = [];
  const renderedTransitions = new Set();
  const controls = {
    messages: panel.control('messages'),
    prompt: panel.control('prompt'),
    send: panel.control('send'),
    preview: panel.control('preview'),
    status: panel.control('status'),
    execute: panel.control('execute'),
    cancel: panel.control('cancel'),
  };

  async function appendMessage(text) {
    messages.push(String(text));
    while (messages.length > 60) messages.shift();
    await controls.messages.update({text: messages.join('\n\n')});
  }

  async function renderState(state) {
    const phase = state.phase;
    const busy = ['planning', 'running', 'stopping'].includes(phase);
    const canExecute = phase === 'awaitingConfirmation';
    const canCancel = ['planning', 'awaitingConfirmation', 'running'].includes(phase);
    await controls.send.update({disabled: busy, busy: phase === 'planning'});
    await controls.execute.update({disabled: !canExecute, busy: phase === 'running'});
    await controls.cancel.update({disabled: !canCancel});
    await controls.preview.update({
      text: state.preview || '尚未生成。确认前不会清空或点击计算器。',
    });

    let status = phase;
    if (phase === 'planning') status = 'Codex 正在理解任务…';
    else if (phase === 'awaitingConfirmation') status = '等待确认；确认前不会产生计算器桌面动作';
    else if (phase === 'running' || phase === 'stopping') status = progressText(state.progress);
    else if (phase === 'completed') status = '已完成';
    else if (phase === 'stopped') status = '已停止；可以继续提交新任务';
    else if (phase === 'clarify') status = '需要补充信息';
    else if (phase === 'unsupported') status = '当前不支持该任务';
    else if (phase === 'error') status = state.error ? `${state.error.code}: ${state.error.message}` : '任务失败';
    await controls.status.update({text: status});

    if (!state.taskId) return;
    const transitionKey = `${state.taskId}:${phase}`;
    if (renderedTransitions.has(transitionKey)) return;
    renderedTransitions.add(transitionKey);

    if (phase === 'awaitingConfirmation') {
      await appendMessage('OpenDesk：已生成受控执行预览。请检查后点击“执行”。');
    } else if (phase === 'clarify' || phase === 'unsupported') {
      await appendMessage(`OpenDesk：${state.envelope && state.envelope.message ? state.envelope.message : status}`);
    } else if (phase === 'completed') {
      const result = state.result || {};
      if (result.task === TASK_IDS.TWO_STAGE) {
        await appendMessage(`OpenDesk：第一段真实读取 ${result.firstResult}；最终真实读取 ${result.finalResult}。`);
      } else {
        await appendMessage(`OpenDesk：计算器显示区真实读取结果为 ${result.result}。`);
      }
    } else if (phase === 'stopped') {
      await appendMessage('OpenDesk：任务已停止。停止后不会提交新的桌面动作。');
    } else if (phase === 'error') {
      await appendMessage(`OpenDesk：执行失败：${state.error ? `${state.error.code}: ${state.error.message}` : '未知错误'}`);
    }
  }

  const session = createTaskSession({
    plan: (request, context) => planTask(request, {signal: context.signal}),
    preview: buildTrustedPreview,
    freeze: freezeTaskEnvelope,
    execute: executeEnvelope,
    onState: renderState,
  });

  controls.send.on('click', async () => {
    try {
      const input = await controls.prompt.getState();
      const request = String(input.value || '').trim();
      if (!request) {
        await controls.status.update({text: '请输入计算任务。'});
        return;
      }
      await appendMessage(`你：${request}`);
      await session.submit(request);
    } catch (error) {
      await appendMessage(`OpenDesk：${errorText(error)}`);
      await controls.status.update({text: errorText(error)});
    }
  });

  controls.prompt.on('input', async () => {
    try {
      await session.invalidateConfirmation('输入已修改；旧执行预览和确认已失效，请重新规划。');
    } catch (error) {
      if (!error || error.code !== 'SESSION_CLOSED') console.warn('[chat-calculator] input invalidation failed:', errorText(error));
    }
  });

  controls.execute.on('click', async () => {
    try {
      const state = session.snapshot();
      if (!state.taskId) return;
      await session.confirm(state.taskId);
    } catch (error) {
      await appendMessage(`OpenDesk：${errorText(error)}`);
      await controls.status.update({text: errorText(error)});
    }
  });

  controls.cancel.on('click', async () => {
    try {
      await session.cancel();
    } catch (error) {
      await appendMessage(`OpenDesk：${errorText(error)}`);
    }
  });

  const unsubscribeClose = panel.on('close', async () => {
    await session.close();
  });

  await panel.show();
  try {
    await panel.waitUntilClosed();
  } finally {
    unsubscribeClose();
    await session.close();
  }
}

await main();
