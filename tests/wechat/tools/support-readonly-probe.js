// Repository root: ./scripts/run_macos_stable.sh -script tests/wechat/tools/support-readonly-probe.js -console-mode script
// One observation, no input, no Provider, no React events. Default: metadata only.
// A short-lived local grant is required before reading an entire test window.
const configPath = System.getEnv('OPENDESK_WECHAT_PROBE_CONFIG');
const config = configPath ? await File.readJSON(configPath, {maxBytes: 16384}) : {};
const report = {
  schemaVersion: 1, at: new Date().toISOString(), mode: 'metadata',
  readOnly: true, contentReadAttempted: false, contentRetained: false,
  bindingAccepted: false, providerReady: false,
  fields: Object.fromEntries(['application', 'process', 'window', 'sessionIdentity',
    'messageBody', 'messageRole', 'messageOrder', 'messageIdentity'].map(key =>
    [key, {status: 'UNAVAILABLE', coverage: 'NOT_TESTED', reason: 'No authorized live observation'}])),
};
// Tokens describe equality within this single report only. Never customer/message IDs.
const tokens = new Map();
function redact(value) {
  if (Array.isArray(value)) return value.map(redact);
  if (!value || typeof value !== 'object') return value;
  const out = {};
  for (const [key, item] of Object.entries(value)) {
    if (['name', 'value', 'identifier', 'title'].includes(key) && item != null && item !== '') {
      if (!tokens.has(item)) tokens.set(item, 'redacted-' + (tokens.size + 1));
      out[key] = tokens.get(item);
    } else out[key] = redact(item);
  }
  return out;
}
function verified(key, reason) {
  report.fields[key] = {status: 'VERIFIED', coverage: 'OBSERVED', reason};
}
function failure(code, operation) {
  throw Object.assign(new Error(code), {code, operation});
}
function sameWindow(a, b) {
  return !!b && a.pid === b.pid && a.exePath === b.exePath && a.handle === b.handle &&
    b.isForeground === true && b.hasFocus === true;
}
try {
  if (!config || typeof config !== 'object' || Array.isArray(config) ||
      !['metadata', 'ax', undefined].includes(config.mode)) failure('INVALID_CONFIG', 'probe.config');
  report.capabilities = Accessibility.getCapabilities();
  const app = App.get({bundleId: 'com.tencent.xinWeChat'});
  if (!app) {
    report.outcome = 'APP_NOT_RUNNING';
  } else {
    if (app.bundleId !== 'com.tencent.xinWeChat') failure('APP_IDENTITY_MISMATCH', 'probe.app');
    verified('application', 'Runtime matched the exact registered WeChat bundle ID');
    report.application = {bundleId: app.bundleId, path: app.path, pids: app.pids};
    // WeChat 4.1.10 registers nested helper processes in this group too.
    // The installed Info.plist names WeChat as CFBundleExecutable; never pick pids[0].
    const instances = app.instances.filter(item =>
      item.executablePath === app.path + '/Contents/MacOS/WeChat' && app.pids.includes(item.pid));
    if (instances.length !== 1) {
      failure('AMBIGUOUS_PROCESS', 'probe.app');
    }
    const instance = instances[0];
    const target = {pid: instance.pid, exePath: instance.executablePath};
    report.target = target;
    verified('process', 'One registered instance with its actual executable path');
    const before = await window.getAppWindow(target);
    if (!before) {
      report.outcome = 'NO_FOREGROUND_WECHAT_WINDOW';
    } else {
      report.window = redact(before);
      verified('window', 'App-scoped foreground native window; this is not a chat identity');
      report.outcome = 'METADATA_ONLY';
      if (config.mode === 'ax') {
        report.mode = 'ax';
        const grant = config.authorization;
        const now = Date.now();
        if (!grant || grant.scope !== 'entire-test-window' || grant.pid !== target.pid ||
            grant.exePath !== target.exePath || grant.windowId !== before.handle ||
            !Number.isSafeInteger(grant.expiresAt) || grant.expiresAt <= now ||
            grant.expiresAt > now + 60000 ||
            typeof grant.testSessionLabel !== 'string' || !grant.testSessionLabel.trim()) {
          failure('TEST_WINDOW_AUTHORIZATION_REQUIRED', 'probe.authorization');
        }
        // Reserve the full native deadline plus a margin before starting. Native calls
        // cannot be forcibly canceled; expiry is not an OS-enforced revocation boundary.
        const remaining = grant.expiresAt - Date.now();
        if (remaining < 3500) failure('TEST_WINDOW_AUTHORIZATION_EXPIRING', 'probe.authorization');
        report.contentReadAttempted = true;
        const snapshot = await Accessibility.snapshot({within: before, timeout: Math.min(3000, remaining - 500),
          maxDepth: 32, maxNodes: 1500,
          properties: ['role', 'nativeRole', 'nativeSubrole', 'name', 'identifier', 'value',
            'selected', 'bounds']});
        const after = await window.getAppWindow(target);
        // Reject late, incomplete and changed-window observations. Never emit business events.
        if (Date.now() >= grant.expiresAt || !sameWindow(before, after)) {
          failure('OBSERVATION_INVALIDATED', 'probe.revalidate');
        }
        if (snapshot.complete !== true || snapshot.truncated || !snapshot.root) {
          report.snapshotSummary = {complete: snapshot.complete, truncated: snapshot.truncated,
            reason: snapshot.reason, stats: snapshot.stats, requestId: snapshot.requestId};
          failure('INCOMPLETE_AX_TREE', 'probe.snapshot');
        }
        report.contentRetained = config.retainAuthorizedTestContent === true;
        report.snapshot = report.contentRetained ? snapshot : redact(snapshot);
        report.outcome = 'AX_CANDIDATE_REQUIRES_INDEPENDENT_REVIEW';
        // A complete tree can contain only window chrome. Do not assume it has chat fields.
        report.axTree = {status: 'CANDIDATE', reason: 'Captured tree requires independent field review'};
      }
    }
  }
} catch (error) {
  report.outcome = 'ERROR';
  report.error = Object.fromEntries(['code', 'operation', 'backend', 'phase', 'requestId', 'actionState']
    .filter(key => typeof error?.[key] === 'string').map(key => [key, error[key]]));
  if (!report.error.code) report.error.code = 'UNCLASSIFIED_ERROR';
  // No arbitrary exception message or rejected snapshot in logs.
}
const output = '.runtime/tests/ai-customer-support/r24/probe-' + Date.now() + '.json';
await File.writeJSON(output, report);
console.log(JSON.stringify({probe: 'wechat-support-r24', output, outcome: report.outcome,
  readOnly: report.readOnly, contentReadAttempted: report.contentReadAttempted,
  bindingAccepted: false, providerReady: false}));
