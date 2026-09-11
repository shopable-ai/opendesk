---
title: 受保护包 CLI
description: OpenDesk .odpkg 打包、验签、设备 License、在线 activation 与执行入口的公开命令行契约。
order: 610
---

# 受保护包 CLI

本页是 OpenDesk 受保护包（protected package，`.odpkg`）的公开 CLI Reference。它覆盖 Publisher 侧
`.js` → `.odpkg`、P1 device-bound offline License、P2 online activation 和客户侧执行入口。普通 `.js`、
`.odpkg` 的完整执行差异及 `Execution.input` / artifact 语义见 [AI CLI](ai-cli.md#ai-run-与--script)。

以下命令均从仓库根目录执行，并假设使用与待发布源码或已安装版本匹配的 `./dist/opendesk`。仓库中已有 binary
不自动证明其 provenance；发布前应核对构建来源。

## 术语与职责

“Recipe”在现有文档、路径和命令示例中仍可指可复用的 JavaScript 自动化，但它不是另一种脚本语言，也不等于
`.odpkg`。Human-to-Recipe / Agent-to-Recipe 是把示范或探索整理为普通 `.js` 的作者工作流；受保护包发布从一份
已经准备好的 `.js` 开始，不负责录制、理解或重写业务流程。

| 阶段 | 公共名称 | 输入与输出 | 责任边界 |
| --- | --- | --- | --- |
| 编写自动化 | JavaScript automation / Recipe | 需求或示范 → `.js` | 编写、调试、参数化与业务验证 |
| 保护并打包 | 受保护包发布 | `.js` → `.odpkg` | 加密 payload、建立公开 manifest、Package Publisher 签名 |
| 准备发布材料 | Package Publisher / License issuer | 独立签名密钥、每包 DEK、public keys | package signing 与 License/entitlement signing 用途分离 |
| 客户授权 | P1 offline License 或 P2 online activation | `.odlicense` 或 signed online cache | 决定指定客户/设备是否可取得 DEK；不改写脚本 |
| 执行 | 运行受保护包 | `.odpkg` → 既有 Execution Runtime | 验签、授权、内存解密后复用唯一 Goja；不产生明文 snapshot |

`Protected Recipe` 仍是既有架构/阶段目录、序列化 format domain 和环境变量中的兼容名称；本次只澄清公共展示
语言，不修改这些稳定标识。Publisher 作业使用简短且直接指向交付格式的 `$build-odpkg`。命名取舍见
[受保护包术语与信息架构](../architecture/execution/protected-package-terminology.md)。

## API 一览

| 命令 | 位置 | 用途 |
| --- | --- | --- |
| `opendesk package protect` | Publisher | 加密 JavaScript、建立 manifest 并签名 `.odpkg` |
| `opendesk package inspect` | Publisher / Customer | 读取 package 结构、公开 manifest 与 digest |
| `opendesk package verify` | Publisher / Customer | 用指定 public key 验证 publisher signature |
| `opendesk license device` | Customer device | 创建或读取 OS-protected device identity，并导出 public identity |
| `opendesk license issue` | Publisher / License issuer | 为一个 device 和 package 签发 P1 `.odlicense` |
| `opendesk license inspect` | Publisher / Customer | 读取非敏感 offline License metadata |
| `opendesk license verify` | Customer device | 验证 P1 signature、时间、device binding 与 DEK unwrap |
| `opendesk license install` | Customer device | 验证并安装 P1 License 与精确 public-key pins |
| `opendesk license activate` | Customer device | 从 HTTPS entitlement service 激活并安装 P2 signed cache |
| `opendesk license status` | Customer device | 离线检查本地 P2 cache、binding 与 replay watermark |
| `opendesk license refresh` | Customer device | 取得同一 activation 的更高 signed sequence |
| `opendesk license deactivate` | Customer device | 取得 signed revoked state 并释放服务端 device slot |
| `opendesk -script package.odpkg` | Customer runtime | 通过通用本地脚本入口执行受保护包 |
| `opendesk ai run package.odpkg` | Customer runtime / Agent | 通过 JSON/结构化输入入口执行受保护包 |

## 公共约定

`package` 和 `license` 命令的 stdout 都只包含一个 JSON envelope：

```json
{"ok":true,"command":"package.verify","result":{}}
```

```json
{"ok":false,"command":"package.verify","error":{"code":"invalid_signature","message":"..."}}
```

成功退出码为 `0`，命令或参数错误为 `2`，其他 package/license 操作失败为 `1`。调用方必须同时检查退出码、
`ok` 和命令特有结果，不能把一段可解析 JSON 当成成功。

`.odpkg` v1 固定为 JavaScript `main.js` payload、AES-256-GCM encryption 和 Ed25519 publisher signature。
五个 manifest ID（package、product、publisher、publisher key、content key）必须匹配
`^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$`。`minimumRuntimeVersion` 必须是严格 SemVer；当前只校验语法，尚未冻结
canonical Runtime version comparison gate。

Ed25519 private-key 文件接受单个 PKCS#8 PEM key 或 64 raw bytes；public-key 文件接受单个 PKIX PEM key 或
32 raw bytes。DEK 文件接受 32 raw bytes、64 hex characters 或 32-byte standard Base64。private key、DEK 和
bearer token 都只通过文件路径参数进入 CLI。

## opendesk package protect

把一个 JavaScript 文件加密、签名并写为 `.odpkg`。

**签名**

```text
./dist/opendesk package protect <script.js> -o <package.odpkg> --package-id <id> --product-id <id> --publisher-id <id> --publisher-key-id <id> --content-key-id <id> [--minimum-runtime-version <semver>] --signing-key <private-key-file> (--content-key <dek-file> | --key-out <new-dek-file>) [--license-required=<bool>]
```

**参数**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `script.js` | path | 是 | 无 | 非空 JavaScript source；只读取，不执行 |
| `-o` | path | 是 | 无 | `.odpkg` 输出路径；当前 writer 可覆盖既有文件，调用前必须使用全新路径 |
| `--package-id` | string | 是 | 无 | package identity |
| `--product-id` | string | 是 | 无 | product identity；同时写入 License policy |
| `--publisher-id` | string | 是 | 无 | publisher identity |
| `--publisher-key-id` | string | 是 | 无 | package signing public-key identity |
| `--content-key-id` | string | 是 | 无 | DEK identity；不是 DEK 本身 |
| `--minimum-runtime-version` | SemVer | 否 | `0.0.0` | 只做语法校验 |
| `--signing-key` | path | 是 | 无 | Publisher Ed25519 private-key 文件 |
| `--content-key` | path | 条件 | 无 | 使用已有 DEK 文件；与 `--key-out` 二选一 |
| `--key-out` | path | 条件 | 无 | 生成随机 256-bit DEK 并以 0600 exclusive-create 写到全新路径 |
| `--license-required` | boolean | 否 | `true` | 只有明确制作无 License package 时使用 `--license-required=false` |

**返回值**

`result` 包含 `output`、`packageId`、`productId`、`publisherId`、`publisherKeyId`、`packageDigest` 和
`generatedContentKeyFile`。最后一项只返回生成 DEK 的路径，不返回其内容。

**行为与错误**

源码使用独立随机 nonce 和 256-bit DEK 进行 AES-GCM 加密；原始 manifest bytes 同时绑定到 AAD 与 package
signature。DEK 不写入 `.odpkg`。自动生成 DEK 而未给 `--key-out` 会返回 `invalid_argument`。

当前 `.odpkg` writer 不是 exclusive-create；命令本身不会保护既有输出。安全调用方必须先选择不存在的路径，
不得用该命令覆盖已有 artifact。若生成 DEK 后 package 写入失败，CLI 会精确删除本次新建的 key file。
安全调用约定要求 `--content-key` / `--key-out` 恰好二选一；当前 parser 若两者同时出现会使用
`--content-key` 且不写 `--key-out`，调用方不得依赖这种静默优先级。

**示例**

```bash
./dist/opendesk package protect recipes/invoice.js -o releases/invoice-1.odpkg --package-id invoice-1 --product-id invoice --publisher-id acme --publisher-key-id acme-package-2026 --content-key-id invoice-dek-1 --minimum-runtime-version 0.0.0 --signing-key keys/acme-package-private.pem --key-out keys/invoice-dek-1.key
```

## opendesk package inspect

读取 `.odpkg` 的结构、公开 manifest 和 package digest，不解密 payload。

**签名**

```text
./dist/opendesk package inspect <package.odpkg>
```

**参数**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `package.odpkg` | path | 是 | 无 | 待检查 package；只能提供一个路径 |

**返回值**

`result.manifest` 是经过 strict parser 校验的公开 manifest；`result.packageDigest` 是原始 `.odpkg` bytes 的
SHA-256 hex digest。

**行为与错误**

本命令验证容器条目、大小、manifest 结构和格式版本，但不验证 publisher signature、License 或 DEK。输出不包含
payload plaintext 或 content key。

**示例**

```bash
./dist/opendesk package inspect releases/invoice-1.odpkg
```

## opendesk package verify

用显式提供的 Publisher public key 验证 package structure 和 Ed25519 signature。

**签名**

```text
./dist/opendesk package verify <package.odpkg> --public-key <publisher-public-key-file>
```

**参数**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `package.odpkg` | path | 是 | 无 | 待验签 package |
| `--public-key` | path | 是 | 无 | 预期 Publisher Ed25519 public-key 文件 |

**返回值**

`result` 包含 `signatureVerified: true`、`packageId`、`publisherId`、`publisherKeyId` 和 `packageDigest`。

**行为与错误**

验签覆盖原始 manifest 与 ciphertext payload。成功只证明 package 与该 public key 匹配；不证明 public key 已由
外部信任流程认可，也不证明当前用户/设备获得 License。

**示例**

```bash
./dist/opendesk package verify releases/invoice-1.odpkg --public-key keys/acme-package-public.pem
```

## opendesk license device

确保当前 OpenDesk installation 拥有设备密钥，并返回可交给 License issuer 的 public identity。

**签名**

```text
./dist/opendesk license device [-o <device-public.json>]
```

**参数**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `-o` | path | 否 | 空 | 以 0644 exclusive-create 写出 public identity；省略时仍在 JSON result 中返回 identity |

**返回值**

`result.identity` 包含 `format`、`formatVersion`、`deviceId`、`keyAlgorithm` 和 public key；`result.output` 是
请求的输出路径。输出不包含 device private key。

**行为与错误**

首次调用会创建随机 P-256 identity；后续调用应读取相同 identity。private material 的 production owner 在
macOS 是 Keychain，在 Windows 源码中是 current-user DPAPI；Windows live 资格边界见
[平台与能力](#平台与能力)。

**示例**

```bash
./dist/opendesk license device -o customers/device-public.json
```

## opendesk license issue

为一个客户 device public identity 和一个需要 License 的 `.odpkg` 签发 P1 offline `.odlicense`。

**签名**

```text
./dist/opendesk license issue <package.odpkg> --device <device-public.json> --content-key <dek-file> --signing-key <license-private-key-file> --license-id <id> --subject-id <id> --issuer-key-id <id> [--issued-at <utc-rfc3339>] --expires-at <utc-rfc3339> -o <license.odlicense>
```

**参数**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `package.odpkg` | path | 是 | 无 | `license.required: true` 的 package |
| `--device` | path | 是 | 无 | 客户导出的 public device identity |
| `--content-key` | path | 是 | 无 | 与 package 对应的 DEK 文件 |
| `--signing-key` | path | 是 | 无 | 独立 License issuer Ed25519 private-key 文件 |
| `--license-id` | string | 是 | 无 | License identity |
| `--subject-id` | string | 是 | 无 | 被授权主体 identity |
| `--issuer-key-id` | string | 是 | 无 | License issuer public-key identity |
| `--issued-at` | UTC RFC3339 | 否 | 当前 UTC 秒 | 可选 not-before；给出时必须 canonical |
| `--expires-at` | UTC RFC3339 | 是 | 无 | exclusive expiry；必须 canonical |
| `-o` | path | 是 | 无 | 全新 `.odlicense`；以 0600 exclusive-create 写入 |

**返回值**

`result` 包含 format/version、License/publisher/subject/device/product/package/content-key identity、有效期、
`keyEnvelopeAlgorithm` 和 `output`，不包含 wrapped ciphertext 或 DEK。

**行为与错误**

命令先证明 DEK 可以解密 package，再使用 ephemeral P-256 ECDH、HKDF-SHA256 与 AES-256-GCM 把 DEK 绑定到
客户 public device key，并以独立 Ed25519 License domain 签名。该命令不接受 package public key，因此不能
替代先执行的 `package verify`。

**示例**

```bash
./dist/opendesk license issue releases/invoice-1.odpkg --device customers/device-public.json --content-key keys/invoice-dek-1.key --signing-key keys/acme-license-private.pem --license-id invoice-customer-1 --subject-id customer-1 --issuer-key-id acme-license-2026 --expires-at 2027-01-01T00:00:00Z -o releases/invoice-customer-1.odlicense
```

## opendesk license inspect

读取 P1 offline License 的公开 metadata，不进行 signature 或 device validation。

**签名**

```text
./dist/opendesk license inspect <license.odlicense>
```

**参数**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `license.odlicense` | path | 是 | 无 | 待检查的 P1 License |

**返回值**

返回与 `license issue` 相同的安全 metadata 投影，但不包含 `output`。

**行为与错误**

strict parser 会拒绝不支持版本、duplicate/unknown 字段和 malformed encoding。成功不表示 signature、时间或
device binding 已通过。

**示例**

```bash
./dist/opendesk license inspect releases/invoice-customer-1.odlicense
```

## opendesk license verify

在当前客户设备上验证 P1 License signature、时间、device binding 和 DEK unwrap。

**签名**

```text
./dist/opendesk license verify <license.odlicense> --issuer-key <license-issuer-public-key-file>
```

**参数**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `license.odlicense` | path | 是 | 无 | 待验证 License |
| `--issuer-key` | path | 是 | 无 | 预期 License issuer Ed25519 public-key 文件 |

**返回值**

安全 metadata 之外返回 `signatureVerified: true`、`deviceBindingVerified: true` 和
`contentKeyAccessible: true`。不返回 DEK。

**行为与错误**

该验证与当前 OS-protected device private key 绑定；Publisher 机器或其他客户设备通常不能替代目标客户执行。
本命令不安装 License，也不验证对应 package signature。

**示例**

```bash
./dist/opendesk license verify releases/invoice-customer-1.odlicense --issuer-key keys/acme-license-public.pem
```

## opendesk license install

在当前客户设备验证并安装 P1 License、package publisher pin 和 License issuer pin。

**签名**

```text
./dist/opendesk license install <license.odlicense> --package <package.odpkg> --package-publisher-key <publisher-public-key-file> --issuer-key <license-issuer-public-key-file>
```

**参数**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `license.odlicense` | path | 是 | 无 | 待安装 P1 License |
| `--package` | path | 是 | 无 | 与 License 精确绑定的 `.odpkg` |
| `--package-publisher-key` | path | 是 | 无 | Package Publisher public key |
| `--issuer-key` | path | 是 | 无 | License issuer public key |

**返回值**

安全 License metadata 之外返回 `installed: true`、`signatureVerified: true` 和 `packageVerified: true`。

**行为与错误**

安装前验证 package signature、License signature、device/time/metadata binding、DEK unwrap 和实际 package
decrypt。成功会写当前用户的确定性 License/pin store；`OPENDESK_PROTECTED_RECIPE_ROOT` 可以把该 store 移到
绝对、非根路径，但不会移动或导出 OS device private key。该命令有本地持久化副作用。

**示例**

```bash
./dist/opendesk license install releases/invoice-customer-1.odlicense --package releases/invoice-1.odpkg --package-publisher-key keys/acme-package-public.pem --issuer-key keys/acme-license-public.pem
```

## opendesk license activate

通过 authenticated HTTPS entitlement service 激活一个需要 License 的 package，并安装 P2 signed cache。

**签名**

```text
./dist/opendesk license activate <package.odpkg> --service <https-url> --token-file <credential-file> --package-publisher-key <publisher-public-key-file> --issuer-key <entitlement-issuer-public-key-file> [--ca-file <additional-ca.pem>]
```

**参数**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `package.odpkg` | path | 是 | 无 | `license.required: true` 的 package |
| `--service` | HTTPS URL | 是 | 无 | 不得含 credentials、query 或 fragment |
| `--token-file` | path | 是 | 无 | 有界 regular file 中的 bearer credential；没有明文 token flag |
| `--package-publisher-key` | path | 是 | 无 | Package Publisher public key |
| `--issuer-key` | path | 是 | 无 | Online entitlement Ed25519 issuer public key |
| `--ca-file` | path | 否 | system roots | 只扩展 system root pool；不关闭 hostname/certificate verification |

**返回值**

`result` 包含 format/version、activation/entitlement/sequence/state、时间窗口、License/device/product/package/key
identity，并返回 `authorized: true`、`installed: true`、`packageVerified: true` 和
`signatureVerified: true`。不包含 token、DEK 或 key envelope。

**行为与错误**

客户端要求 TLS 1.2+，拒绝 redirect，并验证 package signature、响应 signature、request nonce、
device/package/time binding、DEK unwrap 与 package decrypt，最后才安装 cache 和精确 key pins。成功还会提交
OS-protected activation/replay watermark。该命令会修改本地状态，并可能占用服务端 device slot。

**示例**

```bash
./dist/opendesk license activate releases/invoice-1.odpkg --service https://licenses.example.com --token-file credentials/activation.token --package-publisher-key keys/acme-package-public.pem --issuer-key keys/acme-license-public.pem
```

## opendesk license status

不访问网络，验证并投影当前 package 的本地 P2 authorization state。

**签名**

```text
./dist/opendesk license status <package.odpkg>
```

**参数**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `package.odpkg` | path | 是 | 无 | 已建立 online activation state 的 package |

**返回值**

返回 P2 安全 metadata，以及 `authorized`、`refreshRequired` 和 `offlineGraceExpired`。revoked 或超过有效窗口时可
以成功 envelope 返回 `authorized: false`；调用方必须检查该字段，不能只检查退出码。

**行为与错误**

命令验证本地 package signature、signed cache、device binding 与 OS-protected replay watermark，不接受
service、token 或 CA 参数。cache rollback、同 sequence mutation、删除已激活 cache 或 binding 错误会 fail
closed，而不是 fallback 到旁置 P1 License。

**示例**

```bash
./dist/opendesk license status releases/invoice-1.odpkg
```

## opendesk license refresh

向 entitlement service 请求同一 activation 的更高 signed sequence，并更新本地 P2 state。

**签名**

```text
./dist/opendesk license refresh <package.odpkg> --service <https-url> --token-file <credential-file> [--ca-file <additional-ca.pem>]
```

**参数**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `package.odpkg` | path | 是 | 无 | 已激活 package |
| `--service` | HTTPS URL | 是 | 无 | Online entitlement service |
| `--token-file` | path | 是 | 无 | File-only bearer credential |
| `--ca-file` | path | 否 | system roots | 可选 additional CA PEM |

**返回值**

返回更新后的 P2 安全 metadata、`authorized` 和 `updated: true`。

**行为与错误**

响应必须属于同一 activation、拥有更高 sequence，并保持 issuer identity；active 响应还会重新证明 DEK 可解密
package。CLI 先推进 OS-protected watermark，再替换 cache；后续写入失败会使旧 cache 被拒绝。服务不可用不会
延长现有 signed `offlineUntil`。

**示例**

```bash
./dist/opendesk license refresh releases/invoice-1.odpkg --service https://licenses.example.com --token-file credentials/activation.token
```

## opendesk license deactivate

向 entitlement service 请求 signed revoked state，更新本地 P2 state 并释放 device slot。

**签名**

```text
./dist/opendesk license deactivate <package.odpkg> --service <https-url> --token-file <credential-file> [--ca-file <additional-ca.pem>]
```

**参数**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `package.odpkg` | path | 是 | 无 | 已激活 package |
| `--service` | HTTPS URL | 是 | 无 | Online entitlement service |
| `--token-file` | path | 是 | 无 | File-only bearer credential |
| `--ca-file` | path | 否 | system roots | 可选 additional CA PEM |

**返回值**

首次成功返回 revoked P2 安全 metadata、`authorized: false`、`deactivated: true` 和 `updated: true`。若本地 state
已 revoked，返回 `unchanged: true` 而不再次调用服务；该无变化分支不返回 `updated: true`。

**行为与错误**

只有验证过的 signed revoked response 才能完成首次 deactivate。后续 Runtime 在执行 JavaScript 前返回
`license_revoked`。该命令有本地与远端状态副作用。

**示例**

```bash
./dist/opendesk license deactivate releases/invoice-1.odpkg --service https://licenses.example.com --token-file credentials/activation.token
```

## 执行受保护包

授权材料安装或 online activation 完成后，`.odpkg` 使用既有本地执行入口：

```bash
./dist/opendesk -script releases/invoice-1.odpkg
./dist/opendesk ai run releases/invoice-1.odpkg
```

两个入口都先验证 package publisher、License/entitlement 和 content key，在 Host 内存中解密 JavaScript，再进入
同一个 `pkg/execution.Run()` / Goja；不会创建第二套受保护 Runtime。Direct `-script` 提供通用终端运行选项，
`ai run` 提供单一 JSON envelope、`Execution.input` 和 Agent artifact 语义。完整参数与差异见
[AI CLI：ai run 与 -script](ai-cli.md#ai-run-与--script)。

普通 `.js` 不访问 package 或 License owner。`.odpkg` 授权失败时在 JavaScript 启动前 fail closed，不回退为普通
文本执行；HTTP、MCP 和 Scheduler 当前也没有 `.odpkg` 文件输入。受保护执行不写 `script_snapshot.js`，并禁止
`-save-last-script` 导出明文。

## Runtime 等价性验证

`package inspect` / `package verify` 不能替代授权后的行为验证。仓库提供一条由已编译 OpenDesk Runtime 执行的
canonical JavaScript gate，从 plain source 经 package、真实 P1 device/issue/verify/install 到 protected execution，
分别比较 basic、`ai run --input-file` 参数化结果和 real native UI 的语义/视觉证据：

```bash
./dist/opendesk -script tests/protected-packages/runtime-equivalence.js -console-mode script
```

命令从仓库根目录运行；完整前置条件、Oracle、预期差异、失败分级、证据目录和安全清理见
[`build-odpkg Runtime equivalence plan`](../../workflows/protected-packages/skills/build-odpkg/references/runtime-equivalence.md)。
该 gate 不使用 `--license-required=false`，也不把 inspect/verify 写成 authorization 结论。

## 错误

所有错误 envelope 只返回稳定 code 和最小安全 message。当前公开分类如下：

| 分类 | 错误码 | 含义 |
| --- | --- | --- |
| 命令 | `invalid_command`、`invalid_argument`、`internal_error` | 命令、参数、文件或内部失败 |
| Package | `unsupported_format`、`invalid_package`、`package_too_large`、`invalid_manifest`、`invalid_signature`、`decryption_failed`、`payload_invalid`、`unsupported_payload` | Container、manifest、signature、ciphertext 或 payload 无效 |
| Device | `invalid_device_identity`、`device_identity_missing`、`device_key_unavailable` | Public identity 或 OS-protected device key 不可用 |
| P1 License | `unknown_publisher`、`license_required`、`license_denied`、`license_expired`、`license_not_yet_valid`、`invalid_license`、`invalid_license_signature`、`wrong_device`、`content_key_unavailable` | 信任、License、设备、时间或 DEK 验证失败 |
| P2 entitlement | `device_limit_exceeded`、`license_revoked`、`offline_grace_expired`、`invalid_entitlement_cache`、`invalid_entitlement_signature`、`entitlement_replay_detected`、`entitlement_service_unavailable`、`entitlement_authentication_required` | Online policy、cache、replay、服务或凭据失败 |
| Protected execution | `protected_source_export_denied` | `.odpkg` 禁止通过 `-save-last-script` 导出；见 [AI CLI](ai-cli.md#odpkg-受保护包执行语义) |

具体命令只会产生适用于其阶段的子集。安全错误不得回显 source、private material、DEK、wrapped ciphertext 或
credential。

## 安全约束

- 每包使用独立 256-bit DEK；Package Publisher、License/entitlement issuer 与 device keys 按用途和 domain
  分离。即使 package 与 License 都使用 Ed25519，也不应复用 private key。
- 不在 command line、环境变量、`.env`、Runtime globals、artifact 或报告中放 secret value。只传
  `--signing-key`、`--content-key`、`--key-out` 和 `--token-file` 等文件路径。
- `package inspect` 不证明 signature；`package verify` 不证明 trust 或 authorization；`license inspect` 不证明
  License 有效；`license status` 必须检查 `authorized`。
- `.odpkg` 执行只在 Host memory 中解密，不写 `script_snapshot.js`、临时明文 `.js` 或 source preview；这提高
  源码获取成本，但不承诺对本机管理员、调试器或进程内存的绝对防提取。
- P2 client 只接受 HTTPS，TLS 1.2+，不跟随 redirect；private CA 只能扩展 system roots。token 不进入 request
  body、CLI JSON、cache、artifact 或 `Execution.env`。
- `.runtime/` acceptance secrets 是一次性运行材料，不是可复用 fixture、Publisher key store 或客户输入。

## 平台与能力

下表描述 2026-09-11 P2 checkpoint 的实际资格边界；新 release 仍需用对应源码重新验证。

| 能力 | macOS | Windows/amd64 |
| --- | --- | --- |
| Package/license/entitlement owners build | 当前 checkpoint native build/tests 已通过 | `CGO_ENABLED=0` owner cross-build 已生成 PE32+ x86-64 |
| `package protect/inspect/verify` CLI live | matching-source CLI smoke 已通过 | 未在 Windows 真机运行，not qualified |
| Device private-key owner | Keychain live 已验证 | current-user DPAPI source/owner cross-build 已验证；DPAPI live、用户范围/ACL 与 reopen 未验证 |
| P1 device/issue/verify/install 与 protected Runtime | macOS Keychain Direct/AI live 已通过 | Windows live package/license/install/Runtime 未验证，not qualified |
| P2 activate/status/refresh/deactivate 与 protected Runtime | macOS real TLS/Keychain live 已通过 | Windows live activation/full chain 未验证，not qualified |
| 完整应用 package/installer/install | 本页不作发布资格声明 | 完整 `opendesk` / native host、正式 package、installer 和安装后运行未验证 |

Windows 已验证范围只包括 `pkg/licensing`、`pkg/deviceidentity`、`pkg/entitlement`、
`pkg/entitlementservice`、`pkg/scriptloader`、`internal/licensecli`、`internal/packagecli` 与 reference entitlement
server 的 owner cross-build。完整 host 仍有既有 RobotGo CGO/native cross-build 限制；这不是上述 owner failure，
也不能用 owner cross-build表述为 Windows live。详细证据见
[P2 completion](../plans/runtime/protected-recipe/p2-online-entitlement.md) 和
[受保护包路线状态](../plans/runtime/protected-recipe/STATUS.md)。

## 内部与参考实现边界

本页冻结的是本地 CLI contract，不是 entitlement service 的公开 HTTP protocol。`pkg/entitlement`、
`pkg/entitlementservice`、`LicenseVerifier`、`ContentKeyProvider`、request/response structs、HTTP paths 和
`tests/protected-recipe/tools/entitlement-server` 都是当前 Go owner 或 reference acceptance implementation，不能
被外部客户端当成兼容承诺。reference server 是 TLS/in-memory 工具，不是持久化、多节点、billing 或 production
SaaS。

内部协议和长期边界见 [受保护包架构](../architecture/execution/protected-recipe-package.md) 与
[P2 Online Activation & Entitlement](../plans/runtime/protected-recipe/p2-online-entitlement.md)。P3 Publisher/key
registry、rotation、retirement 和 migration 尚未实现，不能从本页命令推断为可用。
