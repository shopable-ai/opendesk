# Gates and Evidence

本文件是 Clawdesk 当前桌面自动化与黄金样本验证的统一质量门禁（Source of Truth）。历史 bootstrap gate 已归档到 `.archive/legacy-docs/gates-and-evidence-bootstrap.md`。

## 核心原则

- 没有证据，不算通过；没有可复核工件，不算完成。
- 结构先于语义，语义先于动作；高风险动作必须独立放行。
- compare / mirror 是诊断与验证层，不单独决定业务主链路是否可继续。
- `pass` 才允许进入下一阶段；`warn` 只允许 probe；`fail` 必须 stop / recovery / escalate。

## 默认证据包

当前运行产物仍按运行时实现约定保存，至少应包含：

```text
requirement.json
preflight.json
preflight_runtime.json
capture/source.png
detect/regions.json
detect/layout_model.json
infer/app_classification.json
infer/zones.json
infer/action_targets.json
infer/ocr_map.json
verify/actionability_report.json
evidence/actions/
evidence/anchors/
evidence/ocr/
checkpoints/
replay/replay_result.json
replay/state_transition_log.json
audit.ndjson
decision.json
```

黄金样本可以额外包含 layout / semantic baseline、compare、send-safety、provenance、variance budget 与人工 review 证据。

## G0 Runtime / Acquisition Preflight

通过条件：

- 目标应用/窗口可访问；
- 截图、键鼠与所需系统权限可用；
- OCR provider 可用（需要 OCR 的流程）；
- 浏览器参考样本需要 DOM snapshot 时可获取；
- viewport / window geometry 等关键环境信息被记录。

失败：不得继续真实动作。

## G1 Layout Model

通过条件：

- `layout_model.json` 存在；
- column / row topology 合理；
- major zones 覆盖主要工作区；
- 关键结构不存在明显重叠、缺失或异常漂移。

## G2 App / Page / Semantic Inference

通过条件：

- `appClass` / `pageType` 达到可解释的可信度；
- 有 supporting signals，必要时记录 counter-signals；
- blocking page / overlay 被优先识别；
- 关键语义对象和候选集可解释。

若 `pageType` 无法确定，`canProceed=false`。

## G3 Zone / Structural Completeness

通过条件：

- 当前场景所需关键 zones 齐全；
- zone 间关系与 topology 一致；
- 动作所依赖的区域没有明显漂移或缺失。

微信聊天场景至少关注：`conversation_list`、`chat_header`、`message_list`、`input_area`。

## G4 Actionability

通过条件：

- 每个关键 intent 至少有一个可执行 target；
- target 有明确 preconditions / postconditions；
- 关键 target 有 fallback 或明确失败策略；
- target evidence 可追溯到结构、视觉、OCR 或运行时状态。

微信核心 intent 至少包括：`open_chat`、`focus_input`、`send`、`read_reply`。

## G5 Evidence / OCR / Compare Quality

通过条件：

- OCR 使用局部、zone-aware 证据，不依赖 whole-window OCR 单点裁决；
- 动作级 before / after、target candidate trace、OCR raw / normalized 等证据可用；
- compare 输出能够解释失败位置，而不是只有总分；
- mirror / compare 缺失时若影响诊断能力，应至少为 `warn`。

## G6 High-Risk Action Safety

对于发送、提交、删除、支付等不可轻易撤销动作，必须单独通过安全 gate。

以消息发送为例，至少要求：

- 当前身份 / header 可信；
- 输入区域与 draft 验证成立；
- send target 可信；
- 无 blocking overlay；
- runtime 与 actionability 均允许执行；
- 执行后有 readback / postcondition 验证。

不能由前置低风险动作成功自动推导高风险动作可执行。

## G7 Replay / Recovery

通过条件：

- 重复运行时 zone / target 漂移受控；
- checkpoint 可用；
- replay 结果和 state transition 有记录；
- 失败可进入 retry / recovery / escalate，而不是重新盲试完整链路。

## G8 Golden Promotion

黄金样本从 `candidate` 升级为 `frozen` 前必须满足：

- provenance 完整；
- assertion profile / compare contract 完整；
- variance budget 明确；
- failure taxonomy 可映射；
- layout / semantic / actionability 等关键证据齐全；
- replay / recovery 可验证；
- 完成人工 review，并记录 promotion decision。

G8 未通过时，只能作为 candidate 或 algorithm-validation 输入，不能作为正式回归基线或动作真相源。

## decision.json 语义

- `canProceed` 由 G0-G7 的当前场景要求共同决定；
- compare fail 本身不自动阻止主链路，但若暴露结构、语义、actionability 或安全 gate 失败，则必须阻止；
- 高风险动作需要额外通过 G6；
- 黄金样本 promotion 由 G8 独立决定。

## audit.ndjson 最低动作粒度

至少记录：

- `open_chat.attempt` / `open_chat.verify`
- `focus_input.attempt` / `draft.verify`
- `send.attempt` / `send.verify`
- `reply.readback`
- `recovery.attempt`

其他场景应按相同原则记录 `intent.attempt` 与 `intent.verify`。

## Stop / Escalation

满足任一情况应停止或升级人工判断：

- runtime preflight fail；
- 关键工件缺失导致不可回放；
- page / target 身份不确定；
- 连续多轮没有新增有效证据；
- 高风险动作缺少独立安全验证；
- UI/环境变化导致现有 topology、baseline 或规则系统性失效。
