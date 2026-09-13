# OpenDesk Official Shell 与商业入口

> 状态：P0 implemented；真实 UI 状态以当次验收证据为准
> 日期：2026-09-12  
> 适用范围：`apps/opendesk` 官方 App Mode 产品包  
> 相关设计：`docs/architecture/app-shell-tray-menu.md`、`docs/architecture/execution/protected-recipe-package.md`

## 1. 最终产品关系

OpenDesk 当前阶段的正式默认用户 UI 是 **Product Script Runner**，不存在位于它前面的 Demo/欢迎主面板。

```text
OpenDesk App Shell / Host
        |
        | opendesk.open -> show/focus window "main"
        v
Product Script Runner                      <- 默认产品 UI
- opendesk.home (first-position brand icon)
- Run / Stop
- current script
- script list (main window)
        |
        +-- Official Shell secondary actions
            - opendesk.customize
            - opendesk.help

Generic Script Runner                      <- shared behavior / public example
- no Official Shell policy
- no marketplace / license / VIP policy
```

P0 显示一个首位品牌入口和两个右侧官方入口：

- **官网**：点击原色 OpenDesk Logo，打开 canonical public project page；
- **定制**：定制自动化与商业服务入口；
- **帮助**：帮助、文档、反馈、支持的统一入口。

`商店` 与 `专业版` 继续登记为未来动作，但在没有真实商品和 Premium capability 前默认隐藏。

## 2. UI ownership 与边界

`apps/opendesk/script-runner-simple.js` 的职责是产品启动适配。正式发行产品已经由 `apps/opendesk` 持有 App Mode 主窗口、Script Runner 与产品动作。

三类职责必须保持分离：

```text
App Shell
- Tray / Menu Bar
- opendesk.open
- main window lifecycle
- single instance
- Recorder / Quit system actions

Generic Script Runner controller
- script discovery / ordering
- Run / Run Selected / Stop
- list / empty / error state
- child recipe process

Official Shell
- first-position homepage brand action
- official action metadata
- operational config policy
- single-source homepage bridge to System.product.website
- placeholder result
- HTTPS-only external navigation
```

Product composition 只把 Generic Runner 与 Official Shell 组合在一起。Official Shell 不知道 Run/Stop 状态机；Generic Runner controller 不知道 Marketplace、VIP、License、OEM 或其他商业策略。

`examples/custom-ui/script-runner-simple.js` 继续是学习/API 示例，不注入 `opendesk.*` 官方动作。

## 3. Product Runner toolbar

P0 使用 **同一个** FloatingWindow，不创建第二套 toolbar：

```text
[OpenDesk] │ [运行] [停止] [当前脚本] [列表] │ [定制] [帮助]
```

说明：FloatingWindow 的按钮主体由图标表达，`label` 用于 tooltip/Accessibility；上图表示业务语义与顺序，而不是要求渲染成 HTML 文字按钮。

规则：

- Run / Stop / 当前脚本 / 列表是高频核心业务能力；
- OpenDesk Logo 固定在第一位，作为无额外内边距的原色 image button，在 40pt 点击区内 `aspect-fit` 铺满；
- Logo 是有 tooltip / Accessibility name / callback 的原生 icon button，不是装饰图片；
- 定制 / 帮助位于右侧 secondary group；
- 使用现有 `addSeparator()` 做真实分组；
- 产品层只小幅提高 toolbar `maxWidth`，不改变通用 Example；
- Help / Customize 不跟随 recipe running state disabled；
- Marketplace / Upgrade 不加入当前 toolbar。

## 4. 主窗口与 App Mode 生命周期

`opendesk.app.json` 的稳定契约为：

```text
window.mainId = "main"
window.closeBehavior = "hide"
tray.primaryAction = "opendesk.open"
```

Product Runner 把自己的 Script Runner list 创建为 `id = "main"`。因此系统 `opendesk.open` 直接显示/聚焦现有列表窗口，不需要把 Open 动作重写为业务 `runner.open`，也不会因为点击 Tray 再创建 Runner、Execution 或 toolbar。

