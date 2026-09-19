import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {fileURLToPath} from 'node:url';
import {isCurrentOpenDeskAppModeCommand, isManualRunDirectory} from './tools/marketplace-local-manual.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const manualRoot = path.join(root, '.runtime', 'tests', 'marketplace');
const helperSource = fs.readFileSync(path.join(root, 'tests', 'prototypes', 'tools', 'marketplace-local-manual.mjs'), 'utf8');

test('manual Marketplace cleanup accepts only a direct recorded manual run directory', () => {
  assert.equal(isManualRunDirectory(path.join(manualRoot, 'manual-20260919T173500Z')), true);
  assert.equal(isManualRunDirectory(path.join(manualRoot, 'manual-20260919T173500Z', 'nested')), false);
  assert.equal(isManualRunDirectory(path.join(manualRoot, 'not-manual')), false);
  assert.equal(isManualRunDirectory('/tmp/manual-20260919T173500Z'), false);
});

test('manual Marketplace startup recognizes a shared App Mode process through the stable dist symlink', () => {
  assert.equal(isCurrentOpenDeskAppModeCommand('./dist/opendesk -app apps/opendesk -console-mode script', root), true);
  assert.equal(isCurrentOpenDeskAppModeCommand('/tmp/opendesk -app /tmp/apps/opendesk', '/tmp'), false);
  assert.equal(isCurrentOpenDeskAppModeCommand('./dist/opendesk-mcp', root), false);
});

test('receiver diagnostics do not share the App Mode execution stderr path', () => {
  assert.match(helperSource, /path\.join\(runDirectory, 'receiver\.log'\)/);
  assert.match(helperSource, /path\.join\(runDirectory, 'app-runtime'\)/);
  assert.doesNotMatch(helperSource, /path\.join\(runDirectory, 'app-runtime', 'stderr\.log'\)/);
});

test('local server survives after the one-shot helper exits', () => {
  assert.match(helperSource, /detached:\s*true,\s*stdio:\s*\['ignore', 'pipe', 'pipe'\]/);
});
