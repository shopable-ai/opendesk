const helper = {};
const common = File.read('tests/locateanything/scripts/common.js');

if (!common) throw new Error('missing tests/locateanything/scripts/common.js');
new Function('shared', common)(helper);

const config = helper.loadLocateAnythingConfig();
const outputRoot = `${config.artifactRoot}/stage_03b_browser_smoke`;
const summaryPath = `${outputRoot}/summary.json`;
const reportPath = `${config.stageReportRoot}/STAGE_03B_BROWSER_SMOKE_REPORT.md`;

async function findSafariWindow() {
  const windows = await window.list();
  return (windows || []).find((item) => {
    const exe = String(item?.exeName || '').toLowerCase();
    const title = String(item?.title || '').toLowerCase();
    return exe.includes('safari') || title.includes('safari');
  }) || null;
}

async function bringSafariToFront(win) {
  if (!win?.title) return null;
  await window.bringToTop(win.title, win.processId || win.pid || 0);
  await page.waitFor(900);
  return window.getActiveWindow();
}

async function captureWindow(win, label) {
  const path = `.runtime/temp/mac/${label}_${Date.now()}.png`;
  const clip = {
    x: 0,
    y: 0,
    width: Number(win.width || 0),
    height: Number(win.height || 0),
  };
  await page.screenshot({ path, target: 'activeWindow', clip });
  return path;
}

await helper.ensureDir(outputRoot);
await helper.ensureDir('.runtime/temp/mac');

const health = await helper.healthCheck(config.serviceUrl, config.requestTimeoutMs);
if (!health.ok) {
  throw new Error(`LocateAnything bridge health check failed for ${config.serviceUrl}: ${health.error || 'unknown error'}`);
}

await page.ensureMacPermissions({
  openSettingsOnFail: false,
  section: 'screenCapture',
  strict: true,
});

await page.openURLInApp('Safari', 'https://example.com');
await page.waitFor(5200);

const safariWindow = await findSafariWindow();
if (!safariWindow) {
  throw new Error('Safari window not found after openURLInApp');
}
const activeWindow = await bringSafariToFront(safariWindow);
const capturePath = await captureWindow(activeWindow || safariWindow, 'locateanything_browser_smoke');

const textResponse = await helper.callBridge(config, {
  ...(await helper.buildBridgeImagePayload(capturePath)),
  task: 'text',
  phrase: 'Example Domain',
  profile: 'quality',
});

const addressBarResponse = await helper.callBridge(config, {
  ...(await helper.buildBridgeImagePayload(capturePath)),
  task: 'gui_box',
  phrase: 'the browser address bar',
  profile: 'quality',
});

const summary = {
  stage: 'stage_03b_browser_smoke',
  generatedAt: new Date().toISOString(),
  serviceUrl: config.serviceUrl,
  health,
  browser: 'Safari',
  targetUrl: 'https://example.com',
  activeWindow,
  safariWindow,
  capturePath,
  textResponse,
  addressBarResponse,
  checks: {
    safariFrontmost: /safari/i.test(String(activeWindow?.exeName || '')),
    titleLooksRight: /Example Domain/i.test(String(activeWindow?.title || safariWindow?.title || '')),
    textGrounded: Array.isArray(textResponse?.boxes) && textResponse.boxes.length > 0,
    addressBarGrounded: Array.isArray(addressBarResponse?.boxes) && addressBarResponse.boxes.length > 0,
  }
};
summary.ok = Boolean(
  summary.checks.safariFrontmost &&
  (summary.checks.titleLooksRight || summary.checks.textGrounded || summary.checks.addressBarGrounded)
);

await File.write(summaryPath, JSON.stringify(summary, null, 2));

const lines = [
  '# Stage 03B Browser Smoke Report',
  '',
  `- Generated at: ${summary.generatedAt}`,
  `- Service URL: \`${summary.serviceUrl}\``,
  `- Bridge backend: \`${summary.health?.data?.backend || 'unknown'}\``,
  `- Browser: \`${summary.browser}\``,
  `- Target URL: \`${summary.targetUrl}\``,
  `- Capture: \`${summary.capturePath}\``,
  `- Frontmost Safari: \`${summary.checks.safariFrontmost}\``,
  `- Title looks right: \`${summary.checks.titleLooksRight}\``,
  `- LocateAnything text grounded: \`${summary.checks.textGrounded}\``,
  `- LocateAnything address bar grounded: \`${summary.checks.addressBarGrounded}\``,
  `- Overall: \`${summary.ok ? 'PASS' : 'FAIL'}\``,
  '',
  '## Responses',
  '',
  `- text response saved in: \`${summaryPath}\``,
];
await File.write(reportPath, lines.join('\n'));
console.log(JSON.stringify(summary, null, 2));
