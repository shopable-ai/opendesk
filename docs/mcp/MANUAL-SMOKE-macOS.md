# TestMonkey MCP Manual Smoke on macOS

本文档定义当前阶段在 macOS 上的最小真机交付验证流程。

目标不是做大而全人工测试，而是快速判断：
- 是实现问题
- 还是系统权限 / 焦点 / 截图后端现实限制

## 1. 前置条件

- 操作系统：macOS
- 已安装 Go
- 当前仓库：`/Users/a0000/Documents/workspace/testMonkey-go`
- 本机允许为终端/Hermes 授予系统权限

建议先关闭明显干扰项：
- 全屏独占窗口
- 高频弹窗
- 会自动抢焦点的应用

## 2. Build

在仓库根目录执行：

```bash
go build -o dist/testmonkey-mcp ./cmd/testmonkey-mcp
```

产物：

```bash
/Users/a0000/Documents/workspace/testMonkey-go/dist/testmonkey-mcp
```

## 3. Hermes 接入

编辑 `~/.hermes/config.yaml`：

```yaml
mcp_servers:
  testmonkey:
    command: /Users/a0000/Documents/workspace/testMonkey-go/dist/testmonkey-mcp
    timeout: 120
    connect_timeout: 30
```

然后重启 Hermes 会话/进程。

## 4. smoke 总体顺序

按这个顺序做：

1. `tm_status`
2. `tm_permissions`
3. `tm_list_windows`
4. `tm_screenshot`
5. `tm_inspect_desktop`
6. `tm_find_target`
7. `tm_act_on_target`（先 `previewOnly`）
8. 如需要，再做真实 click/type/focus

## 5. Step-by-step

### 5.1 验证 tm_status

期望：
- 返回 `status: ok`
- 如视觉 runtime 正常，通常有 `vision: enabled`

若失败：
- 属于 server 启动或 container/runtime 初始化问题
- 先不要继续做后续动作测试

### 5.2 验证 tm_permissions

期望：
- 能返回当前权限状态快照

如果权限不足：
- 先处理系统权限
- 再重试 `tm_permissions`
- 必要时调用 `tm_request_permissions`

macOS 重点检查：
- 屏幕录制 Screen Recording
- 辅助功能 Accessibility
- 自动化/输入控制相关授权

判断原则：
- `tm_permissions` 返回缺权限 -> 优先判定为系统前置条件问题
- 权限齐全但后续仍失败 -> 再看实现与运行时行为

### 5.3 验证 tm_list_windows

期望：
- 返回窗口数组
- 能看到当前前台 app 或你准备测试的目标 app

注意：
- 某些系统窗口、浮层、受保护窗口可能不会稳定暴露
- `exeName` / `exePath` / `handle` / `isPopup` 这类字段不是跨平台稳定 contract
- 在 macOS 上更应优先使用 `title`、可见窗口列表、activeWindow 等 host-friendly 信息

### 5.4 验证 tm_screenshot

示例参数：

```json
{
  "path": "/tmp/testmonkey-smoke.png",
  "target": "screen"
}
```

期望：
- 返回成功结果和路径
- 该文件实际存在且能打开

如果失败：
- 先看 `tm_permissions`
- 若权限正常但截图仍失败，可能是截图后端/系统限制

补充现实边界：
- 当前上游截图库在 macOS 上编译时会提示 CoreGraphics 截图 API deprecation warning
- 这不等于当前实现必然失效，但意味着后续应考虑 ScreenCaptureKit 路线

### 5.5 验证 tm_inspect_desktop

示例：

```json
{
  "captureScreenshot": true,
  "path": "/tmp/inspect.png"
}
```

期望：
- 返回：
  - status
  - permissions
  - activeWindow
  - displays
  - screenshot（如果请求）

判断意义：
- 这是 host-friendly 全局感知入口
- 若此处失败，说明主链路一开始就不稳定

### 5.6 验证 tm_find_target

建议先准备一个明确可见的目标，例如：
- 一个按钮文字“发送”
- Finder/Notes/浏览器中的明显文案

优先先测 `strategy=hybrid`：

```json
{
  "target_text": "发送",
  "strategy": "hybrid",
  "staleAfterMs": 5000
}
```

期望：
- 返回 `candidates[]`
- 返回 `bestCandidate`
- 必要时返回：
  - `ambiguous`
  - `ambiguityReason`
  - `ambiguityCandidates`

然后可补测：
- `strategy=ocr`
- `strategy=detect_ui`
- `strategy=layout`

