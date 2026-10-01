# 执行与失败留档

适用自动化脚本工作流的全部阶段。S1—S12、唯一 checker、正式 request/handoff 和只读 stage-review 的责任不变。本页给协调者实际文件操作，用户不需要复制命令或指定内部阶段。

## 文件顺序

1. 保存原需求，固定正式 request、输入与授权。调用 Producer 前使用 `begin`，请求、输入快照和人读入口都必须存在。
2. 返回内容先使用 `capture` 原样落盘。失败、部分输出、截断或无法解析也保留；输出不能执行。无返回时只保存实际错误，不伪造 Actual。
3. 再适配为正式主产物、独立审阅记录和 handoff。失败 handoff 使用合同既有 `executionStatus: failed/interrupted`、`failures`、`unresolved` 与 `nextRequest`，不缩范围换 PASS。
4. 使用 `resume` 调用 `check-workflow-stage.js`，无论成败保存当次 report、实际文件和只读审阅；checker 允许且文件留档完整才更新下一正常消费点。
5. 原失败和原始字节保留。定向修复建立新 attempt，按真实 failure owner 继续；不覆盖旧文件，不重放 unknown 输入。

如果 Producer/宿主在返回前中断，已有 `started.json` 和 `attempt.md` 证明尝试入口存在，但**不证明动作没发生**。协调者补存实际中断诊断，核对副作用后再决定接续。`begin/capture` 只保存数据，不调用模型、运行脚本或授权动作；模型/桌面宿主必须把返回原文或实际错误交给 capture。它不是能拦截任意外部进程崩溃的后台 Recorder。

现有隔离 Producer broker（`tests/workflows/tools/isolated-producer.cjs`）也从发送准备开始建立文件入口。默认在解析前增量保存成功 HTTP 响应的原文：`wire-*/response.wire` 及 `response.diagnostic.json`；解析成功再生成 `producer-output.txt`。packet/route 预检失败、JSON/SSE 不合法、收到前缀后超时、尚未收到响应头就超时均有 `failure.json/.md`，不会改成一次模型行为 PASS。HTTP 错误正文、认证值与请求头不落盘；状态、允许的错误码与 hash 单独留档。该改动不改变限定模型路由，不发送新的模型请求，也不引入重试。

## 协调者命令

以下命令均从仓库根目录执行。示例 ID 与文件路径由协调者替换成当前任务的实际值，不能把示例当真实证据。

初始化默认 task root（`.runtime/automation-authoring/<task-id>/`）：

```bash
node workflows/agent-to-recipe/scripts/workflow-runner.js init --task-id <task-id>
```

Producer 开始前固定请求和输入：

```bash
node workflows/agent-to-recipe/scripts/workflow-runner.js begin --task-root .runtime/automation-authoring/<task-id> --stage S2 --attempt-id <unique-attempt-id> --request <fixed-request.json> --root task=<absolute-task-root> --root repo=<absolute-repository-root>
```

保存原始输出及实际错误（两项至少提供一项）：

```bash
node workflows/agent-to-recipe/scripts/workflow-runner.js capture --task-root .runtime/automation-authoring/<task-id> --attempt-id <unique-attempt-id> --output <raw-output.txt> --error-file <actual-error.txt> --root task=<absolute-task-root>
```

检查当前责任并保存结果：

```bash
node workflows/agent-to-recipe/scripts/workflow-runner.js resume --task-root .runtime/automation-authoring/<task-id> --record <active-review.json> --root task=<absolute-task-root> --root repo=<absolute-repository-root>
```

默认检查 `progress.currentStage → 下一阶段`，也可显式给 `--from Sx --to Sy`，非相邻工作包仍由 checker 验证；最终验收使用 `--final`，固定调用 `S12 → S12 --final`。Runner CLI 不授予 controlled consumer 执行权；涉及 S11/S12 受控执行时，仍由获准宿主按既有 descriptor/evaluator 机制接线，CLI 授权缺失会如实失败留档。

## 人工入口

