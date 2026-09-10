# Protected Recipe 当前状态

## Current stage

```text
P2｜Online Entitlement
Status: Ready
```

## Current checkpoint

P1 已完成并提交：

```text
81a847f752849a2df4bad0b1dfd63617171814a0
feat: add device-bound offline licensing
```

该 SHA 只用于 P1 实现定位。恢复工作时仍必须先读取当前 `master / HEAD`，不得 reset 到该提交，也不得覆盖其后其他会话产生的修改。

P1 在 P0 package/loader seam 上完成：

- P-256 installation identity 与稳定 DeviceID。
- macOS Keychain / Windows current-user DPAPI secure-store owner。
- Ed25519 签名的 `.odlicense` v1 与 strict parser。
- P-256 ECDH + HKDF-SHA256 + AES-256-GCM wrapped DEK。
- production `DeviceLicenseVerifier` / `DeviceBoundContentKeyProvider`。
- `license device/issue/inspect/verify/install` CLI。
- authorized-device execution、zero-execution negative gates、plain `.js` 与 disclosure 回归。

完整实现和验证证据见 [`p1-device-bound-license.md`](p1-device-bound-license.md)。P1 是离线单设备授权 MVP；没有 online activation、subscription、refresh/revoke 或 device-count service。

## Next action

下一步读取并执行 [`p2-online-entitlement.md`](p2-online-entitlement.md)：

```text
P1 offline device license
→ entitlement service boundary
→ online activation / device limits
→ signed refresh/revoke state
→ bounded offline grace/cache
→ existing LicenseVerifier / ContentKeyProvider
```

P2 必须继续保持：

- 普通 `.js` 无 License/device activation 前置。
- `.odpkg` 继续进入现有 `pkg/execution.Run()` / Goja。
- P1 offline License 可独立工作，online service 只刷新 entitlement，不进入 `pkg/execution`。
- 不内置 server/private signing key、master key、DEK、万能 License 或测试 bypass。

详细门禁见 [`p2-online-entitlement.md`](p2-online-entitlement.md)。

## P1 completion evidence

- `go test ./...`、P1 owner `go test -race` 与相关 `go vet` 通过。
- `go build -o dist/opendesk ./cmd/opendesk` 通过。
- macOS Keychain live、License CLI、authorized Direct/AI `.odpkg` binary smoke 通过。
- wrong-device/no-license/expired/tamper/unknown-publisher zero-execution gates 通过。
- protected plaintext/DEK/snapshot disclosure 扫描与普通 `.js` Direct/AI regression 通过。
- Windows P1 owner cross-compile 通过；Windows live/full app packaging 未执行。
- test architecture audit 与 `git diff --check` 通过。

## 当前阻塞

无 P2 架构阻塞。Windows live/full application packaging 尚无当前设备证据，按仓库跨平台规则保留为独立后续验证，不阻塞 P2 启动。

## 恢复时最短指令

新会话只需要给 Agent：

```text
读取 AGENTS.md、docs/architecture/execution/protected-recipe-package.md、
docs/plans/runtime/protected-recipe/README.md、STATUS.md 和 p2-online-entitlement.md；
以当前 master / HEAD 为真实基线，继续 P2 的 Acceptance Gates。
不要从零重做已完成的 P0/P1，也不要让 online service 绕过 P1 的
LicenseVerifier / ContentKeyProvider 或直接进入 pkg/execution。
```
