# 计算器：基本自动化与 Agent-to-Recipe 验证规程

状态：验证规程已写入，**尚未执行**；本文件不是成功报告，也不授权阅读者自行启动测试。记录日期：2026-09-06。编写时核对基线：`823b7308c367fa3c408d7922bc94aa9a2cc1beef`。

## 1. 执行入口与范围选择

后续执行 Agent 先读根 [AGENTS.md](../../../AGENTS.md)、[Skill 入口](../../../prompts/automation/agent-to-recipe/README.md)和[共享合同](../../frameworks/agent-to-recipe-skill-contract.md)。需要实际 API 时读当前 `docs/api/`，不用旧会话推断接口。

| 用户授权范围 | 执行什么 | 能证明什么 |
| --- | --- | --- |
| BASIC：计算器基本测试 | 下文 B0—B3，按顺序执行，阻塞时停止依赖用例 | 当前参考 Workflow 的真实 UI、数据复用、输入变化和错误拒绝 |
| CONTINUATION：已有脚本接续 | 盘点并绑定已有实现／历史证据，按缺口补资料或最小修复，最后对采用版本执行 B0—B3 | 指定 hash 的已有实现在本次接续范围内可交接、可反向提炼并通过本轮 Fresh Run |
| LIVE-GATE：受控扰动验收 | 明确授权后复用现有 JS live gate | 该 gate 实际包含的参考脚本／兼容 Recipe 场景 |
| PIPELINE：六个 Skill 整链验证 | 下文完整开发与交接链，再验收新候选 | 独立 Skill 的数据交接、可接续性、生成与 Fresh Run |

仅说“基本测试”时默认 BASIC，不自动扩展到全部 Runtime API、系统设置改动、跨平台验证或大规模故障注入。只要求写文件时不执行任一范围。BASIC／CONTINUATION／LIVE-GATE 的通过范围各自独立，均不能宣称 PIPELINE 从零生成整链通过。

本次参考为 macOS Calculator。OpenDesk 支持其他平台不代表本案例已在 Windows／Linux 验证；不得以本例推断跨平台通过，也不为此自动启动 VM／Wine／下载系统镜像。

## 2. 前置检查与禁止动作

执行前确定真实预算、可用停止方式和唯一桌面操作拥有者。取得本次桌面操作授权，并告知会启动／聚焦 Calculator、清空当前表达式，必要时按现有脚本归一化到 Basic 布局；用户需要保留当前计算时先保存或停止，不覆盖未保存内容。

核对真实交互桌面、当前 macOS／Calculator 版本、可用 OpenDesk binary 及来源、Screen Recording／Accessibility、实际 OCR provider 和可写 artifact 目录。按当前 API 检查能力，不把文档存在当 provider 已可用。不自动重置权限、关闭用户其他应用、修改系统设置或安装依赖。

默认从仓库根目录，参考二进制为 `./dist/opendesk`。不存在、过期或来源不明时按根协作规范处理并报告；本轮若没有构建授权，不伪称已刷新。没有真实 macOS 桌面／工具时输出 blocked，不用 mock、JavaScript 算术或虚构截图代替。

参考依据：

- [AI CLI](../../api/ai-cli.md)：命令、输入、JSON envelope 与当前 live gate。
- [Execution](../../api/execution.md)：id、scriptHash、artifactDir、env 与入口边界。
- [参考 Workflow](../../../workflows/macos/calculator/calculate-and-reuse-result.js)：`resolveTask`、`calculate`、`main` 的当前合同和输出。
- [现有 gate](../../../scripts/test_ai_calculator_recipe.js)：实际场景与固定参考路径。

运行前再核对当前文件。如事实变化，记录差异并调整测试计划版本，不恢复已删除 shell wrapper。当前 gate 是普通 OpenDesk JS，通过本地 Command API 启动子 execution，不是 Recorder Runtime。

## 3. BASIC：先完成四项基本检查

所有命令均从仓库根目录执行。每次用新 execution，保留 stdout JSON envelope、stderr、退出结果和 envelope 指定的产物，不凭空推导目录。

### B0：原样公开命令

```bash
./dist/opendesk ai run workflows/macos/calculator/calculate-and-reuse-result.js
```

必须核对：正确 Calculator 应用与当前窗口；第一次真实 UI 计算 `125*8`；Display ROI 读取的 firstResult 为 `1000`；第二次真实输入表达式来自该读取值，即 `1000/4+37`；最终真实显示读取为 `287`。

`expected` 是 Oracle，不是业务结果来源。最终数值正确但未证明真实 UI 读取／消费，不能通过数据流验证。

### B1：独立重新运行与旧结果污染

保留第一次运行结束后的结果，再原样运行 B0 命令。核对新的 executionId、脚本 hash、本次准备／清空与真实输入，以及新产生的显示截图和读取证据。

