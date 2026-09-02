# Native Process Extension V0 smoke

This domain verifies the **Experimental** one-shot Native Process Extension V0
Host/Protocol and low-level compatibility path. The normal V1 manifest registry
is verified separately by `tests/extensions/native-plugin/`.

The smoke test builds the current OpenDesk command, the independent Go basic
extension, and the independent macOS Swift/Vision extension. It then verifies:

- `hello`, `add`, and real Apple Vision `ocr` through the OpenDesk CLI;
- low-level `NativeExtension.call` by safe extension basename through a real JavaScript file and the explicit `-experimental-unsafe-native-extension-call` local diagnostic gate;
- structured parameter, executable, child-process, timeout, and protocol errors;
- stderr diagnostics without stdout protocol corruption;
- latency and privacy-minimized per-call Evidence, including four real
  `native_extension_call` EventSink events from the JavaScript probe;
- byte-stability of every first-party OpenDesk build input and every explicit
  extension/smoke/fixture input for the complete run;
- source isolation from a `/tmp` directory containing exactly four files.

## Run

Requirements: macOS, Go, Xcode Command Line Tools, and `python3`.

```bash
python3 tests/extensions/native-process/tools/smoke-harness/main.py
```

Optional arguments:

```bash
python3 tests/extensions/native-process/tools/smoke-harness/main.py \
  --run-id manual-v0 \
  --run-dir .runtime/tests/extensions/native-process/manual-v0 \
  --proof-dir /tmp/opendesk-native-extension-proof-manual-v0
```

`--run-dir` selects the Evidence directory. `--proof-dir` selects the isolated
four-file execution directory. Both must be outside tracked source paths.

To test an already-audited OpenDesk binary while still rebuilding both
extensions:

```bash
OPENDESK_BINARY=/absolute/path/to/opendesk \
  python3 tests/extensions/native-process/tools/smoke-harness/main.py
```

The equivalent explicit argument is:

```bash
python3 tests/extensions/native-process/tools/smoke-harness/main.py \
  --opendesk-binary /absolute/path/to/opendesk
```

Every normal run gets a fresh directory:

```text
.runtime/tests/extensions/native-process/<runId>/
  context.json
  binaries.json
  fixture.json
  calls.ndjson
  results/
  stderr/
  source-dependency-audit.json
  source-input-snapshot.json
  isolation-proof.json
  summary.json
```

The call Evidence intentionally omits params, result bodies, raw protocol
stdout, and image bytes. The checked OCR input is synthetic and its provenance,
expected text, privacy class, and SHA-256 are recorded in
`fixtures/ocr/manifest.json`. `source-input-snapshot.json` records per-file
SHA-256 values before and after the run; a changed HEAD, git-status fingerprint,
or Goal input file makes the final status fail instead of mixing revisions.

## Maintained files

- `smoke.js` is the real JavaScript Runtime API probe. The harness places the
  executables in `bin/native-extensions/` and prepends only stable extension
  names plus the run-local fixture path to a generated copy under `.runtime/`.
- `tools/faulty-extension/main.py` is an independent process used to inject
  crash, timeout, empty, malformed, and mismatched responses.
- `tools/generate-ocr-fixture/main.swift` regenerates the synthetic PNG and its
  manifest. Follow `fixtures/ocr/README.md` and review both outputs together.
- `tools/smoke-harness/main.py` performs builds, calls, assertions, Evidence,
  performance recording, and isolation proof orchestration.

Do not commit anything from `.runtime/` or the `/tmp` proof directory.

For the normal no-routing-field call shape, zero-child discovery, immutable
descriptors, portable/current-user/`.app` roots, and real package Evidence, run:

```bash
python3 tests/extensions/native-plugin/tools/proof-harness/main.py
```
