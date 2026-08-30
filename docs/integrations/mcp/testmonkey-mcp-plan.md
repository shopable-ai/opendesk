# TestMonkey MCP 方案（借鉴 Peekaboo）

本文档定义当前项目的 MCP 升级方向：不直接复制 Peekaboo，而是借鉴其“工具化桌面能力 + MCP 暴露层 + 最小宿主入口”的结构，把 TestMonkey 现有自动化与视觉能力整理成一个可被 Hermes / Claude Desktop / 其他 MCP Host 调用的服务。

## 1. 设计结论

推荐路线：

1. 保留 TestMonkey 现有 Go 自动化内核（mouse / keyboard / screenshot / window / vision / permissions）
2. 新增轻量 MCP server 适配层
3. 新增独立入口 `cmd/testmonkey-mcp`
4. 优先走 stdio MCP，先兼容 Hermes / Claude Desktop 这类本地宿主
5. 后续再考虑把现有 HTTP execution/vision API 作为远程 transport 或桥接层

这和 Peekaboo 的共通点：
- 有一个独立的 MCP 进程入口
- 宿主看到的是“工具”，不是内部实现细节
- 把截图、权限、窗口、输入、视觉分析封装成可组合原子能力

这和 Peekaboo 的差异点：
- Peekaboo 更偏完整 macOS UI 语义控制
- TestMonkey 当前更强在脚本执行、视觉 OCR / detect-ui / layout、跨旧脚本兼容层
- 所以本项目更适合先做“runtime capability MCP”，再逐步补 UI 语义层

## 2. 当前代码库已经具备的 MCP 基础资产

### 2.1 可直接封装为工具的能力

已有能力来源：
- `automation/page.go`
  - `Screenshot`
  - `CheckScreenshotPermissions`
  - `RequestMacPermissions`
- `automation/mouse.go`
  - `Click`
  - `Move`
  - `Wheel`
- `automation/keyboard.go`
  - `Type`
  - `Press`
  - `Combination`
- `automation/window_manager_core.go`
  - `List`
  - `GetActiveWindow`
  - `Focus`
  - 部分窗口控制
- `automation/screen.go`
  - `GetDisplays`
  - `GetPrimaryDisplay`
  - `GetVirtualBounds`
- `automation/vision.go`
  - `RunOCR`
  - `DetectUI`
- `automation/vision_layout.go`
  - `AnalyzeLayout`
  - `AnnotateRegions`

### 2.2 现有 HTTP/执行层可复用资产

已有：
- `pkg/execution/*`：脚本执行、事件、summary、artifact
- `pkg/http/handler.go`：execution / vision 的 HTTP 路由
- `main.go`：现有 HTTP server 启动路径

说明：
- 这些更适合后续扩展成 MCP 的“script execution / run session / artifact query”类工具
- 但第一阶段不建议把整套 execution manager 一次性搬进 MCP；先做稳定原子工具更容易验证

## 3. Peekaboo 借鉴点

从 Hermes 的 Peekaboo 使用方式可以抽象出 3 个关键模式：

### 3.1 单独的 MCP 宿主入口

Peekaboo 作为单独的 MCP executable 提供给 Hermes。

对应到本项目：
- 已新增 `cmd/testmonkey-mcp/main.go`
- 它初始化 container + runtime，然后走 stdio MCP

### 3.2 工具优先，而不是脚本优先

Peekaboo 对外暴露 click/type/screenshot/list windows 等工具，而不是先让宿主传一整段脚本。

对应到本项目：
- 第一阶段也采用工具优先
- `tm_screenshot`, `tm_permissions`, `tm_list_windows`, `tm_click`, `tm_type`, `tm_press_key`, `tm_scroll`, `tm_ocr`, `tm_detect_ui`, `tm_analyze_layout`, `tm_annotate_regions`

### 3.3 视觉 + 动作分层

Peekaboo 的思路是“先感知，再执行”。

对应到本项目：
- `tm_screenshot`
- `tm_ocr`
- `tm_detect_ui`
- `tm_analyze_layout`
- 然后再 `tm_click` / `tm_type` / `tm_press_key`

这非常适合 TestMonkey 当前已有的视觉能力。

## 4. 已落地的第一版实现

本轮已经在仓库里加入最小可用 MCP 脚手架：

### 新增文件

