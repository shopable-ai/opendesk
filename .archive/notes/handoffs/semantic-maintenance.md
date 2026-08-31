你现在不是来重新讨论桌面自动化的大方向，也不是来复述高层战略。你是在一个已经推进到“semanticexec 最小运行链路已落地”的真实仓库里，继续把工程做深做稳。

你现在扮演：
- 顶级桌面自动化系统架构师
- AI-native agent 平台设计师
- 实施规格总工
- repo 落地主程
- 反方审计专家
- benchmark / 运维治理专家

强制要求：
1. 全程中文。
2. 不要回到泛泛架构层。
3. 不要重复已经确认的大方向结论。
4. 必须先基于当前仓库真实结构做 repo-grounded delta diagnosis，再行动。
5. 必须把任务拆到接近文件、模块、函数、测试级别。
6. 必须继续模拟 3 位专家多轮攻防：
   - 桌面自动化架构专家
   - 平台工程 / DevEx / 运维治理专家
   - benchmark / 质量 / 审计专家
7. 每轮都必须包含：
   - 给分
   - 反方攻击
   - 盲区审计
   - 修正方案
   - 再评分
8. 如果总分 < 93，不允许结束，必须继续优化。
9. 如果 benchmark 可落地性 < 8/10、false-success 防御力度 < 8/10、operator 可维护性 < 8/10、接口稳定性 < 8/10，也不允许结束。
10. 必须避免过早停止。只有满足以下之一才允许停止：
   - 总分 >= 93，且没有关键单项低于阈值
   - 或连续 2 轮优化增益都 <= 0.5 分，并明确说明剩余问题属于真实实现阶段验证项，而不是当前设计缺陷
11. 你不能只说计划，必须真实使用工具继续落文件、写代码、跑测试、验证结果。

当前仓库不是空白仓库。你必须先读取并理解这些已存在的真实成果：

一、已落地的核心代码与资产
1. semanticexec core contract 已存在：
- pkg/semanticexec/types.go
- pkg/semanticexec/status.go
- pkg/semanticexec/verify.go
- pkg/semanticexec/mock_runtime.go
- pkg/semanticexec/fixture.go
- pkg/semanticexec/comparator.go
- pkg/semanticexec/lifecycle.go

2. semanticexec 测试已存在：
- pkg/semanticexec/status_test.go
- pkg/semanticexec/verify_test.go
- pkg/semanticexec/mock_runtime_test.go

3. benchmark smoke 骨架已存在：
- pkg/benchmark/semantic_smoke.go
- pkg/benchmark/semantic_smoke_test.go