两次都看到 287 不足以证明第二次完成：必须证明本次进行了输入、取得 firstResult 并用于后续操作。不得读取前一次 result 文件、dossier 数值或旧截图来作为本次结果。

### B2：不同合法输入

```bash
./dist/opendesk ai run workflows/macos/calculator/calculate-and-reuse-result.js --input '{"expression":"12+5","expected":"17","followUp":{"expression":"{result}*3","expected":"51"}}'
```

期望本次真实显示 firstResult 为 `17`，实际后续表达式为 `17*3`，最终显示为 `51`。核对当前源码实际支持的 input 字段；这是独立验证场景，不是悄悄改变 B0 的成功标准。

参考文件顶部 taskContract 含默认示例文字；变参场景同时核对本次解析 task／input 和实际 observations。若报告中的固定文案与变参事实冲突，单列文档／报告一致性问题，不能静默改写证据或假装覆盖已验证。

### B3：故意错误的期望必须被拒绝

```bash
./dist/opendesk ai run workflows/macos/calculator/calculate-and-reuse-result.js --input '{"expression":"12+5","expected":"9999"}'
```

这是明确标记的负向用例。计算器真实结果应是 17，而本次测试故意要求 9999，脚本必须失败并保留不匹配证据，不得把期望改成 17 后宣布原负例通过。核对 failed／error、非成功退出及 `passed: false` 等实际输出；第一步验证失败后不应继续执行依赖的第二次计算。

测试 verdict 可为 pass（正确拒绝），但业务 execution verdict 必须保留 fail，两者分别记录。负例出乎预期成功时，停止并报告 F6，不继续扩大测试。

## 4. 每次运行要核对的证据

当前参考 Workflow 写 `calculator-workflow-result.json`，其中可核对 calculations、rawDisplay、normalizedResult、displayScreenshot、OCR 信息、reuse、finalResult 和 passed。真实 stdout 为 AI CLI envelope，脚本日志位于 envelope 指向的 artifacts，不要把没有直接打印日志误判为脚本未运行。

从当次 envelope 的 artifacts 根读取结果，核对执行 ID、输入、脚本版本、截图来源与时间关系、实际业务对象。检查必要截图／读取输出，不只相信 result.passed 或子进程退出码。

若所需动作／时间／来源证据没有被当前参考脚本生成，记录 evidence gap；不能回忆补造。补采、改候选或额外探测需要在当前授权范围内另建尝试。通用 runtime 只保证已文档化的日志、快照、summary 等基础产物，不默认生成本规程每种领域证据。

BASIC 完成后使用共享 QualificationRecord 记录四项实际结果，任意 not-run／blocked 均如实报告。不得把未运行的场景填为通过，不预填专家分数。

## 5. CONTINUATION：已有脚本与历史执行的接续验收

本范围用于“业务脚本已经存在并运行过，但合同、dossier、procedure、候选登记或当前验收尚需补齐”。它不是把 PIPELINE 改成低门槛捷径，也不要求删除有效代码、知识或历史证据后重新探索。

1. 先盘点已有脚本、Git／工作区状态、实际 raw hash、入口规范化后的 execution hash、已定位的历史 execution 与构建来源。已有任务包有效时接续；没有时用本轮真实 taskId 初始化，并明确它不是历史任务包。
2. S3—S6 将材料分别标成历史证据、当前 `reference-execution` 或新的 Agent demonstration。历史截图／结果只证明原 execution；源码只证明实现逻辑。足以支持指定事实的 continuation fact dossier 可以用限定 scope 的 Gate 进入反向提炼，但不能写成完整示范 pass；缺关键证据仍须 warn／fail 并定向补采。
3. S7—S9 同时消费冻结的已有脚本和确定版本事实资料，输出代码到业务步骤映射、每步输入输出／状态／失败边界、字面量分类和 firstResult 数据依赖。把 execution-evidenced、implementation-only 与 unknown 分开；移除一项关键证据的独立副本应触发明确缺口，而不是算出答案。
4. S10—S11 默认登记既有实现及内容 hash，并写明“复用、未重新生成”。若发现明确缺陷，先冻结字节一致基线，再建立任务内最小候选和 diff；候选通过相应用例后，只有在发布授权内才应用到公开原路径并重验。不得覆盖参考文件来偷换候选，也不得为“生成”复制同功能源码。
5. S12 对最终采用的路径和 hash 执行本轮获准的 B0—B3。Fresh Run 是新的业务 execution：重新确认应用／窗口、重新输入、重新读取 firstResult 并消费；不读取 dossier 样本作为答案，也不删除任务知识、历史证据或用户数据来制造“干净”。

最终 QualificationRecord 的 scope 只能是本次 continuation 及实际场景。它可以报告接续流程和采用版本通过，但不能据此声称新的 Agent 从零示范、全新脚本生成、完整 PIPELINE、LIVE-GATE 或未运行环境已通过。

## 6. LIVE-GATE：复用已有受控扰动入口

