#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
const errors = [];

const requireText = (rel, needle, description = needle) => {
  const text = read(rel);
  if (!text.includes(needle)) errors.push(`${rel}: missing ${description}`);
};

const rejectText = (rel, needle, description = needle) => {
  const text = read(rel);
  if (text.includes(needle)) errors.push(`${rel}: forbidden ${description}`);
};

const requireBefore = (rel, first, second, description = `${first} before ${second}`) => {
  const text = read(rel);
  const firstIndex = text.indexOf(first);
  const secondIndex = text.indexOf(second);
  if (firstIndex < 0 || secondIndex < 0 || firstIndex >= secondIndex) {
    errors.push(`${rel}: expected ${description}`);
  }
};

// 直接检查当前正式资料；退役机器索引不再是契约或预期值来源。
requireText('docs/api/app-shell.md', '[automation.app API](automation-app.md)', 'App Mode guide -> automation.app Reference');
requireText('docs/api/automation-app.md', '[App Mode 与 App Shell](app-shell.md)', 'automation.app Reference -> App Mode guide');
requireText('docs/api/automation-app.md', '## automation.app.onAction(handler)');
requireText('docs/api/automation-app.md', '## automation.app.updateMenuItem(id, patch)');
requireText('docs/api/automation-app.md', '## automation.app.quit()');
requireText('docs/api/automation-app.md', '## automation.app.getCapabilities()');
requireBefore(
  'docs/api/automation-app.md',
  '## automation.app.onAction(handler)',
  '## automation.app.getCapabilities()',
  'automation.app business methods before getCapabilities() diagnostic method',
);

requireText('docs/api/recorder-runtime.md', '## Recorder.start(options)');
requireText('docs/api/recorder-runtime.md', '## Recorder.getCapabilities()');
requireText('docs/api/ui.md', '## new FloatingWindow(options?)', 'FloatingWindow canonical constructor in ui.md');

requireText('docs/api/runtime.md', '静态相对 `import` / `export`', 'static relative ESM support');
requireText('docs/api/runtime.md', '当前 P0 **不承诺**任意运行时 `import()`', 'runtime import() remains unsupported');
rejectText('docs/api/runtime.md', 'Static/dynamic ESM loading is unsupported', 'stale all-ESM-unsupported claim');

requireText('docs/api/scheduler.md', 'docType: guide');
requireText('docs/api/scheduler.md', 'scheduler-api.md');
requireText('docs/api/scheduler.md', 'scheduler-runtime-concurrency.md');
rejectText('docs/api/scheduler.md', 'modernc.org/sqlite', 'SQLite driver implementation detail in user guide');
rejectText('docs/api/scheduler.md', 'scheduled_jobs', 'internal table name in user guide');
rejectText('docs/api/scheduler.md', 'job_runs', 'internal table name in user guide');
requireText('docs/api/scheduler-api.md', 'docType: protocol');

requireText('docs/api/.rules.md', 'runtime-capability-contract.md');
requireText('docs/api/capabilities.md', 'available: null');

requireText('docs/api/ui.md', 'docType: reference');
requireText('docs/api/ui.md', '## ui.toast(messageOrOptions)');
requireText('docs/api/ui.md', '## ui.notify(messageOrOptions)');
requireText('docs/api/ui.md', '## ToastHandle.update(patch)');
rejectText('docs/api/ui.md', '## NotificationHandle.update(patch)', 'legacy handle as canonical H2');

// Window-scoped text sequences must keep the required action sequence visible.
// `within` is a resolved WindowInfo scope, not a replacement for `texts` and
// not another place to accept WindowTarget selector fields.
const tapTextsSignature = 'UI.tapTexts(texts: string[], options?: OpenDeskUITapTextsOptions)';
const tapTextsFlow = 'UI.tapTexts(texts, { within: win, ...textOptions })';
const windowTargetFlow = [
  'Recipe / 部署参数',
  '→ 一个 OpenDeskWindowTarget',
  '→ window.wait()',
  '→ 一个 OpenDeskWindowInfo',
  `→ ${tapTextsFlow}`,
].join('\n');
const tapTextsExample = 'await UI.tapTexts(["2", "5", "×", "4", "="], { within: win, match: "exact" });';
requireText('docs/api/desktop-ui.md', tapTextsSignature, 'complete UI.tapTexts signature');
requireText('types/UI.d.ts', 'tapTexts(texts: string[], options?: OpenDeskUITapTextsOptions)', 'complete UI.tapTexts type');
for (const rel of ['docs/api/window.md', 'examples/desktop/README.md']) {
  requireText(rel, windowTargetFlow, 'one-target WindowTarget to UI.tapTexts flow');
  rejectText(rel, 'UI.tapTexts({ within: win })', 'options-only UI.tapTexts pseudo-call');
}
for (const rel of ['docs/api/desktop-ui.md', 'docs/api/window.md', 'examples/desktop/README.md']) {
  requireText(rel, tapTextsExample, 'complete Calculator UI.tapTexts example');
}

