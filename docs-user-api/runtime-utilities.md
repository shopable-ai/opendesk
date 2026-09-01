---
title: Runtime Utilities
description: Sound 与条件注入的 FloatingWindow 等次级运行时能力。
order: 13
---

# Runtime Utilities：运行时辅助能力

本页收录当前源码真实存在、但不属于 OpenDesk 核心桌面主链路的运行时对象。

## Sound：声音播放

**状态：Secondary / Native**

`Sound` 用于播放内置提示音或本地 MP3/WAV 文件。

主要方法：

| 方法 | 用途 |
| --- | --- |
| `Sound.playSuccess()` | 成功提示音 |
| `Sound.playFail()` | 失败提示音 |
| `Sound.playWarning()` | 警告提示音 |
| `Sound.playError()` | 错误提示音 |
| `Sound.playCaptcha()` | captcha 提示音 |
| `Sound.playSound(path)` | 播放指定文件 |
| `Sound.play(path)` | `playSound` 别名 |

示例：

```js
Sound.playSuccess();
Sound.play('./public/done.mp3');
```

当前实现支持：

- `.mp3`
- `.wav`

播放会等待音频播放完成，因此长音频不适合作为不阻塞的后台播放器。

**注意**

预置声音文件依赖发布包/工作目录里的资源文件。找不到文件时会报错。

## FloatingWindow：浮动工具栏

**状态：Button-first v1 / Conditional / Native**

`FloatingWindow` 用于声明简单图标工具栏；复杂表单、任意受限 HTML/CSS 或动态控件树使用 [Custom UI v1](custom-ui.md) 的 `ui.createWindow()`。两者共享 native driver、事件队列、`EventLoop.RunOnLoop`、结构化错误和生命周期清理，不引用或初始化 Fyne。只有 execution 已显式授权 UI 时才注入 `FloatingWindow`。

推荐为每个工具栏创建实例：

```js
const toolbar = new FloatingWindow({ x: 100, y: 100, theme: "dark" });
```

旧的 `FloatingWindow.addButton(...)` 静态调用仍代理到一个空的默认实例，但新代码应使用构造器。v1 要求第一次 `show()` 时有 1–32 个按钮，保持声明顺序；窗口按标签和按钮数量自动计算宽高，达到 960px 安全上限后才换行，位置不因布局改变。标签最多 60 个 Unicode 字符，完整显示并同时作为 tooltip 和 Accessibility name。

主要方法：

| 方法 | 用途 |
| --- | --- |
| `toolbar.addButton(id, label, icon, callback?)` | show 前按声明顺序增加按钮并绑定同步或异步函数 |
| `toolbar.removeButton(id)` | show 前删除按钮 |
| `toolbar.updateButton(id, patch)` | show 前后更新 icon、label、active、disabled、busy、error |
| `toolbar.getButtonState(id)` | 返回逻辑状态及 local/screen bounds |
| `toolbar.onButtonClick(id, callback)` | 兼容式绑定或替换 callback |
| `toolbar.onError(callback)` | 处理结构化 callback 错误；未处理错误会使 execution 失败 |
| `toolbar.show()` / `hide()` / `close()` | 原生窗口生命周期；返回 Promise |
| `toolbar.setPosition(x, y)` | 移动原生顶层窗口，不移动内容容器 |
| `toolbar.setAlwaysOnTop(bool)` | 设置真实原生窗口层级 |
| `toolbar.waitUntilClosed()` | 默认保持脚本存活直到用户关闭 |
| `toolbar.run()` | **deprecated**；`waitUntilClosed()` 的兼容别名 |

示例：

```js
const toolbar = new FloatingWindow({ x: 100, y: 100, theme: "dark" });
let running = false;

toolbar.addButton("startPause", "开始", "play.fill", async () => {
  if (running) await userActions.pause();
  else await userActions.start();
  running = !running;
  await toolbar.updateButton("startPause", running
    ? { icon: "pause.fill", label: "暂停", active: true }
    : { icon: "play.fill", label: "开始", active: false });
});

toolbar.addButton("stop", "停止", "stop.fill", async () => {
  await userActions.stop();
  running = false;
  await toolbar.updateButton("startPause", {
    icon: "play.fill", label: "开始", active: false
  });
});

toolbar.onError(error => console.error(error.code, error.targetId, error.message));
await toolbar.show();
await toolbar.waitUntilClosed();
```

内置图标注册表固定为 `play.fill`、`pause.fill`、`stop.fill`、`gearshape.fill`、`paperplane.fill`、`timer`。这些名字映射到宿主内置的 Apple system-font glyph，不接受远程 URL、`javascript:` 或项目文件路径；未知名称以带 `capability: "icon"` 的 `INVALID_SPEC` 失败。

每个按钮默认 single-flight：callback 未完成时进入 busy，同一按钮的重复真实点击不会再次启动，其他按钮仍可响应。callback 的同步返回值与 Promise 都会被等待；成功清除 busy。失败会先清除 busy、设置 error 视觉状态，再产生 `UI_CALLBACK_FAILED`，包含 `operation`、`windowId`、`targetId` 和 `capability`。用 `onError` 显式处理；用 `updateButton(id, { error: null })` 清除错误状态。

show 后增删按钮仍返回 `INVALID_STATE`，但上述六种状态更新始终允许，标签变化会在保持 x/y 不变的前提下重算窗口尺寸。完整五按钮示例见 `examples/custom-ui/five-button-toolbar.js`；`examples/floatwindow.js` 展示旧静态入口的迁移方式。

## notify / timers / sleep：基础运行时能力

`notify()`、Promise、timers、sleep 属于运行时基础辅助能力。系统通知的完整调用契约、平台限制与可见性边界见：

[`notify.md`](notify.md)

其他全局接口见 [`global-apis.md`](global-apis.md)；Runtime 的加载顺序和实现来源见 [`runtime.md`](runtime.md)。

这样避免把同一 API 在多个专题页重复维护。
