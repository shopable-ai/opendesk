// Read screen geometry and visible pixels. Screenshot output can contain sensitive desktop content.
const width = Screen.getWidth();
const height = Screen.getHeight();
console.log('screen size:', {width, height});

const centerX = Math.floor(width / 2);
const centerY = Math.floor(height / 2);
console.log('center pixel:', Screen.pixel(centerX, centerY));

const points = [
  [0, 0],
  [width - 1, 0],
  [0, height - 1],
  [width - 1, height - 1],
  {x: centerX, y: centerY},
];
console.log('sample pixels:', Screen.pixels(points));

const screenshot = await Screen.screenshot();
console.log('full screenshot base64 preview:', screenshot.substr(0, 100));
