---
title: Page API
description: page 对象是脚本最常用的入口，负责截图、打开 URL、打开应用、等待与权限处理。
order: 2
---

# page

page 是运行时默认注入的核心对象。

适用场景：
- 截图
- 打开网页或应用
- 读取当前活动窗口标题
- 等待一段时间或等待条件成立
- 做 macOS 截图/辅助功能权限预检与引导

关系：
- page.mouse：鼠标对象
- page.keyboard：键盘对象
- page.touchscreen：触屏对象
- Screen.screenshot：在运行时被绑定到 page.screenshot

注意
- 当前项目中的 page 更接近“桌面自动化入口”，不是浏览器 DOM Page。
- 旧文档里那些类似 Puppeteer DOM 的 page.$ / page.click(selector) / page.type(selector, text) 不应再视为当前正式 API。
- page 上有一部分能力来自 Go 原生实现，另一部分来自 polyfills/000-page.js 与升级兼容层。

## 方法总表

原生方法

| 方法 | 来源 | 用途 |
| --- | --- | --- |
| page.screenshot(options) | 原生 | 截图，支持活动窗口、整屏、指定显示器、裁剪、路径输出 |
| page.goto(url) | 原生 | 用系统默认方式打开 URL |
| page.openURL(url) | 原生 | goto 的别名，语义更清晰 |
| page.openApp(appName) | 原生 | 打开指定应用 |
| page.openURLInApp(appName, url) | 原生 | 用指定应用打开 URL |
| page.title() | 原生 | 返回当前活动窗口标题 |
| page.url() | 原生 | 返回 Page 记录的 executable 字段；通常不等于浏览器真实 URL |
| page.waitFor(milliseconds) | 原生 | 休眠指定毫秒数，最大 30000 ms |
| page.checkScreenshotPermissions() | 原生 | 检查截图相关权限，主要针对 macOS |
| page.openMacOSPrivacySettings(section) | 原生 | 打开 macOS 隐私设置页 |
| page.requestMacPermissions(options) | 原生 | 触发 macOS 权限流程与探测 |
| page.ensureMacPermissions(options) | 原生 | 严格确保 macOS 权限可用 |
| page.requestMacAutomationPermission(targetApp) | 原生 | 主动触发 AppleEvents automation 权限弹窗 |

polyfill / 兼容层方法

| 方法 | 来源 | 用途 |
| --- | --- | --- |
| page.waitFor(number\|function, options) | polyfill | 兼容式等待：数字或函数 |
| page.waitForTimeout(timeout) | polyfill | Promise 风格延时 |
| page.waitForNavigation(options) | polyfill | 轮询 page.url() 是否变化 |
| page.waitForFunction(fn, options, ...args) | polyfill | 轮询函数直到返回 truthy |
| page.checkPermissions(options) | polyfill | 跨平台权限快照接口 |
| page.requestPermissions(options) | polyfill | 跨平台权限请求入口 |
| page.ensurePermissions(options) | polyfill | 严格权限守卫 |
| page.ensureMacPermissions(options) | polyfill alias | 对旧调用方保留的兼容别名 |

属性

| 属性 | 来源 | 说明 |
| --- | --- | --- |
| page.mouse | 注入对象 | 等同全局 mouse |
| page.keyboard | 注入对象 | 等同全局 keyboard |
| page.touchscreen | 注入对象 | 等同全局 touchscreen |

## page.screenshot(options)

签名

```js
await page.screenshot(options)
```

作用
- 对当前活动窗口、整屏或指定显示器截图
- 可保存到文件，也可直接返回 data URL、字节、路径或结果对象

返回值
- 默认返回 data:image/png;base64,... 字符串
- 也可以通过 returnType 控制返回形式

**参数**

