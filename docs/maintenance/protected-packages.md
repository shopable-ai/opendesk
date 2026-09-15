# Protected Package Publisher 与密钥运维

本文面向 OpenDesk Publisher、平台管理员、Release Engineer 与 Security / Operations 维护者，定义 `.odpkg` 商业发布中的密钥责任、环境隔离、轮换与泄露处置。

公开 CLI 参数见 [受保护包 CLI](../api/protected-packages.md)。开发与本地测试见 [Protected Package 开发与测试指南](../implementation/protected-packages.md)。Threat Model 与平台密钥架构见 [Protected Package Security Model](../architecture/execution/protected-package-security-model.md)。

## 1. 文档边界

管理员文档不是用来“隐藏算法”。OpenDesk 的安全模型不得依赖算法或 package format 保密。

可以公开：

- `.odpkg` 格式；
- AES-256-GCM；
- Ed25519；
- manifest public fields；
- `package protect / inspect / verify` 用法；
- Runtime 的公开验签、授权和加载语义。

不得写入 Git 仓库或文档：

- production Publisher private key；
- production License / Entitlement issuer private key；
- package DEK；
- production bearer token；
- activation secret；
- HSM / KMS credentials；
- 能直接绕过授权的 debug backdoor；
- 客户真实 secret / device private material。

## 2. 角色与责任

| 角色 | 主要责任 | 不应持有 |
| --- | --- | --- |
| Developer | 编写、测试普通 `.js`，验证业务行为 | production signing key / production DEK |
| Package Publisher | 生成 `.odpkg`，管理 Publisher signing identity | customer device private key |
| License / Entitlement Issuer | 决定授权、签发或刷新授权结果 | Publisher private key（除非组织明确合并运维但仍保持 key domain 分离） |
| Customer Runtime | 验签、验证授权、取得对应 DEK、内存解密并执行 | Publisher / issuer private key |
| Platform Admin / Security | trust registry、KMS/HSM、rotation、revoke、审计 | 不应把 master secret 分发到客户端 |

Package signing 与 License / Entitlement signing 必须保持独立 key identity 和生命周期。

## 3. 平台化的推荐隔离方式

不同开发者 / Publisher 不使用不同自定义算法；推荐统一算法和 Runtime，隔离 Publisher identity 与 package keys。

```text
OpenDesk Platform
    |
    +--> Publisher A
    |       +--> signing key A
    |       +--> Package A1 -> random DEK-A1
    |       `--> Package A2 -> random DEK-A2
    |
    +--> Publisher B
    |       +--> signing key B
    |       `--> Package B1 -> random DEK-B1
    |
    `--> Customer Devices
            +--> device identity 1
            +--> device identity 2
            `--> device identity 3
```

冻结原则：

- 每个 Publisher 独立 signing identity；
- 每个 package 独立随机 256-bit DEK；
- 每台设备独立 device identity；
- License / Entitlement 决定哪些设备或主体能取得哪个 package DEK；
- OpenDesk binary 中不存在跨 Publisher / Package 通用的 AES Master Key。

## 4. Publisher signing key 生命周期

Publisher private signing key 用于证明 `.odpkg` 来自某个 Publisher，并检测 package 篡改。

生产要求：

- private key 不进入 source repository；
- private key 不进入 `.odpkg`；
- private key 不进入客户 OpenDesk installation；
- 优先存储在 HSM / KMS / 受控 signing service；
- 如果使用本地文件，必须有明确 owner、权限、备份和销毁流程；
- `publisherKeyId` 必须可追踪到真实 key lifecycle；
- rotation 时新旧 key 的信任窗口必须显式管理。

不得通过把 Publisher private key 硬编码到 OpenDesk binary 来简化发布。

## 5. License / Entitlement issuer key 生命周期

Issuer key 与 Publisher key 是不同责任域。

Issuer private key：

- 只用于签发 / 刷新 License 或 online entitlement state；
- 不用于加密 JavaScript payload；
- 不应该与 Publisher signing private key 使用同一 key material；
- 必须有独立 `issuerKeyId`、rotation、retirement 与 compromise response。

即使早期由同一个管理员执行 package publish 和 License issue，也不得把两个 domain 在数据模型上合并成一个“万能 signing key”。

## 6. DEK 生命周期

每个 `.odpkg` 使用独立随机 256-bit DEK。

```text
source
-> random package DEK
-> AES-256-GCM ciphertext
-> .odpkg
```

DEK：

- 不写入 `.odpkg`；
- 不写入 public manifest；
- 不写入普通日志；
- 不通过普通 command-line secret literal 传递；
- 不进入 JavaScript globals / `Execution.env`；
- 不跨所有 package 复用；
- 与 `contentKeyId` 建立可管理的 identity 关系；
- 在授权链路中只以 wrapped / secure resolved 形式提供给获准设备。

如果原始 DEK 永久丢失，而没有可恢复的受控备份，既有 package 可能无法再给新设备签发授权。因此 production DEK backup / escrow 必须由 Publisher / Platform 的正式 secret management 方案负责，而不是由 Git 仓库负责。

## 7. Device identity

客户设备的 private identity material 归客户 Runtime / OS secure storage 所有。

生产原则：

- macOS 使用 Keychain 等 OS secure storage；
- Windows 使用 current-user protected storage / DPAPI 等已冻结方案；
- device private key 不由 Publisher 导出；
- Publisher / License issuer 只接收需要的 public device identity；
- 机器 ID 不直接派生 package AES 内容密钥。

设备 identity 与 package DEK 是不同 key domain。

## 8. 同一 `.odpkg` 给多个客户的方式

默认使用：

