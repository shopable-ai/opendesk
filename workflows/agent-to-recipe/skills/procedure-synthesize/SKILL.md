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
5. Define operation contracts, side effects, preconditions, postconditions, supported scope, exclusions, and unresolved items. Keep expected results outside the production data source.
6. Publish a SemanticProcedure. Do not add raw action decisions or an executable DSL.

## Output and acceptance

The Procedure is accepted when every DistilledStep has one consumer mapping, all producer outputs match consumer inputs, no upstream disposition is duplicated, and the supported scope is explicit. Missing business meaning returns here; missing source facts return to demonstration; wrong action disposition returns to `trace-distill`.

Use `check-artifact-chain.js` for its supported Calculator-shaped S7→S9 and Procedure→Candidate slice. It checks declarations and direct source patterns, not arbitrary business semantics or desktop behavior. Other formats need explicit consumer review. Canonical field and routing rules remain in [the shared contract](../../../../docs/frameworks/agent-to-recipe-skill-contract.md).
