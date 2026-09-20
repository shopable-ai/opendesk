# OpenDesk Marketplace 原型与本地静态安装

状态：**同站点静态 Notify Demo 核心实现已写入；自动化结果以当前 CI 为准；真实 macOS 桌面链路尚未在本环境执行。**

主原型：`index.html`  
交互/安全 Oracle：`ORACLE.md`  
整体方案：`docs/architecture/execution/flow-marketplace.md`

## 当前框架

本轮没有新建第二套 Marketplace。开发助手从现有主原型和 canonical Notify Demo 自动准备一次隔离静态站点：

```text
当前 index.html + examples/flow-distribution/notify-demo/notify-demo.odflow
→ .runtime/tests/marketplace/manual-*/site/
   ├── index.html
   ├── local-deep-link-smoke.html
   └── flows/com.example.opendesk.notify-demo/local-notify-demo-1/
       ├── release.json
       └── notify-demo.odflow
```

`release.json` 与 `.odflow` 位于同一个版本目录。站点不提供 `/v1/install-intents/*`、动态 artifact handler 或 `/local-smoke/status`；普通文件服务器即可提供全部安装资源。

## 一条命令启动

```bash
node tests/prototypes/tools/marketplace-local-manual.mjs
```

助手会核对当前源码对应的 `dist/OpenDesk.app`；可证明构建兼容时复用，否则调用现有 `scripts/build_macos_app.sh` 刷新。之后验证 App 签名、核对 canonical Notify Demo 的包摘要和 `flow.json` 声明的全部源文件、生成本次临时 Release root 与签名 Release v2、准备只公开 `site/` 的 loopback 静态站点、启动匹配 OpenDesk，并用 Chrome 打开生成后的主 `index.html`。

终端会打印 Main page、Release、Package、Prepared site、Install data、Run directory、OpenDesk log 和 Cleanup。

当前没有文件监听。修改原型或 Notify Demo 源后，需要结束本次开发会话并重新运行命令；浏览器刷新只刷新本次已经准备好的 `site/`。

## 页面真假边界

生成页面只有 **Notify Demo** 使用真实 `opendesk://` 安装请求。它的 Flow ID、版本、发布者、平台、包大小、Release ID、`release.json`、`.odflow` 和协议目标来自同一个实际示例及本次签名发布信息。

其他商品继续是原型模拟，不能触发 Notify Demo 的真实安装。网页点击真实安装后只显示“已请求打开 OpenDesk，请在应用中完成安装”；不轮询 Catalog，也不通过点击、失焦或超时推断成功或失败。

## 安装与运行

```text
主原型真实 Notify Demo
→ ID-only opendesk://
→ static resolver 读取同站点 release.json
→ 验证 Release v2
→ HTTP 下载真实 .odflow
→ 验证 digest、包签名、manifest、Inventory 与 Release/Package 身份
→ 一次原生安装/信任确认
→ 现有 flowinstall.Service 事务安装
→ Catalog / Flow Runner
→ 用户另外点击运行
```

**Install ≠ Run。** 安装代码不调用 Runtime。只有用户在真实 Flow Runner 另行点击运行后，Notify Demo 才允许显示 Toast 并写入固定 console 日志。

## 配置与 Release 合同

生产配置所有权仍是 `configs/product.json → product.odcfg → internal/officialassets → native Marketplace client`。正式 schema 已支持可选 `flowDistribution`：`resolver`、`metadataBaseUrl`、`artifactBaseUrl`、`releaseRoots`。

当前仓库没有真实 production HTTPS 发布前缀和可信 Release root，因此正式 `configs/product.json` 不配置该字段；生产客户端保持 fail closed。临时 loopback 地址、端口和临时 root 只存在本次 `.runtime/` 开发配置中。

静态 resolver 只接受签名 Release v2。v2 明确保护 `flowName`、`metadataRevision`、`artifactLocation`，并继续保护 Flow/Release/Publisher 身份、版本、包摘要/大小、状态、有效期等字段。同一 Marketplace + Release 的最高已接受 metadata revision 存入现有 Catalog provenance；更低 revision 会在下载和原生确认之前拒绝，事务层再检查一次防止竞态。

Release v1 保留给已有 dynamic resolver。static resolver 不会在失败后退回旧动态接口。

## 可选 download 协议参数

**未实施。** 默认页面继续使用 `opendesk://install/flow/<flowId>?release=<releaseId>&intent=<intentId>`。不传 `download` 也能安装，不代表该扩展已经完成。

## 证据边界

自动化负责证明协议严格性、v1/v2 验签、Go/Node 签名字节合同、字段篡改/过期/错误摘要、路径与重定向拒绝、revision 回退、取消/超时/中断清理、普通静态服务器替换、统一 Installer 接入以及安装不执行。

真实 macOS Chrome → OS protocol → OpenDesk → 原生确认 → Catalog/Flow Runner → explicit Run 必须另外取得桌面证据。在完成之前，不把自动化测试写成“桌面验收通过”。
