---
name: human-to-recipe
description: 将 OpenDesk Recorder 的固定 actions 包加工为可读生产 Recipe、独立资格 Gate 和分离 Evidence。用于人工录制后的语义提炼与生产化；不负责扩展 Recorder、猜测缺失业务意图或未经授权运行桌面动作。
---

# human-to-recipe

版本：0.4，2026-09-10。当前仓库提供 Skill 源码、`SemanticBuildPlan` schema、validator、静态质量 scorer 和 Calculator golden；通用 renderer 尚未实现。Skill 源码存在不表示已安装到当前 Codex 的用户级 Skill 目录，也不表示任何生成物已经 live verified 或 qualified。

## 输入与停止条件

开始前取得并固定以下输入：

- `repository/workdir`、`recordingDir`、`actionsFile`；
- actions 的 revision、readiness、调用方提供的 hash（若有）、raw reference；
- 可选 basic `scriptFile`／`candidateFile`；
- 用户明确给出的业务目标和成功条件；
- 允许的副作用、禁止触碰的对象；
- 应用、语言、布局和环境约束；
- 当前 `semanticStatus`、`semanticReason` 和 issues 的结构化摘要。

业务目标、成功条件或副作用授权缺失时，分别记录为结构化 `intent.resolution: unknown` 并报告具体问题；在用户回答前可以审计事实和交付 blocked plan，但不得生成生产 Recipe。没有动作授权时只做静态工作，不运行 Recorder、candidate、生产 Recipe、资格 Gate或任何真实桌面输入。

## 固定工作流

1. 阅读仓库 `AGENTS.md`、本 Skill、相关工作流文档和将要调用的 `docs/api/` 当前 API Reference。需要从 golden 恢复语义决定、形成/审阅 SemanticBuildPlan 或评估 production 质量时，完整读取 [金标方法论](../../design/golden-methodology.md)，先按其中 Calculator 案例与蒸馏闭环理解“为什么”，再查规则和工程门禁；详细方法只在该文件维护。修改前核对工作树，保留既有和并行修改。
2. 从磁盘读取 `actionsFile` 的实际字节，不信任 UI 内存摘要。计算 SHA-256；核对 revision、readiness、raw file/hash/bytes、action ID 和 source event ID。把 repository/workdir、recordingDir、actions 路径、hash 与可选 candidate 路径写入 plan。
3. 填写 JSON 前先写一份人类可读的“语义草图”：一句话目标、按控件/业务语言重述的动作序列、建议的 Episode 及前后状态、相对机械回放需要增加/删除/合并/改写的决定、尚未确认的问题。每项都要能指出来源。若离开 action ID 和 schema 字段就无法解释某个分组，不得用工程字段包装它，应保留 unknown。蒸馏 golden 时，先完成“actions 事实 → 设计问题 → plan 决定 → Recipe 消费者 → 验证方式”的账本，再修改 Skill/schema/scorer。
4. 每个 action 恰好归入一个 disposition：`business`、`runtime-guard`、`qualification`、`evidence`、`excluded` 或 `unknown`。建立 action → raw event → consumer 的 source map。遗漏、重复消费、冲突或任何 `unknown` 都是 production blocker。
5. 将连续低层业务动作整理为有业务目的和可观察状态转换的 Business Episode。名称使用用户业务语言；禁止以 `a0001`、`click1`、`action2` 等事件编号命名业务函数。单次示范不能证明的参数、分支、循环和业务规则保持 unknown。Business Episode 名称同时是运行时阶段提示的唯一业务语义来源，不再维护另一套手写“步骤文案”。
6. 分开记录：应用知识／业务规则；Target／Locator／Geometry；动作策略；运行时安全门禁；Qualification Oracle；Evidence。生产 Recipe 只消费已解决的生产输入。
7. 当应用认识或 locator 需要加固时，完整读取并遵循 `workflows/agent-to-recipe/skills/application-engineer/SKILL.md`。只接收其 `target`、`locator`、`geometry`、`actionStrategy`、`runtimeGuards`、`recoveryRule`、`qualificationClaims`、`sourceRefs` 和 `unknowns`；最终 plan、Recipe 和 Gate 仍由本 Skill 负责。
8. 先 exclusive-create `SemanticBuildPlan`，再依次运行 validator 和静态质量 scorer。schema 位于 [references/semantic-build-plan.schema.json](references/semantic-build-plan.schema.json)，validator 位于 [scripts/validate-semantic-build-plan.js](scripts/validate-semantic-build-plan.js)，100 分 rubric 与 scorer 分别位于 [references/semantic-quality-rubric.json](references/semantic-quality-rubric.json) 和 [scripts/score-semantic-build-plan.js](scripts/score-semantic-build-plan.js)。从仓库根目录执行：

   ```bash
   node workflows/human-to-recipe/skills/human-to-recipe/scripts/validate-semantic-build-plan.js <plan.json> --check-source
   node workflows/human-to-recipe/skills/human-to-recipe/scripts/score-semantic-build-plan.js <plan.json> [--output <exclusive-report.json>]
   ```

   只有 `valid: true`、`productionReady: true`、所有 hard gates 通过、总分 `>=95` 且每个关键维度达到最低分，才能进入生产生成。每个得分必须来自 scorer 返回的结构化 evidence；不得人工加分。Calculator 校准输入见 `workflows/human-to-recipe/golden-samples/calculator-115.semantic-build-plan.json`。
