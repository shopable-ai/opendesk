---
name: trace-distill
description: Distill a frozen Agent-to-Recipe Dossier and Raw Trace into source-bound DistilledSteps. Use for S7 action retain/merge/omit/recovery decisions, necessary-path reconstruction, runtime-value provenance, or repair after an action was wrongly removed. Do not use for business parameterization, code generation, or recreating missing historical facts.
---

# Trace Distill

Produce the smallest necessary path that the next stage can consume without rereading the whole conversation.

## Required input

- Frozen TaskContract and WorkPlan refs, including the current plan revision.
- Frozen Dossier and Raw Trace/action file with content hashes.
- Evidence refs for every runtime value and any relevant AppProfile refs.
- Explicit unresolved side effects. Treat `unknown`, `partial`, and possibly applied input as a stop, not as an omission.

Reject mixed attempts, missing source bytes, post-hoc observations without a bound raw action, and inputs whose required evidence cannot be read. Test expectations are not observations.

## Method

1. Verify every supplied ref and hash inside caller-approved roots. Keep the Raw Trace immutable.
2. Reconstruct chronological actions and planned/actual relationships. Give every raw action exactly one decision: `retain`, `merge`, `omit`, `recovery`, or `unresolved`.
3. Preserve actual input, state preparation, actual reads, verification boundaries, repeated legitimate input, and any action that produces or consumes a runtime value.
4. Group retained actions into ordered DistilledSteps. Each step names its source actions, inputs, outputs, dependencies, preconditions, verification, and classification.
5. Bind each runtime value to its actual-read producer and downstream action consumers. Preserve the full value; do not replace it with a demonstrated constant or an expected result.
6. Put alternative recovery paths and unresolved facts outside the normal path. Request targeted recapture when a required fact is missing.

## Output and acceptance

Publish one content-bound DistilledSteps artifact plus its handoff. It is acceptable only when raw action decisions have exact coverage, retained action order is unchanged, required evidence is readable, runtime producer/consumer links are explicit, and side-effect state is known.

Run the shared consumer check after downstream artifacts exist:

```bash
node workflows/agent-to-recipe/scripts/check-artifact-chain.js \
  --dossier <dossier.json> --actions <actions.json> \
  --distilled <distilled-steps.json> --procedure <procedure.json> \
  --candidate <candidate.json> --qualification <qualification.json> \
  --root <id=directory>
```

The check is read-only. Its current slice accepts Calculator-shaped v1 actions, digit-string values and A/B identifiers; it is not a general schema validator or evidence-truth check. Other trace formats need explicit consumer review, not invented conversions to obtain PASS. Source rules and return routing remain in [the shared contract](../../../../docs/frameworks/agent-to-recipe-skill-contract.md) and [chain design](../../design/chain-design.md).
