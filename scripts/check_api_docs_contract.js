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

let index;
try {
  index = JSON.parse(read('docs/api/runtime-api.ai.json'));
} catch (error) {
  errors.push(`docs/api/runtime-api.ai.json: invalid JSON: ${error.message}`);
}

if (index) {
  const byName = Object.fromEntries((index.globals || []).map(item => [item.name, item]));

  if (index.entrypoints?.appMode?.docs !== 'docs/api/app-shell.md') {
    errors.push('runtime-api.ai.json: appMode.docs must point to conceptual app-shell.md');
  }
  if (index.entrypoints?.appMode?.runtimeApiDocs !== 'docs/api/automation-app.md') {
    errors.push('runtime-api.ai.json: appMode.runtimeApiDocs must point to automation-app.md');
  }
  if (byName.automation?.doc !== 'automation-app.md') {
    errors.push('runtime-api.ai.json: automation canonical doc must be automation-app.md');
  }
  if (byName.ui?.doc !== 'ui.md') {
    errors.push('runtime-api.ai.json: ui canonical doc must be ui.md');
  }
  if (Object.prototype.hasOwnProperty.call(byName.ui || {}, 'toastDoc')) {
    errors.push('runtime-api.ai.json: ui.toast must not have a second toastDoc; ui.md is canonical');
  }
  if (byName.notify?.doc !== 'notify.md') {
    errors.push('runtime-api.ai.json: global notify canonical doc must be notify.md');
  }
  if (byName.Notifications?.doc !== 'notifications.md') {
    errors.push('runtime-api.ai.json: Notifications canonical doc must be notifications.md');
  }
  if (byName.FloatingWindow?.doc !== 'ui.md') {
    errors.push('runtime-api.ai.json: FloatingWindow canonical doc must be ui.md');
  }
  if (byName.LLM?.keyMethods?.[0] !== 'generate') {
    errors.push('runtime-api.ai.json: LLM.generate must precede diagnostics in keyMethods');
  }
  if (byName.Agent?.keyMethods?.[0] !== 'run') {
    errors.push('runtime-api.ai.json: Agent.run must precede diagnostics in keyMethods');
  }

  const runtimeDocs = index.documentation?.runtime || [];
  for (const required of ['capabilities.md', 'ui.md']) {
    if (!runtimeDocs.includes(required)) {
      errors.push(`runtime-api.ai.json: documentation.runtime missing ${required}`);
    }
  }
  if (runtimeDocs.includes('custom-ui.md')) {
    errors.push('runtime-api.ai.json: compatibility custom-ui.md must not be canonical runtime documentation');
  }

  const runtimeRules = index.runtimeRules || [];
  if (!runtimeRules.some(rule => rule.includes('.mjs') && rule.includes('static relative import/export'))) {
    errors.push('runtime-api.ai.json: missing current static ESM support rule');
  }
}

rejectText('docs/api/runtime-api.ai.json', 'Static/dynamic ESM loading is unsupported', 'stale all-ESM-unsupported claim');

requireText('docs/api/custom-ui.md', 'docType: compatibility');
requireText('docs/api/custom-ui.md', 'ui.toast()');

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

for (const rel of ['docs/api/agent.md', 'docs/api/llm.md']) {
  requireText(rel, 'docType: reference');
  requireText(rel, 'Capability 状态模型');
}

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
requireText('apps/opendesk/scheduler-center.js', 'INLINE_TOAST_EXAMPLE', 'canonical Scheduler Center inline template name');
requireText('apps/opendesk/scheduler-center.js', 'await ui.toast(', 'canonical ui.toast() in Scheduler Center');
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