9. 通用 renderer 尚未实现。当前由 Agent 严格按同一 plan 生成：来源和正常命令注释 → 应用／布局常量 → 目标或控件表 → 安全 helper → 可选的非阻塞运行阶段提示 helper → 业务 Episode → 顶层业务顺序 → 简明完成结果。生成期间不得重新解释业务、补写 unknown、引入新 fallback 或覆盖已有文件；有冲突先停下并报告。
10. 前向样本与 golden 有差距时，按方法论的差距归因表决定修复位置：业务解释错误修方法/plan，规则未执行修 Skill 路由，plan 正确但代码漂移修 renderer，结构和来源错误修 validator，真实环境失败留给 application rule/qualification。不得把所有低分都转化成更多 schema 字段或 scorer 关键词。
11. 生产 Recipe 只保留业务步骤、决定本次控制流的状态判断、防止误操作所需的目标／权限／布局／边界门禁，以及不改变业务结果的运行可观察性。来源 hash、逐步固定 Oracle、截图矩阵和 evidence 写入独立 Gate／Evidence。
12. Qualification Gate 必须固定 production path/hash，并读取和执行该文件的实际源码；允许 instrument 现有动作边界以观察结果，不得维护第二份隐藏业务动作实现。候选变化后旧资格失效。

## 运行时语义阶段提示

阶段提示是 Human-to-Recipe 完成语义化后的可选可观察层。它回答“当前在做什么”，不能成为业务动作、成功 Oracle、恢复条件或 Evidence 的替代品。

- **提示粒度使用 Business Episode，不使用 raw event 或 action。** 一个 Episode 内的点击、输入、等待和有限恢复只更新同一阶段，不为每个低层动作弹一条消息。
- **提示文案单一来源。** 默认直接使用 `businessEpisodes[].name`；需要更改用户可见文案时先改 Episode 的业务命名并重新审阅，不额外维护容易漂移的 `toastText`／`stepLabel` 列表。
- **展示时机。** Episode 的 preconditions 通过、第一项业务副作用发生前更新“当前阶段”；只有最终成功条件实际成立后才显示整体完成。失败时显示当前 Episode 名称和非敏感错误摘要，然后继续抛出原业务错误。
- **进度只在语义成立时显示。** 顶层 Episode 顺序确定且本次都会执行时，可以显示 `当前阶段 i / n`；存在分支、可跳过 Episode、循环或动态子任务时默认只显示阶段名称，不从静态 Episode 数量伪造百分比。真实业务进度只能来自已验证的运行时数据。
- **提示不得控制业务。** 创建、更新、定位或关闭提示失败默认只写入 `console`，不得让本来可执行的业务失败、重试副作用或改变 fallback。只有用户明确把可见提示本身定义为业务交付物时，才另行把它作为需求和资格项处理。
- **能力按当前 Runtime 决定。** 生成前读取当前 `docs/api/custom-ui.md`。只有其中已经公开 `ui.notify()` 时才可生成该调用；若该接口尚未进入当前 API Reference，则保留同一 Episode 语义并使用 `console` 输出，不得把路线图名称写成可调用 API。
- **UI 授权保持现有规则。** `-ui` 可以显式授权；项目配置已经授权 `ui` 时无需重复传 `-ui`；`-no-ui` 始终强制禁用。脚本可以先读取 `ui.getCapabilities()`，UI 未授权或当前平台／host 不可用时走非阻塞 `console` 降级，不自行弹系统通知冒充同一表面。
- **一个运行尽量复用一个提示句柄。** 长任务创建一次持续提示，在 Episode 切换时原位 `update()`；整体成功／失败后给出短暂终态并关闭。不要逐阶段创建互相堆叠的 Toast 历史。
- **提示与业务来源映射分离。** 阶段显示由已有 Episode 派生，不新增 action disposition，不消费新的 source event，也不要求为了提示修改 `SemanticBuildPlan` v1。若未来需要用户可配置主题、位置或展示策略，再单独扩展 presentation 配置；不要污染业务语义 schema。
- **敏感数据最小化。** 默认只显示 Episode 名和有限计数；账号、文件内容、粘贴值、OCR 文本和异常堆栈不得直接拼进屏幕提示。
- **Recorder／截图隔离由 Runtime 负责。** Skill 不通过改写坐标或临时遮罩规避自有提示。若 Custom UI 支持录制／截图排除，应复用正式 Runtime 行为；不能因为提示可见就改变 Target/Locator/Geometry。