| 参数 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| options.path | string | 空 | 保存路径。提供后会写文件 |
| options.type | string | png | 当前源码会接收该字段，但最终输出仍是 PNG 数据流 |
| options.quality | number | 80 | 保留字段。当前实现不输出 JPEG 质量差异 |
| options.fullPage | boolean | false | 为 true 时走整屏逻辑 |
| options.omitBackground | boolean | false | 保留字段，当前桌面截图实现基本无可见差异 |
| options.encoding | string | binary | 保留字段，当前返回主要由 returnType 决定 |
| options.returnType | string | base64 | 可选：base64 / bytes / path / object / none |
| options.target | string | activeWindow | activeWindow 或 screen |
| options.displayIndex | number | 0 | 指定显示器，0 表示默认 |
| options.clip | object | null | 裁剪区域 |
| options.clip.x | number | - | 左上角 x |
| options.clip.y | number | - | 左上角 y |
| options.clip.width | number | - | 裁剪宽度，必须 > 0 |
| options.clip.height | number | - | 裁剪高度，必须 > 0 |

**returnType 行为**

| returnType | 返回值 |
| --- | --- |
| base64 或空 | data:image/png;base64,... |
| bytes | PNG 字节数组 |
| path | 绝对路径字符串；若没传 path，会自动创建临时文件 |
| object | `{ path, mimeType, width, height, sizeBytes, source, backend }` |
| none | null |

**行为优先级**

源码中的优先级是：

1. 如果提供 clip
- 直接按 clip 截图
- clip 优先于 target
- 即使 target=activeWindow，clip 仍按桌面绝对坐标处理

2. 否则如果 fullPage=true 或 target="screen"
- 走整屏截图
- 若 displayIndex>0，会优先尝试指定显示器元数据

3. 否则
- 默认走 activeWindow
- 先取当前活动窗口边界，再截图
- 若取活动窗口失败，会回退到整屏截图

**displayIndex 规则**

- displayIndex < 0：报错
- displayIndex = 0：不指定显示器
- displayIndex > 0：按 1-based 显示器索引选择，与 `Screen.getDisplays()` 返回的 index 对齐
- 在 macOS 上，多显示器截图会优先使用原生 screencapture；某些场景无法回退到 robotgo

**常见错误**

1. clip 尺寸非法
```text
invalid screenshot clip: width and height must be > 0
```

2. displayIndex 非法
```text
invalid displayIndex: -1 (must be >= 0)
```

3. target 非法
```text
invalid screenshot target: xxx (supported: activeWindow, screen)
```

4. returnType 非法
```text
invalid screenshot returnType: xxx
```

5. 活动窗口边界无效
- 例如窗口宽高为 0
- 实现会尝试回退到整屏

6. macOS 权限不足
- 报错中会带出 `screenCapture` / `accessibility` 预检信息
- 并提示使用：
  - `examples/mac/open-permission-settings.js`
  - `scripts/run_macos_stable.sh`

**示例**

返回 base64：

```js
const image = await page.screenshot();
console.log(image.slice(0, 40));
```

保存当前活动窗口到文件：

```js
const out = await page.screenshot({
  path: './artifacts/current-window.png',
  returnType: 'path'
});
console.log('saved to', out);
```

截取主屏：

```js
await page.screenshot({
  target: 'screen',
  path: './artifacts/full-screen.png'
});
```

截取第二块显示器：

```js
const meta = await Screen.getDisplay(2);
console.log(meta);

await page.screenshot({
  target: 'screen',
  displayIndex: 2,
  path: './artifacts/display-2.png',
  returnType: 'path'
});
```

裁剪区域截图：

```js
const shot = await page.screenshot({
  clip: { x: 100, y: 120, width: 480, height: 320 },
  returnType: 'object',
  path: './artifacts/clip.png'
});
console.log(JSON.stringify(shot, null, 2));
```

静默只写文件：

```js
await page.screenshot({
  path: './artifacts/only-file.png',
  returnType: 'none'
});
```

## page.goto(url)

签名

