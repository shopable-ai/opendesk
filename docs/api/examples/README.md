---
title: Examples 快速索引
description: 查看 examples 示例源码、运行命令和使用说明。
order: 3
---

# Examples 快速索引

直接运行 `examples/` 中的脚本，查看终端输出或实际窗口效果。从仓库根目录运行，常用命令见[单项示例运行](single-tests.md)。

## OpenDesk Examples 图形入口

仓库内置 `apps/example-explorer/` 作为面向新手和开发者的 Examples 浏览与运行工具。它不属于 `examples/` 本身，而是读取 `examples/`、`examples/catalog.json` 和本 API 文档索引的独立开发者应用。

从仓库根目录启动：

```bash
./dist/opendesk -ui -script apps/example-explorer/main.js -console-mode script -log-dir .runtime/apps/example-explorer
```

界面会递归发现 `examples/` 中的 JavaScript、按分类分页显示、查看源码和运行元数据，并允许直接运行已经在 `examples/catalog.json` 中显式审核为 `runPolicy: "safe"` 的条目。新发现但未登记的 `.js` 仍可查看源码，但默认不可一键运行；这避免把桌面输入、真实应用操作、音频、OCR、权限准备或其他带前置条件的示例因为文件扩展名相同而误当成安全脚本。

每个 Run 都通过独立 OpenDesk 子进程执行，Stop 使用 `AbortController` 取消该子进程。当前 `Command.run()` 在子进程结束时一次性返回 stdout/stderr，因此界面显示的是完成后的有界输出，不声称实时流式终端。Example 成功也不等于正式 Runtime API 测试通过；正确性 gate 仍以 `tests/` 和对应质量文档为准。

## 基础 Runtime 与数据

- [入门、环境、文件、JSON、路径、命令与 HTTP](../../../examples/runtime/README.md)
- [控制台打印](../../../examples/console.js)、[全局对象](../../../examples/globalThis.js)、[Promise](../../../examples/promise.js)、[等待](../../../examples/sleep.js)、[定时器](../../../examples/timer.js)
- [本地存储](../../../examples/appStorage.js)
- [Page 等待 quickstart](../../../examples/page.waitfor.js)与[共享用例 smoke](../../../examples/runtime/page-wait.test.js)

Page 等待示例以真实断言检查固定等待、条件轮询、single-flight、`AbortSignal` 和组合结果；命令及 Windows 验收状态见[基础 Runtime 示例](../../../examples/runtime/README.md)。

## SQLite Runtime API

- [建表、写入、查询与跨运行持久化](../../../examples/sqlite/README.md)

## 桌面输入、屏幕、窗口和系统

- [窗口查询、窗口控制与键盘输入](../../../examples/desktop/README.md)
- [剪贴板](../../../examples/clipboard/README.md)
- [Page 点击与截图（固定坐标）](../../../examples/page.js)、[等待条件](../../../examples/page.waitfor.js)、[鼠标](../../../examples/mouse.js)
- [屏幕信息](../../../examples/screen.js)、[截图](../../../examples/screenshot.js)、[截图字节](../../../examples/screenshot_bytes_smoke.js)、[显示模式](../../../examples/display-modes.js)、[区域录屏](../../../examples/screen-record-region.js)
- [系统信息](../../../examples/system.js)、[会话状态](../../../examples/system-session-state.js)、[发送通知](../../../examples/notify.js)、[读取通知](../../../examples/notifications.js)
- [千牛窗口](../../../examples/app/README.md)
- [Native Accessibility、UI 原生文本值与菜单](../../../examples/accessibility/README.md)
- [Recorder：人工录制与独立 basic JS 生成](../../../workflows/human-to-recipe/README.md)

输入、窗口变更和剪贴板写入分别需要显式设置 `OPENDESK_EXAMPLE_ALLOW_INPUT=1`、`OPENDESK_EXAMPLE_ALLOW_WINDOW_CHANGE=1`、`OPENDESK_EXAMPLE_ALLOW_CLIPBOARD_WRITE=1`。输入与窗口变更还需指定目标标题和 PID；剪贴板写入会覆盖原内容。

Accessibility 示例默认只从仓库自有 fixture 的 receipt 解析并复核当前 executable identity；运行已审核的非-fixture target 时才必须同时传入精确 PID/window id。它们不会选择“当前/第一个”窗口，也不会在失败后降级到鼠标或发送 Escape。运行证据写入 `.runtime/tests/accessibility/`。

## Vision、OCR、图像和声音

- [OCR](../../../examples/vision.ocr.js)、[图像字节转换](../../../examples/vision_bytes_roundtrip.js)、[图像颜色](../../../examples/imageColor.js)
- [模板匹配](../../../examples/image-color/template-match.js)、[图像差异](../../../examples/image-color/diff.js)、[匹配结果可视化](../../../examples/image-color/wechat-template-match-visual.js)
- [播放声音](../../../examples/sound.js)、[播放控制](../../../examples/sound-playback.js)、[音量与声音匹配](../../../examples/audio/)

OCR 需要对应识别服务；录屏和音频操作需按系统提示授权。声音匹配需提供自己的参考音频，示例会实际使用音频设备。

## Dialog 与 Custom UI（macOS）

- [Dialog 的两种写法及运行说明](../../../examples/README.md#原生-dialog)
- [Custom UI 示例源码](../../../examples/custom-ui/)与[使用说明](../../custom-ui/README.md)

## macOS 权限与真实应用

- [快捷键权限准备](../../../examples/global-shortcut-permission-setup.js)、[全局快捷键](../../../examples/global-shortcut.js)
- [macOS 权限、Safari、微信及计算器示例](../../../examples/mac/)

应用示例会操作真实窗口。使用可丢弃的测试内容，向微信等应用发送内容前须确认目标和内容；不要批量运行整个目录。

## AI recipe

- [向当前窗口输入](../../../examples/ai-cli/write-to-focused-app.js)、[TextEdit](../../../examples/ai-cli/macos-textedit-recipe.js)、[计算器](../../../examples/ai-cli/macos-calculator-recipe.js)
- [Recipe 输入参数](../execution.md#executioninput)

## Native Extension

- [原生扩展安装与使用](../../../examples/native-extensions/README.md)

## 正式测试 Scripts

开发者回归测试见[测试说明](../../quality/runtime-api-test-modules.md)和[测试目录](../../quality/developer-test-catalog.md)。
