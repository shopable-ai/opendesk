const ts = Date.now();
const indices = [1, 2, 3];

for (const idx of indices) {
  const fullOut = `.runtime/temp/mac/display_${idx}_full_${ts}.png`;
  try {
    await page.screenshot({
      path: fullOut,
      target: 'screen',
      displayIndex: idx,
    });
    console.log(`[display-probe] full ok: display=${idx} path=${fullOut}`);
  } catch (err) {
    console.log(`[display-probe] full fail: display=${idx} error=${String(err)}`);
    continue;
  }

  const clipOut = `.runtime/temp/mac/display_${idx}_clip_0_0_800_600_${ts}.png`;
  try {
    await page.screenshot({
      path: clipOut,
      target: 'screen',
      displayIndex: idx,
      clip: { x: 0, y: 0, width: 800, height: 600 },
    });
    console.log(`[display-probe] clip ok: display=${idx} path=${clipOut}`);
  } catch (err) {
    console.log(`[display-probe] clip fail: display=${idx} error=${String(err)}`);
  }
}
