# OpenDesk Flow Marketplace：发现、网页安装、授权与更新架构

> 决策日期：2026-09-17  
> 状态：DESIGN_ACCEPTED / CLIENT_FOUNDATION_IMPLEMENTED / MACOS_DEEP_LINK_RECEIVER_IMPLEMENTED / PRODUCTION_BACKEND_PENDING
> 设计成熟度自评：97/100。该评分表示架构方案已足够作为实现合同，不表示 Marketplace 已经实现、部署或完成安全审计。  
> 基础合同：[Flow 分发、安装、信任、授权与运行模型](flow-distribution-installation.md)

## 1. 核心决策

OpenDesk Flow Marketplace 采用：

**Web Marketplace + OpenDesk In-App Marketplace + `.odflow` Side-load，多入口统一到同一个 Flow 安装内核。**

Marketplace 不重新发明包格式、安装器或 Runtime。

最终产品结构：

```text
Web Marketplace
+
OpenDesk In-App Marketplace
+
.odflow 双击 / 拖入 / 本地选择
        ↓
Flow Install Coordinator
        ↓
现有 .odflow Verify / Trust / Entitlement / Transaction Install
        ↓
Local Flow Catalog
        ↓
Flow Runner
        ↓
用户明确点击「运行」
```

必须保持：

```text
Purchase ≠ Install ≠ Run
```

购买、安装、运行是三个独立动作。

安装成功不能自动执行业务代码。

---

## 2. 为什么支持网页安装，但网页不能直接安装或执行

Marketplace 应支持网页上的主操作：

```text
[ 安装到 OpenDesk ]
```

但网页本身只负责：

- Flow 发现；
- 搜索与分享；
- Flow 详情页；
- 购买 / 订阅入口；
- 创建受控 Install Intent；
- 唤起 OpenDesk。

真实安装必须由 OpenDesk Desktop 完成。

推荐链路：

```text
Marketplace Flow Page
→ 创建 / 确认 Install Intent
→ opendesk://install/flow/<flowId>?release=<releaseId>&intent=<installIntentId>
→ OS 唤起 OpenDesk
→ OpenDesk 显示目标 Flow 安装确认
→ OpenDesk 向 Marketplace API 解析 canonical Release
→ 下载真实 .odflow
→ 校验 Marketplace Release Metadata
→ 校验 artifact digest
→ 使用既有 .odflow verifier 校验 Publisher Signature / Manifest / Inventory
→ 处理 Publisher Trust
→ 处理 Entitlement / License
→ 事务安装
→ 注册 Local Flow Catalog
→ Flow Runner 出现 Flow
→ 用户明确点击运行
```

网页 Deep Link 不是信任根，也不是下载源授权。

---

## 3. Deep Link 安全合同

Deep Link 只允许携带受控标识，例如：

```text
flowId
releaseId
installIntentId
```

不得允许网页直接通过 `opendesk://` 传入或控制：

```text
任意 artifact URL
任意本地文件路径
JavaScript
Shell Command
Content Key
License Key
Publisher Private Key
长期登录 Token
任意 Runtime 参数
```

恶意网站即使调用 OpenDesk Deep Link，最多只能：

```text
打开 OpenDesk
→ 进入一个受控的 Flow 安装确认界面
```

不能：

```text
静默安装
静默信任 Publisher
静默购买
静默授权
自动执行 Flow
```

OpenDesk 必须根据 `flowId / releaseId / installIntentId` 向受信 Marketplace API 获取 canonical Release Metadata，而不是信任网页传来的下载 URL 或 Manifest。

---

## 4. Marketplace 与 `.odflow` 的职责关系

`.odflow` 继续是正式可分发 Flow 的核心 artifact。

| 层 | 主要职责 |
| --- | --- |
| `.odflow` | Flow 内容、Manifest、Inventory、Publisher Signature、资源与受保护入口 |
| Flow Install Coordinator | 统一安装状态机、校验、信任、授权、事务安装和恢复 |
| Local Flow Catalog | 本机已安装 Flow、安装来源、版本、状态与更新来源 |
| Marketplace | 发现、发布、Release Metadata、购买、Entitlement 关联和更新发现 |
| Flow Runner | 展示已安装 Flow，并由用户明确运行 |

Marketplace 不复制：

```text
verify
trust
license resolution
transaction install
catalog registration
runtime execution
```

这些继续由现有 OpenDesk 安装与运行体系承担。

---

## 5. 三类安装入口