```text
same package ciphertext
+ different device-bound License / Entitlement
```

即：

```text
invoice.odpkg
    +--> Device A authorization -> DEK available for A
    +--> Device B authorization -> DEK available for B
    `--> Device C authorization -> DEK available for C
```

这样平台不需要因为客户数量增加而重新 AES 加密同一个 release artifact。

当需要更强追踪或泄露归因时，可以增加：

- per-customer watermark；
- per-customer package identity；
- per-customer build；
- short-lived entitlement；
- server-side proprietary logic。

这些增强能力应按产品 / 安全等级启用，而不是破坏基础 `.odpkg` 的统一格式。

## 9. Self-managed 与 Managed Publisher Key

平台后续应明确支持模式，而不是隐式混用。

### Self-managed Publisher

Publisher 自持 private signing key。

优点：

- 平台不长期保管 Publisher private key；
- Publisher 与平台运营风险隔离更强。

要求：

- 本地 / CI signing 环境受控；
- private key 有可靠备份、权限和 rotation；
- 平台只记录 public trust identity。

### Managed Publisher

平台托管 Publisher signing key。

要求：

- private key 存在于 KMS / HSM / server-side signing service；
- OpenDesk 客户端永远不包含 managed private key；
- 每次 signing 有 Publisher / package / operator / timestamp / audit context；
- 支持明确的 rotation / disable / compromise response；
- 文档与 UI 明确标识“平台托管”。

## 10. 开发 / 测试 / 生产环境隔离

至少分离：

```text
development
staging / qualification
production
```

禁止：

- 本地测试复用 production Publisher private key；
- CI demo package 使用 production DEK；
- examples 中包含真实 License；
- `tests/protected-packages/` 生成的临时 key 被提交到 Git；
- production activation token 写进 README / issue / artifact log。

测试可以自动生成临时 signing key、DEK、device identity 和 License，但测试结束必须按 owner 策略清理 private material。

## 11. 发布操作基本流程

生产发布至少按以下顺序：

```text
verified source.js
-> create / select Publisher signing identity
-> generate new package DEK
-> package protect
-> package inspect
-> package verify with expected Publisher public key
-> record package digest / packageId / productId / key IDs
-> store / escrow DEK under production secret policy
-> publish encrypted .odpkg
-> issue offline License or online Entitlement
-> customer runtime verifies + authorizes + executes
```

不得把 `package verify` 解释成“客户已经获得 License”。

## 12. Rotation

### Publisher key rotation

新 package 使用新的 `publisherKeyId`。旧 key 是否继续可信由明确 trust policy 决定。

典型顺序：

```text
introduce new public trust
-> begin signing new releases with new key
-> migration window
-> stop old-key signing
-> retire / revoke old trust when allowed
```

### License issuer key rotation

独立于 Publisher rotation。不要因为 Package signing key 轮换而强制复用相同 issuer rotation。

### Content key rotation

新的 package release 默认生成新的 DEK 和 `contentKeyId`。不要把长期全局 DEK 当作“方便的 master key”。

## 13. Compromise Response

### Publisher private key 泄露

至少：

1. 停止使用受影响 `publisherKeyId`；
2. 生成新的 Publisher signing key；
3. 更新 trust / registry；
4. 评估受影响 package / 时间窗口；
5. 重新签发需要重新建立信任的 release；
6. 不把问题错误地归因成 AES payload encryption 失效。

### License issuer private key 泄露

至少：

1. 停止受影响 issuer；
2. 轮换 `issuerKeyId`；
3. 对 online entitlement 执行 revoke / sequence policy；
4. 对 offline License 明确旧 issuer 的 retirement policy；
5. 审计异常授权。

### Package DEK 泄露

DEK 泄露意味着对应 package ciphertext 的机密性边界已经受损。

处理方向：

```text
rebuild package
-> new package identity/version when appropriate
-> new random DEK
-> new ciphertext
-> new authorization material
```

不要认为只重新签名旧 ciphertext 就恢复了机密性。

## 14. 文档与日志安全

运维日志允许记录：

- packageId；
- productId；
- publisherId；
- publisherKeyId；
- contentKeyId；
- package digest；
- License / Entitlement decision；
- non-secret device ID；
- result / error code。

不得记录：

- private key bytes；
- DEK bytes；
- decrypted JavaScript；
- bearer token；
- raw secret envelope material（除非专门的受控审计系统明确需要且经过安全评审）。

## 15. 公开文档不会让加密“无效”

管理员应以以下口径对外：

> OpenDesk 可以公开 `.odpkg` 格式、AES-256-GCM、Ed25519 和验证流程。安全来自 secret key、标准密码学、签名、授权和 Runtime 的 disclosure policy，而不是依赖隐藏算法。

同时必须避免夸大：

> `.odpkg` 保护交付时的源码并提高复制与逆向成本，但任何必须在客户设备执行的 JavaScript 最终都会在授权 Runtime 内以可执行明文形式短暂存在。拥有足够高本机权限的攻击者理论上可以尝试 instrument Runtime 或读取进程内存。

对绝不能交付到客户设备的核心 proprietary logic，应放到 authenticated server-side service。

## 16. 发布前运维验收

Publisher / Release 至少确认：

- source release 已完成业务验证；
- package 使用新或明确选择的 per-package DEK；
- Publisher key identity 正确；
- License issuer key identity 与 Publisher key domain 分离；
- `.odpkg` inspect / verify 通过；
- production secret 未进入 Git / docs / logs；
- package digest 已记录；
- authorized protected execution 已通过资格验证；
- plain / protected 业务结果等价；
- protected artifact 没有 decrypted source snapshot；
- key backup / rotation / compromise owner 已明确。
