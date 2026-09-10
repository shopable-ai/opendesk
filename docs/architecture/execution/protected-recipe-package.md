# Protected Recipe Package｜商业脚本保护与执行架构

## 1. 目标

OpenDesk 需要同时支持两种脚本交付方式：

- 普通 JavaScript：面向开发、调试、开源脚本和企业内部脚本，继续直接运行 `.js`。
- 受保护 Recipe：面向商业交付，使用 `.odpkg` 保护源码、验证发布者、承载授权信息，并在宿主内存中解密后复用现有 Execution Runtime 执行。

本设计的目标不是让 `.odpkg` 替代 `.js`，而是在不破坏现有脚本体验的前提下增加商业交付能力。

冻结后的用户心智为：

```text
.js
= 开发 / 调试 / 开源 / 内部使用
= 继续直接运行

.odpkg
= 商业交付 / 受保护 Recipe
= 验签 -> 授权 -> 取密钥 -> 内存解密 -> 现有 Execution Runtime
```

普通脚本必须继续支持：

```bash
./dist/opendesk -script recipe.js
./dist/opendesk ai run recipe.js
```

商业包目标支持：

```bash
./dist/opendesk -script recipe.odpkg
./dist/opendesk ai run recipe.odpkg
```

两条路径最终进入同一个 `pkg/execution.Run()`，不得创建第二套 Encrypted Runtime 或 Encrypted Goja。

---

## 2. 当前基线与问题

当前 OpenDesk 已经具备适合接入受保护脚本的基础：

- CLI 支持文件、inline、stdin 等普通脚本来源。
- `opendesk ai run` 当前读取 `.js` 源码后构造 `pkg/execution.Request`。
- `pkg/execution.Request` 已使用 `ScriptContent []byte` 承接待执行源码。
- JavaScript 最终由现有 Goja Runtime 执行。

因此缺少的不是另一套 JavaScript 引擎，而是 Execution 之前的可信加载层。

当前商业保护存在以下缺口：

- 没有受保护包格式。
- 没有 AES-GCM payload 加密链路。
- 没有发布者签名与验证链路。
- 没有 LicenseVerifier / ContentKeyProvider 边界。
- `ai run` 当前只接受 `.js`。
- 普通执行会生成源码 snapshot；该行为不能直接复用于受保护包。
- legacy HTTP inline 路径存在源码 preview 等调试行为；受保护内容不得进入这些泄露路径。
- 当前没有可以被视为商业脚本保护边界的 JavaScript `Crypto` 公共对象。

---

## 3. 核心设计决定

### 3.1 `.js` 必须继续直接运行

脚本保护是可选的商业交付层，不改变 OpenDesk 的 JavaScript-first 定位。

不得要求开发者为了本地运行先打包、先加密或先激活 License。

```text
Plain .js
    -> PlainScriptLoader
    -> ScriptSource
    -> pkg/execution.Run()

Protected .odpkg
    -> ProtectedPackageLoader
    -> package verification
    -> entitlement verification
    -> content-key resolution
    -> in-memory decryption
    -> ScriptSource
    -> pkg/execution.Run()
```

### 3.2 不创建第二套 Runtime

受保护包解密后的 JavaScript 仍交给现有 `pkg/execution.Request.ScriptContent`。

禁止新增：

- EncryptedRuntime
- ProtectedGoja
- SecureExecution 的平行执行引擎
- 仅为 `.odpkg` 复制一套 Runtime API 初始化逻辑

保护职责必须停留在执行入口之前。

### 3.3 不把商业保护设计成 JavaScript `Crypto.decrypt()`

普通业务未来可以独立增加 `Crypto.hash()`、`Crypto.randomBytes()`、`Crypto.encrypt()`、`Crypto.decrypt()` 等 Runtime API，但这些接口不是商业脚本保护的信任边界。

如果商业包依赖用户脚本自己解密：

