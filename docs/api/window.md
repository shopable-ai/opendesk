---
title: Window API
description: window 对象用于读取当前窗口信息，并进行聚焦、移动、缩放、置顶等桌面窗口控制。
order: 4
---

# window

`window` 是现有的跨平台桌面窗口 facade。先用 `window.getCapabilities()` 判断当前平台，
再调用控制方法；不支持的能力会抛出结构化错误，不会静默成功。

适用场景
- 获取当前活动窗口信息
- 通过标题查找窗口
- 聚焦、移动、缩放、最大化、最小化、恢复
- 获取窗口列表
- 设置窗口置顶

## 可直接运行的能力检查

工作目录：OpenDesk 仓库根目录。

```bash
./opendesk -script examples/window-capabilities.js -console-mode script
```

运行结果只记录 capability、窗口数量与活动窗口是否可读，不保存窗口标题或其他私密文本。

## 平台 Capability Matrix

机器可读版本由 `window.getCapabilities()` 返回；下表与源码中的同一矩阵同步。

| Capability | macOS | Windows | Linux / other |
| --- | --- | --- | --- |
| `window.list` | Partial | Stable | Unsupported |
| `window.active` | Stable | Stable | Unsupported |
| `window.findByTitle` | Partial | Partial | Unsupported |
| `window.focus` | Partial | Partial | Unsupported |
| `window.getBounds` | Stable | Stable | Unsupported |
| `window.setBounds` | Partial | Stable | Unsupported |
| `window.minimize` | Partial | Stable | Unsupported |
| `window.maximize` | Partial | Stable | Unsupported |
| `window.restore` | Partial | Stable | Unsupported |
| `window.close` | Partial | Partial | Unsupported |
| `window.alwaysOnTop` | Unsupported | Stable | Unsupported |
| `window.bringToTop` | Partial | Partial | Unsupported |

macOS 的 Partial 动作依赖 Accessibility / System Events、目标应用是否接受 AX 修改，以及目标
是否位于其他 Space。Windows 的 focus / bring-to-top 受系统 foreground-lock policy 约束。
Windows backend 已做目标交叉编译；本轮真实 smoke 来自 macOS，不能把交叉编译表述为 Windows
真机验证。

```js
const matrix = window.getCapabilities();
console.log(matrix.platform, matrix.backend);
console.log(matrix.capabilities['window.alwaysOnTop']);
```

## Identity、重复标题与 stale target

- `getActiveWindow()`、`getWindowByTitle()`、`getFocusWindow()` 和 `list()` 的每个结果都有
  `id`。可由 WindowServer 唯一解析时格式为 `platform:pid:native:nativeHandle`；跨 Space、
  不可见或元数据不足的行会明确标成 `platform:pid:unresolved`，不得把它当成稳定 native identity。
  ID 只表示当前窗口生命周期；窗口关闭并重建后必须重新读取，不能缓存为永久 ID。
- 兼容 API 仍以标题作为动作参数。执行动作前 facade 会解析一个当前唯一标题；多个精确或模糊
  匹配会抛出 `AMBIGUOUS_TARGET`，不会任意选择一个同名窗口。
- 初次解析不到目标时抛出 `NOT_FOUND`；解析后窗口关闭、重建或改名导致动作失败时抛出
  `STALE_TARGET`。调用方应重新 `list()` / `getWindowByTitle()`，而不是重试旧引用。
- macOS 坐标是全局 display point，主显示器左上角为原点，副显示器可出现负坐标；Windows 是
  virtual-screen logical coordinate，DPI awareness 可能影响缩放。两者都不是可跨机器缓存的像素坐标。
- 本 API 不选择或管理 Space / virtual desktop；位于其他桌面的窗口行为按 capability 的 Partial
  约束处理。Menu、Dock 和 Spaces integration 不属于本 API。

## 结构化错误

Window 方法失败时抛出的 Error 至少包含 `code`、`operation`、`platform`，并在适用时包含
`capability`。稳定 code 为：

```text
INVALID_ARGUMENT
NOT_SUPPORTED
NOT_FOUND
AMBIGUOUS_TARGET
STALE_TARGET
PERMISSION_DENIED
VERIFICATION_FAILED
TIMEOUT
BACKEND_FAILED
```

