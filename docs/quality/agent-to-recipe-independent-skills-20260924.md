# Agent-to-Recipe 第一批 Skill 独立内容审阅｜2026-09-24

## 范围、基线与证据级别

本轮只完善 application-engineer 和 trace-distill。基于实际读取的 master `6c6c5b0a6bd343e08d26f99b6ca0c479add4808c`；application-engineer 单独提交为 `9796b1c149d0edc6ba8cb5a598adfb8c86f950c9`，本报告与 trace-distill 修改一同提交。后续 Skill 不在本批修改范围。

未修改总 Workflow、S1—S12、共享 schema、Runtime、业务 JS、原始 fixture 或历史 Qualification。原 application-engineer/scripts/review.py 和两个 index.md 保留。io-spec.md 变为兼容导航；原应用专项方法保留在 operating-guidance.md 和既有专业正文中，不通过删掉专业约束来简化入口。

本报告是修改者对每个 Skill 的**方法/文档独立可用性自审**，不是另一名评审者、独立模型、真实桌面或冷上下文执行的实测分数。七项各 0—100、等权，均分只属于对应 Skill；不计算整个 Workflow 的综合分。分数不代表成功概率，不写入 Gate、progress 或 QualificationRecord。

实际完成：读取固定源版本、逐项内容/合同核对、Calculator 原 fixture 动作和消费者对账、正反场景推演，以及 GitHub 提交范围核对。当前容器不能解析 github.com，未取得可执行仓库副本；没有运行 Node/Python 回归、模型 Producer、独立上下文或 macOS 真机验收，不作上述通过声明。既有质量报告的历史通过不移植到本轮。

## application-engineer

入口：[SKILL.md](../../workflows/agent-to-recipe/skills/application-engineer/SKILL.md)。

### 修改文件与原因

以下路径相对 `workflows/agent-to-recipe/skills/application-engineer/`。

| 文件 | 修改原因 |
| --- | --- |
| SKILL.md | 将 S2 discover、S10 harden、失败驱动 repair 的输入、问题、交付与不负责项明确分开；入口按四项规格导航 |
| references/input-spec.md | 规定每模式最小充分输入、授权/预算、证据适用性和进入判定；discover 不要求未来 Procedure/JS |
| references/output-spec.md | 固定唯一 Profile、操作交付字段、同版审阅/验证和各下游的真实消费条件 |
| references/validation.md | 给出来源、关系、几何、规则、失败停止和消费者审阅的反证；限制脚本 PASS 的含义 |
| references/failure-handling.md | 按事实/取舍/语义/规则/代码/验收精确返回；未知副作用不盲重放 |
| references/operating-guidance.md | 承接能力发现、多模态提取、Collection、Geometry、Recorder/Human 及权限的专项约束 |
| references/io-spec.md | 保留旧链接，只导航新正文，避免两套规格漂移 |
| references/independent-review.md | 将本 Skill 审阅与整个链路资格分开 |
| examples/calculator.md | 展示任务→认识问题→观察→主张/未知→交付，并分别演示 harden 和局部 repair；拒绝从 JS 倒造 S2 |
| templates/app-profile.md | 让新应用可以按问题、观察、主张、字段、审阅和下游清单生成同类成果 |
| templates/operation-rules.md | 让已确认过程可逐操作补输入输出、定位、读取、等待、门禁、失败与维修影响 |

### 独立评分

| 维度 | 分数 | 本轮依据 | 扣分项/未证实部分 |
| --- | --- | --- | --- |
| 方法正确性 | 97 | 三模式由输入与缺口选择；观察到主张、规则到验证均有来源要求 | 多来源冲突的复杂实务仍依赖专业判断，本轮未做新模型操作评测 |
| 输入输出完整性 | 96 | 每模式进入条件与 Profile/操作/交接的最小字段和缺口均明确 | 复杂旧版资产适配仍需共享合同和具体消费者核对，不是通吃任意文件的自动转换器 |
| 责任边界清晰度 | 98 | S2/S10 与事实、取舍、语义、代码、资格职责分离，Human 来源不混用 | Collection/Runtime 专项仍需沿明确链接读取，不能只看入口理解全部实现细节 |
| 失败处理能力 | 96 | unknown/partial 先查效果；精确 nextRequest、局部修订与影响重验 | 未在真实非幂等动作上执行失败注入，安全规则的文档完备不等于实测保证 |
| 案例解释能力 | 96 | 三模式均有输入/处理/输出/反例；当前可见 0 与执行过清空分开 | C-OBS/C-RULE 是显式教学条件，不是本轮附有原图的真实执行包 |
| 下游消费能力 | 96 | 逐消费者说明实际交付、禁止推导、Profile/helper 冻结及同版视图 | 未由另一个冷上下文执行者真实消费此修订并完成任务 |
| 可复制到其他应用 | 95 | 两个应用无关模板；窗口尺寸、按钮和清空约束留在案例范围 | 迁移方法已给出，尚未用第二个真实应用验证本轮模板 |

**本 Skill 均分：96.3/100（674/7）。** 这是内容审阅达到目标，不是对应模型/桌面能力已获 95 分以上资格。

### 逐项反例推演结论

