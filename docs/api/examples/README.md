---
title: Examples 快速索引
description: 查看 examples 示例源码、运行命令和使用说明。
order: 3
---

# Examples 快速索引

公开示例的 canonical 实现按领域保存在 `examples/<domain>/`。从仓库根目录运行；旧根目录脚本只作为兼容入口，不再作为新文档推荐路径。

## OpenDesk Examples 图形入口

仓库内置 `apps/example-explorer/` 作为面向新手和开发者的 Examples 浏览与运行工具。它不属于 `examples/`，而是消费 `examples/catalog.json`、canonical 示例源码和本 API 文档体系。

从仓库根目录启动：

```bash
./dist/opendesk -ui -script apps/example-explorer/main.js -console-mode script -log-dir .runtime/apps/example-explorer
```

普通列表只展示 `examples/catalog.json` 中登记的 canonical examples。`aliases` 记录历史兼容路径，不重复显示；helper、support、test、smoke 和未审核 JavaScript 不进入普通列表。

- `runPolicy: "safe"`：允许一键 Run；
- `runPolicy: "manual"`：可以搜索、查看源码、文档和前置条件，但必须手动运行。

目录或扩展名本身不会授予执行权限。鼠标/键盘输入、截图/录屏、OCR、音频、通知、原生 UI、持久化或其他具有明显前置条件的示例默认保持 `manual`。

每个 Run 都通过独立 OpenDesk 子进程执行，Stop 使用 `AbortController` 取消该子进程；Run 和 Stop 右侧的 Copy Run Command 会把当前选中示例对应的终端命令复制到剪贴板，例如选中 `examples/runtime/console.js` 时复制 `./dist/opendesk -script examples/runtime/console.js -console-mode script`。当前 `Command.run()` 在子进程结束时一次性返回 stdout/stderr，因此界面显示的是完成后的有界输出，不声称实时流式终端。Example 成功也不等于正式 Runtime API 测试通过；正确性 gate 仍以 `tests/` 和对应质量文档为准。

## 基础 Runtime 与数据

- [Runtime 示例总览](../../../examples/runtime/README.md)
- [Runtime Quickstart](../../../examples/runtime/api-quickstart.js)
- [Console](../../../examples/runtime/console.js)、[globalThis](../../../examples/runtime/global-this.js)、[Promise](../../../examples/runtime/promise.js)
- [Sleep](../../../examples/runtime/sleep.js)、[Timer](../../../examples/runtime/timer.js)、[Page Wait](../../../examples/runtime/page-wait.js)
- [Environment](../../../examples/runtime/environment.js)、[Path](../../../examples/runtime/path.js)
- [File](../../../examples/runtime/file.js)、[JSON File](../../../examples/runtime/file-json.js)、[Command](../../../examples/runtime/command.js)
- [AppStorage](../../../examples/runtime/app-storage.js)、[System Info](../../../examples/runtime/system-info.js)、[Session State](../../../examples/runtime/system-session-state.js)

其中 AppStorage 和详细 System Info 在 Explorer 中为 `manual`；其余是否一键运行以当前 `examples/catalog.json` 为准。

## SQLite Runtime API

- [建表、写入、查询与跨运行持久化](../../../examples/sqlite/README.md)

## 桌面输入、屏幕和窗口

- [Desktop 示例总览](../../../examples/desktop/README.md)
- [窗口查询](../../../examples/desktop/window-inspect.js)、[窗口控制](../../../examples/desktop/window-controls.js)、[键盘输入](../../../examples/desktop/keyboard.js)
- [鼠标输入](../../../examples/desktop/mouse.js)、[Page 固定坐标与截图](../../../examples/desktop/page-click.js)
- [屏幕信息](../../../examples/desktop/screen-info.js)、[截图](../../../examples/desktop/screenshot.js)、[截图字节](../../../examples/desktop/screenshot-bytes.js)
- [显示模式](../../../examples/desktop/display-modes.js)、[区域录屏](../../../examples/desktop/screen-record-region.js)
- [剪贴板](../../../examples/clipboard/README.md)
- [Native Accessibility、UI 原生文本值与菜单](../../../examples/accessibility/README.md)