```text
<task-root>/
  user-task.md                   原需求（由协调者保存）
  progress.json                  小状态索引
  stage-review.md                最新 checker 的只读投影
  last-check.md                  最近调用的文件入口
  attempts/<attempt-id>/
    started.json                 开始时间/阶段；非成功证据
    request.json                 原请求固定字节
    input-index.json + files/     取得的输入及缺失/hash 不符
    attempt.md                   尝试人读入口
    preparation-error.json       请求/输入获取失败时保存
    captures/<capture-id>/
      producer-output.txt         原始返回，可能不合法
      producer-error.txt          实际错误，有则保存
      capture.json                哪些实际收到/留档失败
    <专业主产物与 handoff>        保持共享合同
  checks/<unique-check-id>/
    invocation.json               入口与开始时间
    checker-options.json          实际检查入口及获准 roots
    record.json                   当次检查记录的固定字节
    checker-result.json           唯一 checker 原始结论
    stage-review.md               同版投影
    snapshot-index.json/.md       原 ref/hash → 当次文件或缺失
    files/                        当前检查实际 inputs/outputs/evidence
    entry-error.json/.md          入口或留档失败，有则保存
```

原始输出、日志、图像及文件快照只写 `.runtime/`，不提交。引用仅从调用方获准根读取，不扫描历史/未来答案或整个目录。快照有界，文件缺失、hash 不符或留档失败时停止依赖消费，保存真实缺项；文件恢复后重新运行 checker。

`checker-result.json` 的 `recordSha256` 绑定 checker 真正读取的记录字节；与留档记录不一致时不推进。快照只能证明这次留档收到哪些字节，不能证明历史动作、模型隔离、桌面结果或业务正确性。发现阶段与 failure owner 分开；blocking finding 的原责任必须附可核对的理由和 evidence，缺证据不能把发现者的失败转给上游。

接续时先读 progress 与 last-check/stage-review 首屏，再按失效边界取当前 attempt 和相关 evidence；不需要整份聊天或全部历史。磁盘写入本身不可用时，无法保证文件存在，入口必须显示留档错误并停止，不把“写入请求发出”当成完成。

## 当前 scope 预算留档与派发准入

`workflow-budget.js` 是 Node 24 的薄 Coordinator 文件工具，使用内置 `node:sqlite`；不修改 runner 的 begin/capture、共享 request/handoff schema、阶段或评分规则，也不执行模型、Runtime 或 ref 中的源码。它仅对已由宿主正式 adopt 的**当前 scope**记账。JSON 计划与 hash 绑定是数据校验，不是授权自身；工具不证明 adoption 来源真实、不授予 scope 权限、不自报 S1／Stage PASS。历史余额与历史准入缺证仍为 Unknown，新 ledger 不能追认旧派发。

CommonJS API 为 `init(config)`、`reserve(root, data)`、`settle(root, data)`、`status(root)`。以下参数属于工具内部数据 envelope，不是新增公开 schema 字段：

| 调用 | 最小数据与行为 |
| --- | --- |
| init | `scopeId / root / roots / limits / units / deadline / initialUsed / proposalRef / adoptionRef`。root 必须是仓库 `.runtime/` 内显式绝对目录；roots 是 `[rootId, absoluteDirectory]` 数组。limits 和 initialUsed 是以单位名为键的计数对象；必须包括 scopeElapsedMs、hostToolInvocations、modelRequests、publicApiCalls、nativeInputs、executionAttempts。units 对每项给出明确计数定义。deadline 是绝对 ISO 时间，不能超出剩余时间额度。 |
| reserve | `scopeId / attemptId / scopeCounters / requestRef / objectRefs / owner / ownerEvidenceRef`。scopeCounters 是本次所有实际派发资源的最坏有界预留，遗漏单位按零处理；各类 run slot 合计不得超过同时预留的 executionAttempts；host 必须正确映射调用单位、将工具记账开销与等待计入预算，不可把 publicApiCalls 当 hostToolInvocations。requestRef 指向真实共享合同 request；其 inputRefs、非空 contractRef 必须在 objectRefs 中。objectRefs 还须由 caller 完整列出实际投入的方法、计划、验收标准与依赖，不扫描目录。 |
| settle | `scopeId / attemptId / outcome / scopeCounters / evidenceRef`。outcome 为 success、failed 或 unknown；scopeCounters 是包含全部单位的累计实际资源，unknown 接续核对时不得减少已报实际值。evidenceRef 固定宿主实际资源与 terminal 证据。 |
| status | 只读事务返回 scopeCounters、remaining、inFlight、overruns、attempts、deadlineReached 与 lastReceipt。负余额明确保留；不创建或更新数据库。 |

