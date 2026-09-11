# Runtime equivalence validation plan

Use this plan when correctness means that an understandable JavaScript source
still has the same intended behavior after protection and real P1
authorization. `package inspect` and `package verify` remain necessary, but
neither is a Runtime or authorization Oracle.

Read the governing eight-step evidence contract in
[`../design/runtime-equivalence-validation.md`](../design/runtime-equivalence-validation.md)
first. This reference is the operational plan for that design. Every lane must
visibly complete, in order: plain execution → recorded plain business result →
protect → inspect → verify → isolated P1 issue/verify/install → authorized
`.odpkg` execution → business-result comparison.

All user commands below start from the repository root and use the already
compiled `./dist/opendesk`. The Publisher/test workflow is JavaScript executed
by OpenDesk; it does not use Node.js or Go and contacts no external service.

## Canonical implementation and Skill entry

The only shared assertion implementation is
[`tests/protected-packages/runtime-equivalence.js`](../../../../../tests/protected-packages/runtime-equivalence.js).
The Skill-owned
[`scripts/runtime-equivalence.js`](../scripts/runtime-equivalence.js) is a thin
delegating entry so the workflow can be understood and invoked from this Skill
without copying those assertions.

Run the Skill entry:

```bash
./dist/opendesk -script workflows/protected-packages/skills/build-odpkg/scripts/runtime-equivalence.js -console-mode script
```

Maintainers can invoke the canonical implementation directly:

```bash
./dist/opendesk -script tests/protected-packages/runtime-equivalence.js -console-mode script
```

Both outer `-script` executions retain their ordinary execution metadata below
`.runtime/runs/`. The canonical test puts all packages, generated keys,
Licenses, installed state, child execution artifacts, screenshots, command
envelopes, provenance, and comparison results into one new
`.runtime/tests/protected-packages/<execution-id>/` directory. Child `ai run`
commands use that directory as their working directory, so their standard
`.runtime/ai/` artifacts are nested below it.

Start review at `<run-dir>/acceptance-ledger.json`. It presents the eight steps
in execution order for basic, parameterized, and UI and links each result to
the detailed evidence. Then use `runtime-equivalence-summary.json` for failure
classes and provenance. The ledger is a projection of the canonical assertions,
not a second implementation.

## Shared prerequisites

- macOS with the production Keychain provider available.
- `./dist/opendesk` and its paired `./dist/opendesk-ui-host` already compiled.
  Their SHA-256, type, size, timestamps, branch, HEAD, and dirty status are
  recorded. A pre-existing binary is not attributed to dirty source without
  independent provenance.
- OpenSSL in `PATH` for fresh Ed25519 Publisher and License issuer keys.
- Screen Recording and Accessibility granted to the actual OpenDesk host.
- Permission to create an isolated temporary macOS Keychain for the OpenDesk P1
  test device identity, temporarily select it as the user search/default
  Keychain, restore the original configuration, open/interact with/close test
  windows, and write local `.runtime/` evidence. An existing login-Keychain
  identity is not deleted or overwritten.

The test fails preflight on a non-macOS host or when required permissions,
files, Command capability, or Apple OCR are unavailable. It does not start a
VM, Wine, Windows, P2 activation, or an entitlement service.

## Basic lane

Input: `examples/protected-packages/basic.js`.

1. Execute the plain `.js` with direct `-script` and retain its ordinary source
   snapshot and `business-result.json`.
2. Create a new License-required `.odpkg` with a fresh per-package DEK and the
   run's fresh Publisher private key. The output paths must not exist.
3. Parse `package protect`, `package inspect`, and `package verify` JSON
   envelopes. Check the five IDs, License policy, minimum Runtime version,
   digest agreement, and Publisher signature.
4. Ensure/export the current device public identity, issue a P1 License with a
   separate fresh License issuer key, inspect it, verify its signature/device/
   DEK access, and install it below the run's isolated
   `OPENDESK_PROTECTED_RECIPE_ROOT`.
5. Delete the Publisher-side DEK and raw `.odlicense`, then execute the
   `.odpkg`. This proves Runtime authorization comes through installed pins,
   License verification, the OS device private key, and the production content
   key provider rather than a test DEK path.
6. Compare the two deterministic `business-result.json` values exactly.

Oracle: the stable contract fields, values, weighted total, and label. Plain
source hash/path/snapshot and protected digest/empty path/no snapshot are
expected differences, not comparison failures.

