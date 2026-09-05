# Calculator 工作流入口

状态：任务作业入口 v1，尚未依据本入口执行测试。记录日期：2026-09-06。

## 1. 用户与执行 Agent 从这里开始

本文件组织计算器任务的步骤、输入输出、Skill 调用与停止位置，不替代[计算器验证规程](../../../docs/quality/agent-to-recipe/calculator-validation.md)中的具体判据。阅读本文件不构成桌面操作授权；仅要求写文件时停止在文件交付。

| 用户任务 | 使用本文件哪条链 | 最终交付 |
| --- | --- | --- |
| 计算器基本测试 | BASIC：前置检查 → B0 → B1 → B2 → B3 → 报告 | 现有参考脚本在本次环境的测试结果与证据 |
| 通过 Agent 完成任务、生成脚本并验证六个 Skill | PIPELINE：规划 → 应用认识 → 示范 → 提炼 → 补强 → 生成 → 验收 | 示范交接包、普通 JS 候选及该候选的验收记录 |
| 明确要求受控扰动 live gate | 按验证规程的 LIVE-GATE 范围执行已有入口 | 该 gate 实际覆盖场景的结果 |

只说“基本测试”时采用 BASIC，不自动扩大到 PIPELINE、LIVE-GATE、全部 Runtime API 或大规模故障注入。只要求运行一次已有脚本时，不自动扩大为四项基本测试。BASIC 通过不能被表述为六个 Skill 整链通过。

先读根 [AGENTS.md](../../../AGENTS.md)。完整开发链遵守[通用开发工作流](../../agent-to-recipe/WORKFLOW.md)与[共享合同](../../../docs/frameworks/agent-to-recipe-skill-contract.md)。实际命令与接口查当前 [AI CLI](../../../docs/api/ai-cli.md)、[Execution](../../../docs/api/execution.md)及相应 `docs/api/` 页面。

## 2. 前置与对象边界

参考脚本是 [calculate-and-reuse-result.js](calculate-and-reuse-result.js)。默认业务为：在真实 macOS Calculator 计算 `125*8`，从显示区域读取 firstResult，使用该实际值继续计算 `firstResult/4+37`，验证最终显示结果。

运行前由执行者确认真实 macOS 桌面、实际 binary 来源、Calculator 身份与模式、必要权限、可用 OCR provider、可写 artifact 目录、真实预算和可用停止方式。告知本次会启动／聚焦 Calculator、清空当前表达式，可能按已有脚本归一化布局；有需要保留的计算内容时先停止处理。不得自动重置权限、安装依赖、关闭其他应用或丢弃未保存内容。

默认工作目录是仓库根目录，二进制是 `./dist/opendesk`。缺失、过期或来源不明时按根协作规范及本次授权处理；没有运行能力就报告 blocked，不用 mock 或 JS 算术代替真实桌面。

同一桌面只有一个操作拥有者。Windows／Linux 不属于这个 macOS 样本的已验证范围，不自动启动 VM／Wine 或下载镜像。源码、API 或测试入口变化时核对差异并更新当次计划，不恢复已删除的 shell wrapper。

## 3. BASIC：现有脚本的基本检查链

不需要先执行全部六个 Skill，也不应为已有脚本测试伪造示范学习过程。执行者可按 [recipe-qualify](../../../prompts/automation/agent-to-recipe/recipe-qualify/SKILL.md) 的证据检查原则组织参考脚本验收，报告必须标为 reference-execution／BASIC。

| 顺序 | 读取／输入 | 执行动作 | 保存并交给下一步的结果 |
| --- | --- | --- | --- |
| 前置检查 | 用户授权、本文件、实际环境、当前参考源码 | 确认第 2 节条件、测试范围、预算与停止方式 | 前置检查结论、计划和阻塞；未满足时不执行依赖动作 |
| B0 | 参考脚本默认任务 | 从根目录原样运行下方公开命令 | 新 executionId、scriptHash、envelope、真实显示读取、firstResult 消费关系、最终业务结果与证据 |
| B1 | B0 的运行身份与结束状态 | 保留旧显示结果，再按规程独立重跑 | 与 B0 不同的 execution；本次输入、清空、读取和结果证据，不能复用 B0 的答案 |
| B2 | 规程规定的合法新输入 | 计算 `12+5`，读取后使用结果计算 `{result}*3` | 本次实际 `17`、`17*3` 和 `51` 的数据流与验证证据 |
| B3 | 规程明确标记的错误期望 | 对 `12+5` 故意要求 `9999` | 业务执行失败、匹配的错误证据；正确拒绝可记测试通过，不能改写业务失败 |
| 汇总 | B0—B3 的实际记录 | 按冻结判据逐项核验 | BASIC 结果报告：已测、未测、阻塞、版本、范围、证据与限制 |

B0 的公开命令（工作目录：仓库根目录）：

```bash
./dist/opendesk ai run workflows/macos/calculator/calculate-and-reuse-result.js
```

B1—B3 的确切命令和判据只维护在[验证规程第 3 节](../../../docs/quality/agent-to-recipe/calculator-validation.md)，这里不复制第二套参数规范。

默认期望为第一次显示 `1000`、实际后续表达式 `1000/4+37`、最终显示 `287`；期望只用于断言，实际值必须来自本次 UI。若缺少足以证明数据来源／消费的证据，报告 evidence gap，不以脚本自报 passed 或旧截图代替。

