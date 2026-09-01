# Native Process Apple Vision OCR fixture

`opendesk-ocr-123.png` is a repository-owned, synthetic image used only by the
Native Process Extension V0 smoke test. It contains exactly two expected text
lines:

```text
OPENDESK OCR 123
你好 456
```

The image contains no screenshot, account, contact, token, or other user data.
`manifest.json` records its expected text, dimensions, SHA-256, privacy class,
and provenance. The PNG is the reviewed test input; runtime OCR results belong
under `.runtime/tests/extensions/native-process/<runId>/`.

## Regenerate

On macOS, build and run the checked-in generator:

```bash
mkdir -p .runtime/tools/native-process
xcrun swiftc \
  tests/extensions/native-process/tools/generate-ocr-fixture/main.swift \
  -framework AppKit \
  -o .runtime/tools/native-process/generate-ocr-fixture
.runtime/tools/native-process/generate-ocr-fixture \
  --output-dir tests/extensions/native-process/fixtures/ocr
```

The generator uses macOS system fonts only while rasterizing the image; it does
not redistribute a font file or use an external image asset. Font rasterization
can change across macOS releases, so a regenerated PNG and manifest must be
reviewed together before they replace the checked fixture.
