---
title: Window API
description: window 对象用于读取当前窗口信息，并进行聚焦、移动、缩放、置顶等桌面窗口控制。
order: 4
---

# window

window 是桌面窗口控制对象。

适用场景
- 获取当前活动窗口信息
- 通过标题查找窗口
- 聚焦、移动、缩放、最大化、最小化、恢复
- 获取窗口列表
- 设置窗口置顶

平台说明
- Windows：实现最完整
- macOS：已实现活动窗口、查找、聚焦、部分控制
- 其他平台：可能返回 `window automation is not implemented on this platform`

polyfill 说明
- `polyfills/003-window.js` 会把 `getActiveWindow()` 与 `getWindowByTitle()` 的返回对象属性转换为 lowerCamelCase
- 所以用户侧读取时应优先使用 `title`、`pid`、`x`、`y`、`width`、`height`

## 方法总表

| 方法 | 用途 |
| --- | --- |
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

## WindowInfo 返回结构

当前源码定义的标准窗口结构：

```js
{
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

## 实战示例

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

## 与旧文档的差异

旧文档对窗口能力描述较少，更多围绕移动端 page 模型。

当前项目中，window 是桌面自动化核心对象之一，应优先与这些 API 配合使用：
- page.screenshot({ target: 'activeWindow' })
- page.waitForFunction(...)
- mouse / keyboard
- Vision.detectUI()