Manifest 不再声明重复的 `runner.open / 打开 Script Runner` 菜单项。P0 `menuMode=merge` 下继续由 App Shell 保留系统 Open/Show、Recorder 与 Quit。

产品启动时由 composition root 主动打开 Runner list，所以体验是：

```text
launch OpenDesk
-> Product Runner toolbar
+  Product Runner list/main
```

而不是：

```text
launch
-> Demo panel
-> click "打开 Script Runner"
-> Runner
```

## 5. Official Action namespace

官方入口使用：

```text
opendesk.home
opendesk.help
opendesk.customize
opendesk.marketplace
opendesk.upgrade
```

`opendesk.*` 是 OpenDesk 保留 namespace。用户业务 action、Recipe action 与未来 extension action 不得借用该 namespace。

未来第三方扩展继续建议区分：

```text
opendesk.*                        official
app.<package>.*                   application
extension.<publisher>.<plugin>.* extension
```

## 6. 产品身份与官方配置文件

官网对普通脚本仍表现为 Runtime-owned、只读产品身份：

```js
System.product.website
```

Script Runner 与 Recorder 都必须读取该值，不得各自维护 URL literal。官网不进入用户环境变量或 `opendesk.app.json`；它的唯一明文 source 与其他官方 action 一样位于 `configs/official-actions.json`，Runtime 从嵌入的生成资源派生 `System.product.website`。

Home / Help / Customize / Marketplace / Upgrade 的唯一明文维护源是：

```text
configs/official-actions.json
```

维护者修改它后，由官方发行调用方显式运行：

```bash
./dist/opendesk config compile \
  --input configs/official-actions.json \
  --output apps/opendesk/assets/official-actions.odcfg
```

生成发行资源：

```text
apps/opendesk/assets/official-actions.odcfg
```

由 `apps/opendesk/official-shell.js` 自动读取。生成配置只保存少量随发行产品调整的 policy：

- action 是否显示；
- action 的 HTTPS 目标 URL。

其中 `home` 必须可见且 URL 非空。Runtime bootstrap 解码嵌入的同一生成资源，将其 URL 安装为冻结的 `System.product.website`；Official Shell 从 AppMode staging 资源加载后校验 home URL 与该投影一致，不一致时 fail closed。这样属性兼容层不会形成第二个可漂移 source。

显示名称、动作 ID 与核心 fallback 仍由 release-owned code 定义。

`official-shell.js` 是 Runtime 组件名；`official-actions` 是它读取的运营数据 basename。两者不再共用文件名，避免把只含动作可见性/URL 的配置误解成完整 Shell、产品身份或 App Manifest。文件改名不产生新的 wire format；`ODCFG1` 与既有编解码 key 保持兼容。

`official-actions` 继续作为稳定 basename：它对应 `opendesk.*` action 的运行 policy。`app-config` 会与 `opendesk.app.json` 混淆，`app-info` 会误导为静态 metadata，而 `links` 又无法表达 URL 为空但 action 仍 pending、以及 visibility policy 的语义。这个文件名不应继续泛化；新增产品身份或 App 配置应进入各自 owner。

维护者可以直接查看保护产物并检查 freshness：

```bash
./dist/opendesk config inspect \
  --input apps/opendesk/assets/official-actions.odcfg
./dist/opendesk config verify \
  --input configs/official-actions.json \
  --output apps/opendesk/assets/official-actions.odcfg
```

`inspect` 对 `.odcfg` 完成格式、checksum 与 schema 验证后在 `result.config` 返回有效内容；`verify` 同时解析唯一明文 input，并要求 output 与其确定性编码逐字节一致，因此“保护文件合法但内容过期”也会失败。两者都不启动 Runtime 或执行发行 staging。

### 6.1 三阶段合同

```text
config compile
--input <file.json> [--output <file.odcfg>]
        |
        | independent Runtime consumption
        v
Runtime load
official-shell.js -> protected/plaintext/built-in selection
        |
        | independent release tooling consumption
        v
release staging
generated .odcfg -> macOS / Windows App Mode payload
```

