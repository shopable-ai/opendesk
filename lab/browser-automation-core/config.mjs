import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const SOURCE = path.join(ROOT, 'lab/browser-automation-core');
export const STATE = path.join(ROOT, '.runtime/browser-core');
// Permanent user-level installation, separate from generated staging/evidence in .runtime.
export const PRIVATE_INSTALL = path.join(os.homedir(), 'Library/Application Support/OpenDesk/browser-core-demo',
  crypto.createHash('sha256').update(ROOT).digest('hex').slice(0, 12));
export const EVIDENCE = path.join(ROOT, '.runtime/tests/browser-automation-core');
export const HOST_NAME = 'org.opendesk.browser_core_demo';
export const EXTENSION_ID = 'jpjgepfbapojijlabljgdpbhfmiapkin';
export const ORIGIN = `chrome-extension://${EXTENSION_ID}/`;
export const SOCKET = path.join(PRIVATE_INSTALL, 'broker.sock');
export const LIMITS = Object.freeze({
  version: 1, maxMessageBytes: 65536, maxPending: 32, maxQueue: 16,
  maxEvents: 128, defaultTimeoutMs: 5000, maxTimeoutMs: 15000,
  authTimeoutMs: 2000, handshakeTimeoutMs: 5000, maxConnections: 48, maxTraceBytes: 16 * 1024 * 1024, maxRequestsPerSession: 4096,
  reconnectPollMs: 100, reconnectDeadlineMs: 45000,
  maxTargets: 512, maxTrackedTabs: 64, maxFramesPerTab: 24, maxObserveElements: 24,
  maxScanNodes: 2048, maxTextChars: 128, cancelDeadlineMs: 1000,
  minTimeoutMs: 10, maxClientPending: 33, clientResponseGraceMs: 1000,
  maxFillChars: 4096, maxQueryChars: 200, maxUrlChars: 512,
  deadlineToleranceMs: 250, visualDeadlineMs: 60000,
  maxNativeDiagnostics: 16,
});
export function loadInstall() {
  const record = JSON.parse(fs.readFileSync(path.join(STATE, 'install.json'), 'utf8'));
  if (record.kind !== 'installed-native-pointer') return record; // Legacy setup migration only.
  if (record.installFile !== path.join(PRIVATE_INSTALL, 'install.json') || record.sourceDirectory !== SOURCE) {
    throw Object.assign(new Error('INSTALL_POINTER_MISMATCH'), {code: 'INSTALL_POINTER_MISMATCH'});
  }
  return JSON.parse(fs.readFileSync(record.installFile, 'utf8'));
}
