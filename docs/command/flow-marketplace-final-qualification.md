# OpenDesk Marketplace：最终产品接线、测试、修复与资格验收

## 目标需求

把 OpenDesk 当前已经存在的 Marketplace v1.1 页面、Marketplace Client Foundation 和 `.odflow` 安装体系真正收口成一套可验证的 Marketplace 产品链路。

本轮不是重新设计 Marketplace，也不是重新制作 HTML 原型。

最终用户链路必须成立：

```text
Web Marketplace
→ 用户查看 Flow
→ 点击「安装到 OpenDesk」
→ OS 将受控 opendesk:// Install Intent 交给 OpenDesk
→ 已运行 OpenDesk 时进入同一个实例
→ OpenDesk 显示正式安装确认
→ 获取 canonical Install Intent / Release
→ 下载真实 .odflow
→ 验证 Marketplace Release Attestation / digest
→ 验证 .odflow Publisher Signature / Manifest / Inventory
→ 处理本地 Publisher Trust
→ 处理 Permission / Entitlement
→ Transaction Install
→ Local Flow Catalog 注册
→ Flow Runner 显示 Flow
→ 安装结束，业务 JavaScript 执行次数仍为 0
→ 用户之后明确点击 Run
→ 才执行 Flow
```

OpenDesk 内部 Marketplace 也必须复用完全相同的安装链：

```text
In-App Marketplace
→ Marketplace Installer
→ canonical Flow install owner
→ Flow Catalog
→ Flow Runner
```

同时不能破坏已经存在的：

```text
.odflow File Picker
.odflow Drag & Drop
.odflow Double-click cold start
.odflow Double-click hot / single instance
CLI / qualification
```

最终必须始终成立：

```text
Discover / Purchase ≠ Install ≠ Run

Marketplace Verified ≠ Local Publisher Trust

Marketplace Attestation ≠ Publisher Signature

Remote Marketplace Catalog ≠ Local Flow Catalog
```

所有安装入口最终只能有一个安全安装 owner。

安装本身绝不能执行业务 Flow。

---

## 当前状态

Marketplace 总体架构和协议合同已经存在：

- `docs/architecture/execution/flow-marketplace.md`
- `docs/architecture/execution/flow-marketplace-protocol-v1.md`

此前实施合同：

- `docs/command/flow-marketplace-implementation.md`

当前资格状态：

- `docs/quality/flow-install-channel-qualification.md`

Marketplace HTML 原型已经达到 v1.1：

- `apps/opendesk/prototypes/marketplace/index.html`
- `apps/opendesk/prototypes/marketplace/README.md`
- `apps/opendesk/prototypes/marketplace/ORACLE.md`

该原型已经覆盖：

```text
市场浏览
搜索 / 分类 / 平台 / 价格筛选
Flow Detail
安装说明
Web → Desktop handoff 演示
Permission / Entitlement 演示
Flow-scoped / Publisher-scoped Trust
安装完成但未运行
Flow Runner 独立运行
更新
失败 / Cancel / Rollback
响应式布局
```

Marketplace Client Foundation 已经存在：

```text
flowmarketplace.Installer
→ canonical Install Intent
→ canonical Release
→ Marketplace attestation
→ artifact download / digest
→ identity validation
→ flowinstall.Service
```

正式 `.odflow` 安装安全内核已经存在：

```text
flowinstall.Service
→ package verify
→ Publisher Trust
→ Permission / Entitlement
→ transaction install
→ Local Flow Catalog
```

不要重新实现这些 owner。

2026-09-20 的本地静态 Marketplace 主链已完成真实 macOS 收口：同站点 Chrome 页面通过短 Deep Link 进入 OpenDesk，用户完成原生确认后由既有 `flowmarketplace.Installer → flowinstall.Service` 安装到隔离 Catalog；业务 `.js` 仍仅在用户于 Flow Runner 显式 Run 后交给 OpenDesk Runtime。真实证据位于 `.runtime/tests/marketplace/manual-20260920T140955904Z/`，并在整体架构文档的“2026-09-20 本地 macOS 真实验收”矩阵中逐项索引。

当前未纳入这个本地静态 run 的产品范围包括：

```text
In-App Marketplace → Installer
Production Marketplace Backend / HTTPS release root
跨平台原生实机资格
```

