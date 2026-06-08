---
title: TestMonkey 页面与输入接口
description: 面向脚本作者的核心 API 文档，完整覆盖 page、mouse、keyboard、touchscreen 的方法、参数、返回值与示例。
order: 30
---

# TestMonkey 页面与输入接口

更新时间：2026-05-18

本文是当前项目最核心的用户文档，重点说明：
- `page`
- `mouse`
- `keyboard`
- `touchscreen`

其中 `page` 是脚本层主入口，同时挂载：
- `page.mouse`
- `page.keyboard`
- `page.touchscreen`

说明：
- 本页优先描述“脚本作者最终可用的接口形态”
- 如果 native 实现和 polyfill 封装不一致，以最终运行时暴露结果为准

## page

来源：
- 原生实现：`automation/page.go`
- 增强封装：`polyfills/000-page.js`

### page 方法总表

| 方法 | 说明 |
| --- | --- |
| `await page.screenshot(options?)` | 截图，支持返回 base64 / bytes / path / object / none |
| `await page.goto(url)` | 打开 URL |
| `await page.openURL(url)` | `goto` 的别名 |
| `await page.openApp(appName)` | 打开本地应用 |
| `await page.openURLInApp(appName, url)` | 用指定应用打开 URL |
| `page.title()` | 获取当前前台窗口标题 |
| `page.url()` | 返回 native `Executable` 字段，不适合作为真实浏览器 URL 依赖 |
| `await page.waitFor(msOrFunction, options?)` | 等待固定毫秒或等待函数返回 truthy |
| `await page.waitForTimeout(ms)` | 等待固定毫秒 |
| `await page.waitForNavigation(options?)` | 轮询 `page.url()` 是否变化 |
| `await page.waitForFunction(fn, options?, ...args)` | 轮询执行函数直到返回 truthy |
| `await page.checkPermissions(options?)` | 权限预检 facade |
| `await page.requestPermissions(options?)` | 权限请求 facade |
| `await page.ensurePermissions(options?)` | 严格权限守卫 facade |
| `await page.ensureMacPermissions(options?)` | 兼容别名，偏 macOS |
| `await page.checkScreenshotPermissions()` | 原生截图/辅助功能权限检查 |
| `await page.openMacOSPrivacySettings(section)` | 打开 macOS 隐私设置页面 |
| `await page.requestMacPermissions(options)` | 触发权限探测并可选打开设置页 |
| `await page.requestMacAutomationPermission(targetApp)` | 显式触发 AppleEvents 权限申请 |

---

## page.screenshot(options)

对当前活动窗口、整屏或指定区域截图。

### 调用示例

```js
const base64 = await page.screenshot()

const filePath = await page.screenshot({
  path: 'temp/shot.png',
  returnType: 'path'
})

const info = await page.screenshot({
  target: 'screen',
  displayIndex: 1,
  returnType: 'object'
})
```

### 参数

| 字段 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `path` | `string` | 空 | 保存路径。若 `returnType` 为 `path`/`object` 且未传，会自动生成临时文件 |
| `type` | `string` | `png` | 截图类型。当前实现默认是 png 流程 |
| `quality` | `number` | `100` | 图像质量；源码会接收这个参数 |
| `fullPage` | `boolean` | `false` | 取整屏逻辑的一部分 |
| `omitBackground` | `boolean` | `false` | 接收但当前主要是兼容参数 |
| `encoding` | `string` | `binary` | 接收但当前最终返回更受 `returnType` 控制 |
| `returnType` | `string` | `base64` | `base64` / `bytes` / `path` / `object` / `none` |
| `target` | `string` | `activeWindow` | `activeWindow` 或 `screen` |
| `displayIndex` | `number` | `0` | 选择显示器；`0` 表示默认，`>0` 时按屏序号读取 |
| `clip` | `object` | 空 | 裁剪区域，优先级最高 |
| `clip.x` | `number` |  | 裁剪起点 x |
| `clip.y` | `number` |  | 裁剪起点 y |
| `clip.width` | `number` |  | 裁剪宽度，必须大于 0 |
| `clip.height` | `number` |  | 裁剪高度，必须大于 0 |

### `returnType` 说明

#### 1. `base64`
返回：
```js
"data:image/png;base64,..."
```

#### 2. `bytes`
返回 PNG 二进制字节。

#### 3. `path`
返回保存后的绝对路径：
```js
"/abs/path/to/file.png"
```

#### 4. `object`
返回结构化对象：

```js
{
  path: "/abs/path/to/file.png",
  mimeType: "image/png",
  width: 1440,
  height: 900,
  sizeBytes: 182344,
  source: "activeWindow | screen | clip",
  backend: "robotgo | darwin-screencapture"
}
```

