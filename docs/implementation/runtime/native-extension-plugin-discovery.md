# Native Extension Plugin V1.0.1 implementation record

Status: **Experimental**. Current live verification is recorded in
`docs/quality/native-extension-plugin-v1.md`; historical V1 runs do not prove
V1.0.1 path-policy sources.

## Architecture and ownership

```text
trusted local CLI -experimental-native-extension
  -> execution-scoped registry opt-in
  -> pkg/nativeextension deterministic discovery
       1. one publisher/deployment root
       2. one canonical current-user root
       3. no independent machine-wide root
  -> strict manifest/path/permission/digest validation
  -> all-candidate id/namespace collision quarantine
  -> frozen Host-generated NativeExtensions closures
  -> list/get/diagnostics: zero child
  -> declared method: pre-call revalidation + existing one-shot Protocol V0 Host
```

`pkg/nativeextension/discovery_roots.go` is the single pure target-OS path
policy. Platform glue only obtains the OS-standard base. JavaScript, HTTP and MCP
have no discovery-root parameter. `DiscoveryOptions.UserDataDir` is internal Go
test/proof injection, not a product transport field.

The registry gate remains separate from the low-level unsafe V0 compatibility
gate. HTTP and MCP cannot enable either registry discovery or arbitrary process
execution. Registry discovery never compiles or executes bundle JavaScript;
custom JavaScript facade work remains a separate V1.1 Goal.

## Root terminology and formulas

Publisher/deployment root:

- portable: `<opendesk executable dir>/native-extensions/`;
- macOS app: `OpenDesk.app/Contents/Resources/NativeExtensions/`, staged by the
  publisher before codesign.

Canonical current-user root:

- macOS: `$HOME/Library/Application Support/OpenDesk/NativeExtensions/`;
- Linux: `${XDG_DATA_HOME:-$HOME/.local/share}/OpenDesk/NativeExtensions/`;
  a non-empty `XDG_DATA_HOME` must be absolute;
- Windows: the LocalAppData Known Folder plus
  `OpenDesk\NativeExtensions\` (`%LOCALAPPDATA%\OpenDesk\NativeExtensions\` as
  the user-facing formula), never roaming AppData.

Explicit executable/base inputs must be absolute. Hostile relative inputs never
fall back to cwd. A missing canonical root is harmless and produces a
privacy-minimized diagnostic after the publisher-root diagnostic. Root order is
for deterministic enumeration only; duplicate id or case-fold namespace across
roots quarantines every conflicting candidate and never establishes precedence.

## Machine-wide decision

**Machine-wide root: Not Implemented.** Candidates are documented but not added
to default discovery:

- macOS `/Library/Application Support/OpenDesk/NativeExtensions/`;
- Linux installer `${libexecdir}/opendesk/native-extensions/`, with
  `/usr/local/libexec/opendesk/native-extensions/` only a source-install
  candidate;
- Windows `%ProgramFiles%\OpenDesk\NativeExtensions\` Known Folder.

Unix does not yet have a complete root/admin-only policy for a separately
managed system root. Windows lacks owner/DACL, ACL inheritance and reparse-point/
junction trust gates. Machine-level plugins therefore continue to ship inside a
publisher/deployment package. No `%ProgramData%` fallback exists.

## Experimental prototype migration

The repository HEAD/history contains no committed Native Extension V1 path
contract. V1.0.1 corrects the uncommitted Experimental prototype before formal
delivery: Linux uses XDG data instead of config and Windows uses LocalAppData
instead of roaming AppData. Legacy prototype roots are not scanned and files are
not automatically moved, copied, merge-copied, deleted or selected last-wins.

An external Experimental user must stop executions, verify one complete bundle,
install it into the canonical root and start a new execution. If support evidence
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
- Windows current-user discovery is not Unix-equivalent ACL trust validation;
- an extension inherits the OpenDesk user identity, environment, cwd, filesystem
  and network access; V1.0.1 is not a sandbox or permission broker;
- only the manifest and selected executable are Runtime-hashed. Dynamic libraries
  or helper assets are not transitively authenticated, so publishers should make
  executables self-contained where possible and sign/checksum the complete
  archive. Executable SHA-256 is not bundle or publisher identity.

These limits are why independent machine-wide discovery is not implemented.

## Verification gates

- path/discovery unit tests: all three canonical formulas, publisher portable/
  app formulas, hostile relative values, cwd independence, missing roots,
  collisions, symlink/mode/ancestor and replacement failures;
- remote boundary tests: JavaScript options, HTTP and MCP cannot inject root or
  transport route;
- documentation acceptance: consumer flow first, code/document path equality,
  migration and role separation;
- formal JavaScript Runtime API acceptance under `tests/runtime-api/`;
- macOS source-free canonical install from an archive, unrelated-cwd packaged
  Runtime, zero-child diagnostics, hello/add, real Apple Vision OCR, app-bundled
  call, privacy scan and current-input freshness;
- Linux/Windows cross-compile and source-free archives are compile/package
  evidence only, never target-machine Runtime evidence.

The supported entry points remain:

```bash
./scripts/test_runtime_apis.sh unit
./scripts/test_native_process_extensions.sh
./scripts/test_native_extension_plugins.sh
```
