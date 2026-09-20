# Flow Marketplace · 同站点静态安装 Oracle

日期：2026-09-20

状态：**STATIC_IMPLEMENTED / AUTOMATION_IN_PROGRESS / MACOS_DESKTOP_NOT_RUN**

本文件定义当前主原型与本地真实 Notify Demo 的可观察正确行为。整体架构只维护在 `docs/architecture/execution/flow-marketplace.md`。

## 1. 唯一真实开发链路

```text
node tests/prototypes/tools/marketplace-local-manual.mjs
→ 当前 index.html + canonical Notify Demo
→ 本次 run/site
→ Chrome 打开 run/site/index.html
→ 点击真实 Notify Demo「安装到 OpenDesk」
→ OS 分发 opendesk:// 给当前 OpenDesk
→ static resolver GET 同站点 release.json
→ 验证 Release v2
→ GET 同站点 notify-demo.odflow
→ 验包 + Release/Package 匹配
→ 一次原生安装/信任确认
→ flowinstall.Service 事务安装
→ Catalog / 真实 Flow Runner
→ 用户另外点击 Run
→ 新 Execution + Notify Demo Toast / 固定日志
```

任何“安装时直接出现业务通知或 Execution”都是失败。

## 2. 站点与页面 Oracle

本次 HTTP 根目录只能是 run 下的 `site/`。页面、`release.json` 和 `.odflow` 在同一 origin；开发配置、App Data、Catalog、私钥或日志不能位于公开站点中，也不能通过 symlink 扩展 HTTP 根。

`index.html` 每次启动从 canonical 主原型重新准备，`.odflow` 每次从 canonical 示例读取并核对。没有文件监听，因此源码改变后需要重新运行开发命令。

生成页面只有真实 Notify Demo 的安装 affordance 使用实际 `opendesk://`；“查看发布说明”和“下载 .odflow”必须与安装目标是同一 Flow/Release；其他商品继续模拟。页面不得调用 `/local-smoke/status`，不得根据 blur、visibilitychange、timeout 或点击事件推断成功。

源码 `index.html` 在没有生成 binding 时仍是离线原型，CSP 保持 `connect-src 'none'`，不自带临时地址、密钥、端口或包摘要。

## 3. Release v2 Oracle

静态 `release.json` 外层 schema 为 1，内部 Release/Attestation schema 为 2。受签名保护至少包括 Marketplace/Flow/Release 身份、Flow 显示名称、版本、Publisher identity、artifact digest/size/location、minimum OpenDesk version、发布时间/状态/entitlement、update channel、metadataRevision 和 attestation expiry。

Go verifier 与 Node 本地发布器必须通过同一 golden message。静态模式不得接受 v1 Release，也不得验签失败后猜测切换 dynamic resolver。

## 4. 地址与 revision Oracle

相对 `artifactLocation` 使用 `artifactBaseUrl`；为空时沿用 `metadataBaseUrl`。合法配置路径前缀不能丢失或重复。`../`、反斜杠、绝对相对路径、query/fragment、未批准重定向均拒绝。开发 HTTP 例外只允许显式 loopback；正式配置只接受 HTTPS。

同一 Marketplace + Release 已接受 revision=2 后，再收到 revision=1，必须在 artifact download 和 native confirmation 前拒绝，且 Catalog 仍保持 revision=2。位置改变但 digest 不变时，需要提高 revision 并重新签名；包内容改变必须使用新 Release。

## 5. 原生确认与 Install ≠ Run

确认必须发生在 Release 已验证、artifact 已下载并核对摘要、canonical `.odflow` 已验签/验 manifest、Release/Package 身份一致之后。确认显示的名称来自受 v2 attestation 保护且与包 manifest 匹配的 `flowName`。

未知 Publisher 默认 trust 仍限当前 Flow；Release attestation 不能伪造 AuthorityProof 或自动变成本地 Publisher Trust。取消时不能新增 Trust、ready Catalog、安装内容或 Execution。

安装路径只能调用现有统一安装内核，不允许调用 Runtime。桌面验收必须在点击 Runner Run 之前证明目标 Flow 没有新增 Execution；之后另行点击 Run，再核对新 Execution identity、Toast 与固定日志。模拟 Runner 不是实际运行证据。

## 6. 配置与普通静态服务器 Oracle

production distribution 只能来自正式 Product Config 编译链；Deep Link、DOM 或环境变量不能提供 metadata/artifact/trust root。当前 production `flowDistribution` 未配置，因此 production client fail closed。

本地开发配置只允许 schemaVersion=2、resolver=static、HTTP loopback 和本次临时 Ed25519 public root，并位于 `site/` 外。

把已生成 `site/` 交给独立通用静态 HTTP server 后，`index.html`、`release.json`、`.odflow` 仍应是普通文件；`/v1/install-intents/*`、动态 artifact endpoint 与 `/local-smoke/status` 均不应存在。客户端只要使用与新 origin 匹配的受限开发配置，就不应需要第二个 Marketplace 业务服务。

## 7. 仍需真实桌面证明

热启动协议接收、冷启动协议接收、实际 HTTP 请求、一次原生确认、取消后的零副作用、真实 Flow Runner 可见、安装前后无新增 Execution、显式 Run 后的新 Execution/Toast/日志、重复点击/重装、开发配置缺失或不匹配时的拒绝，都必须在真实 macOS 上取得证据。

没有这些证据时，Desktop 状态保持 `NOT_RUN` 或 `BLOCKED`。

## 8. download 扩展

`download` Deep Link 参数：**未实施**。默认页面不得生成该参数。