- 解密调用本身可被修改。
- 密钥取得逻辑暴露给脚本环境。
- 脚本能够主动导出明文。
- Host 无法可靠执行 artifact / logging policy。

因此 `.odpkg` 的验签、授权、取密钥和解密必须由 Go Host 完成，然后才把 JavaScript 交给 Goja。

### 3.4 加密、签名、授权是三个独立问题

```text
Encryption
-> 防止用户直接读取源码

Publisher Signature
-> 验证包来自可信发布者并检测篡改

License / Entitlement
-> 判断当前用户或设备是否有权运行
```

三者不得合并成一个含义模糊的 `decryptPackage()`。

---

## 4. 总体架构

```text
                         BUILD / PUBLISH

recipe.js
   |
   +--> optional bundle / minify
   |
   +--> random 256-bit DEK
   |
   +--> AES-256-GCM encrypt payload
   |
   +--> manifest.json
   |
   +--> Ed25519 publisher signature
   |
   `--> recipe.odpkg


                         CUSTOMER / RUNTIME

recipe.odpkg
   |
   v
ProtectedPackageLoader
   |
   +--> Parse package
   +--> Validate format/version/limits
   +--> Verify publisher signature
   +--> LicenseVerifier.Verify(...)
   +--> ContentKeyProvider.Resolve(...)
   +--> AES-GCM decrypt in memory
   +--> Validate payload
   |
   v
ScriptSource
   |
   v
existing pkg/execution.Run()
   |
   v
existing Goja JavaScript Runtime
```

推荐代码职责：

```text
pkg/
├── scriptpackage/
│   ├── format.go
│   ├── reader.go
│   ├── writer.go
│   ├── encrypt.go
│   ├── signature.go
│   └── errors.go
│
├── scriptloader/
│   ├── loader.go
│   ├── plain.go
│   └── protected.go
│
├── licensing/
│   ├── license.go
│   ├── verifier.go
│   └── key_provider.go
│
└── execution/
    └── existing runtime
```

目录名称允许实施阶段依据当前仓库既有 package 习惯做最小调整，但职责边界不得合并。

---

## 5. ScriptLoader 契约

建议建立一个统一的宿主加载结果：

```go
type ProtectionMode string

const (
    ProtectionPlain     ProtectionMode = "plain"
    ProtectionProtected ProtectionMode = "protected"
)

type ProtectionInfo struct {
    Mode        ProtectionMode
    PackageID   string
    ProductID   string
    PublisherID string
    KeyID       string
}

type ScriptSource struct {
    Content    []byte
    Source     string
    Ext        string
    Protection ProtectionInfo
}

