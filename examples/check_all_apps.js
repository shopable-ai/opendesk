/**
 * Check which apps are running
 */

const APPS = {
  wechat: ['wechat', '微信'],
  vscode: ['code', 'visual studio code', 'vscode'],
  chrome: ['chrome', 'google chrome'],
  safari: ['safari'],
  finder: ['finder'],
};

async function checkApps() {
  const list = await window.list();

  console.log('=== Checking Running Applications ===\n');

  for (const [appName, keywords] of Object.entries(APPS)) {
    const matches = list.filter((w) => {
      const exe = String(w?.exeName || '').toLowerCase();
      const title = String(w?.title || '').toLowerCase();
      return keywords.some((keyword) => exe.includes(keyword) || title.includes(keyword));
    });

    if (matches.length > 0) {
      console.log(`✓ ${appName}: ${matches.length} window(s)`);
      for (const w of matches) {
        console.log(`  - ${w.title} (${w.width}x${w.height})`);
      }
    } else {
      console.log(`✗ ${appName}: not running`);
    }
    console.log('');
  }
}

await checkApps();