- `pkg/mcpserver/server.go`
- `pkg/mcpserver/runtime.go`
- `pkg/mcpserver/server_test.go`
- `pkg/mcpserver/runtime_test.go`
- `cmd/testmonkey-mcp/main.go`

### 当前能力

#### MCP 协议骨架
- `initialize`
- `ping`
- `tools/list`
- `tools/call`
- stdio line-delimited request/response 处理

#### 已注册工具
- `tm_status`
- `tm_permissions`
- `tm_request_permissions`
- `tm_list_windows`
- `tm_get_active_window`
- `tm_focus_window`
- `tm_wait_for_window`
- `tm_focus_and_type`
- `tm_inspect_desktop`
- `tm_find_target`
- `tm_list_displays`
- `tm_screenshot`
- `tm_ocr`
- `tm_detect_ui`
- `tm_wait_for_text`
- `tm_click_text`
- `tm_capture_and_annotate`
- `tm_analyze_layout`
- `tm_annotate_regions`
- `tm_click_region`
- `tm_click`
- `tm_type`
- `tm_press_key`
- `tm_scroll`

#### 运行时适配
- `AutomationRuntime` 把现有 automation / vision 能力转换成 MCP tool backend

## 5. 为什么这版是对的，而不是直接克隆 Peekaboo

不建议把 Peekaboo 整仓克隆进当前项目主目录直接魔改，原因：

1. 能力边界不同
   - Peekaboo 偏 macOS accessibility 语义自动化
   - TestMonkey 偏截图/视觉/脚本执行/runtime 兼容

2. 代码风格和依赖体系不同
   - 直接 vendor 大项目会让当前 repo 维护复杂度暴增

3. 当前最缺的是“协议出口层”，不是“整套新自动化内核”
   - 本项目已经有大量可复用能力
   - 最优先是把这些能力产品化为 MCP tools

如果后面确实要深借 Peekaboo，建议：
- 克隆到仓库外或 `third_party/peekaboo-reference/` 仅做参考
- 重点学习其：
  - tool surface 命名
  - session/page/window 抽象
  - 权限/前台/窗口 targeting 语义
  - screenshot + analyze + act 的链路
- 不要直接把其整个 runtime 嵌入当前主路径

## 6. 推荐的下一阶段增强顺序

### Phase 1：把现在的 MCP 脚手架变成可接入真实 Host

优先级最高。

已补：
1. README / docs 使用方式
2. Hermes 接入文档示例
3. 最小 smoke 流程
4. 最小 stdio JSON-RPC smoke 测试

当前文档入口：
- `docs/mcp/README.md`
- `docs/mcp/hermes-integration.md`

### Phase 2：补齐 Peekaboo 风格的高频工具

这一阶段原先已经落了：
- `tm_get_active_window`
- `tm_focus_window`
- `tm_request_permissions`
- `tm_click_text`

随后完成：
- `tm_wait_for_window`
- `tm_focus_and_type`
- `tm_click_region`
- `tm_wait_for_text` polling 升级

本轮继续推进为更 agent-friendly 的 V1.5：

1. `tm_inspect_desktop`
   - 聚合：
     - `tm_status` 风格状态
     - permissions
     - active window
     - displays
     - optional screenshot
   - 作用：让 host 先做一轮低成本全局感知

2. `tm_find_target`
   - 聚合：
     - OCR
     - detect-ui
     - optional layout
   - 支持 `strategy` / `includeLayout`
   - 作用：把“找目标”从 host 侧多次调用下沉成一个组合工具

3. 最小动作安全语义
   - 当前先落一个最小 guard：
     - `tm_click.expectedWindowTitle`
   - active window 不匹配时：
     - 返回 `ok=false`
     - 不执行点击

这批改动的目标不是引入 Peekaboo 大量实现，而是继续把你自己的 `pkg/mcpserver` 做厚、做稳、做更适合 agent 使用。

### Phase 3：进一步引入“组合型智能工具”

本轮已经把这一阶段的第一批关键能力真正落地：
- `tm_act_on_target`
  - 接收来自 `tm_find_target` / `tm_click_region` / `detect-ui` / `layout` 的 target candidate
  - 统一执行 `click` / `type` / `focus`
  - 支持 `dryRun` / `previewOnly`
  - 支持 `expectedWindowTitle` guard
