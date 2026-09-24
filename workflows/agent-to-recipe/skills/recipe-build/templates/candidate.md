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

## Failure/side-effect control

<guards, unknown stop, bounded recovery>

## Candidate freeze

scriptRef/hash：<...>
dependencies：<...>
entryCommand/workingDirectory：<...>
supported/excluded scope：<...>
limitations：<...>
revalidation impact：<...>