推荐生成形态是一个很薄的观察 helper，而不是业务框架：

```js
const runStatus = await createRunStatus({episodeCount: BUSINESS_EPISODES.length});
let currentEpisode = null;

try {
  currentEpisode = '打开订单详情';
  await runStatus.stage(1, currentEpisode);
  await openOrderDetails();

  currentEpisode = '填写发货信息';
  await runStatus.stage(2, currentEpisode);
  await fillShippingInfo();

  // 只有独立成功条件真正成立后才发布完成状态。
  await runStatus.success('任务完成');
} catch (error) {
  await runStatus.failure(currentEpisode, error);
  throw error;
} finally {
  await runStatus.finish();
}
```

`createRunStatus()` 只是生成代码中的薄 helper 名称，不是 OpenDesk 公共 API。其实现必须以当前 API Reference 为准：有已发布 `ui.notify()` 时复用一个原生提示句柄；否则只做 `console` 输出。不得为该 helper 创建第二套 execution、Replay Runtime 或隐藏业务流程。

## 语义缺失与定位边界

- AX label、role 或 identifier 不存在时保留 `unavailable`，不得从坐标、图标常识或相邻文字补造语义。
- WebView 先检查是否存在获准且可查询的 DOM／Browser 或 Accessibility 表面；Canvas、远程桌面和权限不足同样可以正常得到 `unavailable`。
- DOM／AX 不可用时，只能对获准窗口范围提出或执行定向截图、OCR、图像或人工标注补采。保留来源、范围、映射和未决项。
- OCR、图像和坐标只是有来源的 locator 候选，不自动成为业务事实。禁止 AX → OCR → 坐标 → keyboard 的静默 fallback；每条获准替代策略必须在 plan 中显式排序、限定失效条件并独立资格。
- 窗口或显示器相对点使用已实现的 `Geometry` API，并保留越界拒绝；不得长期输出 `win.x + offset` 样板。
- 代码只使用当前 `docs/api/` 已实现的方法。路线图名称、设计草案或 application-engineer 中的未来 helper 不得写成可调用 API。

## 交付与状态用语

至少交付 plan、生产 Recipe、独立 Qualification Gate、Evidence 位置和 source map；blocked 时交付可复核的 plan 与 blockers，不伪造代码。最终报告分别使用并解释：

- `generated`：工件已经产生，不表示审阅或运行；
- `statically reviewed`：schema、source map、API 和分层规则已核对；
- `synthetically verified`：只用 fake／fixture 验证可观察逻辑；
- `live verified`：在明确授权的真实环境执行过指定入口；
- `qualified`：冻结 production 源码通过预定独立 Gate。

普通用户命令、正式 Gate 和视觉证据分别报告。没有实际运行就写 `not-run`；synthetic、旧 hash 或模型自述不得升级为 live／qualified。
