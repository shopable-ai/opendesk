# Structured UI Collection Phase 1–2 tests

This directory owns deterministic tests and versioned fixtures for the internal,
current-viewport collection-reading seam. It does not expose a Runtime API, run a
VLM/OCR provider, traverse a collection, scroll, click, or perform application
business mapping.

Run from the repository root:

```bash
node --test tests/structured-ui-collection/collection.test.js
```

Runtime logs belong in `.runtime/tests/structured-ui-collection/`; they are not
fixtures and must not be committed.

## Fixture inventory

The fixture module exports plain JSON-serializable input objects. `builders.js`
only removes repetitive literal boilerplate; no fixture reads the desktop,
network, or model at construction time.

| Fixture | Input | Expected result | Expected rejection / uncertainty | Validates | Does not validate |
| --- | --- | --- | --- | --- | --- |
| F1 | Complete AX-style list subtree with three item roots | Three ordered generic items; complete current-viewport accessibility coverage | None | SC-A native grouping, hierarchy, order, known/unknown state | Whole-list completion, live macOS AX |
| F2 | Partial accessibility roots plus complete layout anchors and OCR text, with an explicit image-pixel → screen-logical transform | Three items; accessibility remains partial while the selected layout+OCR basis is complete | No conflict because the incomplete source is not compared as complete | SC-B fallback, source preservation, coordinate mapping | A real OCR provider, whole-list traversal |
| F3 | Layout boundaries and OCR text; no accessibility observations | Three visible items and empty native structure | None | SC-C no-UI-tree data path | VLM, real OCR, hidden items |
| F4 | Three item boundaries, icons, timestamps, and multiple OCR lines | Three structurally grouped items with six elements each | OCR-line-only candidate profile must become uncertain | SC-D constrained grouping and fail-closed validation | General GUI parser DSL, Semantic Vision request |
| F5 | Complete native count of two versus a static `semantic-vision` proposal count of three | Segmenter proposes three; validator accepts none | `EVIDENCE_CONFLICT`, current viewport uncertain | SC-F provenance/conflict and fail closed | A SemanticVisionProvider or any network/model call |
| F6 | Three separate boundaries and three OCR observations all containing `好的` | Three distinct items preserving distinct observation IDs | None | SC-G repeated-item preservation | Cross-viewport continuity/dedupe |
| F7 | Three timeline entries with heights 80/130/95, timestamps, separators, and multi-line text | Three items retaining variable geometry | None | SC-H variable-height segmentation | Scroll/continuity/end detection |
| F8 | Eight currently materialized visible rows | Eight visible items; coverage scope is only `current-viewport` | No `totalCount` or `wholeCollectionComplete` field may exist | SC-K virtualization-safe schema | Discovery of later materialized rows |
| F9 | Two valid generic items and a deliberately incompatible downstream parser oracle | Collection remains valid; parser throws `BUSINESS_MAPPING_ERROR` | Parser rejection is attributed outside Segmenter/Validator | SC-P Runtime/business boundary | A production conversation parser |
| IMAGE-WECHAT-PANEL | Repository PNG plus eight fixed, human-authored image row rectangles; bottom row is clipped | Eight annotated visible items; partial current-viewport image coverage | Partial, not whole-list complete | Real artifact hash/dimensions, image-pixel geometry, static segmentation | OCR/VLM provider, live WeChat, text recognition, total conversation count |

## Test contracts

Every `node:test` case has a deliberately bounded claim:

