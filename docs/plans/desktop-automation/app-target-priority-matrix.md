# Desktop Automation Candidate Validation Matrix

本文件不再把 Slack / Telegram / Finder 的顺序写成客观事实。它只记录**当前可验证程度 + 需要补证据的候选决策**。

评分或结论如果没有当前 runtime / fixture / environment Evidence，必须标记为 `assumption`。

## Current candidate matrix

| Candidate | Environment Availability | Can We Test It Now? | Fixture Availability | UI Structure Stability | Accessibility Availability | OCR Dependence | Action Risk | Business Value | Cross-App Generalization Value | Automation Cost | Evidence Cost | Evidence / Assumption |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Finder | 当前执行环境没有可控 macOS desktop host 证据 | No | 当前仓库未找到 active Finder fixture | `assumption: medium/high`，需真实版本/视图验证 | `assumption: likely useful on macOS`，尚无当前 accessibility dump | `assumption: low`，前提是 accessibility tree 足够 | Read-only/navigation low；move/delete high 且首轮排除 | `assumption: medium` | `assumption: high`，可覆盖窗口、列表、文件 target 等基础模式 | `assumption: low/medium` | `assumption: low/medium` | 当前 tree 未找到 Finder 专项 active fixture；推荐仅是条件性 hypothesis |
| Slack | 未找到当前安装/登录/工作区环境 Evidence | No | 当前仓库未找到 active Slack fixture | unknown | unknown | unknown | Message send/submit high；首轮必须 read-only | `assumption: high` | `assumption: high`，聊天/列表/搜索类场景有代表性 | unknown | high unless sandbox exists | 当前 tree 未找到 Slack 专项 active fixture；价值与稳定性均未实测 |
| Telegram | 未找到当前安装/登录/测试账号环境 Evidence | No | 当前仓库未找到 active Telegram fixture | unknown | unknown | unknown | Message send/submit high；首轮必须 read-only | `assumption: medium/high` | `assumption: medium/high` | unknown | high unless disposable account/fixture exists | 当前 tree 未找到 Telegram 专项 active fixture；不能沿用旧排名 |
| WeChat | 当前 active environment 未验证；仓库只有 archived 2026-04-07 discovery 资料与当前 quality mapping | No | 有 archived examples/history，但不是当前 regression fixture | 历史记录显示 UI/window/layout drift 风险；当前未重放 | unknown | 历史流程依赖 OCR/视觉较多；当前未重新量化 | Chat selection/send high | `assumption: high for relevant workflows` | `assumption: medium/high` | historically high | high | Evidence 为 archive/history；当前 failure cases 已标记 `historical-not-revalidated` |

## Recommended next test target

### Finder — conditional recommendation

推荐把 Finder 作为**下一候选测试目标**，但只有在获得可控 macOS test host 后才正式成立。

Why:

- 系统自带应用理论上比通信应用更少依赖账号、workspace、sandbox；
- 可先限定在 read-only/navigation 场景，降低副作用风险；
- 如果 accessibility tree 可用，可以同时验证 window/target/list/action/postcondition 这类跨应用基础能力；
- 但以上仍包含 assumption，本轮没有 macOS runtime Evidence，不能写成“Finder 已被证明最佳”。

Minimum evidence before promotion:

1. 当前 macOS host / OS version / display geometry；
2. Finder version / target view；
3. 至少一份 accessibility tree 或可替代的结构 Evidence；
4. 一个 read-only fixture；
5. T1/T2 contract 与一次受控 T3 smoke；
6. before/after postcondition Evidence。

## Fallback target

### Slack — only with a sandbox workspace

如果 Finder 的 accessibility surface 不足，而 Slack 已有：

- 可控测试工作区；
- 安装并登录的客户端；
- 可复用 channel/thread fixture；
- 明确禁止 send/submit 的 read-only first-pass；

则 Slack 可成为 fallback，因为聊天列表、搜索、详情、目标选择具有较高跨应用代表性。

没有 sandbox 时，不应把真实消息发送作为初始 smoke。

## What evidence would change this decision

以下任一新 Evidence 都可能改变排序：

- 当前 macOS host 实际可用性；
- 各 App 的 accessibility dump 覆盖率与稳定性；
- 已存在的 fixture / disposable account / sandbox；
- 一次固定场景 T2/T3 的成功率、失败类别与 Evidence 成本；
- 真实业务 workload 表明某 App 的价值显著高于其他候选；
- OCR-only 路径的误差、维护成本明显高于 accessibility/structured path。

## Stop conditions

- 没有可控环境：不宣布某 App 是正式第一优先级。
- 没有 fixture/sandbox：通信应用只做 observation/read-only，不做 send/submit。
- accessibility 可用性未知：先采集结构 Evidence，不先扩建 action abstraction。
- 一次 smoke 成功：只记为该环境下的 T3 bounded proof，不升级为通用 production-ready Claim。
