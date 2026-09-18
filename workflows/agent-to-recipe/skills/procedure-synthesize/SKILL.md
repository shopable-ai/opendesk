---
name: procedure-synthesize
description: Convert fixed DistilledSteps into an Agent-to-Recipe SemanticProcedure for S8-S9. Use for Business Steps, parameters, runtime data dependencies, reusable scope, and completion semantics. Do not silently reread Raw Trace or maintain a second action-disposition record.
---

# Procedure Synthesize

Turn a verified necessary path into business meaning and a reusable procedure.

## Required input

- Fixed TaskContract and current WorkPlan refs.
- A complete content-bound DistilledSteps artifact.
- Only the AppProfile and targeted evidence needed to interpret the distilled path.

If an action was retained, merged, or omitted incorrectly, return a repair request to `trace-distill`. Do not repair S7 by reinterpreting Raw Trace inside this stage.

## Method

1. Verify input refs and confirm the requested business scope.
2. Map every DistilledStep exactly once to an ordered Business Step. Preserve preparation, actual actions, runtime reads, verification, and stop conditions.
3. Classify each value as user input, config, Secret ref, invariant, runtime value, test expectation, or unknown.
4. For every runtime value, name the producer Business Step, consumer Business Step, allowed transform, lifetime, and reacquisition rule. An observed sample value cannot become a parameter default.
5. For every OpenDesk capability that the final Recipe will consume, normalize the already observed selection into `capabilityDecisions`: capability need, short discovery path, candidates with selected/rejected/failed/not-run disposition, selected canonical contract/shared constraints, runtime validation evidence, Recipe consumer, and revalidation triggers. Do not invent a past failure or rerun a candidate only to make the record look complete. If S2—S6/S10 did not leave enough evidence to distinguish discovery, selection, contract reading, and runtime validation, return the precise missing item instead of silently inferring it from the final code.
6. Define operation contracts, side effects, preconditions, postconditions, supported scope, exclusions, and unresolved items. Keep expected results outside the production data source.
7. Publish a SemanticProcedure. Do not add raw action decisions, API documentation copies, private chain-of-thought, a capability registry, or an executable DSL.

## Output and acceptance

The Procedure is accepted when every DistilledStep has one consumer mapping, all producer outputs match consumer inputs, every Recipe-driving capability choice is traceable through a minimal `capabilityDecision`, no upstream disposition is duplicated, and the supported scope is explicit. A selected method is not marked runtime-validated merely because its documentation exists; `failed` candidates retain evidence and `not-run` candidates remain not-run. Missing business meaning returns here; missing source facts return to demonstration; wrong action disposition returns to `trace-distill`.

Use `check-artifact-chain.js` for its supported Calculator-shaped S7→S9 and Procedure→Candidate slice. It checks declarations and direct source patterns, not arbitrary business semantics or desktop behavior. Other formats need explicit consumer review. Canonical field and routing rules remain in [the shared contract](../../../../docs/frameworks/agent-to-recipe-skill-contract.md).
