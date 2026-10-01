# 阶段人工诊断：唯一 checker 的失败优先投影

## 业务目标与边界

维护者只读一个诊断入口和一个失败阶段，应能说清要求、Actual、第一处不一致、已知/未知、保留范围及下一最小动作。S1—S12、现有阶段评分和 requiredTests 不变；不得创建第二套 Workflow、checker 或总分。

此能力检查固定记录与文件，不见证桌面。受控维护 fixture、结构性检查、Runtime 执行和独立业务 Qualification 必须分开。

## 信息架构

```text
<new-check-directory>/
  stage-review.md               # 简短总览；首先展示问题、边界、归属与下一动作
  stage-review/S01.md ...       # 仅已检查阶段；not-run 不制造详情
  checker-result.json          # 同一次唯一 checker 的完整结果
  snapshot-index.json          # 固定引用到保留字节的映射
  files/...                    # 从该 checker 读缓存保留，不重新查询 latest
```

优先发布新检查目录，而不是覆盖另一会话的历史报告。任务根的“当前检查”指针应由现有协调者以受保护方式更新；生成 bundle 本身不偷偷改指针、状态或业务工件。旧消费者只调用 `renderWorkflowReview` 时仅得到总览；需要改接 `writeWorkflowReviewBundle` 才能发布单阶段文件。不能把摘要当成完整新诊断入口。

单阶段顺序固定：一句结论 → 业务职责 → 固定输入 → 关键断言 → Actual → Required/Actual 对照 → 第一处不一致 → 责任与接续 → 机器附录。机器评分、hash、Gate 和原始引用只在附录层。

## 三种位置，以及“保留”究竟意味着什么

`failureDiscoveryStage` 是当前问题在哪个审阅阶段被发现。`firstInvalidBoundary` 是当前哪份输出开始不能继续信任。`failureOwner` 是已有区分性证据支持的修复责任，不自动等于前两者。

合法结果：

```json
{
  "failureDiscoveryStage": "S3",
  "firstInvalidBoundary": "S3",
  "failureOwner": {"status": "UNKNOWN", "stage": null, "skill": null}
}
```

晚发现也合法：S11 发现 S3 输出的证据缺口，边界 S3，Owner UNKNOWN；入口链接 S11 的诊断说明，不要求先通读 S3—S11。

保留上游表示保留同版产物及其已有检查结论，不表示已排除上游作为潜在根因。无区分性证据时仅保留候选责任及取证动作，不生成“Repair S3”。旧 `ownerStage` 或 `failureOwnerStage` 声明不会因为 hash 正确自动成为已证明归属。

跨阶段 finding 必须显式指定 `firstInvalidBoundary`，并绑定该阶段的当前输出；绑定其他阶段的一份文件不够。这个绑定允许保守停止消费，并不证明根因。`missedCheckOwner` 仍独立显示，旧单纯声明标为 `UNCONFIRMED_DECLARATION`。

当前可自动确定的责任仅限：同版输入满足冻结业务前提、本阶段输出违反明确的保留关系，而且没有别的未解决阻塞项。结果标为 `ESTABLISHED`，同时限定为 **固定输出的修复责任**，不是 Runtime 根因或通用 JS 语义证明。一个明确输出矛盾不能掩盖其他 Hard Fail；有其他未归属阻塞时总体 Owner 仍为 UNKNOWN。

## Expected 与 Actual 从哪里来

新任务/版本化维护 fixture 可在原有 `acceptance.stages[Sx]` 增加有序 `businessAssertions`，每条绑定已有 `requiredTests` 中的测试名；这不是新评分表。唯一 checker 负责读取、对照和阻断，renderer 不比较第二次。

每条断言有 `id`、业务语言 `requirement`、既有 `test`、`comparator`（equal 或 includes）、`expected` 与 `actual`。期望可以是冻结的字面要求，或本阶段输入中的值；Actual 必须选自本阶段已绑定的 input/output/evidence 中唯一来源，采用 JSON pointer。机器按完整值比较，Markdown 仅作有界摘录。辅助代码摘录支持显式行范围，只读不执行。

