---
name: recipe-qualify
description: Independently qualify a frozen Agent-to-Recipe Candidate at S12. Use for Fresh Run evidence, requested/exercised/qualified scope, final Recipe quality conclusions, and repair routing. Never modify the Candidate or success criteria to obtain a pass.
---

# Recipe Qualify

Qualify one exact Candidate and declared scope. This is the S12 professional method, not a new stage, CLI command, publisher, or runtime.


本方法的必需输入、实际读取、下游消费、拒绝和修复／复用样例见 [输入输出适用规格](references/io-spec.md)。开始作业时与本方法一起读取并固定各自实际内容版本；它不另建 schema 或评分规则。

## Required input

- Fixed TaskContract bytes/ref plus successCriteria / failureCriteria / stopConditions. Qualification must bind the exact contract, not only repeat its prose.
- Exact CandidateManifest, script bytes/hash, entry command, working directory, Procedure/AppProfile/API/dependency refs.
- Requested qualification scope and scenarios chosen before execution.
- Current environment/build identity, required permissions, allowed side effects, execution budget and test authorization.
- Existing evidence may be reused only when its exact Candidate, dependency versions, environment scope and validity conditions still match.

If the Candidate or a material dependency changes, stop and create a new Candidate/revalidation path. Do not patch code inside qualification.

## Method

1. **Freeze the object under test.** Verify the Candidate, script, dependencies, Procedure/AppProfile/API refs, requested scope, entry command and build provenance. Historical PASS does not silently transfer to changed bytes or a new environment.
2. **Plan the qualification before running.** For each requested criterion/scope, name the scenario, its `scopeRefs`, expected outcome, independent observation/evidence source, allowed side effects and stop condition. A scenario may support more than one scope, but a scope cannot become qualified merely because its name appears in `qualificationScope`. Expected values are Oracles, never production data inputs.
3. **Prepare a clean, attributable start state.** Separate preparation actions from the Candidate run. If prior side effects are unknown, do not replay the prefix merely to reach a desired state.
4. **Run the exact production entry when authorized.** Record the actual command, working directory, environment/build identity, Execution refs, action receipts and raw outputs. A Runtime/Framework success receipt proves only its own layer.
5. **Observe the business result independently where the criterion requires it.** Use a result source that does not supply values back into the Candidate. Preserve actual UI/business values, screenshots or other evidence according to the TaskContract; visual review and human acceptance remain separate states.
6. **Judge each criterion and scope explicitly.** Scenario states are `pass / fail / not-run / blocked`. Every scenario records nonempty `scopeRefs`; every qualified scope must be covered by at least one passing scenario with evidence. `qualificationScope.requested` may be reported as overall pass only when every requested item was exercised and has sufficient evidence to enter `qualified`; requested work may not be moved into `excluded` or silently omitted to obtain pass.
7. **Prove only the reuse claims actually requested.** One Fresh Run proves one execution. A repeatability claim needs at least two independently started Fresh Runs of the same frozen Candidate for the relevant scope. A parameterization claim also needs at least one legal input variation different from the demonstration values. If the Candidate contains LLM/Agent calls, verify they are predeclared bounded semantic decisions with schema validation; if an Agent again chooses each desktop click step-by-step, do not qualify that scope as an ordinary reusable Recipe.
8. **Produce the Recipe Review.** Review the exact Candidate from these evidence-backed dimensions: business correctness; actual UI/runtime data dependency; framework capability reuse; readability; parameterization; locator/stability; error handling; validation sufficiency; maintainability; reusability. Distinguish code risks from application/environment limits. Use the weighting in [validation-plan.md](../../design/validation-plan.md) only when the required evidence exists; score `not-evaluated` items as missing evidence rather than inventing points. A target such as 95/100 never overrides a failed criterion or missing live evidence.
9. **Publish without rewriting history.** Write the QualificationRecord, failedCriteria/skipped/repairRequests and an optional human-readable Recipe Review / Run Summary projection. Keep the frozen Candidate unchanged. Route Agent-source failures to the responsible stage: facts to demonstration, necessary-path errors to trace-distill, business/data semantics to procedure-synthesize, locator/application rules to application-engineer, implementation errors to recipe-build/code-rebuild, and Oracle/test-evidence defects remain in recipe-qualify. Human-source failures retain the original Human collection, review, engineering, code or qualification responsibility as specified in io-spec; never relabel them as Agent demonstration.

## 执行层级与真实复用检查

按 [validation-plan 的普通 JS 原字节执行与复用判据](../../design/validation-plan.md#普通-js-原字节执行与复用判据)选择实际可执行层级。读取后用常量、未等待输入完成、读值失败后继续副作用等问题，应通过执行固定生产字节暴露，不能只查 sourceMapping 或最终数值。宿主合成接口测试可作为部分检查，但不替代 Runtime、真实 UI、Fresh Run、合法输入变化或人类接受。

评估参数化时，核对实际公开入口、inputContract 和 Candidate hash；不要把 helper 参数、合成读值变化或改码后的另一份脚本当成同一候选的合法变参。原任务包不可读时仅审查获准源码及可用证据，明确缺失前提并返回补包，不从源码反造历史事实或发布完整资格。

## Output and acceptance

The authoritative machine-readable result remains the shared-contract `QualificationRecord` with exact `candidateRef / contractRef / scenarios / actualCommands / workingDirectories / executionRefs / buildProvenance / environmentScope / observedResults / evidenceRefs / failedCriteria / skipped / verdict / repairRequests / qualificationScope`.

A human-readable review should answer:

- Which Candidate and scope were evaluated?
- What actually ran, on which build/environment?
- Which business values came from real observations rather than expected values?
- Which requested scope is covered by which actual scenario/evidence?
- If repeatability or parameterization is claimed, which independent runs / changed inputs prove it?
- Did ordinary JS perform the deterministic desktop steps, and where (if anywhere) was bounded LLM/Agent judgment used?
- Which criteria passed, failed, were not run or were blocked?
- What score, if any, is justified by evidence, and what is outside that score?
- Which risks belong to code, the target application/environment, or missing verification?
- Is this exact Candidate ready for the requested use, or which responsibility receives the repair request?

Overall `pass` requires the shared QualificationRecord rules: exact Candidate and contract binding, unique scope declarations, and actual scenario coverage for every qualified/requested scope. A high code-review score cannot compensate for a failed or unrun requested business criterion. “Repeatable”, “parameterized” and “ordinary Recipe without Agent step-by-step control” are additional evidence-backed claims, not synonyms for one successful run.

## Existing tools and boundaries

- `check-artifact-chain.js` is a deterministic artifact-consumer check. It can reject broken Candidate/Qualification relationships but cannot grant live qualification.
- `tests/workflows/calculator/qualify.cjs` is a Calculator-specific real qualification harness and example of S12 evidence separation. It is not the generic recipe-qualify implementation or a new Runtime API.
- The method file can be read by the current Agent; its presence does not prove host auto-discovery, permission isolation, blind-context performance or model review accuracy.
- Qualification does not publish to Catalog, accept on the user's behalf, broaden platform/layout/input support, or turn historical evidence into current evidence.
- If the environment cannot execute the required formal Runtime/business test, record `not-run` or `blocked`; do not substitute Node mocks or static inspection and call it passed.
