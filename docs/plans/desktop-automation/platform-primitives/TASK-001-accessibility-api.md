# TASK-001 — Accessibility API

Status: IN_PROGRESS
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