```js
await page.goto(url)
```

作用
- 用操作系统默认机制打开 URL

平台行为
- macOS：`open <url>`
- Windows：`cmd /c start <url>`
- Linux：`xdg-open <url>`

参数

| 参数 | 类型 | 说明 |
| --- | --- | --- |
| url | string | 要打开的地址 |

返回值
- Promise<void>

注意
- 这里不是浏览器 tab 内导航控制，而是交给系统打开
- 不负责等待页面真正加载完成

示例

```js
await page.goto('https://example.com');
```

## page.openURL(url)

签名

```js
await page.openURL(url)
```

作用
- `page.goto(url)` 的语义别名

示例

```js
await page.openURL('https://example.com/docs');
```

## page.openApp(appName)

签名

```js
await page.openApp(appName)
```

作用
- 打开指定应用

参数

| 参数 | 类型 | 说明 |
| --- | --- | --- |
| appName | string | 应用名称 |

错误条件
- `appName` 为空时直接报错：`appName cannot be empty`

示例

```js
await page.openApp('Safari');
await page.openApp('Finder');
```

## page.openURLInApp(appName, url)

签名

```js
await page.openURLInApp(appName, url)
```

作用
- 指定由某个应用打开 URL

参数

| 参数 | 类型 | 说明 |
| --- | --- | --- |
| appName | string | 应用名；可为空 |
| url | string | 要打开的 URL |

错误条件
- `url` 为空时报错：`url cannot be empty`

示例

```js
await page.openURLInApp('Safari', 'https://example.com');
await page.openURLInApp('Google Chrome', 'https://news.ycombinator.com');
```

## page.title()

签名

```js
const title = page.title();
```

作用
- 返回当前活动窗口标题

返回值
- string

示例

```js
console.log('active title =', page.title());
```

## page.url()

签名

```js
const value = page.url();
```

作用
- 返回 Page 结构体里的 `Executable` 字段

重要说明
- 当前源码没有真正维护“当前浏览器 URL”
- 所以它不应被理解为浏览器页面地址 API
- 某些 polyfill（如 waitForNavigation）会用它做比较，但对桌面自动化来说它并不可靠

返回值
- string

建议
- 若你要等待外部应用切换，更可靠的是结合 `page.title()`、`window.getActiveWindow()`、`page.waitForFunction()` 使用

## page.waitFor(milliseconds)

签名

```js
await page.waitFor(milliseconds)
```

作用
- 原生毫秒等待

参数

| 参数 | 类型 | 说明 |
| --- | --- | --- |
| milliseconds | number | 等待毫秒数 |

规则
- 不允许负数
- 最大 30000 ms

错误条件
- 负数：`WaitFor: milliseconds cannot be negative`
- 超过 30000：`WaitFor: wait time cannot exceed 30000 milliseconds`

示例

```js
await page.waitFor(800);
```

## page.waitForTimeout(timeout)

来源
- polyfill

签名

```js
await page.waitForTimeout(timeout)
```

作用
- Promise 风格等待

与原生 waitFor 的区别
- 这个方法是 polyfill 提供的
- 当前实现没有 30000 ms 上限检查

示例

```js
await page.waitForTimeout(5000);
```

## page.waitFor(target, options)

来源
- polyfill

签名

```js
await page.waitFor(1000)
await page.waitFor(() => someCondition())
```

作用
- 兼容式入口
- 若传 number，转到 waitForTimeout
- 若传 function，转到 waitForFunction

注意
- 当前 polyfill 不支持 Puppeteer 风格 selector 字符串 waitFor
- 传字符串会抛错：`waitFor() expects a timeout or function`

示例

```js
await page.waitFor(1200);
await page.waitFor(() => page.title().includes('Safari'));
```

## page.waitForNavigation(options)

来源
- polyfill

签名

```js
await page.waitForNavigation({ timeout })
```

作用
- 轮询 `page.url()` 是否变化

