---
title: Examples 快速索引
description: 查看 examples 示例源码、运行命令和使用说明。
order: 710
---

# Examples 快速索引

公开示例的 canonical 实现按领域保存在 `examples/<domain>/`。从仓库根目录运行；已经完成迁移的旧根路径已删除，不再保留 compatibility wrapper。

需要逐项复制命令时，使用[单项示例运行 guide](single-tests.md)。

## OpenDesk Examples 图形入口

仓库内置 `apps/example-explorer/` 作为面向新手和开发者的 Examples 浏览与运行工具。它不属于 `examples/`，而是消费 `examples/catalog.json`、canonical 示例源码和本 API 文档体系。

```bash
./dist/opendesk -ui -script apps/example-explorer/main.js -console-mode script -log-dir .runtime/apps/example-explorer
```

普通列表只展示 `examples/catalog.json` 中登记的 canonical examples。`legacyNames` 只是历史名称/搜索元数据，不表示旧文件继续存在；Explorer 搜索会使用它们。helper、support、test、smoke 和未审核 JavaScript 不进入普通列表。

- `runPolicy: "safe"`：允许一键 Run；
- `runPolicy: "manual"`：可以搜索、查看源码、文档和前置条件，但必须手动运行。

目录或扩展名本身不会授予执行权限。鼠标/键盘输入、截图/录屏、OCR、音频、通知、原生 UI、全局快捷键、持久化或真实应用操作默认保持 `manual`。

每个 Run 都通过独立 OpenDesk 子进程执行，Stop 使用 `AbortController`；Catalog 的 `launch` 由 Runner 和 Copy Run Command 共同消费，因此复制的命令与实际 argv 保持一致。当前 `Command.run()` 在子进程结束时一次性返回 stdout/stderr，因此界面显示的是完成后的有界输出，不声称实时流式终端。

Catalog schema version 2 的执行契约要求 `platforms` 声明支持的 `darwin` / `linux` / `windows`，`launch.kind` 为 `script` 或 `ai-run`；script 可声明 `ui` 和 `consoleMode`，ai-run 可声明 `input: "required"`。`safe` 只表示当前平台可以直接一键执行；`manual` 仍可复制正确命令，但要求用户先阅读前置条件。需要用户填写的 `requiredEnv` 只显示变量名，不会写入 secret 或假值。

## 基础 Runtime 与数据

- [Runtime 示例总览](../../../examples/runtime/README.md)
- [Runtime Quickstart](../../../examples/runtime/api-quickstart.js)
- [Console](../../../examples/runtime/console.js)、[globalThis](../../../examples/runtime/global-this.js)、[Promise](../../../examples/runtime/promise.js)
- [Sleep](../../../examples/runtime/sleep.js)、[Timer](../../../examples/runtime/timer.js)、[Page Wait](../../../examples/runtime/page-wait.js)
- [Environment](../../../examples/runtime/environment.js)、[Path](../../../examples/runtime/path.js)
- [File](../../../examples/runtime/file.js)、[JSON File](../../../examples/runtime/file-json.js)、[Command](../../../examples/runtime/command.js)
- [AppStorage](../../../examples/runtime/app-storage.js)、[System Info](../../../examples/runtime/system-info.js)、[Session State](../../../examples/runtime/system-session-state.js)

## SQLite Runtime API

- [建表、写入、查询与跨运行持久化](../../../examples/sqlite/README.md)

## 桌面输入、屏幕和窗口

- [Desktop 示例总览](../../../examples/desktop/README.md)
- [窗口查询](../../../examples/desktop/window-inspect.js)、[窗口控制](../../../examples/desktop/window-controls.js)、[键盘输入](../../../examples/desktop/keyboard.js)
- [UI 相对文本定位](../../../examples/desktop/ui-relative-target.js)
- [鼠标输入](../../../examples/desktop/mouse.js)、[Page 固定坐标与截图](../../../examples/desktop/page-click.js)
- [屏幕信息](../../../examples/desktop/screen-info.js)、[截图](../../../examples/desktop/screenshot.js)、[截图字节](../../../examples/desktop/screenshot-bytes.js)
- [显示模式](../../../examples/desktop/display-modes.js)、[区域录屏](../../../examples/desktop/screen-record-region.js)
- [剪贴板](../../../examples/clipboard/README.md)
- [Native Accessibility、UI 原生文本值与菜单](../../../examples/accessibility/README.md)

