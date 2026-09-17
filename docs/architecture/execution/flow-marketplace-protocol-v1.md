# OpenDesk Flow Marketplace Protocol V1

> 决策日期：2026-09-17  
> 状态：CLIENT_FOUNDATION_IMPLEMENTED / MACOS_DEEP_LINK_RECEIVER_IMPLEMENTED / PRODUCTION_BACKEND_PENDING
> 上位架构：[Flow Marketplace](flow-marketplace.md)  
> 安装安全内核：[Flow 分发、安装、信任、授权与运行模型](flow-distribution-installation.md)

## 1. 目的

本合同冻结 OpenDesk Marketplace 第一版客户端与服务端之间的最小安全协议。

它不定义新的 Flow 包格式，也不定义新的 Runtime。

所有入口最终必须复用既有 `.odflow` 安装安全内核：

```text
Web Marketplace
In-App Marketplace
.odflow double-click / drag-drop / picker
        ↓
Install Coordinator
        ↓
.odflow verify
→ Local Publisher Trust
→ Entitlement / protected-package preflight
→ transaction install
→ Local Flow Catalog
        ↓
Flow Runner
        ↓
用户明确 Run
```

必须始终成立：

```text
Purchase ≠ Install ≠ Run
Marketplace Verified ≠ Local Trusted Publisher
Marketplace Attestation ≠ Publisher Signature
Remote Marketplace Catalog ≠ Local Flow Catalog
```

## 2. Marketplace Domain

V1 的稳定关系是：

```text
Publisher
  └─ Flow
      └─ Release
          └─ Artifact (.odflow)
```

### Publisher

稳定身份：`publisherId`。

Publisher 可以拥有多把签名 Key；具体 Release 必须绑定：

- `publisherSigningKeyId`
- `publisherSigningKeyFingerprint`

Marketplace 的 Publisher 审核状态是远程发现元数据，不能写成本机 Trust 决策。

### Flow

稳定身份：`flowId`。

`flowId` 跨 Release 保持不变。

### Release

稳定身份：`releaseId`。

V1 Release 最小安全字段：

```text
schemaVersion
marketplaceId
flowId
flowName
releaseId
version
publisherId
publisherSigningKeyId
publisherSigningKeyFingerprint
artifactDigest
artifactSize
minimumOpenDeskVersion
publishedAt
releaseStatus
entitlementPolicy
updateChannel
verifiedPublisher
```

其中用于安装的 Release 必须为 `published`。

### Artifact

Artifact 始终是现有 `.odflow`。

Marketplace 不定义 `.marketflow`、`.storeflow` 或第二种包格式。

## 3. Web → OpenDesk Deep Link

V1 canonical form：

```text
opendesk://install/flow/<flowId>?release=<releaseId>&intent=<installIntentId>
```

Deep Link 是 **Install Intent locator**，不是下载地址，不是安装授权，也不是运行命令。

只允许三个业务标识：

- `flowId`
- `releaseId`
- `installIntentId`

任何额外参数都必须拒绝。

明确禁止：

```text
artifactUrl
url
path
file
command
script
shell
contentKey
licenseKey
accessToken
refreshToken
authorization
```

以及任何等价的任意 URL、本地路径、代码、命令、密钥或长期登录凭证。

Deep Link 解析器必须：

- 限制总长度；
- 精确匹配 `opendesk://install/flow/...`；
- 拒绝 userinfo、port、fragment、opaque URL；
- 拒绝路径穿越；
- 拒绝重复 `release` / `intent`；
- 拒绝未知 query 参数；
- 只接受受限 identifier 字符集。

接收 Deep Link 后不得自动下载、自动信任、自动安装或自动运行；首先进入受控安装流程。

## 4. Install Intent Resolution API

Desktop 不信任浏览器传来的 Release Metadata。

V1 Desktop 必须向预配置 Marketplace API 请求 canonical Install Intent：

```http
GET /v1/install-intents/{installIntentId}
Accept: application/json
Authorization: <desktop account session, when required>
```