`./dist/opendesk config compile` 要求显式 `--input`。省略 `--output` 时，在 input 同目录生成同 basename 的 `.odcfg`；显式 output 时只写指定文件。编译器没有官方产品 input/output 默认值，每次只做单个 JSON 到单个 `.odcfg` 的确定性、原子转换，并拒绝同一 input/output 与错误扩展名。它不构建 `.app` 或 Windows distribution、不执行 App Mode staging，也不运行测试。源码构建、Runtime 加载和最终发行检查各自保留独立证据。

### 6.2 P0 保护级别

当前 `.odcfg` 使用：

```text
version header
+ checksum
+ reversible payload obfuscation
```

目标仅是降低普通复制模板后随手修改官方入口的便利性，并发现误编辑。它不是密码学安全边界，不存储 token、License key、密码、私钥或其他 secret，也不宣称抵抗反编译。

需要更强 publisher policy 后再升级为：

```text
signed official config
+ embedded public key
+ immutable built-in fallback
```

P0 不实施 DRM、anti-tamper、remote entitlement、anti-debug 或 anti-hook。

### 6.3 核心运营入口不可由配置隐藏

`home`、`help` 与 `customize` 在 schema validation 中必须保持 `visible=true`，且 `home` 必须提供非空 HTTPS URL。配置不存在、损坏、checksum/schema 无效、试图隐藏核心运营入口或 staging home 与 `System.product.website` 不一致时，使用内置 fallback：

```text
官网       visible=true, URL=""
帮助       visible=true, URL=""
定制       visible=true, URL=""
商店       visible=false, URL=""
专业版     visible=false, URL=""
```

fallback 的 home URL 为空，因此损坏或不一致的 staging 资源不能继续打开官网；`System.product.website` 仍是 Runtime 从构建时嵌入的生成资源提供的只读兼容投影。

### 6.4 多后缀加载与反降级

固定 basename `assets/official-actions` 按以下顺序加载：

```text
official-actions.odcfg 存在且合法   -> 使用 .odcfg
official-actions.odcfg 存在但损坏   -> 使用内置 fallback，不读 sibling JSON
official-actions.odcfg 不存在       -> 开发态可读 sibling official-actions.json
两者都不存在                        -> 使用内置 fallback
```

正式发行 payload 只包含生成后的 `.odcfg`，不包含 `configs/official-actions.json` 或 sibling 明文配置。旧 `official-shell.{json,odcfg}` 不参与兼容加载，避免长期出现第二套来源。

## 7. URL、pending 与 notify

P0 的 `System.product.website` 从配置中的 home URL 派生，当前指向 canonical public repository 的 `#home` 入口；其余 action 当前也用同一仓库的不同锚点作为有效 HTTPS 目标。schema 仍允许 Help/Customize URL 为空并表现为 pending。

URL 为空时：

```text
click toolbar secondary action
-> OfficialShell.activate(...)
-> status = pending
-> Product Runner 调用 ui.notify(message)
-> 不打开浏览器
-> 不创建额外窗口
```

当前 placeholder：

```text
帮助中心待开放。
定制自动化服务待开放。
```

如果 `ui.notify()` 本身失败，Product Runner 才回落到既有 Runner list/status surface。

配置真实 URL 后只接受 `https://...`，并调用操作系统默认 handler。拒绝 `javascript:`、`file:`、`shell:` 与任意其他 protocol。

正式运营时推荐使用稳定 redirect endpoint，例如：

```text
/go/help/desktop
/go/customize/desktop
/go/store/desktop
/go/pro/desktop
```

## 8. 商业化顺序

```text
P0  定制自动化 / 实施 / 支持
    -> 最短现金流路径

P1  Marketplace
    -> Recipe / Plugin / Template / Service

P2  Pro / Business
    -> 只有明确 Premium capability 后展示升级入口

P3  OEM / White-label
    -> 品牌、官方入口和发布策略成为可授权能力
```

暂不优先增加充值/余额/金币。只有出现明确计量型云成本后，再设计 Credits / Billing。

## 9. 与 `.odpkg` 的关系

