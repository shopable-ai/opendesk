const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '../..');
const page = fs.readFileSync(path.join(root, 'apps/opendesk/prototypes/marketplace/index.html'), 'utf8');
const smoke = fs.readFileSync(path.join(root, 'apps/opendesk/prototypes/marketplace/local-deep-link-smoke.html'), 'utf8');
const server = fs.readFileSync(path.join(root, 'tests/prototypes/tools/marketplace-local-server.mjs'), 'utf8');
const notifyDemo = fs.readFileSync(path.join(root, 'examples/flow-distribution/notify-demo/main.js'), 'utf8');

test('canonical prototype contains one generated static-release binding seam', () => {
  assert.equal((page.match(/OPENDESK_LOCAL_RELEASE_BINDING/g) || []).length, 1);
  assert.equal((smoke.match(/OPENDESK_LOCAL_RELEASE_BINDING/g) || []).length, 1);
  assert.match(page, /localRelease\.catalogItem/);
  assert.match(server, /id: 'notify-demo'/);
});

test('real local install is scoped only to the generated Notify Demo catalog item', () => {
  assert.match(page, /data-action="install"\]\[data-id="/);
  assert.match(page, /binding\.catalogId/);
  assert.doesNotMatch(page, /querySelectorAll\('button\[data-action="install"\]'\)/);
});

test('browser never polls or infers installation success', () => {
  assert.doesNotMatch(page, /local-smoke\/status|readInstallStatus|startPolling|maxStatusChecks/);
  assert.doesNotMatch(smoke, /local-smoke\/status|visibilitychange|window\.blur/);
  assert.match(page, /已请求打开 OpenDesk，请在应用中完成安装/);
  assert.match(smoke, /网页不推断结果/);
});

test('default generated deep link remains identifier-only without download parameter', () => {
  assert.match(server, /opendesk:\/\/install\/flow/);
  assert.doesNotMatch(server, /[?&]download=/);
});

test('static site owns release and artifact files instead of dynamic business routes', () => {
  assert.match(server, /release\.json/);
  assert.match(server, /notify-demo\.odflow/);
  assert.doesNotMatch(server, /local-smoke\/status/);
});


test('Notify Demo business entrypoint remains OpenDesk Runtime JavaScript, not Node.js tool code', () => {
  assert.match(notifyDemo, /ui\.getCapabilities\(\)/);
  assert.match(notifyDemo, /await ui\.toast\(/);
  assert.doesNotMatch(notifyDemo, /\brequire\s*\(|\bprocess\.|\bchild_process\b|\bnode:|\bfs\.|\bpath\./);
});