## window：方法总表

| 方法 | 用途 |
| --- | --- |
| window.getCapabilities() | 返回当前平台的机器可读能力矩阵 |
| window.getActiveWindow() | 获取当前活动窗口信息 |
| window.getWindowByTitle(title) | 通过标题查找窗口 |
| window.focus(title) | 聚焦指定窗口 |
| window.setWindowBounds(title, x, y, width, height) | 设置窗口位置和大小 |
| window.setWidth(title, width) | 仅改宽度 |
| window.setHeight(title, height) | 仅改高度 |
| window.maximize(title) | 最大化窗口 |
| window.minimize(title) | 最小化窗口 |
| window.restore(title) | 恢复窗口 |
| window.restoreByPID(pid) | 按进程恢复 |
| window.minimizeByPID(pid) | 按进程最小化 |
| window.maximizeByPID(pid) | 按进程最大化 |
| window.closeWindow(title) | 关闭指定窗口 |
| window.closeActiveWindow() | 关闭当前活动窗口 |
| window.kill(processId) | 杀掉窗口所属进程 |
| window.title() | 返回当前活动窗口标题 |
| window.getTitle(selector) | 获取指定窗口标题 |
| window.content() | 读取当前聚焦窗口文本内容（平台相关） |
| window.getContent(selector) | 读取指定窗口文本内容 |
| window.list() | 列出窗口 |
| window.getFocusWindow() | 获取当前焦点窗口 |
| window.setAlwaysOnTop(title, alwaysOnTop) | 设置或取消置顶 |
| window.unsetTopMost(title) | 取消置顶 |
| window.bringToTop(title, pid) | 将窗口提升到顶层 |
| window.js_beautify(source, options?) | 格式化 JavaScript 文本 |

## window：WindowInfo 返回结构

脚本侧窗口字段统一使用 lowerCamelCase；读取窗口信息时优先使用 `title`、`pid`、`x`、
`y`、`width`、`height`。标准结构如下：

```js
{
  id: string,
  title: string,
  pid: number,
  x: number,
  y: number,
  width: number,
  height: number,
  exeName: string,
  exePath: string,
  isForeground: boolean,
  hasFocus: boolean,
  handle: number,
  isPopup: boolean,
  index: number
}
```

注意
- 不同平台、不同接口返回字段完整度可能不同
- 但 title / pid / x / y / width / height 是最常用字段
- `id` 是当前 native window 的观察身份；它不是永久 ID，也不是标题动作的参数

## window.getActiveWindow()

签名

```js
const info = await window.getActiveWindow()
```

作用
- 获取当前前台活动窗口

返回值
- WindowInfo 对象
- 找不到时可能返回错误，或平台 fallback 结果

示例

```js
const info = await window.getActiveWindow();
console.log(JSON.stringify(info, null, 2));
```

## window.getWindowByTitle(title)

签名

```js
const info = await window.getWindowByTitle(title)
```

作用
- 按窗口标题查找窗口

参数

| 参数 | 类型 | 说明 |
| --- | --- | --- |
| title | string | 目标窗口标题 |

示例

```js
const chrome = await window.getWindowByTitle('Google Chrome');
console.log(chrome);
```

## window.focus(title)

签名

```js
await window.focus(title)
```

作用
- 聚焦指定标题的窗口

示例

```js
await window.focus('Safari');
```

## window.setWindowBounds(title, x, y, width, height)

签名

```js
await window.setWindowBounds(title, x, y, width, height)
```

作用
- 一次性设置位置与尺寸

示例

```js
await window.setWindowBounds('Safari', 100, 80, 1280, 900);
```

## window.setWidth(title, width)

```js
await window.setWidth('Safari', 1200);
```

## window.setHeight(title, height)

```js
await window.setHeight('Safari', 900);
```

## window.maximize(title)

```js
await window.maximize('Safari');
```

## window.minimize(title)

```js
await window.minimize('Safari');
```

## window.restore(title)

```js
await window.restore('Safari');
```

## window.restoreByPID(pid)

```js
await window.restoreByPID(12345);
```

## window.minimizeByPID(pid)

```js
await window.minimizeByPID(12345);
```

## window.maximizeByPID(pid)

```js
await window.maximizeByPID(12345);
```

