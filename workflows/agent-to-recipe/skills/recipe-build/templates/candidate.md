# Candidate 构建模板

## Fixed inputs

TaskContract：<ref>
SemanticProcedure：<ref/hash>
AppProfile/rules：<refs>
API canonical：<refs>
Runtime entry/dependencies：<refs>

## Procedure → source mapping

| Business Step | sourceStepRefs | code region/helper | api/rule refs | inputs | outputs |
| --- | --- | --- | --- | --- | --- |
| <Bxx> | <Dxx> | <file:lines/function> | <refs> | <sources> | <values> |

## Runtime dataflow

| value | producer code | transform | consumer code | safeguards |
| --- | --- | --- | --- | --- |
| <value> | <actual return> | <allowed> | <actual call> | <type/validity> |

## Input contract

| parameter | validation | business consumer | default policy | unsupported behavior |
| --- | --- | --- | --- | --- |
| <name> | <...> | <Bxx/call> | <...> | <reject/...> |

## 已批准的应用操作与策略

本节投影已有规则与 Candidate 字段，不创建新 schema。单路径不要求策略参数；只有上游明确批准多路径时才展开。

| 操作/路径 | 固定上游与 API/helper | 实际代码区域 | 选择输入/适用条件 | 停止与切换条件 | 已检查/未检查范围 |
| --- | --- | --- | --- | --- | --- |
| <实际采用，不填设计意图当 API> | <ref/hash> | <函数/文件> | <硬条件；参数须获准且实际消费> | <未发出、unknown、partial、成功分别处理> | <真实检查和限制> |

封装选择：<内联/少量 helper/已有应用操作或 Adapter/有需要且受支持的模块>
选择理由：<真实消费者与维护需求，不为架构外观增加文件>
未验证候选：<留作缺口，不进入生产备用，不写大量注释备用代码>
S9/S10 一致性：<选择与规则精确引用一致；冲突返回原责任，漏交找协调者>

## 可复用操作合同与模块导入边界

本节是现有 sourceMapping、依赖及检查结果的投影，不强制增加模块。方法名和行数不能替代业务合同。

| 实际公开 helper/操作 | 固定业务合同与消费者 | 输入/输出与前后条件 | 失败、副作用及重试限制 | 实现/检查来源 |
| --- | --- | --- | --- | --- |
| <实际函数，不以拟议名字冒充实现> | <Business Step/operation refs> | <真实来源和完成条件> | <沿用批准规则> | <源码位置、证据或未检查> |

只有确需模块时填写：可复用模块导入后不得启动/激活应用、点击、输入、发送，或开始定时器/后台任务。依赖的初始化也须审查。模块顶层只做无外部副作用的定义与数据准备；执行集中在显式调用的方法或实际入口中，不能在顶层调用 `main()` 再让 Runtime 重复调用。

| 检查场景 | 实际对象与入口 | 预定期望 | 实际观察/证据 | 结论及证明层 |
| --- | --- | --- | --- | --- |
| 只导入可复用模块，不调用业务方法 | <同一源模块与依赖，独立无动作入口> | <没有业务/桌面副作用> | <不得填预期当 Actual> | <静态/受控测试/真实 Runtime 分开> |
| 原生产入口显式执行 | <冻结 production entry> | <业务只执行规定次数，顺序与错误传播正确> | <实际结果与入口依赖绑定> | <未运行保持 not-run> |

无动作导入检查不能替代原生产入口验收，也不计入 Calculator Fresh Run；Node 或 bundler 通过不能证明 OpenDesk Runtime。具体反例见[正确性检查](../references/validation.md)。

## Failure/side-effect control

<guards, unknown stop, bounded recovery>

<原动作是否仍在进行、已完成前缀、对账依据、安全接续点；暂未见结果不等于未执行；auto/手选不能绕过权限/取消/预算>

## Candidate freeze

scriptRef/hash：<...>
dependencies：<...>
entryCommand/workingDirectory：<...>
supported/excluded scope：<...>
limitations：<...>
revalidation impact：<...>

仅采用模块时：<源入口/静态依赖图/第三方依赖固定来源；loader/build provenance；实际 payload hash 与源 .mjs hash 分列；实际入口验证状态>

普通 JS 无需填写虚假的模块资料。占位符不代表已生成 hash、已发布引用或已运行；代码、helper、规则、策略配置或关键依赖变化不能继承旧 Qualification。
