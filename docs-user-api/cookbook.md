---
title: Cookbook
description: 高频用户脚本范例：截图、窗口控制、OCR 找字点击、HTTP 请求、权限处理、多显示器等。
order: 15
---

# cookbook

这页只放高频、可直接改造复用的脚本范例。

原则
- 尽量贴近当前项目真实能力
- 优先使用稳定 API
- 少写抽象说明，多给可复制脚本

## 截图与窗口

**1. 截图当前活动窗口**

```js
await page.ensurePermissions({
  capabilities: ['screenCapture', 'accessibility'],
  openSettings: true
});

const out = await page.screenshot({
  target: 'activeWindow',
  path: './.runtime/examples/active-window.png',
  returnType: 'path'
});

console.log(out);
```

**2. 截图指定区域**

```js
const result = await page.screenshot({
  clip: { x: 120, y: 180, width: 640, height: 360 },
  path: './.runtime/examples/clip.png',
  returnType: 'object'
});

console.log(JSON.stringify(result, null, 2));
```

**3. 列出显示器并截图第二屏**

```js
const displays = Screen.getDisplays();
console.log(JSON.stringify(displays, null, 2));

await page.screenshot({
  target: 'screen',
  displayIndex: 2,
  path: './.runtime/examples/display-2.png'
});
```

**4. 打开 Safari，并等待窗口出现**

```js
await page.openApp('Safari');

await page.waitForFunction(() => {
  const info = window.getActiveWindow();
  return info && info.title && info.title.includes('Safari');
}, { timeout: 10000, polling: 200 });

console.log('Safari ready');
```

**5. 用指定应用打开 URL**

```js
await page.openURLInApp('Google Chrome', 'https://example.com');
await page.waitForTimeout(2000);
console.log(window.title());
```

**6. 移动窗口到固定位置**

```js
await window.focus('Safari');
await page.waitForTimeout(500);
await window.setWindowBounds('Safari', 80, 80, 1440, 920);
```

## 视觉与交互

**7. OCR 提取当前窗口文字**

```js
const imagePath = await page.screenshot({
  target: 'activeWindow',
  path: './.runtime/examples/ocr-input.png',
  returnType: 'path'
});

const result = await Vision.runOCR({
  imagePath,
  provider: 'local',
  lang: 'chi_sim+eng'
});

console.log(result.text);
```

**8. 找到“确定”按钮并点击**

```js
const imagePath = await page.screenshot({
  target: 'activeWindow',
  path: './.runtime/examples/dialog.png',
  returnType: 'path'
});

const ui = await Vision.detectUI({
  imagePath,
  provider: 'local',
  targetText: '确定',
  matchMode: 'contains',
  minConfidence: 0.4,
  defaultRole: 'button'
});

if (ui.count === 0) {
  throw new Error('未找到“确定”');
}

const p = ui.elements[0].clickPoint;
await mouse.click(p.x, p.y);
```

**9. 找到“登录”后输入账号**

```js
const ui = await Vision.detectUI({
  imagePath: './.runtime/examples/login.png',
  provider: 'local',
  targetText: '账号',
  matchMode: 'contains',
  minConfidence: 0.4,
  defaultRole: 'input'
});

if (ui.count > 0) {
  const p = ui.elements[0].clickPoint;
  await mouse.click(p.x, p.y);
  await keyboard.type('alice@example.com');
}
```

**10. 用 mouse 做拖拽**

```js
await mouse.move(320, 300);
await mouse.down({ button: 'left' });
await mouse.move(920, 300, { steps: 30 });
await mouse.up({ button: 'left' });
```

**11. 用 keyboard 发送快捷键**

```js
await keyboard.combination('Meta', 'L');
await keyboard.type('https://example.com');
await keyboard.press('Enter');
```

**12. 批量取色判断状态**

```js
const colors = Screen.pixels([
  { x: 100, y: 100 },
  { x: 120, y: 100 },
  { x: 140, y: 100 }
], true);

console.log(colors);
```

## 文件、HTTP 与数据

**13. 保存截图字节到文件**

```js
File.ensureDir('./artifacts');
const bytes = await page.screenshot({ returnType: 'bytes' });
File.writeBytes('./.runtime/examples/raw-shot.png', bytes);
```