## Parameterized lane

Inputs: `examples/protected-packages/parameterized.js` and
`parameterized-input.json`.

The package and P1 steps are the same as the basic lane. The before and after
executions both use `opendesk ai run ... --input-file` with the exact same input
file. The recipe validates each field and independently checks
`expectedTotalCents`; the gate then compares the normalized business artifact.

Oracle: order identity, currency, integer price/quantity/discount inputs, and
computed subtotal/discount/total. AI execution IDs, timestamps, package digest,
artifact paths, and snapshot policy are deliberately excluded.

## Real native UI lane

Input: `examples/protected-packages/native-ui.js`.

The same source behavior is run first as plain JavaScript and later as the
installed P1-authorized package, both through direct `-script -ui` with the
recorded `opendesk-ui-host`. For each execution the gate:

1. waits until exactly one titled native Dialog is visible, and waits for it to
   disappear after settlement before starting the next variant;
2. resolves the same unique window through the outer Runtime and verifies its
   PID/title/bounds against independent AI window discovery;
3. focuses it and immediately captures its exact screen rectangle through the
   public `page.screenshot` Runtime API, avoiding unrelated foreground-window
   races;
4. decodes the image size and uses Apple OCR to observe the expected copy and
   action;
5. refocuses the unique Dialog and presses its default action through the
   public Runtime keyboard API;
6. checks the script's approved semantic result and protected snapshot policy.

Semantic Oracle: both executions settle `Dialog.confirm` as approved and write
the same business result. Visual Oracle: each window is within bounded native
dimensions, screenshot dimensions agree with the observed window, the PNG is
non-trivial, expected UI copy/action is visible to OCR, and the two layouts do
not diverge beyond a small geometry tolerance. The PNGs remain available for
human inspection of wrapping, spacing, alignment, clipping, and excess blank
space. No pixel-perfect comparison is used.

## Expected differences

Never compare whole logs or artifact trees. These differences are intentional:

- plain source hash versus protected package digest;
- non-empty plain `scriptPath` / `scriptDir` versus empty protected values;
- plain `script_snapshot.js` versus no protected source snapshot;
- execution IDs, timestamps, durations, and artifact locations;
- package, License, and command evidence paths.

Only stable business values and the UI semantic/visual Oracles above establish
equivalence.

## Failure classification

The retained summary separates these categories so a single generic “package
failed” label cannot hide the failing boundary:

| Category | Meaning |
| --- | --- |
| package structure/signature | protect/inspect/verify, manifest identity, digest, or Publisher signature failed |
| P1 authorization | device, issue, License inspect/verify, isolated install, or installed provider chain failed |
| plain Runtime | the readable source did not complete or produce its expected artifact |
| protected Runtime | the authorized package did not complete, leaked a snapshot, or produced no expected artifact |
| parameter equivalence | the same `--input-file` produced different normalized business results |
| UI semantic acceptance | the real action did not settle to the same approved state |
| UI visual acceptance | window discovery, bounds, screenshot, image decode, OCR, or cross-run layout checks failed |
| security cleanup | private keys, a per-package DEK, raw License, or isolated installed P1 root remained |

## Security cleanup

Package Publisher signing, License issuer signing, per-package DEKs, and the
device key are separate domains. Secret values are never command-line values,
environment values, console output, JSON evidence, or comparison inputs; only
their file paths enter public CLI options.

Every run generates new Publisher/issuer private keys, a dedicated temporary
device Keychain, and one new DEK per
package. After each P1 install, its DEK and raw License are removed before the
protected Runtime starts. In `finally`, the gate precisely removes any
remaining private keys, DEKs, raw Licenses, the entire isolated installed P1
root, and the temporary device Keychain after restoring the original Keychain
search/default configuration, then verifies absence. It retains encrypted `.odpkg` files, public
keys, device public identity, safe CLI envelopes, execution evidence, and
screenshots. The production macOS Keychain provider creates the test identity;
its private key is never exported, and the shared login-Keychain identity is
left untouched.

The gate never passes `--license-required=false`. Production loading is
`FileInstallationStore` Publisher pin resolution → `DeviceLicenseVerifier` (or
preferred online verifier when configured) → `DeviceBoundContentKeyProvider`
using the OS device private key → in-memory decryption. There is no test bypass,
embedded DEK, universal fallback key, P3 lifecycle, or external P2 call.
