# Protected package tests

`runtime-equivalence.js` is the canonical shared implementation for live
plain-JavaScript versus authorized-`.odpkg` runtime equivalence. It is executed
by the already compiled OpenDesk Runtime and does not use Node.js or Go.

From the repository root:

```bash
./dist/opendesk -script tests/protected-packages/runtime-equivalence.js -console-mode script
```

The test creates one unique directory below
`.runtime/tests/protected-packages/`. It owns all reusable assertions for:

- package structure and Publisher signature;
- the real P1 Keychain device/issue/inspect/verify/install chain;
- deterministic basic behavior;
- `ai run --input-file` parameter behavior;
- real native Dialog interaction, semantic state, geometry, screenshot, and
  OCR-visible layout evidence;
- protected source-snapshot absence and exact secret cleanup.

Publisher and License issuer private keys are generated separately for each
run. Every package gets a new DEK. Private keys, DEKs, raw `.odlicense` files,
the isolated installed P1 root, and the dedicated temporary device Keychain are
removed before completion. The original user Keychain search/default settings
are restored. Encrypted
packages, public keys, safe JSON envelopes, execution logs, and screenshots are
retained for review. The production provider creates the test device identity
inside that temporary macOS Keychain; its private key is never exported and an
existing login-Keychain identity is not overwritten.

`ai run` normally creates command artifacts below `.runtime/ai/`. The canonical
runner gives those child processes the unique test directory as their working
directory, so their standard `.runtime/ai/` evidence remains nested inside the
same protected-package run directory. The outer `-script` execution keeps its
ordinary metadata under `.runtime/runs/`; it contains no Publisher private key,
License issuer private key, DEK, or installed License state.
