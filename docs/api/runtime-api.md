# TestMonkey 运行时接口文档

更新时间：2026-03-16

## 1. 文档定位

这套框架的主接口不是 Go 包直接调用，而是注入到 Goja JavaScript 运行时中的全局对象。  
因此，AI 生成脚本时应优先面向这里的 JS API，而不是直接猜测 Go 内部实现。

建议运行方式：

```bash
go run main.go -script examples/test.js
go run main.go -http
```

当前主要接口层：

- JS Runtime API
  - 运行脚本时可直接使用 `page`、`mouse`、`keyboard`、`window`、`File`、`Vision` 等全局对象。
- HTTP Server API
  - 启动 `-http` 后可调用 `/SCRIPT_RUN`、`/status`、`/v1/vision/*`。

## 2. AI 使用约束

如果你是给 AI 喂上下文，推荐优先遵守下面这些规则：

1. 优先生成 `.js` 脚本，不要生成旧 `.txt` 指令脚本。
2. 优先使用 `await` 风格。
3. 网络请求优先使用 `axios`，兼容性说明清晰，调用习惯接近 Node.js。
4. 截图优先使用 `page.screenshot()`，不要优先使用旧的 `page.captureScreen()`。
5. 屏幕坐标相关任务，先调用 `Screen.getDisplays()` 或 `window.getActiveWindow()` 再算坐标。
6. OCR 任务优先使用 `Vision.runOCR()` 或 `Vision.detectUI()`；只在明确需要本地 `tesseract` 时再用 `OCR.extractText()`。
7. macOS 自动化脚本在开头优先加 `page.ensureMacPermissions(...)`。
8. 文件输出优先写到 `temp/`、`dist/`、`docs/` 等明确目录，不要把结果散落在仓库根目录。

## 3. 全局对象总览

### 3.1 页面与输入

#### `page`

主页面对象，同时也挂载了 `page.mouse`、`page.keyboard`、`page.touchscreen`。

常用方法：

| 方法 | 说明 |
| --- | --- |
| `await page.waitFor(milliseconds)` | 休眠等待 |
| `await page.screenshot(options?)` | 截图，默认返回 `data:image/png;base64,...`，也支持返回二进制、路径、结构化对象或 `null` |
| `await page.captureScreen(options?)` | 旧截图接口，建议只兼容旧脚本时使用 |
| `await page.goto(url)` | 打开 URL |
| `await page.openURL(url)` | 打开 URL |
| `await page.openApp(appName)` | 打开本地应用 |
| `await page.openURLInApp(appName, url)` | 用指定应用打开 URL |
| `await page.title()` | 读取当前窗口标题，依赖窗口管理实现 |
| `await page.url()` | 当前返回空字符串，暂不适合依赖 |
| `await page.checkScreenshotPermissions()` | 检查 macOS 截图/辅助功能权限 |
| `await page.openMacOSPrivacySettings(section)` | 打开 macOS 权限页 |
| `await page.requestMacPermissions(options)` | 触发权限探测并可选打开权限页 |
| `await page.ensureMacPermissions(options)` | 严格权限守卫 |
| `await page.requestMacAutomationPermission(targetApp)` | 显式触发 AppleEvents 权限弹窗 |

`page.screenshot(options)` 推荐参数：

```js
{
  path: "temp/shot.png",
  returnType: "object", // base64 | bytes | path | object | none
  target: "activeWindow", // "activeWindow" | "screen"
  fullPage: false,
  displayIndex: 0,
  clip: { x: 0, y: 0, width: 800, height: 600 }
}
```

截图规则：

- 默认 `target` 是 `"activeWindow"`。
- `clip` 一旦传入，会优先于 `target`。
- `clip.width` 和 `clip.height` 必须大于 0。
- `displayIndex > 0` 时，适合配合 `target: "screen"` 用于多屏截图。
- 默认 `returnType` 是 `base64`。
- `returnType: "bytes"` 时返回二进制；在 JS 侧表现为 `ArrayBuffer`。
- `returnType: "path"` 时返回保存后的绝对路径；如果未传 `path`，会自动生成临时文件。
- `returnType: "object"` 时返回：

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

