# OpenDesk Marketplace 原型与本地静态安装

状态：**同站点静态 Notify Demo 核心实现和核心自动化已通过；真实 macOS Chrome/原生确认/Runner 链路仍需本机验收。**

主原型：`index.html`  
交互/安全 Oracle：`ORACLE.md`  
唯一整体方案：`docs/architecture/execution/flow-marketplace.md`

## 当前主链

本轮没有新建第二套 Marketplace 或安装器。开发助手从现有主原型和 canonical Notify Demo 自动准备一次隔离静态站点：

```text
apps/opendesk/prototypes/marketplace/index.html
+ examples/flow-distribution/notify-demo/notify-demo.odflow
→ .runtime/tests/marketplace/manual-*/site/
   ├── index.html
   ├── local-deep-link-smoke.html
   └── flows/com.example.opendesk.notify-demo/local-notify-demo-1/
       ├── release.json
       └── notify-demo.odflow
```

`release.json` 与 `.odflow` 位于同一个版本目录。站点不提供 `/v1/install-intents/*`、动态 artifact handler 或 `/local-smoke/status`；普通静态文件服务器即可提供全部安装资源。

生成前只核对作者维护的 `main.js` / `clawdesk.runtime.json` 与 `flow.json`，以及 checked-in `.odflow` 的 archive digest。包内生成的 `trust/publisher.pub`、Inventory 和签名继续由正式 `.odflow` verifier 负责，不把生成文件误当成源码文件。

## 一条命令启动

从仓库根目录：

```bash
node tests/prototypes/tools/marketplace-local-manual.mjs
```

助手会：

1. 核对当前源码与 `dist/OpenDesk.app` 的构建指纹；可证明兼容时复用，否则调用现有 `scripts/build_macos_app.sh`。
2. 验证 bundle 签名并注册稳定 `opendesk://` handler。
3. 准备本次 `site/`、真实 Notify Demo、Release v2、临时 Ed25519 release root。
4. 生成 schema v3 的受限开发配置：`sessionId + expiresAt + appDataRoot + resolver + metadata/artifact base + public root`；`appDataRoot` 必须是配置文件目录下真实、私有的子目录，并位于公开 `site/` 外。
5. 启动同一 loopback 静态站点和匹配 OpenDesk。
6. 用 Chrome 打开生成后的主 `index.html`。

终端会打印 Main page、Release、Package、Prepared site、HTTP request log、Install data、development session expiry、Run directory、OpenDesk log、Cold-start check 和 Cleanup。

当前没有文件监听。修改原型或 Notify Demo 源后，需要结束本次开发会话并重新运行命令；刷新浏览器只刷新本次已准备的 `site/`。

## 热启动与冷启动

默认一条命令会先启动匹配的 OpenDesk，因此用户点击页面时是热启动路径。

为验证真正冷启动，使用启动输出中的：

```bash
node tests/prototypes/tools/marketplace-local-manual.mjs \
  --cold-start-check <本次 manual-run-dir>
```

该命令会停止**本次记录的 OpenDesk 进程**，保留静态 HTTP site，然后只通过 LaunchServices 冷启动正式 bundle。OpenDesk 不能从 Deep Link 取得配置路径或密钥，而是只能恢复此前显式批准并仍有效的本机会话：

```text
explicit local config
→ OpenDesk 验证
→ persistent short-lived session pointer
   configPath + configDigest + appDataRoot + sessionId + expiresAt
→ cold bundle launch
→ revalidate session + config digest + expiry
→ restore same isolated appData and static resolver
```

warm path 与 cold path 都从已验证开发配置取得同一个 `appDataRoot`；OpenDesk 在创建 FlowInstall/Catalog 之前绑定它，不再依赖 `/usr/bin/open` 是否继承调用者环境。会话过期、配置字节变化、appDataRoot 变化、symlink、路径失效或 metadata 不匹配都会 fail closed。会话最长只允许短期存在；当前 helper 使用与 Release attestation 相同的约 1 小时 expiry。

清理命令只删除与本次 `configPath` 精确匹配的 session pointer，并只停止本次记录的进程；停止前同时核对 PID、命令标记和记录时的进程启动时间，避免 PID 复用误伤共享进程：

```bash
node tests/prototypes/tools/marketplace-local-manual.mjs \
  --cleanup <本次 manual-run-dir>
```

## 页面真假边界

生成页面只有 **Notify Demo** 使用真实 `opendesk://` 安装请求。它的 Flow ID、版本、发布者、包大小、Release ID、`release.json`、`.odflow` 与协议目标来自同一个真实示例及本次签名发布信息。

其他商品继续是原型模拟，不能触发 Notify Demo 的真实安装。网页点击真实安装后只显示：

