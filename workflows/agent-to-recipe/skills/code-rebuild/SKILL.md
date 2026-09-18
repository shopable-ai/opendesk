---
name: code-rebuild
description: Review and minimally improve an existing OpenDesk JavaScript candidate against fixed requirements and evidence. Use for S11 code quality, data-flow, API, reliability, maintainability, or a justified no-change decision. Do not invent missing business meaning, application rules, observations, or qualification results.
---

# Code Rebuild

Review an exact code baseline. Keep it unchanged when it already meets the requested scope; rebuild is optional and evidence-driven.

## Required input

- Exact script and helper refs/hashes, entry command, working directory, dependencies, and current CandidateManifest if one exists.
- Fixed TaskContract and SemanticProcedure, with the requested improvement goal and allowed change scope.
- Relevant AppProfile/operation contracts and canonical API references.
- Existing qualification only as evidence bound to its old candidate. It never transfers automatically to changed bytes.

## Method

1. Freeze and identify the baseline. Separate observed behavior, source-code structure, test expectations, limitations, and unknowns.
2. Map each Business Step and runtime data dependency to the responsible function or source region.
3. Review, in order: business/data correctness; safety and side effects; current API use; asynchronous sequencing and bounded failure; function contracts; maintainability; unnecessary complexity.
4. Confirm that each runtime value is assigned from its producer and passed to its consumer. Reject code that reads `firstResult` but later uses a demonstrated `110`, even if the final output is `660`.
5. Record each finding with location, evidence, impact, decision, and verification. Make the smallest supported change; permit `baseline-retained` when no material change is justified.
6. If bytes or dependencies change, create a new CandidateManifest and define the affected revalidation scope. Never relabel an old Qualification as current.

## Output and acceptance

Return either:

- `baseline-retained`: exact refs/hashes, mapping, review findings, checks, score scope, limitations, and why no change is justified; or
- `candidate-revised`: new refs/hashes, changes and reasons, affected requirements, checks, and required requalification.

Use the five-dimension scoring method in [validation-plan.md](../../design/validation-plan.md). A hard correctness or evidence failure cannot be averaged away. Run `check-artifact-chain.js` when its supported Calculator-shaped S7→S12 slice is available. Its pass checks selected byte bindings, declarations and a direct await/spread source pattern; it does not prove reachability, aliases, shadowing or arbitrary JavaScript correctness. Review those separately. Live Qualification, visual review, host Skill loading, and human acceptance remain separate.

Detailed code review guidance is maintained in [code-rebuild.md](../../design/code-rebuild.md); do not copy it into a second checklist here.
