# TASK-001 — Accessibility API

Status: BLOCKED
Priority: P0
Depends on: none

## Goal

把当前零散存在于 macOS AX 点击、Recorder 验证等位置的 Accessibility 能力整理为正式、可测试、可复用的公共原语，使 OpenDesk 从“截图 + OCR + 坐标”升级为“Accessibility + Vision + OCR + Coordinate”的混合桌面 Driver。

## 开始前必须审计

- `mouse.clickForPID` 的 AX 命中与 `AXPress` 实现。
- Recorder 中 AX role/action/label/postcondition 的读取与验证。
- Window / macOS native driver 的现有 AX helper。
- Peekaboo 或已引入 third_party 中是否已有可直接复用能力；避免重复实现。

## MVP API 候选

```js
Accessibility.snapshot(options?)
Accessibility.getFocusedElement(options?)
Accessibility.elementAtPoint(x, y, options?)
Accessibility.query(selector, options?)
Accessibility.queryAll(selector, options?)
```

Element 至少统一：

```text
pid
role
subrole
name
label
value
identifier
bounds
enabled
focused
actions
path
```

Element Actions 最小集合：

```text
press
focus
setValue
increment
decrement
```

## 必须解决

- PID / application identity 约束。
- 全局坐标与窗口局部坐标边界。
- AX tree snapshot 的稳定结构与深度/节点数上限。
- query 唯一性：0、1、N 个结果必须可区分。
- stale element：不要长期保存裸 native handle。
- 权限检测和结构化错误。
- 不支持 AX 的 Canvas/WebGL/自绘 UI 必须明确失败，不自动假装成功。
- 与 Vision fallback 的职责边界：底层 Accessibility API 不自动调用 LLM/OCR。

## 非目标

- 本任务不做自主 Agent locator repair。
- 不实现完整跨平台 UI Automation parity。
- 不把 OCR result 包装成 AX Element。

## 测试

至少覆盖：

1. Calculator / System Settings 等系统应用的 snapshot。
2. 按 role/name 查询唯一控件。
3. 多结果与零结果。
4. focused element。
5. elementAtPoint。
6. AXPress。
7. setValue（适用控件）。
8. 无 Accessibility 权限。
9. stale / window changed。
10. 负坐标副屏。

## Evidence

保存至少一份真实 macOS 运行 evidence，包含：

- app identity / pid
- window bounds
- query
- matched element metadata
- action
- postcondition
- screenshot 或 readback

不得记录敏感文本字段的完整值；必要时 redaction。

## Done

- 有正式实现而非仅文档。
- JS 用户 API 可调用。
- 单元 + macOS integration/smoke 通过。
- API 文档、`runtime-api.ai.json`、`.d.ts` 同步。
- 明确列出仍未覆盖的平台与控件类型。

## Execution record — 2026-09-02

Decision: `BLOCKED`（恢复后采用 `INTEGRATE`，不新建第二套完整 macOS AX Driver）

Base HEAD: `809bb69caa8409a7dcc48a9b3fa2eb90ed448f42`

Final Commit: 本任务的 task-closing commit（实际 SHA 见 Git 历史与连续执行最终报告）

Implementation:

- 当前公共 API 中不存在 `Accessibility` global；本轮没有把 mock-only surface 暴露给用户。
- 已有原语是 `mouse.clickForPID()` 的 PID/window/point/AX PID/`AXPress` fail-closed 链、
  `keyboard.typeForPID()` 的 focused AX element 写入，以及 Recorder smoke tools 中的 AX role、
  action 和 readback 验证；它们是可保留的 `NativeProvider` fallback，不等于完整 AX hierarchy。
- `pkg/recorder` 只保存 normalized locator/postcondition 数据；正式 runtime、MCP、HTTP、
  `types/*.d.ts`、`docs/api` 和 examples 均没有另一套完整 Accessibility API。
- 仓库已有的 Peekaboo 重叠审计明确把 Accessibility hierarchy、element ID、snapshot、
  `set-value` 与通用 AX action 路由为 integration，而不是继续 native parity 开发。

Tests:

- `go test ./...`：未通过；`automation`、`pkg/execution`、`pkg/recorder` 等本任务相关包通过，
  现有 `pkg/visionrun` 有 4 个与本任务无关的 fixture/runtime-input 失败。
- 未运行 Accessibility JS smoke：当前没有可诚实调用的公共 JS API，且选定 backend 在本机不可运行。

Evidence:

- 本机审计：macOS `12.7.6` (`21H1320`), `x86_64`, Go `1.25.13`, Swift `5.7.2`；
  `peekaboo` 不在 `PATH`，仓库声明的 local cache 也不存在。
- 当前 Peekaboo 发布版要求 macOS 15+；CLI source build 还要求 Swift 6.2+。当前宿主也没有完整
  Xcode，仅有 Command Line Tools。来源：
  [Peekaboo platform support](https://github.com/openclaw/Peekaboo/blob/main/docs/platform-support.md)、
  [Peekaboo permissions](https://github.com/openclaw/Peekaboo/blob/main/docs/permissions.md)。
- 本地非提交 evidence：`.runtime/tests/platform-primitives/task-001-accessibility/audit-2026-09-02.json`。
- 因 backend 的最低系统版本高于当前宿主，本轮不存在可保留的真实 snapshot/action/screenshot；
  这被记录为缺失证据和 blocker，没有写成通过。

Why this is blocked:

- 在当前 macOS 12 宿主安装或源码构建当前 Peekaboo 不能满足其官方运行/工具链下限。
- 为绕过该限制自建完整 AX tree/action driver 会违反仓库既有 Integrate-first 决策和本 Goal 的防重复规则。
- 仅添加 CLI mock adapter 或无 backend 的 `Accessibility` global 无法满足本卡的真实 macOS smoke、
  stale element、query uniqueness 和 action readback 完成标准。

Remaining / unblock condition:

- 在 macOS 15+、Swift 6.2+/对应 Xcode、已安装并已授权的 Peekaboo host 上重新打开本卡。
- 先完成 `DesktopProvider` / `PeekabooProvider` CLI JSON thin adapter，保留 provider-native opaque
  snapshot/element identity，并映射为 OpenDesk normalized snapshot/query/action/error model。
- 完成真实 Calculator/System Settings snapshot、focused element、element-at-point、0/1/N query、
  `AXPress`、`setValue`、stale snapshot、权限拒绝和负坐标副屏证据后，才暴露并标记 JS API。
