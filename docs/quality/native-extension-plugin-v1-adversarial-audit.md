# Native Extension V1 current macOS adversarial audit

Date: 2026-09-01 (Asia/Shanghai)
Disposition: **Accepted for the current macOS working-tree snapshot; 99/100**
Branch/HEAD: `master` / `d5878a0f6d8ac134be1d35250645c926da21ffe6`

This is a macOS-only audit. Linux and Windows are **Out of Scope / Not
Evaluated**; no cross compilation, package assembly, runtime test, or score for
either target is included.

## Evidence freshness challenge

Historical `.runtime` runs were treated only as diagnostics. The accepted run
is `20260901T082728Z-99420`, launched with
`python3 tests/extensions/native-plugin/tools/proof-harness/main.py --host-only` and outer exit code 0.
It hashed 194 current working-tree source inputs before and after construction,
with zero changes. Its source snapshot SHA-256 is
`67bd8124734fae1f8b1465b3466cb50723316b174f63a17f11319096cfd18ab4`; the
final summary SHA-256 is
`bc4d960fd5cc1950d4878974c100e6c0f6b664bd7d7bb0302348c537fcb78b99`.

The audit rejects attempts to substitute an index or HEAD conclusion for this
working-tree proof. The baseline found staged Native Extension gate removals in
the index while the accepted implementation is in the working tree, so no
claim is made that those three trees are equivalent.

## Challenge results

| Attack or false-green attempt | Result |
| --- | --- |
| Normal script supplies executable, extension, wire method, protocol/version, or discovery root | Rejected as a route option; immutable closure keeps the manifest route. |
| Unknown option key/value reaches persistent execution evidence | Rejected; error text is constant and formal `.js` checks ensure key/value are absent from error Evidence. |
| HTTP/MCP request enables registry or arbitrary native process | Rejected by the focused Go matrices; only the local CLI experimental flag reaches the registry. |
| Discovery/list/get/diagnostics starts child or `facade.js` | Rejected: disabled default and independent metadata phases are zero-child; third-party facade remains inert. |
| Publisher/current-user duplicate overrides another bundle | Rejected: all id/namespace collision contenders quarantine. |
| Symlink, unsafe parent, writable mode, foreign owner, set-id, or artifact replacement | Rejected during discovery or pre-call artifact revalidation. |
| macOS extended ACL allow ACE is missed | Rejected; deny-only ACL is separately accepted; `darwin && !cgo` fails closed. |
| Timeout leaves extension descendants | Process-group termination test passes. stdout/stderr/JSON response remain bounded. |
| Shell wrapper is called a source-free consumer release | Rejected: canonical archive inventory is exactly manifest, direct Mach-O executable, and optional types; author, manifest, and installed executable SHA-256 all match. |
| Old evidence, mutable proof input, or hidden other-OS work | Rejected: zero source drift, proof transcript rehash, and no `GOOS`/`GOARCH` command in the 36-command macOS-only transcript. |
| Raw business/error data, HOME, or executable path persists in Native Extension evidence | Rejected by event/summary/log privacy scans; only user-requested console output contains business results. |

## Independent evidence checks

- The canonical user root was installed under an isolated absolute HOME, while
  real `/Users/mac/Library/Application Support/OpenDesk/NativeExtensions/` was
  read-only checked and remains absent.
- `install -d`, `cp -R`, `chmod -R go-w`, `tar`, `shasum`, `cmp`, formal
  schema validation, and app codesign verification executed successfully.
- The direct installed archive is
  `com.example.go-basic_0.1.0_darwin-x86_64.tar.gz` SHA-256
  `8b665f24adb539410b3e4a9ebd254fa6a7350e419ddfa6ab15010da252a78c53`.
  Its direct author/installed executable SHA-256 is
  `d63b6f8d6d55957c87824e47c065e5be0d47dbe9682100f2cc93b99cb56221f5`.
- The Host SHA-256 is
  `dbdbfef8f3af572b8633b84ac65699f02ba59f4db40bf027b9691f77645422af`.
- Canonical diagnostics had zero call events; ordinary `hello` and `add`
  produced two successful `current_user` calls and
  `{"hello":{"message":"Hello OpenDesk"},"sum":{"value":42}}`.
- Real Apple Vision OCR passed. Portable and app-bundled publisher roots passed,
  and `codesign --verify --deep --strict` succeeded before and after the app
  call.
- Formal Runtime JavaScript unit run `20260901T082552Z-95706` passed 339/339;
  NativeExtensions is 10/10. Native Extension Go security tests and the
  automation/execution/HTTP/MCP focused matrix passed.

## Dissent and residual risk

No P0/P1 finding remains for the accepted snapshot. P2 concerns are real but
disclosed: validation-to-exec has a TOCTOU interval, a digest does not
authenticate a publisher or transitive dependencies, and an invoked extension
has the user's OS authority because V1 is not a sandbox. Machine-wide discovery,
custom JS facades, Manager/download/build hooks, hot reload, and persistent
processes remain unimplemented.

The conclusion applies only to this Mac and this working-tree snapshot. It is
not evidence of Linux/Windows behavior, a public release asset, a Stable ABI,
or a cross-platform acceptance result.