type Loader interface {
    Load(ctx context.Context, path string) (*ScriptSource, error)
}
```

职责：

- `PlainScriptLoader`：读取普通 `.js`，保持现有行为。
- `ProtectedPackageLoader`：只负责把一个已经授权的受保护包安全转换为 `ScriptSource`。
- `pkg/execution`：只执行 `ScriptSource.Content`，不负责 package parsing、License 网络请求或密钥生命周期。

不要把以下职责放入一个巨型 Loader：

- License 账号系统
- 商店购买逻辑
- 订阅计费
- Publisher 后台
- Runtime execution
- 日志系统

---

## 6. `.odpkg` v1 包格式

### 6.1 外层容器

`.odpkg` v1 推荐使用简单、可审计的容器，至少包含：

```text
recipe.odpkg
├── manifest.json
├── payload.bin
└── signature.ed25519
```

v1 首先支持单 JavaScript entrypoint；不要第一版就实现复杂 Workflow IR、多语言插件系统或任意资源安装器。

未来如需要多文件 Recipe，可升级 payload 类型，而不是推翻外层安全模型。

### 6.2 Manifest 最小字段

示例：

```json
{
  "format": "opendesk-protected-recipe",
  "formatVersion": 1,
  "packageId": "pkg_xxx",
  "productId": "wechat-export",
  "publisherId": "publisher_xxx",
  "publisherKeyId": "ed25519_xxx",
  "entrypoint": "main.js",
  "payloadType": "javascript",
  "minimumRuntimeVersion": "...",
  "encryption": {
    "algorithm": "AES-256-GCM",
    "keyId": "content_xxx",
    "nonce": "base64..."
  },
  "license": {
    "required": true,
    "productId": "wechat-export"
  }
}
```

要求：

- `formatVersion` 必须显式版本化。
- 未知 major / 不支持版本 fail closed。
- package reader 必须设置文件数量和大小限制，避免恶意包导致内存或磁盘资源耗尽。
- 不允许通过 entrypoint 路径穿越容器边界。

P0 对 `minimumRuntimeVersion` 只执行严格 SemVer 语法校验。当前仓库还没有冻结可作为比较依据的
canonical Runtime version source，因此 P0 不编造运行时版本高低判断；compatibility gate 在版本
来源与发布策略冻结后再接入 protected loader。

### 6.3 签名范围

不要依赖“重新序列化 JSON 后签名”，避免字段顺序和 canonical JSON 细节造成不稳定。

推荐对外层文件的原始字节摘要建立固定签名消息：

```text
"OpenDeskProtectedPackage/v1\0"
+ SHA256(raw manifest.json bytes)
+ SHA256(raw payload.bin bytes)
```

然后使用 Ed25519 对该 domain-separated message 签名。

Runtime 内只需要可信 publisher public key；publisher private key 不得进入客户 OpenDesk 二进制或安装包。

---

## 7. Payload 加密

v1 固定使用：

```text
AES-256-GCM
```

要求：

- 每个受保护包使用独立随机 256-bit DEK。
- nonce 使用 CSPRNG 生成，固定按 GCM 推荐长度使用，不得在同一 key 下复用。
- 使用 Go 标准库实现，不自行设计密码算法。
- `manifest.json` 原始字节作为 AEAD Additional Authenticated Data，绑定公开元数据与 ciphertext。
- 解密失败必须统一 fail closed，不执行任何 payload。
- 不把 decrypted source 写入临时 `.js`。

构建链路：

```text
source bytes
-> optional minify / bundle
-> AES-GCM(DEK, nonce, AAD=raw manifest)
-> payload.bin
```

运行链路：

```text
raw manifest
+ payload.bin
+ DEK
-> AES-GCM Open(...)
-> plaintext JavaScript bytes
-> existing execution request
```

---

## 8. 密钥与 License 边界

### 8.1 禁止全局静态 Master Key

禁止：

```text
OpenDesk binary
└── hard-coded AES master key
```

否则拿到一个客户端即可提取所有商业包的万能密钥。

也禁止把 DEK 明文写入：

- `.odpkg`
- manifest
- `.env`
- command line
- debug log
- script globals
- `Execution.env`

### 8.2 接口冻结

```go
type Entitlement struct {
    LicenseID string
    ProductID string
    SubjectID string
    ExpiresAt time.Time
}

type LicenseVerifier interface {
    Verify(ctx context.Context, manifest scriptpackage.Manifest) (*Entitlement, error)
}