正式长期支持三个入口。

### 5.1 `.odflow` Side-load

适用于：

- 开发者直接交付；
- 企业内部发布；
- 离线安装；
- 测试；
- 无 Marketplace 的第三方分发。

入口包括：

```text
双击 .odflow
拖入 OpenDesk
本地文件选择
```

### 5.2 Web Marketplace

适用于：

- 搜索；
- SEO；
- 分享链接；
- 开发者主页；
- 购买 / 订阅；
- 推广；
- 从浏览器发起安装。

### 5.3 OpenDesk In-App Marketplace

适用于最低摩擦的：

```text
浏览
→ 安装
→ 更新
→ 管理
```

三种入口最终必须进入相同 `Flow Install Coordinator`。

---

## 6. Marketplace Domain Model

V1 最小领域模型：

```text
Publisher
    ↓
Flow
    ↓
Release
    ↓
Artifact (.odflow)
```

### Publisher

代表发布主体，不等同于字符串名称。

至少包含稳定身份、当前获准签名身份、状态和 Marketplace 验证状态。

### Flow

代表逻辑产品 / 自动化。

稳定身份不能依赖显示名称。

### Release

代表某个不可歧义的发布版本。

一个已发布 Release 应绑定一个不可替换的 artifact digest。

### Artifact

正式 Flow artifact 为 `.odflow`。

Marketplace 不创建第二种专属包格式。

---

## 7. Marketplace Release Metadata

V1 至少应能表达：

```text
flowId
releaseId
version
publisherId
publisherSigningKeyFingerprint
artifactSha256
artifactSize
minimumOpenDeskVersion
publishedAt
releaseStatus
entitlementPolicy
```

可扩展字段：

```text
supportedPlatforms
permissionsSummary
changelog
updateChannel
pricingMetadata
trialPolicy
```

安全相关字段必须由 Marketplace canonical API 返回，并具有完整性 / 来源保证。

下载后的 artifact 必须重新计算 digest，不能只相信服务器声明。

---

## 8. Publisher Signature 与 Marketplace Attestation

Marketplace 不替代 Publisher 对 `.odflow` 的签名。

采用双层证明：

```text
Publisher Signature
    =
这个 .odflow 确实由获准 Publisher Key 签名

Marketplace Release Attestation
    =
这个 artifact 确实对应 Marketplace 正式发布的这个 Release
```

这样 Marketplace 可以证明“发布记录”，Publisher 可以证明“artifact 作者身份”。

Marketplace 不应把所有第三方 `.odflow` 重新签成一个 OpenDesk 官方包，否则会破坏真实发布者身份和未来第三方市场兼容性。

---

## 9. Verified Publisher 与 Local Trust 必须分离

Marketplace 可以显示：

```text
Verified Publisher
```

但其含义只能是：

> Marketplace 已按自己的规则验证该发布主体。

不能自动表示：

> 当前用户已经允许这个 Publisher 在本机安装 / 运行所有 Flow。

因此：

```text
Marketplace Verified
≠
Local Publisher Trust
```

首次未知发布者仍然可以采用：

```text
Install This Flow
```

只批准当前 Flow。

以及单独的：

```text
Trust Publisher & Install
```

建立更广的本地 Publisher Trust。

Marketplace 安装不得静默扩大本地 Trust Scope。

---

## 10. 商业 Flow / Subscription / Entitlement

商业 Flow 自然接入现有 Entitlement 模型：

```text
用户购买 / 订阅
→ Marketplace Account Entitlement
→ OpenDesk 登录相同账户
→ Entitlement Resolver
→ 获得安装 / 运行所需授权
→ 安装或运行
```

不得把长期 secret 放进：

```text
网页 URL
Deep Link
.odflow 明文 Metadata
日志
本地临时下载参数
```

尤其不得通过 Deep Link 传递：

```text
License Key
Content Key
长期 Account Token
```

购买成功不自动安装，安装成功不自动运行。

---

## 11. Update Model

Marketplace 安装完成后，Local Flow Catalog 应记录来源信息，例如：

```text
source = marketplace
marketplaceId
flowId
releaseId
version
publisherFingerprint
updateChannel = stable
```

未来更新链路：

```text
Marketplace 发布新 Release
→ OpenDesk 检查更新
→ 获取 canonical Release Metadata
→ 下载新 .odflow
→ 校验 digest
→ 校验 Publisher Signature
→ 比较 Flow identity / Publisher / permission changes
→ 事务升级
```

