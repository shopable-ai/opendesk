# Native Extension V1 current macOS revalidation

Date: 2026-09-01 (Asia/Shanghai)
Status: **In progress — no current-source acceptance yet (Experimental)**
Branch: `master` (no branch created, switched, staged, committed, or pushed)
Acceptance object: dirty working-tree snapshot at
`d5878a0f6d8ac134be1d35250645c926da21ffe6`

This report is being revalidated for the macOS-only Goal. The recorded run below
was invalidated when its frozen source-input list no longer matched the working
tree, so it is historical context only and must not be cited as current
acceptance. Linux and Windows are **Out of Scope / Not Evaluated**: this goal
does not build, package, test, or score either target.

## Current Mac and canonical install location

The evidence machine is macOS 12.7.6 (`Darwin x86_64`). The only current-user
formula is:

```text
$HOME/Library/Application Support/OpenDesk/NativeExtensions/
```

The real user home was read-only checked as `/Users/mac`; its target root did
not exist before or after proof. To avoid modifying personal plugins, the proof
used an isolated absolute `HOME` and installed this exact source-free tree:

```text
com.example.go-basic/
  extension.json
  bin/native-ext-go-basic
  types/index.d.ts
```

The user does not compile an extension. A publisher supplies an OS/CPU-matched
precompiled archive, the user verifies it and copies the whole bundle into the
canonical root. Plugin authors/CI use their normal toolchain; this proof ran
`go build -trimpath -buildvcs=false`, a one-request Protocol V0 wire test,
manifest SHA-256/schema validation, a Darwin archive/checksum, and installed
Runtime smoke. The repository has no public publisher asset: **Not Published /
Not Verified**. Files under `.runtime/` are local acceptance evidence only.

## Historical candidate evidence — invalid for the current source

The following `python3 tests/extensions/native-plugin/tools/proof-harness/main.py --host-only` record
previously exited 0, but its source-input snapshot is stale. It is retained only
to make the freshness failure auditable.

| Evidence | Value |
| --- | --- |
| Run id | `20260901T082728Z-99420` |
| Source inputs | 194, before/after drift `0` |
| Source snapshot SHA-256 | `67bd8124734fae1f8b1465b3466cb50723316b174f63a17f11319096cfd18ab4` |
| Host SHA-256 | `dbdbfef8f3af572b8633b84ac65699f02ba59f4db40bf027b9691f77645422af` |
| Author and installed plugin SHA-256 | `d63b6f8d6d55957c87824e47c065e5be0d47dbe9682100f2cc93b99cb56221f5` |
| Darwin archive | `com.example.go-basic_0.1.0_darwin-x86_64.tar.gz` |
| Archive SHA-256 | `8b665f24adb539410b3e4a9ebd254fa6a7350e419ddfa6ab15010da252a78c53` |
| Final summary SHA-256 | `bc4d960fd5cc1950d4878974c100e6c0f6b664bd7d7bb0302348c537fcb78b99` |

The canonical archive is a direct Mach-O x86_64 executable, with no wrapper,
`.real` indirection, source files, or third-party JavaScript execution. Its
manifest digest, author executable, and installed executable are identical.
The proof actually executed `install -d -m 700`, `cp -R`, `chmod -R go-w`,
`tar`, `shasum`, `cmp`, formal Draft 2020-12 schema validation, and
`codesign --verify --deep --strict` on the staged app bundle.

From an unrelated empty cwd, canonical diagnostics emitted zero call events;
`list()`, `get()`, and `diagnostics()` started zero children. The subsequent
ordinary business-only script returned:

```js
function main() {
  const hello = NativeExtensions.goBasic.hello({ name: "OpenDesk" });
  const sum = NativeExtensions.goBasic.add({ a: 20, b: 22 });
  console.log(JSON.stringify({ hello, sum }));
}

main();
```

```bash
opendesk -experimental-native-extension -script /absolute/path/hello.js -console-mode script
```

```json
{"hello":{"message":"Hello OpenDesk"},"sum":{"value":42}}
```

