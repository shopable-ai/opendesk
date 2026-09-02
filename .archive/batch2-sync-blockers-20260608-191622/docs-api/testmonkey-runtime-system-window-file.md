---
title: TestMonkey 系统、窗口与文件接口
description: 面向脚本作者的系统层 API 文档，完整覆盖 window、Screen、System、File、clipboard 与 console。
order: 40
---

# TestMonkey 系统、窗口与文件接口

更新时间：2026-05-18

本文聚焦：
- `window`
- `Screen`
- `System`
- `File`
- `clipboard`
- `console`

## window

来源：`automation/window_manager_core.go`

`window` 是跨平台窗口管理 facade。

### window 方法总表

| 方法 | 说明 |
| --- | --- |
| `await window.getActiveWindow()` | 获取当前前台窗口 |
| `await window.getFocusWindow()` | 获取当前焦点窗口 |
| `await window.getWindowByTitle(title)` | 按标题查窗口 |
| `await window.list()` | 列出窗口 |
| `await window.focus(title)` | 聚焦窗口 |
| `await window.bringToTop(title, pid?)` | 置顶窗口 |
| `await window.setWindowBounds(title, x, y, width, height)` | 设置位置与尺寸 |
| `await window.setWidth(title, width)` | 仅改宽度 |
| `await window.setHeight(title, height)` | 仅改高度 |
| `await window.maximize(title)` | 最大化 |
| `await window.minimize(title)` | 最小化 |
| `await window.restore(title)` | 恢复 |
| `await window.restoreByPID(pid)` | 按 PID 恢复 |
| `await window.minimizeByPID(pid)` | 按 PID 最小化 |
| `await window.maximizeByPID(pid)` | 按 PID 最大化 |
| `await window.closeWindow(title)` | 按标题关闭窗口 |
| `await window.closeActiveWindow()` | 关闭当前活动窗口 |
| `await window.kill(processId)` | 杀进程 |
| `window.title()` | 获取当前窗口标题 |
| `await window.getTitle(selector)` | 根据选择器取标题 |
| `window.content()` | 获取当前窗口内容（平台相关） |
| `await window.getContent(selector)` | 根据选择器取内容 |
| `await window.setAlwaysOnTop(title, bool)` | 设为置顶 |
| `await window.unsetTopMost(title)` | 取消置顶 |

### WindowInfo 返回结构

```js
{
  title: 'Safari',
  pid: 12345,
  x: 12,
  y: 34,
  width: 1440,
  height: 900,
  exeName: 'Safari',
  exePath: '/Applications/Safari.app/Contents/MacOS/Safari',
  isForeground: true,
  hasFocus: true,
  handle: 0,
  isPopup: false,
  index: 0
}
```

### 说明

- `polyfills/003-window.js` 会把 `getActiveWindow()` / `getWindowByTitle()` 返回字段做 lowerCamelCase 处理
- 具体支持能力依赖平台实现
- 在 stub 平台上可能直接返回“不支持窗口自动化”错误

### 示例

```js
const active = await window.getActiveWindow()
console.log(active.title, active.width, active.height)

await window.focus('Safari')
await window.setWindowBounds('Safari', 100, 100, 1280, 800)
```

---

## Screen

来源：`automation/screen.go`

### Screen 方法总表

| 方法 | 说明 |
| --- | --- |
| `Screen.getWidth()` | 主屏宽度 |
| `Screen.getHeight()` | 主屏高度 |
| `Screen.getDisplays()` | 列出所有显示器 |
| `Screen.getPrimaryDisplay()` | 获取主显示器信息 |
| `Screen.getDisplay(index)` | 按 1-based 索引取显示器 |
| `Screen.getVirtualBounds()` | 所有显示器的联合边界 |
| `Screen.pixel(x, y)` | 获取单个像素颜色 |
| `Screen.pixels(points, scaled?)` | 批量获取像素颜色 |
| `Screen.screenshot(options?)` | 等价于 `page.screenshot(options)` |

### DisplayInfo 结构

```js
{
  index: 1,
  id: 'primary',
  isPrimary: true,
  x: 0,
  y: 0,
  width: 1728,
  height: 1117,
  pixelWidth: 3456,
  pixelHeight: 2234,
  scale: 2
}
```