type ContentKeyProvider interface {
    Resolve(ctx context.Context, manifest scriptpackage.Manifest, entitlement *Entitlement) ([]byte, error)
}
```

`ProtectedPackageLoader` 只组合这两个边界，不知道购买、支付、账号 UI 或 SaaS 后台细节。

### 8.3 分阶段实现

Phase A｜核心包保护基础设施：

- `.odpkg` format
- AES-GCM
- Ed25519
- ScriptLoader
- protected artifact policy
- 可测试的 LicenseVerifier / ContentKeyProvider seam
- `.js` / `.odpkg` 共用现有 execution

Phase A 可以有明确标记的 test/development key provider 用于离线自动化测试，但不得把这种 provider 描述为商业 License 方案。

Phase B｜商业可交付授权：

- installation/device identity
- OS secure storage
- device-bound entitlement
- wrapped DEK
- 离线 License 文件或在线激活

Phase C｜规模化商业授权：

- License service
- subscription entitlement
- device limits
- revoke / refresh
- publisher/key rotation
- observability 与运营后台

这三个阶段必须分别声明“已完成什么”，不得在只有 Phase A 时声称已经防止 License 分享。

---

## 9. CLI 契约

### 9.1 普通 JavaScript 保持兼容

必须继续：

```bash
./dist/opendesk -script recipe.js
./dist/opendesk ai run recipe.js
```

不得因为加入商业包而要求普通 `.js` 使用新的 Runtime 或新的入口。

### 9.2 商业包运行

目标：

```bash
./dist/opendesk -script recipe.odpkg
./dist/opendesk ai run recipe.odpkg
```

`ai run` 的 input、env、timeout 等业务参数语义应尽量与 `.js` 一致。

### 9.3 Publisher / packaging 命令

目标命令族：

```bash
./dist/opendesk package protect recipe.js -o recipe.odpkg ...
./dist/opendesk package inspect recipe.odpkg
./dist/opendesk package verify recipe.odpkg
```

`inspect` 只显示非敏感 manifest 信息，绝不输出 payload plaintext 或 content key。

密钥生成、publisher signing key 管理如果第一批没有成熟的安全存储方案，应明确作为开发/发布侧工具，不要仓促做成普通用户 Runtime API。

---

## 10. Protected Artifact Policy

这是受保护脚本能否真正用于商业交付的硬门禁。

普通 `.js` 可以继续遵循现有调试和 snapshot 行为；`.odpkg` 必须采用另一套 source disclosure policy。

Protected execution 默认：

- 不写 `script_snapshot.js`。
- 不允许 `-save-last-script` 导出解密源码。
- 不创建 decrypted temporary file。
- 不在 stdout/stderr/debug/event 中输出 script preview。
- 不把解密源码写入 summary / agent summary / SSE / HTTP response。
- stack/error 输出不得附带整段源代码。
- artifact 可以保存原始 `.odpkg` 的路径或 digest、packageId、publisherId、productId、signature status、license decision 和 execution result。

推荐把执行产物语义扩展为：

```text
plain execution
-> scriptSnapshotPath may exist

