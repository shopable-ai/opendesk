// Manual desktop-input example.
// This script moves/clicks the real pointer at fixed screen coordinates.
// Run only on a disposable desktop state after reviewing the coordinates.

let position = await page.mouse.getPos();
console.log('mouse position:', position);

console.log('click xy 550, 185');
await page.mouse.click(550, 185);
await page.waitFor(1000);

console.log('move xy 550, 300');
await page.mouse.move(550, 300);
await page.waitFor(1000);

console.log('scroll down');
for (let index = 0; index < 3; index++) {
  await page.mouse.wheel({deltaY: 300});
  await page.waitFor(1000);
}

console.log('scroll up');
await page.mouse.wheel({deltaY: -300});
await page.waitFor(1000);

await page.mouse.wheel({deltaY: 300, steps: 10, delay: 30});

console.log('right click xy 650, 300');
await page.mouse.click(650, 300, {button: 'right'});