- `returnType: "none"` 时不返回图片内容，返回 `null`。

macOS 权限相关：

- `page.checkScreenshotPermissions()` 返回 `{ screenCapture, accessibility, automation, ok }`
- `page.requestMacPermissions({ openSettings: true, section: "all" })`
- `page.ensureMacPermissions({ openSettingsOnFail: true, section: "all", strict: true })`
- `section` 支持：
  - `accessibility`
  - `inputMonitoring`
  - `screenCapture`
  - `automation`
  - `all`

#### `mouse` / `page.mouse`

两者等价。

| 方法 | 说明 |
| --- | --- |
| `await mouse.getPos()` | 返回 `{ x, y }` |
| `await mouse.move(x, y, options?)` | 移动鼠标 |
| `await mouse.click(x, y, options?)` | 点击 |
| `await mouse.down(options?)` | 按下鼠标键 |
| `await mouse.up(options?)` | 释放鼠标键 |
| `await mouse.wheel(options)` | 滚轮滚动 |

`mouse.click(x, y, options)`：

```js
{
  button: "left",   // left | right | middle
  clickCount: 1,
  delay: 0
}
```

`mouse.move(x, y, options)`：

```js
{
  steps: 1
}
```

`mouse.wheel(options)`：

```js
{
  deltaX: 0,
  deltaY: 300,
  steps: 1,
  delay: 0
}
```

#### `keyboard` / `page.keyboard`

两者等价。

| 方法 | 说明 |
| --- | --- |
| `await keyboard.type(text)` | 输入整段文本 |
| `await keyboard.press(key)` | 单键点击 |
| `await keyboard.down(key)` | 按下按键 |
| `await keyboard.up(key)` | 释放按键 |
| `await keyboard.combination(...keys)` | 组合键 |

常见键名会自动归一化：

- `Meta -> command`
- `Control -> ctrl`
- `Enter -> enter`
- `ArrowUp -> up`
- `ArrowDown -> down`
- `ArrowLeft -> left`
- `ArrowRight -> right`

#### `touchscreen` / `page.touchscreen`

| 方法 | 说明 |
| --- | --- |
| `await touchscreen.tap(x, y)` | 触摸点击 |

### 3.2 窗口与系统

#### `window`

跨平台窗口管理对象。

| 方法 | 说明 |
| --- | --- |
| `await window.getActiveWindow()` | 当前前台窗口 |
| `await window.getFocusWindow()` | 当前焦点窗口 |
| `await window.getWindowByTitle(title)` | 按标题查窗口 |
| `await window.list()` | 列出窗口 |
| `await window.focus(title)` | 聚焦窗口 |
| `await window.bringToTop(title, pid?)` | 置顶到前台 |
| `await window.setWindowBounds(title, x, y, width, height)` | 改窗口位置与尺寸 |
| `await window.setWidth(title, width)` | 改宽 |
| `await window.setHeight(title, height)` | 改高 |
| `await window.maximize(title)` | 最大化 |
| `await window.minimize(title)` | 最小化 |
| `await window.restore(title)` | 恢复 |
| `await window.restoreByPID(pid)` | 按 PID 恢复 |
| `await window.minimizeByPID(pid)` | 按 PID 最小化 |
| `await window.maximizeByPID(pid)` | 按 PID 最大化 |
| `await window.closeWindow(title)` | 关闭标题匹配窗口 |
| `await window.closeActiveWindow()` | 关闭当前窗口 |
| `await window.kill(processId)` | 杀进程 |
| `await window.title()` | 当前窗口标题 |
| `await window.getTitle(selector)` | 查询标题 |
| `await window.content()` | 读取内容，平台相关，可能为空 |
| `await window.getContent(selector)` | 查询内容，平台相关，可能为空 |
| `await window.setAlwaysOnTop(title, true/false)` | 置顶 |
| `await window.unsetTopMost(title)` | 取消置顶 |

