// Maintained from recording rec-20260909T113509.231387000Z-e2232547fa4e
// (actions revision 1, SHA-256 9238fad978581a6f6308b931dd91cd5ced76ad2d2f892f5ebf0965b3143c9574).
//
// Run from the OpenDesk repository root:
// ./dist/opendesk -ui -script examples/human-to-recipe/calculator-115.semantic.recipe.js -console-mode script

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

const BUSINESS_EPISODES = Object.freeze([
  Object.freeze({id: 'multiply-25-by-4', name: '计算 25 乘以 4'}),
  Object.freeze({id: 'add-20', name: '在当前结果上加 20'}),
  Object.freeze({id: 'subtract-5', name: '从当前结果减去 5'}),
]);

async function createRunStatus({episodeCount}) {
  let nativeEnabled = false;
  let handle = null;
  let waitForExpiry = false;

  try {
    const capabilities = ui && typeof ui.getCapabilities === 'function'
      ? ui.getCapabilities()
      : null;
    nativeEnabled = Boolean(capabilities
      && capabilities.enabled
      && capabilities.available
      && capabilities.window
      && capabilities.window.notify);
  } catch (error) {
    console.warn('[RUN_STATUS] capability check failed: ' + String(error && error.code || 'UI_UNAVAILABLE'));
  }

  async function publish(message, patch = {}) {
    if (!nativeEnabled) {
      console.log('[RUN_STATUS] ' + message);
      return false;
    }
    try {
      if (!handle) {
        handle = await ui.notify({message, timeoutMs: 0, closable: true, ...patch});
      } else {
        const result = await handle.update({message, ...patch});
        if (!result.applied) throw new Error('notification handle is already closed');
      }
      return true;
    } catch (error) {
      nativeEnabled = false;
      console.warn('[RUN_STATUS] native presentation failed: '
        + String(error && error.code || error && error.name || 'UI_UNAVAILABLE'));
      console.log('[RUN_STATUS] ' + message);
      return false;
    }
  }

  return Object.freeze({
    async stage(index, name) {
      await publish(name, {
        caption: `${index} / ${episodeCount}`,
        level: 'info',
        progress: {min: 0, max: episodeCount, value: index},
      });
    },
    async success(message) {
      waitForExpiry = await publish(message, {
        caption: `${episodeCount} / ${episodeCount}`,
        level: 'success',
        progress: {min: 0, max: episodeCount, value: episodeCount},
        timeoutMs: 1200,
        timeoutProgress: true,
      });
    },
    async failure(episode, error) {
      const summary = String(error && error.code || error && error.name || 'Error');
      waitForExpiry = await publish('任务失败' + (episode ? '：' + episode : ''), {
        caption: summary,
        level: 'error',
        timeoutMs: 2000,
        timeoutProgress: true,
      });
    },
    async finish() {
      if (!handle) return;
      if (waitForExpiry) {
        try { await handle.waitUntilClosed(); }
        catch (error) {
          console.warn('[RUN_STATUS] wait failed: ' + String(error && error.code || 'UI_UNAVAILABLE'));
        }
      }
      try { await handle.close(); }
      catch (error) {
        console.warn('[RUN_STATUS] close failed: ' + String(error && error.code || 'UI_UNAVAILABLE'));
      }
    },
  });
}

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

async function calculate25Times4(target) {
  await pressKeys(target, ['2', '5', 'multiply', '4', 'equals']);
}

async function add20ToCurrentResult(target) {
  await pressKeys(target, ['plus', '2', '0']);
}

async function subtract5FromCurrentResult(target) {
  await pressKeys(target, ['minus', '5', 'equals']);
}

async function allClear(target) {
  // If Calculator currently shows C, the first press changes it to AC; the
  // second establishes the same all-clear start as an already visible AC.
  await pressKeys(target, ['clear', 'clear']);
}

function flattenAccessibility(node, output = []) {
  if (!node || typeof node !== 'object') return output;
  output.push(node);
  for (const child of Array.isArray(node.children) ? node.children : []) {
    flattenAccessibility(child, output);
  }
  return output;
}

function numericDisplay(value) {
  const normalized = String(value === undefined || value === null ? '' : value)
    .replace(/[\u00a0\u202f\s,]/g, '')
    .replace(/\u2212/g, '-');
  return /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(normalized) ? normalized : null;
}

async function readCalculatorDisplay(target) {
  const active = await requireActiveCalculator(target);
  const snapshot = await Accessibility.snapshot({
    within: active,
    maxDepth: 12,
    maxNodes: 2000,
    timeout: 10000,
    properties: ['role', 'value'],
  });
  if (!snapshot || snapshot.complete !== true || snapshot.truncated === true || !snapshot.root) {
    throw new Error('Calculator result observation is incomplete');
  }
  const displays = flattenAccessibility(snapshot.root)
    .filter((node) => node.role === 'staticText' && numericDisplay(node.value) !== null)
    .map((node) => numericDisplay(node.value));
  if (displays.length !== 1) {
    throw new Error(`Expected one Calculator display, found ${displays.length}`);
  }
  return displays[0];
}

async function waitForCalculatorResult(target, expected, timeoutMs = 3000) {
  const deadline = Date.now() + timeoutMs;
  let actual = null;
  while (Date.now() < deadline) {
    actual = await readCalculatorDisplay(target);
    if (actual === expected) return actual;
    await sleep(50);
  }
  throw new Error(`Calculator result mismatch: expected ${expected}, got ${actual}`);
}

const calculator = await openCalculator();
const runStatus = await createRunStatus({episodeCount: BUSINESS_EPISODES.length});
let currentEpisode = null;

try {
  await allClear(calculator); // Runtime guard: establish the qualified AC start.

  currentEpisode = BUSINESS_EPISODES[0].name;
  await runStatus.stage(1, currentEpisode);
  await calculate25Times4(calculator);

  currentEpisode = BUSINESS_EPISODES[1].name;
  await runStatus.stage(2, currentEpisode);
  await add20ToCurrentResult(calculator);

  currentEpisode = BUSINESS_EPISODES[2].name;
  await runStatus.stage(3, currentEpisode);
  await subtract5FromCurrentResult(calculator);

  const finalResult = await waitForCalculatorResult(calculator, '115');
  await runStatus.success('任务完成');
  console.log('[DONE] Calculator result independently verified: ' + finalResult);
} catch (error) {
  await runStatus.failure(currentEpisode, error);
  throw error;
} finally {
  await runStatus.finish();
}