The normal calls used the canonical `current_user` root and produced two
successful `native_extension_call` records. The same proof ran real Apple
Vision OCR, verified portable and app-bundled publisher roots, and confirmed
the signed app bundle was unchanged after the call.

## Historical candidate test results — not current acceptance

- `go test ./pkg/nativeextension -count=1` passed, including symlink,
  mode/owner, digest/replacement, collision, process-group timeout, Darwin ACL
  allow rejection, deny-only ACL acceptance, and no-cgo fail-closed contracts.
- `go test ./automation ./pkg/execution ./pkg/http ./pkg/mcpserver -count=1`
  passed. The matrix keeps registry activation local to the explicit CLI flag;
  HTTP and MCP cannot inject roots or execute caller-selected extensions.
- `./scripts/test_runtime_apis.sh unit` passed in
  `.runtime/tests/runtime-api/20260901T082552Z-95706/results/unit.json`:
  339/339, with all 10 NativeExtensions cases passing.
- The formal `.js` route/root attack matrix rejects caller-selected executable,
  extension, wire method, protocol, version, root, and discovery root. A new
  opaque unknown-option test confirms neither attacker key nor value appears in
  returned Runtime Evidence. The fixed implementation emits only the constant
  message `only timeoutMs is supported`.
- Discovery is inert; `facade.js` remains unexecuted. Bound namespace/method
  closures are null-prototype, frozen, non-writable, non-configurable, and
  validated again before every invocation.
- Persistent proof text excludes raw extension errors, business params/results,
  isolated HOME, and absolute canonical executable paths. User console output
  remains distinct from Native Extension Event/summary Evidence.

## Scope correction made in this Goal

The proof harness's `--host-only` path formerly still ran Linux/Windows
cross-compilation and reported them in its score. It now skips those operations
entirely and records `crossCompile.status: not_run`; its accepted macOS summary
names Linux and Windows only as Out of Scope / Not Evaluated. The current run's
36 command transcript contains no `GOOS` or `GOARCH` cross-target command.

The Runtime binding also no longer embeds an unknown option's caller-controlled
key in an Error message that could reach execution persistence.

## Withdrawn candidate score

| Role | Conclusion |
| --- | --- |
| Main executor | Three-layer baseline completed before writes; final proof froze the working-tree inputs and observed zero drift. |
| Architecture | Pass: manifest → discovery → immutable Binding → pre-call artifact validation → one-shot Host is reachable only through the local CLI experimental gate. |
| macOS security red team | Pass: symlink, owner/mode, allow ACL, deny-only ACL, digest/replacement, timeout/bounds, collision, route/root injection, and error/privacy attacks fail closed or are contained. |
| Consumer/author DX | Pass: first-screen docs give precompiled bundle, location, complete `.js`, CLI, output, diagnostics, wire/schema/archive/checksum workflow, and state that public assets are unavailable. |
| Evidence | Pass: source snapshot, source-free inventory, hashes, command exit/hash records, zero-child phase, actual install commands, direct executable check, and privacy scans were independently recomputed. |
| Adversarial dissent | No P0/P1 found in the current snapshot; it rejects stale evidence, wrapper-as-release, index/working-tree conflation, and cross-target claims. |

| Dimension | Score |
| --- | ---: |
| Consumer first use | 20/20 |
| Author build and release | 15/15 |
| macOS discovery and immutable binding | 20/20 |
| macOS security | 19/20 |
| Current-source Runtime Evidence | 20/20 |
| Scope discipline | 5/5 |
| **Total** | **99/100** |

These historical statements do not establish the present P0/P1 status. P2
residual risks recorded at the time were:
validation-to-exec is not atomic, the manifest digest does not authenticate a
publisher or transitive executable dependencies, and V1 is not a sandbox or
permission broker. They do not weaken the macOS evidence claim or change the
Experimental status.

The historical local candidate evidence is
`.runtime/tests/extensions/native-plugin/20260901T082728Z-99420/`; it is not
current-source evidence.