它们必须保持独立状态：当前 product config 故意未配置 Production Marketplace client，官方 App 的 Marketplace UI 也保持隐藏；不得把本地 loopback development session 冒充 Production 或 In-App PASS。现有 Side-load 资格不因本轮静态 Web 验收而重新断言。

---

## 本轮执行

基于当前已有实现直接测试、接线、修复和验收。

不要重新开始 Marketplace 架构设计。

发现失败：

```text
沿真实失败链定位
→ 最小必要修复
→ 重跑对应测试
→ 继续真实资格验收
```

不能删除断言、降低安全要求或通过跳过测试制造 PASS。

### 1. 重新验证现有能力

实际运行当前已有：

```text
Marketplace prototype model tests
Marketplace Chromium smoke
flowmarketplace tests
flowinstall tests
Flow distribution / Runtime qualification
相关正式 build / test gates
```

Prototype、Mock、fixture、历史 CI 和源码存在只证明各自边界，不能替代当前 Native/Product 验收。

### 2. 收口 Web Marketplace → OpenDesk

检查正式 App 是否已经具备：

```text
opendesk://install/flow/<flowId>?release=<releaseId>&intent=<installIntentId>
```

所需的 OS protocol registration、事件交付和 single-instance forwarding。

Deep Link 只能包含：

```text
flowId
releaseId
installIntentId
```

必须拒绝任何：

```text
任意 URL
本地路径
artifact URL
JavaScript
Shell Command
Token
Content Key
License Key
长期凭证
```

分别验证：

```text
OpenDesk 未运行
→ Deep Link
→ 启动 OpenDesk
→ 进入安装确认

OpenDesk 已运行
→ Deep Link
→ 转发到现有实例
→ 不启动第二 Runtime / 第二业务实例
→ 进入安装确认
```

接收 Deep Link 本身不得：

```text
自动下载
自动信任 Publisher
自动安装
自动执行 Flow
```

### 3. 正式安装确认

如果当前仍只有 HTML 中的“桌面安装预览”，将正式产品入口接到已有 Marketplace Installer。

确认界面至少应让用户看到：

```text
Flow
Publisher
Version
Permission
Release / source
Entitlement 状态
Trust scope
```

默认 Trust 不能扩大为 Publisher-wide。

如果用户选择 Publisher-wide Trust，必须额外明确确认。

Cancel 必须保证：

```text
Catalog 无新增
Trust 无新增
业务代码零执行
临时安装状态清理
迟到异步回调不能继续安装
```

### 4. In-App Marketplace 接线

不要建立第二套 Marketplace installer。

现有 Marketplace 页面 / 产品入口发起安装时，应进入：

```text
flowmarketplace.Installer
→ flowinstall.Service
```

In-App Marketplace 的浏览 UI 与 Remote Catalog 可以独立，但安装安全 owner 不允许独立。

### 5. 验证 Side-load 没有回归

使用当前正式构建和真实测试 `.odflow` 分别验证：

```text
File Picker
Drag & Drop
Double-click cold start
Double-click hot / existing instance
```

所有入口最终得到相同 Flow identity / Catalog identity。

安装后必须验证业务 marker / result / run 数据仍不存在。

### 6. Flow Runner 最终闭环

安装成功以后验证：

```text
Flow Runner 能发现 Flow
名称正确
Version 正确
Publisher 正确
安装来源 / provenance 正确
```

重新启动 OpenDesk 后仍应存在。

此时业务执行次数仍必须为 0。

随后用户明确 Run：

```text
Flow Runner
→ Run
→ Existing Runtime
→ 业务 marker / result 出现
```

这是唯一允许业务执行发生的阶段。

### 7. Marketplace 安全失败矩阵

至少重新验证：

```text
非法 Deep Link
identity mismatch
Release revoked
Marketplace attestation failure
artifact digest mismatch
Publisher signature invalid
Manifest / inventory invalid
未知 Publisher 用户取消
权限未确认
Entitlement denied
Publisher-wide Trust 未额外确认
transaction write failure
installation cancel
重复异步 callback
同版本不同 artifact
platform / runtime incompatible
```

都必须证明：

