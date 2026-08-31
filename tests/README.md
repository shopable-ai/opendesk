# tests

本目录用于组织最小测试与回归方案说明。

## JavaScript Runtime API 一致性

OpenDesk JavaScript Runtime API Conformance Lab 位于 `tests/runtime-api/`，按当前 Runtime、
`docs-user-api/`、`docs-user-api/runtime-api.ai.json` 与 `types/*.d.ts` 维护 JavaScript
contract、unit、safe smoke 和 opt-in macOS Safari 真实事件测试：

```bash
./scripts/test_runtime_apis.sh smoke
./scripts/test_runtime_apis.sh live
```

详细分层、证据和新增用例方式见 `tests/runtime-api/README.md`。运行证据统一写入
`.runtime/tests/runtime-api/`。旧
`scripts/test_host_apis.sh` 仅为会打印 deprecated 提示的兼容入口。

## OpenCV ImageColor 夹具

OpenCV ImageColor 的确定性输入和期望配对清单位于
`tests/opencv/fixtures/image-color/`，不放入通用输出目录。生成器默认写入
`.runtime/generated/opencv/image-color/`；确认后才使用显式 `--output` 更新测试夹具。

## Round 1 基线

优先复用仓库现有 Go 测试：

```bash
go test ./automation -run 'Test(ParseScreenshotOptions|BuildScreenshotResponse|ImageColorAnalyzeLayoutReturnsCoarseGenericSegmentation|LayoutWithTextNoise|VisionAnalyzeLayoutWithGenericHints)'
go test ./pkg/visionrun
```

## 后续要补的测试层

### 1. Unit
- 坐标映射
- role inference
- schema validation

### 2. Golden
- 固定微信截图 -> 固定 regions.json
- 固定 regions.json -> 固定 mirror.png
- 固定 source.png vs mirror.png -> 固定 diff report

### 3. Replay
- 按所属领域的 `tests/<domain>/replays/*.json` 重放步骤
- 检查关键工件是否齐备

### 4. Regression Gate
- diff ratio 不可恶化超过阈值
- 关键 region IoU 不可低于阈值
- 关键 OCR 文本相似度不低于阈值
