/**
 * Read-only overview of several commonly used desktop applications.
 * Window titles may contain user information; review console output before sharing it.
 */
const APPS = {
  wechat: ['wechat', '微信'],
  vscode: ['code', 'visual studio code', 'vscode'],
  chrome: ['chrome', 'google chrome'],
  safari: ['safari'],
  finder: ['finder'],
};

const list = await window.list();
console.log('=== Checking Running Applications ===\n');

for (const [appName, keywords] of Object.entries(APPS)) {
  const matches = list.filter((item) => {
    const exe = String(item?.exeName || '').toLowerCase();
    const title = String(item?.title || '').toLowerCase();
    return keywords.some(keyword => exe.includes(keyword) || title.includes(keyword));
  });

  if (matches.length > 0) {
    console.log(`✓ ${appName}: ${matches.length} window(s)`);
    for (const item of matches) {
      console.log(`  - ${item.title} (${item.width}x${item.height})`);
    }
  } else {
    console.log(`✗ ${appName}: not running`);
  }
  console.log('');
}