#### 5. `none`
返回 `null`。

### 截图行为规则

1. 如果传了 `clip`：
- `clip` 优先级最高
- 会按绝对桌面坐标裁剪

2. 如果未传 `clip`，且：
- `fullPage === true`，或
- `target === 'screen'`

则按整屏截图。

3. 默认情况下：
- 会尝试截当前活动窗口
- 如果无法获取活动窗口边界，会降级为整屏截图

4. macOS 下：
- 某些模式会优先使用 `screencapture`
- 失败后可能回退到 `robotgo`

### 错误条件

- `returnType` 非法
- `target` 非法
- `clip.width <= 0` 或 `clip.height <= 0`
- `displayIndex < 0`
- 活动窗口边界无效且整屏降级也失败

---

## page.goto(url)

打开 URL。

### 参数

| 参数 | 类型 | 说明 |
| --- | --- | --- |
| `url` | `string` | 目标 URL |

### 返回

- `Promise<void>`

### 平台行为

- macOS: `open url`
- Windows: `cmd /c start url`
- Linux: `xdg-open url`

### 示例

```js
await page.goto('https://example.com')
```

---

## page.openURL(url)

`page.goto(url)` 的别名，语义更清晰。

```js
await page.openURL('https://example.com')
```

---

## page.openApp(appName)

打开本地应用。

### 参数

| 参数 | 类型 | 说明 |
| --- | --- | --- |
| `appName` | `string` | 应用名，不能为空 |

### 返回

- `Promise<void>`

### 示例

```js
await page.openApp('Safari')
await page.openApp('WeChat')
```

---

## page.openURLInApp(appName, url)

用指定应用打开 URL。

### 参数

| 参数 | 类型 | 说明 |
| --- | --- | --- |
| `appName` | `string` | 应用名，可为空 |
| `url` | `string` | 目标 URL，不能为空 |

### 返回

- `Promise<void>`

### 示例

```js
await page.openURLInApp('Safari', 'https://example.com')
```

---

## page.title()

获取当前前台窗口标题。

### 返回

```js
const title = page.title()
```

- 返回 `string`

说明：
- 底层调用 `robotgo.GetTitle()`
- 更接近“当前窗口标题”，不是网页 DOM title

---

## page.url()

返回 native `Page.Executable` 字段。

### 返回

- `string`

### 重要说明

当前实现并不是浏览器真实 URL 读取器，因此：
- 不要把它当成 Puppeteer 的 `page.url()` 使用
- 在很多脚本场景里它可能为空，或者不是你期待的页面地址

`page.waitForNavigation()` 也基于这个值轮询，因此不适合当作高可靠页面导航检测手段。

---

## page.waitFor(msOrFunction, options?)

这是 polyfill 提供的增强接口，支持两种调用方式：

### 1. 等待固定毫秒

```js
await page.waitFor(1000)
```

### 2. 等待函数返回 truthy

```js
await page.waitFor(() => someCondition, {
  timeout: 30000,
  polling: 100
})
```

### `options`

| 字段 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `timeout` | `number` | `30000` | 最大等待时间 |
| `polling` | `number` | `100` | 轮询间隔 |

---

## page.waitForTimeout(ms)

固定等待。

### 参数

| 参数 | 类型 | 说明 |
| --- | --- | --- |
| `ms` | `number` | 毫秒数 |

### 返回

- `Promise<void>`

```js
await page.waitForTimeout(500)
```

---

## page.waitForNavigation(options?)

轮询 `page.url()` 是否变化。

### 参数

| 字段 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `timeout` | `number` | `30000` | 超时时间 |

### 返回

- `Promise<void>`

### 注意

由于当前 `page.url()` 不是可靠浏览器 URL，因此这个方法更适合兼容旧脚本，不建议作为新脚本的核心导航判断手段。

---

## page.waitForFunction(fn, options?, ...args)

轮询执行函数，直到返回 truthy。

### 参数

| 参数 | 类型 | 说明 |
| --- | --- | --- |
| `fn` | `function` | 要轮询的函数 |
| `options.timeout` | `number` | 超时时间，默认 `30000` |
| `options.polling` | `number` | 轮询间隔，默认 `100` |
| `...args` | `any[]` | 传给函数的额外参数 |

### 返回

- `Promise<any>`

### 示例

```js
await page.waitForFunction(() => {
  return Screen.pixel(100, 100) === '#ffffff'
}, { timeout: 5000, polling: 200 })
```

---

## 权限相关 API

这些接口分两层：

### 1. 最终建议脚本层优先使用
- `page.checkPermissions()`
- `page.requestPermissions()`
- `page.ensurePermissions()`
- `page.ensureMacPermissions()`