参数

| 参数 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| options.timeout | number | 30000 | 超时毫秒 |

重要说明
- 由于当前 `page.url()` 并不是真正浏览器 URL，这个方法只应视为兼容层 API
- 对桌面自动化实际价值有限

更推荐
- 用 `page.waitForFunction(() => page.title().includes(...))`
- 或结合 `window.getActiveWindow()` 判断

## page.waitForFunction(pageFunction, options, ...args)

来源
- polyfill

签名

```js
await page.waitForFunction(fn, options, ...args)
```

作用
- 轮询函数直到返回 truthy
- 支持 async 函数

参数

| 参数 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| pageFunction | function | - | 轮询函数 |
| options.timeout | number | 30000 | 超时毫秒 |
| options.polling | number | 100 | 轮询间隔 |
| ...args | any[] | - | 传给函数的额外参数 |

错误条件
- 超时后抛出：`Timeout waiting for function`

示例

等待某应用成为前台窗口：

```js
await page.waitForFunction(() => {
  const info = window.getActiveWindow();
  return info && info.title && info.title.includes('Safari');
}, { timeout: 10000, polling: 200 });
```

等待 OCR provider 配置就绪：

```js
await page.waitForFunction(() => {
  const caps = Vision.getCapabilities({ provider: 'paddle' });
  return caps.providers[0] && caps.providers[0].endpointConfigured === true;
}, { timeout: 5000 });
```

## page.checkPermissions(options)

来源
- polyfill

签名

```js
const result = await page.checkPermissions(options)
```

作用
- 提供跨平台权限快照接口
- 在 macOS 上会调用原生 `checkScreenshotPermissions()`
- 非 macOS 会返回 skipped / unsupported 风格结果

参数

| 参数 | 类型 | 说明 |
| --- | --- | --- |
| options.capabilities | string[] | 要检查的能力，如 screenCapture、accessibility、automation |
| options.section | string | 可选别名，如 screenCapture、accessibility、automation、all |

返回结构重点
- `ok`
- `os`
- `capabilities`
- `permissions`
- `raw`

示例

```js
const result = await page.checkPermissions({
  capabilities: ['screenCapture', 'accessibility']
});
console.log(JSON.stringify(result, null, 2));
```

## page.requestPermissions(options)

来源
- polyfill

签名

```js
const result = await page.requestPermissions(options)
```

作用
- 跨平台权限请求入口
- 在 macOS 上会映射到原生 `requestMacPermissions()` 和设置页打开逻辑

参数

| 参数 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| options.capabilities | string[] | 按 section 推导 | 申请哪些能力 |
| options.openSettings | boolean | true | 是否自动打开设置页 |
| options.strict | boolean | false | 失败时是否抛错 |
| options.section | string | screenCapture | 兼容写法 |

示例

```js
const result = await page.requestPermissions({
  capabilities: ['screenCapture', 'accessibility'],
  openSettings: true
});
console.log(JSON.stringify(result, null, 2));
```

## page.ensurePermissions(options)

来源
- polyfill

签名

```js
await page.ensurePermissions(options)
```

作用
- 严格权限守卫
- 内部等价于 `requestPermissions({ strict: true, ... })`

示例

```js
await page.ensurePermissions({
  capabilities: ['screenCapture', 'accessibility'],
  openSettings: true
});
```

## page.ensureMacPermissions(options)

说明
- 原生层与 polyfill 层都存在同名能力
- 用户应把它理解为“macOS 权限保证入口”
- 新脚本更推荐使用 `ensurePermissions()`

常用参数

| 参数 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| openSettingsOnFail | boolean | true | 失败时是否打开设置页 |
| section | string | screenCapture | screenCapture / accessibility / inputMonitoring / automation / all |
| strict | boolean | true | 失败时是否抛错 |

示例

```js
await page.ensureMacPermissions({
  section: 'all',
  openSettingsOnFail: true,
  strict: true
});
```

