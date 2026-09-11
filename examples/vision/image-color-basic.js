// ImageColor basics. This captures the visible desktop but never clicks or types.
const similar = ImageColor.isColorSimilar('#FF5733', '#FF6E4A', 0.85);
console.log('color similarity:', similar);

const image = await page.screenshot();
const size = await ImageColor.getSize(image);
console.log('image size:', size);

const pixel = await ImageColor.pixel(image, 100, 100);
console.log('pixel at 100,100:', pixel);

const white = await ImageColor.findColor(image, '#FFFFFF', {
  threshold: 5,
  x: 0,
  y: 0,
  width: Math.min(500, size[0]),
  height: Math.min(500, size[1]),
});
console.log('white color match:', white);
