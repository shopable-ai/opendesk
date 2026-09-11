# P2｜Online Activation & Entitlement

## Status

```text
Completed
```

P2 已完成并形成可恢复 checkpoint；P3 不得让 Publisher/key lifecycle 绕过本阶段的 signed cache、
device binding、replay watermark 或既有 Runtime provider 边界。

## Goal

在 P1 离线设备绑定授权之上增加可运营的在线授权层，同时保留受控离线运行能力：

```text
customer installation
→ authenticate / activate
→ entitlement service
→ device allowance / product entitlement
→ signed or authenticated local authorization cache
→ existing DeviceLicenseVerifier / ContentKeyProvider boundary
→ ProtectedPackageLoader
```

## Scope

P2 负责：

- Online activation protocol。
- Customer/account 与 entitlement 的最小服务边界。
- Product/license activation state。
- Device-count / device registration policy。
- License refresh。
- Revoke / deactivate。
- 有界 offline grace/cache。
- 服务端到客户端的签名/认证响应。
- 网络失败、过期缓存、撤销状态的明确 fail-closed / grace 规则。
- CLI/API 中 activation/status/deactivate 等最小用户流程。
- 服务端与客户端测试、故障注入和恢复测试。

## Explicitly out of scope

- 支付/订阅供应商深度耦合；支付只可作为 entitlement 上游，不进入 Runtime Loader。
- 多 Publisher Portal 与复杂运营后台。
- 全量企业组织/SSO。
- Marketplace。
- 第二套 Runtime。

## Core boundary

在线服务只决定：

```text
who / which device / which product is entitled
```

Runtime 仍只消费稳定的授权结果与内容密钥边界。不要让 HTTP client、账号 session 或 billing SDK 进入 `pkg/execution`。

## Security requirements

- 所有 activation/refresh/revoke 通信必须 authenticated + TLS。
- 服务端响应必须可验证，不能信任可编辑本地 JSON。
- 本地 cache 必须有明确版本、签名/认证、expiry 与 device binding。
- revoke/refresh 失败策略必须显式，不得在错误时永久 fallback 授权。
- access token、refresh token、license secret 不进入 script globals、Execution.env 或日志。
- 在线服务绝不能把 Publisher private key 下发客户端。

## Acceptance Gates

至少验证：

- 首次 activation 成功后 authorized package 可运行。
- 未购买/未授权 product 被拒绝。
- 超出 device limit 被拒绝。
- refresh 更新 entitlement。
- revoke 后在定义的策略窗口内失效。
- offline grace 在范围内可运行，超过范围 fail closed。
- cache tamper / replay / wrong device fail。
- server unavailable 的行为与文档一致。
- P1 offline/device crypto 与 P0 disclosure/plain-JS 回归继续通过。

## Definition of Done

- 在线 activation / refresh / revoke 的最小服务与客户端链路成立。
- entitlement 与 device-count policy 有测试和稳定错误模型。
- offline cache/grace 有清晰安全边界并通过 tamper tests。
- Runtime 仍复用 P1/P0 的 License/Key/Loader/Execution 边界。
- 普通 `.js` 不需要账号、网络或激活。
- docs/build/tests/diff check 通过。

## Implemented

- `pkg/entitlement/` 提供只接受 HTTPS 的 authenticated client；bearer credential 只从有界 regular file
  进入 Authorization header，不进入 request body、CLI JSON、cache、Runtime env 或 artifact。客户端禁止
  redirect，要求 TLS 1.2 或更高，并允许 `--ca-file` 只扩展系统 root pool，而不关闭证书链或 hostname 验证。
- `pkg/entitlementservice/` 冻结最小 `Authenticator`、`Registry`、`MaterialProvider` 与 `CacheIssuer` 边界；
  reference registry 在同一 mutex 内完成 entitlement/device-limit 判断、device admission 与 sequence advancement，
  支持 signed active/revoked refresh state 和 deactivate 释放设备槽位。server signer/DEK 只由 server-side
  `MaterialProvider` 注入，不进入客户 Runtime。
- online cache 使用独立的 `OpenDeskOnlineEntitlementCache/v1` Ed25519 domain，覆盖 request nonce、activation、
  entitlement、sequence、state、时间窗口、package publisher key 与 P1 device-bound claims/envelope；cache 不含
  可独立验证/安装的 `.odlicense` signature。
- `SecureOnlineReplayGuard` 使用与 device private key 分离的 OS secure-store namespace，保存 authoritative
  manifest marker 和 sequence/state/digest watermark；rollback、同 sequence 变体、revoked resurrection、
  commit 中断与已激活 cache 删除均 fail closed。`MutableStore` 只用于这类小型 host-owned state，P1 device key
  继续使用 create-only `Store`。
- `OnlineLicenseVerifier` 验证 outer signature、package/device binding、signed state 与最多 7 天的 offline grace，
  再把验证后的 P1 claims 交给既有 `DeviceBoundContentKeyProvider`。production composition 只在从未建立 online
  marker 时允许独立 P1 offline License；online client/service 没有进入 `pkg/execution` 或 `pkg/scriptloader`。
- `license activate/status/refresh/deactivate` 已接入根 CLI。activation 在安装前完成 package/response 验签、nonce、
  device/package/time binding、DEK unwrap 与 package decrypt；refresh 只接受同 activation 的更高 sequence；
  deactivate 只接受 signed revoked response；输出只投影安全 metadata。
- macOS matching-source acceptance build 保留一个窄的 linker test-isolation seam，可用 `-ldflags -X` 为验收选择
  独立 Keychain account。该变量不导出、没有 Runtime/CLI 输入，普通 release build 不覆盖时仍使用 P1 冻结值
  `device-p256-v1`。

