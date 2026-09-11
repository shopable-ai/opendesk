// Manual desktop-input example.
// This script clicks the real desktop at fixed coordinates before taking screenshots.
// Review the coordinates and desktop state before running.

await page.waitFor(1000);
await page.mouse.click(250, 135, {button: 'right'});
await page.waitFor(1000);
await page.mouse.click(40, 135, {clickCount: 2});
await page.waitFor(1000);
await page.mouse.click(500, 500);

const base64Image = await page.screenshot();
console.log('Screenshot (base64):', base64Image.substring(0, 100));

const artifactDir = File.join(Execution.workdir, '.runtime', 'examples', 'desktop', 'page-click');
File.ensureDir(artifactDir);
await page.screenshot({path: File.join(artifactDir, 'screenshot.png')});
await page.screenshot({
  path: File.join(artifactDir, 'screenshot-cut.png'),
  clip: {x: 100, y: 100, width: 500, height: 300},
});
console.log('screenshots:', artifactDir);
