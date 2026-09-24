# QualificationRecord 工作模板

## Frozen object

Candidate/ref/hash：<...>
Dependencies：<...>
TaskContract/ref：<...>
Environment/build：<...>
Entry/workingDirectory：<...>
Requested scope：<...>

## Predeclared scenarios

| scenario | input | scopeRefs | expected/oracle | independent observation | side effects | stop |
| --- | --- | --- | --- | --- | --- | --- |
| <Sxx> | <...> | <scope> | <...> | <source> | <...> | <...> |

## Actual executions

| scenario | actual command | executionRef | observed result | evidence | status |
| --- | --- | --- | --- | --- | --- |
| <Sxx> | <...> | <...> | <...> | <...> | pass/fail/not-run/blocked |

## Scope coverage

Requested：<...>
Exercised：<...>
Qualified：<...>
Excluded：<only predeclared/non-requested allowed exclusions>
FailedCriteria：<...>
Skipped/not-run/blocked：<...>

## Claim evidence

One Fresh Run：<refs>
Repeatability：<>=2 independent fresh runs or not claimed>
Parameterization：<different legal input via same Candidate/inputContract or not claimed>
Ordinary Recipe：<no step-by-step Agent control / bounded semantic calls if any>

## Verdict / repair

Verdict：<shared-contract state>
RepairRequests：<responsible stage + exact failure + affected scope>
Human acceptance/publish approval：<separate if required>