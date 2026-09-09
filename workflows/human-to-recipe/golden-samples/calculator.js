// Maintained from recording rec-20260909T113509.231387000Z-e2232547fa4e
// (actions revision 1, SHA-256 9238fad978581a6f6308b931dd91cd5ced76ad2d2f892f5ebf0965b3143c9574).
//
// Run from the OpenDesk repository root:
// ./dist/opendesk -script examples/human-to-recipe/calculator-115.semantic.recipe.js -console-mode script

'use strict';

const CALCULATOR = Object.freeze({
  bundleId: 'com.apple.calculator',
  executablePath: '/System/Applications/Calculator.app/Contents/MacOS/Calculator',
  title: 'Calculator',
  width: 232,
  height: 321,
});

// Window-relative points qualified from the source recording. The independent
// acceptance gate owns button identity checks, step oracles, and evidence.
const BUTTON = Object.freeze({
  clear: Object.freeze({x: 33, y: 107}),
  '0': Object.freeze({x: 76, y: 290}),
  '2': Object.freeze({x: 83, y: 239}),
  '4': Object.freeze({x: 17, y: 198}),
  '5': Object.freeze({x: 82, y: 203}),
  multiply: Object.freeze({x: 195, y: 149}),
  plus: Object.freeze({x: 203, y: 251}),
  minus: Object.freeze({x: 203, y: 197}),
  equals: Object.freeze({x: 204, y: 292}),
});

function sameWindow(left, right) {
  if (String(left.id || '') && String(right.id || '')) {
    return String(left.id) === String(right.id);
  }
  return Number(left.pid) === Number(right.pid)
    && String(left.title || '') === String(right.title || '');
}

async function requireActiveCalculator(target) {
  const active = await window.getActiveWindow();
  if (!sameWindow(active, target)
      || String(active.exePath || '') !== CALCULATOR.executablePath
      || Number(active.width) !== CALCULATOR.width
      || Number(active.height) !== CALCULATOR.height
      || ![active.x, active.y].every(Number.isFinite)) {
    throw new Error('Calculator target is no longer the qualified active window');
  }
  return active;
}

async function openCalculator() {
  const platform = System.getPlatformInfo();
  if (!platform || platform.os !== 'darwin') {
    throw new Error('This recipe requires macOS Calculator');
  }

  await App.launch({bundleId: CALCULATOR.bundleId}, {
    activate: true,
    waitUntilReady: 'window',
    timeout: 10000,
  });

  const matches = (await window.list()).filter((candidate) =>
    String(candidate.exePath || '') === CALCULATOR.executablePath
      && String(candidate.title || '') === CALCULATOR.title);
  if (matches.length !== 1) {
    throw new Error(`Expected one Calculator window, found ${matches.length}`);
  }

  const target = matches[0];
  if (Number(target.width) !== CALCULATOR.width
      || Number(target.height) !== CALCULATOR.height) {
    throw new Error('Calculator must use the qualified 232×321 layout');
  }

  const active = await window.getActiveWindow();
  if (!sameWindow(active, target)) {
    await window.bringToTop(target.title, Number(target.pid));
    await sleep(200);
  }
  await requireActiveCalculator(target);
  return target;
}

async function press(target, key) {
  const offset = BUTTON[key];
  if (!offset) throw new Error(`Unknown Calculator key: ${key}`);
  const active = await requireActiveCalculator(target);
  const point = Geometry.pointOffset(active, offset.x, offset.y);
  if (!Geometry.contains(Geometry.rect(active), point)) {
    throw new Error(`Calculator key is outside the qualified window: ${key}`);
  }
  await mouse.clickForPID(Number(active.pid), point.x, point.y);
  await sleep(120);
}

async function pressKeys(target, keys) {
  for (const key of keys) await press(target, key);
}

async function allClear(target) {
  // If Calculator currently shows C, the first press changes it to AC; the
  // second establishes the same all-clear start as an already visible AC.
  await pressKeys(target, ['clear', 'clear']);
}

const calculator = await openCalculator();

await allClear(calculator);                                         // AC
await pressKeys(calculator, ['2', '5', 'multiply', '4', 'equals']); // 25 × 4 =
await pressKeys(calculator, ['plus', '2', '0']);                    // + 20
await pressKeys(calculator, ['minus', '5', 'equals']);              // − 5 =

console.log('[DONE] Calculator automation completed: AC → 25 × 4 = → + 20 → − 5 =');
