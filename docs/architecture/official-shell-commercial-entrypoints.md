# OpenDesk Official Shell 与商业入口

> 状态：P0 implemented；本地 macOS App Mode 已验证
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

P0 显示两个官方入口：

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
- official action metadata
- product URL/config policy
- placeholder result
- HTTPS-only external navigation
```

Product composition 只把 Generic Runner 与 Official Shell 组合在一起。Official Shell 不知道 Run/Stop 状态机；Generic Runner controller 不知道 Marketplace、VIP、License、OEM 或其他商业策略。

`examples/custom-ui/script-runner-simple.js` 继续是学习/API 示例，不注入 `opendesk.*` 官方动作。

## 3. Product Runner toolbar

P0 使用 **同一个** FloatingWindow，不创建第二套 toolbar：

```text
[运行] [停止] [当前脚本] [列表] │ [定制] [帮助]
```

说明：FloatingWindow 的按钮主体由图标表达，`label` 用于 tooltip/Accessibility；上图表示业务语义与顺序，而不是要求渲染成 HTML 文字按钮。

规则：

- Run / Stop / 当前脚本 / 列表是高频核心业务能力；
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

## 6. 官方配置文件

P0 文件：

```text
apps/opendesk/assets/official-shell.odcfg
```

由 `apps/opendesk/official-shell.js` 自动读取。配置只保存少量随发行产品调整的 policy：

- action 是否显示；
- action 的 HTTPS 目标 URL。

显示名称、动作 ID 与核心 fallback 仍由 release-owned code 定义。

### 6.1 P0 保护级别

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

### 6.2 核心入口不可由配置隐藏

`help` 与 `customize` 在 schema validation 中必须保持 `visible=true`。配置不存在、损坏、checksum/schema 无效或试图隐藏核心入口时，使用内置 fallback：

```text
帮助       visible=true, URL=""
定制       visible=true, URL=""
商店       visible=false, URL=""
专业版     visible=false, URL=""
```

## 7. URL、pending 与 notify

P0 的 Help/Customize URL 可以为空。

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
apps/opendesk/
├── main.js
│   └── composition root；不创建 Demo UI
├── official-shell.js
│   ├── config + fallback
│   ├── reserved action metadata
│   ├── HTTPS URL policy
│   └── activation
├── assets/
│   └── official-shell.odcfg
├── script-runner-simple.js
│   └── Product Runner composition / main-window mapping / secondary actions
├── script-runner/
│   └── controller.js             <- shared generic Runner behavior
└── opendesk.app.json
```

`apps/opendesk/script-runner-simple.js` 继续作为产品启动适配器，不成为商业动作与 controller 的 owner。

## 12. P0 验收

- 启动 App 后不再出现 Demo/欢迎主面板；
- Product Runner toolbar 与 list 直接出现；
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
- opendesk.help / opendesk.customize 核心入口
- .odcfg 读取、校验、fallback 与 pending 占位反馈
- HTTPS URL 的平台 handler 调用

Verified
- 配置解析与失败安全自动化测试
- macOS App Mode 主窗口、Help/Customize pending、Script Runner 打开/关闭/重开
- 退出动作后 OpenDesk 主进程与 UI host 结束

Reserved
- opendesk.marketplace / opendesk.upgrade（当前 visible=false）

Future
- signed remote config、Shell.openExternal() Runtime API、Marketplace/Pro、OEM/white-label
```

上述 `Verified` 仅表示当前本地构建的 macOS 证据；不等同于 Windows 真机 UI 验证，也不改变
未来能力的状态。

- Marketplace / Upgrade 默认隐藏；
- Generic Runner controller 与 Official Shell policy 分离；
- Recorder / Quit / single-instance 继续由 App Shell owner 保持。