```text
不产生 ready Catalog 半安装
不执行 Flow
不扩大 Trust
不留下不一致状态
```

### 8. 更新链路

Marketplace 安装后的 Catalog provenance 要足以支持后续 Release Update。

验证已有更新基础没有破坏：

```text
同 Flow
同 Publisher
正常 Release
权限未扩大
→ 可进入更新流程

权限扩大
Publisher / signing identity 异常
Release revoked
→ 必须重新确认或拒绝
```

更新完成也不得自动执行 Flow。

### 9. Native 真实资格

在当前可用操作系统上执行真实 Native UI 验收。

不要把：

```text
源码存在
单元测试
HTML prototype
httptest.Server
历史截图
```

当作当前 Native PASS。

需要真实验证：

```text
Picker
Drag & Drop
Double-click cold
Double-click hot
Web Deep Link cold
Web Deep Link hot
安装确认
Catalog
Runner
App restart
Explicit Run
```

并保存当前运行证据。

无法在当前机器真实执行另一操作系统时：

```text
完成对应源码
完成 cross-platform unit / integration tests
完成 build
修复可验证的跨平台 harness 问题
```

但对应 Native 项保持 NOT_RUN，不伪造 PASS。

---

## 完成标准

结束前必须重新形成一张当前版本资格矩阵，并且状态只允许：

```text
PASS
FAIL
BLOCKED
NOT_RUN
```

目标至少达到：

- Marketplace v1.1 页面模型测试：PASS
- Marketplace Chromium 交互 Smoke：PASS
- Marketplace client / protocol tests：PASS
- canonical Release / attestation / digest：PASS
- Marketplace installer 最终复用 `flowinstall.Service`：PASS
- Install ≠ Run：PASS
- Purchase ≠ Install：PASS
- Marketplace Verified ≠ Local Trust：PASS
- File Picker 安装：当前机器真实 PASS
- Drag & Drop 安装：当前机器真实 PASS
- Double-click cold：当前机器真实 PASS
- Double-click hot / single instance：当前机器真实 PASS
- 安装后业务零执行：PASS
- Catalog persistence after restart：PASS
- Flow Runner 正确显示：PASS
- Explicit Run 才执行：PASS
- Cancel / integrity / signature / entitlement / transaction failure 零副作用：PASS
- Web Deep Link product wiring：不再因为缺客户端接线 BLOCKED
- In-App Marketplace：真实复用 Marketplace Installer，不存在第二套安装内核
- 当前系统正式构建和相关测试：PASS

如果 Web / In-App 仍然因为缺本地产品代码而 BLOCKED，本轮应直接完成该客户端接线并测试，而不是只更新文档说明。

如果唯一剩余项确实依赖尚不存在的外部 Production Marketplace Backend，则明确拆分：

```text
本地 Marketplace 产品能力
```

与：

```text
云端 Production Marketplace Service
```

不得因为云端服务尚未建设，把已经可以在客户端完成的接线继续留成 BLOCKED。

最后更新 Marketplace / Flow Install 资格文档，使其中状态与本轮真实执行结果一致。

最终输出只需要给出：

```text
最终用户链路是否成立

本轮发现并修复的问题

当前资格矩阵

真实 Native 验收结果

Web Marketplace 状态

In-App Marketplace 状态

Side-load 状态

Install ≠ Run 证明

仍未完成的 Production Backend / 外部依赖

当前整体 Marketplace 完成度结论
```

---

## 必要边界

- 不重新设计 Marketplace 架构。
- 不重新制作已经完成的 v1.1 HTML 原型，除非测试发现真实缺陷。
- 不创建第二套 `.odflow` 安装器。
- 不创建 Marketplace 专属 Runtime。
- 所有 Marketplace 安装最终复用 `flowmarketplace.Installer → flowinstall.Service`。
- Deep Link 永远不能成为任意 URL / Path / Command / Script 执行入口。
- 安装阶段永远不得运行业务 JavaScript。
- 不用 fake backend、Mock、历史截图或源码存在冒充 Production / Native PASS。
- 不因为单个失败扩大成无关模块的大规模重构。
- 不通过降低测试断言、跳过验签或伪造证据制造“已完成”。
- 不覆盖其他并行工作的最新修改；修改目标文件前重新读取当前实际内容。
