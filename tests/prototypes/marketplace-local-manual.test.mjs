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

test('manual Marketplace helper opens the main prepared prototype and reports static resources', () => {
  assert.match(helperSource, /path\.join\(runDirectory, 'site'\)/);
  assert.match(helperSource, /baseURL\}\/index\.html/);
  assert.match(helperSource, /Release: \$\{run\.releaseURL\}/);
  assert.match(helperSource, /Package: \$\{run\.artifactURL\}/);
  assert.doesNotMatch(helperSource, /baseURL\}\/local-deep-link-smoke\.html/);
});

test('manual Marketplace helper refreshes stale native code before opening the static site', () => {
  assert.match(helperSource, /scripts', 'build_macos_app\.sh'/);
  assert.match(helperSource, /currentBuildFingerprint/);
  assert.match(helperSource, /ensureCurrentBundle/);
  assert.match(helperSource, /await ensureCurrentBundle\(runDirectory\);\s*await verifyAndRegisterBundle/);
  assert.match(helperSource, /spawnSync\('\/bin\/bash', \[BUILD_SCRIPT\]/);
});

test('manual Marketplace helper retains an HTTP request evidence log outside the public site', () => {
  assert.match(helperSource, /path\.join\(runDirectory, 'http-requests\.log'\)/);
  assert.match(helperSource, /'--request-log', requestLogPath/);
  assert.match(helperSource, /HTTP request log: \$\{run\.server\.requestLog\}/);
});

test('manual Marketplace helper exposes a real cold-start receiver check and selective session cleanup', () => {
  assert.match(helperSource, /--cold-start-check/);
  assert.match(helperSource, /development session restored/);
  assert.match(helperSource, /coldStartCheck/);
  assert.match(helperSource, /DEVELOPMENT_SESSION_FILE/);
  assert.match(helperSource, /session\.configPath/);
  assert.match(helperSource, /mode: 'cold'/);
});

test('manual Marketplace run exposes development-session expiry and clears it on startup failure', () => {
  assert.match(helperSource, /developmentSession: \{sessionId: server\.ready\.sessionId, expiresAt: server\.ready\.expiresAt\}/);
  assert.match(helperSource, /Development session expires: \$\{run\.developmentSession\.expiresAt\}/);
  assert.match(helperSource, /Cold-start check: node tests\/prototypes\/tools\/marketplace-local-manual\.mjs --cold-start-check/);
  assert.match(helperSource, /sessionCleared=\$\{clearedSession\}/);
});

test('manual Marketplace cleanup binds every recorded process to its start identity', () => {
  assert.match(helperSource, /function processIdentity\(pid\)/);
  assert.match(helperSource, /expectedStartedAt && identity\.startedAt !== expectedStartedAt/);
  assert.match(helperSource, /startedAt: server\.startedAt/);
  assert.match(helperSource, /startedAt: app\.startedAt/);
  assert.match(helperSource, /startedAt: coldProcess\.startedAt/);
});


test('manual Marketplace helper makes app-data a signed-off local config input rather than an open(1) environment assumption', () => {
  assert.match(helperSource, /'--app-data-root', appData/);
  assert.doesNotMatch(helperSource, /OPENDESK_APP_DATA_DIR:\s*appData/);
});
