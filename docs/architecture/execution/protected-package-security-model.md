# Protected Package Security Model｜受保护包安全边界与平台密钥架构

本文补充 [Protected Recipe Package｜商业脚本保护与执行架构](protected-recipe-package.md)，冻结 `.odpkg` 的威胁模型、平台化密钥隔离方式以及后续安全增强方向。

公共 CLI 契约见 [受保护包 CLI](../../api/protected-packages.md)。开发与本地测试见 [Protected Package 开发与测试指南](../../implementation/protected-packages.md)。Publisher / 管理员运维见 [Protected Package Publisher 与密钥运维](../../maintenance/protected-packages.md)。

## 1. 核心结论

`.odpkg` 的目标是商业分发保护，而不是宣称客户端 JavaScript 永远无法被逆向。

冻结以下原则：

```text
统一 package format
+ 统一、经过审计的密码算法
+ 每个 Publisher 独立 signing identity
+ 每个 Package 独立随机 DEK
+ 每个 Device 独立 device identity
+ License / Entitlement 决定谁能够取得对应 DEK
```

不同开发者 / Publisher 不应各自发明不同的加密算法或 Runtime。隔离应主要发生在密钥、身份、授权和发布域，而不是算法实现。

安全不得依赖以下信息保密：

- `.odpkg` 容器结构；
- AES-256-GCM；
- Ed25519；
- manifest 字段；
- package verification 流程；
- Runtime 的公开加载流程。

真正必须保密的是 private key、DEK、生产 token、HSM/KMS 凭据和其他授权秘密。

## 2. 当前保护链路

```text
Developer source (.js)
        |
        v
optional bundle / minify
        |
        v
per-package random 256-bit DEK
        |
        v
AES-256-GCM encrypt payload
        |
        +--> public manifest
        |
        v
Ed25519 Publisher signature
        |
        v
.odpkg

Customer Runtime
        |
        v
parse / validate package
        |
        v
verify Publisher signature
        |
        v
verify License / Entitlement
        |
        v
resolve package DEK
        |
        v
AES-GCM decrypt in process memory
        |
        v
existing ScriptSource
        |
        v
existing pkg/execution.Run()
        |
        v
existing Goja
```

不得创建第二套 Encrypted Runtime / Protected Goja。

## 3. `.odpkg` 能防什么

在实现遵守 Protected Artifact Policy 的前提下，`.odpkg` 主要提高以下攻击成本：

- 用户不能通过文本编辑器直接打开交付文件读取 JavaScript；
- archive / container inspection 不应直接得到 payload plaintext；
- 没有对应 DEK 时不能直接解密 AES-256-GCM payload；
- package 被篡改后 Publisher signature / AEAD 校验应失败；
- 未通过 License / Entitlement 时 JavaScript 不应进入执行；
- protected execution 不应把 decrypted source 写回普通 `.js` snapshot、日志或 artifact。

对于“拿到 `.odpkg` 后直接查看源码”这一类普通复制行为，这一层保护应当是有效的。

## 4. `.odpkg` 不承诺防什么

客户端必须在某个时刻把受保护 payload 转换为 Runtime 可以执行的明文 JavaScript bytes：

```text
ciphertext
-> Host decrypts
-> plaintext exists in process memory
-> Goja evaluates JavaScript
```

因此不得承诺：

- 拥有本机管理员 / 调试权限的攻击者永远无法恢复运行中的源码；
- Runtime binary 被修改后仍然绝对无法观测解密后的内容；
- process memory inspection / instrumentation 永远无效；
- 已取得合法授权的恶意客户无法进行高级逆向；
- 仅靠代码混淆即可形成密码学安全边界。

“内存中解密”是重要的泄露面缩减措施，但不是绝对防逆向证明。

## 5. 为什么公开 API / 算法不会让保护失效

OpenDesk 可以公开以下内容而不降低密码学安全目标：

```text
.odpkg v1 format
AES-256-GCM
Ed25519
package inspect / verify 语义
manifest public metadata
License / Entitlement 的公开协议边界
```

不应使用“隐藏算法”“隐藏文件格式”“隐藏 Runtime 验证流程”作为安全措施。

仓库和公共文档不得包含：

```text
production Publisher private key
production License issuer private key
package DEK
production bearer token
activation secret
HSM / KMS credential
可绕过授权的 debug backdoor
```

## 6. 平台化 Publisher Key Architecture

推荐平台关系：

```text
OpenDesk Platform
    |
    +--> Publisher Registry / Trust
    |       |
    |       +--> Publisher A signing identity
    |       +--> Publisher B signing identity
    |       `--> Publisher C signing identity
    |
    +--> Package A1 -> random DEK-A1
    +--> Package A2 -> random DEK-A2
    `--> Package B1 -> random DEK-B1

Customer Device
    |
    `--> per-device identity
             |
             `--> License / Entitlement
                      |
                      `--> resolve / unwrap one authorized package DEK
