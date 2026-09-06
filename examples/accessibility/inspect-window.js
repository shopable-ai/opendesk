// Run from the repository root after launch.js has started the owned fixture:
// ./dist/opendesk -script examples/accessibility/inspect-window.js -console-mode script

const EXAMPLE_TIMEOUT_MS = 10000;
const STALE_TARGET_RETRY_DELAY_MS = 100;
const MAX_STALE_TARGET_RETRIES = 1;
const exampleRoot = String(Execution.workdir || File.cwd());
const fixtureTarget = (0, eval)(File.read(File.join(exampleRoot, 'examples', 'accessibility', 'lib', 'fixture-target.js')));

function requireAccessibility() {
  const capabilities = Accessibility.getCapabilities();
  if (!capabilities.hostAuthorization.enabled) throw new Error('Accessibility is not enabled for this execution');
  if (!capabilities.implementation.available) throw new Error('The native Accessibility backend is unavailable');
  if (!capabilities.permission.granted) throw new Error('The native Accessibility permission is not granted');
  return capabilities;
}

async function exactTargetWindow() {
  return fixtureTarget.window({ autoLaunch: true });
}

function snapshotOptions(within) {
  return {
    within,
    timeout: EXAMPLE_TIMEOUT_MS,
    maxDepth: 4,
    maxNodes: 300,
    properties: [
      'role', 'nativeRole', 'name', 'identifier', 'enabled', 'focused',
      'selected', 'checked', 'expanded', 'actions', 'nativeBounds', 'bounds',
    ],
  };
}

function sameWindowIdentity(before, after) {
  return !!after && before.id === after.id && Number(before.pid) === Number(after.pid) &&
    Number(before.handle) === Number(after.handle) && before.exePath === after.exePath;
}

async function snapshotReviewedFixture(session) {
  let within = session.window;
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await Accessibility.snapshot(snapshotOptions(within));
    } catch (error) {
      if (!error || error.code !== 'STALE_TARGET' || attempt >= MAX_STALE_TARGET_RETRIES ||
          fixtureTarget.hasExplicitTarget()) {
        throw error;
      }
      // This is a fixture-only, read-only readiness retry.  Re-read the
      // checked-out receipt and refuse to follow a recreated window.
      await sleep(STALE_TARGET_RETRY_DELAY_MS);
      const refreshed = await fixtureTarget.window();
      if (!sameWindowIdentity(session.window, refreshed.window)) {
        throw new Error('the repository-owned fixture identity changed while waiting for Accessibility readiness');
      }
      within = refreshed.window;
    }
  }
}

async function main() {
  const capabilities = requireAccessibility();
  const session = await exactTargetWindow();
  let failure = null;
  try {
    const result = await snapshotReviewedFixture(session);
    console.log('[ACCESSIBILITY-INSPECT] ' + JSON.stringify({
      requestId: result.requestId,
      backend: result.backend,
      available: capabilities.available,
      complete: result.complete,
      truncated: result.truncated,
      reason: result.reason,
      stats: result.stats,
      root: result.root ? {
        role: result.root.role,
        nativeRole: result.root.nativeRole,
        childCount: result.root.children.length,
      } : null,
    }));
  } catch (error) {
    failure = error;
    throw error;
  } finally {
    if (session.startedByExample) {
      try {
        await fixtureTarget.stopFixture();
      } catch (error) {
        if (!failure) throw error;
      }
    }
  }
}

await main();
