# Native Process Extension V0 Prototype Goal

## 角色

你正在 OpenDesk 仓库中实现或复核 Native Process Extension V0。先读取当前 HEAD、工作树、近期相关提交和真实目录；已有能力应复用、补测试和补 Evidence，不得再造第二套 Host、Runtime bridge 或测试域。

## 唯一核心目标

用真实 Runtime Evidence 证明：

```text
OpenDesk binary
+ independent Extension executable
+ public protocol
```

即可工作。第三方 Extension 不 import OpenDesk 内部 package，不修改 OpenDesk Core，也不需要 OpenDesk Core 源码。

必须真实调用三个最小 method：

```text
hello  → process startup、protocol、string params、structured result
add    → numeric params、dispatch、result、structured parameter errors
ocr    → independent Swift executable → Apple Vision → real OCR
```

## 状态约束

这个接口和结论只能标记为 **Experimental Prototype**。禁止写成 Stable、完整 Native Plugin Platform、Extension Marketplace 或完整 SDK。

最终结论必须分别列出：

```text
Implemented
Tested
Verified
Experimental
Not Implemented
```

代码存在不等于 Tested；测试通过不等于真实 OCR 和源码隔离已经 Verified。

## V0 process model

只实现 one-shot：

```text
start extension process
→ write one UTF-8 JSON request to stdin
→ close stdin
→ read one UTF-8 JSON response from stdout
→ capture stderr
→ wait for process exit
→ validate response
→ return result / structured error
```

不要实现 persistent process、pool、heartbeat、reconnect 或 hot reload。

## Strict Native Process Protocol V0

固定：

```text
protocol = opendesk-native-extension
version = 1
stdin/stdout = UTF-8 JSON
one request / one response
stdout = protocol only
stderr = diagnostics only
```

Request：

```json
{
  "protocol": "opendesk-native-extension",
  "version": 1,
  "id": "req-1",
  "method": "hello",
  "params": { "name": "OpenDesk" }
}
```

Success：

```json
{
  "protocol": "opendesk-native-extension",
  "version": 1,
  "id": "req-1",
  "ok": true,
  "result": { "message": "Hello OpenDesk" }
}
```

Error：

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

校验 protocol、version、id、ok 和互斥的 result/error shape；unknown response fields fail closed。V0 不增加 schema registry、Protobuf 或 MessagePack。

## Host 要求

先搜索现有 process、timeout/cancellation、execution 与 EventSink/Evidence 基础设施。Host 至少负责：

```text
validate absolute executable path
start process without a shell
encode request / close stdin
bounded stdout and stderr capture
timeout and parent-context cancellation
wait and collect exit code
strict response validation
privacy-minimized Evidence
```

至少诊断：

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

错误必须保留 executable、method、duration、exit code、stderr summary 和 error code，不能只返回 “extension failed”。

## JavaScript Runtime API

若当前 Runtime 架构已接受该 Prototype global，则提供：

```js
const result = NativeExtension.call({
  executable: "/absolute/path/to/extension",
  method: "hello",
  params: { name: "OpenDesk" },
  timeoutMs: 3000
});
```

成功直接返回 Extension `result`。失败必须抛出真正的 JavaScript `Error`，并设置：

```text
error.code
error.extensionCode
error.evidence
```

使用手写 Goja wrapper 保留结构化字段；不要使用会丢失字段的通用 reflection wrapper。传入 execution context 和 EventSink。这个 process-launching global 必须默认关闭：只有受信任的本机 CLI script 通过 `-experimental-native-extension` 显式 opt-in；HTTP execution 不提供远程开关，MCP 若是独立 direct wrapper 也不接入。即使 CLI 与 HTTP 共享 Runtime 初始化，也不能共享 enablement。

同步更新 `docs-user-api/`、`runtime-api.ai.json`、`types/`、`tests/runtime-api/manifest.js` 和正式 JS Runtime unit。

## Independent extensions

