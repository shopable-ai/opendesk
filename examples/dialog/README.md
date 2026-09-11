# Dialog 示例

本目录是 native Dialog 的 canonical public examples。两份示例展示同一类 alert / confirm / prompt 流程，但分别使用 `async` / `await` 与 Promise chain；两者都需要 Custom UI 授权和受支持的 native UI host。

## async/await

从仓库根目录运行：

```bash
./opendesk -ui -script examples/dialog/async-await.js -console-mode script
```

示例证明 Dialog 调用返回 Promise，EventLoop 在 alert 打开期间仍可继续；随后执行 confirm 和非敏感 prompt，并把取消明确表示为 `false` / `null`。

## Promise chain

```bash
./opendesk -ui -script examples/dialog/promise-chain.js -console-mode script
```

使用 `.then()` / `.catch()` / `.finally()` 表达同一类流程，不通过开关隐藏 async/await 版本。

## Explorer

两份 Dialog 都需要真实用户交互，因此 `examples/catalog.json` 标记为 `manual`：Example Explorer 可以搜索、阅读源码和前置条件，但不会一键运行。

旧根路径 `examples/dialog.js` 与 `examples/dialog-promise-chain.js` 已退休并删除。Catalog `aliases` 只用于历史名称/搜索上下文。

完整接口契约见 [`docs/api/dialog.md`](../../docs/api/dialog.md)。功能成功不等于原生视觉验收通过；正式视觉、生命周期和资源清理验收属于相应测试 gate。