```json
{
  "id": "retain-first-result-consumer",
  "test": "existing-required-test-name",
  "requirement": "去噪不能丢失 firstResult 的第二次按钮消费者",
  "expected": {"selector": {"collection": "inputs", "kind": "DemonstrationDossier", "pointer": "/firstResult/consumers"}},
  "actual": {"selector": {"collection": "outputs", "kind": "DistilledSteps", "pointer": "/firstResult/consumers"}},
  "inputBaseline": ["第二次按钮消费者"],
  "comparator": "equal",
  "attribution": "output-preservation",
  "nextEvidence": "先核对输入前提与固定来源；缺内容时不指定修复责任。",
  "nextRepair": "仅在责任已确定时修正该阶段丢失的关系，并重验受影响下游。"
}
```

上例是格式示意，不是 Calculator 真实工件。实际指针必须来自相应正式工件，不能为适配模板改写真相。`inputBaseline` 防止上游输入和下游输出同时遗漏时出现“两个空值相等所以正确”的假阳性。

旧 acceptance 没有这类业务比较正文时，不追加或改写其历史 Expected 来得到绿色结果；报告标 `LEGACY_UNSPECIFIED`，业务对照显示 UNKNOWN，原有 requiredTests/评分判断单独保留。要改善该历史报告，先取得并绑定已有要求和 Actual 的可审阅证据，不能用本轮 golden 数值填补。涉及新任务冻结合同的修改仍走既有版本与授权流程。

可选 `humanContext` 仅选择同一审阅已经绑定的来源，用于行摘录、失败现象、实际输入数和未产出的值。它不产生新 PASS，也不调用模型总结。缺失、不唯一、错版的必需比较均 UNKNOWN 并阻断。

## Calculator Golden Case 的唯一正文组织

`split-calculator-stage-docs.js` 将现有 calculator.md 的十二个阶段正文原样移动到 calculator/stages/S01.md—S12.md，旧标题锚点留下跳转。原 R1—R8 表格逐字移动到 invariants.md。README 只导航；failures 只说明少量受控失败。相对链接随移动修正，代码块中的文本不改。

迁移默认只检查；写入时要求源文件匹配已核对的 Git blob，所有目标文件不存在；源文件最后切换。遇到并行修改或部分迁移即停止，不覆盖。它不是新的 Workflow 或 checker。

Golden 页仅供维护、教学、Evaluator、方法审阅。同任务 Producer 使用 cases/calculator 下参考页作为 Method/输入也应被拒绝，不能用改 role 的方式绕过未来答案隔离。

## 可重复的维护验证

```bash
node --test tests/workflows/stage-review-diagnostics.test.js
node --test tests/workflows/calculator-stage-doc-migration.test.js
node tests/workflows/tools/render-stage-diagnostic-fixtures.js <new-output-directory>
```

三个版本化受控场景：S3 Wrong display binding/UNKNOWN；S7 输入有消费者、输出丢失；S11 Procedure 保留 runtime 来源、CandidateManifest 声明固定110并附同版源码行。最后一个证明当前声明不一致，未作任意 JS 程序的语义证明。真实源代码与 consumer 路径继续由既有 exact-byte 验证负责；本轮不运行它来冒充 fresh run。

生成真实报告包：

```bash
node workflows/agent-to-recipe/scripts/check-workflow-stage.js \
  --record <active-review.json> --root run=<authorized-root> \
  --from S3 --to S4 --review-dir <new-check-directory>
```

失败返回 exit code 2，同时仍生成可读报告；禁止用 `&&` 的成功分支才保存失败报告。新目录父目录必须已经存在且为真实路径。renderer 保持只读；文件写入由同一 checker 的显式导出 API/CLI 负责。

## 不得夸大的验收结论

测试通过只证明被测试的文件级行为。还需在完整最新仓库验证现有协调者的调用接入、全部旧测试、真实 Calculator 文档迁移与引用，并让未了解 schema 的维护者执行“总览＋一个失败阶段”的实际读稿。真实桌面、新 Candidate Fresh Run 和业务 Qualification 不属于这些维护测试。