// Notification ownership: ui.md exclusively owns Toast, notify.md exclusively
// owns global notify(), and notifications.md owns the inbound Notifications API.
requireText('docs/api/notify.md', 'docType: reference');
requireText('docs/api/notify.md', '## notify(messageOrOptions)');
requireText('docs/api/notify.md', '本页不重复 Toast 参数、句柄、位置或进度契约');
rejectText('docs/api/notify.md', '## ui.toast(', 'duplicate ui.toast Reference in notify.md');
rejectText('docs/api/notify.md', '## ui.notify(', 'duplicate ui.notify Reference in notify.md');
rejectText('docs/api/notify.md', '## ToastHandle', 'duplicate ToastHandle Reference in notify.md');

requireText('docs/api/notifications.md', 'docType: reference');
requireText('docs/api/notifications.md', '## Notifications.getCapabilities()');
requireText('docs/api/notifications.md', '## Notifications.list(options?)');
requireText('docs/api/notifications.md', '## Notifications.waitFor(options?)');
requireText('docs/api/notifications.md', '## Notifications.dismiss(target)');
requireBefore(
  'docs/api/notifications.md',
  '## Notifications.list(options?)',
  '## Notifications.getCapabilities()',
  'Notifications.list() business method before getCapabilities() diagnostic method',
);

for (const rel of ['docs/api/agent.md', 'docs/api/llm.md']) {
  requireText(rel, 'docType: reference');
  requireText(rel, 'Capability 状态模型');
}
requireBefore(
  'docs/api/agent.md',
  '## Agent.run()',
  '## Agent.getCapabilities()',
  'Agent.run() business method before getCapabilities() diagnostic method',
);
requireBefore(
  'docs/api/llm.md',
  '## LLM.generate()',
  '## LLM.getCapabilities()',
  'LLM.generate() business method before getCapabilities() diagnostic method',
);

// Public entry docs must preserve the current product/runtime layering. The
// installed desktop product owns bundled App Mode; explicit -http is a
// separate headless integration mode and must not become the desktop model.
requireText('README.md', '`-http` 是显式的 headless / integration 模式', 'explicit HTTP-vs-Desktop boundary');
rejectText('README.md', '没有业务窗口\n和没有 Dock 图标是此后台服务的正常状态', 'obsolete background-only macOS App model');
requireText('QUICKSTART.md', 'OpenDesk Desktop != -http', 'Desktop/App Mode layering rule');
requireText('QUICKSTART.md', 'OpenDesk.app/Contents/Resources/AppMode/', 'bundled App Mode payload path');
rejectText('QUICKSTART.md', '它的主要入口不是业务操作窗口', 'obsolete background-only Desktop entry model');

// Official product code, product-maintainer docs and examples must teach the
// canonical API. Compatibility aliases remain available for existing user
// scripts, but new first-party sources must not reintroduce them.
requireText('apps/opendesk/script-runner-simple.js', 'runtimeUI.toast(', 'canonical ui.toast() in product shell');
rejectText('apps/opendesk/script-runner-simple.js', 'runtimeUI.notify(', 'ui.notify() compatibility alias in product shell');
// 内联示例现位于真实脚本输入框，不再依赖已移除的模板常量名。
requireText('apps/opendesk/scheduler-center.js', 'id="createInlineScript"', 'Scheduler Center inline script input');
requireText('apps/opendesk/scheduler-center.js', 'await ui.toast(', 'canonical ui.toast() in Scheduler Center');
requireText('apps/opendesk/scheduler-center.js', 'await notice.waitUntilClosed();', 'inline toast lifecycle in Scheduler Center');
rejectText('apps/opendesk/scheduler-center.js', 'ui.notify', 'ui.notify compatibility alias in Scheduler Center');
requireText('apps/opendesk/README.md', 'uses `ui.toast()`', 'canonical ui.toast() in product maintainer docs');
rejectText('apps/opendesk/README.md', 'uses `ui.notify()`', 'ui.notify() compatibility alias in product maintainer docs');
requireText('examples/scheduler/notify-and-log.js', 'await ui.toast(', 'canonical ui.toast() in Scheduler example');
rejectText('examples/scheduler/notify-and-log.js', 'await ui.notify(', 'ui.notify() compatibility alias in Scheduler example');

if (errors.length > 0) {
  for (const error of errors) console.error(`API_DOC_CONTRACT_ERROR ${error}`);
  process.exit(1);
}

console.log('API_DOC_CONTRACT_OK');