Go basic Extension 只依赖 Go standard library，不 import `opendesk/...`：

- `hello({name})` → `{message: "Hello " + name}`
- `add({a,b})` → `{value: a+b}`
- missing/wrong-type params 和 unknown method → structured `ok:false`

Swift macOS Extension 只依赖 Foundation/ImageIO/Apple Vision，通过 `VNRecognizeTextRequest` / `VNImageRequestHandler` 实现 `ocr`。不要调用 OpenDesk OCR 内部实现，不为较新 Vision API 无必要提高最低 macOS 版本。

OCR input：

```json
{
  "imagePath": "/absolute/path/test.png",
  "recognitionLevel": "accurate",
  "languages": ["zh-Hans", "en-US"]
}
```

OCR output 至少有 `text`、`items[].text`、`confidence`、`boundingBox`、image dimensions 和 coordinate-system metadata。明确 Apple Vision bounding box 是 processed image 的 normalized coordinate、origin lower-left，不是 pixel coordinate。

## Fixtures 与 tests

先复用仓库已有稳定 OCR fixture；没有才新增 synthetic、无网络、来源明确且可提交的 fixture。私人截图不能成为正式 fixture。

正式 Runtime API 测试必须是 `tests/runtime-api/` 下的 JavaScript，由 `./dist/opendesk -script scripts/test_runtime_apis.js -console-mode script` 运行；指定测试模式时使用 `OPENDESK_RUNTIME_API_MODE=<mode>`。Evidence 写 `.runtime/tests/runtime-api/`。测试 runner 应在 run directory 构建独立 Go Extension 并通过 context 注入绝对路径。

跨进程协议、Swift/Vision、fault injection 和源码隔离 smoke 使用 `tests/extensions/native-process/`；运行产物只能进入 `.runtime/tests/extensions/native-process/` 和明确的 `/tmp` proof directory。

至少覆盖：

```text
hello / add / real OCR
missing and wrong-type params / unknown method
missing and non-executable path
child crash / nonzero exit
empty stdout / invalid JSON
protocol mismatch / request id mismatch
timeout
OCR image not found / invalid image
stderr diagnostics without stdout pollution
```

## Source-isolation proof

构建后创建新的 `/tmp/opendesk-native-extension-proof-<runId>/`，只复制：

```text
opendesk
native-ext-go-basic
native-ext-macos-vision
ocr fixture
```

不得复制 OpenDesk/Extension source、`.git`、`automation/` 或 `pkg/`。在该目录真实执行 hello、add、ocr 并记录 hashes、commands、results 和 Evidence。

## Evidence/privacy/performance

每次调用记录：

```text
executable
method
protocol version
request id
startup duration
total duration
exit code
status
host error code
extension error code
bounded stderr summary
```

不要记录完整 params、result、raw stdout、image bytes、账号、token 或敏感业务数据。记录 process startup、hello、add 和 OCR latency；先测量，不先假设 one-shot 太慢。

## 明确不做

```text
Persistent Extension Process / pool / heartbeat / reconnect / hot reload
Extension Manager / Marketplace / Store / online install
Wasm / Lua / Go plugin
dylib / so / dll ABI
Protobuf / MessagePack / Shared Memory
permission/signature system / complex sandbox
complete Extension SDK
```

只有 V0 全部真实通过后才能创建 implementation 文档；路线判断留在现有 runtime extension roadmap，避免复制为 research 文档。

## 最终输出 contract

按真实证据给出：

```text
1. current final HEAD
2. changed files
3. Protocol V0
4. Host location
5. Go Extension location
6. Swift OCR Extension location
7. build commands actually executed
8. hello command/result
9. add command/result
10. OCR command/result
11. failure-path results
12. source-isolation result
13. latency data
14. Evidence and privacy audit
15. current limitations
16. whether Persistent V1 is justified by data
17. next-stage recommendation
```

对没有真实运行证据的项明确写 `Not Verified`，不得用计划或预期代替结果。
