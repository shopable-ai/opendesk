const actual = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAGklEQVR42mPgEpH7r2Fk85/BLSDqf0pexX8AMtoHCQBDMTYAAAAASUVORK5CYII=';
const expected = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAGklEQVR42mPgEpH7r2Fk85/BLSDqf0VexX8AMyoHHchYPi8AAAAASUVORK5CYII=';

const result = ImageColor.diff(actual, expected, {
  pixelThreshold: 8,
  outputPath: './.runtime/examples/image-color-diff/diff.png',
});

console.log(JSON.stringify(result, null, 2));
