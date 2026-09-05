# OCR Provider Integration

`opendesk` Vision/OCR uses a provider abstraction instead of baking one heavy OCR engine into the main binary.

Current provider status:

- `apple` / `applevision`: packaged Apple Vision on macOS 12+, accurate local OCR without a network endpoint or tesseract.
- `paddle` / `paddleocr`: implemented, requires external HTTP endpoint.
- `local` / `tesseract`: implemented, uses local `tesseract` CLI.
- `openai`, `azure`, `google`, `aws`: can now be configured as generic HTTP JSON OCR providers through env vars.

## Default Provider Selection

Environment variables:

```bash
VISION_OCR_PROVIDER=apple
VISION_OCR_LANG=ch
```

If `VISION_OCR_PROVIDER` is omitted, macOS defaults to `apple`; other platforms
default to `paddle`. `make build` packages the Apple Vision helper beside the
portable CLI, and `scripts/build_macos_app.sh` puts the same helper inside the
app bundle. A bare `go build` or `go run` does not package it.

## Apple Vision Provider (macOS)

```bash
make build
./dist/opendesk \
  -vision-ocr-image tests/extensions/native-process/fixtures/ocr/opendesk-ocr-123.png \
  -vision-provider apple \
  -vision-lang ch
```

The provider uses Vision's `accurate` recognition level by default. It maps
common OCR aliases such as `ch`, `chi_sim+eng`, and `en` to Apple locale tags,
then converts Apple Vision's lower-left normalized boxes into the top-left
pixel coordinates returned by `Vision.runOCR`.

## Paddle Provider

```bash
VISION_OCR_PROVIDER=paddle
PADDLE_OCR_ENDPOINT=http://127.0.0.1:8868/predict/ocr_system
PADDLE_OCR_API_KEY=
PADDLE_OCR_TIMEOUT_MS=15000
PADDLE_OCR_DEFAULT_LANG=ch
PADDLE_OCR_LANGS=ch,en,chinese_cht,japan,korean
```

## Local Tesseract Provider

```bash
VISION_OCR_PROVIDER=local
VISION_OCR_LANG=ch
```

Requires `tesseract` to be available on the host.

## Generic Third-Party HTTP OCR Providers

The reserved cloud provider names can be activated by setting their endpoint env vars.

Supported prefixes:

- `OPENAI_`
- `AZURE_`
- `GOOGLE_`
- `AWS_`

Shared env shape:

```bash
<PREFIX>OCR_ENDPOINT=https://example.com/v1/ocr
<PREFIX>OCR_API_KEY=secret
<PREFIX>OCR_MODEL=ocr-1
<PREFIX>OCR_DEFAULT_LANG=en
<PREFIX>OCR_LANGS=en,fr
<PREFIX>OCR_RESPONSE_PATH=result
```

Example:

```bash
VISION_OCR_PROVIDER=openai
OPENAI_OCR_ENDPOINT=https://example.com/v1/ocr
OPENAI_OCR_API_KEY=secret
OPENAI_OCR_MODEL=ocr-1
OPENAI_OCR_DEFAULT_LANG=en
OPENAI_OCR_LANGS=en,fr
OPENAI_OCR_RESPONSE_PATH=result
```

The runtime sends a JSON request like:

```json
{
  "image_base64": "...",
  "lang": "en",
  "model": "ocr-1"
}
```

If `*_OCR_RESPONSE_PATH` is set, the response is first narrowed to that dotted JSON path before OCR parsing.

Examples:

- `result`
- `data.result`
- `payload.ocr`

The narrowed object should still contain OCR-like fields such as:

- `text`
- `lines`
- `confidence`
- `bbox`

Or an array compatible with the existing parser.

## Runtime Fallback Chain

Per-call fallback can be declared in `visionProfile.fallback`.

Example:

```js
const result = await Vision.runOCR({
  image: imageBase64,
  visionProfile: {
    provider: "paddle",
    language: "ch",
    timeoutMs: 15000,
    fallback: ["local", "openai"],
  },
});
```

Execution order:

1. try primary provider
2. if it fails, try each fallback provider in order
3. return the first successful OCR result
4. if all fail, return the last error

This is intended for provider unavailability, endpoint misconfiguration, or scenario-specific quality upgrades.

## Recommended Production Strategy

- macOS local/default: packaged `apple` (accurate)
- default local/dev fallback on non-macOS: `local`
- Chinese desktop UI mainline: `paddle`
- premium document/cloud path: configured `google` / `azure` / `aws`
- semantic arbitration or custom paid OCR gateway: configured `openai`

Keep heavy model runtimes outside the main binary whenever possible. The provider abstraction is designed for endpoint-based integration first.
