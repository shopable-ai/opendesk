# Protected package tests

OpenDesk keeps two live protected-package test levels:

```text
basic-runtime-smoke.js
    -> fast core .js -> .odpkg -> P1 -> protected execution gate

runtime-equivalence.js
    -> full basic + parameterized + native UI qualification gate
```

Both are executed by the already compiled OpenDesk JavaScript Runtime. They do not use Node.js as the test runner.

## Fast basic smoke test

This is the first command a developer should run when validating protected-package functionality:

```bash
./dist/opendesk \
  -script "$PWD/tests/protected-packages/basic-runtime-smoke.js" \
  -console-mode script
```

The smoke test automatically performs:

```text
examples/protected-packages/basic.js
-> run plain JavaScript
-> generate fresh Publisher Ed25519 test keypair
-> generate a separate License issuer Ed25519 test keypair
-> create an isolated test device identity
-> package protect --key-out
-> generate a fresh per-package 256-bit DEK
-> package inspect
-> package verify
-> issue / inspect / verify / install P1 License
-> remove Publisher-side DEK and raw .odlicense
-> run the generated basic.odpkg through the normal -script entry
-> compare plain/protected business-result.json exactly
-> verify no protected source snapshot exists
-> scan .odpkg / protected text artifacts for the source-only sentinel
-> remove private keys, P1 install state and temporary device Keychain
```

It intentionally does **not** require Screen Recording, Accessibility, OCR, Calculator, or native UI interaction.

The current isolated P1 smoke uses the production macOS Keychain device provider, so this fast live test currently requires macOS. Windows protected-package unit/cross-build coverage is separate until an equivalent isolated Windows live fixture is qualified.

A successful run ends with:

```text
[PROTECTED-PACKAGE-BASIC] passed {...}
```

The retained encrypted package is under:

```text
.runtime/tests/protected-packages-basic/<Execution.id>/package/basic.odpkg
```

and the complete safe summary is:

```text
.runtime/tests/protected-packages-basic/<Execution.id>/basic-runtime-smoke-summary.json
```

## Test keys and secret lifecycle

Do not add reusable private fixtures such as `test-private-key.pem` or a static AES content key to Git.

Every smoke/equivalence run creates fresh short-lived key material. Publisher signing and License issuer signing use separate Ed25519 keypairs. Every package receives a new DEK. The device private key is created by the production provider inside a dedicated temporary macOS Keychain and is never exported.

Private keys, DEKs, raw `.odlicense`, installed P1 state, and the temporary Keychain are removed during cleanup. Public keys, public device identity, encrypted `.odpkg`, safe command envelopes and business-result evidence may remain for review.

See [`KEYS.md`](KEYS.md) for the exact file layout, manual throwaway key-generation commands, production boundary and cleanup requirements.

## Full runtime equivalence test

Run the complete qualification gate from the repository root:

```bash
./dist/opendesk \
  -script "$PWD/tests/protected-packages/runtime-equivalence.js" \
  -console-mode script
```

The canonical full test creates a unique directory below `.runtime/tests/protected-packages/` and covers:

- package structure and Publisher signature;
- the real P1 Keychain device/issue/inspect/verify/install chain;
- deterministic basic behavior;
- `ai run --input-file` parameter behavior;
- real native Dialog interaction, semantic state, geometry, screenshot, and OCR-visible layout evidence;
- protected source-snapshot absence and exact secret cleanup.

Because it includes the native UI lane, the full test additionally requires macOS Screen Recording, Accessibility permission and the Apple OCR provider.

`ai run` normally creates command artifacts below `.runtime/ai/`. The canonical runner gives those child processes the unique test directory as their working directory, so their standard evidence remains nested inside the same protected-package run directory. The outer `-script` execution keeps its ordinary metadata under `.runtime/runs/`; it must contain no Publisher private key, License issuer private key, DEK, or installed License state.

For the complete generation / inspect / verify / authorization / runtime workflow and acceptance rules, see [`docs/implementation/runtime/protected-packages.md`](../../docs/implementation/runtime/protected-packages.md).
