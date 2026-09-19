# Flow Marketplace HTML 原型

状态：**可运行交互原型，含 local HTTP development smoke；不是 production Web-to-Desktop。**

入口：[index.html](index.html)  
交互与后续实施合同：[ORACLE.md](ORACLE.md)

## 整体方案（已保存，待代码实施）

正式方案：[Flow Marketplace：整体框架、同站点开发与安装方案](../../../../docs/architecture/execution/flow-marketplace.md)。

目标是继续使用本目录的 `index.html`，由现有开发助手自动把页面和已有 Notify Demo 包准备到同一个 HTTP 文件站点；每个版本在 `flows/<flowId>/<releaseId>/` 中并排保存 `release.json` 和 `.odflow`，不拆成 `releases/`、`packages/` 两套目录，也不要求两个域名、手工复制或多条启动命令。

页面和包的维护源不移动；同站点副本只在 `.runtime/` 自动生成，不成为第二份人工维护源。原型中只有真实 Notify Demo 绑定真实包，其他商品保留模拟。完整方案包含文件对应关系、配置前缀、启动方式、CDN/下载参数边界、反方审计及验收标准。

**下面记录的是当前代码及历史验收，不是上述静态方案已实现的证据。** 当前 helper 仍依赖专用服务并打开最简页；普通静态服务器只展示当前原型。架构文档分别列出了现有命令与目标改造，不得将二者混报为通过。

## 两个本地页面

| 页面 | 实际作用 | 成功依据 |
| --- | --- | --- |
| [交互原型](index.html) | 浏览、筛选和模拟 Runner；本地 smoke 服务可达时，所有商品安装映射到固定 Notify Demo | 同源 Catalog 的实际 `ready` 记录；其余交互仍是模拟 |
| [最简安装检查](local-deep-link-smoke.html) | 显式点击后打开固定 `opendesk://` URI，并轮询同源测试服务 | 实际隔离 Catalog 中与 Release 完全匹配的 `ready` 记录 |

原型顶部可进入最简页，最简页可返回原型。由 `tests/prototypes/tools/marketplace-local-server.mjs` 提供本地 HTTP loopback 时，原型会把每个商品的安装按钮替换为普通、默认导航的 `opendesk://` anchor；固定 intent/package 都是 Notify Demo。原型的商品元数据、授权对话框和 Runner 则保持模拟，不会被标作真实安装成功。
这两个页面都只支持 local HTTP development smoke。测试服务为每次运行生成临时 Ed25519 root 和签名 Release，Desktop 必须通过显式开发配置启用该 root；页面不会通过超时、失焦或 URL 点击推断安装完成。
它取代 `.runtime/tests/marketplace/local-deep-link-smoke.html` 作为可维护入口；旧文件只属于历史运行产物。

从仓库根目录执行这一条命令即可开始一次新的手工验收：

```bash
./scripts/build_macos_app.sh && node tests/prototypes/tools/marketplace-local-manual.mjs
```

helper 每次创建新的 `.runtime/tests/marketplace/manual-<timestamp>/`，生成一小时有效的临时 Ed25519 root、匹配的开发配置和隔离 Catalog；它会验证并注册当前 `dist/OpenDesk.app`，启动同一配置的 OpenDesk，再用一个无副作用的非法参数 URL 预检 LaunchServices 是否确实交给**本次**接收端，最后自动打开精确页面 URL。它不会占用固定端口，也不会关闭既有 OpenDesk 实例或其他服务；如果检测到共享实例，会安全停止并打印其准确命令。

页面打开后，可点击最简页的「安装 Notify Demo」，或交互原型中任何商品的「安装」。两者均会交接同一个固定 intent；后者不代表 fixture 商品本身已经可发布。依次确认 Chrome 的“打开 OpenDesk”、OpenDesk 的 Release 确认和 Flow 范围信任。只有服务读取到实际 Catalog 的 `state=ready`、`origin=marketplace`、Release ID、包摘要与安装目录全部匹配时，页面才显示「安装成功，尚未运行」。运行仍需在 Flow Runner 中明确点击。

页面会把可见状态区分为：本地服务/接收端就绪、等待 Chrome 外部协议确认、OpenDesk 已收到 intent 正在等待两个原生确认、接收端验签或安装拒绝、以及 Catalog 已确认安装。失败页不会转报成功，且会指向同次 `manual-*` 目录中的 `opendesk.log`。

helper 会打印精确的 cleanup 命令；只对该命令生成的 `manual-*` 运行目录执行：

```bash
node tests/prototypes/tools/marketplace-local-manual.mjs --cleanup <manual-run-dir>
```

未传 `-marketplace-development-config` 时，接收端继续 fail closed；未知 URI 参数也在联网与确认之前拒绝。该开发开关只接受本地普通配置文件和 HTTP loopback origin，不改变生产 client 的 HTTPS、pinned root、session 或 entitlement 要求。

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
| Marketplace 本地检查 | `tests/prototypes/tools/marketplace-local-server.mjs` 在运行时读取上述唯一来源并提供 HTTP artifact，不保存第二份包 |

