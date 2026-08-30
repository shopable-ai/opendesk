# WeChat Desktop Automation Backlog

本文件只记录当前仍然成立、且能从现有仓库事实推导出的 WeChat desktop automation 待办。

旧的 `2026-05-18-wechat-desktop-v1-implementation-plan.md` 已不再作为 Active Plan：它依赖当前不存在的 `examples/mac/wechat_steps/`、旧 TestMonkey 命名和旧产物路径。

## P0：建立新的事实基线

### 1. 选择当前实现入口

基于现有 Clawdesk 能力决定 WeChat scenario 首个可维护入口：

- MCP orchestration；
- 可执行 example；
- 或稳定后再抽象为独立 adapter/package。

不要自动恢复旧 `wechat_steps` 目录结构。

验收：

- 入口能调用当前通用 window / screenshot / target / action primitives；
- 代码位置和生命周期清晰；
- 不复制另一套 runtime。

### 2. 建立 fresh macOS candidate fixture

从当前版本 Clawdesk + 当前微信桌面版重新采集：

```text
window/provenance
screenshot
layout/zone evidence
local OCR / target candidates
known limitations
```

目标位置：

```text
artifacts/fixtures/wechat/<sample-id>/
```

最初状态必须是 `candidate`。

不要复用历史 run 直接伪装成 frozen fixture。

## P1：非发送链路

实现并逐步验证：

```text
inspect WeChat context
-> find target conversation
-> preview/open conversation
-> verify chat identity
-> find/focus input
-> type draft
-> verify draft
```

每一步：

- fresh evidence；
- candidate / guard；
- postcondition；
- failure taxonomy；
- 可局部恢复。

这一阶段 `sendAllowed=false`。

## P2：Send Preview / Safety

实现场景级 send decision：

```text
chat identity
+ input focus
+ draft correctness
+ fresh send target
+ blocking overlay
+ dedup/idempotency context
+ postcondition plan
```

先只输出 preview / decision，不真实发送。

验收：

- unsafe case 稳定 fail-close；
- ambiguity / stale / identity mismatch 不被降级为普通 warn；
- preview 能解释为什么允许/不允许发送。

## P3：受控真实发送

只在明确授权的测试上下文执行：

```text
send once
-> verify postcondition
-> classify success / failure / unknown
```

关键要求：

- unknown 不自动重发；
- 有 before / after evidence；
- 有 chat identity 和 payload 对应证据；
- 有可复核报告。

## P4：Replay / Regression / Golden Promotion

在非发送和受控 send 链路都形成稳定证据后：

- 建 replay/regression case；
- 验证 UI drift；
- 完成 human review；
- 再考虑 candidate -> frozen promotion。

模板：

```text
docs/scenarios/wechat/golden-template.md
```

## 暂不作为当前 blocker

除非真实测试证明必要，不预先扩展：

- 大量应用专用 template；
- 大量固定窗口尺寸配置；
- 全量聊天内容 OCR；
- 自动发送重试策略；
- 复杂多 Agent orchestration；
- 为了兼容旧计划恢复旧目录/脚本命名。

## 完成判定

只有实际源码、测试和真机 evidence 同时存在时，才把相应事项从 backlog 移入 canonical implementation / architecture 文档。

计划文档不能作为“功能已经实现”的证据。
