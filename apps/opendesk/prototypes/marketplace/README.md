# Flow Marketplace HTML 原型

状态：**可运行交互原型，待用户确认；不是生产 Marketplace。**

入口：[index.html](index.html)  
交互与后续实施合同：[ORACLE.md](ORACLE.md)

## 两个本地页面

| 页面 | 实际作用 | 成功依据 |
| --- | --- | --- |
| [交互原型](index.html) | 浏览、筛选、模拟安装与模拟 Runner；不调用客户端 | 页面交互和模拟状态 |
| [最简分发检查](local-deep-link-smoke.html) | 显式点击后请求浏览器打开固定 `opendesk://` URI | macOS 实际接收进程、接收端日志；网页无法确认交付 |

原型顶部可进入最简页，最简页可返回原型。原型内的「安装到 OpenDesk」仍是模拟动作。
最简页不需要 HTTPS，没有网络 client、凭证、下载 URL 或真实 Release；不会通过超时、失焦或点击成功推断安装完成。
它取代 `.runtime/tests/marketplace/local-deep-link-smoke.html` 作为可维护入口；旧文件只属于历史运行产物。

从仓库根目录直接打开最简页（macOS）：

```bash
open apps/opendesk/prototypes/marketplace/local-deep-link-smoke.html
```

这条命令只打开页面。先核对当前 OpenDesk 的 PID、主程序/UI host 路径、构建来源、签名与单实例状态，
再点击「请求打开 OpenDesk」。不得为测试覆盖或终止其他任务的实例。
未配置 Marketplace client 时，合法意图的预期接收日志为
`[MARKETPLACE_INSTALL] blocked ... error=marketplace installer is unavailable`；
「请求检查非法参数」的预期日志为 `[MARKETPLACE_INSTALL] rejected invalid install intent`。
该 fail-closed 分支在 Release 解析和安装确认 UI 之前停止，没有确认窗口不代表分发失败；
没有接收端日志也不能判为接收成功。安装确认 UI 的正向验收需要已配置 client 和已验证 Release。

本地静态 HTTP 也可使用下方的同一启动命令，最简页路径为 `/local-deep-link-smoke.html`。
这只改变 HTML 的访问方式，不放宽 Desktop Marketplace client 的 HTTPS / pinned root 要求。

`.odflow` 侧载独立使用现有 [Notify Demo](../../../../examples/flow-distribution/notify-demo/README.md)。
测试前对**实际包字节**执行 inspect / verify，不假定并行工作树里的包等于 HEAD。
CLI 安装测试通过现有 `OPENDESK_APP_DATA_DIR` 指向 `.runtime/tests/marketplace/` 下独立目录；
不向用户 Catalog 写信任，不调用 `flow run`。CLI 通过不能代替拖入、文件选择或双击的 GUI 验收。

### 固定侧载输入的归属

`examples/flow-distribution/notify-demo/notify-demo.odflow` 保留为公开侧载示例的唯一包来源，
不搬入或复制到本页面目录。它的维护关系如下：

| 角色 | 权威位置 / 调用者 |
| --- | --- |
| 示例源码与能力配置 | `examples/flow-distribution/notify-demo/main.js`、`clawdesk.runtime.json` |
| 包与生成 Manifest | 同目录的 `notify-demo.odflow`、`flow.json`；后者不是独立创作输入 |
| 重建与来源说明 | 同目录的 `build.sh`、`README.md`；重建默认示例输出在 `.runtime/examples/notify-demo/` |
| 公开示例入口 | `examples/flow-distribution/README.md`、`examples/catalog.json` |
| Runtime 契约消费者 | `tests/runtime-api/flow-installation.js` 直接检查公开包、源码与配置一致性 |
| Marketplace 本地检查 | 本文与最简页只引用上述路径，不提供另一份下载包 |

页面中的六个商品 fixture 是模拟数据，与 Notify Demo 没有可安装 Release 的映射。
最简页不读取包，因此当前不需要在页面目录新增二进制 fixture。
服务根目录仅为页面目录时，仓库文件路径是操作说明，不应伪装成可下载的 HTTP 链接。
本次检查未发现该包是应用构建脚本的必需输入；它仍有公开示例与 Runtime 测试职责，不能据此移走。

每轮记录所选包的 SHA-256、Manifest digest、publisher fingerprint，并校验包内源码与配置。
若以后需要独立稳定的页面下载测试，先在 `tests/prototypes/` 建立有来源路径、摘要和更新规则的
fixture reference；优先从唯一来源解析。确需冻结副本时，应显式标明 owner、来源和生成/校验命令，
不得手工维护第二套权威包。运行时副本与下载结果只写 `.runtime/tests/marketplace/`。

### 当前 HTTP 验收范围（2026-09-19）

现有 `serve` 站点 `http://localhost:51807/` 已在真实 Chrome 加载。模拟安装走完权限确认、
默认 Flow 范围信任和安装完成；模拟 Runner 显示运行次数 `0`。详情、安装结果与最简页已有当前截图。
最简页合法链接已尝试点击，页面显示交付未知；该点击期间浏览器控制中断，没有接收端日志，
因此 **macOS 交付与 receiver live 均未确认**，未重试，也未继续负向派发。
本地证据位于 `.runtime/tests/marketplace/http-20260919/`。

