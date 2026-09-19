# Flow Marketplace · 当前交互原型合同 v1.4

日期：2026-09-20

状态：LOCAL_HTTP_DEVELOPMENT_BRIDGE_IMPLEMENTED / FRESH_DESKTOP_CLICK_GATED / PRODUCT_INTEGRATION_NOT_CLAIMED
入口：[index.html](index.html)  
运行与测试：[README.md](README.md)

本文件描述本轮真实可操作的 HTML；不是用户已确认的最终视觉方案，也不是 Marketplace 生产完成声明。后续先根据用户对原型的反馈更新 HTML 与本文，再连接生产能力。

## 1. 需求与核验基线

本轮需求：此前已经讨论 Marketplace，用户不清楚功能实际落地情况，希望在原型中实现前端 Demo HTML，以可见、可点击的方式判断方案。

本轮读取的远端基线：`master @ 24ff646c03e5aa385f6089e578b4a02faa9e0a36`。未访问用户 Mac 的工作区、未核验其 `git status` 或正在运行的 Native App。

上位合同：

- `docs/architecture/execution/flow-marketplace.md`
- `docs/architecture/execution/flow-marketplace-protocol-v1.md`
- `pkg/flowmarketplace/installer.go`（实现核验）

核验结论：架构文档仍标注设计接受 / 实现待完成；更具体的 Protocol V1 已标注客户端基础已实现、OS protocol 与后端待完成。实际 `Installer.InstallURL` 已存在：解析 Install Intent、取得 canonical Release、非免费授权、下载后校验 artifact/attestation/package signature 与包身份，然后在任何 Flow、Catalog 或 Trust 写入前显示一次本地确认，并委派 `flowinstall.Service.Install` 提交。它明确不调用 Runtime 执行路径。

因此应采用“**客户端基础代码存在，但不能据此宣称完整市场已上线**”的状态，而不是“全无实现”或“市场已经可用”。本轮不重新实现这些底层能力。

## 2. 用户链路与页面归属

```text
市场首页：搜索 / 分类 / 平台 / 价格筛选
  → Flow 详情：能做什么、输入输出、权限、版本和使用条件
  → 网页交接：只展示受控安装意图，不宣称桌面已安装
  → OpenDesk 桌面：校验 canonical Release、artifact 与已签名 .odflow
  → 非免费 Flow：单独取得模拟授权，再返回安装确认
  → 一次原生确认：Flow / Release / Publisher / Marketplace verification / package signature
  → 本机信任：默认仅当前 Flow，扩大范围需要明确勾选；已有 Flow trust 则不新建信任
  → 写入模拟 Catalog；安装完成但运行次数不变
  → 单独进入 Flow Runner 预览
  → 用户明确确认模拟运行
```

网页目录与本机目录必须分开。本原型主导航的「本机演示」不是网页实际探测到的设备列表；所有状态都标注为模拟。真实实现必须由 Desktop Catalog / 正式回执提供对应证据。

### local HTTP development branch（v1.4）

当且仅当页面由本仓库 `marketplace-local-server.mjs` 的 loopback origin 提供、并可读取
`/local-smoke/status` 时，主原型会把所有 `data-action=install` 按钮替换为普通外部协议 anchor。
它们都固定为 Notify Demo 的三个 ID-only 字段，而不是把六个 fixture 商品伪装成可安装包：

```text
opendesk://install/flow/com.example.opendesk.notify-demo
  ?release=local-notify-demo-1
  &intent=local-notify-demo-intent-1
```

anchor 保留浏览器默认导航；页面只在同源服务独立读取到匹配的 Catalog `ready` record 后显示
「安装成功，尚未运行」。网络状态、DOM 点击、Chrome 是否取得焦点、超时和任一模拟对话框均不是
成功 Oracle。普通文件打开或任意其他静态服务器无法读取该 endpoint，因此保留原始模拟安装体验。
该分支是 **local HTTP development smoke，不是 production Web-to-Desktop**：没有 production HTTPS
origin、pinned production root、desktop account session 或 entitlement adapter。

## 3. 页面合同

### 市场首页

