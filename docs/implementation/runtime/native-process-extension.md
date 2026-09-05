# Native Process Extension V0 实现记录

更新时间：2026-09-01

状态：**Experimental Prototype**。本文记录已经真实实现和验证的 V0；它不是 Stable API，也不是完整 Native Plugin Platform。

## 1. 已证明的结论

本轮已经在 macOS 实机证明以下组合可以工作：

```text
OpenDesk binary
+ independent Extension executable
+ public stdin/stdout JSON protocol
```

Go 示例只使用 Go standard library；Swift OCR 示例只 import `Foundation`、`ImageIO`、`Vision`。两者都不 import OpenDesk 内部 package。最终又把运行所需的四个文件复制到 `/private/tmp`，从该目录完成 `hello`、`add` 和真实 Apple Vision OCR。

最终冻结源码 smoke：

```text
runId: 20260831T160214Z-68069
HEAD: 4ad39fbf74c32da8ecdf36580b589b73f98637cd
status: passed
calls: 23 passed, 0 failed
prototypeStatus: experimental
source inputs: 97 -> 97, changes 0
```

`runId` 使用 UTC；本地 Asia/Shanghai 完成时间为 2026-09-01。

该验证发生在用户现有的 dirty shared worktree；没有把 dirty 状态伪装成已提交
快照。Harness 对本 Goal 的 97 个实际 build/smoke 输入逐文件记录 SHA-256，且
确认整个 run 期间 HEAD、git-status fingerprint 和这些输入都没有变化。

本地证据入口：

- `.runtime/tests/extensions/native-process/20260831T160214Z-68069/summary.json`
- `.runtime/tests/extensions/native-process/20260831T160214Z-68069/calls.ndjson`
- `.runtime/tests/extensions/native-process/20260831T160214Z-68069/source-input-snapshot.json`
- `.runtime/tests/extensions/native-process/20260831T160214Z-68069/source-dependency-audit.json`
- `.runtime/tests/extensions/native-process/20260831T160214Z-68069/isolation-proof.json`
- `.runtime/tests/extensions/native-process/20260831T160214Z-68069/results/javascript-api.json`

这些是本地可清理运行产物，不进入版本控制。

## 2. 实现位置

- Host 与 wire contract：`pkg/nativeextension/`
- CLI 直调入口：`cmd/opendesk/main.go`
- Experimental Goja adapter：`automation/native_extension.go`
- Runtime opt-in 传递：`automation/utils.go`、`pkg/execution/runner.go`
- Go 示例：`examples/native-extensions/go-basic/`
- Swift/Vision 示例：`examples/native-extensions/macos-vision/main.swift`
- 可直接运行的用户示例：`examples/native-extensions/quickstart.js`
- Runtime API test：`tests/runtime-api/unit/native-extension.test.js`
- 跨进程 smoke：`tests/extensions/native-process/`
- 正式 smoke 入口：`python3 tests/extensions/native-process/tools/smoke-harness/main.py`

`NativeExtension.call` 默认不注入。V1 之后只有受信任的本机 CLI script 显式传
`-experimental-unsafe-native-extension-call` 才启用这个低层兼容入口；
`-experimental-native-extension` 只启用严格 manifest registry 和不可变
`NativeExtensions`。HTTP execution 没有远程开关，MCP 也没有接入。

## 3. Native Process Protocol V0

固定 transport：stdin/stdout、UTF-8 JSON、one request、one response。stdout 只承载协议，diagnostic 写 stderr。

```json
{
  "protocol": "opendesk-native-extension",
  "version": 1,
  "id": "req-1",
  "method": "hello",
  "params": { "name": "OpenDesk" }
}
```

```json
{
  "protocol": "opendesk-native-extension",
  "version": 1,
  "id": "req-1",
  "ok": true,
  "result": { "message": "Hello OpenDesk" }
}
```

```json
{
  "protocol": "opendesk-native-extension",
  "version": 1,
  "id": "req-1",
  "ok": false,
  "error": {
    "code": "invalid_params",
    "message": "a and b are required"
  }
}
```

Host 严格校验 protocol、version、request id、`ok` 和互斥的 result/error shape；V0 response 的未知字段 fail closed。

## 4. 已验证 build 命令

最终 smoke 实际执行：

```bash
go build -o .runtime/tests/extensions/native-process/<runId>/bin/opendesk ./cmd/opendesk

(
  cd examples/native-extensions/go-basic
  go build -o ../../../.runtime/tests/extensions/native-process/<runId>/bin/native-ext-go-basic .
)

xcrun swiftc \
  -target x86_64-apple-macosx12.0 \
  examples/native-extensions/macos-vision/main.swift \
  -framework Vision \
  -framework ImageIO \
  -o .runtime/tests/extensions/native-process/<runId>/bin/native-ext-macos-vision
```

可重复执行的正式入口会创建新的 run directory：

```bash
python3 tests/extensions/native-process/tools/smoke-harness/main.py
```

## 5. 已验证调用

CLI 直调模式在 Runtime/asset 初始化前执行，因此隔离目录只需要 binary、Extension 与 OCR fixture：

```bash
./opendesk \
  -native-extension /absolute/path/native-ext-go-basic \
  -native-method hello \
  -native-params '{"name":"OpenDesk"}' \
  -native-timeout-ms 3000
```

结果包含：

```json
{"ok":true,"result":{"message":"Hello OpenDesk"}}
```

```bash
./opendesk \
  -native-extension /absolute/path/native-ext-go-basic \
  -native-method add \
  -native-params '{"a":20,"b":22}' \
  -native-timeout-ms 3000
```

结果包含：

```json
{"ok":true,"result":{"value":42}}
```

