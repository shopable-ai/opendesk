# Native Extension Plugin Auto-Discovery V1 quality report

Date: 2026-09-01 (Asia/Shanghai)  
Status: **Verified Experimental**  
Branch: `master` (no branch created or switched)  
Base HEAD: `51e6000b615b4dc67eef49655a2951e9b38d12df`  
Expert-quality score: **97/100**

The implementation is present in the dirty working tree on top of this base
HEAD; the HEAD alone does not contain the uncommitted/untracked V1 files. The
final proof records that exact condition rather than implying a clean commit.

## Outcome and delivery map

V1 auto-discovers strict manifest bundles and creates Host-generated immutable
JavaScript bindings. Normal code is:

```js
NativeExtensions.goBasic.hello({ name: "OpenDesk" });
NativeExtensions.goBasic.add({ a: 20, b: 22 });
```

It never supplies an executable path, extension basename, protocol, or wire
method. The registry is absent by default, metadata access starts no child,
third-party bundle JavaScript is inert, and every generated method call is a
fresh one-shot process.

1. Roots are deployment root first (portable executable sibling, or macOS app
   `Contents/Resources/NativeExtensions`), then
   `os.UserConfigDir()/OpenDesk/NativeExtensions`. Cwd, PATH, source ancestors,
   polyfills and jslibs are not scanned.
2. Bundle layout is `<root>/<canonical-id>/extension.json`, a bundle-relative
   executable, and optional editor-only `types/index.d.ts`.
3. Manifest contract/schema: `pkg/nativeextension/manifest.go` and
   `schemas/native-extension/extension-manifest-v1.schema.json`.
4. Registry/path security: `pkg/nativeextension/discovery.go` and
   `path_security_*.go`. Exact-case strict JSON, invalid UTF-8, collisions,
   symlinks, unsafe executable parent directories, modes/ownership, digests,
   empty/relative roots and pre-call artifact changes fail closed.
5. Immutable binding: `automation/native_extensions.go`; root/namespaces/
   functions are frozen, properties are non-writable/non-configurable, and
   root/namespace prototypes are null.
6. Types/docs/index: `types/NativeExtension.d.ts`, plugin declarations under
   `examples/native-extensions/*/types`, `docs-user-api/native-extension.md`,
   and `docs-user-api/runtime-api.ai.json`. Core types do not pretend optional
   plugins are installed; params are mandatory and canonical `get(id)` is typed.
7. Deployment: `scripts/build_macos_app.sh` accepts an absolute, non-symlink
   bundle source, rejects non-bundle direct children, stages before codesign,
   and never executes third-party JavaScript.
8. V1.1 custom facade, activation, persistent process, manager/store/update,
   signature infrastructure, sandbox and module loader remain out of scope.

## Current-source Runtime Evidence

### V1 distribution proof

Final evidence:

```text
.runtime/tests/extensions/native-plugin/20260831T205247Z-8374/summary.json
.runtime/tests/extensions/native-plugin/20260831T205247Z-8374/commands.ndjson
.runtime/tests/extensions/native-plugin/20260831T205247Z-8374/source-input-snapshot.json
```

The proof passed on `master` at the base HEAD above with 165 inputs and zero
before/after changes. Inputs include both app Go targets, every
`pkg/nativeextension` platform file, the app build script, schema, core types,
the author/user documentation, examples, proof scripts, polyfills and jslibs.
Its 27-command transcript records exit codes, durations, stream digests and
relevant build/runtime environments.

Verified results:

- default global absent; discovery/list/get/diagnostics child count zero;
- hostile `facade.js` was not executed;
- portable, current-user and ad-hoc-signed app-bundled roots passed;
- `hello -> {"message":"Hello OpenDesk"}` and `add -> {"value":42}`;
- real Apple Vision OCR returned `OPENDESK OCR 123\n你好 456`, 1200x520,
  two items;
- packaged repository quickstart ran successfully from an unrelated empty cwd;
- Go and Swift extension sources were copied into a separate
  `/private/tmp/opendesk-native-extension-author-*` author workspace and built
  there with `go build -trimpath` and `xcrun swiftc -O`; neither author build
  required OpenDesk Core source;
- seven Go children and one Vision child exactly matched expected one-shot calls;
- signed app passed `codesign --verify --deep --strict` before and after its
  manifest-bound hello; external proof executables were withheld, proving the
  staged sibling implementation was used;
- source-isolated package inventory: 37 files, no symlink or implementation
  source, and package-local polyfill/jslib provenance;
- a publisher-style macOS tar.gz was checksum-verified, extracted into a fresh
  portable install, and its normal quickstart passed from `/private/tmp`; the
  artifacts are under
  `.runtime/dist/native-extension-examples/20260831T205247Z-8374/` and
  `.runtime/tests/extensions/native-plugin/install-smoke-20260831T205247Z-8374/`;
