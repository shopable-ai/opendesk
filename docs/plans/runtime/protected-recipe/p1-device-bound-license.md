# P1｜Device-bound Offline License MVP

## Status

```text
Planned
```

只有 P0 状态变为 `Completed` 后才能切换为 `In progress`。

## Goal

让一个 Protected Recipe 的内容密钥只能由被授权设备取得，形成第一版适合小规模收费交付的离线设备绑定授权：

```text
Publisher
→ package DEK
→ wrap for customer device public key
→ signed offline license

Customer device
→ OS-protected device private key
→ verify signed license
→ validate device/product/package/expiry
→ unwrap DEK in memory
→ existing ProtectedPackageLoader
→ existing pkg/execution.Run()
```

P1 完成后可以声明“Device-bound Offline License MVP 完成”，但不能声明在线 License 平台或订阅系统完成。

## Scope

P1 负责：

- installation/device asymmetric key pair。
- stable public DeviceID。
- device public identity export。
- macOS Keychain-backed private material。
- Windows DPAPI-backed private material。
- versioned offline license format。
- license issuer signature 与 strict parser。
- device/product/package/content-key binding。
- issuedAt / expiresAt 基础时间约束。
- wrapped DEK key envelope。
- production `DeviceLicenseVerifier`。
- production `DeviceBoundContentKeyProvider`。
- deterministic local license discovery/install。
- publisher-side `license issue` 与 customer-side `license device/install/inspect/verify` CLI。
- end-to-end authorized-device execution 与 wrong-device/no-license/expired/tamper zero-execution tests。

## Explicitly out of scope

- Online activation。
- Account entitlement service。
- Subscription billing。
- Device-count server。
- Online refresh/revoke。
- Web dashboard / Publisher Portal。
- Enterprise SSO。
- 第二套 Runtime。

这些进入 P2 或以后。

## Security model

不得使用 machine ID 派生 AES key 或 device private key。机器标识如被采用，只能作为非 secret 绑定/诊断证据。

真正的设备绑定来自：

```text
random device private key
→ protected by OS secure storage

package DEK
→ encrypted/wrapped to matching device public key

wrong device private key
→ cannot recover DEK
```

DeviceID 推荐由带 domain separation 的 device public identity digest 形成；字符串 DeviceID 只用于识别，不能代替真正的密钥绑定。

## Key-envelope decision boundary

实施时优先选择 Go 标准库和成熟 primitive。候选方向：

```text
X25519 or P-256 ECDH
→ shared secret
→ standard HKDF-SHA256 or equivalent reviewed KDF
→ AES-256-GCM key envelope
```

必须记录最终算法选择与原因；不要自制 KDF、RSA-like wrapping 或复用 package signing key 作为 device encryption key。

KDF/AAD 必须有独立 domain separation，并绑定至少：

- license format/version
- productId
- packageId
- contentKeyId
- device identity / key algorithm

## Device identity boundary

建议独立 owner，例如：

```text
pkg/deviceidentity/
pkg/securestore/
```

Device identity owner 负责生成/读取安装密钥和 public identity；`scriptloader` 不生成设备 key，`pkg/execution` 不理解设备授权。

## OS secure storage

### macOS

优先使用系统 Keychain，不要求用户安装 Xcode，不把 device private material 明文写入 `~/.opendesk`、`.env`、SQLite 或普通 JSON。

### Windows

使用 DPAPI 或等价受审查的系统机制保护 device private material。Windows 无 live 环境时只允许声明 build/cross-compile 状态，不把它写成真机验证。

## Offline license contract

格式名称与扩展名实施时结合现有仓库命名冻结；必须显式版本化并限制文件大小。最小语义至少包括：

```text
format / formatVersion
licenseId
publisherId / publisherKeyId
subjectId
deviceId / deviceKeyAlgorithm
productId
packageId
contentKeyId
issuedAt / expiresAt
keyEnvelope.algorithm
keyEnvelope.ephemeralPublicKey
keyEnvelope.nonce
keyEnvelope.wrappedContentKey
signature
```

P1 MVP 优先采用：

```text
1 License
→ 1 Device
→ 1 Product
→ 1 package/content key
```

不要第一批引入复杂 policy DSL。

License signature 必须使用独立 domain separation；即使临时复用 Publisher Ed25519 key，也不能复用 Protected Package 的签名 domain。

## Production composition

P1 应把 P0 的 production fail-closed seam替换为真正可用的组合：

```text
ProtectedPackageLoader
→ trusted package publisher verification
→ DeviceLicenseVerifier
→ DeviceBoundContentKeyProvider
→ OS secure device private key
→ unwrap DEK
→ package AES-GCM decrypt
→ existing execution
```

不得把 License 购买、支付、账号或在线服务塞进 Loader。

## Acceptance Gates

至少覆盖：

### Device identity

- 第一次 Ensure 生成随机 identity。
- 第二次 Ensure 返回同一 public identity。
- public CLI 不返回 private material。
- secure-store 数据损坏 fail closed。

### Key envelope

- matching device wrap/unwrap round trip。
- wrong private key fail。
- envelope tamper fail。
- metadata/AAD tamper fail。

### License

- valid signature pass。
- device/product/package/wrapped-DEK 任意修改 fail。
- wrong issuer key fail。
- duplicate JSON key / unsupported version / malformed key material fail closed。
- expired / not-yet-valid 按最终合同返回稳定错误。

### Runtime

- authorized device 实际执行 protected JavaScript。
- no license / wrong device / expired / tampered license / tampered package 都在 JavaScript 启动前失败。
- DEK 只在短生命周期 caller-owned buffer 中存在，不写磁盘/日志/env/Execution metadata。
- P0 plaintext disclosure sentinel regression 继续通过。
- 普通 `.js` direct / `ai run` 完全不要求设备 identity 或 License。

### Platform

- macOS 有真实 Keychain smoke evidence（若当前开发机为 macOS）。
- Windows 至少完成当前源码对应的 compile/package 验证；只有有真机证据才声明 live validation。

## Definition of Done

- P0 所有门禁继续通过。
- 随机设备密钥、稳定 DeviceID、public identity export 成立。
- macOS/Windows secure-storage owner 成立。
- versioned signed offline license parser/issuer 成立。
- DEK 被加密绑定到设备，不以 plaintext 出现在 license。
- production LicenseVerifier 与 ContentKeyProvider 能从安装 License 完成授权与 unwrap。
- authorized device 可以执行；wrong device/no license/expired/tamper 均 zero execution。
- disclosure 与 plain `.js` 回归通过。
- CLI 与用户文档与真实行为一致。
- build/tests/diff check 通过。

## On completion

记录最终 checkpoint 与验证摘要，更新 [`STATUS.md`](STATUS.md) 将 Current stage 切换为 P2，并继续 [`p2-online-entitlement.md`](p2-online-entitlement.md)。