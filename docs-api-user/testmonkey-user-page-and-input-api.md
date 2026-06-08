---
title: TestMonkey 页面与输入 API
description: 面向用户的 page、mouse、keyboard、touchscreen 文档，覆盖方法、参数、返回值与示例。
order: 20
---

# TestMonkey 页面与输入 API

更新时间：2026-05-18

这是最核心的一页。

如果你要写 TestMonkey 自动化脚本，优先读这里。

本文覆盖：
- `page`
- `mouse`
- `keyboard`
- `touchscreen`

## 1. page

`page` 是脚本主入口，同时还挂载：
- `page.mouse`
- `page.keyboard`
- `page.touchscreen`

来源：
- 原生实现：`automation/page.go`
- 增强封装：`polyfills/000-page.js`

### 1.1 page 方法总表

| 方法 | 说明 |
| --- | --- |
| `await page.screenshot(options?)` | 截图 |
| `await page.goto(url)` | 打开 URL |
| `await page.openURL(url)` | `goto` 别名 |
| `await page.openApp(appName)` | 打开应用 |
| `await page.openURLInApp(appName, url)` | 用指定应用打开 URL |
| `page.title()` | 获取当前窗口标题 |
| `page.url()` | 获取内部 URL/Executable 字段 |
| `await page.waitFor(msOrFunction, options?)` | 等待固定时间或等待函数返回 truthy |
| `await page.waitForTimeout(ms)` | 固定等待 |
| `await page.waitForNavigation(options?)` | 等待 `page.url()` 变化 |
| `await page.waitForFunction(fn, options?, ...args)` | 轮询函数直到满足条件 |
| `await page.checkPermissions(options?)` | 权限预检 |
| `await page.requestPermissions(options?)` | 权限请求 |
| `await page.ensurePermissions(options?)` | 严格权限检查 |
| `await page.ensureMacPermissions(options?)` | macOS 权限检查兼容入口 |
| `await page.checkScreenshotPermissions()` | 原生截图/辅助功能权限检查 |
| `await page.openMacOSPrivacySettings(section)` | 打开 macOS 设置页 |
| `await page.requestMacPermissions(options)` | 请求 macOS 相关权限 |
| `await page.requestMacAutomationPermission(targetApp)` | 请求 AppleEvents 自动化权限 |

---

### 1.2 page.screenshot(options)

用于截图当前活动窗口、整屏或指定区域。

#### 最简单示例

```js
const image = await page.screenshot()
```

默认返回：
- `data:image/png;base64,...`

#### 保存到文件

```js
const filePath = await page.screenshot({
  path: 'temp/shot.png',
  returnType: 'path'
})
```

#### 返回结构化信息

```js
const info = await page.screenshot({
  target: 'screen',
  returnType: 'object'
})
```

#### 参数表

| 字段 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `path` | `string` | 空 | 保存路径。若 `returnType` 是 `path/object` 且不传，会自动生成临时文件 |
| `type` | `string` | `png` | 截图类型 |
| `quality` | `number` | `100` | 图片质量 |
| `fullPage` | `boolean` | `false` | 触发整屏截图逻辑 |
| `omitBackground` | `boolean` | `false` | 背景处理兼容参数 |
| `encoding` | `string` | `binary` | 兼容参数 |
| `returnType` | `string` | `base64` | `base64` / `bytes` / `path` / `object` / `none` |
| `target` | `string` | `activeWindow` | `activeWindow` 或 `screen` |
| `displayIndex` | `number` | `0` | 显示器索引；大于 0 时按指定显示器处理 |
| `clip` | `object` | 空 | 裁剪区域 |
| `clip.x` | `number` |  | 裁剪起点 x |
| `clip.y` | `number` |  | 裁剪起点 y |
| `clip.width` | `number` |  | 裁剪宽度，必须 > 0 |
| `clip.height` | `number` |  | 裁剪高度，必须 > 0 |

#### 返回值

##### `returnType: 'base64'`
```js
"data:image/png;base64,..."
```

##### `returnType: 'bytes'`
返回 PNG 二进制内容。

##### `returnType: 'path'`
```js
"/abs/path/to/file.png"
```

##### `returnType: 'object'`
```js
{
  path: '/abs/path/to/file.png',
  mimeType: 'image/png',
  width: 1440,
  height: 900,
  sizeBytes: 182344,
  source: 'activeWindow | screen | clip',
  backend: 'robotgo | darwin-screencapture'
}
```

##### `returnType: 'none'`
返回 `null`。

#### 规则说明

1. 如果传了 `clip`
- `clip` 优先级最高
- 会按绝对桌面坐标裁剪

2. 如果：
- `fullPage === true`
- 或 `target === 'screen'`

则走整屏截图逻辑。

3. 默认情况下
- 尝试获取活动窗口边界并截图
- 如果失败，会回退到整屏截图

