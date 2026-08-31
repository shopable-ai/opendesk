# WeChat Desktop Automation Architecture

本文件定义 WeChat 场景在 OpenDesk 中应采用的**架构边界与组合方式**。它不是当前 production implementation 清单。

## 当前事实

截至 2026-08-31：

- OpenDesk 已有通用窗口、截图、输入、Vision/OCR、layout 与 MCP 工具；
- `pkg/mcpserver/` 已提供 `tm_inspect_desktop -> tm_find_target -> tm_act_on_target`；
- 当前仓库没有独立维护的 `wechat_steps`、`wechat_structured_send_v2.js` 或 WeChat-specific Go adapter；
- 历史 WeChat 报告和研究存在，但不能证明当前版本端到端链路已实现。

因此当前架构目标是：**用通用 OpenDesk primitive + 薄 WeChat scenario adapter/workflow**，而不是再建立一套平行 runtime。

## 分层

```text
User / Agent Intent
        |
        v
WeChat Scenario Policy
  - target chat identity
  - send safety
  - scenario postconditions
        |
        v
Semantic Target / Guard Layer
  - inspect
  - find candidates
  - ambiguity / freshness
  - expected window / text
        |
        v
OpenDesk Runtime Primitives
  - window / screen
  - mouse / keyboard
  - OCR / Vision / layout
  - clipboard / system
        |
        v
macOS / Desktop Environment
```

## 1. 通用层职责

通用层负责：

- 枚举/聚焦窗口；
- 截图；
- OCR / detect-ui / layout；
- 标准 target candidate；
- click / focus / type；
- freshness / ambiguity 等通用 guard；
- execution evidence。

通用层不应该写死：

- 微信会话列表的固定坐标；
- 某个用户头像/联系人名称；
- 微信专用 send 业务规则；
- 某个单一窗口尺寸。

## 2. WeChat Scenario Adapter 职责

未来 WeChat-specific 层应只承担场景语义：

```text
recognize_wechat_context
find_conversation
verify_chat_identity
find_input_area
verify_draft
find_send_action
verify_post_send
read_reply
```

它可以使用 MCP 或 runtime primitive，但输出必须尽量标准化为：

```text
candidate
precondition result
action plan
postcondition result
evidence refs
failure class
```

## 3. 推荐执行主链

```text
inspect_desktop
-> identify WeChat window/context
-> find target conversation
-> preview open_chat
-> open_chat
-> verify chat header
-> find/focus input
-> type draft
-> verify draft
-> evaluate send gate
-> optional send
-> verify postcondition/readback
```

每一阶段都必须允许 stop / retry / recovery / escalate。

## 4. Evidence 组合

目标发现不应绑定单一证据源。可组合：

```text
window metadata
layout zones
local OCR
detect-ui candidates
visual anchors / template
current screenshot geometry
historical baseline as reference
```

优先级不是固定的“永远 OCR 第一”或“永远 template 第一”；应根据目标和当前可用证据构造候选，再由 guard / verifier 决定是否可动作。

## 5. Golden / Baseline 的架构位置

Golden sample 是：

```text
regression/reference evidence
```

不是：

```text
current target truth
```

正确关系：

```text
historical/frozen reference
+ fresh runtime evidence
-> compare / drift understanding
-> candidate / guard support
```

即使 baseline compare 通过，也不能自动推出 `sendAllowed=true`。

## 6. Compare 的位置

Compare 是质量与诊断能力之一，不应成为唯一动作主 Gate。

可用于：

- 判断 UI 结构是否发生重大漂移；
- 检查关键 zone / topology；
- 提供 repair hint；
- regression testing。

真实动作仍必须基于 fresh：

```text
window identity
candidate identity
preconditions
action-specific safety
postcondition plan
```

## 7. Send 是独立高风险阶段

`send` 不能成为 `focus_input` 的自然下一步。

应建模为：

```text
prepare draft
-> verify draft
-> send safety decision
-> preview
-> explicit action
-> postcondition
```

场景策略可以长期冻结 send，只验证非发送链路。

## 8. Recovery

推荐局部恢复：

```text
window lost
  -> reacquire window

target stale
  -> refresh screenshot / candidates

ambiguous conversation
  -> gather additional identity evidence

header mismatch
  -> stop current branch / return to conversation discovery

focus lost
  -> refocus and reverify

postcondition fail
  -> do not blindly resend
```

特别是 send 后 postcondition 不确定时，禁止通过再次发送来“验证第一次是否成功”。

## 9. 当前实现建议

新实现不应恢复旧目录结构作为默认答案。建议先根据现有工程选择一个最小入口，例如：

- MCP orchestration；或
- `examples/` 中可维护的 scenario sample；或
- 独立 package / adapter（当逻辑稳定且值得产品化时）。

选择必须通过当前需求和复用性判断，而不是因为历史文档曾使用 `examples/mac/wechat_steps/`。

## 10. 与其他文档关系

```text
requirements.md             # WHAT / acceptance
architecture.md             # HOW boundary
baseline-compare-spec.md    # reference/compare contract
golden-template.md          # future frozen fixture format
structured-send.md          # send safety contract

docs/quality/gates-and-evidence.md
prompts/wechat/execution-master.md
```

实现与文档冲突时，以当前源码、真实测试和运行证据为准。