页面中的六个商品 fixture 仍是模拟数据。在 local HTTP development smoke 中，所有商品按钮都暂时映射到公开 Notify Demo 包；包不与 HTML 放在一起，也不安装到 `apps/opendesk/prototypes/marketplace/`。本地服务按需读取 canonical 包，OpenDesk 将安装内容写入显式 `OPENDESK_APP_DATA_DIR` 下的 `flows/`，Catalog 写入其 `flow-state/records/`。
本次检查未发现该包是应用构建脚本的必需输入；它仍有公开示例与 Runtime 测试职责，不能据此移走。

每轮记录所选包的 SHA-256、Manifest digest、publisher fingerprint，并校验包内源码与配置。
若以后需要独立稳定的页面下载测试，先在 `tests/prototypes/` 建立有来源路径、摘要和更新规则的
fixture reference；优先从唯一来源解析。确需冻结副本时，应显式标明 owner、来源和生成/校验命令，
不得手工维护第二套权威包。运行时副本与下载结果只写 `.runtime/tests/marketplace/`。

### 历史 HTTP 验收基线（2026-09-19，改造前）

现有 `serve` 站点 `http://localhost:51807/` 已在真实 Chrome 加载。模拟安装走完权限确认、
默认 Flow 范围信任和安装完成；模拟 Runner 显示运行次数 `0`。详情、安装结果与最简页已有当前截图。
最简页合法链接已尝试点击，页面显示交付未知；该点击期间浏览器控制中断，没有接收端日志，
因此 **macOS 交付与 receiver live 均未确认**，未重试，也未继续负向派发。
本地证据位于 `.runtime/tests/marketplace/http-20260919/`。

本轮独立 bundle CLI 侧载通过，33 项 Node 检查通过；没有进行 GUI 侧载或运行 Flow。
生产 Web→Desktop 仍缺少固定 HTTPS origin、pinned root、session/entitlement adapter 和受控 release。
该历史结果解释了为何旧页面点击后看不到安装成功；不能作为当前真实安装页的完成证据。当前实测结果以 `.runtime/tests/marketplace/` 下后续验收报告为准。

### 早期本地真实安装证据（2026-09-19；不代表当前 run）

早期真实 Chrome HTTP 页面曾成功安装公开 Notify Demo 包；该隔离 Catalog 随后由用户在 Flow 列表中显式删除。不要把该用户删除的 Catalog 空状态解释为安装失败。旧临时 Release 的一小时签名到期后，接收端会正确拒绝重新安装；新的 helper 每次生成 fresh root，因此旧页面、旧 config 和旧 log 不能用于新的手工验收。

同轮还验证了两个 receiver 拒绝条件：页面点击包含 `unsupported=1` 的 URI 时在解析阶段拒绝；同一构建不传开发配置时，合法 URI 以 `marketplace installer is unavailable` fail closed。完整日志、Catalog、execution summary 和实窗截图位于 `.runtime/tests/marketplace/html-install-live-20260919/acceptance.md`。这些是历史证据；新的临时 root、当前 bundle 和当前 Chrome 点击必须重新验收，不能继承该结论。

当前 helper 只在 AppKit URL delegate 和 App Mode URL handler 都已绑定后记录 `receiver-ready`。若检测到同一 workspace 的 `dist/opendesk -app apps/opendesk`（包括稳定 symlink 入口）已持有 single-instance lease，helper 会在创建新 run 前停止，绝不关闭共享进程；关闭该实例后才可开始下一次 fresh live 验收。

每次验收分别记录：代码已修改 / 实际已加载 / 视觉已确认 / 功能已验证。
本轮本地证据统一写入 `.runtime/tests/marketplace/`；浏览器/系统限制或签名失败时记为未运行，
不得拿历史截图、Node 模型、`httptest` 或原型模拟结果替代当前实窗证据。

## 打开

`index.html` 是自包含 HTML，CSS、图标、示例数据和脚本均内置；无 CDN 或构建步骤。以文件或普通静态服务打开时保留全部模拟行为；只有 local smoke server 的同源状态 endpoint 可达时，安装按钮才变为固定 Notify Demo 的真实外部协议入口。

从仓库根目录，在 macOS 可直接打开：

```bash
open apps/opendesk/prototypes/marketplace/index.html
```

也可以用浏览器打开该文件，或从仓库根目录运行本地静态服务：

```bash
python3 -m http.server 8765 --bind 127.0.0.1 --directory apps/opendesk/prototypes/marketplace
```

然后访问 `http://127.0.0.1:8765/`。静态服务不是 Marketplace Backend，且不会启用原型中的真实安装桥接。

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

- 通过 local smoke server 时，仅安装 anchor 会请求固定 `opendesk://` URI；其余原型交互不连接 OpenDesk Runtime，也不调用生产 Marketplace API。
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

浏览器检查需要 Python、Playwright 和 Chromium。已有这些依赖时，在仓库根目录运行：

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
