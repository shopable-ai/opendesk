# 阶段人工诊断：仓库接续与验收边界

## 本次交付状态

本次直接更新现有 checker 和 renderer，并加入三种版本化失败输入、六份输出快照、维护测试、报告生成入口及 Calculator 正文迁移器。不是另建 Workflow、checker 或评分体系。

本次修改以 master `877c852acca28b4658d01fd727b37b883b4792d1` 为核对基线；正式提交号以包含本文件的 Git 提交为准。原历史 Execution、成功标准、R1—R8、requested scope 均未改写。没有启动 Calculator、OpenDesk Runtime、模型派发、Candidate 执行或新的 Fresh Run。

## 已实际验证

在固定源码副本上执行：

- `node --test tests/workflows/stage-review-diagnostics.test.js tests/workflows/calculator-stage-doc-migration.test.js`：27 项通过。
- `node --test --test-skip-pattern='accepted alternate representations' tests/workflows/stage-review.test.js`：10 项通过；依赖完整 artifact-chain 的用例未执行，不算通过。
- 原 workflow-stage 中四个归属用例的修订版本被单独提取运行：4 项通过。这不是完整原测试文件的通过记录；提取文件未作为第二套测试实现入库。
- 使用 `node tests/workflows/tools/render-stage-diagnostic-fixtures.js <新的输出目录>` 实际生成三个报告包，逐字与版本化快照比较，并检查相对链接。每份入口为44行，只生成已检查阶段详情。

以上是文件级维护结果，不是完整仓库回归、真实业务 Qualification、独立人工可读性验收或专家95分认证。

## 下一轮必须关闭的缺口

### 1. 既有协调者的发布与接续

`workflow-runner.js` 仍使用旧的报告发布调用。新 `renderWorkflowReview` 只返回简短总览；协调者尚未改接 `writeWorkflowReviewBundle`，不能声称正常 resume 已发布全部单阶段文件。

接入时使用同一次 checker 结果和其固定字节，失败也必须发布报告。保护历史检查与当前指针，避免并发覆盖或旧 PASS 冒充最新状态。注意 `deriveResume` 原来会把无效边界直接转成 targeted-repair；必须改为在 owner 未确定时给出取证接续，不自动修复/派发；运行权限不得由报告隐式授予。

### 2. 原测试的语义兼容与完整回归

原 `workflow-stage.test.js` 仍有四个用例沿用“边界等于已证明 owner”的旧断言：missed-check ownership、later S11 finding、noncompliant reference aspect、blocking final finding。它们尚未在原文件中修改，不能声称全套兼容。应保留失败阻断与上下游失效断言，显式绑定 firstInvalidBoundary 的当前输出；在只有声明与引用时断言 Owner UNKNOWN。missed-check 声明须保持独立且未证实。

同文件末尾的 Markdown CLI 用例还预期旧标题与根报告展开 `## S7`，需改为检查紧凑总览、同次 S07 文件、有效链接和未检查阶段不生成。不得通过恢复错误归属、削弱业务条件、删掉 requiredTests 或盲目更新全部快照使测试变绿。

完整运行涉及的既有维护测试，先区分纯 fixture 检查和会执行 Candidate/Runtime 的路径；本轮继续不授权真实桌面或 Candidate Fresh Run。任何跳过项必须单独报告。

### 3. Calculator 实际正文迁移

迁移器已经实现并通过合成文档测试，但真实 `calculator.md` 尚未迁移。先核对当前正文，移动现有十二阶段正文、保持旧锚点；R1—R8 原文独立保存、不维护两份。同步产物地图与读取入口，检查旧链接、相对路径和代码块。源码已有变化或目的文件已存在时不能强行越过迁移器的版本保护。

### 4. 两页排错验收

实际打开生成的根报告和一个失败阶段，逐项回答：必须成立什么、本次 Actual、第一处不一致、发现阶段、无效边界、已证实/未知责任、可保留上游及唯一下一动作。三个受控反例均须通过。作者自查、测试通过不等于不熟悉 schema 的独立维护者已经读懂；没有这种独立读稿就明确保留该未验证项。

## 接续原则

下一轮是在已有源码上完成接入、定向修复和验收，不是重新设计 S1—S12。以实际生成的报告和固定输入为依据；不依赖旧聊天、下载包或自报评分。诊断数据模型及使用方法见 [stage-diagnostics.md](stage-diagnostics.md)。