## page.checkScreenshotPermissions()

签名

```js
const report = page.checkScreenshotPermissions()
```

作用
- macOS 下检查截图与辅助功能权限
- 非 macOS 直接返回默认 OK 结构

返回结构重点

| 字段 | 说明 |
| --- | --- |
| os | 当前系统 |
| screenCapture | 是否具备截图权限 |
| accessibility | 是否具备辅助功能权限 |
| automation | 当前固定为提示文本，不是布尔值 |
| ok | screenCapture 与 accessibility 是否都 OK |
| guideScript | 示例脚本路径 |
| stableRunner | 建议使用的稳定运行脚本 |
| screenCaptureError | 截图探测失败原因 |
| accessibilityError | 辅助功能探测失败原因 |

示例

```js
const report = page.checkScreenshotPermissions();
console.log(JSON.stringify(report, null, 2));
```

## page.openMacOSPrivacySettings(section)

签名

```js
await page.openMacOSPrivacySettings(section)
```

作用
- 打开 macOS 隐私设置页

支持的 section
- accessibility
- inputMonitoring
- screenCapture
- automation
- all

示例

```js
await page.openMacOSPrivacySettings('screenCapture');
await page.openMacOSPrivacySettings('all');
```

## page.requestMacPermissions(options)

签名

```js
await page.requestMacPermissions(options)
```

作用
- 触发权限探针，可选打开设置页
- 适合在脚本启动时做用户引导

参数

| 参数 | 类型 | 默认值 |
| --- | --- | --- |
| openSettings | boolean | true |
| section | string | screenCapture |

返回结构重点
- `before`
- `settings`
- `probes`
- `after`
- `okBefore`
- `okAfter`
- `ok`

示例

```js
const result = await page.requestMacPermissions({
  openSettings: true,
  section: 'screenCapture'
});
console.log(JSON.stringify(result, null, 2));
```

## page.requestMacAutomationPermission(targetApp)

签名

```js
const report = page.requestMacAutomationPermission(targetApp)
```

作用
- 主动触发 AppleEvents automation 权限请求

参数

| 参数 | 类型 | 默认值 |
| --- | --- | --- |
| targetApp | string | System Events |

注意
- 这不是“自动加入白名单”
- macOS 仍需要用户在弹窗里确认

示例

```js
const report = page.requestMacAutomationPermission('Finder');
console.log(JSON.stringify(report, null, 2));
```

## 实战示例

**示例 1：先确保权限，再截图**

```js
await page.ensurePermissions({
  capabilities: ['screenCapture', 'accessibility'],
  openSettings: true
});

const result = await page.screenshot({
  target: 'activeWindow',
  path: './artifacts/active.png',
  returnType: 'object'
});

console.log(JSON.stringify(result, null, 2));
```

**示例 2：打开 Safari，再等待它成为前台**

```js
await page.openApp('Safari');

await page.waitForFunction(() => {
  const info = window.getActiveWindow();
  return info && info.title && info.title.includes('Safari');
}, { timeout: 10000, polling: 200 });

console.log('Safari is active');
```

**示例 3：用指定应用打开网页并截图第二屏**

```js
await page.openURLInApp('Google Chrome', 'https://example.com');
await page.waitForTimeout(2000);

const out = await page.screenshot({
  target: 'screen',
  displayIndex: 2,
  returnType: 'path'
});

console.log(out);
```

## 与旧文档的关键差异

旧文档中常见但当前不应继续作为正式 page API 的内容：
- page.$
- page.$$
- page.click(selector)
- page.type(selector, text)
- page.waitForSelector(selector)

原因
- 当前源码里的 page 主要是桌面自动化入口，不再是旧 Android / DOM 风格 page
- 用户应改用：
  - page.mouse / page.keyboard / page.touchscreen
  - window
  - Screen
  - Vision
  - File
