---
name: code-rebuild
description: Review and minimally improve an existing OpenDesk JavaScript candidate against fixed requirements and evidence. Use for S11 code quality, data-flow, API, reliability, maintainability, or a justified no-change decision. Do not invent missing business meaning, application rules, observations, or qualification results.
---

# 代码评审与按需改进（code-rebuild｜S11 内可选作业）

审查精确代码基线，作出有依据的保留或最小改进结论。它不替代 recipe-build，也不要求为了优化而修改已经合格的程序。

## 输入：必须拿到什么

- 精确脚本和 helper 引用／hash、入口命令、工作目录、依赖，以及已有 CandidateManifest。
- 固定 TaskContract／SemanticProcedure、本次改进目标、允许变更范围；已有资产接续按共享合同的限定入口处理，不倒造缺失的历史 Dossier。
- 相关 AppProfile／操作规则与当前实际 API 的 canonical 契约。
- 已有资格只作为其原候选和原范围的证据，不能自动转移给改变后的字节。

## 方法

1. 固定基线，区分实际观察、源码结构、测试期望、限制和未知。
2. 将业务步骤与运行时数据关系映射到函数或代码区域。
3. 按顺序检查业务／数据正确性、安全与副作用、实际 API、异步顺序与有界失败、函数合同、可维护性及不必要复杂度。
4. 检查实际生产者返回值是否被消费者使用。读了 firstResult 却输入固定 110，即使得到 660，也必须失败。字符串搜索只能提供局部证据，不能替代函数体与控制流审阅。
5. 每项发现记录代码位置、来源、影响、处置与检查；只做有依据的最小修改。应用规则缺口返回应用工程，动作取舍错误返回 S7，业务语义缺口返回 S8—S9。
6. 字节或依赖变化时发布新候选，并列明重验范围；不改旧 Qualification，不降低验收标准。没有实质收益则保留原基线。

## 必须交付结论，不只交 JS

输出以下二者之一：

- `baseline-retained`：原始 refs／hash、步骤映射、评审发现、检查、评分范围、局限和保留理由。
- `candidate-revised`：新 refs／hash、改动及理由、受影响需求、检查和重验范围。

在当前作业的评审记录中使用下表；可复用现有记录，不强制新增固定文件。handoff 引用该记录，审阅页只展示它。

| 结论字段 | 必须写清什么 |
| --- | --- |
| 对象与范围 | 哪个精确候选、相关依赖、改进目标和不能改变的业务行为 |
| 改前／改后 | 原逻辑保留、移动或删除到了哪里；每项改动对应代码位置和理由 |
| 正确性与风险 | 必要状态准备、真实数据来源、消费者关系、失败与副作用边界 |
| 检查与证据 | 静态审阅、实际测试、旧资格分别记录；未测不能写通过 |
| 分项评分 | 采用 validation-plan 唯一权重，写依据与扣分；旧基线未评分就不编造提升幅度 |
| 最终判断 | 满足本次审阅条件／需要修复／证据不足；这不是新的 handoff 状态枚举 |
| 下一步 | 是否需新候选资格、责任环节、受影响范围和停止条件 |

评分遵循 [validation-plan.md](../../design/validation-plan.md)。硬性错误不能被平均分抵消，不通过修改评语或缩小原请求范围追到 95 分。
实际评审者是同一 Agent 就如实写明；角色名称不创造独立评审或人类批准。

## 可执行检查与资格边界

完整上游材料存在且属于检查器支持的 Calculator 形状切片时，从仓库根目录运行：

```bash
node workflows/agent-to-recipe/scripts/check-artifact-chain.js --through candidate --dossier <dossier.json> --actions <actions.json> --distilled <distilled-steps.json> --procedure <procedure.json> --candidate <candidate.json> --root <id=directory>
```

不再为了审查候选而要求先有 Qualification；加 `--format markdown` 生成工件与检查总览。缺上游时按真实接续范围工作，不生成占位历史以满足此命令。
检查仅覆盖固定字节、声明映射和直接 await／spread 模式；不证明可达性、别名、变量遮蔽或任意 JS 的等价性。程序不执行候选、不自动评分、不批准业务资格。

修改后交 S12 针对精确新候选独立验收；未变候选的历史资格按实际环境与范围核验适用性，不因本次静态审阅就算新的 live。
通用方法继续维护在 [code-rebuild.md](../../design/code-rebuild.md)，输入输出及未实现部分见[交接审阅地图](../../design/acceptance-map.md)。