`window.getActiveWindow()` / `window.getWindowByTitle()` 返回的典型结构：

```js
{
  title: "Safari",
  pid: 12345,
  x: 12,
  y: 34,
  width: 1440,
  height: 900,
  exeName: "Safari",
  exePath: "/Applications/Safari.app/Contents/MacOS/Safari",
  isForeground: true,
  hasFocus: true,
  handle: 0,
  isPopup: false,
  index: 0
}
```

#### `System`

系统信息对象，能力偏底层，部分方法有副作用。

信息读取：

- `System.getProcessList()`
- `System.getNetworkInterfaces()`
- `System.getNetworkConnections()`
- `System.getPowerInfo()`
- `System.getDirectoryContents(path)`
- `System.getExecutablePath()`
- `System.getWorkingDirectory()`
- `System.getUserInfo()`
- `System.getSystemMetrics()`
- `System.getFingerprint()`
- `System.getSystemInfo()`
- `System.toJSON(data)`
- `System.isAdministrator()`

系统控制：

- `System.killProcess(pid)`
- `System.shutdown(delay)`
- `System.restart(delay)`
- `System.sleep()`

副作用说明：

- `shutdown` / `restart` / `sleep` 会直接影响宿主机器，不建议让 AI 默认生成。

#### `Screen`

屏幕与显示器信息对象。

| 方法 | 说明 |
| --- | --- |
| `Screen.getWidth()` | 主屏逻辑宽度 |
| `Screen.getHeight()` | 主屏逻辑高度 |
| `Screen.getDisplays()` | 所有显示器信息 |
| `Screen.getPrimaryDisplay()` | 主显示器 |
| `Screen.getDisplay(index)` | 按 1-based 下标读显示器 |
| `Screen.getVirtualBounds()` | 所有屏的虚拟边界 |
| `Screen.pixel(x, y)` | 返回 `#RRGGBB` |
| `Screen.pixels(points, scaled?)` | 批量取色 |
| `Screen.screenshot(options?)` | `page.screenshot` 的别名 |

`Screen.getDisplays()` 返回字段：

- `index`
- `id`
- `isPrimary`
- `x`
- `y`
- `width`
- `height`
- `pixelWidth`
- `pixelHeight`
- `scale`

### 3.3 网络、文件、存储

#### `axios`

Promise 风格，推荐优先使用。

| 方法 | 说明 |
| --- | --- |
| `await axios.get(url, config?)` | GET |
| `await axios.post(url, data?, config?)` | POST |
| `await axios.put(url, data?, config?)` | PUT |
| `await axios.patch(url, data?, config?)` | PATCH |
| `await axios.delete(url, config?)` | DELETE |

`config` 支持：

```js
{
  params: { q: "abc" },      // 仅 GET 自动拼 query
  headers: { Authorization: "Bearer xxx" }
}
```

返回：

```js
{
  data: any,
  status: 200,
  statusText: "200 OK",
  headers: { ... },
  config: { ... }
}
```

说明：

- 默认会带固定 Chrome 风格 `User-Agent`。
- 字符串 body 会自动判断 `Content-Type`。
- 对象 body 会按 JSON 编码。

#### `http`

同步风格 HTTP 客户端。

| 方法 | 说明 |
| --- | --- |
| `await http.request(options)` | 通用请求 |
| `await http.get(url, options?)` | GET |
| `await http.post(url, data, options?)` | POST |

`http.request(options)` 支持：

```js
{
  method: "GET",
  url: "https://example.com",
  headers: { "X-Token": "abc" },
  data: { hello: "world" }
}
```

#### `File`

文件系统对象，所有相对路径都相对于当前工作目录。

常用方法：

