# Protected package equivalence examples

These examples are intentionally small, readable behavioral inputs. They are not test harnesses and do not contain Publisher or License secret material:

- `basic.js` writes one deterministic business result, includes a stable verification token for human review, and contains one source-only sentinel used by the smoke test to detect accidental plaintext disclosure.
- `parameterized.js` validates and calculates the data in `parameterized-input.json`.
- `native-ui.js` opens one real native confirmation dialog and records the selected action.

## Run the plain basic example

```bash
./dist/opendesk \
  -script "$PWD/examples/protected-packages/basic.js" \
  -console-mode script
```

The result is written to `Execution.artifactDir/business-result.json`. The deterministic verification token makes the same business payload easy to recognize before and after packaging without introducing random output that would break exact equivalence checks.

The source-only sentinel in `basic.js` is deliberately **not** logged and is **not** written to the business result. Protected-package tests scan the generated `.odpkg` and protected text artifacts to ensure that sentinel does not appear as plaintext.

## Fast `.js` -> `.odpkg` -> Runtime validation

For normal development, use:

```bash
./dist/opendesk \
  -script "$PWD/tests/protected-packages/basic-runtime-smoke.js" \
  -console-mode script
```

It automatically runs the plain source, generates ephemeral Publisher/License keys and a per-package DEK, creates and verifies a License-required `basic.odpkg`, installs an isolated P1 License, removes Publisher-side secret inputs, executes the `.odpkg`, compares business results, performs source-disclosure checks and cleans secret material.

The test key lifecycle is documented in `tests/protected-packages/KEYS.md`.

## Full qualification

Run the complete before/after validation with:

```bash
./dist/opendesk \
  -script "$PWD/tests/protected-packages/runtime-equivalence.js" \
  -console-mode script
```

The full command creates a unique evidence directory below `.runtime/tests/protected-packages/`. It executes each plain source, creates a License-required `.odpkg`, performs inspect/verify, follows the real P1 device/issue/inspect/verify/install chain in an isolated installation root, executes the package, and compares the business result. The UI lane also retains screenshots and OCR/geometry evidence; visual review is not inferred from functional completion alone.
