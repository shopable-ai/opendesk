/**
 * Check if WeChat is running
 */

async function checkWechat() {
  const list = await window.list();
  const wx = (list || []).filter((w) => {
    const exe = String(w?.exeName || '').toLowerCase();
    const title = String(w?.title || '').toLowerCase();
    return exe.includes('wechat') || title.includes('微信') || title.includes('wechat');
  });

  if (wx.length === 0) {
    console.log('❌ WeChat is not running');
    console.log('Please open WeChat desktop app first');
    return false;
  }

  console.log(`✓ Found ${wx.length} WeChat window(s):`);
  for (const w of wx) {
    console.log(`  - ${w.title} (${w.width}x${w.height})`);
  }
  return true;
}

await checkWechat();