- `File.path(relativePath)`
- `File.cwd()`
- `File.exists(path)`
- `File.ensureDir(path)`
- `File.create(path)`
- `File.createIfNotExists(path)`
- `File.createWithDirs(path)`
- `File.read(path)`
- `File.readBytes(path)`
- `File.write(path, text)`
- `File.writeBytes(path, bytes)`
- `File.append(path, text)`
- `File.appendBytes(path, bytes)`
- `File.copy(pathFrom, pathTo)`
- `File.move(path, newPath)`
- `File.rename(path, newName)`
- `File.renameWithoutExtension(path, newName)`
- `File.remove(path)`
- `File.removeDir(path)`
- `File.listDir(path)`
- `File.isFile(path)`
- `File.isDir(path)`
- `File.isEmptyDir(path)`
- `File.join(parent, ...children)`
- `File.getExtension(fileName)`
- `File.getName(filePath)`
- `File.getNameWithoutExtension(filePath)`
- `File.getHumanReadableSize(bytes)`
- `File.getSimplifiedPath(path)`
- `File.open(path, mode)`

AI 推荐：

- 文本输出优先 `File.write("temp/result.json", JSON.stringify(obj, null, 2))`
- 长期报告可用 `File.append(...)`

#### `AppStorage`

轻量持久化 KV，落盘到：

```text
~/.testmonkey/testMonkey/storage.json
```

方法：

- `AppStorage.getItem(key)`
- `AppStorage.setItem(key, value)`
- `AppStorage.removeItem(key)`
- `AppStorage.clear()`
- `AppStorage.getLength()`
- `AppStorage.key(index)`

说明：

- 实际存储值会转成字符串。
- 适合保存 token、上次执行状态、缓存路径。

#### `clipboard`

系统剪贴板接口。

| 方法 | 说明 |
| --- | --- |
| `await clipboard.copy(text)` | 复制文本 |
| `await clipboard.paste()` | 读取文本 |
| `await clipboard.clear()` | 清空，内部会写一个空格 |

注意：

- 空字符串复制时内部会退化成单个空格，避免底层复制失败。

### 3.4 OCR、图像、视觉

#### `Vision`

推荐优先使用，面向“从截图里找文本/元素”。

| 方法 | 说明 |
| --- | --- |
| `await Vision.getCapabilities(options?)` | 查询 OCR provider 能力 |
| `await Vision.runOCR(options)` | OCR |
| `await Vision.detectUI(options)` | 文本 UI 元素探测 |

`Vision.runOCR(options)` 常用参数：

```js
{
  image: "temp/a.png", // 也可以是 { path } / { base64 } / Uint8Array / ArrayBuffer / data URL / 纯 base64 字符串
  imageBytes: new Uint8Array([137, 80, 78, 71]),
  imagePath: "temp/a.png",
  imageBase64: "data:image/png;base64,...",
  provider: "paddle",
  lang: "ch",
  timeoutMs: 12000,
  detectOrientation: true,
  recognizeDirection: true,
  includeRaw: false
}
```

返回：

```js
{
  provider: "paddle",
  lang: "ch",
  text: "识别出的全文",
  lines: [
    {
      text: "发送",
      confidence: 0.99,
      bbox: { x: 100, y: 200, width: 80, height: 24 }
    }
  ],
  lineCount: 1
}
```

`Vision.detectUI(options)` 常用参数：

```js
{
  image: screenshotBytes, // 也可以是 { path: "temp/a.png" } / Uint8Array / ArrayBuffer / { bytes }
  imagePath: "temp/a.png",
  provider: "paddle",
  lang: "ch",
  targetText: "发送",
  matchMode: "contains", // contains | exact
  minConfidence: 0.5,
  defaultRole: "text"
}
```

返回：

