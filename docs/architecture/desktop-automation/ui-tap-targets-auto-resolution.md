# UI.tapTargets semantic target + Runtime auto-resolution

## Status

Implemented P0 contract for `UI.tapTargets` semantic targets. This document records the implementation boundary and migration rule. The canonical public `UI` reference remains `docs/api/desktop-ui.md`; this architecture note exists so Runtime, Recorder and later code-generation work share one implementation contract.

## Goal

Keep ordinary generated and hand-written OpenDesk JavaScript small:

```js
await UI.tapTexts(["2", "5", "×", "4", "="]);

await UI.tapTargets([
  { text: "保存" },
  { role: "button", name: "确认" },
]);
```

Callers describe the business target. They do not choose OCR vs Accessibility, provide fallback order, confidence policy, coordinates, or another locator DSL.

## Public semantic target

P0 accepts only these semantic fields:

```ts
type OpenDeskUISemanticTapTarget =
  | { text: string; role?: OpenDeskAccessibilityRole; name?: string; identifier?: string }
  | { text?: string; role: OpenDeskAccessibilityRole; name?: string; identifier?: string }
  | { text?: string; role?: OpenDeskAccessibilityRole; name: string; identifier?: string }
  | { text?: string; role?: OpenDeskAccessibilityRole; name?: string; identifier: string };
```

Semantic options are intentionally small:

```ts
interface OpenDeskUISemanticTapTargetsOptions {
  within?: OpenDeskWindowInfo;
  timeout?: number;
  signal?: AbortSignal | null;
}
```

`strategy`, `fallback`, `fallbackOrder`, OCR provider selection, confidence thresholds, bounds and coordinates are not semantic `tapTargets` API.

P0 matching is exact. Fuzzy/contains/regex target syntax is deliberately not added until the same semantics can be proven across both OCR and native Accessibility resolution without silently weakening supplied constraints. Existing OCR APIs keep their existing text-match controls.

## Resolver policy

Resolver policy is Runtime-owned and is not passed by the caller.

### Text-only target

For `{ text: "..." }`:

1. Resolve/pin one window for the sequence. If `within` is omitted, resolve the current active window once.
2. Try the existing `UI.tapText(..., { match: "exact" })` path.
3. If OCR fails before input with a safe discovery failure such as not-found or ambiguity, try exact native Accessibility lookup using `name = text`.
4. If either resolver submits input, do not retry another resolver for the same step.

This gives OCR the common simple path while allowing AX/UIA to repair text misses or ambiguity without exposing a `strategy: "auto"` option.

### role/name/identifier target

If a target contains any explicit native semantic constraint (`role`, `name`, `identifier`), Accessibility is authoritative. The Runtime must not discard those constraints and click an OCR candidate that cannot prove them.

The native sequence is:

```text
Accessibility.find(exact selector)
→ Accessibility.read(role/name/identifier/enabled/actions)
→ require enabled + invoke
→ Accessibility.perform(invoke)
→ Accessibility.release(ref)
```

Only `acknowledged` and `not_needed` are accepted as successful native completion states. `unknown` is an error and must never trigger another resolver because a real side effect may already have occurred.

## Sequence semantics

Semantic targets are executed strictly in caller order. The sequence and target objects are snapshotted before the first await.

Unlike the legacy low-level locator sequence, semantic mode intentionally resolves one step then acts on it before resolving the next step. This allows an earlier click to change the UI needed by the following step.

On step failure:

- later steps are not executed;
- already completed input is never rolled back;
- the error reports `failedIndex`, `failedTarget`, `failedPhase`, `completed`, `attempts` and `cause`;
- an uncertain native action is treated as potentially side-effecting and is never retried by OCR or another native path.

## Diagnostics

Normal successful calls stay small. Failure carries structured resolver evidence:

```text
operation: UI.tapTargets
failedIndex
failedTarget
failedPhase
completed[]
attempts[]
  - resolver: ocr | accessibility
  - phase
  - code
  - message
  - candidateCount/candidates when available
  - backend/requestId/actionState when available
cause
cleanupError when applicable
```

This information is intended for debugging, Recorder repair and Agent-to-Recipe diagnostics. It is not required in ordinary business code.

## Compatibility

The existing low-level form remains supported:

```js
await UI.tapTargets(
  [{ locator: { role: "button", name: "Save" } }],
  { within: win, maxDepth: 8, maxNodes: 1000 },
);
```

When every step is a legacy `{ locator }` step, the semantic facade delegates the original array and options to the existing `006-ui.js` implementation unchanged. That path preserves its full-preflight/fixed-ref semantics.

Legacy and semantic steps may not be mixed in one call because their execution contracts differ.

New business code and future Recorder generation should prefer semantic targets when the retained evidence is sufficient. Advanced exact native traversal remains available through `Accessibility.*` and the compatibility overload rather than growing `UI.tapTargets` into a second Accessibility DSL.

## Platform contract

- OCR semantic targets reuse the existing cross-platform `UI.tapText` capabilities.
- Native semantic resolution uses the first-party Accessibility owner where available and authorized (currently macOS AX and Windows UIA in the public contract).
- A text-only semantic target can therefore succeed through OCR on a platform where Accessibility is unavailable; a target that explicitly requires role/name/identifier must fail clearly if native semantics are unavailable.
- No silent coordinate fallback is permitted.

## Tests and validation

Inert regression suite:

```bash
./dist/opendesk \
  -script tests/runtime-api/single/ui-semantic-targets.js \
  -console-mode script
```

Coverage includes:

- text-only OCR success;
- OCR not-found → Accessibility success;
- OCR ambiguity → Accessibility success;
- explicit role/name/identifier constraints;
- mixed resolver sequence order;
- middle failure stops later targets and preserves completed prefix;
- caller-owned strategy/fallback fields are rejected;
- legacy locator calls are delegated unchanged;
- uncertain native action state never retries another resolver;
- input sequence is snapshotted before the first await.
- cancellation after a real OCR click preserves the completed prefix before later targets stop.
- acknowledged native input remains in the completed prefix if ref cleanup subsequently fails.

Real Calculator validation is kept as an executable example under `examples/desktop/ui-semantic-targets-calculator.js` and must be run on an interactive desktop with the required screenshot/Accessibility permissions.

## Recorder boundary

This P0 does not redesign Recorder generation. Once Runtime + real Calculator validation pass, Recorder can simplify generated clicks by choosing among:

1. `UI.tapTexts([...])` for ordinary unique text sequences;
2. `UI.tapTargets([...semantic targets...])` when text alone is insufficient but Recorder has stable semantic evidence;
3. explicit lower-level `Accessibility.*` only when the retained evidence genuinely requires advanced native behavior.

The generator should not emit `strategy`, `fallbackOrder`, OCR confidence, AX/UIA implementation details or coordinates merely to reproduce Runtime resolver policy.

## P1 / P2

P1 candidates after P0 real-desktop evidence:

- decide whether one cross-resolver `match` enum can support exact/contains/regex (or another small set) with equivalent OCR/native semantics;
- expose additional safe diagnostic metadata only if repair workflows prove it necessary.

P2 candidates:

- Recorder generator adoption;
- qualification evidence for more native control roles and application families;
- strategy evolution inside Runtime based on measured reliability, without changing ordinary caller syntax.