六个 fixture：文件自动整理、表格日报汇总、网页资料收集、到点提醒、计算器 UI 演示、订单导出与对账。它们不表示仓库已存在这些可安装商品。

搜索和筛选可组合；无结果时可清除条件。不展示伪造的下载量、评价、销售额或“真实安装成功”统计。

### 左侧安装帮助区（v1.1）

桌面端的帮助区属于侧栏本身，不再表现为一张独立 Card：

- 位于分类导航下方的剩余空间底部；侧栏用纵向布局，由分类导航吸收剩余空间，帮助区自身保持 `margin = 0`。
- 帮助区自身四周 `margin = 0`，无独立白底、无外框、无圆角；只保留顶部细分隔线。
- 18px 图标与「第一次使用？」在同一行并垂直居中。
- 正文固定为两句：`在 OpenDesk 中确认安装。` / `是否运行，由你决定。`
- 唯一操作入口文案为：`查看安装指南 →`。
- 窄屏侧栏折叠为顶部分类区时，同一帮助区进入普通文档流的紧凑横向帮助行；不使用 `position: fixed`，不遮挡市场内容。

这个区域只解释安装与运行的产品边界，不显示“安装成功”或“已运行”状态，也不成为第二套安装入口。

### Flow 详情

可查看概览、使用说明与版本记录。明确描述输入、输出、系统兼容性、价格示意、权限用途和发布者；Market Verified 与本机 Trust 不混同。

在普通原型中，「安装到 OpenDesk」进入网页交接，而不是直接把 Flow 标为已安装。local HTTP development
branch 中它会变为固定 Notify Demo 的真实外部协议 anchor；权限扩大更新显示差异并重新取得同意的页面仍是模拟，不能被当作该本地安装的安全确认。

### 网页交接

普通原型展示的 URI 仅为 ID-only 格式示例：

```text
opendesk://install/flow/<flowId>?release=<releaseId>&intent=<installIntentId>
```

普通原型不真正打开此 URI。没有真实 Intent 服务，`demo-intent-*` 不是有效安装凭据。local HTTP development branch
例外地只允许上述固定 Notify Demo URI，并使用在本次 loopback server 内临时签名的 Release；HTML 不持有
`.odflow` 文件、root key 或 artifact 副本。

未收到回调不能推断未安装客户端，更不能用定时器或浏览器失焦推断成功。未装客户端与手动安装分支只说明取得真实客户端和 `.odflow` 后如何继续；不下载伪造包。

### Desktop 安装确认与信任

先核对具体 Flow / Release、平台与权限；付费未授权不能开始下载演示。模拟授权成功只返回确认页面，不自动开始安装，权限勾选仍需明确完成。

local HTTP development branch 的真实 receiver 在 canonical artifact、Marketplace attestation、包身份与 package signature 都验证后，显示一次原生确认：其中同时列出 Release、Flow、Publisher、Marketplace verification、签名状态、默认 Flow-scoped trust 和「安装不运行」。只有本次仍需要建立 trust 时才显示 Publisher-wide 范围选项；默认选择「仅批准这个 Flow」，扩大范围必须另勾选。已有 Flow trust 时同一确认仅确认 Release 安装，不新建信任记录。模拟 Trust 使用稳定 fixture 的 Flow / Publisher / Signing Key 标识，不把市场认证标签或发布者展示名当成授权。

真实 TrustStore、签名/摘要计算、protected-package preflight、entitlement、事务安装继续由既有 Go owner 提供；不得将 HTML 中的 `commit()` 或布尔 fixture 复制为生产授权机制。

### 结果、本机预览与更新

成功文案始终包含“尚未运行”。运行按钮打开独立的模拟运行确认，不调用业务脚本。安装、更新、重新打开页面均不能自行增加模拟运行次数。

「载入旧版本更新案例」是明确的测试动作，不伪装成发现真实已安装软件。旧版 `1.1.0` → `1.2.0` 的更新案例新增递归读取权限，必须重新确认。失败保留旧记录。

移除、重置均有确认。移除 Flow 不隐式撤销 Publisher-wide trust 或独立的使用授权；重置只删除本原型的专用存储 key。

## 4. 最小状态与异常合同

模型步骤为演示语义，不是新增生产协议：