BASIC 过程中有关键前置失败、业务假成功或数据来源不明时，停止依赖用例。不能为了继续测试而静默修复参考脚本、降低成功标准或扩大授权。每次尝试分别保存，失败不得覆盖为成功。

## 4. PIPELINE：计算器六 Skill 开发链

仅在用户明确授权完整开发／交接验证时执行。遵守通用工作流，在任务目录保存真实计划和进度，不在本文件里手工打勾冒充本次执行状态。

下表为该任务的初始工作包模板。实际执行前由规划者填定任务 ID、输入版本、预算和产物路径；允许有依据地细化并保留稳定 ID。

| 工作包 | 责任 Skill | 主要输入 | 必须保存的输出 | 下一消费者 |
| --- | --- | --- | --- | --- |
| W010 任务与计划 | automation-plan | 用户目标、授权、参考资料及其使用范围 | `task-contract.json`、`work-plan.json`、handoff | 所有后续环节 |
| W020 最小应用认识 | application-engineer，discover | W010、当前观察及相关 API | `app-profile.json`、显示区／输入区与验证方式的证据、handoff | W030—W050 |
| W030 第一次计算与取数 | task-demonstrate | W010、W020、第一表达式 | 本次真实 firstResult、来源证据、动作与观察索引、局部交接 | W040 |
| W040 使用真实结果继续计算 | task-demonstrate | W030 的实际值及证据、后续表达式模板、最新现场 | 实际输入的第二表达式、最终显示读取、验证与局部交接 | W050 |
| W050 关闭完整示范 | task-demonstrate | W030、W040 和冻结成功条件 | 完整 `dossier.json`、关键数据关系、未决项及 handoff | W060 |
| W060 复盘与参数化 | procedure-synthesize | 合同、AppProfile、完整 dossier 和指定证据 | `procedure.json`、必要步骤、排除理由、参数与数据依赖、handoff | W070／W080 |
| W070 按缺口补强 | application-engineer，harden | 已确认过程、应用资料及实际缺口 | 新版 AppProfile、必要 helper 与验证；无缺口则由协调者记录复用依据 | W080 |
| W080 生成候选 | recipe-build | 过程、适用 AppProfile、当前公开 API | 普通 JS、`candidate.json`、真实路径／命令／hash、handoff | W090 |
| W090 独立验收 | recipe-qualify | 冻结合同、确定候选版本、测试输入、允许起点 | `qualification.json`、本次运行证据、失败与修复请求、handoff | 协调者／交付者 |

W030／W040 的局部结果可以交接，但不能替代 W050 的完整示范结论。`task-demonstrate` 按工作包记录范围；只有完成完整业务成功条件的 dossier 才能进入正常提炼路径。

在 W030 交出 firstResult 后，W040 应核对值的来源、类型和本次应用现场，再构造第二表达式。该阶段内的真实数据复用是业务依赖；W090 的 Fresh Run 必须重新计算并重新读取 firstResult，不能读取示范文件中的 `1000` 作为本次答案。

参考脚本可以作为有声明的 API／组织参考，不得运行它后倒填未发生的探索记录。候选先保存于本次任务 attempt，不覆盖已有参考脚本；最后是否发布到正式源码，按用户授权处理。

## 5. 交接、回退和整链验收

每个生产者逐节点保存关键数据与证据，完整写入产物后才发布 handoff。下一环节读取指定 inputRefs，不依赖上游隐含聊天。request／handoff 的字段、权限和发布规则只维护在[共享合同](../../../docs/frameworks/agent-to-recipe-skill-contract.md)。

W060 至少做一次无前序操作聊天的交接检查；缺失证据的拒绝测试仅在副本中进行，不删除正式证据。宿主不支持上下文隔离时，明确记录该项未验证，不能宣称整链通过。

候选验收、变参、反例和故障测试范围以[验证规程第 6—8 节](../../../docs/quality/agent-to-recipe/calculator-validation.md)为准。现有 live gate 固定参考路径的成功不能替新候选背书，必须核对实际执行文件和 hash。

失败按[通用工作流的责任路由](../../agent-to-recipe/WORKFLOW.md)返回：证据缺口补采，业务理解错误重新提炼，定位问题补强应用，代码问题改候选，再验受影响场景。预算耗尽、用户停止或实际现场不明时停止，不无限回到开头。

## 6. 可直接交给执行 Agent 的请求

基本测试：

> 按 `workflows/macos/calculator/WORKFLOW.md` 的 BASIC 链执行 B0—B3。先核对授权、环境、权限和停止方式；保存实际执行与数据流证据，按规程报告通过、失败和未测项，不扩大到其他测试范围。

完整开发链（单独授权后）：

> 按 `workflows/macos/calculator/WORKFLOW.md` 的 PIPELINE 链组织六个独立 Skill。先生成本次工作包计划，再按产物交接执行；验证无旧聊天接续和候选 Fresh Run。不要用现有参考脚本通过冒充整链通过。

最终同时交付可定位的任务记录与结果报告，区分参考脚本、候选脚本和 Skill 交接验证。本文是稳定入口，不是某次运行日志，也不会因文件写入而变成“测试已通过”。
