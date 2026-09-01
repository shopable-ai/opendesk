const ts = Date.now();
const outDir = '.runtime/temp/mac';
const prefix = `${outDir}/multi_display_${ts}`;

function log(obj, title = 'log') {
  console.log(`[multi-display-test] ${title}: ${JSON.stringify(obj, null, 2)}`);
}

console.log(`[multi-display-test] start ts=${ts}`);

if (typeof page.checkScreenshotPermissions === 'function') {
  const perm = await page.checkScreenshotPermissions();
  log(perm, 'permissions');
}

const displays = Screen.getDisplays();
const primary = Screen.getPrimaryDisplay();
const virtualBounds = Screen.getVirtualBounds();

log(displays, 'displays');
log(primary, 'primary');
log(virtualBounds, 'virtualBounds');

if (!Array.isArray(displays) || displays.length === 0) {
  throw new Error('no displays found');
}

const outputs = [];

for (const d of displays) {
  const idx = Number(d.index || 0);
  const width = Number(d.width || 0);
  const height = Number(d.height || 0);
  if (!idx || width <= 0 || height <= 0) {
    console.log(`[multi-display-test] skip invalid display meta: ${JSON.stringify(d)}`);
    continue;
  }

  const fullOut = `${prefix}_display${idx}_full.png`;
  console.log(`[multi-display-test] capture full display=${idx} path=${fullOut}`);
  await page.screenshot({
    path: fullOut,
    target: 'screen',
    displayIndex: idx,
  });
  outputs.push(fullOut);

  const clipW = Math.min(800, width);
  const clipH = Math.min(600, height);
  const rightTopOut = `${prefix}_display${idx}_right_top_${clipW}x${clipH}.png`;
  console.log(
    `[multi-display-test] capture rightTop display=${idx} clip={x:${-clipW},y:0,width:${clipW},height:${clipH}} path=${rightTopOut}`,
  );
  await page.screenshot({
    path: rightTopOut,
    target: 'screen',
    displayIndex: idx,
    clip: { x: -clipW, y: 0, width: clipW, height: clipH },
  });
  outputs.push(rightTopOut);
}

try {
  const active = await window.getActiveWindow();
  if (active && active.width > 0 && active.height > 0) {
    const activeOut = `${prefix}_active_window_${active.width}x${active.height}.png`;
    console.log(
      `[multi-display-test] capture activeWindow clip={x:${active.x},y:${active.y},width:${active.width},height:${active.height}} path=${activeOut}`,
    );
    await page.screenshot({
      path: activeOut,
      target: 'activeWindow',
      clip: {
        x: active.x,
        y: active.y,
        width: active.width,
        height: active.height,
      },
    });
    outputs.push(activeOut);
  } else {
    console.log(`[multi-display-test] skip activeWindow capture: invalid bounds ${JSON.stringify(active)}`);
  }
} catch (err) {
  console.log(`[multi-display-test] activeWindow capture failed: ${String(err)}`);
}

log(outputs, 'outputs');
console.log('[multi-display-test] done');
