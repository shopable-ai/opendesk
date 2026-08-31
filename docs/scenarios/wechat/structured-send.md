# WeChat Structured Send Safety Contract

本文件定义 WeChat 桌面场景中“准备并发送消息”的安全 contract。

## 当前状态

截至 2026-08-31，当前仓库**没有独立维护的 WeChat structured-send production script**。

历史文件 `wechat_structured_send_v2.js`、region-map/config 路径不在当前树中，因此本文件不再描述某个不存在脚本的参数和输出，而是定义未来任何 WeChat send 实现都必须满足的场景约束。

## 核心原则

```text
open_chat success
!= focus success
!= draft correct
!= send safe
!= message delivered
```

`send` 必须是独立高风险阶段，并默认 fail-close。

## 状态链

推荐显式建模：

```text
idle
-> target_chat_identified
-> chat_opened
-> chat_identity_verified
-> input_focused
-> draft_written
-> draft_verified
-> send_ready
-> send_attempted
-> send_verified
```

任一阶段都允许：

```text
blocked
recovery_required
human_confirmation_required
```

## Send 前 Hard Preconditions

至少全部满足：

### 1. Window Identity

- 当前仍是目标微信窗口；
- 没有切到其他应用/窗口；
- 当前 screenshot / candidate 在 freshness budget 内。

### 2. Chat Identity

- header / conversation identity 与目标一致；
- 同名或近似联系人已经消歧；
- 不能只根据“刚才点击了某一行”推断身份。

### 3. Input Focus

- 输入区当前可见；
- 焦点在正确输入区；
- 没有 blocking overlay / 输入法异常状态影响动作。

### 4. Draft Verification

- 实际 draft 与本轮预期 payload 一致；
- 内容没有截断、重复或污染；
- 本轮 payload 仍符合用户/上游 intent；
- 如果存在幂等/去重要求，必须检查近期发送状态。

### 5. Send Target

- send target 来源于 fresh evidence；
- target 没有 stale / ambiguous；
- 若通过 Enter/shortcut 发送，该行为必须是当前实现显式选择的 action route，而不是隐式 fallback。

### 6. Postcondition Plan

发送前已经知道发送后如何判定：

```text
success
failure
unknown
```

如果没有可靠 postcondition，不应执行真实 send。

## Preview

真实发送前应支持 preview / dry-run 等价能力，输出至少：

- target chat；
- draft 摘要/哈希或安全可展示内容；
- send route；
- freshness；
- guard results；
- expected postconditions；
- `sendAllowed`。

Preview 本身不能执行真实 send。

## Send Decision

建议统一：

```text
sendAllowed=false | true
```

`false` 时必须提供 blocking reason，例如：

```text
window_mismatch
chat_identity_unverified
ambiguous_target
stale_evidence
focus_unverified
draft_mismatch
blocking_overlay
postcondition_unavailable
human_confirmation_required
```

不要通过降低阈值把 hard blocker 自动变成 warn。

## 执行动作

真实 send 应只有一个受控入口。

规则：

- 禁止多个 route 并行尝试；
- 禁止第一次结果不确定时自动再次 send；
- route fallback 前必须判断前一次是否可能已经生效；
- action evidence 记录 before / attempt / after。

## Postcondition

发送后至少验证一个强业务/状态信号，最好组合多个：

- draft 清空或状态按预期变化；
- 新 self-message 出现在目标消息列表；
- 内容/时间/位置与本轮 payload 对应；
- 当前 chat identity 未漂移。

状态输出应区分：

```text
verified_success
verified_failure
unknown
```

### Unknown

如果 send call 返回成功，但 UI postcondition 不确定：

```text
unknown
```

不能标记 `success`，也不能自动重发。

这类情况优先人工确认或通过更强 readback/recovery evidence 判定。

## Read Reply

读取后续回复与 send 是两个不同 intent。

Readback 应：

- 使用 fresh message-list evidence；
- 区分 self-message 和 incoming message；
- 记录读取范围/时间；
- 避免 whole-window OCR 单点裁决。

## Evidence

建议每个 send attempt 保存：

```text
window identity
chat identity evidence
input/focus evidence
draft evidence
send target candidate
guard decision
before screenshot/region
action route
after screenshot/region
postcondition result
failure taxonomy / final decision
```

运行时原始 evidence 应进入 `.runtime/`，长期有价值的报告归入 `docs/quality/wechat/`。

## 与 MCP 的关系

当前 `tm_act_on_target` 已提供通用 preview、expected window/text、stale/ambiguity guard 等能力，但这些**只是通用动作护栏**。

WeChat send 仍需要本文件定义的场景级：

```text
chat identity
draft correctness
send authorization
post-send verification
```

不能因为 MCP click/type contract 通过就直接宣称 WeChat send 安全。

## 当前交付边界

在新的 WeChat implementation 与真机 evidence 落地前：

```text
sendAllowed=false by default
```

未来只有经过：

```text
non-send chain validation
-> send preview validation
-> controlled real send
-> postcondition/readback
-> regression evidence
```

后，才能对特定实现/环境声明 send 链路经过验证。