```js
{
  provider: "paddle",
  lang: "ch",
  text: "全文",
  count: 1,
  elements: [
    {
      role: "button",
      text: "发送",
      bbox: { x: 100, y: 200, width: 80, height: 24 },
      score: 0.99,
      clickPoint: { x: 140, y: 212 }
    }
  ]
}
```

实现状态：

- 默认 provider 是 `paddle`
- `openai`、`azure`、`google`、`aws` 在当前版本里只是预留名，未真正实现
- `paddle` 需要环境变量 `PADDLE_OCR_ENDPOINT`
- `image` / `imageBytes` 支持 `Uint8Array`、`ArrayBuffer`、`number[]`
- `image.mediaId` 和 `image.url` 字段已预留，但当前版本未实现

#### `OCR`

本地 OCR，对外是：

- `await OCR.extractText(image, lang?)`

参数：

- `image` 支持文件路径或 `data:image/...;base64,...`
- `lang` 默认 `chi_sim+eng`

依赖：

- 必须有本地 `tesseract`
- 如果有 `magick`，框架会自动尝试增强图片后再 OCR

#### `ImageColor`

图像颜色分析和模板定位。

常用方法：

- `ImageColor.loadBase64(imagePath)`
- `ImageColor.getSize(image)`
- `ImageColor.pixel(image, x, y)`
- `ImageColor.clip(image, { x, y, width, height })`
- `ImageColor.save(image, path, format?, quality?)`
- `ImageColor.findPos(sourceImage, templateImage, ...args)`
- `ImageColor.findColor(image, color, options?)`
- `ImageColor.findColorBlocks(image, color, options?)`
- `ImageColor.analyzeLayout(image, options?)`
- `ImageColor.hasColor(image, color, x?, y?, width?, height?, threshold?)`
- `ImageColor.isGray(image, x?, y?, width?, height?, threshold?)`
- `ImageColor.findRedChannel(image, x?, y?, width?, height?)`
- `ImageColor.findGreenChannel(image, x?, y?, width?, height?)`
- `ImageColor.findBlueChannel(image, x?, y?, width?, height?)`
- `ImageColor.toRGB(color)`
- `ImageColor.toRGBA(color)`
- `ImageColor.toHSL(color)`
- `ImageColor.toHSLA(color)`
- `ImageColor.isColorSimilar(targetColor, gradientColor, tolerance)`

`findColor` / `findColorBlocks` 的 `options`：

```js
{
  x: 0,
  y: 0,
  width: 500,
  height: 300,
  threshold: 5
}
```

返回注意：

- `findColor()` 返回的是 JSON 字符串，不是对象。例如 `{"x":10,"y":20,"found":true}`
- `findColorBlocks()` 返回数组对象
- `pixel()` 返回 `#RRGGBB`

`analyzeLayout(image, options)` 适合做通用窗口布局分割，返回 coarse `regions`、`separators`、`floodRegions`、`warnings`、`grid`、`debug`。

推荐参数：

```js
{
  cellSize: 10,
  quantize: 16,
  tolerance: 32,
  minRegionArea: 4,
  maxRegions: 24,
  maxDepth: 6,
  minSplitSpan: 4,
  minSeparatorScore: 0.08,
  maxSeparatorCandidates: 8,
  separatorHints: {
    vertical: [
      { label: "left-pane", from: 0.04, to: 0.14 },
      { label: "main-pane", from: 0.18, to: 0.40 }
    ],
    horizontal: [
      { label: "header", from: 0.04, to: 0.18 },
      { label: "input", from: 0.68, to: 0.92 }
    ]
  }
}
```

说明：

- Go core 只做通用 segmentation，不内置某个 app 的固定 band 或 fallback ratio
- `separatorHints` 是可选的通用 hint，适合在 JS 层为特定 app 提供先验
- `regions` 是通用 coarse layout 区域，不保证直接带有业务语义名
- `separators[*].confidence` / `regions[*].confidence` 可用于区分高低置信边界

### 3.5 通知、日志、声音、浮窗

#### `notify(...)`

全局函数，不是对象。