- `tm_find_target`
  - 现在返回标准化 `candidates[]`
  - 每个 candidate 尽量统一为：
    - `source`
    - `text` / `label`
    - `bounds`
    - `clickPoint`
    - `confidence`
    - `regionId`
    - `role`
  - 同时保留旧字段：`ocr` / `detectUI` / `layout`
- 最小安全语义继续增强：
  - `tm_click_text.expectedTargetText`
  - `tm_click_text.dryRun` / `previewOnly`
  - `tm_click_region.expectedTargetText`
  - `tm_click_region.previewOnly` / `dryRun`
  - `tm_act_on_target.expectedTargetText`
  - `tm_act_on_target.expectedWindowTitle`

原则已经收敛为：
- transport/tool 执行成功但前置条件不满足时
- 返回结构化 `ok=false`
- 不直接抛 transport 错误，除非是参数非法或内部异常

这标志着当前实现已经进入“感知聚合 + 目标发现 + 动作执行 + 最小安全保护”的阶段。

### Phase 4：后续仍值得继续补的方向

在当前基础上，下一步更值得补：
- 更细的 target disambiguation
  - 多候选排序/打分进一步结合窗口区域、layout role、历史交互上下文
  - host 决策前的 ambiguity hint 已有最小版本，后续可继续丰富 explanation
- 更丰富的 safety semantics
  - foreground expectations
  - freshness 已有最小 stale guard，后续可继续补 refresh/revalidate 策略
- 组合链路进一步主路径化
  - 推荐 host 默认使用：
    - `tm_inspect_desktop`
    - `tm_find_target`
    - `tm_act_on_target`
  - 当前主链路已经具备 inspect -> find -> act 的最小闭环

### Phase 5：再考虑脚本执行暴露

可选加入：
- `tm_run_script`
- `tm_get_execution`
- `tm_get_execution_events`
- `tm_get_execution_summary`

但这应该放在原子工具和组合工具稳定之后，否则 MCP 表面会变得太重。

## 7. 与现有 HTTP 层的关系

建议保留双通道：

1. HTTP 层
   - 给浏览器/前端/服务端集成
   - 更适合长任务、artifact、SSE

2. MCP 层
   - 给本地 agent / desktop host / Claude Desktop / Hermes
   - 更适合原子能力调用和组合工具调用

不要急着二选一。

最优做法是：
- 底层能力统一复用 `automation` / `vision`
- HTTP 与 MCP 分别做薄适配层

## 8. 目前缺口 / 风险

### 8.1 还不是完整 MCP spec 覆盖

当前是“最小可用 JSON-RPC MCP-ish server”。

缺口包括：
- 更完整的 MCP capability 协商
- 更标准的 content payload 组织
- notifications / logging 扩展
- 可能需要进一步对齐官方 MCP schema

但作为第一版方向是正确的。

### 8.2 当前 tool schema 已比 V1 更紧，但仍可继续强化

本轮已完成：
- 对新增工具补 required 字段
- 为常见字段补 enum
- 增加更多字段 description
- 在尽量不破坏已有测试的前提下收紧 schema

后续仍可继续细化：
- 更严格的截图 target 值
- clip/bounds 结构细化
- 视觉工具 image/imagePath 的 oneOf 约束
- region schema 更标准化
- 聚合工具结果结构的统一 schema

### 8.3 动作类工具安全语义仍刚起步

当前 TestMonkey MCP 仍以直接动作能力为主：
- click x/y
- type text
- press key

虽然现在已经补了：
- `tm_click_text`
- `tm_click_region`
- `tm_focus_and_type`
- `tm_wait_for_window`
- `tm_inspect_desktop`
- `tm_find_target`
- `tm_click.expectedWindowTitle`
- `tm_find_target` 候选排序 / `bestCandidate` / ambiguity hint
- `tm_act_on_target` stale guard / ambiguity-safe execution

但下一步仍建议继续补：
- foreground expectation
- refresh-and-revalidate before action
- richer ambiguity explanation / host hint
- action precondition explanation

### 8.4 macOS 当前限制与平台边界

当前 mcpserver 的 host-facing contract 已较清晰，但在 macOS 上仍需明确这些现实边界：

- 系统权限是硬前置条件：
  - Screen Recording
  - Accessibility
  - 自动化/输入控制相关权限