### Screen.getDisplay(index)

- `index` 从 `1` 开始
- 传 `<= 0` 会返回 `null`

### Screen.getVirtualBounds()

返回：

```js
{
  x: 0,
  y: 0,
  width: 3000,
  height: 1800
}
```

### Screen.pixel(x, y)

返回 `#RRGGBB` 风格颜色，例如：

```js
const color = Screen.pixel(100, 200)
// => '#ffffff'
```

### Screen.pixels(points, scaled?)`

#### 支持输入形式

```js
[[10, 20], [30, 40]]
```

或：

```js
[{ x: 10, y: 20 }, { x: 30, y: 40 }]
```

#### 返回

```js
['#FFFFFF', '#000000']
```

#### 参数说明

| 参数 | 类型 | 说明 |
| --- | --- | --- |
| `points` | `Array` | 坐标数组 |
| `scaled` | `boolean` | 当前实现预留，默认按当前逻辑坐标读取 |

---

## System

来源：`automation/system.go`

### System 方法总表

#### 信息读取

| 方法 | 说明 |
| --- | --- |
| `await System.getProcessList()` | 获取进程列表 |
| `await System.getNetworkInterfaces()` | 获取网络接口统计 |
| `await System.getNetworkConnections()` | 获取网络连接 |
| `await System.getPowerInfo()` | 获取电源/电池信息 |
| `await System.getDirectoryContents(path)` | 获取目录内容 |
| `await System.getExecutablePath()` | 获取当前可执行程序路径 |
| `await System.getWorkingDirectory()` | 获取当前工作目录 |
| `System.getUserInfo()` | 获取当前用户信息 |
| `await System.getSystemMetrics()` | 获取系统指标 |
| `await System.getFingerprint()` | 获取设备指纹 |
| `await System.getSystemInfo()` | 获取系统综合信息 |
| `await System.toJSON(data)` | 序列化成 JSON 文本 |
| `System.isAdministrator()` | 是否管理员/root |

#### 控制类

| 方法 | 说明 |
| --- | --- |
| `await System.killProcess(pid)` | 杀掉进程 |
| `await System.shutdown(delay)` | 关机 |
| `await System.restart(delay)` | 重启 |
| `await System.sleep()` | 睡眠 |

### 常见返回结构

#### System.getProcessList()

```js
[
  {
    pid: 123,
    name: 'Safari',
    cmdline: '...',
    username: 'user',
    cpuPercent: 1.2,
    memPercent: 3.4
  }
]
```

#### System.getNetworkInterfaces()

```js
[
  {
    name: 'en0',
    bytesSent: 123,
    bytesRecv: 456,
    packetsSent: 10,
    packetsRecv: 20,
    errors: 0,
    drops: 0
  }
]
```

#### System.getNetworkConnections()

```js
[
  {
    fd: 10,
    family: 2,
    type: 1,
    localAddr: '127.0.0.1:60844',
    remAddr: '',
    status: 'LISTEN',
    pid: 12345
  }
]
```

#### System.getDirectoryContents(path)

```js
[
  {
    name: 'runtime-page-input.md',
    size: 1234,
    mode: '-rw-r--r--',
    modTime: '2026-05-18T...',
    isDir: false
  }
]
```

### 风险提示

以下方法会直接影响宿主机：
- `System.killProcess()`
- `System.shutdown()`
- `System.restart()`
- `System.sleep()`

默认不建议由 AI 自动生成到高风险脚本里。

---

## File

来源：`automation/file.go`

说明：
- 所有相对路径都相对于当前工作目录
- 可通过 `File.path(relativePath)` 转成绝对路径

### File 方法总表

