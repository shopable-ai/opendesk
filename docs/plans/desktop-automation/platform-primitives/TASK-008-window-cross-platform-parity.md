# TASK-008 — Window Cross-Platform Parity

Status: DONE
Priority: P1
Depends on: TASK-007 recommended

## Goal

审计并补齐 Window 在各平台的真实能力差异，使公共 API 的 capability、错误语义和文档与实现一致；重点不是追求所有平台 100% 相同，而是消除“接口存在但某平台静默失效/行为不同”的不确定性。

## 开始前必须审计

- `docs/api/window.md` 与源码逐项对照。
- Windows/macOS/Linux backend 的 method matrix。
- focus、bounds、maximize/minimize/restore、close、always-on-top、list、active window、PID variants。
- Recorder / Accessibility 是否已有窗口 identity 与 bounds helper。

## 第一阶段：Capability Matrix

为每个平台生成或维护机器可读 capability：

```text
window.list
window.active
window.findByTitle
window.focus
window.getBounds
window.setBounds
window.minimize
window.maximize
window.restore
window.close
window.alwaysOnTop
window.bringToTop
```

每项标记：Stable / Partial / Unsupported / Experimental。

## 第二阶段：修复高价值差异

优先级：

1. active/list/find/focus。
2. get/set bounds。
3. minimize/maximize/restore。
4. close。
5. always-on-top / bringToTop。

只实现有稳定 OS primitive 的能力；不为了矩阵好看使用高脆弱模拟点击。

## 必须解决

- 窗口 identity 与 title 不稳定问题。
- 多个同名窗口。
- coordinate space / scale factor。
- 窗口在不同 Space/desktop 的行为。
- target 已关闭/重建后的 stale reference。
- platform-specific error code。

## 非目标

- 本任务不实现 Menu/Dock/Spaces；分别由后续 integration 卡处理。
- 不把 Accessibility tree API 塞进 Window。
- 不保证 Linux 所有桌面环境一次性完整支持。

## 测试

至少建立同一组 contract tests，在支持的平台执行；Unsupported 必须得到明确结构化结果而不是假成功。

## Done

- 文档与实现的 Window capability matrix 一致。
- macOS/Windows 至少完成核心路径 smoke；其他平台明确列出缺口。
- 不存在新增的重复 Window backend。
- API、类型、机器索引同步。

## Completion record

Decision: EXTEND

Base HEAD: `4f2d0f3c93d37bb7538c56ec4a7bb0ceb09802dd`

Final Commit: 本任务的 task-closing commit（实际 SHA 见 Git 历史与连续执行最终报告）

### Audit

- 现有公共 `window`、跨平台 `WindowManager` facade、macOS CoreGraphics + bounded System Events
  backend 和 Windows Win32 backend 已覆盖本卡约 80% 的候选动作，因此没有创建第二套 Window、
  Accessibility、Spaces、MCP 或 HTTP 系统。
- Recorder / visual runner 只消费现有 `WindowInfo` identity/bounds；`third_party` 只有 screenshot/robotgo，
  没有更成熟且适合替换当前 facade 的 window driver。GlobalShortcut 完全未修改或复制。
- 真实缺口是：没有 capability matrix；Linux `title/content` 静默返回空串；错误只有 message；Windows
  list 缺标准 `pid` 且 focus/MoveWindow 忽略 BOOL 失败；标题解析会任意命中同名窗口；Goja 把
  `ID/ProcessID/uintptr` 投射为 `iD/processID/{}`；macOS JXA 枚举行把 handle 固定为 0；正式 live
  manifest 甚至没有加载已有 `window.test.js`。

### Implementation

- 在同一 `WindowManager` facade 增加 `window.getCapabilities()`，逐项报告 list/active/find/focus/
  bounds/minimize/maximize/restore/close/always-on-top/bring-to-top 的 `Stable | Partial | Unsupported |
  Experimental`，并附 identity、coordinate space 和 Space/virtual-desktop 边界。
- 现有标题动作先解析唯一的当前窗口：同名或多个模糊匹配返回 `AMBIGUOUS_TARGET`；初次不存在返回
  `NOT_FOUND`；解析后关闭/重建/改名返回 `STALE_TARGET`。width/height/PID 参数在 backend 前验证。
- 新增 Window structured error code，并让通用 AutoMap bridge 只对显式实现 `JSProperties()` 的
  error 投射 `code/operation/platform/capability`；其他 API 行为不变。Linux `title/content` 改为明确
  `NOT_SUPPORTED`，不再 silent empty string。
- Window observation 统一 `id/pid/handle`。macOS 复用现有 CoreGraphics bridge，以 PID + bounds 对
  JXA 行唯一回填 CGWindowID；不能唯一解析的行明确为 `platform:pid:unresolved`。Windows active/find/
  list 补 HWND、pid 和 focus/readback metadata，MoveWindow/SetForegroundWindow 的 BOOL 失败不再
  假成功。