支持两种调用：

```js
await notify("任务完成");
await notify({
  title: "标题",
  message: "正文",
  sound: true,
  timeout: 5000
});
```

说明：

- 底层实际使用的字段主要是 `title`、`message`、`sound`、`timeout`
- 当前实现没有真正根据 `type` 分流通知样式

#### `console`

| 方法 | 说明 |
| --- | --- |
| `console.log(...args)` | 普通日志 |
| `console.info(...args)` | 信息 |
| `console.warn(...args)` | 警告 |
| `console.error(...args)` | 错误 |
| `console.debug(...args)` | 调试 |
| `console.clear()` | 清屏 |
| `console.table(data)` | 表格输出 |
| `console.group(label)` | 分组开始 |
| `console.groupEnd(label)` | 分组结束 |
| `console.time(label)` | 计时开始 |
| `console.timeEnd(label)` | 计时结束 |

#### `Sound`

| 方法 | 说明 |
| --- | --- |
| `Sound.play(path)` | 播放指定音频 |
| `Sound.playSound(path)` | 同上 |
| `Sound.playSuccess()` | 成功提示音 |
| `Sound.playFail()` | 失败提示音 |
| `Sound.playWarning()` | 警告提示音 |
| `Sound.playError()` | 错误提示音 |
| `Sound.playCaptcha()` | 验证码提示音 |

#### `FloatingWindow`

桌面悬浮窗接口，适合长时运行脚本或手工辅助操作。

| 方法 | 说明 |
| --- | --- |
| `FloatingWindow.show()` | 显示 |
| `FloatingWindow.hide()` | 隐藏 |
| `FloatingWindow.run()` | 运行 |
| `FloatingWindow.setPosition(x, y)` | 设置位置 |
| `FloatingWindow.setAlwaysOnTop(bool)` | 置顶 |
| `FloatingWindow.addButton(id, label, iconName)` | 加按钮 |
| `FloatingWindow.removeButton(id)` | 删按钮 |
| `FloatingWindow.onButtonClick(buttonID, callback)` | 绑定点击回调 |

## 4. 运行时辅助能力

### 定时器

运行时已注入：

- `setTimeout`
- `clearTimeout`
- `setInterval`
- `clearInterval`

风格与浏览器近似，可直接配合 `Promise` 使用。

### 全局对象与第三方库

运行时会先加载：

- `polyfills/*.js`
- `jslibs/*.js`

当前仓库内已存在的 JS 库文件：

- `beautify1.14.9.js`
- `cheerio.js`
- `lodash.min.js`
- `moment.min.js`
- `query-string.min.js`

因此生成脚本时可以合理假设这些库会被注入，但如果要长期稳定，仍建议在脚本开头显式检查依赖是否存在。

## 5. 推荐脚本模板

### 5.1 UI 自动化模板

```js
async function main() {
  await page.ensureMacPermissions({
    openSettingsOnFail: true,
    section: "all",
    strict: true,
  });

  const active = await window.getActiveWindow();
  console.log("active:", active);

  await page.screenshot({
    path: "temp/current.png",
    target: "activeWindow",
  });

  const ocr = await Vision.runOCR({
    imagePath: "temp/current.png",
    provider: "paddle",
    lang: "ch",
  });

  console.log(JSON.stringify(ocr, null, 2));
}

main().catch((err) => {
  console.error(err);
  throw err;
});
```

### 5.2 OCR 找按钮并点击

```js
const shot = "temp/ui.png";

await page.screenshot({ path: shot, target: "activeWindow" });

const result = await Vision.detectUI({
  imagePath: shot,
  provider: "paddle",
  lang: "ch",
  targetText: "发送",
  matchMode: "contains",
  minConfidence: 0.5,
  defaultRole: "button",
});

if (result.count > 0) {
  const target = result.elements[0];
  await mouse.click(target.clickPoint.x, target.clickPoint.y);
}
```