### 2. 原生 macOS 定向接口
- `page.checkScreenshotPermissions()`
- `page.openMacOSPrivacySettings(section)`
- `page.requestMacPermissions(options)`
- `page.requestMacAutomationPermission(targetApp)`

---

## page.checkPermissions(options?)

跨平台权限预检 facade。

### 参数

```js
{
  capabilities: ['screenCapture', 'accessibility', 'automation'],
  section: 'all'
}
```

### 支持 capability
- `screenCapture`
- `accessibility`
- `inputMonitoring`
- `automation`

### 返回示例

```js
{
  ok: true,
  os: 'darwin',
  capabilities: ['screenCapture', 'accessibility'],
  permissions: {
    ok: true,
    capabilities: {
      screenCapture: { state: 'granted', granted: true },
      accessibility: { state: 'granted', granted: true }
    }
  },
  raw: { ... }
}
```

### 非 macOS 行为

会直接返回“已跳过、无需平台特殊权限预检”的结果。

---

## page.requestPermissions(options?)

跨平台权限请求入口。

### 常见参数

```js
{
  capabilities: ['screenCapture', 'accessibility'],
  openSettings: true,
  strict: false,
  section: 'screenCapture'
}
```

### 返回

返回结构里通常包含：
- `ok`
- `os`
- `capabilities`
- `section`
- `permissions`
- `flow`
- `raw`

如果 `strict: true` 且权限仍未满足，会抛错。

---

## page.ensurePermissions(options?)

严格权限守卫。内部会默认使用：
- `strict: true`

适合脚本开头做前置保护。

---

## page.ensureMacPermissions(options?)

向后兼容别名，推荐在 macOS 自动化脚本开头使用。

### 参数

| 字段 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `openSettingsOnFail` | `boolean` | `true` | 权限不足时是否打开设置页 |
| `section` | `string` | `screenCapture` | 支持 `accessibility` / `inputMonitoring` / `screenCapture` / `automation` / `all` |
| `strict` | `boolean` | `true` | 权限未满足时是否报错 |

### 示例

```js
await page.ensureMacPermissions({
  openSettingsOnFail: true,
  section: 'all',
  strict: true
})
```

---

## page.checkScreenshotPermissions()

读取 native macOS 权限状态。

### 返回示例

```js
{
  os: 'darwin',
  screenCapture: true,
  accessibility: true,
  automation: 'requires runtime AppleEvents trigger',
  ok: true,
  guideScript: 'examples/mac/open-permission-settings.js',
  stableRunner: 'scripts/run_macos_stable.sh'
}
```

---

## page.openMacOSPrivacySettings(section)

打开 macOS 隐私设置页。

### `section` 支持
- `accessibility`
- `inputMonitoring`
- `screenCapture`
- `automation`
- `all`

### 返回示例

```js
{
  os: 'darwin',
  section: 'all',
  opened: ['screenCapture', 'accessibility'],
  failed: [],
  ok: true,
  canAutoAdd: false,
  message: 'macOS does not allow programmatically adding apps...'
}
```

---

## page.requestMacPermissions(options)

触发权限探测，并可选打开设置页。

### 参数

| 字段 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `openSettings` | `boolean` | `true` | 是否打开设置页 |
| `section` | `string` | `screenCapture` | 支持单项或 `all` |

### 返回结构

通常包含：
- `before`
- `after`
- `settings`
- `probes`
- `okBefore`
- `okAfter`
- `ok`

---

## page.requestMacAutomationPermission(targetApp)

显式触发 AppleEvents 权限申请。

### 参数

| 参数 | 类型 | 说明 |
| --- | --- | --- |
| `targetApp` | `string` | 例如 `System Events`、`Finder`、`Safari`、`WeChat` |

### 返回

- `object`

---

# mouse / page.mouse

`mouse` 和 `page.mouse` 指向同一套对象。

## mouse 方法总表

| 方法 | 说明 |
| --- | --- |
| `await mouse.getPos()` | 获取当前鼠标坐标 |
| `await mouse.move(x, y, options?)` | 移动鼠标 |
| `await mouse.click(x, y, options?)` | 点击指定坐标 |
| `await mouse.down(options?)` | 按下鼠标键 |
| `await mouse.up(options?)` | 释放鼠标键 |
| `await mouse.wheel(options)` | 滚轮滚动 |

## mouse.getPos()

返回：

```js
{ x: 100, y: 200 }
```

## mouse.move(x, y, options?)

### 参数

| 参数 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `x` | `number` |  | 目标 x |
| `y` | `number` |  | 目标 y |
| `options.steps` | `number` | `1` | 平滑移动步数 |

### 示例

