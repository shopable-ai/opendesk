# Native Extension Plugin implementation record

Status: **Experimental**. Current live verification is recorded in
`docs/quality/native-extension-plugin-v1.md`; historical V1 runs do not prove
Path-policy sources.

## Architecture and ownership

```text
trusted local CLI JavaScript
  -> default execution-scoped registry
  -> pkg/nativeextension deterministic discovery
       1. exactly one program-relative root
       2. no user-home or machine-wide fallback
  -> strict manifest/path/permission/digest validation
  -> all-candidate id/namespace collision quarantine
  -> frozen Host-generated NativeExtensions closures
  -> list/get/diagnostics: zero child
  -> declared method: pre-call revalidation + existing one-shot Protocol V0 Host
```

`pkg/nativeextension/discovery_roots.go` is the single pure target-OS path
policy. JavaScript, HTTP and MCP have no discovery-root parameter.
`DiscoveryOptions.UserDataDir` remains an internal historical test seam and is
not consulted by product default discovery.

The registry gate remains separate from the low-level unsafe V0 compatibility
gate. HTTP and MCP cannot enable either registry discovery or arbitrary process
execution. Registry discovery never compiles or executes bundle JavaScript;
custom JavaScript facade work remains a separate V1.1 Goal.

## Root terminology and formulas

The sole product default root is owned by the program distribution:

- portable: `<opendesk executable dir>/native-extensions/`;
- macOS app: `OpenDesk.app/Contents/Resources/NativeExtensions/`, staged by the
  publisher before codesign.

The executable path must be absolute. Hostile relative inputs never fall back to
cwd. A missing root is harmless and produces a privacy-minimized diagnostic.
User-home, machine-wide, cwd, PATH, source-ancestor, script-path, polyfills and
jslibs locations are absent from the default chain. Duplicate id or case-fold
namespace candidates inside the root quarantine every conflicting bundle.

## Machine-wide decision

No independent machine-wide or current-user root is implemented. A publisher who
ships an app bundle stages the bundle in Resources before codesign; a portable
developer package stages it beside the executable. No `%ProgramData%`, `$HOME`,
or OS-standard data-directory fallback exists.

## Experimental prototype migration

The maintained release tag `v0.2.2` predates Native Extension V1. The first
committed discovery change remains Experimental. Legacy prototype roots are not
scanned and files are not automatically
moved, copied, merge-copied, deleted or selected last-wins.

An external Experimental user must stop executions, verify one complete bundle,
place it into the program-relative root and start a new execution. If support evidence
reveals unknown real legacy data that cannot be manually confirmed, rollout must
stop and an independent migration Goal must define a legacy root kind, time
limit, collision quarantine, deprecation diagnostic and removal version.

## Binding and lifecycle contract

Daily calls are:

```js
NativeExtensions.goBasic.hello({ name: "OpenDesk" });
NativeExtensions.goBasic.add({ a: 20, b: 22 });
```

The Host closure owns plugin id, canonical executable, public and wire method,
protocol/version, manifest digest, executable digest and default timeout. The
first argument is business JSON. The only second-argument option is bounded
`timeoutMs`; executable, extension, wire method, protocol, version and discovery
root are not routes the script can choose.

The global, namespaces and functions are frozen and non-writable/
non-configurable; root and namespace prototypes are null. Registry state is
frozen per execution with no hot reload. Installing or upgrading a bundle
requires a new execution.

## Security boundaries

Discovery rejects non-absolute roots, symlinks, escapes, unsafe file types,
invalid manifests, permission/ownership failures, case-fold collisions and
digest mismatch. Unix root ancestors reject non-sticky group/world-writable
directories; a root-owned sticky temporary ancestor such as `/private/tmp` is
allowed for proof isolation. Bundle, manifest, executable and executable parent
directories repeat the existing ownership/mode checks. Call-time revalidation
rechecks types, symlinks, containment, modes and digests before execution.

Residual Experimental risks remain explicit:

- validation-to-exec TOCTOU is reduced but not eliminated without fd-based
  execution/platform equivalents;
- Windows ACL/reparse validation remains a cross-platform implementation gap;
- an extension inherits the OpenDesk user identity, environment, cwd, filesystem
  and network access; the plugin is not a sandbox or permission broker;
- only the manifest and selected executable are Runtime-hashed. Dynamic libraries
  or helper assets are not transitively authenticated, so publishers should make
  executables self-contained where possible and sign/checksum the complete
  archive. Executable SHA-256 is not bundle or publisher identity.

These limits are why independent machine-wide discovery is not implemented.

## Verification gates

- path/discovery unit tests: portable/app formulas, hostile relative values,
  cwd independence, missing roots,
  collisions, symlink/mode/ancestor and replacement failures;
- remote boundary tests: JavaScript options, HTTP and MCP cannot inject root or
  transport route;
- documentation acceptance: plugin-author flow first, code/document path
  equality, migration and role separation;
- formal JavaScript Runtime API acceptance under `tests/runtime-api/`;
- macOS source-free program-relative install, documented CLI quickstart,
  zero-child diagnostics, hello/add, real Apple Vision OCR, app-bundled
  call, privacy scan and current-input freshness;
- Linux/Windows cross-compile and source-free archives are compile/package
  evidence only, never target-machine Runtime evidence.

The supported entry points remain:

```bash
./scripts/test_runtime_apis.sh unit
python3 tests/extensions/native-process/tools/smoke-harness/main.py
python3 tests/extensions/native-plugin/tools/proof-harness/main.py
```