- 前台焦点与输入并不完全由 MCP 决定，仍受系统与目标 app 限制
- `tm_get_active_window` / `tm_list_windows` 可能返回一些底层窗口管理器历史字段，例如：
  - `exeName`
  - `exePath`
  - `handle`
  - `isPopup`
  - `isForeground`
  这些字段不应被 host 视为跨平台稳定 contract；更应优先依赖：
  - `title`
  - activeWindow
  - candidates
  - guards / preview contract
- 当前截图链路在 macOS 上可用，但上游截图库编译时会出现 CoreGraphics deprecation warning；这提示后续应评估 ScreenCaptureKit，而不是当前交付阻塞

### 8.5 当前阶段的交付闭环文档

为了把“是否完成”写清楚，本阶段新增：
- `docs/mcp/DELIVERY-CHECKLIST.md`
- `docs/mcp/TEST-MATRIX.md`
- `docs/mcp/MANUAL-SMOKE-macOS.md`

它们分别回答：
- 怎样判定当前阶段完成
- 自动化测试覆盖到哪里
- 哪些只能靠 macOS 真机 smoke 验证

## 9. 是否需要克隆 Peekaboo 到子目录？

结论：
- 现在“不需要”作为主实现路径
- “可以”作为参考资料单独放置，但不要并入主逻辑

推荐两种做法：

### 做法 A：不放进仓库
最干净。
- 需要时临时 clone 到 `/tmp` 或其他工作目录分析
- 不污染主仓库

### 做法 B：放 `third_party/peekaboo-reference/`，仅参考
适合后续持续对照。
要求：
- 明确写 `README` 说明仅供参考
- 不进入主 build
- 不直接 import

当前阶段我更推荐 A。

## 10. 我对这个项目的具体建议

### 推荐 V1.5 路线

先继续把现在已经写入仓库的 MCP 层做厚、做稳，而不是横向扩展更多系统：

1. 保持 `pkg/mcpserver` 作为主适配层
2. 继续增强高价值组合工具
3. 持续收紧 schema
4. 扩大 smoke / JSON-RPC 覆盖
5. 逐步增加动作安全语义
6. 再决定是否引入 Peekaboo 更深的窗口/语义 targeting 模型

### 当前最值得继续做的文件

1. `pkg/mcpserver/server.go`
   - 继续补更多高价值组合工具
   - 对齐更标准的 MCP tool schema
   - 强化 guarded actions
2. `pkg/mcpserver/server_test.go`
   - 增加组合链路、guard 语义、stdio smoke 覆盖
3. `pkg/mcpserver/runtime_test.go`
   - 继续补 runtime 参数规范化测试
4. `docs/mcp/hermes-integration.md`
   - 持续维护 host 接入说明
5. `cmd/testmonkey-mcp/main.go`
   - 可选继续补日志开关/版本输出

## 11. 本轮已验证

已执行：
- `go test ./pkg/mcpserver ./cmd/testmonkey-mcp`
- 在实现完成后再次执行相同测试确保回归通过

结果：通过。

当前测试已覆盖：
- 新工具注册存在性
- schema required / enum
- `tm_wait_for_text` polling
- `tm_wait_for_window` polling
- `tm_focus_and_type` 链式动作
- `tm_click_region` 基于 layout 的中心点击
- `tm_inspect_desktop` 聚合结果
- `tm_find_target` 聚合 OCR / detect-ui / layout
- `tm_click.expectedWindowTitle` guard
- 最小 stdio JSON-RPC smoke test：
  - `initialize`
  - `tools/list`
  - `tools/call tm_status`
  - `tools/call tm_wait_for_text`

注意：构建输出中仍存在上游 screenshot 依赖的 macOS deprecated warning，但不影响当前测试通过。

## 12. 总结

一句话：

当前项目最优解不是“把 Peekaboo 克隆进来直接改”，而是“借鉴 Peekaboo 的 MCP 产品形态，把 TestMonkey 现有自动化与视觉能力整理成一个独立 stdio MCP 服务，并持续把 `pkg/mcpserver` 做厚、做稳、做更 agent-friendly”。

当前状态判断：
- 核心 V1 已完成
- 当前处在 V1 -> V1.5 的增强阶段
- 当前重点不是 clone Peekaboo，而是继续增强你自己的 MCP 工具层
- 现在已经开始从“原子工具集合”走向“感知聚合 + 目标发现 + 最小动作保护”的 agent-friendly 形态