```text
handoff → verify → one native confirm + optional Flow trust → installed
                  ↘ error / cancel                       ↗
任意未完成阶段 → cancel
```

Release 已撤回在进入安装确认/下载演示前即阻止。`verify` 不执行密码学验证；它将选定的故障 fixture 投影到 UI。

| 场景 | 页面应表达 | 不允许产生 |
| --- | --- | --- |
| 正常 | 一次原生确认、完成、尚未运行 | 自动运行 |
| 未装客户端 | 先取得客户端、手动方式 | 声称真实检测到设备状态 |
| 网页未收到唤起确认 | 明确未知，可手动继续演示 | 超时即成功 / 超时即未安装 |
| 付费未授权 | 先取得独立授权 | 下载或安装 |
| 平台不兼容 | 阻止并解释支持系统 | 勾选同意绕过兼容性 |
| 网络中断 | 停止，尚未安装 | 假的成功 Catalog |
| 签名或摘要错误 | 阻止，不提供绕过 | “仍然安装” |
| Release 已撤回 | 开始安装前拒绝 | 新安装 |
| 事务写入失败 | 回滚，旧版本保持 | 半安装状态或提前写 Trust |
| 取消 | 作废当前 operation token | 迟到回调继续安装 |
| 权限扩大更新 | 显示差异，重新确认 | 静默升级 |
| 浏览器存储不可用 | 内存继续，说明不持久 | 页面崩溃 / 清除其他数据 |

## 5. 验证覆盖与证据范围

`tests/prototypes/marketplace.test.cjs`：包含 29 项源码契约，其中包含侧栏帮助区 v1.1 静态合同；其余覆盖筛选、身份型 intent、scope、entitlement、平台、取消/迟到回调、更新/回滚、存储恢复、畸形存储、无隐式执行等。

`tests/prototypes/marketplace-smoke.py`：19 组浏览器交互场景继续覆盖主流程、付费、发布者信任、手动方式、故障、更新、键盘、焦点、错误路由和响应式布局；v1.1 又在 320 / 390 / 768 / 1280 宽度加入帮助区可见、桌面贴底、去 Card 化、标题同行和移动端非 fixed 的断言。运行截图仍写入 `.runtime/tests/marketplace-prototype/`。

v1.1 已在 Flow Commercial Qualification run `35300159654` 的 `Marketplace prototype` job 中实际执行：29 项 Node model/静态合同 PASS，Chromium `--set-content` smoke PASS，并上传 `.runtime/tests/marketplace-prototype/` 证据。该证据证明当前 HTML DOM、交互和响应式布局合同，不是 Native OpenDesk 实窗，也不验证浏览器导航与 OS Deep Link 交接。详见 README。

## 6. 后续生产接线边界

用户确认本原型后，逐段实现并分别验收：

1. 真实 Web Catalog / Flow detail 数据和服务端 Install Intent 创建；服务端 Publisher / Flow / Release / Artifact 的身份与发布状态。
2. OS `opendesk://` 注册、单实例转发、正式桌面安装确认界面，交给已有 `flowmarketplace.Installer`。
3. canonical API origin、attestation roots、真实 artifact 服务、Desktop account session / entitlement adapter；对接产品配置的单一 URL 来源。
4. 安装结果由真实事务与 Local Catalog 提供，状态回执不能靠前端推断；安装与运行保持独立。
5. 真包、真实 Deep Link、Native UI、失败回滚和零业务执行的独立验收。现有测试 fixture 不能替代这些证据。

发布者后台、上传、支付、评论、排行榜与完整自动更新平台不在本轮 HTML 实现范围内。「发布 Flow」只说明发布要求，不能宣称可实际发布。

## 7. 本地开发安装检查（v1.3）

需求来源：继续本地 Marketplace 验收；用户允许无 HTTPS 的本地 HTML，要求最简页和既有原型分别检查，
并区分 OS URL 分发、receiver fail-closed、现有 `.odflow` 侧载路径。

