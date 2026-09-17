# OpenDesk：建立 Flow Marketplace，并打通 Web → OpenDesk → `.odflow` 安装闭环

## 目标需求

在当前已经基本完成的 `.odflow` 分发、拖入安装、签名、信任和授权体系之上，建立正式可长期发展的 **OpenDesk Flow Marketplace**。

最终必须形成统一产品链路：

```text
开发者完成 Flow
→ 打包并签名 .odflow
→ 发布到 Flow Marketplace
→ 用户通过网页或 OpenDesk 内部市场发现 Flow
→ 点击「安装到 OpenDesk」
→ OpenDesk 接收安装意图
→ 获取对应 Marketplace Release
→ 下载真实 .odflow
→ 使用现有 .odflow 安装安全链重新校验
→ 处理 Publisher Trust / Permission / Entitlement
→ 事务安装
→ 注册到本地 Flow Catalog
→ Flow Runner 显示该 Flow
→ 用户明确点击「运行」
```

同时必须继续支持：

```text
双击 .odflow
拖入 .odflow
本地选择 .odflow
```

这些入口与 Marketplace 安装不得形成两套实现。

最终架构必须是：

```text
Web Marketplace
+
OpenDesk In-App Marketplace
+
.odflow Side-load
        ↓
统一 Flow Install Coordinator
        ↓
现有 .odflow Verify / Trust / License / Transaction Install
```

### Web 安装的产品定义

支持网页上的：

```text
[ 安装到 OpenDesk ]
```

但网页本身不得直接执行或静默安装自动化。

推荐链路：

```text
Marketplace Flow Page
→ Install Intent
→ opendesk:// 安装 Deep Link
→ OpenDesk
→ 本地安装确认
→ Marketplace API 解析 Release
→ 下载 .odflow
→ 本地重新完整验证
→ 安装
```

Deep Link 只能表达受控标识，例如：

```text
flowId
releaseId
installIntentId
```

不得允许网页通过 Deep Link 直接传入：

```text
任意 artifact URL
本地文件路径
JavaScript
Shell Command
Content Key
License Key
长期登录凭证
```

打开 Deep Link 不得直接执行业务代码。

必须保持：

```text
Purchase
≠
Install
≠
Run
```

三种行为完全分离。

## 当前状态

OpenDesk 当前已经围绕 `.odflow` 建立或正在收口：

```text
.odflow package
Manifest / file inventory
Publisher signature
普通 main.js / protected main.odpkg
Package verify
Publisher Trust
Entitlement / License
事务安装
Local Catalog
Flow Runner
```

本轮不是重新设计 `.odflow`。

不要增加第二种 Marketplace 专属包格式，也不要增加第二套 Runtime。

首先基于当前 `master` 的真实实现确认哪些能力已经存在，然后在其上建立 Marketplace。

架构基线：

```text
docs/architecture/execution/flow-distribution-installation.md
docs/architecture/execution/flow-marketplace.md
```

特别区分：

```text
Local Flow Catalog
```

与：

```text
Remote Marketplace Catalog
```

二者职责不得混淆。

## 本轮执行

先检查当前 `.odflow` 分发、安装、Trust、Entitlement、Catalog 和 Flow Runner 的真实代码及架构文档。

在已有能力基础上完成 Marketplace 的正式架构落地，并推进第一条可真实运行的 Web → OpenDesk → `.odflow` 安装 Vertical Slice。

### Marketplace Domain

至少建立清晰关系：

```text
Publisher
→ Flow
→ Release
→ Artifact (.odflow)
```

明确稳定 ID、版本、Publisher 身份、签名 Key Fingerprint、Artifact Digest、发布状态和最低 OpenDesk 版本。

### Marketplace Artifact Trust

不得由 Marketplace 替代 Publisher 对 `.odflow` 的签名。

应形成：

```text
Publisher Signature
+
Marketplace Release Attestation
```

Publisher Signature 证明包的发布者。

Marketplace Attestation 证明该 artifact 对应 Marketplace 中正式发布的某个 Flow Release。

Marketplace 的 `Verified Publisher` 状态不得自动等同于用户电脑上的 `Trusted Publisher`。

### Web → Desktop Install Protocol

设计并实现正式 OpenDesk Deep Link / Protocol Contract 的第一条可运行链路。

目标体验：

```text
网页点击安装
→ OpenDesk 打开
→ 显示目标 Flow
→ 用户确认
→ 客户端从可信 Marketplace API 获取 Release
→ 下载并验证
→ 安装
```

恶意网站调用 Deep Link 最多只能打开受控安装界面，不能导致任意文件下载、命令执行或 Flow 自动运行。

### Unified Install Coordinator