### 5.3 网络请求并落盘

```js
const res = await axios.get("https://httpbin.org/get", {
  params: { source: "testmonkey" },
});

await File.ensureDir("temp");
await File.write("temp/http.json", JSON.stringify(res.data, null, 2));
```

## 6. HTTP Server API

启动：

```bash
go run main.go -http
```

默认端口：

- `60844`

统一响应结构：

```json
{
  "code": 0,
  "message": "Success",
  "data": {}
}
```

### `POST /executions`

用途：

- 创建一条新的脚本执行任务。
- 返回 `executionId`、产物目录和后续查询入口。
- 适合长时任务、多任务并发和 Agent 驱动场景。

请求体：

```json
{
  "script": "for (let i = 0; i < 3; i++) { console.log('tick-' + i); await page.waitFor(120); }",
  "timeout": 120
}
```

成功响应示例：

```json
{
  "code": 0,
  "message": "success",
  "data": {
    "executionId": "http-20260412-040908-743000",
    "status": "running",
    "statusUrl": "/executions/http-20260412-040908-743000",
    "summaryUrl": "/executions/http-20260412-040908-743000/summary",
    "streamUrl": "/executions/http-20260412-040908-743000/events",
    "artifacts": {
      "runDir": "artifacts/runs/http-20260412-040908-743000",
      "stdoutPath": "artifacts/runs/http-20260412-040908-743000/stdout.log",
      "stderrPath": "artifacts/runs/http-20260412-040908-743000/stderr.log",
      "scriptSnapshotPath": "artifacts/runs/http-20260412-040908-743000/script_snapshot.js",
      "summaryPath": "artifacts/runs/http-20260412-040908-743000/summary.json",
      "agentSummaryPath": "artifacts/runs/http-20260412-040908-743000/agent_summary.json",
      "eventLogPath": "artifacts/runs/http-20260412-040908-743000/events.ndjson"
    }
  }
}
```

### `GET /executions/{id}`

用途：

- 获取单次执行的当前状态快照。

返回示例：

```json
{
  "code": 0,
  "message": "success",
  "data": {
    "executionId": "http-20260412-040908-743000",
    "status": "running",
    "source": "http:inline",
    "scriptHash": "acaf212509789ca067630c550bf412115be3851ba54ad511a3a2289ffb63e282",
    "artifacts": {
      "runDir": "artifacts/runs/http-20260412-040908-743000"
    },
    "counters": {
      "totalEvents": 29,
      "scriptLogs": 0,
      "errorLogs": 0
    }
  }
}
```

### `GET /executions/{id}/summary`

用途：

- 获取最终 Agent 小摘要。
- 适合 Agent 直接读取，不需要解析完整 stdout。

返回示例：

```json
{
  "code": 0,
  "message": "success",
  "data": {
    "schemaVersion": "0.1.0",
    "executionId": "http-20260412-040908-743000",
    "status": "succeeded",
    "durationMs": 531,
    "source": "http:inline",
    "scriptHash": "acaf212509789ca067630c550bf412115be3851ba54ad511a3a2289ffb63e282",
    "scriptLogs": [
      {"level": "info", "message": "sse-0"},
      {"level": "info", "message": "sse-1"},
      {"level": "info", "message": "sse-2"}
    ],
    "artifacts": {
      "agentSummaryPath": "artifacts/runs/http-20260412-040908-743000/agent_summary.json",
      "eventLogPath": "artifacts/runs/http-20260412-040908-743000/events.ndjson"
    }
  }
}
```

### `GET /executions/{id}/events`

用途：

- 通过 SSE 持续推送单次执行的实时事件。
- 默认推送 `meta`、`script`、`summary`、`error`，不默认推送 framework 噪音。

示例：

```bash
curl -N http://localhost:60844/executions/<executionId>/events
```

可选参数：

- `categories=meta,script,summary,error`

事件类型示例：

- `status`
- `log`
- `summary`
- `done`

