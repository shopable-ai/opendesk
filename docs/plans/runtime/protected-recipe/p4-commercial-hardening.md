# P4｜Commercial Hardening & Scale

## Status

```text
Planned
```

只有 P3 `Completed` 后进入本阶段。

## Goal

在 P0–P3 已经具备包保护、设备绑定、在线 entitlement 与 Publisher/key lifecycle 的基础上，处理高价值商业交付中的恢复、迁移、滥用风险、观测与更高等级 IP 保护。

## Scope

P4 负责按真实业务优先级选择并实现：

- License/device recovery 与设备迁移。
- 安全的 key/license backup/restore policy。
- 系统时间回拨与离线 entitlement anti-rollback 风险治理。
- 异常 activation / excessive device churn / abuse signal。
- 安全观测、审计、告警与隐私边界。
- 大规模 package/license rollout 与兼容迁移。
- 高价值专有算法的 server-side execution boundary。
- 企业离线部署、代理/内网环境等商业 hardening。
- 必要的灾难恢复与 key-compromise runbook。

P4 不是一个要求一次性实现所有企业功能的巨型版本。进入本阶段后，应根据真实商业客户与风险数据选择最高价值子批次。

## Explicitly out of scope by default

除非有明确客户需求，不自动扩展到：

- 完整 Marketplace。
- 通用 DRM 平台。
- 任意第三方二进制保护器。
- 自制 anti-debug/packer/obfuscation 体系。
- 与 Protected Recipe 无关的企业 IAM 大重构。
- 第二套 Runtime。

## Security ceiling

必须长期保留这个事实：

```text
ciphertext
→ customer host decrypts
→ plaintext exists in process memory
→ Goja executes JavaScript
```

因此本地 `.odpkg` 的目标是提高源码直接读取、简单复制、篡改和未授权运行的成本，而不是承诺本机管理员/调试器永远无法取得运行时 plaintext。

对于最高价值、绝不能交付到客户机器的算法，P4 的优先安全边界是：

```text
protected local recipe
→ authenticated HTTPS / private service
→ proprietary server-side logic
→ minimal result returned
```

不要把 JavaScript 混淆、压缩或自制加密当成等价替代。

## Hardening principles

- Recovery 不能变成绕过 device binding 的万能恢复密钥。
- Anti-rollback 不能仅依赖可编辑本地时间戳。
- Observability 不得记录 DEK、device private key、License secret 或 protected plaintext。
- Abuse/risk signal 必须最小化收集并有清晰隐私边界。
- Key compromise 处理必须与 P3 rotation/trust registry 一致。
- 企业离线模式的 grace/revoke 能力边界必须明确，不假装拥有在线实时撤销。

## Acceptance Gates

实际子批次至少应证明：

- recovery/migration 不允许未授权设备获取 DEK。
- backup/restore 不产生 plaintext private-key 或 DEK 泄露。
- rollback/tamper 场景不会静默提升授权。
- observability/logging 继续通过 protected sentinel disclosure regression。
- server-side proprietary logic 的认证、最小数据返回、网络失败策略明确。
- P0–P3 回归继续通过，普通 `.js` 仍无需商业授权基础设施。
- Windows/macOS 的平台差异被真实验证或明确标注未验证。

## Definition of Done

P4 没有“所有企业功能一次完成”的定义。只有当当前选择的 Commercial Hardening 子批次满足：

- 明确真实业务风险/需求来源。
- 安全边界与 threat model 清晰。
- 对应实现、测试、故障恢复与文档完成。
- 不破坏 P0–P3 trust chain。
- disclosure/plain-JS 回归继续通过。
- build/tests/diff check 通过。

才可将该子批次标记为 Completed。

当主要商业 hardening 子批次稳定后，可将本路线整体状态标记为 `Operational / ongoing hardening`，而不是宣称客户端代码已经“绝对不可破解”。