| Test | Input | Expected result | Expected rejection / uncertainty | Validates | Does not validate |
| --- | --- | --- | --- | --- | --- |
| Phase 1 schemas are parseable… | Three checked-in JSON Schemas | Draft 2020-12 documents parse; Profile is closed; coverage scope is fixed | Business/traversal properties absent | Schema placement and minimum frozen contracts | Full third-party JSON Schema implementation |
| Phase 2 core exposes only internal seams… | Module export table and source | Segmenter/Validator helpers only; no public collector/provider or network/eval/process call | Forbidden capability is absent | Phase boundary and deterministic purity | OS-level side-effect tracing |
| all formal fixtures… | F1–F9 plus image fixture | Both internal validators accept all fixtures; JSON round trip is lossless | None | Serializable data, fixture inventory | Provider/live execution |
| SC-A / F1… | F1 | Three ordered native items; current viewport complete | None | Native roots and coverage | Whole collection |
| F1 unknown native state… | F1 item 3 | `selected` remains explicit `unknown` with reason | Boolean false substitution forbidden | Unknown semantics | Actual AX attribute lookup |
| SC-B / F2… | F2 | Three rows and mapped OCR rectangles; accessibility stays partial | None | Multi-source coexistence | OCR accuracy |
| SC-C / F3… | F3 | Three validated items without native elements | None | No-tree support | Real OCR/layout detector |
| SC-D / F4… | F4 | Three six-element groups | None | Structural grouping | Arbitrary application layouts |
| SC-D negative… | F4 with OCR lines misused as anchors | No accepted items; uncertain | Required structure missing | Validator rejects convenient OCR-line grouping | Semantic proposal generation |
| SC-F / F5… | F5 | Three proposals, zero accepted items | Complete source counts disagree; uncertain | Conflict fail closed | Live VLM correctness |
| SC-G / F6… | F6 | Three `好的` items and three IDs | No text dedupe | Repeated-item integrity | Cross-viewport merge |
| SC-H / F7… | F7 | Heights 80/130/95 are retained | None | Variable height; index is order only | Stable identity |
| SC-K / F8… | F8 | Eight current-viewport items | Whole-list fields absent | Virtualization-safe coverage | Whole-list end evidence |
| SC-P / F9… | F9 plus deliberately wrong parser | Collection valid; parser error separate | `BUSINESS_MAPPING_ERROR` only | Layered attribution | Correct business parser |
| authorized WeChat PNG… | Actual PNG bytes and static annotations | Hash and 880×640 IHDR match; eight image items; partial | Bottom clipping prevents complete | Repository-image functional sample | OCR/VLM/live application |
| segmentation and validation are deterministic… | Serialized copies of F1/F2/F4/F5/F6/F7/F8 | Byte-equivalent data produces deep-equal proposals/results | None | Determinism | Performance at production scale |
| current-viewport convenience seam… | F3 | Combined result equals separately invoked Segmenter and Validator outputs | None | Responsibility outputs remain visible | Public Runtime facade |
| horizontal axis… | F6 geometry transposed into three columns | Left-to-right items at x=0/50/100 | None | Axis-aware ordering | Grid row wrapping |
| separator-band strategy… | F6 text plus two layout separators | Three equal deterministic bands; separator lines are not consumed | None | Separator-guided grouping | Separator detection |
| image-pixel and screen-logical… | F2 with transform deleted | Throws before segmentation | Unmappable coordinate space | Explicit coordinate discipline | General affine/perspective transforms |
| Profile region cannot exceed scope… | F1 Profile widened beyond the Observation scope | Throws before segmentation | Unobserved region | Current-viewport scope containment | ROI discovery |
| source provenance cannot be overwritten… | F3 OCR observation pointing to layout evidence | Observation bundle rejected | Cross-source provenance mismatch | Source/evidence integrity | Artifact authenticity beyond its supplied hash |
| OCR cannot masquerade… | F3 mutated three ways | Each invalid source claim is rejected | OCR value/native and layout text rejected | Source boundaries | OCR provider behavior |
| explicitly preserved observation conflict… | F6 with a declared bounds conflict | No accepted items; uncertain | `EVIDENCE_CONFLICT` | Conflict propagation | Conflict resolution policy beyond fail closed |
| Validator rejects invalid bounds… | Valid F1 proposal moved outside region | No accepted items | `ITEM_OUTSIDE_COLLECTION_REGION` | Independent geometry validation | UI clipping recovery |
| Validator rejects out-of-order… | Valid F1 proposal reordered | Invalid/uncertain | `ITEM_ORDER_INVALID` | Independent axis-order validation | Reverse-layout profiles |
| Validator rejects observation reuse… | F6 proposal with one boundary in two items | No accepted items | `OBSERVATION_REUSED` | Single-consumption invariant | Cross-viewport reuse |
| Validator rejects missing required… | F3 proposal with OCR removed from one item | No accepted items | `REQUIRED_OBSERVATION_MISSING` | Profile requirement enforcement | Text semantic correctness |
| Validator enforces structural constraints… | F1/F7 proposals and Profiles mutated for five constraints | Each applicable issue code is present | Overlap, spacing, size, variable-height policy, or cross-axis mismatch | Independent constraint validation | Layout detector accuracy |
| Validator rejects proposal provenance… | F1 proposal with native source changed to OCR | No accepted items | `PROVENANCE_MISMATCH` | Validator rechecks source facts against Observation | Provider implementation |
| clipped candidate is reported… | F6 with one anchor crossing the region edge | Two accepted items and partial coverage | `CANDIDATE_OUTSIDE_COLLECTION_REGION` plus unassigned evidence | No silent item loss | Recovery of clipped content |
| Validator enforces minimum repeat… | F6 proposal with one item removed under a three-item minimum | No accepted items; uncertain | `REPEAT_PATTERN_NOT_MET` | Repeat-pattern enforcement | Whole-list expected count |
| Profile rejects business/traversal… | F1 Profile mutated with eight forbidden fields | Each mutation throws | Runtime/business or traversal boundary violation | Closed Profile boundary | Application adapter schema |
| unknown state must be explicit… | F1 state replaced with raw `false` | Bundle rejected | Non-structured state | Unknown cannot silently become false | Native state acquisition |
| bundles reject executable metadata… | F1 metadata mutated with a function | Bundle rejected | Non-JSON value | Observation remains ordinary serializable data | Host-object serialization |

## Scenario scope

Phase 1–2 deterministic coverage is provided for SC-A, SC-B, SC-C, SC-D,
SC-F, SC-G, SC-H, SC-K, and SC-P. SC-E and SC-O require the Phase 4 provider;
F5 only uses static `source: semantic-vision` data. SC-I, SC-J, SC-L, SC-M,
and SC-N require the Phase 5 traversal/continuity collector and remain planned,
not run.