**14. 读取文件并追加日志**

```js
const text = File.read('./README.md');
console.log(text.slice(0, 200));

File.ensureDir('./artifacts');
File.append('./.runtime/examples/run.log', 'script started\n');
```

**15. 发送 HTTP GET 请求**

```js
const resp = await axios.get('https://httpbin.org/get', {
  params: {
    q: 'opendesk'
  }
});

console.log(resp.status);
console.log(JSON.stringify(resp.data, null, 2));
```

**16. 抓网页并用 cheerio 解析**

```js
const resp = await axios.get('https://example.com');
const $ = cheerio.load(resp.data);
console.log($('title').text());
```

**17. 生成带 query 参数的 URL**

```js
const url = 'https://example.com/search?' + queryString.stringify({
  q: 'vision',
  page: 1
});
console.log(url);
```

**18. 检查 paddle OCR 能力是否就绪**

```js
const caps = await Vision.getCapabilities({ provider: 'paddle' });
console.log(JSON.stringify(caps, null, 2));

const provider = caps.providers[0];
if (!provider.implemented) {
  throw new Error('paddle provider 未实现');
}
if (provider.endpointRequired && !provider.endpointConfigured) {
  throw new Error('PADDLE_OCR_ENDPOINT 未配置');
}
```

**19. 用旧 OCR 对象快速提文本**

```js
const text = await OCR.extractText('./.runtime/examples/ocr-input.png', 'chi_sim+eng');
console.log(text);
```

## 服务、运行时与诊断

**20. 使用 HTTP server 创建执行任务**

```bash
curl -X POST http://127.0.0.1:60844/executions   -H 'Content-Type: application/json'   -d '{
    "script": "console.log(page.title())",
    "stack": "legacy",
    "timeout": 30
  }'
```

**21. 订阅 HTTP server SSE 事件流**

```bash
curl -N 'http://127.0.0.1:60844/executions/http-xxxx/events?categories=script,error'
```

**22. 在 playwright 栈里打开页面**

```js
console.log(page === pageUpgraded);
console.log(browser === browserUpgraded);
console.log(context === contextUpgraded);

const ctx = browser.newContext();
const p = ctx.newPage();
await p.open('https://example.com');
```

**23. 权限自检并给出诊断信息**

```js
const report = await page.checkPermissions({
  capabilities: ['screenCapture', 'accessibility']
});

console.log(JSON.stringify(report, null, 2));

if (!report.ok) {
  await page.requestPermissions({
    capabilities: ['screenCapture', 'accessibility'],
    openSettings: true,
    strict: false
  });
}
```

**24. 保存当前系统状态快照**

```js
File.ensureDir('./artifacts');

const snapshot = {
  system: System.getSystemInfo(),
  metrics: System.getSystemMetrics(),
  window: await window.getActiveWindow(),
  time: moment().format('YYYY-MM-DD HH:mm:ss')
};

File.write('./.runtime/examples/system-snapshot.json', JSON.stringify(snapshot, null, 2));
```

**25. 一个更完整的“找字并点击”模板**

```js
await page.ensurePermissions({
  capabilities: ['screenCapture', 'accessibility'],
  openSettings: true
});

const imagePath = await page.screenshot({
  target: 'activeWindow',
  path: './.runtime/examples/current.png',
  returnType: 'path'
});

const result = await Vision.detectUI({
  imagePath,
  provider: 'local',
  targetText: '继续',
  matchMode: 'contains',
  minConfidence: 0.45,
  defaultRole: 'button'
});

console.log(JSON.stringify(result, null, 2));

if (result.count < 1) {
  throw new Error('未找到目标文本');
}

const point = result.elements[0].clickPoint;
await mouse.click(point.x, point.y, { clickCount: 1, delay: 60 });
```

## 最后建议

最稳的高频组合是：
- page.screenshot
- page.openApp / page.openURL
- window.getActiveWindow / window.focus / window.setWindowBounds
- mouse / keyboard
- Vision.runOCR / Vision.detectUI
- File

如果要写给团队复用的脚本模板，优先围绕这几组 API 组织。
