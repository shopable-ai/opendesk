# Calculator r003：审计、运行与完成判据

2026-09-19 工作流接续新增的 Skill、Frozen Fixture、相邻工件检查、固定代码评审及分项评分见[工作流质量总览](agent-to-recipe-workflow-review-20260919.md)。本报告保留 Calculator 实施与历史资格事实；生产 JS 未因该次接续改变。

**审查入口：[README 的验收路线图](../../examples/agent-to-recipe/README.md#怎样核对正确性)**。它逐项给出“用户要求 → 关键环节 → 原始文件 → 检测方法 → 成功条件 → 事实／局限”，并提供普通运行与资格测试的两条命令、函数合同和复验前提；无需先理解内部工作包编号。

2026-09-18 的固定场景已有实现和运行证据；**用户验收尚未发生**。维护源码是 [examples/agent-to-recipe/calculator.js](../../examples/agent-to-recipe/calculator.js)，真实资格测试是 [tests/workflows/calculator/qualify.cjs](../../tests/workflows/calculator/qualify.cjs)。该次候选实际读到 **110 → 660**，第二段原生动作回执为 **6 × 1 1 0 =**；独立观察确认干净起点 0、首值 110 和最终 660。以下历史运行结论只适用于对应 hash 和环境。

## 2026-09-19：可审查性复核

本次原始要求是“看不出正确性、执行哪些关键环节、检测方式”。复核结果支持固定场景，无需修改生产动作或重新操作桌面；本次仅修改 README 与本报告，运行 `--check`、比对原始记录并重新查看三张原图。没有新增 live 资格或人类确认。

| 层次 | 复核到的事实 | 不能据此声称 |
| --- | --- | --- |
| 代码已修改 | 既有脚本第 96–102 行依次点击、读 UI 首值、清空、展开 `firstResult`、再次读 UI；本次生产字节未改 | 任意输入参数都正确 |
| 实际已加载 | 候选 `script_snapshot.js` 与维护源码、执行摘要 hash 相同；49 项依赖的运行前／后记录相同且当前仍相同 | 当前 HEAD 的全部 native 源码已重新构建／验证 |
| 功能已验证 | 原样回执有两段 14 项 acknowledged；另一只读 Execution 看到 110→0→…→660；前后观察各三次 0／660 | 回执本身证明业务成功；或已记录物理鼠标每次点击 |
| 视觉已确认 | 重新打开 0／110／660 原始 PNG，数字、窗口边界和按键排列吻合 | 自动 `test-result.json` 已完成看图；或用户已审阅 |
| 用户验收 | 提供可逐项打开的证据和成功条件 | Agent 可替用户宣布接受 |

判断数据依赖时不能只读候选末尾 JSON：源码把 `UI.readText` 的实际返回值赋给 `firstResult`，中间没有改写，再以字符展开进入 `UI.tapTargets`；运行快照固定这段实现，原生回执给出完成的目标序列，独立观察与截图给出显示结果。四者共同支持本次生产者→消费者关系。现有记录没有逐条记录两个 `UI.readText` 调用的底层读取事件，也没有 OS 级输入监听；这些未被冒充为已取证。

“独立观察”只指分开的只读 Execution 自行解析窗口、读取显示，不向候选供应值。候选与观察器仍使用相同 Runtime／Accessibility 后端；同一 Agent 协调和读图。因此这是固定场景的交叉核验，不是独立实现、盲上下文或人类验收。hand-off 检查也只核信封、显式引用与 hash，不能取代语义审阅或业务证据。

当前仓库仍为 `master`，HEAD 实际是 `bd7dcf0d727450a9444cb85b8cc1d11d4e9b8dc2`；历史受测 binary 的 VCS revision 是 `2758d3032ac847d599008eb7cf7b37743788b8a5` 且 `vcs.modified=true`。两者不可混称“当前 HEAD 构建”。本次核对 binary 字节未变，未构建、提交、fetch、推送或切换分支，远端状态未核验。源码／测试绑定的只读检查见[新检查结果](../../.runtime/tests/workflows/calculator/2026-09-18T16-17-22-882Z-3791/test-result.json)；原始事实、链接和保留检查见[本次复核记录](../../.runtime/automation-authoring/calculator-fresh-20260918/maintenance/reviewability-20260919-001613/review.json)。

下面保留 2026-09-18 的 r003 实施与资格说明。这次是已有合格 r001 和精简 r002 的 **continuation-chain**。原始示范与 r001 整链资格保留；r002 的真实运行成立，但“完整资格通过／当前推荐交付”声明不充分，现已纠正。没有重跑全部 S1—S12，没有新增自动调度器、Runtime API、通用解析器、Capability 发布或打包。

## 人工可审核的完整本轮要求

需求来源是本任务的用户委派消息，以及冻结的 [business-input.txt](../../.runtime/automation-authoring/calculator-fresh-20260918/business-input.txt)。以下是对应当前合同/计划的人类可读说明，不是要求用户再开任务或再执行一套提示词：

> 在当前仓库 master 上接续 Calculator 已有产物。先读取真实工作流、合同、脚本及运行证据，逐项审计七类主产物是否齐全、语义是否一致，以及“通过”声明的实际范围。保留 r001/r002 的所有冻结文件和历史运行，不回填先验记录。固定业务仍是按钮完成 25 × 4 + 10，实际读取 firstResult，再按钮完成 6 × 本次 firstResult，最后实际读取并输出 finalResult；110/660 只能用于测试断言。将重复点击封装为参数清楚的普通函数，清空副作用显式表达，保留身份、布局、全部必要目标预检、唯一性、稳定读值、有界动作与未知结果停止。生产代码与完整资格取证分开。未变的 Dossier、DistilledSteps、AppProfile 用固定 hash 复用；真实语义修订进入新 Procedure/计划。先冻结新 CandidateManifest、API 与依赖，再以新 request 进行独立干净起点、精确候选、真实值链和独立最终 UI/截图验证；失败保留并定向修复，不自动重放。维护源码和测试进入正式目录，输出留在 .runtime。交付可复制的一行运行/测试命令、函数合同、七类文件表和证据对应；分别说明静态、运行、视觉、未测范围及未提交修改。不得改其他任务文件、系统权限、签名身份，或自动提交、切换分支、推送。

结构化来源为 [TaskContract r003](../../.runtime/automation-authoring/calculator-fresh-20260918/plan/r003/task-contract.json) 和 [WorkPlan r003.1](../../.runtime/automation-authoring/calculator-fresh-20260918/plan/r003.1/work-plan.json)。后者真实记录一次测试侧修复，未倒填历史 W030/W031。

## 运行与函数

工作目录：`/Users/mac/Documents/workspace/clawdesk`。历史运行时 Calculator 为本机 Basic 232×321，原生名称为“主显示器”“清除／全部清除”，Accessibility 和截图权限具备。下次运行须重新核对当前窗口、权限和桌面占用，不能复用历史 PID／handle 或假定仍显示 660。执行期间保持桌面输入独占；命令会激活并清空 Calculator。

普通运行，2026-09-18 已原样执行通过：

```bash
./dist/opendesk -script examples/agent-to-recipe/calculator.js -console-mode script
```

真实测试，2026-09-18 已原样执行通过：

```bash
node tests/workflows/calculator/qualify.cjs
```

每次测试新建 `.runtime/tests/workflows/calculator/<时间-PID>/`，不覆盖旧目录。`test-result.json` 是自动断言结果，截图还须另行查看；脚本不会把自动 PASS 冒充视觉审阅。`--check` 仅验证源码/冻结绑定，`--preflight` 仅观察当前窗口，均不是业务资格。测试读取 `spec.json` 指向的冻结作者 Manifest；清理任务包后会停止，不能在丢失来源时继续宣称旧资格。普通运行只依赖维护源码与 Runtime。

| 函数 | 输入、返回 | 副作用与理由 |
| --- | --- | --- |
| `clickCalculatorButtons(win, buttons)` | 当前 WindowInfo，1..16 项稠密数组；0..9/×/+/=；返回原样 `UI.tapTargets` 回执 | 只点击给定序列，不清空、不补等号、不计算答案；同一流程调用两次 |
| `clearCalculator(win)` | 当前窗口；成功返回 void | 最多按实际 C 再 AC，回读稳定 0；清空在主流程中明确调用 |
| `readCalculatorResult(win)` | 两次相同的实际 UI 字符串，限无符号整数 ≤12 位 | 只读；不消费 expected 或历史值 |
| `inspectCalculator` / `currentCalculator` / `flatten` | 当前窗口、所需按钮／快照 | 必要的身份、焦点、布局、完整观察、目标唯一/可用和读值通道检查 |
| `main()` | 返回 `{firstResult, finalResult, firstInput, secondInput}` | 显式清空→第一段按钮→读首值→显式清空→`['6','×', ...firstResult,'=']`→读最终值 |

保留的辅助代码用于运行保护；没有 expected 110/660、截图、证据文件写盘或资格 verdict。`firstInput/secondInput` 是调用方可消费的原生完成回执，不是独立业务 Oracle。完整审计、截图、hash、期望及资格结论都在测试/记录侧。函数接受的语法边界不等于任意参数组合已经资格化。

## 七类主产物：实际文件与职责

下表的 `TASK` 为 `.runtime/automation-authoring/calculator-fresh-20260918/`，`RUN` 为 `.runtime/tests/workflows/calculator/2026-09-18T15-45-08-040Z-75772/`；链接指向实际文件。七类不等于七个文件，request/handoff/progress 与本报告是协调或导航资料。

| 主产物及实际路径 | 版本／复用方式 | 用途 | 验证方法与状态 |
| --- | --- | --- | --- |
| [TASK/plan/r003/task-contract.json](../../.runtime/automation-authoring/calculator-fresh-20260918/plan/r003/task-contract.json)；[TASK/plan/r003.1/work-plan.json](../../.runtime/automation-authoring/calculator-fresh-20260918/plan/r003.1/work-plan.json) | 新合同 r003、新续作计划 r003→r003.1；原 r001 保留 | 原业务、成功标准 C1–C6、授权、预算、W040/W041/W042/W043、测试修复影响 | 原需求逐项对应；工作包/依赖/实际时间核对：PASS |
| [TASK/app-profile.json](../../.runtime/automation-authoring/calculator-fresh-20260918/app-profile.json) | **Profile revision r002** 原 hash 复用；与 Recipe r002 无关 | 身份、Basic 布局、原生目标、读值/清除/失败规则及来源 | 当前无输入预检、动作与读取实测：本场景 PASS；未新增应用认识／人审 |
| [TASK/dossier.json](../../.runtime/automation-authoring/calculator-fresh-20260918/dossier.json) | 原始 r001 示范原样复用 | 真实 A008 产生首值，A018 消费；示范证据与 provenance | 原引用 hash、实际记录核对：历史 PASS；本次没有新示范 |
| [TASK/distilled-steps.json](../../.runtime/automation-authoring/calculator-fresh-20260918/distilled-steps.json) | 原始 r001 原样复用 | D010–D060 必要路径，A001–A020 的 retain/merge 理由，D030→D050 数据链 | 取舍/数据依赖无变化，hash 与 Procedure 来源核对：PASS |
| [TASK/revisions/r003/procedure.json](../../.runtime/automation-authoring/calculator-fresh-20260918/revisions/r003/procedure.json) | 新修订 r003 | 保留 B010–B050，明确 click/clear/read 合同与副作用，区分运行门禁和测试 | 原动作不变；sourceMapping、实际首值消费者及新运行核对：PASS |
| [TASK/revisions/r003/candidate-q002.json](../../.runtime/automation-authoring/calculator-fresh-20260918/revisions/r003/candidate-q002.json)；[examples/agent-to-recipe/calculator.js](../../examples/agent-to-recipe/calculator.js) | Recipe r003；Manifest r003-q002；第一次测试失败后只修测试依赖，生产 hash 未变 | 普通 JS、输入/返回、API 正文、上游与依赖、入口、范围和来源映射 | 83 个关键显式引用、11 个 canonical 阅读包；源码/运行快照及依赖前后核对：PASS |
| [TASK/revisions/r003/qualification-q002.json](../../.runtime/automation-authoring/calculator-fresh-20260918/revisions/r003/qualification-q002.json)；[tests/workflows/calculator/qualify.cjs](../../tests/workflows/calculator/qualify.cjs)；[RUN/test-result.json](../../.runtime/tests/workflows/calculator/2026-09-18T15-45-08-040Z-75772/test-result.json) | 新 Qualification q002，lineage=continuation-chain；q001 失败保留 | 精确候选、独立 prepare/clean/witness/final、期望、实际命令/值、证据、未测范围 | 固定业务 live PASS；字面普通命令 PASS；独立视觉 PASS；不声明盲上下文／通用参数资格 |

Profile 实际路径是 `app-profile.json`，SHA-256 `b0a010412ff404568ae63cd771c1a52d979731ee54225174349e4546d427309e`。交接文字所称 `app-profile-r002.json` 在任务根不存在，未凭空补造。

## 要求、条款、旧缺口与修复证据

审计原记录见 [audit.json](../../.runtime/automation-authoring/calculator-fresh-20260918/revisions/r003/audit.json)。适用条款是[共享合同第 5–7 节](../frameworks/agent-to-recipe-skill-contract.md)、[application-engineer](../../workflows/agent-to-recipe/skills/application-engineer/SKILL.md) 的职责分离，以及[定位修复方法](../frameworks/ui-locator-repair.md)的全目标预检和未知输入停止。

| 用户要求／适用条款 | 核实的旧文件/证据 | 本次实现与结论 |
| --- | --- | --- |
| 文件齐全且绑定准确；Candidate 最小字段 | `candidate-r002.json` 缺 apiRefs/dependencies | 新 Manifest 固定 API 包及源码/依赖；非空且实际 hash 检查通过 |
| 精简不能删安全门禁；S10/S11 | r002 只在清除前观察 clear 按钮，缺全部目标/显示预检 | 恢复静态 keypad 全部 distinct targets 和读值通道；每批前复核；live PASS |
| 可重复点击参数、副作用明确 | r002 helper 每次内部清空，而 Procedure 的 B010/B030 分列准备 | 新 click helper 只点参数；clear 显式调用；新 Procedure/sourceMapping/live 对应 |
| 独立 Fresh Run、预先冻结 | r002 候选内部读 0；无独立 clean observer；只后验 script hash | 先固定作者 Manifest及依赖，独立 C/AC 准备与 0/0/0 观察，再运行精确候选，前后核验 |
| 实际值→实际输入→实际结果 | r002 `secondButtons` 为自报，events 只有加载/末尾输出，无按钮 trace | 原样 Runtime 完成回执 + 精确源码 + 独立 Display 变化和结果交叉核验；不声称 OS 级逐点输入监听 |
| 计划、来源、时间真实 | W030/W031 未进入仅含 W010 的 plan/r001；request 均 recordedAfterExecution；frozenAt 与候选开始同秒；资格时间 23:02:42 早于观察结束 23:02:45 | 旧文件保留并纠正报告；新计划/request/冻结时间真实记录；r003 是接续链。不能用 r002 声明证明先冻结后验收 |
| 范围写实、维护位置稳定 | 两次调用被表述为可复用，但未测其他组合；源码/测试只在 runtime | 维护源码/测试进入正式目录，只声明固定场景；上游和运行证据仍留 runtime |

造成 r001 冗余的是 S10→S11 将生产逻辑与完整资格取证混在同一文件；r002 精简又删掉了必要门禁，S11→S12 缺少预先冻结/独立起点/依赖闭包，协调记录事后补录。工作流本身的原要求仍有价值；本次在 [WORKFLOW.md](../../workflows/agent-to-recipe/WORKFLOW.md) 增加具体放行清单，没有为让旧 r002 通过而放宽标准。

## 精确版本与真实验证

生产源码 SHA-256：`a62c72aa2b00f256755aac2524d14e4655a88194c012bf6765f0d314a62774cc`。当前 Manifest SHA-256：`31f610a5265abbf855911861c3e3137ab9f21f0ab66da3f5392b868bcde30925`。

环境：macOS 12.7.6 / 21H1320；Calculator 10.16，Basic 232×321；沿用精确 `dist/opendesk` SHA-256 `8e87527dcec02f2afb320fe7d27b59ca31c5186fd75e4561599e4afad48e2cd3`。该 binary 的 VCS revision 为 `2758d3032ac847d599008eb7cf7b37743788b8a5` 加 dirty 源码，与历史资格字节相同，不能代表后续 HEAD。r003 实施只新增外部业务/测试 JS，未重建无关 native 改动，未启用 UI host、改变 App ID/签名/权限。资格闭包包含 binary、28 个 polyfill、5 个 jslib 和 6 个测试/规格文件，并核对 API 原文。不是拿 r001 旧依赖检查充当本次检查。

| 验证层 | 实际记录 | 状态 |
| --- | --- | --- |
| 静态/绑定 | `--check`、83 显式引用、11 阅读包、输入/数据流/副作用审阅 | PASS；不替代桌面 |
| S11 无输入预检 | `2026-09-18T15-35-21-922Z-66652/preflight/` | PASS；没有激活或点击 |
| S12 独立起点 | `direct-20260918-234515-560000`，三次 0 | PASS |
| 原样新候选 | `direct-20260918-234521-574000`，实际 110→660，14 个业务按钮回执均 acknowledged | PASS |
| 独立中途观察 | `direct-20260918-234518-924000`，0→2→25→4→100→1→10→110→0→6→1→11→110→660 | PASS；观察者只读，未向候选供应业务数据 |
| 独立最终观察 | `direct-20260918-234540-783000`，三次 660 | PASS |
| 普通字面命令 | `direct-20260918-234653-089000`；[摘要](../../.runtime/runs/direct-20260918-234653-089000/summary.json)；随后独立 `direct-20260918-234811-796000` 三次 660 | PASS，运行目录/命令/源码与 README 一致 |
| 同时点依赖 | RUN/dependencies-before.json、dependencies-after.json；TASK/revisions/r003/manual-command-before.json、manual-command-after.json | PASS，无漂移 |
| 实窗视觉 | [干净 0](../../.runtime/tests/workflows/calculator/2026-09-18T15-45-08-040Z-75772/clean-observer/calculator.png)、[首值 110](../../.runtime/tests/workflows/calculator/2026-09-18T15-45-08-040Z-75772/live-witness/first-result.png)、[最终 660](../../.runtime/tests/workflows/calculator/2026-09-18T15-45-08-040Z-75772/final-observer/calculator.png) | Agent 实际读图 PASS：数字清晰、窗口完整、按键对齐；不是人工确认 |

冻结顺序：原始 r003 Candidate 在 23:38:19 冻结；q001 资格失败后保留 [qualification-q001.json](../../.runtime/automation-authoring/calculator-fresh-20260918/revisions/r003/qualification-q001.json)。只读 witness 在输入过程中遇到短暂不可读显示后退出，缺首值图片；该次候选实际成功和最终观察仍保留，但整项资格为 fail。没有未知/partial 输入，没有自动重放。现场已由独立最终观察与截图确认为 660，才进入新准备。

测试修复在新 WorkPlan r003.1 中记录：保存不可读 snapshot，仅对“缺少可读显示”做最多 2 秒只读等待，歧义/不完整/身份变化仍失败；不重试任何按钮。生产源码不变。测试闭包重新于 **23:45:06** 冻结为 r003-q002，资格 request 随后写入，**23:45:08** 启动新测试。新 witness 的原始快照确实记录到了 Calculator 在转换期间没有 Display 子节点，随后恢复；支持本次有界观察修复，不能追认旧失败当时的具体底层原因。全部观察结束后才形成当前 QualificationRecord。

初次构建 handoff 中的旧测试引用后来使用 q001 快照恢复核对；[恢复记录](../../.runtime/automation-authoring/calculator-fresh-20260918/revisions/r003/q001-snapshot-recovery.json)明确发生在执行之后。这只支持旧字节的事后核验，不能冒充那些快照在运行前已经生成；q001 的失败结论保留。

## 完成判断与未测边界

r003 的 Agent 侧实现与资格完成判据是：七类产物及职责可追溯；精确源码保持真实 firstResult 依赖；必要门禁保留；普通命令及独立资格 live 通过；截图实看通过；历史冻结字节保持；维护源码/测试有固定位置。本报告及 QualificationRecord 分别给出证据，`progress.completed/qualified` 不是独立证明，也不意味着用户已理解或接受交付。

未测：任意输入组合/长度、通用表达式、小数/负数、其他平台/布局/语言、unknown/partial 故障注入、跨文件模块、人审及无历史上下文交接。操作采用原生 invoke，不声称物理鼠标轨迹资格。未构建或发布 Capability、受保护包、桌面 App。现有证据支持固定场景；本次审查未发现需要改生产代码的缺口，用户验收仍待用户判断。

仓库级检查并非全绿：Example Explorer Catalog 9 项通过，合并运行的示例安全测试共 64 项中 63 通过、1 失败；失败来自已在 HEAD 的 `examples/accessibility/macos-calculator-tap-targets.js` 与旧四文件列表断言不符。目录架构审计的当前布局 invariant 通过，但 10 个已有 Go 测试未登记导致总审计失败。相关文件与 HEAD 字节一致，本次未修改；详见 [repository-checks.json](../../.runtime/automation-authoring/calculator-fresh-20260918/revisions/r003/repository-checks.json)。这些既有问题不写成通过，也不冒充本 Calculator 资格失败。

## 交接、未提交文件与证据寿命

本次修改/新增、尚未提交：

- `examples/agent-to-recipe/{calculator.js,README.md}`、`examples/catalog.json`（manual 示例入口）；
- `tests/workflows/calculator/{qualify.cjs,spec.json,preflight.js,prepare.js,observe.js,watch.js}`；
- `workflows/agent-to-recipe/{WORKFLOW.md,cases/calculator.md}`；
- 本报告、原 [2026-09-18 报告](agent-to-recipe-calculator-live-chain-20260918.md)的追加纠正、`.gitignore` 的输出目录说明。

r003 实施开始时为 `master`／HEAD `2758d3032ac847d599008eb7cf7b37743788b8a5`；其收尾记录已显示 HEAD 为 `bd7dcf0d727450a9444cb85b8cc1d11d4e9b8dc2`。此前报告沿用了旧 HEAD，此处更正时点，不回写冻结来源。Calculator 任务没有提交、推送、fetch 或切换/创建分支；远端最新状态未核验。其他 assistant/product、accessibility、flow-install、execution、custom-ui 等修改不属于本任务。

初始 278 个任务文件逐一固定 hash；最终只有允许更新的 `progress.json` 改变，其余 277 个原有文件（含 r001/r002 源码、Manifest、Qualification、request/handoff 和 executions）原样保留。q001 的失败输出也不覆盖。检查结果见 [final-verification.json](../../.runtime/automation-authoring/calculator-fresh-20260918/revisions/r003/final-verification.json)。

`.runtime` 是本地可清理证据，未加入版本控制；可维护源码/测试不再只存这里。历史证据被清理后，报告仍说明曾发生的事实，但不再构成可复核闭包。后续变更源码/API/依赖或环境时须形成明确影响分析、新冻结绑定和相应资格，不能仅更改 spec 的 hash 来沿用旧 PASS。
