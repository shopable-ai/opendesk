# JavaScript automation examples

OpenDesk 的公开自动化示例使用 JavaScript，并以 [`docs/api/`](../docs/api/README.md) 为 API 契约。

按工作目录、可复制命令、入口选择和旧脚本迁移说明运行示例，请先看
[`docs/api/examples/`](../docs/api/examples/README.md)。本文保留示例目录中较详细
的专题说明。

## macOS：按名称打开系统计算器

从仓库根目录运行：

```bash
./dist/opendesk ai run examples/open-calculator-by-name.js
```

示例使用 `App.launch('计算器', { waitUntilReady: 'window', timeout: 10000 })`，只启动或激活
Calculator、确认其实际 identity 并打印结果；它不会输入、清空、restart 或 terminate 已有实例。
`计算器` 和 `Calculator` 是仅限 macOS native-identity backend 的两个明确系统别名，均规范化为
`com.apple.calculator`，不是对任意应用名称的翻译。完整契约见 [`docs/api/app.md`](../docs/api/app.md)。

## 路径与源码上下文

从仓库根目录运行无需桌面权限的路径示例：

```bash
./dist/opendesk -script examples/path.js -console-mode script
```

它使用全局 `path` 计算 artifact 路径，并展示可信文件入口的
`Execution.scriptPath/scriptDir`。完整契约见 [`docs/api/path.md`](../docs/api/path.md)。

## 原生 Dialog

Promise-only 的 alert / confirm / prompt 流程提供两个互相独立的示例：

- [`dialog.js`](dialog.js)：直接使用 `async` / `await`；
- [`dialog-promise-chain.js`](dialog-promise-chain.js)：等价使用
  `.then()` / `.catch()` / `.finally()`。

两份文件都不会用开关隐藏另一种写法。它们都会在第二个原生 Dialog 中显示非敏感输入值，
并把取消路径明确显示为 `null`。完整契约见 [`docs/api/dialog.md`](../docs/api/dialog.md)。

### 普通手动运行

工作目录必须是仓库根目录，也就是同时包含 `opendesk`、`opendesk-ui-host` 和
`examples/` 的目录。二进制已由维护者更新后，选择下面其中一条命令直接运行：

```bash
./opendesk -ui -script examples/dialog.js -console-mode script
./opendesk -ui -script examples/dialog-promise-chain.js -console-mode script
```

这是两个替代命令，不需要连续运行。普通体验不包含构建步骤，也不需要手工执行 AX、窗口
观察器或鼠标控制命令。

运行 await 示例时，在第一个 alert 仍打开的情况下，终端应立即依次打印：

```text
Dialog timeline: before-call
Dialog timeline: before-call -> returned-promise
Dialog timeline: before-call -> returned-promise -> event-loop-continuation
```

这证明调用已经返回 Promise，EventLoop 没有被同步阻断。继续操作后，prompt 输入的非敏感值
应在标题为 `Prompt result` 的第二个窗口中显示；取消 prompt 时应显示
`Prompt result: null (the user canceled).`。窗口应紧凑地适配内容，不能出现异常拉宽、过高、
大面积空白、裁切或输入框/按钮错位。

### 构建物新鲜度（维护者 / Agent）

如果当前源码有更新，而根目录二进制的构建时间或 `go version -m` provenance 更旧，应由
维护者/Agent 先刷新主程序和配套 host，再把上面的一行命令交给用户：

```bash
go build -o ./opendesk ./cmd/opendesk
go build -o ./opendesk-ui-host ./cmd/opendesk-ui-host
```

构建后仍必须从仓库根目录原样执行公开命令并观察真实窗口；不能只用 `dist/`、临时测试
binary 或自动化 gate 的成功代替普通运行验证。

### 正式自动化验收

AX/WindowServer 控制、exactly-once、资源清理和截图证据由正式 gate 承担：

```bash
OPENDESK_RUNTIME_API_MODE=dialog ./dist/opendesk -script scripts/test_runtime_apis.js -console-mode script
```

源码位于 `tests/runtime-api/`，运行证据分别写入 `.runtime/tests/runtime-api/` 和
`.runtime/tests/dialog/`。这套自动化不是普通用户的示例运行步骤。

Go 源码不是公开 Runtime API 示例。仅有以下有意分开的例外：

- `legacy/`: historical host-side programs retained for compatibility context;
- `native-extensions/`: experimental standalone native-process protocol
  examples plus the JavaScript Runtime [`quickstart.js`](native-extensions/quickstart.js)
  that invokes them. Its precompiled-bundle install, author build/package and
  source-to-bundle mapping are in
  [`native-extensions/README.md`](native-extensions/README.md).

仅供开发的 Go 工具和视觉探针应放在 `tests/<domain>/tools/`，其运行产物放在
`.runtime/tests/<domain>/`。
