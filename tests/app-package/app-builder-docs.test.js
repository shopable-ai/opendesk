'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..', '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');

test('installed Runtime App Builder documentation matches the public CLI route', () => {
  const guide = read('docs/api/app-builder.md');
  const cli = read('docs/api/app-package-cli.md');
  const apiIndex = read('docs/api/index.md');
  const apiReadme = read('docs/api/README.md');
  const examplesIndex = read('examples/README.md');
  const machineIndex = JSON.parse(read('docs/api/runtime-api.ai.json'));

  const command = 'opendesk app build <package-dir> --target <macos|windows> --output <path> [--json]';
  assert.ok(guide.includes(command), 'user guide must publish the exact build command');
  assert.ok(cli.includes(command), 'CLI reference must publish the exact build command');
  assert.match(guide, /不需要 OpenDesk 源码 checkout、`make build`、`go build` 或 `go run`/);
  assert.match(guide, /OpenDeskAppBuilder\/\s+└── build-provenance\.json/);
  assert.match(guide, /app-mode\/\s+# 已验证的 my-app payload/);
  assert.match(guide, /APP_BUILD_OUTPUT_EXISTS/);
  assert.match(guide, /`opendesk package protect`、`inspect` 和 `verify`/);
  assert.match(apiIndex, /\[Installed Runtime App Builder\]\(app-builder\.md\)/);
  assert.match(apiReadme, /\[Installed Runtime App Builder\]\(app-builder\.md\)/);
  assert.match(examplesIndex, /\[Installed Runtime App Builder\]\(\.\.\/docs\/api\/app-builder\.md\)/);

  const appMode = machineIndex.entrypoints.appMode;
  assert.equal(appMode.buildCommand, command);
  assert.equal(appMode.builderDocs, 'docs/api/app-builder.md');
  assert.equal(fs.existsSync(path.join(root, appMode.builderDocs)), true);
});