Official Shell 不承担商业 Recipe 的源码保护和 License。未来 Marketplace 中的商业 Recipe 继续复用 Protected Recipe Package：

```text
Marketplace purchase / entitlement
        |
        v
.odpkg
        |
        v
existing protected package loader
        |
        v
existing Execution Runtime
```

Official Shell 只负责产品导航，不复制 `.odpkg` 的加密、签名、License、ContentKeyProvider 或执行逻辑。

## 10. White-label / OEM 边界

未来可以把移除/替换官方品牌定义为明确商业 entitlement：

```text
Community / standard distribution
-> Official Shell retained

OEM / white-label entitlement
-> custom brand / links / official-entry policy
```

P0 只预留这一方向，不实现 License gate，也不把当前轻量 `.odcfg` 描述为 OEM 防绕过方案。

## 11. 当前文件地图

```text
polyfills/000-systemBase.js
└── freeze native System.product.{id,name,website}

configs/official-actions.json
└── Home / Help / Customize / Marketplace / Upgrade 唯一明文 URL 维护源

internal/officialassets/**
└── generated official-actions.odcfg -> native System.product.website

pkg/officialconfig + internal/configcli
└── deterministic ODCFG1 compile / decode / validation

apps/opendesk/
├── main.js
│   └── composition root；不创建 Demo UI
├── official-shell.js
│   ├── config + fallback
│   ├── reserved action metadata
│   ├── HTTPS URL policy
│   └── activation
├── assets/
│   └── official-actions.odcfg
├── script-runner-simple.js
│   └── Product Runner composition / main-window mapping / secondary actions
├── script-runner/
│   └── controller.js             <- shared generic Runner behavior
└── opendesk.app.json

workflows/official-product-config/
└── README + manage-official-product-config Skill
```

`apps/opendesk/script-runner-simple.js` 继续作为产品启动适配器，不成为商业动作与 controller 的 owner。

## 12. P0 验收

- 启动 App 后不再出现 Demo/欢迎主面板；
- Product Runner toolbar 与 list 直接出现；
- OpenDesk 原色 Logo 是首个 image button，无额外内边距地等比铺满 40pt 点击区；
- Logo 点击打开配置中的 `opendesk.home`（与只读 `System.product.website` 投影一致），且不改变 recipe 状态；
- Runner list 的稳定 window ID 为 `main`；
- App Shell `opendesk.open` 显示/聚焦同一个 `main`；
- Tray 不重复显示“打开 OpenDesk / 打开 Script Runner”；
- 不因 Open 创建第二 Runner、toolbar 或主 Execution；
- Help/Customize 是同一 Runner toolbar 的 secondary actions；
- recipe running 时 Help/Customize 仍可用；
- URL 为空时通过 `ui.notify()` 显示明确 pending；
- 非空 URL 必须为 HTTPS；
- 用户 Recipe 排序配置 `.opendesk-runner.json` 与 Official Shell 配置完全分离；
- 不声称轻量配置能够抵抗逆向或替代 `.odpkg` / License 体系。

## 13. 当前状态边界

```text
Implemented
- 官方主窗口与 OpenDesk 服务区
- opendesk.home / opendesk.help / opendesk.customize 核心入口
- .odcfg 读取、校验、fallback 与 pending 占位反馈
- HTTPS URL 的平台 handler 调用

Required verification
- 配置解析、生成 freshness 与反降级自动化测试
- 当前源码匹配构建的 macOS App Mode 主窗口、Logo、Help/Customize 和 Recorder 真实点击
- 发行 payload 只包含生成后的 .odcfg
- 退出后 OpenDesk 主进程与 UI host 清理

Reserved
- opendesk.marketplace / opendesk.upgrade（当前 visible=false）

Future
- signed remote config、Shell.openExternal() Runtime API、Marketplace/Pro、OEM/white-label
```

历史截图不能自动升级为当前构建的通过证据；Windows cross-build/package layout 也不等同于 Windows 真机 UI 验证。

- Marketplace / Upgrade 默认隐藏；
- Generic Runner controller 与 Official Shell policy 分离；
- Recorder / Quit / single-instance 继续由 App Shell owner 保持。
