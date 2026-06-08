---
title: TestMonkey 系统、窗口与文件 API
description: 面向用户的 window、Screen、System、File、clipboard、console API 文档。
order: 30
---

# TestMonkey 系统、窗口与文件 API

更新时间：2026-05-18

本文覆盖：
- `window`
- `Screen`
- `System`
- `File`
- `clipboard`
- `console`

## 1. window

`window` 是跨平台窗口管理对象。

### 方法总表

| 方法 | 说明 |
| --- | --- |
| `await window.getActiveWindow()` | 获取当前前台窗口 |
| `await window.getFocusWindow()` | 获取当前焦点窗口 |
| `await window.getWindowByTitle(title)` | 按标题查窗口 |
| `await window.list()` | 列出窗口 |
| `await window.focus(title)` | 聚焦窗口 |
| `await window.bringToTop(title, pid?)` | 置顶窗口 |
| `await window.setWindowBounds(title, x, y, width, height)` | 设置位置和尺寸 |
| `await window.setWidth(title, width)` | 设置宽度 |
| `await window.setHeight(title, height)` | 设置高度 |
| `await window.maximize(title)` | 最大化 |
| `await window.minimize(title)` | 最小化 |
| `await window.restore(title)` | 恢复 |
| `await window.restoreByPID(pid)` | 按 PID 恢复 |
| `await window.minimizeByPID(pid)` | 按 PID 最小化 |
| `await window.maximizeByPID(pid)` | 按 PID 最大化 |
| `await window.closeWindow(title)` | 关闭指定标题窗口 |
| `await window.closeActiveWindow()` | 关闭当前活动窗口 |
| `await window.kill(processId)` | 杀进程 |
| `window.title()` | 当前窗口标题 |
| `await window.getTitle(selector)` | 根据 selector 获取标题 |
| `window.content()` | 当前窗口内容（平台相关） |
| `await window.getContent(selector)` | 根据 selector 获取内容 |
| `await window.setAlwaysOnTop(title, bool)` | 置顶 |
| `await window.unsetTopMost(title)` | 取消置顶 |

### WindowInfo 结构

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

说明：
- 不同平台支持程度不同
- 某些平台上可能返回“不支持窗口自动化”错误

示例：

```js
const active = await window.getActiveWindow()
console.log(active.title)
await window.focus('Safari')
await window.setWindowBounds('Safari', 100, 100, 1280, 800)
```

---

## 2. Screen

### 方法总表

| 方法 | 说明 |
| --- | --- |
| `Screen.getWidth()` | 主屏宽度 |
| `Screen.getHeight()` | 主屏高度 |
| `Screen.getDisplays()` | 所有显示器信息 |
| `Screen.getPrimaryDisplay()` | 主显示器信息 |
| `Screen.getDisplay(index)` | 按 1-based 索引取显示器 |
| `Screen.getVirtualBounds()` | 所有显示器联合边界 |
| `Screen.pixel(x, y)` | 获取单像素颜色 |
| `Screen.pixels(points, scaled?)` | 批量获取像素颜色 |
| `Screen.screenshot(options?)` | 等价于 `page.screenshot(options)` |

### 显示器结构

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

### Screen.pixel(x, y)

```js
const color = Screen.pixel(100, 200)
// => '#ffffff'
```

### Screen.pixels(points, scaled?)

支持：

```js
[[10, 20], [30, 40]]
```

或：

```js
[{ x: 10, y: 20 }, { x: 30, y: 40 }]
```

返回：

```js
['#FFFFFF', '#000000']
```

---

## 3. System

### 信息读取方法

| 方法 | 说明 |
| --- | --- |
| `await System.getProcessList()` | 获取进程列表 |
| `await System.getNetworkInterfaces()` | 网络接口统计 |
| `await System.getNetworkConnections()` | 网络连接 |
| `await System.getPowerInfo()` | 电源/电池信息 |
| `await System.getDirectoryContents(path)` | 目录内容 |
| `await System.getExecutablePath()` | 当前可执行程序路径 |
| `await System.getWorkingDirectory()` | 当前工作目录 |
| `System.getUserInfo()` | 当前用户信息 |
| `await System.getSystemMetrics()` | 系统指标 |
| `await System.getFingerprint()` | 设备指纹 |
| `await System.getSystemInfo()` | 综合系统信息 |
| `await System.toJSON(data)` | 转 JSON 文本 |
| `System.isAdministrator()` | 是否管理员/root |