键盘、鼠标、窗口修改需要明确目标和显式授权；截图与录屏会捕获真实可见内容。不要批量运行 Desktop 示例。

## Vision、OCR 与图像

- [Vision 示例总览](../../../examples/vision/README.md)
- [ImageColor 基础](../../../examples/vision/image-color-basic.js)
- [截图字节与 OCR](../../../examples/vision/bytes-roundtrip.js)
- [OCR 与文本目标](../../../examples/vision/ocr.js)
- [ImageColor 专题套件](../../../examples/image-color/README.md)：[模板匹配](../../../examples/image-color/template-match.js)、[图像差异](../../../examples/image-color/diff.js)、[匹配结果可视化](../../../examples/image-color/wechat-template-match-visual.js)

OCR 需要对应 provider；可见像素可能包含敏感信息。`vision/ocr.js` 还会对解析出的目标执行真实点击，因此保持 `manual`。

## Audio

- [Audio 示例总览](../../../examples/audio/README.md)
- [播放声音](../../../examples/audio/play.js)
- [播放控制](../../../examples/audio/playback-control.js)

目录中历史 smoke、fixture 生成器和监听实验不会因为位于 `audio/` 就自动进入 Explorer 普通列表。

## Dialog 与 Custom UI

- [Dialog 示例总览](../../../examples/dialog/README.md)
- [Dialog async/await](../../../examples/dialog/async-await.js)
- [Dialog Promise chain](../../../examples/dialog/promise-chain.js)
- [Custom UI 示例源码](../../../examples/custom-ui/)
- [Custom UI 使用说明](../../custom-ui/README.md)

Dialog 与 Custom UI 需要真实 native UI 交互，因此 Catalog 中保持 `manual`；UI API Reference 见 [Custom UI](../ui.md) 和 [Dialog](../dialog.md)。

## Notifications

- [Notifications 示例总览](../../../examples/notifications/README.md)
- [发送通知](../../../examples/notifications/send.js)
- [通知生命周期](../../../examples/notifications/lifecycle.js)

通知会真实显示在操作系统桌面上，可能播放声音，因此保持 `manual`。

## 应用、Recorder 与真实业务场景

- [应用示例](../../../examples/app/README.md)
- [App Mode](../../../examples/app-mode/)
- [Recorder：人工录制与独立 basic JS 生成](../../../workflows/human-to-recipe/README.md)

应用示例可能操作真实窗口或业务数据。使用可丢弃测试内容，运行前阅读对应 README 和 Catalog 前置条件。

## macOS 权限与平台专项

- [快捷键权限准备](../../../examples/global-shortcut-permission-setup.js)、[全局快捷键](../../../examples/global-shortcut.js)
- [macOS 权限、Safari、微信及计算器示例](../../../examples/mac/)

现有 `examples/mac/` 暂时保留；平台目录会在单独迁移中处理，不为 Example Explorer 的结构整理强行制造大规模路径变化。

## AI recipe

- [向当前窗口输入](../../../examples/ai-cli/write-to-focused-app.js)
- [TextEdit](../../../examples/ai-cli/macos-textedit-recipe.js)
- [计算器](../../../examples/ai-cli/macos-calculator-recipe.js)
- [Recipe 输入参数](../execution.md#executioninput)

## Native Extension

- [原生扩展安装与使用](../../../examples/native-extensions/README.md)

## 正式测试 Scripts

Examples 用于学习、观察和手动体验，不负责声明公共 API 已通过正式验证。开发者回归测试见[测试说明](../../quality/runtime-api-test-modules.md)和[测试目录](../../quality/developer-test-catalog.md)。
