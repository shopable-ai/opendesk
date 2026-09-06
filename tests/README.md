# tests

本目录用于组织最小测试与回归方案说明。

开发者需要按功能查找测试脚本、入口命令和已知失败时，先看
[`docs/quality/developer-test-catalog.md`](../docs/quality/developer-test-catalog.md)。

## 示例、测试与诊断工具归位

目录边界和第一批迁移见 [目录与迁移规则](../docs/quality/example-test-layout.md)。
SQLite 共享断言位于 `runtime-api/support/sqlite-smoke-cases.js`，正式 unit 与独立 smoke
直接加载它；`examples/sqlite/` 的旧测试路径仅保留兼容入口。

```bash
./dist/opendesk -script tests/runtime-api/sqlite-smoke.js -console-mode script
node --test tests/test-architecture/layout.test.js
node scripts/audit_test_architecture.js
```

后两条是宿主侧目录/工具检查，不验证 Runtime 公共 API 或真实桌面行为。图像分级分析工具为
`tests/automation/tools/image-layout-lab/analyze-progressive.js`；其报告必须区分诊断完成和识别
正确性。现有 Runtime 正式编排入口、领域目录及 Go 同包私有测试保持不变。

## 按接口组独立运行与模块化编排

接口用例继续在 `runtime-api/unit/<family>.test.js` 独立维护；正式入口不堆接口逻辑。
编排职责已拆至 `runtime-api/gates/suites/`，模式以 `gates/registry.js` 为唯一注册表。
结构、全部模式与验收边界见 [Runtime API 测试模块](../docs/quality/runtime-api-test-modules.md)。

从仓库根目录仅运行 File 和 path 的既有 unit 文件：

```bash
OPENDESK_RUNTIME_API_UNIT_FILTER=file,path ./dist/opendesk -script tests/runtime-api/unit-selected.js -console-mode script
```

需要相同选择的 run-local 构建、watchdog 与资源清理证据时：

```bash
OPENDESK_RUNTIME_API_MODE=unit-selected OPENDESK_RUNTIME_API_UNIT_FILTER=file,path ./dist/opendesk -script scripts/test_runtime_apis.js -console-mode script
```

选择结果明确为 `selected-unit-files`，不写入完整 `unit.json`、coverage 或 quality 通过记录。
空值、未知 ID、路径/通配符或没有注册任何测试的文件都会失败。普通全量 `unit`/`smoke`/`live`
不接受筛选变量，防止误用；各接口专用 gate（例如 `sqlite`）仍优先用于生命周期完整验收。

维护编排模块后运行宿主侧检查（不替代真实 Runtime 测试）：

```bash
node --test tests/test-architecture/runtime-api-modules.test.js
```

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