仅给最终 JS：不能宣称 discover 已观察；应列认识缺口。仅有无屏幕映射截图：可作限定认识，拒绝坐标点击。已确认过程只缺读取/等待：定向 harden，不重做业务。规则已覆盖：复用原版，不强制改动。提交超时且效果未知：先停输入查效果，不换 backend 重复提交。参数错误：保留有效定位规则，交 S8—S9/S11 对应责任。这些是内容推演，不是真机测试记录。

下一 Skill：trace-distill；其结果单独如下，不借用本 Skill 得分。

## trace-distill

入口：[SKILL.md](../../workflows/agent-to-recipe/skills/trace-distill/SKILL.md)。

### 修改文件与原因

以下路径相对 `workflows/agent-to-recipe/skills/trace-distill/`。

| 文件 | 修改原因 |
| --- | --- |
| SKILL.md | 明确事实核对、状态/数据依赖、五种取舍、无损合并、完整运行时值与定向交接的方法 |
| references/input-spec.md | 明确 Raw Trace/Dossier/观察/政策/应用关系的进入条件，区分 planned/actual/expected/observation/runtime value/consumer |
| references/output-spec.md | 固定 DistilledSteps、每动作取舍、来源双向覆盖、逐消费者绑定与 S9 实际取得材料 |
| references/validation.md | 给出首读、二次准备、重复输入、终点、合并、恢复等反例及现有检查器覆盖界限 |
| references/failure-handling.md | 区分漏交材料、缺事实、缺政策、缺关系、错投影与错语义；保留失败和安全复用规则 |
| references/io-spec.md | 兼容导航，不并存另一套输入输出正文 |
| references/independent-review.md | 七项独立检查及关键缺陷不得评为达标的条件；区分自审与实测 |
| examples/calculator.md | 对照真实仓库 synthetic fixture 的 A001—A010/D010—D060，逐动作解释取舍、数据链、反例和另设的教学练习 |
| templates/distilled-steps.md | 为新应用提供事实对账、取舍、步骤、运行时值/消费者、恢复与明确交接模板 |

### 独立评分

| 维度 | 分数 | 本轮依据 | 扣分项/未证实部分 |
| --- | --- | --- | --- |
| 方法正确性 | 97 | retain/merge/omit/recovery/unresolved 各有条件；合并保持次数与因果，恢复不能拼出无前提成功路径 | 必要性是有据专业判断，不是一般轨迹的形式化最优证明；复杂分支尚无本轮实测 |
| 输入输出完整性 | 97 | 原事实三方核对、全消费者枚举、正式字段、终点值和真实交付包齐备 | 旧字符串 origin 与新结构的适配必须逐来源核对，示例不能替代完整真实包 |
| 责任边界清晰度 | 98 | S7 拥有历史取舍；S8—S9 拥有业务解释/复用；不从代码或标准产物反推 | 跨来源补证仍需协调者明确实际交付，非 Skill 文件自身可强制隔离 |
| 失败处理能力 | 96 | 精确返回事实/政策/关系/投影责任，未知效果停止，输入不变才复用 | 恢复练习为教学条件，尚未做本轮真实复杂恢复轨迹/失败注入 |
| 案例解释能力 | 97 | 原动作→取舍→D 步骤→首值生产/字符消费→终点完整；三项关键误删都有反证 | 原 fixture 是合成有限切片；merge/omit/recovery 另作显式假设，不是历史事实 |
| 下游消费能力 | 97 | 每原 consumer 的 transform/observedInput 独立保存，S9 不靠全量历史补猜 | 本轮未运行分离上下文的实际 S7→S9 Producer 交接 |
| 可复制到其他应用 | 95 | 通用模板、0040 双消费者、无输出动作/等待/安全/终点处理和覆盖缺口均明确 | 已有自动检查器只覆盖有限顺序切片；金额/分支/循环/同一步读后用需对应审阅和测试 |

**本 Skill 均分：96.7/100（677/7）。** 不把确定性检查器既有覆盖或 Calculator 整链历史得分加到本次评分。

### 逐项反例推演结论

删 firstResult 读取：真实生产者丢失，S7 应拒绝。按同名删除第二清空：第二段状态前提无据，保留而不泛化为所有应用必须清空。输入 1,1,0 去重：次数/数位改变，即使父 actionId 保留仍应拒绝。把最终读取删除：final output 是合法消费者，不能删。合并两个消费者只留一种 transform：逐绑定不完整。把恢复移走后拼接依赖它的成功尾部：前提不成立。副作用 unknown：先返回核对，不判成功或未发生。只有 S9 漏交已有选择记录而 S7 输入/方法未变：重检并复用 S7 原字节。

上述结论来自逐项内容审阅，不是运行通过的测试报告。未用代码推导历史、未改源 fixture，也未将合成值标记成新真实观察。

## 下一批入口

下一 Skill 为 task-demonstrate，重点检查 planned/actual/expected/observation/runtime value/consumer 和实际执行证据；随后是 procedure-synthesize。本轮不先行修改这两个 Skill，也不把它们视为已完成。recipe-build、recipe-qualify 保持后续批次。没有给整套 Workflow 综合评分。
