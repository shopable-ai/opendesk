const MAX_DISPLAY_INDEX = 8;
const STOP_AFTER_CONSECUTIVE_FULL_FAILS = 2;
const CLIP_WIDTH = 600;
const CLIP_HEIGHT = 400;

function nowISO() {
  return new Date().toISOString();
}

function errText(err) {
  if (!err) return 'unknown error';
  if (typeof err === 'string') return err;
  if (err.message) return String(err.message);
  return String(err);
}

function toBool(v) {
  const s = String(v || '').trim().toLowerCase();
  return s === '1' || s === 'true' || s === 'yes' || s === 'y' || s === 'on';
}

async function safeCall(name, fn) {
  const t0 = Date.now();
  try {
    const value = await fn();
    return {
      ok: true,
      name,
      durationMs: Date.now() - t0,
      value,
    };
  } catch (err) {
    return {
      ok: false,
      name,
      durationMs: Date.now() - t0,
      error: errText(err),
    };
  }
}

async function captureWithReport(options) {
  const t0 = Date.now();
  try {
    const base64 = await page.screenshot(options);
    let fileExists = null;
    if (options.path) {
      try {
        fileExists = await File.exists(options.path);
      } catch (err) {
        fileExists = false;
      }
    }
    return {
      ok: true,
      durationMs: Date.now() - t0,
      file: options.path || null,
      fileExists,
      base64Prefix: typeof base64 === 'string' ? base64.slice(0, 36) : '',
      options,
    };
  } catch (err) {
    return {
      ok: false,
      durationMs: Date.now() - t0,
      file: options.path || null,
      error: errText(err),
      options,
    };
  }
}

function buildDisplayClipSet() {
  return [
    { name: 'left_top', clip: { x: 0, y: 0, width: CLIP_WIDTH, height: CLIP_HEIGHT } },
    { name: 'right_top', clip: { x: -CLIP_WIDTH, y: 0, width: CLIP_WIDTH, height: CLIP_HEIGHT } },
    { name: 'left_bottom', clip: { x: 0, y: -CLIP_HEIGHT, width: CLIP_WIDTH, height: CLIP_HEIGHT } },
    { name: 'right_bottom', clip: { x: -CLIP_WIDTH, y: -CLIP_HEIGHT, width: CLIP_WIDTH, height: CLIP_HEIGHT } },
  ];
}

async function probeDisplay(displayIndex, ts) {
  const item = {
    displayIndex,
    full: null,
    clips: [],
  };

  const fullPath = `.runtime/temp/mac/diag_display_${displayIndex}_full_${ts}.png`;
  item.full = await captureWithReport({
    path: fullPath,
    target: 'screen',
    displayIndex,
  });

  if (!item.full.ok) {
    return item;
  }

  const clipSet = buildDisplayClipSet();
  for (const c of clipSet) {
    const clipPath = `.runtime/temp/mac/diag_display_${displayIndex}_${c.name}_${ts}.png`;
    const clipResult = await captureWithReport({
      path: clipPath,
      target: 'screen',
      displayIndex,
      clip: c.clip,
    });
    item.clips.push({
      name: c.name,
      ...clipResult,
    });
  }

  return item;
}

async function main() {
  const ts = Date.now();
  console.log(`[diag] screenshot diagnose start ts=${ts}`);

  const permission = await safeCall('checkScreenshotPermissions', async () =>
    page.checkScreenshotPermissions(),
  );
  const activeWindow = await safeCall('window.getActiveWindow', async () =>
    window.getActiveWindow(),
  );
  const focusWindow = await safeCall('window.getFocusWindow', async () =>
    window.getFocusWindow(),
  );
  const windowList = await safeCall('window.list', async () => window.list());

  const sysInfo =
    typeof System !== 'undefined' && typeof System.getSystemInfo === 'function'
      ? System.getSystemInfo()
      : {};
  const envDebug =
    typeof System !== 'undefined' && typeof System.getenv === 'function'
      ? System.getenv('TM_SCREENSHOT_DEBUG')
      : '';
  const screenSize = {
    width: Number(Screen.getWidth()),
    height: Number(Screen.getHeight()),
  };

  const root = {
    timestamp: nowISO(),
    env: {
      platform: (sysInfo && sysInfo.os) || 'unknown',
      tmScreenshotDebug: toBool(envDebug),
    },
    permission,
    activeWindow,
    focusWindow,
    windowSummary: {
      ok: windowList.ok,
      durationMs: windowList.durationMs,
      count: windowList.ok && Array.isArray(windowList.value) ? windowList.value.length : 0,
      error: windowList.ok ? '' : windowList.error,
      top5:
        windowList.ok && Array.isArray(windowList.value)
          ? windowList.value.slice(0, 5)
          : [],
    },
    screenSize,
    activeWindowCapture: null,
    displays: [],
    notes: [
      'If activeWindow capture is wrong, check active window focus/bounds first.',
      'If all displayIndex probes fail, likely screen capture permission or execution identity issue.',
      'If full screenshot succeeds but clip fails, coordinates or clip anchor are likely wrong.',
      'For displayIndex>0, clip x/y use display-local coordinates; negative values anchor from right/bottom.',
    ],
  };

  if (activeWindow.ok && activeWindow.value && activeWindow.value.width > 0 && activeWindow.value.height > 0) {
    const aw = activeWindow.value;
    const activePathByTarget = `.runtime/temp/mac/diag_active_window_target_${ts}.png`;
    const activePathByClip = `.runtime/temp/mac/diag_active_window_clip_${ts}.png`;
    root.activeWindowCapture = await captureWithReport({
      path: activePathByTarget,
      target: 'activeWindow',
    });
    root.activeWindowCapture.byAbsoluteClip = await captureWithReport({
      path: activePathByClip,
      target: 'screen',
      clip: {
        x: aw.x,
        y: aw.y,
        width: aw.width,
        height: aw.height,
      },
    });
  } else {
    root.activeWindowCapture = {
      ok: false,
      error: 'skip active window capture: active window unavailable or invalid bounds',
    };
  }

  let consecutiveFullFails = 0;
  for (let idx = 1; idx <= MAX_DISPLAY_INDEX; idx += 1) {
    const d = await probeDisplay(idx, ts);
    root.displays.push(d);

    if (!d.full || !d.full.ok) {
      consecutiveFullFails += 1;
      console.log(`[diag] display ${idx} full capture fail: ${d.full ? d.full.error : 'unknown'}`);
      if (consecutiveFullFails >= STOP_AFTER_CONSECUTIVE_FULL_FAILS) {
        console.log(
          `[diag] stop probing after ${STOP_AFTER_CONSECUTIVE_FULL_FAILS} consecutive full-capture failures`,
        );
        break;
      }
      continue;
    }

    consecutiveFullFails = 0;
    const clipOK = d.clips.filter((c) => c.ok).length;
    console.log(`[diag] display ${idx} full ok, clip ok=${clipOK}/${d.clips.length}`);
  }

  const okDisplayCount = root.displays.filter((d) => d.full && d.full.ok).length;
  const reportPath = `.runtime/temp/mac/screenshot_diagnose_report_${ts}.json`;
  await File.write(reportPath, JSON.stringify(root, null, 2));

  console.log(`[diag] permission ok=${permission.ok ? permission.value.ok : false}`);
  console.log(`[diag] detected displays by probe=${okDisplayCount}`);
  console.log(`[diag] report: ${reportPath}`);
  console.log('[diag] screenshot diagnose done');
}

await main();
