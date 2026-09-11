# OpenDesk Official Shell 与商业入口

> 状态：P0 implemented baseline  
> 日期：2026-09-12  
> 适用范围：`apps/opendesk` 官方 App Mode 产品包  
> 相关设计：`docs/architecture/app-shell-tray-menu.md`、`docs/architecture/execution/protected-recipe-package.md`

## 1. 结论

OpenDesk 官方桌面产品采用三层 UI 所有权，而不是把所有按钮都交给用户 Recipe：

```text
OpenDesk App Shell / Host
        |
        v
Official Shell                 <- OpenDesk 官方保留入口
- opendesk.help
- opendesk.customize
- future: marketplace / upgrade
        |
        v
Application UI                 <- Script Runner / 用户应用业务动作
- run / stop / list / ...
        |
        v
Extension Actions              <- future plugin / extension actions
```

P0 首先提供两个始终可见的官方入口：

- **帮助**：帮助、文档、反馈、支持的统一入口；
- **定制**：定制自动化与商业服务入口。

`商店` 与 `专业版` 作为已登记的未来动作保留，但在没有真实商品和 Premium 能力前默认隐藏，避免把产品 UI 变成营销按钮集合。

这层能力属于 release-owned `apps/opendesk` 产品包，不属于 `examples/`，也不进入用户 Recipe 的 `.opendesk-runner.json` 排序配置。

## 2. 为什么不是继续修改 example

`examples/custom-ui/script-runner-simple.js` 的职责是公开示例与 API 演示。正式发行产品已经由 `apps/opendesk` 持有 App Mode 主窗口、Script Runner 与产品动作。

因此：

```text
examples/
= 学习、演示、验证

apps/opendesk/
= OpenDesk 官方发行产品
```

官方帮助、定制、商店、升级、品牌与未来账号入口只能进入产品层。这样用户 Recipe 可以自由扩展自己的业务按钮，而不会把官方产品入口与示例代码混为一体。

## 3. P0 UI 规则

默认主界面分成两个视觉区域：

```text
业务操作
- 打开 Script Runner
- 退出 OpenDesk

OpenDesk 服务
- 帮助
- 定制
```

核心原则：

- 高频业务动作与低频官方服务入口视觉分组；
- 不同时显示大量 `VIP / 充值 / 商店 / 插件 / 账户 / 反馈` 按钮；
- `帮助` 聚合文档、FAQ、反馈、社区与支持，不分别占用桌面入口；
- `定制` 面向早期现金流，未来目标页应直接进入需求收集/报价流程，而不是官网首页；
- `商店` 只有在存在可购买 Recipe / Plugin / Template / Service 后才显示；
- `专业版` 只有在存在明确 Premium capability 后才显示，不使用空洞 VIP 身份作为产品价值。

## 4. Official Action namespace

官方入口使用：

```text
opendesk.help
opendesk.customize
opendesk.marketplace
opendesk.upgrade
```

`opendesk.*` 是 OpenDesk 保留 namespace。用户业务 action、Recipe action 与未来 extension action 不得借用该 namespace。

P0 的“保留”主要由 release-owned 产品包所有权实现：普通 Recipe 和 Script Runner 数据配置没有修改 Official Shell 的接口。P0 **不声称**能够阻止用户直接修改源码、patch binary 或进行专业逆向。

未来如开放第三方 App 模板和插件，应继续区分：

```text
opendesk.*                        official
app.<package>.*                   application
extension.<publisher>.<plugin>.* extension
```

## 5. 官方配置文件

P0 文件：

```text
apps/opendesk/assets/official-shell.odcfg
```

由：

```text
apps/opendesk/official-shell.js
```

自动读取。

配置只保存少量需要随发行产品调整的 policy：

- action 是否显示；
- action 的 HTTPS 目标 URL。

显示名称、动作 ID 与核心 fallback 仍由 release-owned code 定义，避免普通配置把核心产品语义整体替换。

### 5.1 P0 保护级别

当前 `.odcfg` 使用：

```text
version header
+ checksum
+ reversible payload obfuscation
```

目标仅是：

