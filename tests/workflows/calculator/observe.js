// Independent read-only observation. Resolves its own window in each Execution.
'use strict';
const win = await window.get({app: {bundleId: 'com.apple.calculator'}});
const before = await window.current(win);
if (!before.isForeground || !before.hasFocus || before.title !== 'Calculator'
    || before.width !== 232 || before.height !== 321) throw new Error('Observer scope changed');
const firstRead = await UI.readText({within: win});
const secondRead = await UI.readText({within: win});
const screenshot = await page.screenshot({
  clip: {x: before.x, y: before.y, width: before.width, height: before.height},
  path: Execution.artifactDir + '/calculator.png', returnType: 'object',
});
const after = await window.current(win);
const afterCaptureRead = await UI.readText({within: win});
if (!after.isForeground || !after.hasFocus
    || ['x', 'y', 'width', 'height', 'title'].some(key => after[key] !== before[key])
    || firstRead !== secondRead || secondRead !== afterCaptureRead) {
  throw new Error('Calculator changed during observation');
}
console.log(JSON.stringify({firstRead, secondRead, afterCaptureRead, screenshot, window: after}));