主原型的布局、示例数据、授权页面和 Runner 保持模拟；只有其安装 affordance 在 local HTTP development branch 中接入真实安装闭环。`local-deep-link-smoke.html` 仍是独立的最小入口：明确点击后请求真实客户端，再从同源测试服务读取隔离 Catalog 状态。两个页面共享同一固定 Notify Demo intent/package；合法请求只有固定三个标识，负向请求仅添加 `unsupported=1`，不携带文件、代码或凭证。

本地测试服务每次运行生成临时 Marketplace root，对从公开 Notify Demo canonical 包派生的 Release metadata 签名，并在运行时提供 HTTP artifact。Desktop 仅在显式 `-marketplace-development-config` 下接受 HTTP loopback 和这个临时 root。页面只有在服务独立核对 Catalog record、安装目录、Release ID、artifact digest、`ready` 和 `origin=marketplace` 后显示成功。网络失败、超时、浏览器失焦和 URL 点击本身都不能产生成功状态，也不会重新派发安装。

页面显示成功时仍必须写明「尚未运行」。安装 handler 完成后可以激活 Runner，但不能调用 Flow；实际运行须由用户在 Runner 单独点击，并以新的 execution/log 作为 Oracle。

`9c4017f8` 已落地 macOS URL receiver；本文件第 1 节描述的是更早的原型基线。
没有显式开发配置或生产 client 时，接收端仍在安装确认 UI 之前 fail closed。
两页的静态合同由 `tests/prototypes/marketplace-local.test.cjs` 覆盖；
它们不启动桌面，不证明 AppKit 回调被调用。侧载 CLI、真实浏览器点击、原生窗口视觉验收分别留证。
v1.3 不继承 v1.1 截图的视觉通过结论；签名、加载或浏览器策略阻塞时，记录当前验收缺口。

### 2026-09-19 改造前 HTTP 实测补充

通过用户已启动的 `http://localhost:51807/`，真实 Chrome 已加载当前 HTML，并完成
详情 → 网页交接 → 权限确认 → Flow 范围信任 → 安装完成 → 模拟 Runner 的页面链路。
安装结果显示「尚未运行」，Runner 运行次数为 `0`；截图与 DOM 记录在
`.runtime/tests/marketplace/http-20260919/`。这是浏览器内模拟安装的证据。

旧最简页加载时为「尚未请求打开客户端」。合法链接点击后显示交付未知，点击期间浏览器控制中断；
只读复核不能证明 macOS 或 receiver 接收，故不重复点击，不继续非法参数派发。
接收端 live、原生安装确认和 GUI 侧载当时仍未通过，且当时未替换、启动或结束共享 OpenDesk 实例。该记录是本次修复的失败基线，不是 v1.3 的通过结论。

独立 CLI 在隔离 app-data 下实际完成包验签、未信任拒绝、Flow-scope 安装、Catalog ready/origin=odflow
和幂等重装；未调用 `flow run`。33 项 Node 检查通过。CLI 安装与浏览器模拟安装分别留证。
Notify Demo 的公开示例归属、现有消费者和未来 fixture reference 规则见 README；本轮不复制或移动包。

### 2026-09-19 历史 live 证据与当前重验状态

`.runtime/tests/marketplace/html-install-live-20260919/` 记录的 Chrome、Release 确认、Flow 范围 Trust、Catalog `ready/origin=marketplace` 和随后一次成功运行，都是早期本地临时 root 的历史证据。用户后来在 Flow 列表删除了对应 Catalog record；这不否定早期安装，但也不能作为当前 run 的安装成功、零执行或 Runner 运行结论。

当前 receiver 的开发日志在真正完成 AppKit delegate 与 App Mode URL handler 绑定后才写 `receiver-ready`。fresh helper 还会识别 workspace 的稳定 `dist/opendesk` symlink 所启动的共享 App Mode 实例，并停止而不关闭它。当前共享实例仍占用同一 product single-instance lease，因此本轮尚未执行新的 Chrome 点击、两次原生确认、Catalog Oracle、侧载 GUI 和 Runner execution；这些项目保持 `not-run`，直到该实例由其 owner 关闭后再启动 fresh run。

本地 HTTP 检查始终只是 development smoke，不是 production Web-to-Desktop：它没有固定 HTTPS origin、production attestation root、桌面账户会话或 entitlement adapter。
