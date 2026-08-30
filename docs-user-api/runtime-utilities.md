---
title: Runtime Utilities
description: Sound 与条件注入的 FloatingWindow 等次级运行时能力。
order: 13
---

# runtime utilities

本页收录当前源码真实存在、但不属于 Clawdesk 核心桌面主链路的运行时对象。

## Sound

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

## FloatingWindow

**状态：Conditional / Experimental / Native**

`FloatingWindow` 基于 Fyne 提供简单浮动控制窗。

它只有在：

```text
SKIP_FYNE_INIT
```

未设置时才会注入。

因此脚本不应无条件假设它存在。

主要方法：

| 方法 | 用途 |
| --- | --- |
| `FloatingWindow.addButton(id, label, iconName)` | 增加按钮 |
| `FloatingWindow.removeButton(id)` | 删除按钮 |
| `FloatingWindow.show()` | 显示 |
| `FloatingWindow.hide()` | 隐藏 |
| `FloatingWindow.setPosition(x, y)` | 设置位置 |
| `FloatingWindow.onButtonClick(id, callback)` | 绑定按钮事件 |
| `FloatingWindow.setAlwaysOnTop(bool)` | 置顶 |
| `FloatingWindow.run()` | 进入 Fyne 事件循环 |

示例：

```js
if (typeof FloatingWindow !== 'undefined') {
  FloatingWindow.addButton('run', 'Run', 'play');
  FloatingWindow.show();
}
```

## 为什么标 Experimental

- 依赖 Fyne 初始化。
- GUI event loop 与脚本运行时生命周期存在额外耦合。
- 不属于当前 Agent / MCP 桌面自动化主链路。
- 不同构建/运行环境可能主动通过 `SKIP_FYNE_INIT` 禁用。

新自动化功能不要把 FloatingWindow 当成必要依赖。

## notify 与 timers

`notify()`、Promise、timers、sleep 属于 polyfill/运行时基础辅助能力，统一放在：

`polyfills.md`

这样避免把同一 API 在多个专题页重复维护。