4. macOS 下
- 某些模式优先使用 `screencapture`
- 失败后可能回退到 `robotgo`

#### 常见错误

- `returnType` 非法
- `target` 非法
- `clip.width <= 0` 或 `clip.height <= 0`
- `displayIndex < 0`

---

### 1.3 page.goto(url)

打开 URL。

#### 参数

| 参数 | 类型 | 说明 |
| --- | --- | --- |
| `url` | `string` | 目标 URL |

#### 返回
- `Promise<void>`

#### 示例

```js
await page.goto('https://example.com')
```

---

### 1.4 page.openURL(url)

`page.goto(url)` 的别名。

```js
await page.openURL('https://example.com')
```

---

### 1.5 page.openApp(appName)

打开本地应用。

#### 参数

| 参数 | 类型 | 说明 |
| --- | --- | --- |
| `appName` | `string` | 应用名称，不能为空 |

#### 示例

```js
await page.openApp('Safari')
await page.openApp('WeChat')
```

---

### 1.6 page.openURLInApp(appName, url)

用指定应用打开 URL。

#### 参数

| 参数 | 类型 | 说明 |
| --- | --- | --- |
| `appName` | `string` | 应用名，可为空 |
| `url` | `string` | 目标 URL，不能为空 |

#### 示例

```js
await page.openURLInApp('Safari', 'https://example.com')
```

---

### 1.7 page.title()

返回当前前台窗口标题。

```js
const title = page.title()
```

返回类型：
- `string`

说明：
- 更接近“当前窗口标题”
- 不是浏览器网页的 DOM title

---

### 1.8 page.url()

返回内部 `Executable` 字段。

返回类型：
- `string`

注意：
- 当前实现不是标准浏览器 URL 读取器
- 不要把它当 Puppeteer 的 `page.url()` 使用
- `page.waitForNavigation()` 也是基于这个值判断的，因此可靠性有限

---

### 1.9 page.waitFor(msOrFunction, options?)

polyfill 提供的增强等待接口。

#### 用法 1：固定等待

```js
await page.waitFor(1000)
```

#### 用法 2：轮询函数

```js
await page.waitFor(() => {
  return Screen.pixel(100, 100) === '#ffffff'
}, { timeout: 5000, polling: 200 })
```

#### options

| 字段 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `timeout` | `number` | `30000` | 最大等待时间 |
| `polling` | `number` | `100` | 轮询间隔 |

---

### 1.10 page.waitForTimeout(ms)

固定等待。

```js
await page.waitForTimeout(500)
```

---

### 1.11 page.waitForNavigation(options?)

轮询 `page.url()` 是否变化。

#### 参数

| 字段 | 类型 | 默认值 |
| --- | --- | --- |
| `timeout` | `number` | `30000` |

注意：
- 因为 `page.url()` 当前不可靠，这个方法更适合兼容旧脚本
- 新脚本不建议把它作为高可靠导航判断手段

---

### 1.12 page.waitForFunction(fn, options?, ...args)

循环执行函数，直到返回 truthy。

#### 参数

| 参数 | 类型 | 说明 |
| --- | --- | --- |
| `fn` | `function` | 被轮询的函数 |
| `options.timeout` | `number` | 超时时间，默认 `30000` |
| `options.polling` | `number` | 轮询间隔，默认 `100` |
| `...args` | `any[]` | 额外参数 |

#### 示例

```js
await page.waitForFunction(() => {
  return Screen.pixel(100, 100) === '#ffffff'
}, { timeout: 5000, polling: 200 })
```

---

### 1.13 权限 API

优先使用这些脚本层接口：
- `page.checkPermissions()`
- `page.requestPermissions()`
- `page.ensurePermissions()`
- `page.ensureMacPermissions()`

#### page.checkPermissions(options?)

```js
const report = await page.checkPermissions({
  capabilities: ['screenCapture', 'accessibility', 'automation']
})
```

支持 capability：
- `screenCapture`
- `accessibility`
- `inputMonitoring`
- `automation`

#### page.requestPermissions(options?)

常见参数：

```js
{
  capabilities: ['screenCapture', 'accessibility'],
  openSettings: true,
  strict: false,
  section: 'screenCapture'
}
```

#### page.ensurePermissions(options?)

严格权限守卫，内部默认 `strict: true`。

#### page.ensureMacPermissions(options?)

最常用的 macOS 权限入口。

参数：

| 字段 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `openSettingsOnFail` | `boolean` | `true` | 权限不足时打开设置页 |
| `section` | `string` | `screenCapture` | `accessibility` / `inputMonitoring` / `screenCapture` / `automation` / `all` |
| `strict` | `boolean` | `true` | 不满足时是否抛错 |

示例：

