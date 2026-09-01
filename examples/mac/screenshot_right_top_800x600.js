const displayIndex = 1;
const clip = {
  // For macOS displayIndex mode: x<0 anchors from right edge of selected display.
  x: -800,
  y: 0,
  width: 800,
  height: 600,
};

const ts = Date.now();
const out = `.runtime/temp/mac/right_top_800x600_${ts}.png`;

console.log(
  `[right-top-clip] displayIndex=${displayIndex} clip=${JSON.stringify(clip)} out=${out}`,
);

await page.screenshot({
  path: out,
  target: 'screen',
  displayIndex,
  clip,
});

console.log(`[right-top-clip] done: ${out}`);
