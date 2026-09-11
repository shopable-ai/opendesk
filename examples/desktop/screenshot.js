// Screenshot example. Captured pixels may contain sensitive desktop content.
const artifactDir = File.join(Execution.workdir, '.runtime', 'examples', 'desktop', 'screenshot');
File.ensureDir(artifactDir);

const full = await page.screenshot({path: File.join(artifactDir, 'screenshot.png')});
console.log('screenshot preview:', full.substring(0, 100) + '...');

await page.screenshot({
  path: File.join(artifactDir, 'screenshot-cut.png'),
  clip: {x: 100, y: 100, width: 500, height: 300},
});
console.log('clipped screenshot saved');

const clippedBase64 = await page.screenshot({
  clip: {x: 0, y: 0, width: 800, height: 600},
});
console.log('clipped base64 preview:', clippedBase64.substring(0, 100) + '...');
console.log('artifact directory:', artifactDir);