仅在明确选择该范围、同意其窗口扰动且前置条件满足后执行：

```bash
OPENDESK_LIVE_CALCULATOR=1 ./dist/opendesk -script scripts/test_ai_calculator_recipe.js -console-mode script
```

执行前读取当前 gate 的实际场景和能力要求。它会触发多个子 execution 和窗口／布局等受控检查；不要把它包装成普通单次体验。不得重新创建旧 `.sh` 测试入口，也不运行无关全量测试。

当前 gate 针对仓库固定参考 Workflow／兼容 Recipe。新生成的候选未经路径和实际执行 hash 核验，不能用该 gate 的成功替它背书；禁止通过覆盖参考文件偷换测试对象。gate 的 summary 与各子 execution 的业务证据分别保留。

## 7. PIPELINE：验证六个独立 Skill，不是只运行现有脚本

### P1：冻结合同和计划

由 automation-plan 创建新 taskId、任务包和本次预算。业务范围为一次计算、真实读取、再使用结果计算及最终验证；初始样本可使用 B0，额外用 B2 作变参验证。明确允许清空 Calculator，不允许其他业务副作用。

划分工作包并保存预期输入输出：应用认识；第一结果；依赖计算；完整示范结论；过程提炼；应用补强；普通 JS；Fresh Run。S3—S6 的局部工作包不能替代完整示范结果。工作包文件不强制与最终代码文件一一对应。

### P2：应用工程与真实示范

application-engineer 按 discover 模式交付当前有效 AppProfile。task-demonstrate 使用现有 OpenDesk 原子／短脚本能力完成真实任务，逐节点保存动作、观察、firstResult 来源和实际第二表达式，最后交付 dossier。

参考脚本可以作为已声明的 API／组织方式参考；不得直接运行它后倒填一段未实际发生的“Agent 从零探索”。如只运行了已有脚本，报告 reference-execution，不报告完整示范学习链通过。

### P3：交给没有前序操作聊天的提炼者

仅提供 procedure-synthesize 的 Skill、共享合同、冻结任务合同、AppProfile、dossier 及指定证据。消费者应能说明必要步骤、保留／排除理由、Input／Config／Secret／Runtime Value 和 firstResult 的真实消费关系。

把关键证据在独立副本中移除再测一次，消费者应准确阻塞并提出定向补采，不能自行计算一个答案。不得删除正式证据。宿主没有上下文隔离时注明未完成该项，不能用相同 Agent 的记忆冒充。

### P4：应用补强与生成候选

按真实缺口调用 application-engineer 的 harden，再由 recipe-build 写本任务 attempt 中的普通 JS 与 candidate.json。不要先建设 Recorder／IR／编译器／新 Runtime，也不要求拆 module/import。

CandidateManifest 必须给出可复制的实际一行命令和工作目录，例如使用 `./dist/opendesk ai run` 加上本次真实候选路径。不得保留 `<task-id>` 等占位符；记录是否参考过已有 Workflow。默认不修改仓库参考脚本，发布源码另按用户授权。

### P5：验收该候选的真实版本

recipe-qualify 对候选实际路径与 hash 执行 Fresh Run、不同输入和错误期望等适用场景，独立核对本次业务证据。候选 input 合同不同则在计划中明确映射，不能给它虚构参数。知识可以复用，示范答案不能复用。

失败后只提出修复请求，由对应生产者新建版本；重跑受影响场景和必要回归。预算耗尽或结果不明即停止。最终报告与现有参考脚本结果分开。

## 8. 故障验证扩展：不能自动混入 BASIC

完整可靠性测试在单独副本／低风险环境中注入：半写 handoff、缺失文件、旧任务／旧版本、上游变化、产物已写但 progress 未更新、观察后窗口变化、暂停取消、类型／单位不匹配、越界路径／不可信指令、入口环境差异、自报假成功和旧结果污染。

每项明确前置、注入点、期望拒绝／恢复方式、实际证据及副作用边界。计算器不涉及发送／付款；这些副作用恢复保证只能在安全 fixture 或另行获准业务场景验证，不能由计算器成功外推。

## 9. 最终报告与停止规则

至少报告：scope、合同／候选版本、实际命令及工作目录、构建／应用／provider、每个场景的期望与实际、executionId、证据路径、数据流核对、失败分类、未测项、限制和下一步。运行记录保存在实际 artifact 与 `.runtime/automation-authoring/<task-id>/`，不要提交截图和临时结果。

没有真实运行只报告未执行；缺环境报告 blocked；参考命令通过只报告参考范围通过；完整链有任何关键交接、来源、权限或业务验证失败，不能报告整链通过或 95 分。取消不回滚已经发生的桌面动作，恢复前须重新核对现场。

本规程的完成状态不会因为文件已写入而升级。下一执行者须依据真实结果另建 QualificationRecord，不直接把本文改成“全部通过”。