### 控制类方法

| 方法 | 说明 |
| --- | --- |
| `await System.killProcess(pid)` | 杀进程 |
| `await System.shutdown(delay)` | 关机 |
| `await System.restart(delay)` | 重启 |
| `await System.sleep()` | 睡眠 |

### 示例返回

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

风险提示：
- `shutdown/restart/sleep` 会直接影响宿主机

---

## 4. File

相对路径都相对于当前工作目录。

### 方法总表

| 方法 | 说明 |
| --- | --- |
| `File.path(relativePath)` | 转绝对路径 |
| `File.cwd()` | 当前工作目录 |
| `File.create(path)` | 创建文件 |
| `File.createIfNotExists(path)` | 若不存在则创建 |
| `File.createWithDirs(path)` | 创建文件并补齐父目录 |
| `File.exists(path)` | 是否存在 |
| `File.ensureDir(path)` | 确保目录存在 |
| `File.read(path, encoding?)` | 读文本 |
| `File.readBytes(path)` | 读二进制 |
| `File.write(path, text, encoding?)` | 写文本 |
| `File.append(path, text, encoding?)` | 追加文本 |
| `File.writeBytes(path, bytes)` | 写二进制 |
| `File.appendBytes(path, bytes)` | 追加二进制 |
| `File.copy(pathFrom, pathTo)` | 复制 |
| `File.rename(path, newName)` | 重命名 |
| `File.renameWithoutExtension(path, newName)` | 改名但保留扩展名 |
| `File.move(path, newPath)` | 移动 |
| `File.remove(path)` | 删除文件 |
| `File.removeDir(path)` | 删除目录 |
| `File.listDir(path)` | 列目录 |
| `File.isFile(path)` | 是否文件 |
| `File.isDir(path)` | 是否目录 |
| `File.isEmptyDir(path)` | 目录是否为空 |
| `File.getExtension(fileName)` | 扩展名 |
| `File.getName(filePath)` | 文件名 |
| `File.getNameWithoutExtension(filePath)` | 不含扩展名文件名 |
| `File.getHumanReadableSize(bytes)` | 人类可读大小 |
| `File.getSimplifiedPath(path)` | clean path |
| `File.join(parent, ...children)` | 拼接路径 |
| `File.open(path, mode)` | 打开文件 |

### File.open(path, mode)

支持模式：
- `r`
- `w`
- `a`

示例：

```js
File.ensureDir('temp')
File.write('temp/result.json', JSON.stringify({ ok: true }, null, 2))
const txt = File.read('temp/result.json')
```

---

## 5. clipboard

### 方法

| 方法 | 说明 |
| --- | --- |
| `await clipboard.copy(text)` | 写入系统剪贴板 |
| `await clipboard.paste()` | 读取系统剪贴板 |
| `await clipboard.clear()` | 清空剪贴板 |

行为说明：
- 内部会重试
- `copy('')` 会改成单个空格
- 失败会尝试平台 fallback

全局便捷函数：
- `copyToClipboard(text)`
- `getClipboard()`

---

## 6. console

### 方法

| 方法 | 说明 |
| --- | --- |
| `console.log(...args)` | 普通日志 |
| `console.info(...args)` | 信息日志 |
| `console.warn(...args)` | 警告日志 |
| `console.error(...args)` | 错误日志 |
| `console.debug(...args)` | 调试日志 |
| `console.table(data)` | 表格输出 |
| `console.group(label)` | 分组开始 |
| `console.groupEnd(label)` | 分组结束 |
| `console.time(label)` | 开始计时 |
| `console.timeEnd(label)` | 结束计时 |
| `console.clear()` | 清屏 |