判断原则：
- 如果 `hybrid` 有候选但单一 strategy 没候选，不一定是 bug，可能只是底层视觉能力差异
- 如果所有 strategy 都完全无结果，再检查：
  - 截图是否正确
  - 目标是否真实可见
  - 权限是否正确
  - 该界面是否超出当前视觉能力范围

额外边界：
- 若 `tm_ocr` 直接返回结构化 `externalBlocker`，本轮最小 live recheck 就应在这里停止
- 读取 action-specific hint：
  - `tm_ocr` -> 只该在 provider 恢复后，用 fresh screenshot/imagePath 重跑 `tm_ocr`
  - `tm_detect_ui` -> 只该在 `tm_ocr` 恢复后再继续
  - `tm_find_target strategy=ocr|detect_ui|hybrid` -> 只该在 `tm_ocr` 恢复后回到真实 inspect -> find -> act
- 不要继续把 layout `Region 01` 之类标签当成真实文本/UI target discovery

### 5.7 验证 inspect -> find -> act 最小真机 smoke

推荐流程：

1. `tm_inspect_desktop`
2. `tm_find_target`
3. 从结果中取 `bestCandidate`
4. 调 `tm_act_on_target`，先使用：
   - `previewOnly=true`
   - `expectedWindowTitle`
   - `expectedTargetText`

示例：

```json
{
  "target": {"...bestCandidate...": true},
  "action": "click",
  "previewOnly": true,
  "expectedWindowTitle": "WeChat",
  "expectedTargetText": "发送"
}
```

期望：
- 返回 `ok=true`
- `executed=false`
- `previewOnly=true`
- 返回 click 计划

这是当前阶段最重要的 safe action loop smoke。

### 5.8 可选：真实执行 click/type/focus

在 previewOnly 成功后，再去掉 previewOnly 做一次真实动作。

建议先从低风险动作开始：
- focus
- 对测试输入框 type
- 对非破坏性按钮 click

避免一开始对高风险目标做真实点击。

## 6. 如何区分“系统问题”还是“实现问题”

### 更像系统问题
- `tm_permissions` 明确显示缺权限
- 只有截图/点击失败，但 server/status/list_windows 正常
- 不同 app 表现差异明显，且集中在受保护窗口/系统界面
- 前台焦点总被系统或目标 app 拦截

### 更像实现问题
- 无论权限如何，某个 tool 总是结构性失败
- contract test 通过，但真机同一步骤在简单普通 app 中稳定失败
- `previewOnly` 生成的计划明显错误（坐标/目标文本/窗口 guard 错）
- strategy 选择与实际 evidence 返回不一致

### 更像能力边界而非 bug
- OCR 能看到文本，但 detect-ui 不稳定
- layout 有区域，但点击点不够精确
- 某些复杂自绘 UI 只能部分识别

## 7. 当前人工 smoke 结论模板

建议每次 smoke 记录至少这几项：
- build 是否成功
- Hermes 是否发现工具
- `tm_status` 是否正常
- `tm_permissions` 是否齐全
- `tm_list_windows` 是否能列出目标 app
- `tm_screenshot` 是否成功
- `tm_inspect_desktop` 是否正常
- `tm_find_target` 是否能给出 bestCandidate
- `tm_act_on_target previewOnly` 是否安全返回计划
- 真实执行是否成功
- 若失败，判定更像系统问题 / 实现问题 / 能力边界

## 8. 当前已知 macOS 限制

- 系统权限是硬前置条件
- 焦点/输入控制受系统与目标 app 共同影响
- 上游截图实现存在 deprecation warning，后续建议评估 ScreenCaptureKit
- 窗口底层元数据字段不应被当作跨平台稳定 contract

## 9. 当前 smoke 通过后，可如何判断“接近可交付”

若以下都成立，可判断当前阶段接近可交付：
- `go test ./pkg/mcpserver ./cmd/testmonkey-mcp` 通过
- Hermes 可发现 server 与工具
- `tm_status` / `tm_permissions` / `tm_list_windows` / `tm_screenshot` 基本正常
- inspect -> find -> act 的 `previewOnly` 闭环在真机可跑通
- 剩余问题主要是平台限制或长期增强，不再是主链路阻塞

## 10. 最近一次真机执行记录（2026-05-19, macOS）

执行产物：
- report: `/Users/a0000/Documents/workspace/testMonkey-go/.runtime/smoke/mcp/20260519-macos/report.json`
- audit: `/Users/a0000/Documents/workspace/testMonkey-go/.runtime/smoke/mcp/20260519-macos/audit.md`
- screenshot artifact dir: `/Users/a0000/Documents/workspace/testMonkey-go/.runtime/smoke/mcp/20260519-macos`

