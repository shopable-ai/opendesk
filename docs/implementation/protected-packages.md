# Protected Package 开发与测试指南

本文面向维护 OpenDesk Runtime、测试 `.js` 到 `.odpkg` 闭环的开发者。公开 CLI 参数、JSON envelope、错误码和 manifest
契约以 [受保护包 CLI](../api/protected-packages.md) 为准；Publisher/管理员的密钥生命周期见
[Protected Package Publisher 与密钥运维](../maintenance/protected-packages.md)，安全模型见
[Protected Package Security Model](../architecture/execution/protected-package-security-model.md)。

`.odpkg` 是单 JavaScript entrypoint 的受保护包，不是 App Mode desktop package。它沿用既有 Runtime：

```text
.js    -> PlainScriptLoader -> ScriptSource -> existing pkg/execution.Run()
.odpkg -> ProtectedPackageLoader -> verify -> authorize -> resolve DEK
       -> AES-256-GCM in-memory decrypt -> ScriptSource -> existing pkg/execution.Run()
```

## 构建 Runtime

所有命令从仓库根目录执行。先构建当前 checkout 的 CLI 及其配套 UI host：

```bash
make build
```

`dist/opendesk` 已存在不代表它来自当前源码；本轮代码资格验证应先执行上述命令。basic smoke 本身不启动 UI host，
但完整资格测试会使用同一次构建的配套 host。

## 先运行明文 basic.js

```bash
./dist/opendesk \
  -script "$PWD/examples/protected-packages/basic.js" \
  -console-mode script
```

成功输出包含：

```text
protected-package-basic:business-result-written
```

该脚本将真实的确定性业务结果写到其 execution artifact 的 `business-result.json`。不要在测试中重算一个
“expected” 后替代这个实际结果。

## 日常：Basic Protected Package Smoke Test

```bash
./dist/opendesk \
  -script "$PWD/tests/protected-packages/basic-runtime-smoke.js" \
  -console-mode script
```

这是无 UI 的核心本地闭环，使用现有 `examples/protected-packages/basic.js` 和正式 CLI，而非 Go encryption helper。
它会完成：

```text
plain basic.js
-> plain/business-result.json
-> package protect
-> package inspect
-> package verify
-> license device -> issue -> inspect -> verify -> install
-> delete Publisher DEK and raw License
-> authorized basic.odpkg direct -script execution
-> protected/business-result.json
-> compare schemaVersion, contract, values, weightedTotal, label
-> plaintext disclosure and protected-snapshot checks
```

成功标记是：

```text
[PROTECTED-PACKAGE-BASIC] passed
```

失败标记是 `[PROTECTED-PACKAGE-BASIC] failed`，并包含 phase、实际 child command、exit code、stderr 和
artifact directory。该 runner 会选择共享 `runtime-equivalence.js` 中的 `basic` lane；它不需要 OCR、Screen
Recording、Accessibility、Calculator 或 native Dialog。它仍需要 macOS 的 production Keychain P1 provider、
OpenSSL 和本地 Command capability，因为授权步骤是真实的 device-bound License 流程。

每次测试会创建独立目录：

```text
.runtime/tests/protected-packages/<Execution.id>/
├── lanes/basic/plain/business-result.json
├── lanes/basic/protected/business-result.json
├── packages/basic/basic.odpkg
├── commands/
├── acceptance-ledger.json
└── runtime-equivalence-summary.json
```

临时 Publisher/issuer private keys、per-package DEK、raw `.odlicense`、isolated installed P1 root 和测试
Keychain 都会清理；保留 encrypted package、public keys、安全 JSON envelope 和业务证据。`.runtime/` 是可清理
运行产物，不应提交。

## 完整 Runtime Equivalence 资格测试

```bash
./dist/opendesk \
  -script "$PWD/tests/protected-packages/runtime-equivalence.js" \
  -console-mode script
```

完整测试保持三个独立 lane：

| Lane | 覆盖 | 额外前置条件 |
| --- | --- | --- |
| `basic` | 核心 package/P1/运行/结果等价与泄露 smoke | macOS Keychain、OpenSSL、Command |
| `parameterized` | 同一 `ai run --input-file` 的结果等价 | 与 basic 相同 |
| `ui` | native Dialog 语义、截图、OCR、几何与视觉证据 | Screen Recording、Accessibility、Apple OCR、配套 UI host |

UI lane 因权限失败时，只能报告该 native UI qualification 未通过；它不推翻已经独立通过的 basic core smoke。
UI 自动化功能成功也不等于视觉通过，仍需审阅保留的截图。

## 检查生成的 package

basic runner 在 success JSON 中给出本次 package path；也可以从上述 run directory 直接检查：

```bash
./dist/opendesk package inspect .runtime/tests/protected-packages/<Execution.id>/packages/basic/basic.odpkg
./dist/opendesk package verify .runtime/tests/protected-packages/<Execution.id>/packages/basic/basic.odpkg --public-key .runtime/tests/protected-packages/<Execution.id>/publisher-public.pem
```

`inspect` 读取公开 manifest 和 digest；`verify` 只验证 Publisher signature。它们都不代表 device 获得授权，
也不能替代实际 `.odpkg` execution。

## Smoke 的安全检查

basic 和完整 test 都验证：

- `.odpkg` 存在、非空，且 raw bytes 不等于也不包含完整 JavaScript source；
- `basic.js` 的稳定业务 marker 不在 raw package bytes 中；
- `package inspect` / `verify` 输出不包含 JavaScript plaintext；
- 公开 manifest 只有 `encryption.algorithm`、`keyId`、`nonce`，不含 DEK；
- protected execution 不生成 `script_snapshot.js`，其 summary 也不声明 source snapshot；
- plain/protected 两份真实 `business-result.json` 精确相等，且包含约定业务字段；
- protected execution 前 Publisher DEK 与 raw License 已删除，运行只能走 installed production provider chain。

这是 at-rest plaintext disclosure smoke，不能表述为“源码永远无法恢复”或“不可能被逆向”。拥有设备管理员、调试、
binary patch 或 process-memory inspection 能力的攻击者仍可能在已授权设备上做高级分析。

## 常见失败定位

| 现象 | 首先检查 |
| --- | --- |
| `packageStructureSignature` | `commands/*package*.json`、manifest IDs、新 output path、Publisher public/private key 是否成对 |
| `p1Authorization` | `license device/issue/verify/install` envelope、Keychain 可用性、isolated install root 的清理 |
| `plainRuntime` | `lanes/basic/plain/business-result.json` 和 basic.js 自身日志 |
| `protectedRuntime` | `lanes/basic/protected/summary.json`、installed pins/License、snapshot absence、DEK/raw License 是否在执行前删除 |
| `parameterEquivalence` | 是否两端确实用了相同的 `--input-file` |
| `uiSemanticAcceptance` / `uiVisualAcceptance` | macOS permissions、配套 UI host、screenshots、OCR/geometry evidence 和人工视觉审阅 |
| `securityCleanup` | summary 中的 `cleanup`；不要用通配删除，先确认仅处理该 run directory 的短生命周期材料 |

先查看 `acceptance-ledger.json` 的八步顺序，再查看 `runtime-equivalence-summary.json` 中 failure class 和安全清理结果。
不要打印、上传或在 issue 中粘贴 private key、DEK、raw License、activation token 或 device private material。

## Go 回归

修改 package、loader 或 CLI 后，从仓库根目录运行：

```bash
go test ./pkg/scriptpackage/... ./pkg/scriptloader/... ./internal/packagecli/...
go test ./...
```

随后重新执行明文 basic、basic runtime smoke；在 UI 权限满足时再运行完整资格测试。
