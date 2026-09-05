---
title: Page API
description: page 是 OpenDesk 脚本最常用的桌面入口，负责截图、打开 URL/App、等待与权限处理。
order: 2
---

# page

`page` 是 OpenDesk 脚本层最常用的入口。

它更接近“桌面自动化 Page”，**不是浏览器 DOM Page**。

## page：适用场景

- 截图当前窗口、整屏或指定区域
- 打开 URL
- 打开本地应用
- 读取前台窗口标题
- 等待条件
- macOS 截图 / 辅助功能 / Automation 权限预检与引导

## page：与其他全局对象的关系

- `page.mouse` = 全局 `mouse`
- `page.keyboard` = 全局 `keyboard`
- `page.touchscreen` = 全局 `touchscreen`
- `Screen.screenshot` 在运行时绑定到 `page.screenshot`

## page：方法总表

### page：Native 接口

| 方法 | 用途 |
| --- | --- |
| `page.screenshot(options?)` | 截图 |
| `page.captureScreen(options?)` | 直接抓取屏幕或裁剪区域；返回值兼容 `page.screenshot` |
| `page.goto(url)` | 用系统默认方式打开 URL |
| `page.openURL(url)` | `goto` 的语义别名 |
| `page.openApp(appName)` | 打开应用 |
| `page.openURLInApp(appName, url)` | 用指定应用打开 URL |
| `page.title()` | 当前活动窗口标题 |
| `page.url()` | Page 内部 executable 字段，不等于真实浏览器 URL |
| `page.waitFor(milliseconds)` | 原生毫秒等待，最大 30000ms |
| `page.checkScreenshotPermissions()` | 截图/辅助功能权限检查 |
| `page.openMacOSPrivacySettings(section)` | 打开 macOS 隐私设置 |
| `page.requestMacPermissions(options)` | 请求/探测 macOS 权限 |
| `page.ensureMacPermissions(options)` | 严格确保 macOS 权限 |
| `page.requestMacAutomationPermission(targetApp)` | 触发 AppleEvents 权限请求 |

### page：Polyfill 增强

| 方法 | 用途 |
| --- | --- |
| `page.waitFor(number|function, options?)` | 数字等待或条件等待 |
| `page.waitForTimeout(ms)` | Promise 风格等待 |
| `page.waitForNavigation(options?)` | 基于 `page.url()` 的兼容等待 |
| `page.waitForFunction(fn, options?, ...args)` | 条件轮询 |
| `page.waitForAll(promises, options?)` | 等待一组值或 Promise 全部完成 |
| `page.checkPermissions(options?)` | 跨平台权限快照 |
| `page.requestPermissions(options?)` | 跨平台权限请求 |
| `page.ensurePermissions(options?)` | 严格权限守卫 |

## page.screenshot(options)

```js
const result = await page.screenshot(options);
```

**参数**

| 参数 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `path` | string | 空 | 保存路径 |
| `type` | string | `png` | 当前输出主流程仍为 PNG |
| `quality` | number | `100` | 保留字段；当前 PNG 流程不会体现 JPEG quality 差异 |
| `fullPage` | boolean | `false` | true 时走整屏逻辑 |
| `omitBackground` | boolean | `false` | 兼容字段 |
| `encoding` | string | `binary` | 兼容字段 |
| `returnType` | string | `base64` | base64 / bytes / path / object / none |
| `target` | string | `activeWindow` | activeWindow / screen |
| `displayIndex` | number | `0` | 显示器索引 |
| `clip` | object | 空 | `{x,y,width,height}` 裁剪区域 |

**返回形式**

| returnType | 返回 |
| --- | --- |
| `base64` / 空 | `data:image/png;base64,...` |
| `bytes` | PNG 二进制 / JS ArrayBuffer |
| `path` | 保存后的绝对路径 |
| `object` | `{path,mimeType,width,height,sizeBytes,source,backend}` |
| `none` | `null` |

**行为优先级**

1. 有 `clip`：按 clip 截图，优先于 target。
2. 否则 `fullPage=true` 或 `target='screen'`：整屏/指定显示器。
3. 否则：尝试活动窗口；取不到活动窗口边界时可能降级整屏。

**约束**

- `clip.width` / `clip.height` 必须 > 0。
- `displayIndex` 不能 < 0。
- `target` 只接受当前实现支持的值。
- `returnType` 非法会直接报错。

**示例：当前窗口**