响应合同：

```json
{
  "schemaVersion": 1,
  "installIntentId": "intent-...",
  "flowId": "invoice-export",
  "releaseId": "release-...",
  "release": {
    "schemaVersion": 1,
    "marketplaceId": "opendesk-main",
    "flowId": "invoice-export",
    "flowName": "Invoice Export",
    "releaseId": "release-...",
    "version": "1.2.3",
    "publisherId": "publisher-acme",
    "publisherSigningKeyId": "publisher-key-1",
    "publisherSigningKeyFingerprint": "<sha256>",
    "artifactDigest": "<sha256>",
    "artifactSize": 12345,
    "minimumOpenDeskVersion": "2.0.1",
    "publishedAt": "2026-09-17T12:00:00Z",
    "releaseStatus": "published",
    "entitlementPolicy": "free",
    "updateChannel": "stable",
    "verifiedPublisher": false
  },
  "attestation": {
    "schemaVersion": 1,
    "rootKeyId": "market-root-1",
    "usage": "flow-marketplace-release",
    "expiresAt": "2026-09-18T12:00:00Z",
    "signature": "<ed25519-hex>"
  }
}
```

客户端必须逐层验证：

```text
Deep Link flowId/releaseId/installIntentId
        =
API top-level identity
        =
Release identity
```

任何不一致立即失败。

JSON 使用严格解码：未知字段、尾随数据、超限响应均失败。

## 5. Marketplace Release Attestation

Publisher Signature 与 Marketplace Release Attestation 是两个独立证据。

### Publisher Signature

证明：

```text
这个 .odflow 的 flow.json / file inventory / publisher identity
由对应 Publisher signing key 签名。
```

验证 owner：既有 `pkg/flowpackage`。

### Marketplace Release Attestation

证明：

```text
Marketplace 正式发布记录中的这个 Release
绑定到这个 publisher identity + artifact digest + artifact size。
```

V1 使用独立 domain：

```text
OpenDeskMarketplaceReleaseAttestation/v1\0
```

Attestation 必须覆盖至少：

```text
schemaVersion
rootKeyId
usage
marketplaceId
flowId
releaseId
version
publisherId
publisherSigningKeyId
publisherSigningKeyFingerprint
artifactDigest
artifactSize
minimumOpenDeskVersion
publishedAt
releaseStatus
entitlementPolicy
updateChannel
verifiedPublisher
expiresAt
```

Desktop 只信任产品配置中固定的 Marketplace attestation public roots。

**Release Attestation 验证成功不得创建任何 Local Flow/Publisher Trust Record。**

现有 `flowinstall.AuthorityProof` 的 `market` 来源不能直接作为 Marketplace Release Attestation 使用，因为该路径的语义包含“把 authority 证明转化为本机 Flow trust”；这与本合同不兼容。

## 6. Artifact Download Contract

V1 canonical artifact endpoint：

```http
GET /v1/releases/{releaseId}/artifact
Accept: application/vnd.opendesk.flow
Authorization: <desktop account session, when required>
```

Release Metadata 和 Deep Link 均不携带 artifact URL。

Desktop 只从预配置 Marketplace API origin 派生 endpoint。

V1 Desktop 禁止跟随 artifact HTTP redirect。这样 Marketplace API 不能通过 Release 数据或 30x 把客户端变成任意 URL 下载器。

下载要求：

- 有界流式下载；
- `.odflow` 最大尺寸继续受 `flowpackage.MaxArchiveSize` 限制；
- 临时文件权限为当前用户私有；
- 实际 byte count 必须等于 `artifactSize`；
- SHA-256 必须等于 `artifactDigest`；
- digest 校验后仍必须调用现有 `.odflow` reader/verifier；
- Publisher Signature、Manifest、inventory、protected payload identity 任一失败都不能安装。

## 7. Install State Machine

V1 Marketplace 客户端状态语义：

