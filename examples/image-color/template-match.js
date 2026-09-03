// Run from the repository root with:
// ./opendesk -script examples/image-color/template-match.js
const fixtureDataURL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAGklEQVR42mPgEpH7r2Fk85/BLSDqf0VexX8AMyoHHchYPi8AAAAASUVORK5CYII=';
const sourceDataURL = ImageColor.resize(fixtureDataURL, 16, 12);
const sourceRawBase64 = sourceDataURL.slice(
  sourceDataURL.indexOf('base64,') + 'base64,'.length,
);
const fixturePath = './.runtime/examples/image-color/template-match/fixture.png';
if (!ImageColor.save(sourceDataURL, fixturePath, 'png', 100)) {
  throw new Error('failed to write template-match fixture');
}
const options = {
  threshold: 1,
  region: { x: 0, y: 0, width: 16, height: 12 },
  scales: [0.9, 1, 1.1],
};

const best = ImageColor.findImage(sourceRawBase64, fixturePath, options);
if (!best.found || best.x !== 0 || best.y !== 0
  || best.width !== 16 || best.height !== 12
  || best.centerX !== 8 || best.centerY !== 6
  || best.confidence !== 1 || best.scale !== 1) {
  throw new Error(`unexpected ImageColor.findImage result: ${JSON.stringify(best)}`);
}

const matches = ImageColor.findImages(sourceDataURL, fixturePath, {
  ...options,
  maxResults: 2,
});
if (matches.length !== 1 || matches[0].x !== 0 || matches[0].y !== 0
  || matches[0].confidence !== 1 || matches[0].scale !== 1) {
  throw new Error(`unexpected ImageColor.findImages result: ${JSON.stringify(matches)}`);
}

const legacy = ImageColor.findPos(fixturePath, fixturePath, 1);
if (!legacy.found || legacy.x !== 0 || legacy.y !== 0
  || Object.prototype.hasOwnProperty.call(legacy, 'scale')) {
  throw new Error(`unexpected ImageColor.findPos compatibility result: ${JSON.stringify(legacy)}`);
}

console.log(`IMAGE_COLOR_TEMPLATE_MATCH_RESULT=${JSON.stringify({ best, matches, legacy })}`);
