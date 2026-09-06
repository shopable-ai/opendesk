---
title: 单项示例运行
description: 直接运行 examples 中的示例，查看输出和使用方法。
order: 4
---

# 单项示例运行

从仓库根目录运行，点击示例名称查看代码。按命令使用已准备好的 `opendesk` 或 `dist/opendesk`，输出显示在终端；窗口示例还会打开实际窗口。

## 基础用法

- [Runtime 入门](../../../examples/runtime/api-quickstart.js)：`./opendesk -script examples/runtime/api-quickstart.js -console-mode script`
- [环境信息](../../../examples/runtime/environment.js)：`./opendesk -script examples/runtime/environment.js -console-mode script`
- [路径与脚本位置](../../../examples/runtime/path.js)：`./dist/opendesk -script examples/runtime/path.js -console-mode script`
- [文件读写、复制与移动](../../../examples/runtime/file.js)：`./opendesk -script examples/runtime/file.js -console-mode script`
- [JSON 读写](../../../examples/runtime/file-json.js)：`./opendesk -script examples/runtime/file-json.js -console-mode script`
- [运行命令并打印结果](../../../examples/runtime/command.js)：`./dist/opendesk -script examples/runtime/command.js -console-mode script`
- [控制台打印](../../../examples/console.js)：`./opendesk -script examples/console.js -console-mode script`
- [Promise](../../../examples/promise.js)：`./opendesk -script examples/promise.js -console-mode script`
- [等待](../../../examples/sleep.js)：`./opendesk -script examples/sleep.js -console-mode script`
- [定时器](../../../examples/timer.js)：`./opendesk -script examples/timer.js -console-mode script`

## HTTP 请求

先启动自己控制的测试服务，并将地址替换为实际地址。

- [GET 请求](../../../examples/runtime/http.js)：`OPENDESK_EXAMPLE_HTTP_URL=http://127.0.0.1:8080/echo ./opendesk -script examples/runtime/http.js -console-mode script`

## SQLite

- [建表、写入与查询](../../../examples/sqlite/quickstart.js)：`./dist/opendesk -script examples/sqlite/quickstart.js -console-mode script`
- [持久化写入](../../../examples/sqlite/persistence-write.js)：`./dist/opendesk -script examples/sqlite/persistence-write.js -console-mode script`
- [读取上一步的数据](../../../examples/sqlite/persistence-read.js)：`./dist/opendesk -script examples/sqlite/persistence-read.js -console-mode script`

## Page 点击、截图与等待

现有 `page.js` 会按固定坐标点击桌面。先查看代码、调整坐标，再在测试桌面运行，并授予截图权限。

- [Page 点击与截图](../../../examples/page.js)：`./opendesk -script examples/page.js -console-mode script`
- [Page 等待 quickstart](../../../examples/page.waitfor.js)：`./dist/opendesk -script examples/page.waitfor.js -console-mode script`
- [Page 等待共享用例 smoke](../../../examples/runtime/page-wait.test.js)：`./dist/opendesk -script examples/runtime/page-wait.test.js -console-mode script`

Page 等待 smoke 复用正式 Page family 的共享行为用例，要求必需分组与四个方法全部执行，并报告 `failed: 0`、`skipped: 0`。

Windows PowerShell 的对应待验收命令：

```powershell
.\dist\opendesk.exe -script examples/page.waitfor.js -console-mode script
.\dist\opendesk.exe -script examples/runtime/page-wait.test.js -console-mode script
```

本轮没有 Windows 真机 Runtime evidence，因此这两条命令是 **NOT_EVALUATED**；登记命令不表示已经运行或通过。

## 窗口与键盘

查询无需修改窗口。输入和移动示例需将标题、PID 替换为可丢弃测试窗口的实际值，并按系统提示授予权限。

- [查询窗口](../../../examples/desktop/window-inspect.js)：`./opendesk -script examples/desktop/window-inspect.js -console-mode script`
- [检查窗口能力](../../../examples/window-capabilities.js)：`./opendesk -script examples/window-capabilities.js -console-mode script`
- [向指定窗口输入一行文字](../../../examples/desktop/keyboard.js)：`OPENDESK_EXAMPLE_WINDOW_TITLE='OpenDesk input test' OPENDESK_EXAMPLE_WINDOW_PID=12345 OPENDESK_EXAMPLE_ALLOW_INPUT=1 ./opendesk -script examples/desktop/keyboard.js -console-mode script`
- [移动指定窗口并恢复位置](../../../examples/desktop/window-controls.js)：`OPENDESK_EXAMPLE_WINDOW_TITLE='OpenDesk window test' OPENDESK_EXAMPLE_WINDOW_PID=12345 OPENDESK_EXAMPLE_ALLOW_WINDOW_CHANGE=1 ./opendesk -script examples/desktop/window-controls.js -console-mode script`

## 剪贴板

以下示例会覆盖系统剪贴板，不会恢复原内容；先保存需要保留的内容。

- [文本复制与读回](../../../examples/clipboard/text.js)：`OPENDESK_EXAMPLE_ALLOW_CLIPBOARD_WRITE=1 ./opendesk -script examples/clipboard/text.js -console-mode script`
- [富文本复制（macOS）](../../../examples/clipboard/rich-paste-fixture.js)：`./opendesk -script examples/clipboard/rich-paste-fixture.js -console-mode script`

## Dialog 与 Custom UI（macOS）

主程序及配套 `opendesk-ui-host` 就绪后，运行一条命令，在打开的窗口中操作。

- [Dialog：async/await](../../../examples/dialog.js)：`./opendesk -ui -script examples/dialog.js -console-mode script`
- [Dialog：Promise 链](../../../examples/dialog-promise-chain.js)：`./opendesk -ui -script examples/dialog-promise-chain.js -console-mode script`
- [按钮面板](../../../examples/custom-ui/panel.js)：`./opendesk -ui -script examples/custom-ui/panel.js -console-mode script`
- [表单](../../../examples/custom-ui/form.js)：`./opendesk -ui -script examples/custom-ui/form.js -console-mode script`
- [浮动工具栏](../../../examples/custom-ui/five-button-toolbar.js)：`./opendesk -ui -script examples/custom-ui/five-button-toolbar.js -console-mode script`
- [图标列表](../../../examples/custom-ui/icon-list.js)：`./opendesk -ui -script examples/custom-ui/icon-list.js -console-mode script`

## 图像与原生扩展

图像示例使用仓库自带图片；原生扩展需先按[安装说明](../../../examples/native-extensions/README.md)准备对应扩展包。

- [图像模板匹配](../../../examples/image-color/template-match.js)：`./opendesk -script examples/image-color/template-match.js`
- [图像差异](../../../examples/image-color/diff.js)：`./opendesk -script examples/image-color/diff.js -console-mode script`
- [调用原生扩展](../../../examples/native-extensions/quickstart.js)：`./dist/opendesk -script examples/native-extensions/quickstart.js -console-mode script`
- [原生 OCR](../../../examples/native-extensions/ocr-quickstart.js)：`./dist/opendesk -script examples/native-extensions/ocr-quickstart.js -console-mode script`

其他示例与平台说明见[示例索引](README.md)。