- macOS list 标为 Partial（System Events 不可用时只降级到 active row）；always-on-top 明确
  Unsupported。Windows focus/bring-to-top 和 close 保持 Partial，Windows live 未在 macOS 主机上
  冒充验证。

### Tests

- `go test ./automation ./internal/aicli` -> PASS；覆盖 capability、identity/PID normalization、stale
  error、invalid geometry，并验证 AI CLI 适配新的 fallible `content()`。
- `GOOS=windows GOARCH=amd64 CGO_ENABLED=0 go test automation/window_manager_core.go
  automation/window_manager.go automation/js.go automation/console.go` -> PASS；Windows Window 实现
  目标编译通过。整包 Windows cross-test 仍被仓库既有 `third_party/robotgo` CGO-disabled 缺失
  `Bitmap/Rect` 挡住，与本卡 Window 源码无关。
- `GOOS=linux GOARCH=amd64 CGO_ENABLED=0 go test automation/window_manager_core.go
  automation/window_manager_stub.go` -> PASS；Unsupported backend contract 目标编译通过。
- `./scripts/test_runtime_apis.sh unit` -> PASS，401/401；证据：
  `.runtime/tests/runtime-api/20260901T212215Z-12622/`。
- `OPENDESK_RUNTIME_API_LIVE_FILTER=window.test.js ./scripts/test_runtime_apis.sh live-only` -> PASS，
  2/2；标题动作链和 PID 动作链均通过，cleanup 无 residual。证据：
  `.runtime/tests/runtime-api/20260901T212509Z-14650/`。
- 从仓库根目录原样执行公共示例：
  `./opendesk -script examples/window-capabilities.js -console-mode script` -> PASS；12 项 capability、
  `windowCount=17`、`activeReadable=true`，未写入窗口标题。
- `go test ./...` -> 本任务相关 package PASS；`pkg/visionrun` 保持本 Goal 开始前已有的 4 个无关失败：
  两个缺 real validation input、一个缺 `capture_contract.json`、一个缺当前 preflight report。本任务未
  修改该 package，也未新增全仓失败。

### Evidence

- 平台：macOS 12.7.6 / x86_64；backend=`CoreGraphics+SystemEvents`；source-built binary SHA-256
  `20cd4b877607ab2671f568c801584af66126621bccd8384a3a268496ac002ee8`。
- repository-owned Safari loopback fixture identity=`darwin:43772:native:4465`。执行 focus、
  getFocusWindow、bringToTop、set bounds/width/height 后，readback=`x:768 y:123 width:1113 height:709`；
  随后 maximize/restore/minimize/restore 与 PID variants 均通过，最终恢复原 bounds。
- 脱敏 evidence：`.runtime/tests/platform-primitives/task-008-window-parity/evidence.json`；只含 fixture
  app、PID/native identity、操作名、bounds、capability 与 artifact metadata，不含用户窗口标题或内容。
- 1113×709 实窗截图：`.runtime/tests/platform-primitives/task-008-window-parity/window.png`；Safari
  fixture 内容自适应、控件对齐、无异常拉宽/大面积空白，底部为页面正常可滚动内容延伸。
- live cleanup：runtime/watchdog/fixture server 全部退出，无残留；公共示例 evidence：
  `.runtime/tests/platform-primitives/task-008-window-parity/example.json`。

### API and documentation

- 公共 API 只扩展现有 `window.getCapabilities()`，并给现有 WindowInfo 增加统一 `id`；未新增命名空间。
- 同步 `types/window.d.ts`、`docs/api/window.md`、`docs/api/index.md`、
  `docs/api/runtime-api.ai.json`、`tests/runtime-api/manifest.js` 与 unit/live contract。
- 新增根目录可直接复制示例 `examples/window-capabilities.js`；现有 `window.test.js` 正式进入 live
  manifest，不再是未执行资产。

### Remaining

- Windows 本轮只有源码/目标编译证据，没有 Windows 真机 live smoke；能力矩阵和文档明确标注该
  verification boundary。未来具备目标机时应运行同一 Window contract，不创建新 backend。
- macOS 跨 Space、不可见或 metadata 不足的窗口可能得到 `:unresolved` identity；title actions、
  AX mutation、close 和 focus 仍是 Partial。调用方必须重新观察并处理 capability/error，不能缓存旧 ID。
- `content/getContent` 是遗留 best-effort accessor：macOS 只返回标题兼容值，Windows 仅能读取部分
  原生控件文本；完整 Accessibility tree 属于 TASK-001/integration 边界，未塞入 Window。
