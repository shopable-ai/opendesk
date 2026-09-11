# Protected Recipe 当前状态

## Current stage

```text
P3｜Publisher Key Lifecycle
Status: Ready
```

## Current checkpoint

P2 已完成并提交：

```text
bffe41500f1db3fde4eef1662732c84abd8350ce
feat: add online entitlement licensing
```

该 SHA 只用于 P2 实现定位。恢复工作时仍必须先读取当前 `master / HEAD` 和共享 `git status`，不得 reset
到该提交，也不得覆盖其后其他会话产生的修改。P1 implementation checkpoint 仍为
`81a847f752849a2df4bad0b1dfd63617171814a0`。

P2 在 P1 device-bound License 上完成：

- authenticated HTTPS activation/refresh/deactivate client 与最小 entitlement service boundary。
- server-side entitlement/device-limit registry 和原子 device admission/sequence advancement。
- 独立 Ed25519 domain 签名的 active/revoked online cache；不嵌入可独立运行的 signed `.odlicense`。
- 最多 7 天的 client hard grace cap、signed refresh/offline deadline 与稳定错误模型。
- OS-protected authoritative activation marker 和 sequence/state/digest replay watermark。
- cache rollback、同 sequence mutation、revoked resurrection 和已激活 cache 删除 fail closed。
- `OnlineLicenseVerifier` 继续复用 P1 `DeviceBoundContentKeyProvider` 与 P0 loader/execution；online network/service
  不进入 `pkg/execution` 或 `pkg/scriptloader`。
- `license activate/status/refresh/deactivate` CLI、file-only bearer credential、safe metadata output 和可选
  `--ca-file` system-root extension。
- macOS TLS/Keychain live、P1/plain regression、disclosure scan、Windows owner cross-build 和质量门禁。

完整实现、验收证据、评分和平台边界见 [`p2-online-entitlement.md`](p2-online-entitlement.md)。P2 评分为
**98/100**；扣分对应尚无 Windows 真机/full-app 证据，不代表将 cross-build 误报为 live。

## Next action

下一步读取并执行 [`p3-publisher-key-lifecycle.md`](p3-publisher-key-lifecycle.md)：

```text
P2 single pinned package/issuer keys
→ trusted Publisher/key registry
→ purpose/status/time validity
→ rotation / retire / compromise policy
→ deterministic multi-Publisher resolution
→ migration and audit tooling
```

P3 必须继续保持：

- 普通 `.js` 无 package、License、账号或网络前置。
- `.odpkg` 继续进入现有 `pkg/execution.Run()` / Goja，不创建第二套 Runtime。
- package signing 与 License/entitlement signing 保持用途和 domain 分离。
- P2 signed cache、offline deadline、replay watermark 和 P1 device-bound DEK chain 不被 registry 绕过。
- Runtime 不无条件信任 package/cache 自带的 public key；unknown/retired/compromised/ambiguous key fail closed。
- 不内置 Publisher private key、server signer、master key、DEK、万能 License 或测试 bypass。

当前只把 P3 标记为 Ready；尚未实现任何 P3 registry、rotation 或 migration 能力。详细门禁见
[`p3-publisher-key-lifecycle.md`](p3-publisher-key-lifecycle.md)。

## P2 completion evidence

- narrow owner tests、owner `go test -race`、`go vet` 与最终 `go test ./...` 通过。
- macOS `dist/opendesk` 与 TLS reference server build 通过；system/private CA 与 TLS 1.2+ regression 通过。
- real TLS activate/status/refresh/deactivate、Direct/AI protected Runtime、signed grace、rollback/cache-deletion/revoked
  rejection 及同设备 P1 offline regression 通过。
- 普通 `.js` Direct/AI regression 通过；protected source/token/DEK/private-key disclosure scan 63 files 零命中，
  protected snapshot 数量为 0。
- source/dependency boundary scan、`node scripts/audit_test_architecture.js` 和 P2-owned `git diff --check` 通过。
- Windows/amd64 P2/P1 owner 与 entitlement server cross-build 生成 PE32+ x86-64；这只证明 owner 编译边界。
  Windows DPAPI live、`package protect/inspect/verify`、P1/P2 package/license/install/activation Runtime、完整 app
  package/installer 与安装后运行均未取得真机资格；完整 host 的既有 RobotGo CGO/native 限制保持单列。

## 当前阻塞

无 P3 架构阻塞。Windows DPAPI/full-app/package/install live、旧 unsigned development Keychain item 的 ACL
环境观察，以及 P4 的 trusted-time/admin-reset 治理都已在 P2 文档中保留，不阻塞 P3 启动。

## 恢复时最短指令

新会话只需要给 Agent：

```text
读取 AGENTS.md、docs/architecture/execution/protected-recipe-package.md、
docs/plans/runtime/protected-recipe/README.md、STATUS.md 和 p3-publisher-key-lifecycle.md；
以当前 master / HEAD 与共享 dirty working tree 为真实基线，从 P3 Acceptance Gates 开始。
不要重做 P0–P2，也不要让 key registry 绕过 P2 online replay/grace、P1 device binding、
LicenseVerifier / ContentKeyProvider 或直接进入 pkg/execution。
```
