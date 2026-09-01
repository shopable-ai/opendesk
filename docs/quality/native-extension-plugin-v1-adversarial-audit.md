# Native Extension Plugin V1 adversarial audit

Date: 2026-09-01 (Asia/Shanghai)  
Branch: `master` (no branch created or switched)  
Base HEAD: `51e6000b615b4dc67eef49655a2951e9b38d12df`  
Final disposition: **Accepted, 97/100, Experimental**

This record captures the multi-expert review and dissent process. Reviewers did
not accept an earlier 98/100 claim. They treated evidence freshness, a real
public JavaScript call, packaging self-containment, privacy, and strict parsing
as hard gates and repeatedly invalidated proof runs after shared-worktree source
changes. Acceptance applies to the dirty working-tree implementation recorded
by the final source snapshots, not to the base commit by itself.

## Review panel

Six independent review roles covered:

- architecture and source-input closure;
- security red-team and privacy attacks;
- Runtime-evidence integrity and stale-proof detection;
- cross-platform compile/runtime claim boundaries;
- JavaScript DX, documentation, schema and TypeScript declarations;
- explicit dissent, hard-failure search and score challenge.

The final verdict from all six roles was 97/100 after the last stale references
were removed. No P0/P1 remained. The accepted rubric is the 97/100 rubric in
`native-extension-plugin-v1.md`.

## Findings that blocked earlier acceptance

| Adversarial finding | Resolution | Final evidence |
| --- | --- | --- |
| Manifest keys could be accepted with wrong casing or semantic duplicates. | Exact-case allowlists and duplicate-free strict JSON were applied at every level; invalid UTF-8 is rejected before JSON decoding. | Manifest unit/adversarial tests and schema validation. |
| Executable safety did not cover every intermediate directory. | Discovery and pre-call revalidation now validate every parent, reject symlinks and unsafe Unix modes/ownership/setuid/setgid, and fail closed on change. | Discovery/path-security tests and V1 proof. |
| Raw extension error messages, and later attacker-controlled error codes, could reach evidence. | Public messages are generic; only bounded length/hash metadata remains. Codes must match `[a-z][a-z0-9_]{0,31}` or the response becomes `invalid_response`. | Real re-exec privacy test, red-team replay and 50-artifact scan. |
| Error paths could omit the public manifest method. | Option and artifact failures retain the immutable manifest-bound public method without accepting a caller-supplied wire method. | Automation tests and failure artifacts. |
| An app proof could accidentally invoke an external implementation. | App bundles are staged before signing. The wrapper resolves its sibling `.real`; external proof implementations are withheld during the app call; strict codesign verification runs before and after. | Final signed-app call and command transcript. |
| Core TypeScript declarations pretended optional plugins were installed. | Core types expose the registry contract only. Per-plugin declaration merging supplies namespace and canonical-id types; params are mandatory. | Two independent TypeScript 5.9.3 strict/noEmit acceptances. |
| A documented quickstart was not necessarily runnable from an unrelated cwd. | The packaged quickstart is executed from an empty unrelated cwd and performs real immutable/list/get/hello/add/diagnostics checks. | V1 packaged-quickstart artifacts. |
| Third-party bundle JavaScript might become a hidden polyfill/module path. | Discovery never evaluates or compiles `facade.js`; the hostile marker remains false. Custom facade work is explicitly deferred to a separate V1.1 Goal. | Inertness case and zero-child metadata checks. |
| Proof snapshots originally omitted app-host dependencies or scanned privacy too early. | Both `cmd/opendesk` and `cmd/opendesk-ui-host` dependency closures are included. Commands and source snapshots are included in the 50-artifact scan; final summary serialization is checked before write. | Final 164-input snapshot and summary flags. |
| Multiple otherwise-passing runs became stale after concurrent CustomUI/proof-harness edits. | Those runs were rejected. The final V1/V0/Runtime trio was rebuilt after the shared inputs stabilized, then independently rehashed against the current workspace. | Fresh runs below; final V1 current drift is zero. |

## Final aligned Runtime evidence

The three final acceptance paths use the same current-source `opendesk` SHA-256,
`745957f4d1dbf0f0d8ff3112de9beb961b264d901aef3feb6914d9c4ce083888`:

- V1: `.runtime/tests/extensions/native-plugin/20260831T205247Z-8374/summary.json`
  passed with 165 inputs, zero run-time and post-run drift, 27 recorded commands,
  repository-external author builds, Linux/Windows target bundle assembly,
  seven Go children, one real Vision child, signed-app and privacy proof.
- V0: `.runtime/tests/extensions/native-process/20260831T204954Z-2584/summary.json`
  passed 23/23 with real Vision OCR.
- Formal public JavaScript acceptance:
  `.runtime/tests/runtime-api/20260831T205017Z-3255/results/unit.json` passed all
  10 NativeExtensions cases. The current full Runtime suite was 305/306 because
  an unrelated `window.list` case hit a macOS enumeration timeout with no
  on-screen frontmost window, and is not called green.

Supporting checks passed: the full six-package Go regression, focused execution
privacy/opt-in tests, focused race tests, TypeScript 5.9.3 strict/noEmit for
installed-plugin and core-only declarations, and Draft 2020-12 schema validation
with jsonschema 4.23.0 for both example manifests.

## Residual P2 risks and follow-up

The reviewers intentionally retained three points of score deduction:

- Linux and Windows have cross-compile evidence, not target-machine Runtime
  evidence; Windows also lacks Unix-equivalent ACL trust checks and Job Object
  descendant containment.
- The final validation-to-exec TOCTOU interval remains, and an executable runs
  with the current user's privileges; SHA-256 is not publisher authentication.
- The macOS app proof is ad-hoc signed, not Developer ID signed/notarized.

These are accurately disclosed Experimental limitations. A follow-on thread may
add target-OS CI/runtime evidence and release-signing evidence. Custom JavaScript
facades remain a separate V1.1 design and must not be added to this V1 proof.
