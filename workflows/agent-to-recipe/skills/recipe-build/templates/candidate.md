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
