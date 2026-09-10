# P2｜Online Activation & Entitlement

## Status

```text
Planned
```

只有 P1 `Completed` 后进入本阶段。

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

## On completion

更新 [`STATUS.md`](STATUS.md) 将 Current stage 切换为 P3，并继续 [`p3-publisher-key-lifecycle.md`](p3-publisher-key-lifecycle.md)。