protected execution
-> scriptSnapshotPath empty
-> packageDigest available
-> packageId available
-> protectionMode = protected
```

禁止为了保持现有 `script_snapshot` 字段非空而把明文写回磁盘。

---

## 11. HTTP / MCP / Scheduler / Custom UI 边界

`.odpkg` 不能只在一个 CLI 入口安全，而在其他 transport 被绕过。

实施时至少审查：

- direct CLI `-script`
- `opendesk ai run`
- HTTP script execution
- MCP execution
- Scheduler execution
- Custom UI 启动脚本
- auto-run / `tm.config.js`
- debug / save-last-script / artifact snapshot

第一批不必让所有 transport 都立即支持 `.odpkg`，但必须遵守：

```text
unsupported protected package
-> explicit fail closed
```

而不是：

```text
protected package
-> 当普通文本读取
-> 失败后 fallback
-> 或偷偷写出 plaintext
```

所有未来 transport 最终应复用统一 ScriptLoader，而不是各自复制 package 解密实现。

---

## 12. 内存安全与真实安全上限

受保护包能够显著提高以下攻击成本：

- 直接打开 `.js` 阅读源码。
- 简单复制和二次分发源码。
- 修改 package 后继续运行。
- 非授权用户直接获取 package plaintext。

但客户端执行无法承诺“拥有本机管理员权限的人永远无法得到运行中的 JavaScript”。

原因：

```text
ciphertext
-> Host decrypts
-> plaintext exists in process memory
-> Goja evaluates JavaScript
```

因此设计目标是：

- 磁盘默认无明文。
- 明文生命周期尽可能局部。
- 不主动复制到 artifact / log / environment。
- 使用后尽早释放可清零的 byte buffer。
- 不把“memory-only”描述为绝对防逆向。

对于最高价值、绝不能交付到客户设备的算法，应使用：

```text
protected local recipe
-> authenticated HTTPS
-> server-side proprietary logic
-> only result returned
```

这属于更高等级 IP protection，不应与本地 `.odpkg` 混为一谈。

---

## 13. 错误模型

建议为 package / loader 提供稳定错误分类：

```text
unsupported_format
invalid_package
package_too_large
invalid_manifest
invalid_signature
unknown_publisher
license_required
license_denied
license_expired
content_key_unavailable
decryption_failed
payload_invalid
unsupported_payload
protected_source_export_denied
```

安全错误默认不回显：

- DEK
- key material
- raw plaintext
- signature private material
- license secret

CLI 和 Agent output 可以返回安全的 machine-readable code 与最小 message。

---

## 14. 测试空间

### 14.1 Package crypto

必须覆盖：

- 正常 AES-GCM round trip。
- payload 任意 bit 被修改后失败。
- manifest 任意受保护字段被修改后失败。
- signature 被修改后失败。
- publisher public key 不匹配后失败。
- nonce / key 长度非法 fail closed。
- 不支持 formatVersion fail closed。

### 14.2 Loader

必须覆盖：

- `.js` 继续读取并正常执行。
- `.odpkg` 验签 / 授权 / 解密后进入相同 execution runner。
- License denied 时 JavaScript 零执行。
- DEK unavailable 时 JavaScript 零执行。
- package malformed 时 JavaScript 零执行。

### 14.3 Disclosure regression

必须主动断言 protected execution 后以下位置不存在已知 plaintext marker：

- run artifact directory
- script snapshot
- stdout
- stderr
- events.ndjson
- summary.json
- agent_summary.json

测试脚本应包含一个唯一 marker，例如：

```text
OPENDESK_PROTECTED_SOURCE_SENTINEL_...
```

运行后扫描允许检查的测试输出，证明 marker 未落盘。

### 14.4 Backward compatibility

必须验证普通 `.js`：

- `-script` 行为未破坏。
- `ai run` input/env/timeout 行为未破坏。
- 现有 JavaScript Runtime API 初始化不因 package 支持发生分叉。

---

## 15. 第一批实施范围

第一批只完成价值最高且边界清晰的部分：

```text
P0
├── protected package v1
├── AES-256-GCM payload encryption
├── Ed25519 publisher signature
├── ScriptLoader abstraction
├── PlainScriptLoader
├── ProtectedPackageLoader
├── LicenseVerifier seam
├── ContentKeyProvider seam
├── .odpkg -> existing pkg/execution.Run()
├── protected artifact / logging policy
├── CLI minimum integration
├── tests
└── docs
```

第一批明确不做：

- SaaS License Server。
- 支付 / 订阅系统。
- 商店。
- 复杂 PKI。
- 多 publisher 后台。
- 多语言 payload Runtime。
- Workflow IR。
- 自定义密码算法。
- 以代码混淆代替真正的加密和签名。
- 把 test/development key provider 宣传成最终商业授权方案。

---

## 16. 后续商业授权方向

在 P0 稳定后，优先实现适合小规模商业交付的 Device-bound License：

```text
OpenDesk installation
-> generate device key pair
-> private material stored by OS secure storage
-> export device public identity

publisher / license issuer
-> verify purchase / entitlement
-> issue signed license
-> wrap package DEK for authorized device

customer runtime
-> verify license signature
-> validate product/package/device/expiry
-> unwrap DEK locally
-> protected package loader
```

平台建议：

- macOS：Keychain 保存设备私密材料。
- Windows：使用 DPAPI 等系统保护机制保存设备私密材料。

机器 ID 只能作为绑定证据之一，不应直接派生 AES 内容密钥。

### 16.1 P1 Device-bound Offline License 冻结实现

P1 采用以下标准 primitive，保持 package encryption、License signature 与 device wrapping 三个 domain
彼此独立：

```text
installation key pair
→ random P-256 ECDH private key
→ DeviceID = SHA-256(domain || algorithm || public key)