本次实际结果：
- build: 成功
- Hermes 接入检查: 成功
  - `hermes mcp list` 可见 `testmonkey`
  - `hermes mcp test testmonkey` 连接成功，发现 25 个工具
- `tm_status`: 成功
- `tm_permissions`: 成功
  - 返回 `accessibility=true`
  - 返回 `screenCapture=true`
  - `automation` 仍是提示性字符串：`requires runtime AppleEvents trigger`
- `tm_list_windows`: 成功
  - 可枚举 30 个窗口
- `tm_screenshot`: 成功
  - robotgo backend 可用
- `tm_inspect_desktop`: 成功
  - 可聚合 status / permissions / activeWindow / displays
- `tm_find_target`: 本轮先后做了两类真机尝试：
  1. `strategy=layout`：对静态 inspect 截图做低风险验证，未产出 `bestCandidate`
  2. `strategy=detect_ui`：在当前前台 WeChat 窗口上实际调用，但底层直接报错：`PADDLE_OCR_ENDPOINT is required for paddle provider`
- `tm_act_on_target previewOnly`: 未执行
  - 原因不是 transport 失败，而是 `tm_find_target` 没有拿到可执行 candidate

结论归因：
- 这轮 smoke 证明：
  - server/build/stdio/Hermes discoverability 正常
  - 基础 host-friendly 观测链路正常
  - 真机 screenshot / inspect / active-window / list-windows 在本机可用
- 这轮 smoke 尚未证明：
  - `tm_find_target` 在当前环境下能稳定产出可执行 `bestCandidate`
  - `tm_act_on_target` 的真机 preview / real action 闭环
- 阻塞归因：
  - `tm_ocr` / `tm_detect_ui` / `tm_find_target strategy=detect_ui|ocr|hybrid` 在本机当前环境下受外部配置阻塞：缺少 `PADDLE_OCR_ENDPOINT`
  - `strategy=layout` 虽然已可运行，但在本轮目标样例上没有稳定选出 host-friendly candidate，更像能力边界/样例选择问题，不是 server 启动或权限缺失

对后续 smoke 的严格建议：
1. 若要完成 inspect -> find -> act 真机闭环，优先补齐 OCR provider 配置（当前缺 `PADDLE_OCR_ENDPOINT`）。
2. OCR provider 可用后，在一个文本明确、可见、低风险的真实界面上重跑：
   - `tm_inspect_desktop`
   - `tm_find_target strategy=detect_ui` 或 `strategy=hybrid`
   - `tm_act_on_target previewOnly`
   - 再做一次低风险真实 focus/type/click
3. 若继续使用 `strategy=layout`，应选用更易被 layout 切分且 region label 更稳定的界面；不要把任意自动生成的 region label 当成真实目标文案。

## 11. 本轮追加真机执行记录（2026-05-19, macOS, 当前轮次）

本轮执行目标：
- 严格先验证 OCR provider 外部阻塞是否仍存在
- 若 OCR 仍阻塞，判断是否能在不依赖 OCR provider 的前提下完成一条低风险真机闭环

本轮额外实际命令与输入要点：
- 环境检查：`PADDLE_OCR_ENDPOINT` 与 `PADDLE_OCR_PROVIDER` 均为空
- 重新 build：`go build -o dist/testmonkey-mcp ./cmd/testmonkey-mcp`
- 直接以 stdio JSON-RPC 调用 `dist/testmonkey-mcp`
- 阶段 A 实际调用：
  - `tm_screenshot` with `imagePath=/tmp/testmonkey-stageA-screen.png`
  - `tm_ocr` with `imagePath=/tmp/testmonkey-stageA-screen.png`
  - `tm_detect_ui` with `imagePath=/tmp/testmonkey-stageA-screen.png`
  - `tm_find_target strategy=detect_ui` with `imagePath=/tmp/testmonkey-stageA-screen.png`
  - `tm_find_target strategy=hybrid` with `imagePath=/tmp/testmonkey-stageA-screen.png`
- 阶段 C 实际调用：
  - `tm_inspect_desktop` with `captureScreenshot=true, path=/tmp/testmonkey-stageC-inspect.png`
  - `tm_find_target strategy=layout` with `target_text=python3, imagePath=/tmp/testmonkey-stageC-inspect.png, staleAfterMs=5000`
  - `tm_act_on_target` `action=focus` `previewOnly=true`，guard 使用 `expectedWindowTitle=python3`、`expectedTargetText=python3`
  - 在 preview 成功后，执行一次真实 `tm_act_on_target action=focus`