- 不把 URL 以明文 JSON/INI 直接暴露给普通用户；
- 防止随手编辑造成静默错误；
- 降低直接复制模板后简单改 URL 的便利性；
- 保持实现成本极低。

它**不是**密码学安全边界，不用于存储 token、License key、密码、私钥或其他 secret，也不宣称抵抗反编译。

需要更强的 publisher policy 后，升级路线是：

```text
signed official config
+ embedded public key
+ immutable built-in fallback
```

而不是继续叠加自制加密算法。

### 5.2 核心入口不可由配置隐藏

`help` 与 `customize` 在 schema validation 中必须保持 `visible=true`。

如果配置：

- 不存在；
- 解码失败；
- checksum 错误；
- schema 无效；
- 试图隐藏核心入口；

Runtime 使用内置 fallback：

```text
帮助       visible=true, URL=""
定制       visible=true, URL=""
商店       visible=false, URL=""
专业版     visible=false, URL=""
```

因此删除或普通修改配置不会自然得到“无官方入口”的产品。

## 6. URL 与占位行为

P0 的帮助/定制 URL 可以为空。

URL 为空时：

```text
click
-> OfficialShell.activate(...)
-> status = pending
-> 主窗口显示“待开放”
-> 不打开虚假官网
```

配置真实 URL 后只接受：

```text
https://...
```

并调用操作系统默认 handler 打开浏览器。

正式运营时推荐配置稳定 redirect endpoint，例如：

```text
/go/help/desktop
/go/customize/desktop
/go/store/desktop
/go/pro/desktop
```

客户端只依赖稳定入口，真实落地页、客服系统、CRM、A/B Test 或区域页面由服务端 redirect 调整，从而减少客户端重新编译。

长期应把平台打开能力收敛为统一 Runtime API（例如 `Shell.openExternal()`）；P0 产品代码使用已有 `Command.run()` 做跨平台系统 handler 调用，不因此新增第二套 App Shell。

## 7. 商业化顺序

OpenDesk 当前优先顺序：

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

暂不优先增加“充值/余额/金币”。只有出现明确计量型成本，例如 AI、OCR 云服务、远程执行或其他云资源后，再设计 Credits / Billing。

## 8. 与 `.odpkg` 的关系

Official Shell 不承担商业 Recipe 的源码保护和 License。

未来 Marketplace 中的商业 Recipe 可以使用既有 Protected Recipe Package：

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

Official Shell 只负责入口和产品导航，不复制 `.odpkg` 的加密、签名、License、ContentKeyProvider 或执行逻辑。

## 9. White-label / OEM 边界

未来可以把移除/替换官方品牌定义为明确商业 entitlement：

```text
Community / standard distribution
-> Official Shell retained

OEM / white-label entitlement
-> custom brand / links / official-entry policy
```

P0 只预留这一产品方向，不实现 License gate，也不把当前轻量 `.odcfg` 描述为 OEM 防绕过方案。

## 10. 当前文件地图

```text
apps/opendesk/
├── main.js
│   └── 官方默认产品 UI，消费 Official Shell
├── official-shell.js
│   ├── 配置加载与 fallback
│   ├── reserved action metadata
│   ├── URL policy
│   └── action activation
├── assets/
│   └── official-shell.odcfg
├── script-runner-simple.js
└── script-runner/
    └── controller.js
```

`examples/custom-ui/script-runner-simple.js` 继续作为公开示例，不成为商业入口的 owner。

## 11. P0 验收

P0 完成必须满足：

- OpenDesk 官方主窗口显示 `帮助` 与 `定制`；
- 两个按钮与 Script Runner 业务按钮视觉分组；
- URL 为空时按钮仍可点击，并显示明确的“待开放”反馈；
- `.odcfg` 缺失或无效时使用 fallback，核心入口仍存在；
- 配置不能把帮助/定制设为隐藏；
- `marketplace` / `upgrade` 已登记但默认不显示；
- 非空 URL 必须为 HTTPS；
- 用户 Recipe 排序配置 `.opendesk-runner.json` 与 Official Shell 配置完全分离；
- 不声称轻量配置能够抵抗逆向或替代 `.odpkg` / License 体系。
