# Test the compiled package and Runtime path

Package-only smoke output cannot establish protected-package correctness.
`inspect` proves structure and public metadata; `verify` proves a Publisher
signature. Runtime equivalence additionally requires a real P1 authorization
chain, execution of the plain source and protected payload, business Oracles,
and separate native UI semantic/visual evidence.

Read the fixed evidence chain in
[`../design/runtime-equivalence-validation.md`](../design/runtime-equivalence-validation.md),
then follow [runtime-equivalence.md](runtime-equivalence.md). Its Skill-owned
entry delegates to the canonical implementation in `tests/protected-packages/`
without duplicating assertions:

```bash
./dist/opendesk -script workflows/protected-packages/skills/build-odpkg/scripts/runtime-equivalence.js -console-mode script
```

Run from the repository root with the already compiled `./dist/opendesk` and
paired `./dist/opendesk-ui-host`. OpenSSL, macOS Keychain, Screen Recording, and
Accessibility are prerequisites. The workflow is OpenDesk Runtime JavaScript;
it uses neither Node.js nor Go and makes no external request.

The pass marker reports the unique evidence directory and its ordered
`acceptance-ledger.json` below `.runtime/tests/protected-packages/`. Review that
ledger first; it shows plain → result → protect → inspect → verify → P1 →
protected → compare for every lane. Binary provenance explicitly remains
“not proven against dirty source” unless independent build evidence exists.
Windows owner cross-build remains historical evidence only; Windows live
DPAPI/package/P1/P2/Runtime/full-app/package/install stays `not qualified`.