```js
await mouse.move(500, 300)
await mouse.move(500, 300, { steps: 20 })
```

## mouse.click(x, y, options?)

### 参数

| 字段 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `x` | `number` |  | 点击 x |
| `y` | `number` |  | 点击 y |
| `options.button` | `string` | `left` | `left` / `right` / `middle` |
| `options.clickCount` | `number` | `1` | 点击次数 |
| `options.delay` | `number` | `0` | 每次 down 与 up 之间延迟，毫秒 |

### 示例

```js
await mouse.click(300, 400)
await mouse.click(300, 400, { button: 'right' })
await mouse.click(300, 400, { clickCount: 2, delay: 50 })
```

### 错误条件

- `button` 不是 `left/right/middle`

## mouse.down(options?)

### 参数

| 字段 | 类型 | 默认值 |
| --- | --- | --- |
| `options.button` | `string` | `left` |

## mouse.up(options?)

### 参数

| 字段 | 类型 | 默认值 |
| --- | --- | --- |
| `options.button` | `string` | `left` |

## mouse.wheel(options)

### 参数

| 字段 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `deltaX` | `number` | `0` | 水平滚动距离 |
| `deltaY` | `number` | `0` | 垂直滚动距离 |
| `steps` | `number` | `1` | 拆分成多少步滚动 |
| `delay` | `number` | `0` | 每步间隔，毫秒 |

### 示例

```js
await mouse.wheel({ deltaY: 300 })
await mouse.wheel({ deltaY: -600, steps: 6, delay: 20 })
```

---

# keyboard / page.keyboard

`keyboard` 和 `page.keyboard` 指向同一套对象。

## keyboard 方法总表

| 方法 | 说明 |
| --- | --- |
| `await keyboard.type(text)` | 输入整段文本 |
| `await keyboard.press(key)` | 单键点击 |
| `await keyboard.down(key)` | 按下某键 |
| `await keyboard.up(key)` | 释放某键 |
| `await keyboard.combination(...keys)` | 组合键 |

## keyboard.type(text)

### 参数

| 参数 | 类型 | 说明 |
| --- | --- | --- |
| `text` | `string` | 要输入的文本，不能为空 |

### 返回
- `Promise<void>`

### 示例

```js
await keyboard.type('hello world')
```

### 错误条件
- 空字符串会报错：`input text cannot be empty`

## keyboard.press(key)

### 参数

| 参数 | 类型 | 说明 |
| --- | --- | --- |
| `key` | `string` | 键名，不能为空 |

### 键名归一化示例

| 输入 | 最终键名 |
| --- | --- |
| `Meta` | `command` |
| `Control` | `ctrl` |
| `Enter` | `enter` |
| `ArrowUp` | `up` |
| `ArrowDown` | `down` |
| `ArrowLeft` | `left` |
| `ArrowRight` | `right` |
| `Escape` | `escape` |
| `Space` | `space` |

还支持：
- `F1` ~ `F20`
- `Numpad0` ~ `Numpad9`
- 常见媒体键、浏览器键

### 示例

```js
await keyboard.press('Enter')
await keyboard.press('ArrowDown')
```

## keyboard.down(key)
按下某个键，不释放。

## keyboard.up(key)
释放某个键。

## keyboard.combination(...keys)

按顺序按下所有键，再按相反顺序释放。

### 示例

```js
await keyboard.combination('command', 'c')
await keyboard.combination('Control', 'Shift', 'P')
```

### 错误条件
- 没有传任何 key：`no keys provided`

---

# touchscreen / page.touchscreen

## touchscreen.tap(x, y)

在指定坐标执行一次 tap。

### 参数

| 参数 | 类型 | 说明 |
| --- | --- | --- |
| `x` | `number` | 点击 x |
| `y` | `number` | 点击 y |

### 返回
- `Promise<void>`

### 行为

底层会：
1. 先移动鼠标到坐标
2. 执行左键 down
3. 短暂等待约 50ms
4. 执行左键 up

### 示例

```js
await touchscreen.tap(200, 300)
```

---

# 推荐用法

## 1. 截图并保存到文件

```js
await page.ensureMacPermissions({
  section: 'all',
  openSettingsOnFail: true,
  strict: true
})

const shot = await page.screenshot({
  path: 'temp/shot.png',
  returnType: 'path'
})
console.log(shot)
```

## 2. 读取结构化截图信息

```js
const shot = await page.screenshot({
  target: 'screen',
  returnType: 'object'
})
console.log(shot.width, shot.height)
```

## 3. 组合键

```js
await keyboard.combination('command', 'shift', '4')
```

## 4. 平滑移动后点击

```js
await mouse.move(600, 400, { steps: 12 })
await mouse.click(600, 400, { button: 'left' })
```