本轮实际结果：
- 阶段 A：OCR provider 外部阻塞已被再次真实验证，且仍然存在
  - `tm_ocr`: 失败，根因仍为 `PADDLE_OCR_ENDPOINT is required for paddle provider`
  - `tm_detect_ui`: 失败，根因仍为 `PADDLE_OCR_ENDPOINT is required for paddle provider`
  - `tm_find_target strategy=detect_ui`: 失败；在当前 runtime error wrapping 下，host-facing 报错可能表现为 `ocr failed: PADDLE_OCR_ENDPOINT is required for paddle provider`
  - `tm_find_target strategy=hybrid`: 失败；当前 recheck 中实际看到的 host-facing 报错为 `ocr failed: PADDLE_OCR_ENDPOINT is required for paddle provider`
  - 归因：外部配置阻塞，非当前代码修复可消除
- 阶段 C：在不依赖 OCR provider 的前提下，完成了一条最小低风险真机闭环
  - `tm_inspect_desktop`: 成功
    - `activeWindow.title=python3`
    - 截图成功，保存到 `/tmp/testmonkey-stageC-inspect.png`
    - 当前这次 inspect 的 screenshot backend 为 `darwin-screencapture`
  - `tm_find_target strategy=layout`: 成功返回 `candidates[]` 与 `bestCandidate`
    - `bestCandidate.label=text=Region 01`
    - `bestCandidate.source=layout`
    - `bestCandidate.role=layout_region`
    - 但该 candidate 只代表布局区域，不代表真实文本目标
  - `tm_act_on_target previewOnly`（绕过 OCR，直接对 inspect 取得的前台窗口 title 构造低风险 focus target）: 成功
    - 返回 `ok=true`
    - 返回 `executed=false`
    - 返回 `previewOnly=true`
    - 返回 `focusTitle=python3`
  - `tm_act_on_target` 真实 `focus`: 成功
    - 返回 `ok=true`
    - 返回 `executed=true`
    - 实际为对已在前台的 `python3` 窗口执行一次低风险 focus

本轮边界判断：
- 已完成的真机闭环是：
  - inspect -> act(previewOnly) -> act(real focus)
  - 以及 layout-only 的 inspect -> find 合同验证
- 仍未完成的真机闭环是：
  - inspect -> find(真实 host-friendly 文本/UI target) -> act
  - 因为 detect_ui / ocr / hybrid 仍被外部 OCR provider 阻塞
- 为什么这不是当前代码 bug：
  - 同一二进制下，`tm_inspect_desktop`、`tm_screenshot`、`tm_find_target strategy=layout`、`tm_act_on_target` 都能成功
  - 失败只集中在依赖 OCR provider 的链路，并且报错稳定一致、直接指向缺失环境变量 `PADDLE_OCR_ENDPOINT`
- 为什么继续投入当前代码难以显著提分：
  - 当前最关键缺口已不在 `tm_act_on_target` 或 inspect 聚合，而在外部 OCR provider 缺失
  - 在未补齐 provider 前，继续修改 server orchestration 无法让 detect_ui/ocr/hybrid 真机成功

对交付结论的影响：
- 本机当前环境下，`host-friendly target discovery + safe action loop` 不是“完全完成”
- 但可以判定为：
  - 在外部 OCR provider 阻塞前提下，当前可控范围内的全部核心交付已执行到位
  - 外部阻塞边界已被钉死到无法误解
- 后续若补齐 `PADDLE_OCR_ENDPOINT`，应优先只补一轮真实文本目标的 detect_ui/hybrid smoke，而不是重做当前已验证部分。

本轮代码侧补强（对应自动化回归保护已新增）:
- `tm_ocr`：当命中已知 OCR provider 缺失时，不再只返回 transport error；现在返回结构化 `externalBlocker` payload：
  - `ok=false`
  - `guard=externalBlocker`
  - `action=ocr`
  - `failedStep=ocr`
  - `rootCause=PADDLE_OCR_ENDPOINT is required for paddle provider`
  - `wrappedError=ocr failed: PADDLE_OCR_ENDPOINT is required for paddle provider`
  - `blockerType=provider_missing`
  - `provider=paddle`
  - `missingConfigKey=PADDLE_OCR_ENDPOINT`
  - `recoverable=true`
  - `retryRecommended=false`
  - `requiresHumanConfig=true`
- `tm_detect_ui`：命中同一 provider 缺失时，等价返回 `action=detect_ui` 的结构化 `externalBlocker` payload，并保留原始 `wrappedError`、`provider=paddle`、`missingConfigKey=PADDLE_OCR_ENDPOINT`