4. fixture 已存在：
- tests/semantic-exec/fixtures/scenarios/browser_backoffice_happy_path.json
- tests/semantic-exec/fixtures/scenarios/native_permission_blocked.json
- tests/semantic-exec/fixtures/scenarios/canvas_partial_success.json
- tests/semantic-exec/fixtures/scenarios/false_success_save_without_persist.json
- tests/semantic-exec/fixtures/scenarios/degraded_evidence_inconclusive.json
- tests/semantic-exec/fixtures/expected/*.expected.json

5. 维护层已有初稿：
- pkg/operator/semantic_maintenance.go
- pkg/operator/semantic_maintenance_test.go

6. 规格文档已存在：
- docs/implementation/semanticexec-core-skeleton.md

二、你必须先验证的当前状态
你必须先用工具检查：
1. 这些文件当前是否真实存在
2. 当前 `go test ./pkg/semanticexec ./pkg/benchmark ./pkg/operator -v` 是否通过
3. operator 层当前是否还有编译错误、未接好的依赖、或维护语义不完整
4. 当前 smoke suite 是否已经完整覆盖：
   - succeeded
   - blocked
   - degraded
   - partial
   - false_success_suspected
5. 当前 lifecycle.go 是否只是占位，还是已经足够支撑首批治理流程

三、当前阶段最应该优先推进什么
你必须先判断并明确：
当前在这个仓库状态下，最优先推进的是不是：
1) operator / maintenance 首批机制
2) lifecycle 最小治理 contract
3) semantic smoke 命令入口
4) adapter_execution / adapter_visionrun
5) failure-mode 扩展
还是其他更高优先项

不要凭空判断。必须结合仓库现状给出排序与原因。

四、当前最可能正确的主线（仅作为初始假设，不可盲从）
大概率当前最优先项已经不是 mock runtime，也不是 benchmark-first，而是：
- operator / maintenance 首批机制
并补齐：
- degraded case 资产
- lifecycle 最小治理 contract
- maintenance runbook / triage taxonomy
- semantic-maintenance 命令入口

但你必须自己验证这个判断是否仍成立。

五、你本轮最应关注的 P0 缺口
你必须重点审计这些是否仍未完成：
1. operator / maintenance 机制是否只是代码初稿，尚未形成完整治理入口
2. lifecycle 三态是否过薄，是否还缺最小 promotion / deprecation 规则
3. semantic smoke 是否缺少命令入口、脚本入口、运行报告落盘
4. degraded outcome 是否虽有 fixture，但维护侧未审计
5. fail_expected 是否只在 benchmark 生效，未进入 maintenance audit
6. current repo 是否缺少 docs/implementation/semantic-maintenance-runbook.md
7. 当前 triage taxonomy 是否缺失或过弱：
   - coverage_gap
   - expected_contract_mismatch
   - false_success_regression
   - schema_version_drift
   - lifecycle_policy_gap

六、你的任务
你这轮要做的不是讲述方案，而是继续落地，目标优先级建议如下：

P0-A. 把 operator / maintenance 做成真实可运行的首批治理层
至少应考虑：
- 完善 pkg/operator/semantic_maintenance.go
- 完善 pkg/operator/semantic_maintenance_test.go
- 增加 cmd/semantic-maintenance/main.go
- 增加 docs/implementation/semantic-maintenance-runbook.md

P0-B. 把 lifecycle 最小治理 contract 做到可用而不是占位
至少应考虑：
- promotion 条件
- deprecation 条件
- false-success / blocked 对 lifecycle 的影响
- verified 的最低标准

P0-C. 把 benchmark / maintenance / lifecycle 串成最小治理闭环
至少应考虑：
- smoke suite 输出是否能被 maintenance 消费
- fail_expected inventory 是否可审计
- degraded / partial / blocked / false-success 是否都能进入治理结论

七、输出要求
你的输出至少必须包含：
1. repo-grounded delta diagnosis
2. 当前阶段最优先推进项
3. 顶层实施结论
4. 本轮实际改动的文件清单
5. 每个文件职责
6. 测试方式与结果
7. 后续 top 10 缺口
8. 多轮专家攻防
9. 最终评分
10. 为什么现在可以停止或为什么还不能停止
11. 下一步最应该先写的文件顺序

八、评分维度（总分 100）
一、设计/实现质量
- 可编码性 15
- 模块边界清晰度 10
- 接口稳定性 10
- 状态机可实现性 10
- 数据结构完备性 10

二、验证/测试质量
- benchmark 可落地性 10
- 失败模式覆盖准备度 10
- false-success 防御力度 10

三、工程/运维质量
- operator 可维护性 10
- 资产生命周期可治理性 10
- 本轮范围控制度 5

九、关键提醒
1. 不要满足于“看起来完整”。你必须主动寻找薄弱点。
2. 不要只写文档。必须继续真实写文件、改代码、跑测试。
3. 不要默认当前 operator 代码就是对的；要审计它是否只是初稿。
4. 如果你发现之前的设计包或已写代码有工程上不适合落地的地方，不要迎合，必须直接指出并修正。
5. 本轮最有可能的正确动作是：先收 operator / maintenance / lifecycle，而不是继续扩 runtime 功能面。

十、建议你开场先做的工具动作
1. 读当前已存在的 semanticexec / benchmark / operator 文件
2. 跑 `go test ./pkg/semanticexec ./pkg/benchmark ./pkg/operator -v`
3. 如果 operator 未通过，先修 operator
4. 然后补 cmd/semantic-maintenance/main.go 与 runbook
5. 再做专家攻防、复评、继续修正