所有 ref 使用既有 `rootId / path / sha256` 文件引用形式，来源必须在获准 roots 内，无 symlink 穿越，hash 对应实际字节。JSON ref 只作为 JSON 数据读取；JS 或其他投入对象只校验字节，不执行。每次 envelope 最大 256 KiB、每次最多 128 refs；单 JSON 4 MiB、单其他文件 64 MiB、累计读取 256 MiB。每 scope 最多 512 attempts、2048 events；整数计数有界且非负，不自动扩容或新开 scope。正常产物仅为 `<root>/scope-ledger.sqlite` 与 SQLite 事务 journal。

额度来自已固定的 proposal：limits 不得遗漏该 proposal 的资源／slot ceilings，也不得超过 proposedCeilings；proposal 已定义的 units 必须逐项一致，category slot 未给出单位文字时由宿主在 adoption 中明确其每次分配／失败也计数的单位（工具校验 run category 与 executionAttempt 的配套计数），initialUsed 至少保留 chargedCurrentDiagnosticEnvelope 及宿主追加的实际消耗。proposal 的重试／停止政策不是资源计数，仍由宿主执行。adoptionRef 必须指向宿主正式接受记录，其内部数据含 `adopted: true / host / authoritySource / adoptedAt / binding`；binding 精确等于 `scopeId / root / roots / deadline / limits / units / initialUsed / proposalRef`。adoptedAt 是真实接受时刻，作为持续时间起点，不能用当前调用时间掩盖已消耗等待。proposal 本身不能作为 adoption；宿主先核验授权来源、交叉 scope 限制与实际余额，再建立该记录，工具不代签、不制造该事实。已有 root 的 ledger 不得重新 init 或 reset。

ownerEvidenceRef 的内部数据为 `scopeId / attemptId / owner / terminal: true / sideEffectState: known / observedAt`；宿主必须证明真实人机 owner、旧执行／队列／输入均已 terminal。工具只校验该证据的绑定与时间新鲜度（scope 激活后且不超过 60 秒），无法用布尔值或 DB 锁证明真实 Desktop 排他。缺证据、旧证据或 unknown 即停止。settle 的 evidenceRef 同样包含 `scopeId / attemptId / owner / admissionSequence / outcome / scopeCounters / observedAt`；非 unknown 还必须证明 `terminal: true / sideEffectState: known`，时间不早于当前准入且不超过 60 秒。真实证明的取得与可信性属于 caller，不由此工具补造。

reserve 在 `BEGIN IMMEDIATE` 单写事务中核对 scope、重复 attempt、当前 deadline、共享余额、所有 reserved/unknown 在途项、过往超额与实际文件绑定；写入 reservation 和追加 receipt，在 `synchronous=FULL` 的持久 COMMIT 完成后才返回 sequence/hash。receipt 记录 before/after balance 与实际 refs。**caller 收到并核对这张 committed receipt 后才可 dispatch**，实际发送必须消费这些固定字节；收到 receipt 后文件变化或现场失效仍须停止。caller 保存独立 dispatch 关联并在实际证据中引用 admissionSequence，工具不自动拦截其他入口，也不证明真实发送顺序。进程在 reserve 后崩溃时，reservation 留在途，禁止盲重放。

settle 原子追加实际计数与剩余额度。采取保守策略：success／failed 均不返还未使用的预留，model/run/category slots 永不回补；失败须有 terminal 证明才退出在途，新尝试必须用新 ID。unknown 保持全额占用并阻塞下一准入，后续可信 terminal reconciliation 仍沿用原 reservation、累计实际值及追加事件。实际超出预留时持久记录 excess、overrun 与可能的负余额，不能通过回滚抹掉已用资源；任一 overrun 都停止后续派发，即使总额尚未耗尽。超额／deadline 后仍允许如实 settle。时间按 scope 激活以来的连续 wall elapsed 与已记占用的较大值计入，等待及并发只计一次；预留时间从当前可用余额全额扣除并保持消费高水位，settle 不返还这段预留。写操作保存时间高水位，时钟倒退拒绝准入／变更，不 reset。跨进程没有可携带的可靠 monotonic 时钟，宿主仍须用其真实计时、运行 cap 与取消能力约束运行中超额；数据库不能强制中止外部动作。

