const wait = (ms) => page.waitFor(ms);

const pages = [
  {
    name: '辅助功能',
    url: 'x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility'
  },
  {
    name: '输入监控',
    url: 'x-apple.systempreferences:com.apple.preference.security?Privacy_ListenEvent'
  },
  {
    name: '屏幕录制',
    url: 'x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture'
  },
  {
    name: '自动化',
    url: 'x-apple.systempreferences:com.apple.preference.security?Privacy_Automation'
  }
];

console.log('权限设置引导开始');
console.log('请在每个页面中手动勾选当前运行主体的权限。优先给 Clawdesk.app 授权；只有命令行调试时才检查 Terminal/iTerm/Codex 一类宿主。');

for (const item of pages) {
  console.log(`打开设置页: ${item.name}`);
  await page.openURL(item.url);
  await wait(2500);
}

console.log('权限设置页已全部打开。完成勾选后，重新运行自动化脚本。');
