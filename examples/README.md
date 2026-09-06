# JavaScript automation examples

OpenDesk 的公开自动化示例使用 JavaScript，并以 [`docs/api/`](../docs/api/README.md) 为 API 契约。

按工作目录、可复制命令、入口选择和旧脚本迁移说明运行示例，请先看
[`docs/api/examples/`](../docs/api/examples/README.md)。本文保留示例目录中较详细
的专题说明。

## 第一批规范目录

基础 Runtime 示例现位于 [`runtime/`](runtime/README.md)，包含 quickstart、环境、路径和 JSON
读写；旧的四个根目录文件仅兼容转发。SQLite 共享断言和独立 smoke 入口归入
[`tests/runtime-api/`](../tests/runtime-api/sqlite-smoke.js)，公开使用示例仍在 `sqlite/`。
图像分级分析归入 `tests/automation/tools/image-layout-lab/`，不作为用户 quickstart 或回归通过证明。

本轮仅整理已确认职责的文件，不批量删除 probe、图片、JSON 或历史脚本。完整迁移台账、
兼容退出条件和验证边界见 [目录与迁移规则](../docs/quality/example-test-layout.md)。

## 已维护的使用示例

文件、固定命令与显式测试服务请求见 [runtime/](runtime/README.md)；剪贴板文本见
[clipboard/](clipboard/README.md)；只读窗口查询、指定窗口输入和 bounds 控制见
[desktop/](desktop/README.md)。千牛特定动作独立在 [app/](app/README.md)，不再混入窗口查询。

旧根目录入口只转发到唯一实现。HTTP/剪贴板/桌面动作新增的显式前置条件同样约束旧入口，
不再默认访问旧局域网服务、清空剪贴板、向任意焦点按 Enter 或改变当前窗口。
剪贴板压力矩阵属于 `tests/runtime-api/clipboard-stress.js`，显式 opt-in，不是新用户体验步骤。

各示例包含必要结果检查，但检查 API 返回或宿主侧单元测试通过，不代表实窗内容/视觉效果已通过。
先原样运行文档命令并观察结果；不要批量执行示例目录，也不要把所有未知文件标成已维护。

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
./dist/opendesk -script examples/runtime/path.js -console-mode script
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