确认并实现统一安装入口：

```text
file double-click
drag/drop
file picker
web marketplace
in-app marketplace
```

全部进入同一安装状态机和事务安装服务。

不要让 Marketplace 自己复制：

```text
verify
trust
license
install
catalog registration
```

逻辑。

### Marketplace API / Release Contract

确定最小 V1 API 和 Release Metadata。

至少能够表达：

```text
flowId
releaseId
version
publisherId
publisherSigningKeyFingerprint
artifactDigest
artifactSize
minimumOpenDeskVersion
publishedAt
releaseStatus
entitlementPolicy
```

Artifact 下载地址不应成为 Deep Link 的信任来源。

OpenDesk 必须通过 Marketplace API 获得 canonical release 信息，并在下载后重新验证 package digest 和 `.odflow` 自身签名。

如果当前仓库不存在真正的远程 Marketplace Backend，不要伪造一个产品级后端。

可以为 Vertical Slice 提供：

- 明确的 API interface / client contract；
- 可测试的本地 fixture / fake server；
- 真实 Deep Link → Marketplace client → download → verify → install 调用链；

但必须明确 fixture / fake server 只是测试设施，不是 Marketplace Production Backend。

### Paid Flow / Entitlement

让现有 Subscription / Entitlement 模型自然接入 Marketplace。

典型链路：

```text
购买 / 订阅
→ Account Entitlement
→ OpenDesk 登录同一账户
→ Resolve Entitlement
→ 安装或运行授权
```

不要通过网页 URL、Deep Link 或普通文件保存长期 License Secret / Content Key。

### Update Model

Marketplace 安装的 Flow 应记录安装来源及 release identity，为以后：

```text
检查更新
自动更新
手动更新
Release Yank
Publisher Key Rotation
Permission Expansion
```

建立稳定基础。

同 Publisher、同 Flow、权限未扩大时可以为未来自动更新提供条件。

Publisher Key 改变、权限扩大或新增敏感能力时必须重新确认。

### Marketplace V1 范围

第一版优先完成：

```text
Publish contract
Discover contract
Install vertical slice
Verify
Entitle integration boundary
Update foundation
```

不要因为叫做 Marketplace 就立即扩张到：

```text
复杂推荐算法
评论社区
排行榜
广告竞价
完整结算平台
复杂社交系统
```

## 完成标准

本轮至少必须能够真实证明第一条 Marketplace 安装 Vertical Slice：

```text
一个合法 Marketplace Release fixture / test endpoint
→ 生成受控 Install Intent / Deep Link
→ OpenDesk 接收
→ 解析正确 flowId / releaseId
→ 通过 Marketplace client 获取 canonical Release Metadata
→ 下载对应 .odflow
→ 验证 artifact digest
→ 进入现有 .odflow verify / trust / entitlement / transaction install 链
→ Local Flow Catalog 注册
→ Flow Runner 能发现安装后的 Flow
→ 安装后没有自动执行业务
```

同时：

- 拖入 `.odflow` 仍然正常。
- 双击 `.odflow` 仍然正常。
- Web / In-App / Side-load 不复制安装安全逻辑。
- 恶意 Deep Link 不能触发任意 URL、本地文件或代码执行。
- 非法 Marketplace metadata 不安装。
- Artifact Digest 不一致不安装。
- `.odflow` Publisher Signature 不合法不安装。
- 未授权的付费 Flow 不执行业务代码。
- Marketplace Verified Publisher 不会被偷偷升级为 Local Trusted Publisher。
- 安装失败不会留下半安装状态。
- Flow 安装与 Flow 运行严格分离。
- 对新增协议、公开行为和测试合同补充对应文档。
- 新增自动测试覆盖 happy path 与主要安全失败路径。

如果本轮发现完成真正 Web 页面或远程 Marketplace Backend 需要独立服务端工程，则不要把“设计合同”写成“已经实现”。

本轮结束时明确输出：

```text
当前已具备能力
新增代码 / 协议 / 文档
Vertical Slice 实际测试结果
仍属于 Production Marketplace Backend 的部分
下一阶段最小开发任务
```

只有真实通过的能力才能标记为完成。

## 必要边界

- 不重新发明 `.odflow`。
- 不创建 Marketplace 专属 Runtime。
- 不让 Web 页面直接执行 Flow。
- 不让 Deep Link 成为任意 URL / Path / Command 执行入口。
- Marketplace 不能替代 Publisher Signature。
- Marketplace Verified 与 Local Publisher Trust 必须分离。
- Purchase、Install、Run 必须是三个独立状态。
- 所有安装入口最终复用同一个安全安装内核。
- 不通过降低测试断言、跳过验签或假 Backend 来制造“已完成”。