可为未来自动更新建立条件：

```text
同 Flow identity
+
同获准 Publisher
+
权限未扩大
+
Release 未被撤销
```

如果发生：

```text
Publisher Key 非法变化
权限扩大
新增敏感 capability
身份不匹配
```

必须重新确认或拒绝更新。

---

## 12. Release Yank / Revoke / Key Rotation 的预留

V1 数据模型必须至少能够表达 Release 状态，而不能假定 Release 永久有效。

例如：

```text
draft
published
yanked
revoked
```

后续可支持：

- Release 下架；
- 高风险版本撤回；
- Publisher Key Rotation；
- Marketplace Publisher 状态变化；
- 安全通告；
- 强制阻止新安装。

离线客户端无法即时获知最新撤销状态，因此最大离线窗口和缓存规则必须单独定义，不能宣称离线环境具备实时撤销能力。

---

## 13. Marketplace V1 范围

第一阶段优先完成：

```text
Publish
→ Discover
→ Install
→ Verify
→ Entitle
→ Update foundation
```

暂不把以下功能作为 Marketplace V1 的核心阻塞项：

```text
评论社区
点赞
复杂推荐算法
排行榜
广告竞价
复杂社交系统
完整开发者结算平台
```

这些属于 Marketplace 成熟后的产品层能力，不应阻塞安全安装主链路。

---

## 14. 建议实施阶段

### M0：Marketplace Foundation / Vertical Slice

完成：

- Marketplace domain / release contract；
- Deep Link contract；
- `Flow Install Coordinator` 统一入口设计与必要重构；
- Web install intent → OpenDesk 安装确认的最小闭环；
- Marketplace metadata / artifact digest / `.odflow` verifier 的完整校验链；
- 自动测试。

M0 目标不是做完整商店 UI，而是证明 Web → Desktop → `.odflow` 安装闭环成立。

### M1：Marketplace Backend + Web Catalog

完成：

- Publisher / Flow / Release API；
- Artifact storage；
- Release publish；
- Flow detail page；
- Install Intent；
- Web `安装到 OpenDesk`；
- Account / Entitlement 对接。

### M2：OpenDesk In-App Marketplace

完成：

- 搜索 / 浏览；
- Flow detail；
- 安装状态；
- 已安装状态；
- 更新入口；
- Account / purchase 状态。

### M3：Publisher Console / Update / Operations

完成：

- Publisher 管理；
- Release 管理；
- Rollout / Yank / Revoke；
- Key Rotation；
- 更新策略；
- 运营能力。

---

## 15. 完整验收合同

最终 Marketplace 链路成立时必须能够证明：

```text
开发者发布合法 .odflow
→ Marketplace 建立不可歧义 Release
→ 用户通过网页或 App 内市场发现 Flow
→ 点击安装
→ OpenDesk 获取 canonical Release
→ 下载正确 artifact
→ digest 验证成功
→ .odflow Publisher Signature / Manifest / Inventory 验证成功
→ Publisher Trust 正确处理
→ Entitlement 正确处理
→ 事务安装
→ Local Flow Catalog 注册
→ Flow Runner 正确显示
→ 安装完成后不会自动运行业务
```

失败场景必须证明：

- 非法 Marketplace Metadata 不安装；
- artifact digest 不一致不安装；
- `.odflow` 签名失败不安装；
- Manifest / Inventory 不一致不安装；
- 未授权商业 Flow 不执行；
- Marketplace Verified 不会自动升级成 Local Trusted Publisher；
- Deep Link 不能执行任意 URL / Path / Command；
- 安装失败不会留下半安装状态；
- Purchase / Install / Run 状态严格分离。

---

## 16. 最终决策

OpenDesk Marketplace 的正确定位不是新的执行系统，而是现有 Flow 分发体系上方的：

```text
Discovery
+
Publishing
+
Release Registry
+
Commerce / Entitlement Entry
+
Update Discovery
```

所有实际安装安全继续收敛到：

```text
.odflow
+
Flow Install Coordinator
+
Trust Store
+
Entitlement Resolver
+
Transactional Installer
+
Local Flow Catalog
+
Existing Runtime
```

因此长期架构保持：

```text
多个发现 / 分发入口
+
一个 artifact 格式
+
一个安装安全内核
+
一个本地 Catalog
+
一个既有 Runtime
```

这是后续实现、测试和 Marketplace 服务端设计的正式基线。