```js
const out = await page.screenshot({
  target: 'activeWindow',
  path: './.runtime/examples/current.png',
  returnType: 'path'
});
console.log(out);
```

**示例：第二块显示器**

```js
console.log(Screen.getDisplays());

await page.screenshot({
  target: 'screen',
  displayIndex: 2,
  path: './.runtime/examples/display-2.png',
  returnType: 'path'
});
```

**示例：裁剪区域**

```js
const shot = await page.screenshot({
  clip: { x: 100, y: 120, width: 480, height: 320 },
  path: './.runtime/examples/clip.png',
  returnType: 'object'
});
console.log(shot);
```

## page.goto(url) / page.openURL(url)

```js
await page.openURL('https://example.com');
```

它们把 URL 交给操作系统打开：

- macOS：`open`
- Windows：系统 start 机制
- Linux：`xdg-open`

注意：

- 不是浏览器 tab 内 DOM 导航。
- 不负责等待网页真正加载完成。

## page.openApp(appName)

```js
await page.openApp('Safari');
```

`appName` 不能为空。

## page.openURLInApp(appName, url)

```js
await page.openURLInApp('Google Chrome', 'https://example.com');
```

`url` 不能为空；`appName` 可按当前平台实现处理。

## page.title()

```js
const title = page.title();
```

返回当前活动窗口标题。

## page.url()

```js
const value = page.url();
```

返回 Page 结构里的 `Executable` 字段。

**不要把它当成真实浏览器 URL API。**

因此 `page.waitForNavigation()` 也只应视为兼容能力。桌面自动化更推荐结合：

- `page.title()`
- `window.getActiveWindow()`
- `page.waitForFunction()`

判断状态。

## page.waitFor(milliseconds)

原生毫秒等待：

```js
await page.waitFor(800);
```

约束：

- 不能为负数
- 最大 30000ms

## page.waitForTimeout(ms)

Polyfill Promise 风格等待：

```js
await page.waitForTimeout(1000);
```

## page.waitFor(number|function, options)

Polyfill 会根据第一个参数分派：

```js
await page.waitFor(1200);

await page.waitFor(() => {
  return page.title().includes('Safari');
});
```

当前不应把字符串 selector 当成 Puppeteer 风格 `waitFor(selector)` 使用。

## page.waitForFunction(fn, options, ...args)

```js
await page.waitForFunction(() => {
  const info = window.getActiveWindow();
  return info && info.title && info.title.includes('Safari');
}, {
  timeout: 10000,
  polling: 200
});
```

常用参数：

- `timeout`：默认 30000ms
- `polling`：默认 100ms

## page.waitForAll(promises, options?)

等待数组中所有值或 Promise 完成，并保持输入顺序返回结果数组：

```js
const [title, active] = await page.waitForAll([
  page.title(),
  window.getActiveWindow(),
], { timeout: 5000 });
```

| 参数 | 类型 | 说明 |
| --- | --- | --- |
| `promises` | `Array<Promise<T> \| T>` | 必填；需要一起等待的值或 Promise。 |
| `options.timeout` | number | 可选；超时毫秒数。 |

返回 `Promise<T[]>`。任一项目拒绝或超时会使整体 Promise 拒绝。

## page.waitForNavigation(options)

兼容式方法，会轮询 `page.url()` 是否变化。

由于 `page.url()` 不是可靠浏览器 URL，新桌面脚本通常不要把它作为主等待策略。

## page.checkPermissions(options)

跨平台权限快照：

```js
const result = await page.checkPermissions({
  capabilities: ['screenCapture', 'accessibility']
});
console.log(result);
```

常见 capability：

- `screenCapture`
- `accessibility`
- `inputMonitoring`：macOS 10.15+ 使用公开的 `IOHIDCheckAccess` 读取监听事件权限，返回
  `granted`、`denied` 或 `unknown`。只有 `granted` 会使该 capability 通过；`unknown` 仍保持
  fail-closed，不会被当作已经授权。
- `automation`

`section` 还支持 `globalShortcut`。`checkPermissions()` 将它展开为 `accessibility` 和
`inputMonitoring`。`requestPermissions()` 会先检查二者：都已授权时直接返回，不执行权限请求，
也不打开系统设置；仅缺少一项时只导航对应的设置页。通常优先传 `capabilities`，由 Runtime
自动选择组合。

## page.requestPermissions(options)