## window.closeWindow(title)

签名

```js
await window.closeWindow(title)
```

作用
- 关闭指定窗口

示例

```js
await window.closeWindow('Untitled - TextEdit');
```

## window.closeActiveWindow()

```js
await window.closeActiveWindow();
```

## window.kill(processId)

签名

```js
await window.kill(processId)
```

作用
- 直接杀掉对应进程

注意
- 这是强副作用操作
- 可能导致未保存内容丢失

示例

```js
const info = await window.getActiveWindow();
await window.kill(info.pid);
```

## window.title()

签名

```js
const title = window.title()
```

作用
- 返回当前活动窗口标题

示例

```js
console.log(window.title());
```

## window.getTitle(selector)

签名

```js
const title = await window.getTitle(selector)
```

作用
- 读取指定窗口标题

## window.content()

签名

```js
const text = window.content()
```

作用
- 获取当前窗口内容文本
- 是否可用、能取到多少文本，强依赖平台实现与目标应用可访问性

## window.getContent(selector)

```js
const text = await window.getContent('Notes');
```

## window.list()

签名

```js
const items = await window.list()
```

作用
- 列出窗口列表

返回值
- `Array<object>`

示例

```js
const items = await window.list();
console.log(JSON.stringify(items.slice(0, 5), null, 2));
```

## window.getFocusWindow()

签名

```js
const info = await window.getFocusWindow()
```

作用
- 获取当前拥有焦点的窗口

## window.setAlwaysOnTop(title, alwaysOnTop)

签名

```js
await window.setAlwaysOnTop(title, alwaysOnTop)
```

参数

| 参数 | 类型 |
| --- | --- |
| title | string |
| alwaysOnTop | boolean |

示例

```js
await window.setAlwaysOnTop('Safari', true);
```

## window.unsetTopMost(title)

```js
await window.unsetTopMost('Safari');
```

## window.bringToTop(title, pid)

签名

```js
await window.bringToTop(title, pid)
```

作用
- 将目标窗口抬到最上层

参数

| 参数 | 类型 | 说明 |
| --- | --- | --- |
| title | string | 标题，可为空 |
| pid | any | 可传 pid 作为辅助选择 |

## window.js_beautify(source, options?)

格式化 JavaScript 源码文本；它不会读取文件、执行源码或改变窗口状态。

```js
const formatted = window.js_beautify('function hello(){return 1;}', {
  indent_size: 2,
});
console.log(formatted);
```

| 参数 | 类型 | 说明 |
| --- | --- | --- |
| `source` | string | 必填；要格式化的 JavaScript 文本。 |
| `options` | object | 可选；传递给内置 beautify 的格式化选项，例如 `indent_size`。 |

返回格式化后的 string。完整库用法见 [JS Libraries](libs.md)。

## window：实战示例

**示例 1：获取活动窗口并截图它**

```js
const info = await window.getActiveWindow();
console.log(info.title, info.width, info.height);

await page.screenshot({
  target: 'activeWindow',
  path: './.runtime/examples/active-window.png'
});
```

**示例 2：聚焦 Safari，并把它放到固定区域**

```js
await window.focus('Safari');
await page.waitForTimeout(500);
await window.setWindowBounds('Safari', 60, 60, 1440, 920);
```

**示例 3：列出窗口并筛选**

```js
const windows = await window.list();
const browsers = windows.filter(item =>
  (item.title || '').includes('Chrome') ||
  (item.title || '').includes('Safari')
);
console.log(JSON.stringify(browsers, null, 2));
```

## window：兼容说明

旧文档对窗口能力描述较少，更多围绕移动端 page 模型。

`getActiveWindow()` 与 `getWindowByTitle()` 的返回字段目前由
`polyfills/003-window.js` 统一为 lowerCamelCase。该文件是 Runtime 实现来源；脚本应依赖
本页记录的最终字段结构，不应依赖具体 polyfill 文件名。

当前项目中，window 是桌面自动化核心对象之一，应优先与这些 API 配合使用：
- page.screenshot({ target: 'activeWindow' })
- page.waitForFunction(...)
- mouse / keyboard
- UI.findText() / UI.tapText()（外部可见 UI）；原始 OCR 使用 Vision.runOCR()
