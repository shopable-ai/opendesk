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

`FloatingWindow` 用于声明简单图标工具栏；它通过结构化 `ToolbarSpec/ButtonSpec/ButtonState` 直接创建 AppKit Toolbar，不生成 HTML/CSS 或 WKWebView。复杂表单、任意受限 HTML/CSS 或动态控件树仍使用 [Custom UI v1](custom-ui.md) 的 `ui.createWindow()`。两者共享 native driver、事件队列、`EventLoop.RunOnLoop`、结构化错误和生命周期清理，不引用或初始化 Fyne。只有 execution 已显式授权 UI 时才注入 `FloatingWindow`。

推荐为每个工具栏创建实例：

```js
const toolbar = new FloatingWindow({ x: 100, y: 100, theme: "dark" });
```

旧的 `FloatingWindow.addButton(...)` 静态调用仍代理到一个空的默认实例，但新代码应使用构造器。v1 要求第一次 `show()` 时有 1–32 个按钮，保持声明顺序。默认按钮是纯图标：每个点击盒固定为 40×40pt，间隔为 8pt，窗口宽度只由按钮数量决定、达到 960pt 安全上限后由 native host 换行，位置不因布局改变。label 最多 60 个 Unicode 字符，**不显示在按钮正文**，但完整保留为 AppKit tooltip、macOS Accessibility name 和 callback/debug evidence。

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

内置图标注册表固定为 `play.fill`、`pause.fill`、`stop.fill`、`gearshape.fill`、`paperplane.fill`、`timer`。这些名字映射到 macOS host 的可信 SF Symbols；注册表为每个符号保存经审查的 scale/offset，使 play、pause、stop、gearshape、paperplane、timer 在同一 16pt 光学盒内居中。它不接受远程 URL、`javascript:`、项目文件路径或任意 fallback；未知名称以带 `capability: "icon"` 的 `INVALID_SPEC` 失败。

normal、hover、pressed、active、disabled、busy、error 都保持同一 40×40pt 外盒。busy 使用同一原生 `CDToolbarButton` 内部的 `NSProgressIndicator`，暂时隐藏 SF Symbol 且不参与外层 `NSStackView` 布局，因此不会挤压图标或改变按钮/窗口宽度。`getButtonState()` 额外返回 `renderedText`（默认空字符串）、`iconPresentation`、`accessibilityName` 和单调 `revision`，便于验收可信符号、语义名称与 native readback。

每个按钮默认 single-flight：callback 未完成时进入 busy，同一按钮的重复真实点击不会再次启动，其他按钮仍可响应。callback 的同步返回值与 Promise 都会被等待；成功清除 busy。失败会先清除 busy、设置 error 视觉状态，再产生 `UI_CALLBACK_FAILED`，包含 `operation`、`windowId`、`targetId` 和 `capability`。用 `onError` 显式处理；用 `updateButton(id, { error: null })` 清除错误状态。

show 后增删按钮仍返回 `INVALID_STATE`，但上述六种状态更新始终允许。label 更新只更新 tooltip/AX，不会改变 icon-only 按钮或窗口 bounds。约 20 行的最小示例见 `examples/custom-ui/minimal-five-button-toolbar.js`；结构化证据版本 `evidence-five-button-toolbar.js` 会在 `Execution.artifactDir/floating-toolbar/result.json`（无 artifactDir 时回退 `.runtime/examples/custom-ui/floating-toolbar/result.json`）记录 callback 名称、分支和最终 UI 状态。`examples/floatwindow.js` 展示旧静态入口的迁移方式。

## notify / timers / sleep：基础运行时能力

`notify()`、Promise、timers、sleep 属于运行时基础辅助能力。系统通知的完整调用契约、平台限制与可见性边界见：

[notify](notify.md)

其他全局接口见 [Global APIs](global-apis.md)；Runtime 的加载顺序和实现来源见 [Runtime Stacks](runtime.md)。

这样避免把同一 API 在多个专题页重复维护。