content-key envelope
→ ephemeral P-256 ECDH
→ HKDF-SHA256
→ AES-256-GCM
→ AAD 绑定 formatVersion / productId / packageId / contentKeyId / deviceId / deviceKeyAlgorithm

offline License signature
→ Ed25519(domain || SHA-256(raw license claims bytes))
```

License v1 使用 `.odlicense`，外层只包含原始 `license` claims object 与 `signature`。验证时对读取到的
原始 claims bytes 建立签名消息，不依赖 JSON 重序列化；parser 拒绝 duplicate key、未知字段、非 canonical
Base64、未知版本和异常大小。`issuedAt` 是 not-before 边界，`expiresAt` 到达即失效。

设备私钥的 production owner 为：

- macOS：Keychain generic-password item，使用 `WhenUnlockedThisDeviceOnly`，禁止 iCloud 同步。
- Windows：当前用户范围的 `CryptProtectData` DPAPI，ciphertext 文件仅保存于当前用户
  `LocalAppData`，并使用 application/item domain 作为 optional entropy；用户 profile、文件 ACL 与 DPAPI
  共同约束读取范围，不使用可被同机其他用户解密的 `CRYPTPROTECT_LOCAL_MACHINE`。

普通文件、环境变量、SQLite 和 License 文件都不保存 plaintext device private key。`.odlicense` 仅包含
ephemeral public key、nonce 和 authenticated wrapped DEK；DEK 只以 caller-owned 短生命周期 buffer 进入
protected loader，并在解密后清零。

P1 的 `license install` 要求操作者显式提供 package publisher public key 与 License issuer public key，完整
验证 package signature、License signature、device/time/metadata binding、DEK unwrap 与 package decrypt 后，
才把 License 和两个精确 public-key pin 安装到确定性用户目录。Runtime 不自动信任 package 或 License
自带的 key。P1 pin 只解决单 key 的离线信任入口；registry、rotation、retirement 和 compromise governance
仍由 P3 负责。

---

## 17. Definition of Done

### 架构完成

- `.js` 与 `.odpkg` 的职责清晰。
- 普通 `.js` 继续直接运行。
- `.odpkg` 不是第二套 Runtime。
- Package / Loader / License / Key / Execution 边界独立。
- 密钥不硬编码进 OpenDesk。
- Protected Artifact Policy 被明确冻结。

### P0 代码完成

- 可以生成一个 v1 `.odpkg` 测试包。
- 可以验证 publisher signature。
- 可以通过注入的授权与 key provider 解密并运行。
- 解密后的 bytes 直接进入现有 `pkg/execution.Run()`。
- 不生成 plaintext script snapshot。
- plaintext sentinel 不出现在声明禁止的 artifacts/logs 中。
- 普通 `.js` 的主要入口回归通过。

### 商业可交付完成

只有在额外完成 Device-bound / Online License 中至少一种真实授权方案后，才能声明“商业授权闭环完成”。

P0 只能声明“商业脚本保护基础设施完成”，不能扩大表述。

---

## 18. 最终冻结主链路

```text
Developer source
    |
    +------------------------------+
    |                              |
    v                              v
plain recipe.js               protected recipe.odpkg
    |                              |
PlainScriptLoader             ProtectedPackageLoader
                                   |
                              verify signature
                                   |
                              verify entitlement
                                   |
                              resolve content key
                                   |
                              decrypt in memory
    |                              |
    +--------------+---------------+
                   |
                   v
              ScriptSource
                   |
                   v
         existing pkg/execution.Run()
                   |
                   v
             existing Goja
```

这条链路是后续代码实施、测试和文档更新的主依据。
