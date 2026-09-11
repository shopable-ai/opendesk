/**
 * Read-only WeChat window discovery.
 * Window titles may contain user information; review output before sharing it.
 */
const list = await window.list();
const matches = (list || []).filter((item) => {
  const exe = String(item?.exeName || '').toLowerCase();
  const title = String(item?.title || '').toLowerCase();
  return exe.includes('wechat') || title.includes('微信') || title.includes('wechat');
});

if (matches.length === 0) {
  console.log('WeChat is not running');
} else {
  console.log(`Found ${matches.length} WeChat window(s):`);
  for (const item of matches) {
    console.log(`  - ${item.title} (${item.width}x${item.height})`);
  }
}