```js
const result = await page.requestPermissions({
  capabilities: ['screenCapture', 'accessibility'],
  openSettings: true
});
```

常用参数：

- `capabilities`：要检查/请求的 capability 列表。
- `section`：预定义组合；`globalShortcut` 表示 `accessibility + inputMonitoring`。
- `openSettings`：未授权时是否打开相关系统设置，默认 `true`。
- `forceOpenSettings`：默认 `false`。仅在 `openSettings: true` 时生效；即使已经授权或本进程
  已打开过，也再次导航设置页。它不会强制 macOS 重复 consent，也不会改变权限判断结果。
- `strict`：结果未满足时是否抛错，默认 `false`。

正常调用具有幂等行为：全部已授权时返回 `skipped: true`、`reason: 'already_granted'`、
`settingsOpened: false`；仍未授权时，同一进程对每个设置页默认只打开一次，避免循环调用持续
拉起窗口。只有明确的“重新打开权限设置”按钮才应使用：

```js
await page.requestPermissions({
  section: 'globalShortcut',
  openSettings: true,
  forceOpenSettings: true,
  strict: false,
});
```

## page.ensurePermissions(options)

新脚本推荐的严格权限守卫：

```js
await page.ensurePermissions({
  capabilities: ['screenCapture', 'accessibility'],
  openSettings: true
});
```

权限不满足时应尽早失败，而不是继续执行不可验证的点击链路。

### globalShortcut 的窄范围预检

`globalShortcut` 与通用 `page` 权限 API 是独立的；不要新增或调用
`globalShortcut.requestPermission()`。系统级快捷键的首次配置应由显式的设置/首次运行 UI 调用
通用 API，而不是在每次注册或 callback 时请求。该 section 是 `accessibility` 与
`inputMonitoring` 的组合；不要为了快捷键而请求 Screen Recording：

```js
// Call from explicit first-run / settings UI, not from every shortcut callback.
const permissions = await page.requestPermissions({
  section: 'globalShortcut',
  openSettings: true,
  strict: false,
});

if (!permissions.ok) {
  throw new Error('Enable Accessibility and Input Monitoring for OpenDesk, restart it, then retry.');
}
```

上面的 `requestPermissions()` 先检查两个权限；已经授权时不再打开窗口。未授权时只打开缺失
权限对应的设置页，并按需请求 macOS 显示系统授权提示；是否显示由 macOS 对该宿主已有的授权
决定。Input Monitoring 通过 `IOHIDCheckAccess` 校验，`denied` / `unknown` 都不会被误报为成功。
如果流程要求未授权时立即停止，可改用 `strict: true` 或 `page.ensurePermissions()`。
普通 `globalShortcut` 不需要 `screenCapture` 或 `automation`；后两者分别属于截图和 AppleEvents
控制其他应用的独立能力。`globalShortcut.register()` 本身不会隐式弹出权限提示或打开设置页。
详见 [Global Shortcut](global-shortcut.md)。

## page.ensureMacPermissions(options)

macOS 专用/兼容入口。

```js
await page.ensureMacPermissions({
  section: 'all',
  openSettingsOnFail: true,
  strict: true
});
```

新通用脚本优先使用 `ensurePermissions()`。

## page.checkScreenshotPermissions()

```js
const report = page.checkScreenshotPermissions();
console.log(report);
```

macOS 下主要检查：

- screenCapture
- accessibility

同时给出排障提示。

## page.openMacOSPrivacySettings(section)

```js
await page.openMacOSPrivacySettings('screenCapture');
```

支持的 section 以当前源码为准，常见：

- accessibility
- inputMonitoring
- screenCapture
- automation
- all

## page.requestMacPermissions(options)

```js
const result = await page.requestMacPermissions({
  openSettings: true,
  section: 'screenCapture'
});
```

用于触发权限探测和用户引导。

## page.requestMacAutomationPermission(targetApp)

```js
const report = page.requestMacAutomationPermission('Finder');
console.log(report);
```

它只负责触发 AppleEvents 权限请求，**不能绕过 macOS 用户确认**。

## page：当前不属于稳定 API 的旧写法

不要从历史 TestMonkey 文档重新引入：

- `page.$`
- `page.$$`
- DOM 风格 `page.click(selector)`
- DOM 风格 `page.type(selector, text)`
- 把 `page.waitForSelector(selector)` 当作当前桌面主链路

当前更可靠的组合是：

`page + window + Screen + mouse/keyboard + Vision/ImageColor`