> 已请求打开 OpenDesk，请在应用中完成安装。

网页不轮询 Catalog，也不根据点击、失焦、超时或无响应推断安装成功或失败。

## 安装与运行

```text
主原型真实 Notify Demo
→ ID-only opendesk://
→ static resolver GET 同站点 release.json
→ 验证 Release v2
→ HTTP GET 真实 .odflow
→ 验证 digest、包签名、manifest、Inventory、Release/Package 身份
→ 一次原生安装/信任确认
→ 现有 flowinstall.Service 事务安装
→ Catalog / Flow Runner
→ 用户另外点击运行
```

**Install ≠ Run。** 安装路径不调用 Runtime。只有用户在真实 Flow Runner 另行点击运行后，Notify Demo 才允许产生新 Execution、Toast 和固定 console 日志。

## HTTP 证据

每个手工会话都会在公开 `site/` 外保存：

```text
http-requests.log
```

它记录请求时间、方法、静态路径、状态码和返回字节数，可用于证明 OpenDesk/浏览器实际请求了本次 `release.json` 和 `.odflow`。开发配置、request log、Catalog、App Data、receiver log 均不得位于公开站点中。

## Product Config 与网络边界

production 所有权：

```text
configs/product.json
→ product.odcfg
→ internal/officialassets
→ native Marketplace client
```

正式 schema 支持可选：

- `flowDistribution.resolver`
- `flowDistribution.metadataBaseUrl`
- `flowDistribution.artifactBaseUrl`
- `flowDistribution.releaseRoots`

当前仓库没有真实 production HTTPS 发布前缀和可信 Release root，因此正式配置保持未配置，production client fail closed。

production 不仅要求 HTTPS：配置层拒绝明显 localhost/private/link-local/single-label 内网目标；请求期再次解析 DNS，默认 transport 只拨号到已校验的公共 IP；redirect 保持禁用。本地 HTTP 例外只允许显式 loopback 开发配置。

## Release v2 与地址变化

static resolver 只接受签名 Release v2。v2 保护：

- Flow / Release / Publisher 身份；
- `flowName`；
- 版本、包 digest / size；
- `metadataRevision`；
- `artifactLocation`；
- 状态、发布时间、entitlement、有效期等。

同一 Marketplace + Release 的最高 metadata revision 存在现有 Catalog provenance 中。低 revision 在下载和原生确认前拒绝，事务层再检查一次。同一 Release 也不能重新绑定不同 artifact digest；同 digest 改位置需要提高 revision 并重新签名，改包内容必须使用新 Release。

Release v1 继续服务已有 dynamic resolver；static resolver 不会失败后自动猜测切换。

## 当前自动化证据

Flow Commercial Qualification run `35506679830`，代码基线 `ce94bca4f89a47560b1551a1d1274e81d6745309`：

| Gate | 结果 |
| --- | --- |
| Marketplace prototype / static distribution / Chromium | PASS |
| portable owners | PASS |
| `cmd/opendesk TestMarketplaceDevelopment*` | PASS（包含 schema v3、appDataRoot、expiry、session digest/symlink/recovery） |
| macOS Marketplace + Flow Runtime | PASS |
| Windows Marketplace contract | PASS |
| Windows distribution build | PASS |
| Windows B0 direct Runtime | PASS |
| Windows full formal Runtime | BLOCKED：仓库既有 `ATOMIC_REPLACE_UNSUPPORTED`，后续 Flow distribution/B1 被跳过 |

Windows 这一失败发生在通用 Runtime evidence 文件原子替换层，不把它伪报为 Marketplace resolver 失败，也不能把 Windows 完整回归写成 PASS。

## 可选 download 协议参数

**未实施。**

默认页面继续使用：

```text
opendesk://install/flow/<flowId>?release=<releaseId>&intent=<intentId>
```

“不传 download 也能安装”不代表该扩展已完成。

## 仍需真实 macOS 桌面证据

自动化不能替代以下实际 GUI 证据：

- Chrome 主原型真实点击 Notify Demo；
- 热启动真实协议接收；
- `--cold-start-check` 后的冷启动实际协议接收；
- HTTP request log 与 Release/package digest/Catalog 对应；
- 一次原生确认真实内容；
- 取消后无新增 Trust/Catalog/Execution；
- 安装后真实 Flow Runner 可见；
- 点击 Run 前没有新增 Execution；
- 用户显式 Run 后才有新 Execution、Toast/日志；
- 连续点击、幂等重装；
- 缺失、过期、篡改开发 session 的真实拒绝。

这些完成前，Desktop 状态保持 `NOT_RUN`，不得宣称整体最终验收通过。
