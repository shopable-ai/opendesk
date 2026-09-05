---
name: recipe-qualify
description: 使用现有 OpenDesk 入口对冻结版本 Recipe 做获准 Fresh Run、业务结果及交接故障验证，交付 QualificationRecord。独立核验，不修改脚本或放宽成功条件。
---

# 独立验收

## 入口与边界

对应 S12。先读[共享合同](../../../../docs/frameworks/agent-to-recipe-skill-contract.md)、[AGENTS.md](../../../../AGENTS.md)、[G0—G7](../../../../docs/quality/gates-and-evidence.md)和适用场景规程。计算器使用[专门规程](../../../../docs/quality/agent-to-recipe/calculator-validation.md)。

只有明确授权运行且具备实际桌面／执行工具才执行。仅阅读本文、写入文件或审阅候选不授权 live 测试、构建、权限修改或发布。

## 输入

共享 request；冻结 TaskContract；CandidateManifest 与实际脚本；场景清单及各自 criterionId／输入；允许的环境、根目录、预算和桌面操作拥有权。先核对脚本 hash、当前构建来源、API／provider、原样命令和工作目录。

独立指验收标准和实际证据独立于生成者的自述；可读代码诊断，但不能改代码／期望再宣布原候选通过。宿主未提供隔离上下文时注明测试限制。

## 验收步骤

1. 核对授权、环境和证据目录。缺工具／权限／provider／构建来源时记录 blocked，不模拟真实执行，不静默降级成 mock。
2. 按原合同确认安全初始状态；只允许获准的清空／归一化。Fresh Run 使用新 execution 和本次输入，不读取示范业务结果作为答案。
3. 从声明工作目录原样执行正常入口命令，记录实际命令、executionId、scriptHash、构建来源、输入和环境范围。任务控制由外层宿主完成，不使用虚构的 Execution.cancel／resume。
4. 重新读取本次业务证据，核对目标身份、每条业务成功条件、运行时值来源与消费关系。退出码／passed 字段只能作为线索，不是充分证明。
5. 按获准范围做不同输入、旧状态污染、支持范围内窗口移动、错误期望等反例。测试应有界、低风险，不为了造失败撤销系统权限或破坏用户业务。
6. 交接与恢复测试优先对独立副本／离线 fixture 进行。无历史上下文、缺证据、半写、旧版本、现场变化、暂停取消等分别记录，不混为一次普通脚本成功。
7. 对每场景保存 pass／fail／not-run／blocked、期望、实际、证据和局限。预期被拒绝的负向测试可以测试通过，但实际业务执行的失败状态必须原样保留。
8. 失败按 F0—F10 分类并提出修复请求：具体证据、责任 Skill、需要改变的最小范围、必须重验的场景。超过预算或副作用结果不明时停止。
9. 最终资格只绑定本候选及范围。修改脚本或关键依赖后新建验收尝试；不回写上游事实，不静默推广平台支持。

## 必须保存的输出

`qualification.json` 按共享 QualificationRecord：candidateRef、contractRef、scenarios、actualCommands、workingDirectories、executionRefs、buildProvenance、environmentScope、observedResults、evidenceRefs、failedCriteria、skipped、verdict、repairRequests。

最后发布 `handoff.json`。区分“参考脚本 smoke 通过”“基本业务验证通过”“完整 Skill 链通过”，不能相互替代。`not-run` 不等于 pass；没有完整证据不填写 95 分以上等成绩。

## 最小独立验收

正确输入且真实结果满足合同可通过；错误结果即使脚本自报成功也应失败；故意设置错误期望应拒绝而非改标准；新输入不得复用示范答案；换 Agent 无法核验证据时明确阻塞。