```bash
./opendesk \
  -native-extension /absolute/path/native-ext-macos-vision \
  -native-method ocr \
  -native-params '{"imagePath":"/absolute/path/ocr-test.png","recognitionLevel":"accurate","languages":["en-US","zh-Hans"]}' \
  -native-timeout-ms 10000
```

真实 OCR：

```text
OPENDESK OCR 123
你好 456
```

返回 2 个 items，image 为 `1200 x 520`。`items[].boundingBox` 是 processed image 的 normalized coordinate，原点 lower-left，不是 pixel coordinate。Swift 示例显式按 top-to-bottom、同一行 left-to-right 生成稳定阅读顺序。

本机 JavaScript Runtime 调用必须显式 opt in：

```bash
.runtime/build/opendesk \
  -experimental-unsafe-native-extension-call \
  -script /absolute/path/to/v0-diagnostic.js \
  -console-mode script
```

```js
const result = NativeExtension.call({
  executable: "/absolute/path/to/native-ext-go-basic",
  method: "add",
  params: { a: 20, b: 22 },
  timeoutMs: 3000
});
```

## 6. Host 错误与资源边界

已实现并覆盖：

```text
invalid_request
invalid_params
invalid_executable
executable_not_found
permission_denied
start_failed
process_failed
timeout
canceled
child_exit_nonzero
empty_response
response_too_large
invalid_json
invalid_response
protocol_mismatch
request_id_mismatch
extension_error
```

默认 process/protocol deadline 为 3 秒；stdout 上限 1 MiB，stderr capture 上限 64 KiB，Evidence stderr summary 上限 4 KiB。Unix timeout 会终止整个 child process group；Windows V0 只保证终止直接 child。

`timeoutMs` 从 executable/params 本地校验及 Request 编码之后开始约束 child start/wait/protocol response。V0 没有独立 request-size cap。

## 7. Evidence 与隐私

每次实际 Host 调用记录：

```text
executable / method
protocol / protocolVersion / requestId
startupDurationMs / durationMs
exitCode
status / errorCode / extensionErrorCode
stderrSummary / stderrTruncated
```

Evidence 不记录 params、result、raw stdout 或图片内容。最终 JS smoke 从真实 EventSink 校验了 4 条 `native_extension_call`：3 success、1 `extension_error/invalid_params`，request ID 全部非空且唯一，并确认没有 params/result/stdout/imagePath 字段泄漏。

## 8. 失败矩阵与测试结果

最终 23 个用例覆盖：

```text
hello / add / real Apple Vision OCR
unknown method
missing a / missing b / wrong type
missing executable / non-executable / start_failed
child crash / nonzero exit
empty stdout / invalid JSON stdout
protocol mismatch / request-id mismatch
timeout
stderr diagnostic without stdout pollution
OCR image not found / invalid image
real JavaScript NativeExtension.call
isolated hello / add / OCR
```

相关门禁：

```text
SKIP_FYNE_INIT=1 go test -p 1 \
  ./pkg/nativeextension ./pkg/execution ./pkg/http ./cmd/opendesk ./automation

OPENDESK_RUNTIME_API_MODE=unit ./dist/opendesk -script scripts/test_runtime_apis.js -console-mode script
# 294 passed, 0 failed
# .runtime/tests/runtime-api/20260831T160252Z-70330/results/unit.json

OPENDESK_RUNTIME_API_MODE=contract ./dist/opendesk -script scripts/test_runtime_apis.js -console-mode script
# 227 passed, 0 failed
# .runtime/tests/runtime-api/20260831T160338Z-70896/results/contract.json
```

不设置 `SKIP_FYNE_INIT=1` 时，仓库既有的 `TestRuntimeLifecycleDoesNotAccumulateGoroutines` 仍复现 `baseline=38 current=78`；该失败在本 Goal 修改前已经存在，不能把未隔离的全包命令报告为 green。

## 9. 源码隔离与依赖审计

最终 proof directory：

```text
/private/tmp/opendesk-native-extension-proof-20260831T160214Z-68069/
  opendesk
  native-ext-go-basic
  native-ext-macos-vision
  ocr-test.png
```

运行前后都严格只有这四个文件，三个方法全部通过。Go audit 为 no `require`、no non-standard import、no OpenDesk Core import；Swift imports 恰为 Foundation/ImageIO/Vision。正式 fixture 是项目生成的 synthetic image，SHA-256：

```text
1e3d35fbcbebf80575615b345e2d3df5938881a8101e5d2d3766e1b3e465e7fa
```

## 10. 性能记录

这是一次本机样本，不是 benchmark：

| 指标 | 实测 |
| --- | ---: |
| Host `startupDurationMs` | 1 ms |
| cold one-shot `process + hello + exit` proxy | 768.733 ms |
| hello CLI total / child | 1118.029 / 6 ms |
| add CLI total / child | 37.063 / 6 ms |
| OCR CLI total / child | 1243.549 / 1214 ms |

首次执行的冷启动明显高于随后调用，但单次样本尚不足以证明必须引入 persistent process。OCR 本身远高于 process start，继续 V1 前应先在目标机器和代表性频率下采样分布。

## 11. 当前限制与下一步

尚未实现：persistent process、pool、heartbeat、reconnect、hot reload、Extension Manager/Store、在线安装、签名/权限系统、复杂 sandbox、Wasm/Lua/Go plugin、shared-library ABI、Protobuf/MessagePack/shared memory、完整 SDK。

V1 建议：先保留 one-shot。只有重复样本证明冷启动对真实高频场景构成稳定瓶颈，且收益足以覆盖进程生命周期、状态隔离、重连和 crash recovery 复杂度时，再设计 Persistent Native Process V1。
