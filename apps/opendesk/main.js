'use strict';

const capabilities = automation.app.getCapabilities();
if (!capabilities.enabled || !capabilities.available) {
  throw new Error('OpenDesk App Mode is unavailable: ' + JSON.stringify(capabilities));
}

const officialShellFile = File.join(Execution.scriptDir, 'official-shell.js');
(0, eval)(File.read(officialShellFile) + '\n//# sourceURL=' + officialShellFile);
if (!globalThis.OpenDeskOfficialShell || typeof OpenDeskOfficialShell.create !== 'function') {
  throw new Error('OpenDesk Official Shell did not load');
}

const officialShell = OpenDeskOfficialShell.create({
  file: File,
  command: Command,
  system: System,
  execution: Execution,
  packageRoot: Execution.scriptDir,
});
const helpAction = officialShell.getAction('opendesk.help');
const customizeAction = officialShell.getAction('opendesk.customize');

const runnerEntry = File.join(Execution.scriptDir, 'script-runner-simple.js');
(0, eval)(File.read(runnerEntry) + '\n//# sourceURL=' + runnerEntry);
const runner = globalThis.OpenDeskProductScriptRunner;
if (!runner || typeof runner.open !== 'function') {
  throw new Error('OpenDesk product Script Runner did not initialize');
}

function officialActionButton(controlId, action) {
  if (!action || !action.visible) return '';
  return `<button id="${controlId}" class="service" title="${action.title}">${action.label}</button>`;
}

const panel = await ui.createWindow({
  id: 'main',
  title: 'OpenDesk',
  position: {
    mode: 'anchor',
    size: {width: 480, height: 360},
    horizontal: 'center',
    vertical: 'center',
    display: 'primary',
  },
  content: {
    html: '<!doctype html><html><head><meta charset="utf-8"></head><body>'
      + '<main><div class="mark">OD</div><strong>OpenDesk</strong>'
      + '<p id="status">自动化运行中心已就绪。</p>'
      + '<div class="actions"><button id="openRunner" class="primary">打开 Script Runner</button>'
      + '<button id="quit">退出 OpenDesk</button></div>'
      + '<section class="official"><span>OpenDesk 服务</span><div class="service-actions">'
      + officialActionButton('officialHelp', helpAction)
      + officialActionButton('officialCustomize', customizeAction)
      + '</div></section></main></body></html>',
    css: 'html,body{height:100%;margin:0}body{display:grid;place-items:center;background:#111827;color:#f9fafb;font:14px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}'
      + 'main{width:100%;text-align:center;padding:28px}.mark{display:grid;place-items:center;width:44px;height:44px;margin:0 auto 14px;border-radius:12px;background:#e5e7eb;color:#111827;font-weight:800}'
      + 'strong{display:block;font-size:24px}p{margin:10px auto 20px;color:#cbd5e1;min-height:20px;max-width:390px}.actions,.service-actions{display:flex;justify-content:center;gap:10px;flex-wrap:wrap}'
      + 'button{border:1px solid #4b5563;border-radius:8px;padding:9px 14px;background:#1f2937;color:#f9fafb;font:inherit;font-weight:600;cursor:pointer}button:hover{background:#374151}.primary{background:#e5e7eb;color:#111827;border-color:#e5e7eb}.primary:hover{background:#f9fafb}'
      + '.official{margin:24px auto 0;padding-top:18px;border-top:1px solid #263244;max-width:390px}.official>span{display:block;margin-bottom:10px;color:#94a3b8;font-size:12px;font-weight:700;letter-spacing:.04em}.service{min-width:86px;background:#172033}',
  },
});

async function updateStatus(message) {
  try { await panel.control('status').update({text: String(message || '')}); } catch (_) {}
}

async function openRunner(source) {
  await updateStatus('正在打开 Script Runner…');
  try {
    const state = await runner.open(source || 'app');
    const count = state && state.runner ? state.runner.scriptCount : 0;
    await updateStatus(`Script Runner 已打开 · ${count || 0} 个脚本`);
    return state;
  } catch (error) {
    const message = error && error.message ? error.message : String(error);
    await updateStatus('Script Runner 打开失败：' + message);
    throw error;
  }
}

async function activateOfficialAction(actionId) {
  const action = officialShell.getAction(actionId);
  if (!action) return null;
  await updateStatus(`正在打开${action.title}…`);
  try {
    const result = await officialShell.activate(actionId);
    await updateStatus(result.message);
    console.log('OPENDESK_OFFICIAL_ACTION=' + JSON.stringify({
      actionId,
      status: result.status,
      configSource: officialShell.state().configSource,
    }));
    return result;
  } catch (error) {
    const message = error && error.message ? error.message : String(error);
    await updateStatus(`${action.title}打开失败：${message}`);
    throw error;
  }
}

panel.control('openRunner').on('click', () => openRunner('main-window'));
panel.control('quit').on('click', () => automation.app.quit());
if (helpAction && helpAction.visible) {
  panel.control('officialHelp').on('click', () => activateOfficialAction(helpAction.id));
}
if (customizeAction && customizeAction.visible) {
  panel.control('officialCustomize').on('click', () => activateOfficialAction(customizeAction.id));
}

automation.app.onAction(async event => {
  if (event.id !== 'runner.open') return;
  await openRunner(event.source || 'tray');
});

await panel.show();
console.log('OPENDESK_PRODUCT_APP_READY=' + JSON.stringify({
  executionId: Execution.id,
  packageId: capabilities.packageId,
  packageRoot: Execution.workdir,
  scriptDir: Execution.scriptDir,
  executable: System.getExecutablePath(),
  appDataRoot: globalThis.OpenDeskProductPaths.appDataRoot,
  scriptRoot: globalThis.OpenDeskProductPaths.scriptRoot,
  recipeProcessModel: 'child-opendesk-process',
  officialShell: officialShell.state(),
}));

await panel.waitUntilClosed();
