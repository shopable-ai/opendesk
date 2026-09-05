# tests

本目录用于组织最小测试与回归方案说明。

开发者需要按功能查找测试脚本、入口命令和已知失败时，先看
[`docs/quality/developer-test-catalog.md`](../docs/quality/developer-test-catalog.md)。

## JavaScript Runtime API 一致性

OpenDesk JavaScript Runtime API Conformance Lab 位于 `tests/runtime-api/`，按当前 Runtime、
`docs/api/`、`docs/api/runtime-api.ai.json` 与 `types/*.d.ts` 维护 JavaScript
contract、unit、safe smoke 和 opt-in macOS Safari 真实事件测试：

优先直接运行 JavaScript：

```bash
./dist/opendesk -script tests/runtime-api/contract.js -console-mode script
./dist/opendesk -script tests/runtime-api/unit.js -console-mode script
./dist/opendesk -script tests/runtime-api/smoke.js -console-mode script
```

全部测试 JS、单文件命令和 runner 对应关系见
[`docs/quality/developer-test-catalog.md`](../docs/quality/developer-test-catalog.md)。

正式 gate 使用唯一的 OpenDesk Runtime JavaScript 编排入口：

```bash
./dist/opendesk -script scripts/test_runtime_apis.js -console-mode script
OPENDESK_RUNTIME_API_MODE=live ./dist/opendesk -script scripts/test_runtime_apis.js -console-mode script
```

详细分层、证据和新增用例方式见 `tests/runtime-api/README.md`。运行证据统一写入
`.runtime/tests/runtime-api/`。旧 shell wrapper 已删除；正式入口始终是 OpenDesk Runtime
JavaScript。

## CLI 终端输出

终端颜色、管道纯文本、Agent JSON 和 artifact ANSI 隔离由独立 JavaScript 黑盒验证：

```bash
node tests/cli-output/console-color.js
```

运行前需先用 `make build` 刷新 `dist/opendesk`；细节见
[`tests/cli-output/README.md`](cli-output/README.md)。

## OpenCV ImageColor 夹具

OpenCV ImageColor 的确定性输入和期望配对清单位于
`tests/opencv/fixtures/image-color/`，不放入通用输出目录。生成器默认写入
`.runtime/generated/opencv/image-color/`；确认后才使用显式 `--output` 更新测试夹具。

## Native Process Extension V0

Experimental Native Process Extension 的 Go/Swift build、真实 Apple Vision OCR、
失败矩阵、Evidence 与源码隔离 smoke 位于 `tests/extensions/native-process/`：

```bash
python3 tests/extensions/native-process/tools/smoke-harness/main.py
```

运行结果统一写入 `.runtime/tests/extensions/native-process/<runId>/`；该 Prototype
不得标记为 Stable。

## Native Extension Plugin V1

严格 manifest 自动发现、不可变 `NativeExtensions.<namespace>.<method>` Binding、
zero-child discovery、portable/current-user/`.app` roots、真实 Apple Vision OCR、
源码隔离 package 和 Evidence 隐私验收位于 `tests/extensions/native-plugin/`：

```bash
python3 tests/extensions/native-plugin/tools/proof-harness/main.py
```

结果写入 `.runtime/tests/extensions/native-plugin/<runId>/`。V1 仍是 Experimental；
第三方 JS facade、persistent process 和 startup activation 不属于该测试域。

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