```text
RECEIVED
→ PARSED
→ RESOLVING_INTENT
→ RELEASE_ATTESTED
→ LOCAL_CONFIRMATION
→ ENTITLEMENT
→ DOWNLOADING
→ ARTIFACT_DIGEST_VERIFIED
→ ODFLOW_VERIFIED
→ LOCAL_TRUST
→ PROTECTED_PACKAGE_PREFLIGHT
→ TRANSACTION_INSTALL
→ CATALOG_PROVENANCE
→ INSTALLED
```

没有 `RUNNING` 状态。

`Run` 属于 Flow Runner 的另一个显式用户动作。

本地文件入口从其自己的文件取得阶段进入同一个：

```text
ODFLOW_VERIFIED
→ LOCAL_TRUST
→ PROTECTED_PACKAGE_PREFLIGHT
→ TRANSACTION_INSTALL
```

Marketplace 不复制上述四段逻辑。

## 8. Local Confirmation 与 Local Publisher Trust

Marketplace 安装至少包含两类不同确认：

### 安装确认

回答：

> 用户是否要在这台设备上安装这个 Release？

这是 Marketplace 安装特有的本地 UI gate。

### Publisher Trust

回答：

> 用户是否信任这个 Publisher signing identity 来安装该 Flow / 该 Publisher 的 Flow？

这继续由现有 `flowinstall.TrustStore` 与 trust approver 负责。

`verifiedPublisher=true` 只能作为 UI 信息，不能：

- 跳过 Local Trust；
- 自动写 TrustStore；
- 自动选择 Publisher-wide trust；
- 降低签名校验。

## 9. Paid Flow / Entitlement

V1 `entitlementPolicy`：

```text
free
account
subscription
purchase
```

推荐顺序：

```text
Resolve canonical Release
→ 本地安装确认
→ 使用 Desktop account session 解析 entitlement
→ entitlement 允许
→ 下载 artifact
→ .odflow / trust / protected package 安全链
```

非免费 Release 在 entitlement 未成立时不下载 artifact。

长期凭证、License Secret、Content Key 不进入：

- Deep Link；
- Release Metadata；
- 普通 `.odflow` 外层文件；
- Local Flow Catalog provenance。

受保护 `.odpkg` 的现有授权仍由既有 package/license owner 负责；Marketplace entitlement 不取代 protected package 的运行安全边界。

## 10. Local Flow Catalog 与 Remote Marketplace Catalog

### Remote Marketplace Catalog

服务端负责：

- Publisher / Flow / Release discovery；
- publish/yank/revoke 状态；
- Marketplace Verified Publisher 元数据；
- artifact identity；
- entitlement policy；
- update availability。

### Local Flow Catalog

本机负责：

- 已安装 Flow；
- 当前 installed version；
- Publisher identity；
- archive / manifest digest；
- ready / needs-activation / blocked；
- local install origin；
- Marketplace provenance。

Marketplace 来源安装后，本地记录：

```text
origin = marketplace
marketplaceId
releaseId
updateChannel
```

这些字段只是 provenance / update foundation，不是 Trust 证据。

Side-load 的 `.odflow` 继续记录：

```text
origin = odflow
```

普通本地 `.js` 继续记录：

```text
origin = js
```

## 11. Update Foundation

未来检查更新以 Local Catalog provenance 为起点：

```text
marketplaceId + flowId + releaseId + updateChannel
→ Remote Marketplace Catalog
→ candidate Release
```

未来允许自动更新的必要条件至少包括：

- same Flow identity；
- same Publisher identity；
- signing key 未发生未经确认的变化；
- permission/capability 没有扩大；
- entitlement 仍有效；
- Release published 且未 yank/revoke；
- artifact + attestation + `.odflow` signature 全部重新验证。

Publisher key 改变、权限扩大或新增敏感能力必须重新确认。

## 12. V1 Backend Boundary

本 Desktop 仓库不伪造 Production Marketplace Backend。

真正 Marketplace Backend 仍需独立实现：

