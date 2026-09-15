---
title: UI Perception Resolution
description: OpenDesk high-level desktop text observation, candidate fusion, and safe input architecture.
---

# UI Perception Resolution

## Ownership and public boundary

`UI` owns high-level text intent. A Recipe writes `UI.tapText('保存', { within: win })`, `UI.tapTexts([...], { within: win })`, or `UI.within(win).locator({ text: '保存' })`; it never selects OCR, Accessibility, VLM, provider chains, model credentials, confidence thresholds, or a click strategy. `UI.readText()` is the companion read-only operation for an actual current UI value/text.

`polyfills/013-ui-perception.js` is the single JavaScript Perception Resolver. It composes existing native owners rather than replacing them: Accessibility keeps native traversal and invoke ownership; Vision keeps OCR ownership; `mouse` remains the only pointer-input owner; DesktopVision is observation-only. Image templates remain the existing image/Locator capability: without a caller-supplied template they are not guessed into text candidates.

The normal chain is:

```text
UI text intent → local Accessibility + OCR observations → normalized candidates
→ deterministic fusion/uniqueness/scope/freshness validation → exactly one native invoke or pointer click
```

## Candidate contract and fusion

Every normalized candidate records source, text, normalized text, optional role/name/identifier, screen bounds and center, current window identity, observation time/provenance, and whether a native action is supported. VLM candidates additionally carry the screenshot provenance and normalized bounding box that produced their screen bounds.

Two sources may fuse only when their normalized semantic text, bound window identity, and geometry are compatible. Compatibility is deterministic (overlap or nearby centers), not a comparison of model confidence. Candidates at different positions, with divergent identity, or otherwise not provably the same target remain separate. A read/action needing one target then fails with `AMBIGUOUS_TARGET`; no source order, first result, nearest point, or model confidence is a tie-breaker.

Provider/backend failure remains distinct from a completed zero-candidate observation. Apple helper discovery, extension protocol, executable permission, OCR timeout, invalid provider response, and Accessibility failure are backend errors. They must never become `TARGET_NOT_FOUND` or `false` merely because a different source did not observe a candidate.

## Local sources and Apple Vision diagnosis

Local Accessibility and Native OCR are considered before any cloud capability. Accessibility snapshot use is bounded and must be complete/non-truncated before it contributes a definitive no-match. Apple Vision OCR is delivered through the native extension: diagnosis checks the packaged helper, extension manifest/discovery roots, executable bit, signing/quarantine/permissions, protocol, `VNRecognizeTextRequest` result, language/revision and then raw text/bounds quality.

An OCR quality issue such as `×` recognized as `†`, or a missing `4`/`=`, is investigated with the raw capture, exact scope, provider/raw lines and boxes, business target meaning, and independent Accessibility evidence. It is not solved by a global symbol substitution or by silently switching to VLM. A local, scope-specific alias may be justified only by that evidence and only after uniqueness remains provable.

## Cloud VLM policy and grounding

Cloud visual perception is disabled by default. In P0 the shared `LLM` Runtime has no multimodal transport, so `DesktopVision.getCapabilities().sharedMultimodal` is false and the Resolver must not invoke cloud visual observation even if a deployment has DesktopVision credentials.

When a shared multimodal transport is implemented, all of the following are required before VLM observation can run:

- deployment policy explicitly allows UI cloud vision;
- the shared model profile/credential is configured and owns HTTP, retry, timeout, cancellation and schema validation;
- the scope is one current window and no smaller region is silently widened to that whole window;
- only the required window image/crop is submitted—never the desktop or unrelated windows.

VLM returns text/role/bounding-box observations only. The Runtime validates response schema, finite normalized geometry, positive area, center containment, scope containment, one candidate, screenshot age and current window identity/bounds. It rejects invalid data as `VLM_INVALID_RESPONSE`, old captures/window changes as `STALE_TARGET`, and bounded calls that expire as `TIMEOUT`. A VLM never calls mouse, Accessibility or keyboard.

## Scope, locator, freshness, and input

`UI.within(win)` and its existing Locator are the only scope/locator layer. Each operation refreshes the same window id, PID and native handle; no same-title replacement is accepted. Resolver observations are made within that current scope. Before pointer input it rechecks identity, bounds, cancellation and candidate freshness. VLM has the additional image-provenance and screenshot-age checks.

The terminal input owner is called at most once. Accessibility `acknowledged` and `unknown`, as well as errors after entering the pointer-call boundary, are possible side effects and stop the operation. The Resolver never changes provider or replays input after either state. It may repeat read-only observation only before any input and only while the operation's deadline and scope remain valid.

## Reading and Recorder integration

`UI.readText()` returns only actual evidence: one native Accessibility `value`, otherwise local OCR lines from the requested current window/region. It never returns the caller target, expected value, a calculated substitute, or cloud VLM output, and it performs no input. Multiple readable values are ambiguous; a complete zero observation is `TARGET_NOT_FOUND`.

Recorder continues to emit ordinary `UI.tapTexts`, `UI.tapTargets`, and `UI.readText` calls. It must not emit direct `Vision.runOCR`, `DesktopVision`, `LLM.generate`, `mouse.click`, or provider/fallback configuration to represent a normal text intention.

## Error and observability boundary

Public UI behavior distinguishes `TARGET_NOT_FOUND`, `AMBIGUOUS_TARGET`, `STALE_TARGET`, `TIMEOUT`, `OCR_FAILED`/backend failure, and VLM validation failure. Diagnostics may retain source, structural candidate evidence, bounds and action state, but do not persist automatic screenshots or raw cloud responses. Operational captures/logs belong under `.runtime/tests/ui-perception/`, not source control.
