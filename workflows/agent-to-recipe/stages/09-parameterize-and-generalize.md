# S9：参数化、有限泛化与过程交付

责任 Skill：[procedure-synthesize](../../../prompts/automation/agent-to-recipe/procedure-synthesize/SKILL.md)。这是从事实提炼进入程序工程化的正式交接边界。共同规则：[阶段约定](README.md)。

## 输入与进入条件

读取 S8 步骤草案、S7 分析、冻结合同、S6 的实际输入／运行时值和适用 AppProfile；接续链同时读取逐步代码映射及继承证据等级。不得把样本里的全部字面量直接升级为常量，也不把既有代码里的全部常量变成用户参数。

## 本阶段要做的事

对字面量和依赖分别归类：Input、Config、Secret 引用、Runtime Value、业务不变量和临时执行值。给出类型、格式／单位、默认值、限制、数据来源、消费者、敏感级别及失效条件。

运行时读取值必须在未来相应步骤重新取得；示范值用于解释和测试，不是生产答案。窗口句柄和坐标不能固定复用，Secret 不进入源码和交接明文。

只把有任务规则或证据支持的条件、循环、重试和恢复写成过程规则。未验证分支列为假设／不支持或提出定向示范请求；单次重复尝试不是业务循环证据。

每个参数来源、业务不变量、控制规则和支持范围都回指相应代码到业务映射，并保留或降低其证据等级，不能无新证据升级。仅由代码推断的正常分支不得包装成已实测能力；事实 dossier 覆盖不足时缩小 supportedScope 或保留 unresolved。这样可以交付证据有界的接续过程，但不能标成完整新示范提炼。

将过程所需但仍不足的定位、等待、观察和失败能力列为工程化缺口，指向具体操作，不要求重建整个应用 Adapter。

## 必须保存的输出与消费者

发布 `procedure.json`：业务 steps、参数与来源、dataDependencies、preconditions／postconditions、verifiers、supportedScope、unresolved、evidenceRefs 和 applicationGaps；关联 S7／S8 的代码映射和证据等级，最后按共享合同发布实际范围的 handoff。

[S10](10-harden-application-operations.md) 消费明确能力缺口；[S11](11-build-javascript-recipe.md) 消费完整业务过程和适用应用能力。不把本文件变成 Runtime 要解释的 Workflow／Skill IR。

## 通过、阻塞与回退

变量来源清楚、真实值消费关系保留、支持范围与逐项证据等级一致、没有影响声明路径的未决业务问题时通过。接续范围的 pass 不能升级为完整新生成过程 pass。过程结构错误返回 S8，来源不清返回 S7／S6，业务合同变更返回 S1。

## 下一阶段与最小验收

进入 S10 的能力适用性检查。检查：改变合法业务输入后，规则不依赖示范答案；Secret、示范值和短期窗口数据不会被误写成长期业务常量。
