# Global Failure Taxonomy

本文件只定义 OpenDesk 跨领域通用 Failure Class。具体应用、算法或协议的 failure code 应放在对应 `docs/quality/<domain>/`，并映射到这里。

| ID | Global class | Definition | Typical evidence |
| --- | --- | --- | --- |
| F0 | Environment / Precondition | 环境、权限、依赖、输入或前置状态不满足 | preflight、permission、dependency/version、input metadata |
| F1 | Acquisition / Observation | 无法稳定获取当前真实状态，或采样对象/坐标/时间点错误 | screenshot/window bounds/snapshot/acquisition log |
| F2 | Perception / Detection | 图像、OCR、结构检测或信号抽取错误 | raw input、detector output、annotation、confidence |
| F3 | Semantic Inference | 已观测信号被错误解释为对象、角色、页面或意图 | inference trace、support/counter-signals、expected label |
| F4 | Target Resolution | 语义目标正确但落到错误坐标、节点、窗口、页面或候选对象 | target candidates、selection trace、anchor evidence |
| F5 | Action Execution | click/type/open/send 等动作未执行、执行到错误对象或运行时返回失败 | action request/result、before/after、runtime error |
| F6 | Verification / Postcondition | 动作后没有证明期望状态成立，或验证方法产生误判 | readback、postcondition assertion、diff、state check |
| F7 | Evidence / Artifact | Evidence 缺失、损坏、引用漂移、不可追溯或不能支撑 Claim | manifest validator、artifact index、hash/path check |
| F8 | Replay / Recovery | retry/checkpoint/replay/recovery 无法恢复到可解释状态 | checkpoint、transition log、replay result |
| F9 | Safety / Policy | 风险动作缺少授权、边界、确认、guard 或违反安全策略 | safety gate、approval、risk classification、audit |
| F10 | Infrastructure / Transport | HTTP/IPC/process/storage/runner 等基础设施故障 | transport status、server log、process exit、I/O error |

## Classification rules

- 一个 failure case 可以映射多个 class，但必须指定一个 primary class。
- 先记录“发生在哪里”，再记录“为什么发生”；不要按应用名创建全局类别。
- `warn` 不是 failure class；它是 Gate verdict。
- `historical` 不是当前 failure；历史案例若没有当前 Evidence，应标明未重放/未复验。
- 领域层可以有稳定 code，例如 `LAYOUT_FALSE_SEPARATOR`，但应映射到 `F2` 或其他全局 class。

## Stop / Retry / Escalate

处置策略不由 F0-F10 单独决定。相同 failure class 在不同风险场景可能是 retry、stop 或 human escalation，必须由场景 Gate 与动作风险共同决定。
