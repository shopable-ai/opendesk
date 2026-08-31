console.log('screenshot permission preflight...');

const report = await page.checkScreenshotPermissions();
console.log('permission report:', JSON.stringify(report, null, 2));

if (!report.ok) {
  console.log('permission not ready, open system settings pages...');
  await page.openURL('x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility');
  await page.waitFor(1200);
  await page.openURL('x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture');
  await page.waitFor(1200);
  await page.openURL('x-apple.systempreferences:com.apple.preference.security?Privacy_Automation');
  console.log('please grant permissions for Clawdesk.app, or for the current shell host if you are debugging from the command line, then rerun.');
}

const active = await window.getActiveWindow();
if (!active || active.width <= 0 || active.height <= 0) {
  throw new Error(`invalid active window bounds: ${JSON.stringify(active)}`);
}

const clip = {
  x: active.x,
  y: active.y,
  width: active.width,
  height: active.height,
};

const screenshotDir = '.runtime/temp/mac';
File.ensureDir(screenshotDir);
const out = `${screenshotDir}/screenshot_active_window_${Date.now()}.png`;
await page.screenshot({ path: out, clip, target: 'activeWindow' });
console.log('active window screenshot:', out);