```text
Publisher onboarding / identity
Flow / Release persistence
artifact storage
publish validation
Release Attestation signing service / key management
Install Intent creation and resolution
Discover/search endpoints
account session / entitlement resolution
purchase/subscription integration
release yank/revoke/update query
```

测试使用的 `httptest` fixture 只证明 Desktop 协议与安全状态机，不是生产服务。

当前 macOS bundle build 已注册 `opendesk://`，AppKit 会把原始 URL 交给
Desktop protocol receiver；receiver 只接受 identifier-only Install Intent。没有
产品配置的 HTTPS API origin、pinned Marketplace attestation roots 和 account
adapter 时，receiver 必须 fail closed，绝不尝试用 URL、环境变量或本地文件补齐
这些信任输入。

在正式 Web → Desktop 上线之前，产品仍必须拥有：

- Production Marketplace HTTPS API base origin；
- Production Marketplace attestation public root configuration；
- 已签名 macOS release bundle 的真实 `opendesk://` launch / `openURLs` 交付验收；
- Windows protocol registration + safe argument/activation delivery；
- 单实例场景下 Deep Link 转发；
- 将已实现的 Marketplace 安装确认 UI 接到上述已配置 client 的真实 release；
- Desktop account session / entitlement adapter。

这些缺一项都不能把测试 Vertical Slice 宣称为“生产 Web 安装已经上线”。

## 13. 当前 Desktop 实现映射

```text
pkg/flowmarketplace/protocol.go
  Deep Link parse/build contract

pkg/flowmarketplace/release.go
  Release metadata + Release Attestation verifier

pkg/flowmarketplace/client.go
  canonical Install Intent API + bounded artifact download

pkg/flowmarketplace/installer.go
  DeepLinkHandler（先严格 parse，再委托）
  Marketplace orchestration → existing FlowInstallService

pkg/appshell/open_url.go
pkg/appshell/native_darwin.go
pkg/appshell/native_darwin.m
  macOS AppKit openURLs 原样转交给产品 protocol receiver；
  已 attested Release 的本地安装确认 UI 与 Publisher Trust UI 分离

scripts/build_macos_app.sh
  OpenDesk.app 注册 opendesk URL scheme

pkg/flowinstall/installer.go
  canonical .odflow trust/license/transaction install kernel

pkg/flowinstall/marketplace.go
  Marketplace provenance recording

pkg/flowinstall/catalog.go
  Local Flow Catalog provenance fields

pkg/flowmarketplace/marketplace_test.go
  real signed .odflow vertical-slice and negative security tests

pkg/appshell/marketplace_protocol_contract_test.go
  macOS URL registration / raw delivery / confirmation-boundary source contract
```

Marketplace package中不存在 Runtime execute 调用。

## 14. 第一阶段测试合同

至少持续证明：

- valid ID-only Deep Link round-trip；
- unknown Deep Link parameter rejected；
- arbitrary artifact URL/path/command/key rejected；
- canonical Release identity must match Deep Link；
- Marketplace attestation invalid/expired → no download/install；
- entitlement denied → artifact endpoint not called；
- artifact digest mismatch → no install；
- invalid `.odflow` Publisher Signature → no install；
- Marketplace Verified Publisher cannot bypass Local Trust；
- successful Marketplace install writes local user trust only after explicit approver；
- successful install records release provenance；
- installed JavaScript is never executed by install path；
- Desktop protocol handler rejects a malicious URL before it can reach an installer；
- malformed metadata、unknown release、intent identity mismatch、release/package publisher mismatch fail without catalog or trust mutation；
- existing double-click / drag-drop / picker side-load regression remains green。

## 15. 安全不变量

```text
Browser controls identifiers, never execution material.
Marketplace controls Release identity, never Local Trust.
Publisher controls package signature, never Local user consent.
Entitlement controls purchase/use eligibility, never Publisher identity.
Installer installs, never runs.
Runner runs only after a separate explicit user action.
```
