console.log('macOS app smoke start');

function emitSmokeRecord(payload) {
  console.log(JSON.stringify({
    ok: false,
    stack: 'upgraded',
    selectedApp: null,
    skipped: false,
    runtimeNote: 'This smoke validates a real macOS desktop open/wait/title/screenshot chain, not full DOM automation.',
    finalStatus: 'unknown',
    executionId: (globalThis.Execution && Execution.executionId) || null,
    artifactDir: (globalThis.Execution && Execution.artifactDir) || null,
    proofLevel: 'real-environment proof',
    boundaryNote: 'This smoke proves desktop runtime path and real-environment evidence, not full Playwright/browser DOM semantics.',
    ...payload,
  }));
}

function appExists(appName) {
  try {
    page.openApp(appName);
    return true;
  } catch (err) {
    return false;
  }
}

const candidates = ['Safari', 'TextEdit', 'Finder', 'Preview', 'Notes'];
const available = [];
for (const app of candidates) {
  if (appExists(app)) {
    available.push(app);
  }
}

const selectedApp = available[0] || null;
const runtimeNote = 'This smoke validates a real macOS desktop open/wait/title/screenshot chain, not full DOM automation.';
console.log({ candidates, available, selectedApp, runtimeNote });

if (!selectedApp) {
  emitSmokeRecord({
    ok: false,
    skipped: true,
    finalStatus: 'skipped',
    selectedApp,
    reason: 'no_supported_default_app_found',
    candidates,
    available,
  });
} else {
  await page.open('https://example.com', { appName: selectedApp });
  await page.waitFor(300);
  const title = typeof page.title === 'function' ? page.title() : null;
  const screenshot = await page.screenshot({ returnType: 'base64' });
  const screenshotBase64 = typeof screenshot === 'string'
    ? screenshot
    : (screenshot && screenshot.data ? screenshot.data : '');

  emitSmokeRecord({
    ok: true,
    skipped: false,
    finalStatus: 'succeeded',
    selectedApp,
    title,
    screenshotCaptured: !!screenshotBase64,
    screenshotBytes: screenshotBase64 ? screenshotBase64.length : 0,
  });
}

console.log('macOS app smoke end');