从仓库根目录使用以下一行命令；文件由 Coordinator 在获准 `.runtime/` 内生成、审阅与固定，路径为 caller 的实际值，示例不是当前任务 adoption：

```bash
node workflows/agent-to-recipe/scripts/workflow-budget.js init --data <absolute-init-config.json>
node workflows/agent-to-recipe/scripts/workflow-budget.js reserve --root <absolute-scope-root> --data <absolute-reservation.json>
node workflows/agent-to-recipe/scripts/workflow-budget.js settle --root <absolute-scope-root> --data <absolute-settlement.json>
node workflows/agent-to-recipe/scripts/workflow-budget.js status --root <absolute-scope-root>
```

同等 API 调用顺序为 `init(config)` → `receipt = reserve(config.root, reservation)` → 宿主核对并固定实际发送 → `settle(config.root, actual)`；`status(config.root)` 可随时只读查看。此顺序不取代 begin/capture 留档、独立 review 或唯一 checker。没有接入上述 receipt 消费协议的宿主入口不受本工具保护。

自身验证从仓库根执行 `node --test tests/workflows/workflow-budget.test.js`；fixture 仅在 `.runtime/tests/agent-to-recipe/completion-20261001/workflow-budget-fixtures/` 生成受控内部数据，不读业务案例或未来答案。语法检查使用 `node --check workflows/agent-to-recipe/scripts/workflow-budget.js` 与 `node --check tests/workflows/workflow-budget.test.js`。本轮证据位于 `.runtime/tests/agent-to-recipe/completion-20261001/workflow-budget-tests.log`；这些工具测试不是实际 scope 授权、Desktop、历史准入或阶段通过的证据。

## 宿主派发必须消费准入回执

`scripts/workflow-dispatch.js` 的 `dispatch(options)` 是可信 Node 宿主的薄适配层，将现有 begin/capture 与预算事务按顺序连接：先留存正式 request/input，再 reserve 并保存 committed receipt，重新核对实际投入字节，保存 dispatch 关联后调用宿主提供的 `execute`，原始返回先 capture，最后按真实 terminal/计数证据 settle。它不选择模型、不解析或执行模型输出、不评分，也不授予桌面权。

宿主显式提供 taskRoot、stage、scopeRoot/scopeId、roots、requestRef、owner、ownerEvidenceRef、counters 和可信 execute callback；callback 取得准入关联及同版输入字节，返回实际 rawOutput 或真实 rawError、actualCounters、terminal 和 sideEffectState。这些是内部宿主 envelope，不新增共享合同或 Runtime API。上游辅助修订可在任务仍阻塞于下游发现边界时留档；仅更新当前 attempt/work package 与最近文件入口，不改变阶段 verdict 或放行边界。正式推进仍由唯一 checker 完成。没有模型返回正文时，不把宿主诊断序列化成 Producer Actual Output。

隔离模型宿主发送前使用 `assertModelInputs({bodyText, requestRef, requiredBodyRefs})`，核对当前 request 正文、request.inputRefs/contractRef 的实际正文以及本次明确选中的必要 operative body 是否真的进入出站 packet；路径/hash 摘要不能代替正文。requiredBodyRefs 由当前专业作业的输入充分性选择，不递归装入全部历史、所有引用或未来产物。审阅预算交接时，例如明确装入实际 adoption/init/owner/terminal 的固定正文，并保留原始 ref 到 packet 同字节正文的映射。该检查只能证明实际交付的文本和工具隔离配置，不证明模型正确理解、内容真实或专家评分通过。

准入失败不会调用 execute。输入在准入后变化即停止。unknown 结果保留在途占用；宿主或留档抛错也不制造 terminal、不返还预算、不自动重试。callback 必须依据真实宿主结果报告状态；这个工具不能证明其他桌面拥有者已停止，也不能拦截绕过它的入口。实际桌面拥有权、权限和运行时上限仍须由调用方核验。

从仓库根执行 `node --test tests/workflows/workflow-dispatch.test.js`；受控 fixture 只写 `.runtime/tests/agent-to-recipe/workflow-dispatch/`。这些测试证明准入前拒绝、真实字节传递、原始输出留档及 unknown/崩溃阻止接续，不证明业务或桌面资格。
