// Run from the repository root with:
// ./opendesk -script examples/image-color/diff.js
const fixtureDir = File.join(File.cwd(), 'examples', 'image-color', 'fixtures');
const actual = File.join(fixtureDir, 'actual-rgb.png');
const expected = File.join(fixtureDir, 'expected.png');

const result = ImageColor.diff(actual, expected, {
  pixelThreshold: 8,
  maxDiffPixels: 3,
  outputPath: './.runtime/examples/image-color/diff.png',
});

if (!result.matched || result.diffPixels !== 3
  || result.width !== 16 || result.height !== 12
  || !result.changedBounds || result.changedBounds.x !== 4 || result.changedBounds.y !== 2
  || result.changedBounds.width !== 9 || result.changedBounds.height !== 8) {
  throw new Error(`unexpected ImageColor.diff result: ${JSON.stringify(result)}`);
}

console.log(`IMAGE_COLOR_DIFF_RESULT=${JSON.stringify(result)}`);