本轮独立 bundle CLI 侧载通过，33 项 Node 检查通过；没有进行 GUI 侧载或运行 Flow。
生产 Web→Desktop 仍缺少固定 HTTPS origin、pinned root、session/entitlement adapter 和受控 release。
本机 URL 默认注册目标与正在运行的开发实例不同，后续 receiver 验收须先统一构建来源并取得接收日志；
不能仅凭网页状态或单实例激活推断 URL 已交付。

每次验收分别记录：代码已修改 / 实际已加载 / 视觉已确认 / 功能已验证。
本轮本地证据统一写入 `.runtime/tests/marketplace/`；浏览器/系统限制或签名失败时记为未运行，
不得拿历史截图、Node 模型、`httptest` 或原型模拟结果替代当前实窗证据。

## 打开

`index.html` 是自包含 HTML，CSS、图标、示例数据和脚本均内置；无 CDN、构建步骤或真实网络依赖。

从仓库根目录，在 macOS 可直接打开：

```bash
open apps/opendesk/prototypes/marketplace/index.html
```

也可以用浏览器打开该文件，或从仓库根目录运行本地静态服务：

```bash
python3 -m http.server 8765 --bind 127.0.0.1 --directory apps/opendesk/prototypes/marketplace
```

然后访问 `http://127.0.0.1:8765/`。静态服务不是 Marketplace Backend。

## 可以体验什么

| 页面 / 环节 | 可操作内容 |
| --- | --- |
| 市场首页 | 六个示例 Flow；关键词、分类、系统、价格、排序与空状态 |
| 侧栏帮助区 | 桌面端贴底、无 Card、图标与标题同行；窄屏改为普通文档流紧凑帮助行 |
| Flow 详情 | 概览、使用说明、版本记录、权限、发布者、兼容系统与价格示意 |
| 网页交接 | ID-only Install Intent 展示、未装客户端、未收到唤起确认、手动安装说明 |
| 桌面安装预览 | 具体版本确认、权限确认、模拟付费授权、校验、Flow / Publisher 信任范围 |
| 本机演示 | 安装与运行分离；明确确认后模拟运行；移除记录 |
| 更新 / 故障 | 新增权限重新确认；断网、签名或摘要失败、Release 撤回、事务失败与取消 |

建议体验：选择「文件自动整理」→ 查看详情 → 安装到 OpenDesk → 演示桌面确认 → 同意本次权限 → 确认安装 → 仅批准此 Flow → 在 Flow Runner 中查看。此时模拟运行次数必须为 **0**。

右上角「演示设置」可切换故障与演示系统。设置仅作用于下一次安装，不检测真实设备。更新案例会明确载入一条旧版模拟记录。

## 安全与实现边界

- 不调用真实 Marketplace API，不注册或打开 `opendesk://`，不连接 OpenDesk Runtime。
- 不提供无效 `.odflow` 下载来伪装安装成功；不接收上传，不创建订单、不扣费。
- 数据、发布者身份、签名 Key ID、版本、系统要求与价格全部为 fixture。市场验证不自动产生本地信任。
- 原型仅用内存 / `localStorage` key `opendesk.marketplace.prototype.v1` 保存模拟状态；存储不可用时降级为内存，不清除其他网站数据。
- 签名、digest、entitlement、transaction 状态是模拟结果，不是安全验证实现。权限说明也不是 Runtime 强制沙箱的实现证明。
- 购买、安装、运行始终独立。真实产品中的授权与 Trust 必须由现有 owner 决策，不使用这个前端模型替代。
- 未改动 `configs/product.json`、官方 URL、生成 `.odcfg`、发行资源或现有安装安全内核。

## 测试

在仓库根目录运行纯模型测试，依赖 Node.js 自带的 test runner：

```bash
node --test tests/prototypes/marketplace.test.cjs tests/prototypes/marketplace-local.test.cjs
```

浏览器检查需要 Python、Playwright 和 Chromium。已有这些依赖时，在仓库根目录执行：

```bash
python tests/prototypes/marketplace-smoke.py
```

可使用 `--browser-executable /path/to/chromium` 指定现有 Chromium。测试只启动静态服务和浏览器，不启动 OpenDesk。

运行证据写入 `.runtime/tests/marketplace-prototype/`，不提交运行截图或日志。

v1.1 已重新完成真实资格：Flow Commercial Qualification run `35300159654` 的 `Marketplace prototype` job 中，29 项模型/静态合同通过，Chromium DOM 交互 smoke 通过；响应式检查覆盖 320 / 390 / 768 / 1280 像素，并验证帮助区桌面贴底、帮助区自身四边 `margin = 0`、去 Card、图标标题同行以及移动端非 fixed。运行证据由 CI 上传为 `marketplace-prototype-evidence`。

以下为 v1.1 的历史 CI 环境记录，不代表当前 Mac 已通过页面或桌面验收。当时浏览器命令为：

```bash
python tests/prototypes/marketplace-smoke.py --set-content --browser-executable /usr/bin/chromium
```

该模式将同一 HTML 字节内容载入 Chromium DOM 后实际点击、检查和截图，**不证明本地 URL 导航、文件双击打开或浏览器持久存储端到端通过**。持久存储逻辑单独由模型测试验证。当前 v1.1 smoke 已通过，但仍不能替代 macOS / Windows Native UI、真实下载、支付、OS 唤起或签名校验。