| 方法 | 返回 | 说明 |
| --- | --- | --- |
| `File.path(relativePath)` | `string` | 转绝对路径 |
| `File.cwd()` | `string` | 当前工作目录 |
| `File.create(path)` | `void` | 创建文件 |
| `File.createIfNotExists(path)` | `void` | 若不存在则创建 |
| `File.createWithDirs(path)` | `void` | 创建文件并补齐父目录 |
| `File.exists(path)` | `boolean` | 是否存在 |
| `File.ensureDir(path)` | `void` | 确保目录存在 |
| `File.read(path, encoding?)` | `string` | 读文本 |
| `File.readBytes(path)` | `bytes` | 读二进制 |
| `File.write(path, text, encoding?)` | `void` | 写文本 |
| `File.append(path, text, encoding?)` | `void` | 追加文本 |
| `File.writeBytes(path, bytes)` | `void` | 写字节 |
| `File.appendBytes(path, bytes)` | `void` | 追加字节 |
| `File.copy(pathFrom, pathTo)` | `void` | 复制文件 |
| `File.rename(path, newName)` | `void` | 改名 |
| `File.renameWithoutExtension(path, newName)` | `void` | 改名但保留扩展名 |
| `File.move(path, newPath)` | `void` | 移动 |
| `File.remove(path)` | `void` | 删除文件 |
| `File.removeDir(path)` | `void` | 删除目录 |
| `File.listDir(path)` | `string[]` | 列目录 |
| `File.isFile(path)` | `boolean` | 是否文件 |
| `File.isDir(path)` | `boolean` | 是否目录 |
| `File.isEmptyDir(path)` | `boolean` | 目录是否为空 |
| `File.getExtension(fileName)` | `string` | 扩展名 |
| `File.getName(filePath)` | `string` | 文件名 |
| `File.getNameWithoutExtension(filePath)` | `string` | 不含扩展名文件名 |
| `File.getHumanReadableSize(bytes)` | `string` | 人类可读大小 |
| `File.getSimplifiedPath(path)` | `string` | clean path |
| `File.join(parent, ...children)` | `string` | 拼路径 |
| `File.open(path, mode)` | `FileHandle` | 打开文件 |

### File.open(path, mode)

支持模式：
- `r`
- `w`
- `a`

其他模式会报：
- `invalid file mode`

### 示例

```js
File.ensureDir('temp')
File.write('temp/result.json', JSON.stringify({ ok: true }, null, 2))

const content = File.read('temp/result.json')
const files = File.listDir('temp')
const abs = File.path('temp/result.json')
```

---

## clipboard

来源：`automation/clipboard.go`

### 方法总表

| 方法 | 说明 |
| --- | --- |
| `await clipboard.copy(text)` | 写入系统剪贴板 |
| `await clipboard.paste()` | 读取系统剪贴板 |
| `await clipboard.clear()` | 清空剪贴板 |

### clipboard.copy(text)

#### 参数

| 参数 | 类型 | 说明 |
| --- | --- | --- |
| `text` | `string` | 要复制的文本 |

#### 行为特点

- 内部会重试最多 5 次
- 成功后会回读验证
- 若 `text === ''`，会改成单个空格再写入
- 若标准实现失败，会走平台 fallback

### clipboard.paste()

- 重试读取最多 5 次
- 失败后尝试平台 fallback
- 返回 `string`

### clipboard.clear()

当前实现实际等价于：
```js
clipboard.copy(' ')
```

也就是写入单个空格，而不是严格写入空字符串。

### 全局便捷函数

由 `polyfills/000-global.js` 提供：
- `copyToClipboard(text)`
- `getClipboard()`

---

## console

来源：`automation/console.go`

### 方法总表

| 方法 | 说明 |
| --- | --- |
| `console.log(...args)` | 普通日志 |
| `console.info(...args)` | 信息日志 |
| `console.warn(...args)` | 警告日志 |
| `console.error(...args)` | 错误日志 |
| `console.debug(...args)` | 调试日志 |
| `console.table(data)` | 表格/结构化输出 |
| `console.group(label)` | 分组开始 |
| `console.groupEnd(label)` | 分组结束 |
| `console.time(label)` | 计时开始 |
| `console.timeEnd(label)` | 计时结束 |
| `console.clear()` | 清屏 |

### 行为说明

- 复杂对象会优先被格式化成 JSON 文本
- `console.clear()` 会直接发 ANSI 清屏序列
- 运行时支持结构化事件 sink，因此脚本日志可以进入执行事件流