## Validated

2026-09-11 在当前 `master` 共享工作树完成：

- narrow P2/P1 owner tests、owner `go test -race` 与 `go vet` 通过；最终 `go test ./...` 通过。期间两个共享的
  App Shell/Accessibility case 曾分别失败，前者由其 owner 修复、后者单测复跑通过，最终全量命令为绿色。
- `go build -o dist/opendesk ./cmd/opendesk` 与 TLS reference entitlement server build 通过，均为 macOS x86_64
  Mach-O；reference server 和 production client 显式要求 TLS 1.2+。新增 CA regression 验证 system/private root
  扩展、未关闭 verification，以及 CLI `--ca-file` bytes 被正确转交。
- macOS real TLS/Keychain live 使用 matching-source build 和隔离 account `device-p256-p2-live-20260911b`：online
  activate/status、Direct `.odpkg` 与 `ai run .odpkg` 成功；服务不可用的 refresh 返回
  `entitlement_service_unavailable` 后 signed grace 内 Runtime 继续成功；signed refresh sequence 1→2 成功。
- 恢复 sequence 1 cache 时 status/Runtime 返回 `entitlement_replay_detected`；删除已激活 cache 返回
  `invalid_entitlement_cache` 且不降级到 P1；signed deactivate 产生 revoked sequence 3，随后 Direct/AI 均在执行前
  返回 `license_revoked`。
- 同一隔离 device identity 的 P1 offline issue/install/Direct/AI 回归通过；普通 `.js` Direct/AI 回归通过并保留
  其正常 snapshot，证明 P2 没有给 plain path 增加账号、网络或 activation 前置。
- disclosure scan 只覆盖安装树、CLI logs、三个 protected Direct artifact 目录、两个 protected AI artifact
  目录和客户 binary，并显式排除 publisher source/key/token/private-key inputs 及 plain-JS snapshots：63 个文件对
  online/offline plaintext sentinel、bearer token、DEK raw/hex/Base64 表示及测试 private-key material 均零命中，
  protected `script_snapshot.js` 数量为 0。
- source/dependency scan 确认 `pkg/execution` / `pkg/scriptloader` 不依赖 online client/service，production owners
  没有 embedded private/master/DEK/bypass literal。`node scripts/audit_test_architecture.js` 和 P2-owned
  `git diff --check` 通过。
- Windows/amd64 `CGO_ENABLED=0` owner cross-build 为 `pkg/licensing`、`pkg/deviceidentity`、`pkg/entitlement`、
  `pkg/entitlementservice`、`pkg/scriptloader`、`internal/licensecli`、`internal/packagecli` 与 entitlement server
  生成 PE32+ x86-64 产物。Windows 真机/live 与完整应用打包未执行；完整 `opendesk` / `internal/protectedcli`
  交叉构建仍止于既有 RobotGo `Bitmap` / `Rect` / native symbol 缺失，不属于 P2 owner failure。
- 额外执行了正式 Runtime API smoke 入口；它在 P2 case 之前被共享工作树中并行的 App Shell/UI catalog/type drift
  拒绝，因此不计为 P2 通过证据。P2 没有新增 JavaScript Runtime API；本阶段要求的 plain Direct/AI 与唯一
  protected Runtime 回归已由上述独立证据满足，不把该次失败表述为 catalog 通过。

## Remaining

P2 Acceptance Gates 无剩余项。以下限制已明确保留，不扩大为 P2 能力：

- Windows 真机/live 与完整 app packaging 待具备对应环境后独立验证。
- 旧 unsigned development build 创建的默认 P1 Keychain item 在 binary rebuild 后返回 `errSecAuthFailed (-25293)`；
  验收未删除或更新该 item，而是使用上述隔离 account。稳定签名/升级 ACL 属于发布工程环境治理。
- 系统时钟回滚、管理员级 secure-store 删除/系统恢复和更强 trusted-time policy 属于 P4；本阶段只声明 signed
  hard deadline 与 OS-protected replay state 能提供的边界。
- reference entitlement server 是可审计的 TLS/in-memory acceptance tool，不冒充持久化、多节点或支付集成的
  production SaaS。

## Score

| 维度 | 得分 | 依据与扣分 |
| --- | ---: | --- |
| 架构与 Runtime 边界 | 20/20 | online 仅刷新本地授权结果，复用 P1/P0 verifier/key/loader/execution 主链路。 |
| Protocol、service 与 CLI | 20/20 | auth/TLS、nonce、device limit、refresh/revoke/deactivate、稳定错误与安全输出均有测试/live。 |
| Cache、grace 与 replay 安全 | 20/20 | strict signed cache、7-day cap、tamper/rollback/deletion/revoked-resurrection fail closed。 |
| Runtime、P1 与 plain regression | 20/20 | online/P1 protected Direct+AI、zero-execution failures、plain Direct+AI 与 disclosure 均成立。 |
| Platform 与交付证据 | 18/20 | macOS real TLS/Keychain 完整；Windows 只有 owner cross-build，无真机/full app。 |
| **总分** | **98/100** | P2 Definition of Done 完成；扣分只对应明确的平台 live/发布环境证据缺口。 |

## Checkpoint

```text
bffe41500f1db3fde4eef1662732c84abd8350ce
feat: add online entitlement licensing
```

## On completion

P2 checkpoint 与验证摘要已记录；后续从 [`STATUS.md`](STATUS.md) 的 P3 Ready 入口继续
[`p3-publisher-key-lifecycle.md`](p3-publisher-key-lifecycle.md)，本阶段不实现 P3。