- extension error text was absent from the six failure artifacts and 50
  persistent text artifacts, including the command transcript and source-input
  snapshot; the final summary serialization was checked before it was written;
  only bounded byte/hash metadata was retained;
- Linux/Windows amd64 `pkg/nativeextension` test binaries and Go example
  executables cross-compiled with recorded size and SHA-256. Source-free Linux
  tar.gz and Windows zip bundles were also assembled; the Windows target
  manifest names the exact `.exe` and both manifests bind the final executable
  digest. This is compile/package evidence, not target-OS Runtime evidence.

Measured single-machine acceptance timings (not benchmarks):

| Measure | Value |
| --- | ---: |
| disabled startup | 1157.286 ms |
| metadata-only Runtime process | 155.252 ms |
| first hello Host call | 1163 ms |
| add Host call | 15 ms |
| Apple Vision OCR Host call | 1848 ms |
| later hello Runtime process | 175.365 ms |
| packaged quickstart Runtime process | 186.049 ms |
| current-user call Runtime process | 1295.153 ms |
| signed-app hello Runtime process | 1159.512 ms |

### Compatibility and public JavaScript acceptance

- Fresh V0 compatibility:
  `.runtime/tests/extensions/native-process/20260831T204954Z-2584/summary.json`,
  passed 23/23 with no source-status drift and real Vision OCR.
- Fresh Runtime API unit:
  `.runtime/tests/runtime-api/20260831T205017Z-3255/results/unit.json`.
  All 10 NativeExtensions contract/behavior tests passed. The full Runtime
  aggregate was 305/306 because the unrelated `window.list` case hit a macOS
  `osascript` timeout with no on-screen frontmost window; it is not called green.
- V1, V0, and Runtime API used the same current-source `opendesk` binary SHA-256:
  `745957f4d1dbf0f0d8ff3112de9beb961b264d901aef3feb6914d9c4ce083888`.
- `go test ./pkg/nativeextension ./automation ./pkg/execution ./cmd/opendesk ./pkg/http ./pkg/mcpserver -count=1`
  passed. Focused `-race` tests for nativeextension/automation passed.
- TypeScript 5.9.3 strict compilation separately passed both
  `types-acceptance.ts` and the core-only negative acceptance file.
- Python jsonschema 4.23.0 validated the Draft 2020-12 schema itself and both
  example manifests.

## Security and limitations

Extension-controlled error messages are replaced with a generic public message
plus byte count/SHA-256. Extension error codes must match
`[a-z][a-z0-9_]{0,31}` or the response becomes `invalid_response`. Persistent
Evidence excludes params, results, raw streams, home paths and full manifests.

V1 is not a sandbox. Executables run with the current user's privileges, SHA-256
does not authenticate a publisher, and a final validation-to-exec TOCTOU window
remains. Windows has compile coverage but no real Runtime evidence, no Unix-
equivalent ACL trust check, and no Job Object descendant containment. The app
proof uses ad-hoc signing, not Developer ID/notarization. These are disclosed
Experimental limitations, not Stable security guarantees.

## Expert rubric

The six-role architecture, security, evidence, cross-platform, DX/docs and
dissent review is recorded in
`docs/quality/native-extension-plugin-v1-adversarial-audit.md`.

| Dimension | Score | Evidence |
| --- | ---: | --- |
| Architecture reuse and boundaries | 15/15 | One V0 Host/Protocol; manifest, discovery, binding and gates remain separated. |
| JavaScript experience | 15/15 | Business-params-only immutable namespace calls; no routing fields exposed. |
| Security and activation semantics | 19/20 | Default off, inert discovery, strict paths/permissions/collisions, pre-call revalidation, bounded private errors; retained risk for Windows ACL and TOCTOU. |
| Protocol, errors and lifecycle | 15/15 | Strict request/response, invalid UTF-8/error-code rejection, one-shot, timeout/crash/artifact diagnostics. |
| Tests, isolation and Runtime evidence | 19/20 | Fresh V0/V1/JS/race, real OCR, self-contained signed app, privacy and cross-compile; no real Windows/Linux Runtime. |
| Docs, types and deployment reality | 9/10 | Copy-paste packaging, real quickstart/app staging, strict TypeScript; ad-hoc rather than release signing. |
| Scope and maintainability | 5/5 | No facade/module system, activation, persistent lifecycle or manager expansion. |
| **Total** | **97/100** | No Goal hard-failure condition remains. |

## Follow-on decisions

V1.1 Trusted JS Adapter is worthwhile only after real plugins require overloads,
multi-call composition or return adaptation that generated methods cannot
express. It must be a separate Goal: dedicated restricted Goja realm,
bundle-confined size/hash-bounded loader, compile-only discovery, first-use
execution, plugin-bound declared-method invoke, JSON-only cross-realm values and
no File/System/page/http/raw NativeExtension capability by default.

Startup activation and Persistent Process V2 are not justified by this one-shot
acceptance. They require a separate benchmark-backed Goal for heartbeat,
reconnect, crash recovery, shutdown ordering and state isolation.