键盘、鼠标、UI 点击、窗口修改需要明确目标和显式授权；截图与录屏会捕获真实可见内容。不要批量运行 Desktop 示例。

Desktop 输入示例要求 `OPENDESK_EXAMPLE_ALLOW_INPUT=1`，窗口修改示例要求 `OPENDESK_EXAMPLE_ALLOW_WINDOW_CHANGE=1`；两个变量都只表示用户已经阅读并确认当前目标。

## Vision、OCR 与图像

- [Vision 示例总览](../../../examples/vision/README.md)
- [ImageColor 基础](../../../examples/vision/image-color-basic.js)
- [截图字节与 OCR](../../../examples/vision/bytes-roundtrip.js)
- [OCR 与文本目标](../../../examples/vision/ocr.js)
- [ImageColor 专题套件](../../../examples/image-color/README.md)：[模板匹配](../../../examples/image-color/template-match.js)、[图像差异](../../../examples/image-color/diff.js)、[匹配结果可视化](../../../examples/image-color/wechat-template-match-visual.js)

## Audio

- [Audio 示例总览](../../../examples/audio/README.md)
- [播放声音](../../../examples/audio/play.js)
- [播放控制](../../../examples/audio/playback-control.js)
- [已知声音监听](../../../examples/audio/watch-known-sound.js)、[多模式监听](../../../examples/audio/watch-market-multisentence.js)

## Dialog 与 Custom UI

- [Dialog 示例总览](../../../examples/dialog/README.md)
- [Dialog async/await](../../../examples/dialog/async-await.js)
- [Dialog Promise chain](../../../examples/dialog/promise-chain.js)
- [Custom UI 示例源码](../../../examples/custom-ui/)
- [Custom UI 使用说明](../../custom-ui/README.md)

## Notifications

- [Notifications 示例总览](../../../examples/notifications/README.md)
- [发送通知](../../../examples/notifications/send.js)
- [通知生命周期](../../../examples/notifications/lifecycle.js)

## Events 与 Global Shortcut

- [Events 示例总览](../../../examples/events/README.md)
- [全局快捷键权限准备](../../../examples/events/global-shortcut-permission-setup.js)
- [全局快捷键](../../../examples/events/global-shortcut.js)

权限准备可能打开系统设置；全局快捷键会注册系统级输入并在触发时修改剪贴板，因此两者都保持 `manual`。Events API Reference 见 [Events](../events.md)，快捷键契约见 [Global Shortcut](../global-shortcut.md)。

## 应用、Recorder 与真实业务场景

- [应用示例](../../../examples/app/README.md)
- [App Mode](../../../examples/app-mode/)
- [Recorder：人工录制与独立 basic JS 生成](../../../workflows/human-to-recipe/README.md)；脚本资产位于 `workflows/human-to-recipe/`

应用示例可能操作真实窗口或业务数据。使用可丢弃测试内容，运行前阅读对应 README 和 Catalog 前置条件。

## macOS 平台专项

- [macOS 权限、Safari、微信及计算器示例](../../../examples/mac/)

现有 `examples/mac/` 暂时保留；平台目录会在单独迁移中处理，不为 Example Explorer 的结构整理强行制造无关路径变化。

## AI recipe

- [向当前窗口输入](../../../examples/ai-cli/write-to-focused-app.js)
- [TextEdit](../../../examples/ai-cli/macos-textedit-recipe.js)
- [计算器](../../../examples/ai-cli/macos-calculator-recipe.js)
- [Recipe 输入参数](../execution.md#executioninput)

## Native Extension

- [原生扩展安装与使用](../../../examples/native-extensions/README.md)

## 正式测试 Scripts

Examples 用于学习、观察和手动体验，不负责声明公共 API 已通过正式验证。开发者回归测试见[测试说明](../../quality/runtime-api-test-modules.md)和[测试目录](../../quality/developer-test-catalog.md)。

剪贴板写入示例必须显式设置 `OPENDESK_EXAMPLE_ALLOW_CLIPBOARD_WRITE=1`；音频 fixture generator、listener、smoke 和 Runtime contract test 均位于 `tests/`，不会出现在 Explorer 的普通列表。`examples/mac/`、`examples/protected-packages/` 和 `examples/app-mode/` 是平台实验或特殊打包入口，按各自 README 运行，不伪装成 Explorer 的普通 script。
