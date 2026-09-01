# TASK-003 — Desktop Event / Watcher

Status: DONE
Priority: P0
Depends on: none

## Goal

建立统一的桌面事件订阅原语，减少大量固定轮询，为 Window/App/Clipboard/Display 等能力提供可组合的 watcher。

## Existing capability guardrail

`GlobalShortcut` 已经是现有能力，本任务禁止重新实现 `GlobalHotkey` / `GlobalShortcut`，也不得为了 Event 系统再造第二套快捷键注册 API。

如 `GlobalShortcut` 已经有可复用的 callback lifecycle、native run loop、execution teardown 或 subscription registry，可以复用这些基础设施；但事件 API 与快捷键 API 的职责必须保持独立。

## MVP 范围

优先实现可靠、低风险事件：

```text
window.focused
window.created
window.closed
window.moved
window.resized
app.launched
app.terminated
clipboard.changed
display.changed
```

输入事件只在有明确产品需求和权限模型时增加，不把本任务演变为全局输入监控器。

## API 候选

```js
const sub = Events.on('window.focused', event => {});
sub.unsubscribe();

const event = await Events.once('window.created', { timeout: 5000 });
```

## 必须解决

- 与 Goja EventLoop 的线程边界。
- subscription ownership 与 execution teardown。
- backpressure / event storm。
- debounce / coalescing 是否放在底层或 helper。
- callback Promise 与失败语义。
- event payload schema version。
- timeout / cancellation。
- 平台 capability discovery。

## 设计约束

- Event 是事实通知，不负责业务推理。
- Watcher 不自动点击、不自动恢复。
- 不允许因为某平台没有原生事件就 silent polling；若使用轮询 fallback 必须显式标记 backend。
- Scheduler 是时间触发，Events 是状态变化触发，两者不要合并。
- GlobalShortcut 是明确用户快捷键触发，Events 是通用桌面状态变化；不要把两者合并成同一个公共 API。

## 测试

至少覆盖：

1. 窗口 focus 变化。
2. 窗口 move/resize。
3. app launch/terminate。
4. clipboard changed。
5. unsubscribe。
6. execution teardown。
7. callback error。
8. event storm 不造成队列无界增长。
9. once + timeout。

## Done

- 有统一 event abstraction。
- 至少 macOS 核心事件有真实 smoke evidence。
- 与 execution events 日志区别清楚：一个是桌面外部事件，一个是 OpenDesk 执行事件。
- 未新增任何重复的 GlobalShortcut / GlobalHotkey 实现。
- 文档、类型、机器索引同步。

## Execution record — 2026-09-02

Decision: IMPLEMENT

Base HEAD: `d78d492c538705b39e55777e1c048b7668b09ba4`

Final Commit: this task-closing commit

### Audit

- 仓库此前没有公共 `Events` / watcher Runtime API、类型、`docs/api` 页面、MCP 或 HTTP surface。
- `pkg/execution.Emitter` 是 OpenDesk 自身执行日志，Scheduler 是时间触发，Custom UI event queue
  仅覆盖 OpenDesk 创建的 UI；它们都不是外部桌面状态 watcher。
- 现有 `globalShortcut` 只作为 owner EventLoop、single-flight callback 和 execution teardown 的
  生命周期参考；本任务没有新建、重命名或修改第二套快捷键公共系统。
- 当前 window facade、`Screen.getDisplays()`、macOS `NSWorkspace` 与 `NSPasteboard.changeCount`
  已能提供最小状态快照，因此无需再造一套 window/process/clipboard/display API。

### Implementation

- 新增实验性 JS Runtime 全局对象 `Events`：`on`、`once`、`getCapabilities`。
- 支持本卡列出的 9 类 window/app/clipboard/display 事件；当前 backend 明确报告为
  `polling`，不伪装成 native notification，unsupported 平台 fail closed。
- worker 只传递 Go 数据，Goja callback/Promise 全部回到 owner EventLoop；同事件类型在队列侧
  coalesce，每个 subscription callback 保持 single-flight，并仅保留最新 deferred event。
- subscription 归当前 execution 所有；unsubscribe、once timeout、取消、异常与 execution teardown
  均回收 backend handle、timer 和 pending callback。
- 事件 schema 固定 `schemaVersion: 1`，并带 `backend`、UTC `timestamp`、`sequence`、
  `coalesced` 与 `data`；错误使用稳定 code：`INVALID_EVENT`、`INVALID_ARGUMENT`、
  `NOT_SUPPORTED`、`BACKEND_FAILED`、`CALLBACK_FAILED`、`TIMEOUT`。
- 没有增加 MCP/HTTP surface；当前公共入口只限 JavaScript Runtime。

### Tests

- `go test ./automation -run TestDesktop -count=5` -> PASS。
- `go test ./pkg/execution -run TestRunJavaScriptDesktopEvents -count=3` -> PASS。
- `go test ./automation ./pkg/execution` -> PASS。
- `./scripts/test_runtime_apis.sh unit` -> PASS；新增 Events contract/behavior 用例与完整
  Runtime API unit catalog 全部通过，证据位于
  `.runtime/tests/runtime-api/20260901T183234Z-83081/`。
- `go test ./...` -> TASK-003 相关 package PASS；`pkg/visionrun` 仍有审计前已经存在的 4 个
  非本任务失败：两个缺 real validation input、一个缺 `capture_contract.json`、一个缺当前
  preflight report。本任务未修改 `pkg/visionrun`，也未新增全仓失败。

### Evidence

- 从仓库根目录原样执行文档命令：
  `go run ./cmd/opendesk -script examples/events/clipboard-changed.js -console-mode script` -> PASS。
- 实机：macOS 12.7.6 / amd64；真实 `NSPasteboard.changeCount` 变化由 polling backend 捕获，
  event sequence 为 1，`contentIncluded=false`。
- 无敏感内容 Evidence：
  `.runtime/tests/platform-primitives/task-003-events/clipboard-changed.json`。
- smoke 临时写入 marker 后恢复先前文本；旧 Clipboard API 无法保真恢复非文本 formats，此限制
  已在示例和 API 文档中明确记录。

### API and documentation

- 公共类型：`types/Events.d.ts`。
- 用户文档：`docs/api/events.md`，并同步 `docs/api/index.md`、`docs/api/README.md`。
- 机器索引：`docs/api/runtime-api.ai.json` 与 `tests/runtime-api/manifest.js`。
- 可复制示例：`examples/events/clipboard-changed.js`。

### Remaining

- 当前为 Experimental polling fallback；短间隔事件可能被合并，不能用于要求每个底层通知都
  完整留痕的审计场景。
- window created/closed/moved/resized 的完整性受现有 macOS window facade 能力和权限影响；
  无权限或 JXA/AX 失败时明确返回 `BACKEND_FAILED`。
- 本轮真实 smoke 只直接验证 `clipboard.changed`；其余事件完成状态 diff、schema、lifecycle 与
  execution integration 测试，尚未声称各平台逐事件 live verified。
- 后续可在不改变公共 API 的前提下替换为平台原生 backend；Runtime capability 中的
  `verified` 不会把仓库一次 smoke 自动提升为每台宿主机的运行时证明。