### `POST /SCRIPT_RUN`

用途：

- 旧兼容接口。
- 内部会转成新的 execution 流程。

请求体：

```json
{
  "script": "await page.waitFor(1000); console.log('ok');"
}
```

成功响应中会返回 `executionId` 和后续查询地址。

### `GET /status`

用途：

- 返回服务健康状态。
- 若存在最近一次 execution，会同时返回 `latestExecution` 快照。

返回示例：

```json
{
  "status": "ok",
  "runtime_pool": 10,
  "vision_enabled": true,
  "timestamp": 1775938065,
  "latestExecution": {
    "executionId": "http-20260412-040908-743000",
    "status": "running"
  }
}
```

### `POST /v1/vision/ocr`

请求体与 `Vision.runOCR(options)` 基本一致。

支持三种请求方式：

- `application/json`
- `multipart/form-data`
- `image/*` 或 `application/octet-stream`

常见字段：

- `image`
- `imageBytes`
- `imagePath`
- `imageBase64`
- `provider`
- `lang`
- `timeoutMs`
- `includeRaw`

`multipart/form-data` 额外说明：

- 可上传文件字段：`imageFile`、`image`、`file`、`upload`
- 上传文件会先落到临时文件，再按 `imagePath` 方式进入 Vision 流程

原始二进制请求体说明：

- 当 `Content-Type` 是 `image/*` 或 `application/octet-stream` 时，请求体会直接作为图片二进制读入
- 其它参数可放在 query string，例如 `?provider=paddle&lang=ch`

### `POST /v1/vision/detect-ui`

请求体与 `Vision.detectUI(options)` 基本一致。

支持三种请求方式：

- `application/json`
- `multipart/form-data`
- `image/*` 或 `application/octet-stream`

常见字段：

- `image`
- `imageBytes`
- `imagePath`
- `imageBase64`
- `provider`
- `lang`
- `targetText`
- `matchMode`
- `minConfidence`
- `defaultRole`

`multipart/form-data` 额外说明：

- 可上传文件字段：`imageFile`、`image`、`file`、`upload`
- 上传文件会先落到临时文件，再按 `imagePath` 方式进入 Vision 流程

原始二进制请求体说明：

- 当 `Content-Type` 是 `image/*` 或 `application/octet-stream` 时，请求体会直接作为图片二进制读入
- 其它参数可放在 query string，例如 `?provider=paddle&lang=ch&targetText=%E5%8F%91%E9%80%81`

### `GET|POST /v1/vision/capabilities`

用途：

- 查询 OCR provider 能力。

支持：

- `GET /v1/vision/capabilities`
- `GET /v1/vision/capabilities?provider=paddle`
- `POST /v1/vision/capabilities`

### `GET /`

用途：

- 返回 `public/index.html`
- 如果不存在，则返回内置 HTML 页面

## 7. 已知限制

1. `Vision` 当前只有 `paddle` 真正可用，其它 provider 只是保留名。
2. `page.url()` 现在不适合作为真实浏览器 URL 来源。
3. `window.content()` / `window.getContent()` 跨平台差异较大，可能为空。
4. `clipboard.clear()` 实际写入的是单个空格，不是严格空字符串。
5. `ImageColor.findColor()` 返回 JSON 字符串，这一点和其它对象风格不一致。
6. `FloatingWindow` 依赖桌面 GUI 环境。
7. macOS 下截图、辅助功能、AppleEvents 权限没有准备好时，很多自动化脚本会失败。

## 8. 相关示例

建议先看这些示例脚本：

- `examples/page.js`
- `examples/mouse.js`
- `examples/keyboard.js`
- `examples/http.js`
- `examples/window-more.js`
- `examples/file.js`
- `examples/system.js`
- `examples/imageColor.js`
- `examples/vision.ocr.js`
- `examples/mac/request-macos-permissions.js`
- `examples/mac/automation-permission-wizard.js`
