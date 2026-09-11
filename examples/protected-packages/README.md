# Protected package equivalence examples

These examples are intentionally small, readable behavioral inputs. They are
not test harnesses and do not contain Publisher or License material:

- `basic.js` writes one deterministic business result.
- `parameterized.js` validates and calculates the data in
  `parameterized-input.json`.
- `native-ui.js` opens one real native confirmation dialog and records the
  selected action.

The shared assertions and all package/P1 orchestration live in
`tests/protected-packages/runtime-equivalence.js`. From the repository root,
run the complete before/after validation with the already compiled Runtime:

```bash
./dist/opendesk -script tests/protected-packages/runtime-equivalence.js -console-mode script
```

The command creates a unique evidence directory below
`.runtime/tests/protected-packages/`. It executes each plain source, creates a
License-required `.odpkg`, performs inspect/verify, follows the real P1
device/issue/inspect/verify/install chain in an isolated installation root,
executes the package, and compares only the business result. The UI lane also
retains screenshots and OCR/geometry evidence; visual review is not inferred
from functional completion alone.
