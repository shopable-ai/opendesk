# P3｜Publisher & Key Lifecycle

## Status

```text
Planned
```

只有 P2 `Completed` 后进入本阶段。

## Goal

把单一 Publisher / 单一 key 的早期商业授权能力升级为可长期运营、可轮换、可审计的 Publisher 与密钥治理体系。

## Scope

P3 负责：

- Trusted Publisher registry。
- Package-signing key 与 license-signing key 的用途隔离。
- Key version / key ID lifecycle。
- Publisher key rotation。
- Retired / compromised key 状态。
- Product / package 与 key 的版本迁移关系。
- 多 Publisher / 多 Product 的确定性 trust resolution。
- License/key migration tooling。
- 最小审计记录与安全事件追踪。
- 兼容旧 package/license 的明确支持窗口。

## Explicitly out of scope

- Marketplace 与开放式第三方插件商店。
- 复杂企业 IAM / SSO。
- 支付系统。
- 对客户端本机管理员的“绝对不可逆向”承诺。
- 第二套 Runtime。

## Trust model

必须避免：

```text
package manifest 声明 publisherKeyId
→ Runtime 无条件信任 package 自带 public key
```

正确模型是：

```text
publisherId + publisherKeyId
→ trusted registry
→ purpose/status/time validity
→ trusted public key
→ verify package or license
```

Package signing 与 License signing 即使底层算法相同，也必须有独立用途/domain，避免跨协议复用。

## Rotation model

至少支持：

- 新 key 发布与生效时间。
- 旧 key 在迁移窗口内验证历史 artifact。
- compromised key 进入拒绝状态。
- 新 package/license 不再使用 retired key。
- rotation 不要求重新设计 `.odpkg` 或第二套 Loader。

## Acceptance Gates

至少验证：

- unknown publisher / unknown key / wrong purpose fail closed。
- active key 正常验证。
- retired key 的历史兼容行为与 policy 一致。
- compromised/revoked key 被拒绝。
- rotation 后新旧 package/license 的行为符合支持窗口。
- key ID collision / ambiguous resolution fail closed。
- registry tamper 或不可信来源不能提升为 trusted publisher。
- P0–P2 全部安全与 plain `.js` 回归继续通过。

## Definition of Done

- Publisher/key registry 有明确 owner、数据格式与 trust bootstrap。
- Package/license signing purpose 分离。
- rotation/retire/compromise 生命周期可测试、可迁移。
- 多 Publisher/Product 的解析确定且歧义 fail closed。
- Runtime 继续复用已有 ScriptLoader/License/Execution，不引入平行执行引擎。
- docs/build/tests/diff check 通过。

## On completion

更新 [`STATUS.md`](STATUS.md) 将 Current stage 切换为 P4，并继续 [`p4-commercial-hardening.md`](p4-commercial-hardening.md)。