为什么这在 OCR 仍阻塞时仍值得做：
- 本轮要求先做最小真实复核 OCR provider 是否恢复；最小复核本身就直接调用了 `tm_ocr`
- 若直接视觉工具仍只抛 transport error，host 在“最小重检/交接恢复”阶段仍需要靠字符串猜测 stop condition
- 现在 host 可以对 `tm_find_target`、`tm_ocr`、`tm_detect_ui` 统一按结构化 blocker 处理：停止、提示人工配置、避免误判为 server bug

为什么这不等于伪装“完全完成”：
- 该补强只改善 host-facing contract 与交接清晰度
- 它没有让 `inspect -> find(真实 host-friendly 文本/UI target) -> act` 真机闭环在缺失 provider 时 magically 成功
- 因此交付结论仍必须维持：外部阻塞前提下完成可控范围交付，而不是完全完成

本轮新增的高价值非阻塞增强集中在 runtime adapter 与 host-facing OCR blocker contract，而不是继续围绕同一 OCR 外部阻塞空转：

- 新增 `tm_find_target` 的结构化 `externalBlocker` 返回：
  - 当 `strategy=ocr|detect_ui|hybrid` 命中已知 provider 缺失根因 `PADDLE_OCR_ENDPOINT is required for paddle provider`
  - 不再只返回 transport error
  - 现在返回正常 tool payload，包含：
    - `action=find_target`
    - `guard=externalBlocker`
    - `failedStep`
    - `rootCause`
    - `wrappedError`
    - `remediationHint`
    - `hostHint`
    - `blockerType=provider_missing`
    - `recoverable=true`
    - `retryRecommended=false`
    - `requiresHumanConfig=true`
  - 这样 host 能更稳定地区分：
    - 当前不可继续的外部前置条件
    - 与真正的 server/runtime 实现 bug
- 新增 `activeWindowMap` helper：
  - 把 `AutomationRuntime.GetActiveWindow()` 的字段映射收口到一个专门 helper
  - nil 输入现在返回零值结构，而不是空 map，便于 host 端稳定消费字段
- 把 runtime 动作层错误包装下沉到 adapter：
  - `get_active_window`
  - `focus_window`
  - `screenshot`
  - `ocr`
  - `detect_ui`
  - `analyze_layout`
  - `annotate_regions`
  - `click`
  - `type`
  - `press_key`
  - `scroll`
  现在都会在 runtime/action 边界保留统一的 `action failed: cause` 前缀，便于 host 定位失败来源
- 保持实现克制：
  - 没有引入新的大抽象层
  - 没有重做已完成的 inspect/find/act server orchestration
  - 只补当前还能显著提分的 adapter 级 contract/可观测性

本轮新增/强化的自动化测试：
- `activeWindowMap` / `AutomationRuntime.GetActiveWindow()` nil-safe 字段映射
- `wrapRuntimeError` action 前缀语义
- 现有 helper 级 coverage 继续保留：
  - `normalizeVisionArgs`
  - `splitKeyChord`
  - `ack`
  - `buildRevalidationArgs`
  - ambiguity guard helper

本轮测试结果：
- `go test ./pkg/mcpserver ./cmd/testmonkey-mcp`：通过

本轮最终边界没有变化：
- 不是“完全完成”
- 而是“在外部 OCR provider 阻塞前提下，当前可控范围内的全部核心交付已完成，且高价值非阻塞增强也已继续推进到位”

由于 `PADDLE_OCR_ENDPOINT` 仍为空，本轮没有再重复无效围绕 OCR provider 打转；改为补充主链路的高价值非阻塞增强：

1. `tm_act_on_target` 最小 refresh/revalidate before action
   - stale candidate 不再一律直接终止
   - 若调用上下文仍保留 `imagePath`/`image` 与可复用 target text，会先自动重跑一次最小 `tm_find_target` 逻辑
   - 若重找成功，则继续生成新的 click preview plan
   - 若重找失败，则返回结构化：
     - `guard=revalidationFailed`
     - `reason`
     - `hostHint`
     - `revalidation`

2. ambiguity 解释更适合 host
   - `ambiguousTarget` guard 结果现在会带：
     - `reason`
     - `hostHint`

3. 自动化回归补强
   - 新增 tests 覆盖：
     - stale candidate -> revalidate success -> preview plan
     - stale candidate -> revalidate failure -> structured guard
     - ambiguous candidate -> `reason` / `hostHint`
     - helper: `buildRevalidationArgs`
     - helper: `wrapRuntimeError`

注意：
- 这些增强不会解除 OCR provider 缺失
- 它们提升的是 host-facing 安全动作语义与回归保护，而不是伪装 detect_ui/hybrid 真机已经恢复