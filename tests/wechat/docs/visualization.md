# WeChat visualization workflow

## Current paths

- Stable inputs: `tests/wechat/fixtures/`
- Disposable output: `.runtime/tests/wechat/`
- Standalone visualizers: `tests/wechat/tools/`

Run the JavaScript workflow from the repository root:

```bash
./testMonkey-go -script tests/wechat/wechat_visualization.js
```

Generate deterministic mock inputs and visualizations with the isolated Go
tools:

```bash
go run ./tests/wechat/tools/generate-simple-image
go run ./tests/wechat/tools/generate-mock-image
go run ./tests/wechat/tools/visualize-improved \
  .runtime/tests/wechat/mock_wechat.png \
  .runtime/tests/wechat/result_median.json
```

The tools create their parent output directory when needed. Generated PNG and
JSON files remain local under `.runtime/`; promote a result to `fixtures/` only
after it becomes a reviewed, deterministic test input.

Historical precision and recall figures are intentionally not repeated here:
they describe old runs, not a standing quality guarantee. Current claims must
point to current run evidence.
