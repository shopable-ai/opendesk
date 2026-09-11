# Events 示例

本目录保存面向用户的 Runtime 事件和全局触发类 examples。事件监听往往会让 execution 持续存活或等待外部状态变化，因此是否适合 Example Explorer 一键运行必须逐项审核。

## Global Shortcut

首次在 macOS 配置权限时运行：

```bash
./dist/opendesk -script examples/events/global-shortcut-permission-setup.js -console-mode script
```

实际注册快捷键：

```bash
./dist/opendesk -script examples/events/global-shortcut.js -console-mode script
```

`global-shortcut.js` 注册 `CommandOrControl+Shift+q`；用户触发后写入固定的示例剪贴板文本。快捷键属于当前 execution 资源，停止 execution 后应自动注销。

两份示例都在 Catalog 中标记为 `manual`：权限准备可能打开系统设置，快捷键示例会注册全局输入并在用户触发时修改剪贴板。

过去位于 `examples/` 根目录的 `global-shortcut.js` 和 `global-shortcut-permission-setup.js` 已退休并删除；Catalog `legacyNames` 仅保留历史名称/搜索上下文。

历史 `clipboard.changed` smoke 已迁出 public Examples，维护者诊断位于 `tests/automation/tools/events/`。

完整接口契约见 [`docs/api/global-shortcut.md`](../../docs/api/global-shortcut.md) 和 [`docs/api/events.md`](../../docs/api/events.md)。