```js
await page.ensureMacPermissions({
  section: 'all',
  openSettingsOnFail: true,
  strict: true
})
```

#### page.checkScreenshotPermissions()

返回原生权限检查结构，例如：

```js
{
  os: 'darwin',
  screenCapture: true,
  accessibility: true,
  automation: 'requires runtime AppleEvents trigger',
  ok: true
}
```

#### page.openMacOSPrivacySettings(section)

`section` 支持：
- `accessibility`
- `inputMonitoring`
- `screenCapture`
- `automation`
- `all`

#### page.requestMacPermissions(options)

请求/探测 macOS 权限。

#### page.requestMacAutomationPermission(targetApp)

显式触发 AppleEvents 权限申请，例如：

```js
await page.requestMacAutomationPermission('Finder')
```

---

## 2. mouse / page.mouse

`mouse` 和 `page.mouse` 指向同一套对象。

### 方法总表

| 方法 | 说明 |
| --- | --- |
| `await mouse.getPos()` | 获取当前鼠标坐标 |
| `await mouse.move(x, y, options?)` | 移动鼠标 |
| `await mouse.click(x, y, options?)` | 点击指定坐标 |
| `await mouse.down(options?)` | 按下鼠标键 |
| `await mouse.up(options?)` | 释放鼠标键 |
| `await mouse.wheel(options)` | 滚轮滚动 |

### mouse.getPos()

返回：

```js
{ x: 100, y: 200 }
```

### mouse.move(x, y, options?)

参数：

| 参数 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `x` | `number` |  | 目标 x |
| `y` | `number` |  | 目标 y |
| `options.steps` | `number` | `1` | 平滑移动步数 |

示例：

```js
await mouse.move(500, 300)
await mouse.move(500, 300, { steps: 20 })
```

### mouse.click(x, y, options?)

参数：

| 字段 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `x` | `number` |  | 点击 x |
| `y` | `number` |  | 点击 y |
| `options.button` | `string` | `left` | `left` / `right` / `middle` |
| `options.clickCount` | `number` | `1` | 点击次数 |
| `options.delay` | `number` | `0` | 每次 down/up 间延迟 |

示例：

```js
await mouse.click(300, 400)
await mouse.click(300, 400, { button: 'right' })
await mouse.click(300, 400, { clickCount: 2, delay: 50 })
```

### mouse.down(options?)

参数：
- `options.button`，默认 `left`

### mouse.up(options?)

参数：
- `options.button`，默认 `left`

### mouse.wheel(options)

参数：

| 字段 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `deltaX` | `number` | `0` | 水平滚动距离 |
| `deltaY` | `number` | `0` | 垂直滚动距离 |
| `steps` | `number` | `1` | 拆成多少步滚动 |
| `delay` | `number` | `0` | 每步延迟，毫秒 |

示例：

```js
await mouse.wheel({ deltaY: 300 })
await mouse.wheel({ deltaY: -600, steps: 6, delay: 20 })
```

---

## 3. keyboard / page.keyboard

`keyboard` 和 `page.keyboard` 指向同一套对象。

### 方法总表

| 方法 | 说明 |
| --- | --- |
| `await keyboard.type(text)` | 输入整段文本 |
| `await keyboard.press(key)` | 单键点击 |
| `await keyboard.down(key)` | 按下某键 |
| `await keyboard.up(key)` | 释放某键 |
| `await keyboard.combination(...keys)` | 组合键 |

### keyboard.type(text)

- `text` 不能为空
- 返回 `Promise<void>`

```js
await keyboard.type('hello world')
```

### keyboard.press(key)

常见键名归一化：

| 输入 | 归一化结果 |
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

也支持：
- `F1` ~ `F20`
- `Numpad0` ~ `Numpad9`
- 常见媒体键和浏览器键

示例：

```js
await keyboard.press('Enter')
await keyboard.press('ArrowDown')
```

### keyboard.down(key)
按下但不释放。

### keyboard.up(key)
释放按键。

### keyboard.combination(...keys)
按顺序按下所有键，再按相反顺序释放。

```js
await keyboard.combination('command', 'c')
await keyboard.combination('Control', 'Shift', 'P')
```

---

## 4. touchscreen / page.touchscreen

### touchscreen.tap(x, y)

在指定坐标执行 tap。

参数：

| 参数 | 类型 | 说明 |
| --- | --- | --- |
| `x` | `number` | 点击 x |
| `y` | `number` | 点击 y |

返回：
- `Promise<void>`

示例：

```js
await touchscreen.tap(200, 300)
```

---

## 5. 推荐组合用法

### 截图并保存

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
```

### 结构化截图结果

```js
const shot = await page.screenshot({
  target: 'screen',
  returnType: 'object'
})
console.log(shot.width, shot.height)
```

### 组合键

```js
await keyboard.combination('command', 'shift', '4')
```