```

### 6.1 Publisher signing key

每个 Publisher 使用独立 signing identity。一个 Publisher 的 private key 泄露不得自动导致其他 Publisher 的 package 失去可信边界。

### 6.2 Per-package DEK

每个受保护包使用新的随机 256-bit DEK。禁止跨所有 Publisher / Product / Package 复用一个全局 AES Master Key。

### 6.3 Device identity

设备身份使用独立的 device key。设备密钥用于授权 / unwrap 边界，不应直接作为 JavaScript payload 的 AES 内容密钥。

### 6.4 License / Entitlement issuer

Package signing 与 License / Entitlement signing 是不同责任域。即使小规模部署由同一组织运营，也必须保留独立 key identity 与 rotation 生命周期。

## 7. 自托管与平台托管两种 Publisher 模式

平台后续可以支持两种模式，但不能混淆。

### 7.1 Self-managed Publisher Key

推荐作为强隔离模式：

```text
Publisher owns private signing key
-> OpenDesk tooling receives only an authorized signing operation or local key path
-> customer Runtime trusts the corresponding public identity
```

平台不需要长期持有 Publisher private key。

### 7.2 Managed Publisher Key

平台可以提供托管签名服务，但应满足：

- private key 只存在于服务端安全存储 / KMS / HSM；
- 客户端 OpenDesk binary 不包含托管 private key；
- signing operation 有 Publisher / artifact / audit context；
- 支持 rotation / retirement / compromise response；
- 文档明确这是“平台托管密钥”，而不是开发者自持密钥。

## 8. 同一 Package 是否需要为每个客户重新加密

默认不需要。

推荐：

```text
same invoice.odpkg ciphertext
        |
        +--> Device A License -> wrapped / resolvable DEK for A
        +--> Device B License -> wrapped / resolvable DEK for B
        `--> Device C License -> wrapped / resolvable DEK for C
```

这样同一 `.odpkg` 可以作为稳定发布 artifact，客户差异由 License / Entitlement 表达。

只有在更高安全或追踪需求下，才增加：

- per-customer watermark；
- per-customer build；
- per-customer package identity；
- short-lived online entitlement；
- server-side proprietary logic。

这些是增强层，不应成为基础 `.odpkg` 运行的前置条件。

## 9. Key / Algorithm 演进

不同人员不应通过“使用不同算法”实现隔离。算法演进必须由版本和算法标识管理：

```text
formatVersion
encryption.algorithm
publisherKeyId
contentKeyId
issuerKeyId
key rotation / retirement policy
```

当未来需要替换算法时，应：

1. 新增明确 format / algorithm version；
2. Runtime 同时支持必要的迁移窗口；
3. 新 package 默认使用新算法；
4. 旧算法进入明确 retirement 生命周期；
5. 不通过隐式 magic bytes 或 Publisher 私有算法分叉 Runtime。

## 10. 进一步提高逆向成本

可以叠加，但必须与密码学保护分开描述：

- bundle / minify；
- 可控的 JavaScript obfuscation；
- 减少可读 symbol / diagnostic source 泄露；
- protected stack / error disclosure policy；
- Runtime anti-tamper / code-signing hardening；
- short-lived online entitlement；
- customer watermark；
- 高价值逻辑转移到 authenticated server-side service。

其中 obfuscation 的作用是提高分析成本，不是替代 AES-GCM、签名或授权。

对于绝不能交付给客户设备的核心算法，唯一稳妥的边界仍然是：

```text
protected local recipe
-> authenticated HTTPS
-> server-side proprietary logic
-> return only the required result
```

## 11. 文档分层

文档按责任分层：

| 文档 | 读者 | 内容 |
| --- | --- | --- |
| `docs/api/protected-packages.md` | 普通开发者 / Publisher | 公开 CLI、参数、返回值、公开格式与错误 |
| `docs/implementation/protected-packages.md` | OpenDesk 开发者 / 测试工程师 | 源码入口、本地生成、运行、测试、证据与排错 |
| `docs/maintenance/protected-packages.md` | Publisher / 管理员 / Release / Security | key lifecycle、环境隔离、rotation、compromise response |
| 本文 | Runtime / Security 架构 | threat model、平台化 key architecture、安全上限 |

安全不依赖“只把算法文档藏在管理员文档”。真正的生产 secret 不得写入任何仓库文档。

## 12. 冻结验收原则

后续实现与测试至少持续验证：

- 每包随机 DEK；
- Publisher 与 License issuer key domain 分离；
- `.odpkg` raw bytes 中不存在已知完整 source marker；
- package inspect 不返回 payload plaintext / DEK；
- protected execution 不生成 decrypted source snapshot；
- 未授权、DEK unavailable、signature invalid 时 JavaScript 零执行；
- plain `.js` 与 authorized `.odpkg` 的业务行为等价；
- 日志 / artifact 不泄露 private key、DEK 或 plaintext source；
- 不在 OpenDesk binary 中放置全局静态内容主密钥。
