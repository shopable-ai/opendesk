# OpenDesk Official Shell 与商业入口

> 状态：P0 implemented；本地真实 UI 仍以当次验收证据为准  
> 日期：2026-09-12  
> 适用范围：`apps/opendesk` 官方 App Mode 产品包  
> 维护入口：`workflows/official-product-config/README.md`

## 1. 最终产品关系

OpenDesk 当前正式默认用户 UI 是 Product Script Runner，不在它前面保留 Demo/欢迎主面板。

```text
OpenDesk App Shell / Host
        |
        | opendesk.open -> show/focus window "main"
        v
Product Script Runner
- opendesk.home                  <- Runtime-owned product identity
- Run / Stop
- current script
- script list
        |
        +-- Official Shell operational actions
            - opendesk.customize
            - opendesk.help
            - opendesk.marketplace   (reserved/hidden)
            - opendesk.upgrade       (reserved/hidden)
```

P0 对外显示：

- 官网：首位 OpenDesk Logo；
- 定制：定制自动化与商业服务入口；
- 帮助：帮助、文档、反馈、支持入口。

`商店` 与 `专业版` 已保留 action identity，但在没有真实商品和 Premium capability 前默认隐藏。

## 2. 最重要的单一来源规则

官方产品入口分成两类，不能再混在同一个可编辑配置里。

### 2.1 官网属于 Runtime-owned product identity

统一入口：

```js
System.product.website
```

当前 Runtime identity 由 `polyfills/000-systemBase.js` 安装为只读对象：

```js
System.product.id
System.product.name
System.product.website
```

`System.product` 以及它的字段均不可由普通脚本替换或修改。

规则：

- Script Runner Logo 必须读取 `System.product.website`；
- Recorder Logo 必须读取 `System.product.website`；
- 以后新增的官方品牌按钮也必须读取该值；
- 官网不得重新写入 `opendesk.app.json`；
- 官网不得写入 `official-shell.odcfg`；
- 不允许各 UI 自己维护一份 URL literal。

这是为了让以后换域名只修改产品身份定义和对应测试，而不是寻找散落的 Script Runner / Recorder 常量。

### 2.2 Help / Customize 等属于 publisher-owned operational config

维护源：

```text
configs/official-shell.json
```

当前 schema 只允许：

```text
help
customize
marketplace
upgrade
```

其中：

- `help`、`customize` 必须保持 `visible=true`；
- `marketplace`、`upgrade` 可以隐藏；
- URL 为空表示当前入口保留但业务尚未开放；
- URL 非空必须是 HTTPS。

`home` 如果出现在这个 source 中必须被 validator 拒绝，因为它已经由 `System.product.website` 持有。

## 3. 配置编译链

维护者只编辑：

```text
configs/official-shell.json
```

然后执行：

```bash
make build
./dist/opendesk config compile
```

开发态可直接：

```bash
go run ./cmd/opendesk config compile
```

默认输出：

```text
apps/opendesk/assets/official-shell.odcfg
```

实现分层：

```text
internal/configcli
    -> CLI: opendesk config compile

pkg/officialconfig
    -> source schema validation
    -> deterministic ODCFG1 encoding / decoding
    -> checksum
    -> file compile
```

不要手工编辑 ODCFG HEX/checksum。CLI 是唯一正常生成入口。

## 4. ODCFG1 的真实安全边界

当前 ODCFG1 使用：

```text
version header
+ reversible XOR obfuscation
+ checksum
```

它的目标是：

- 降低普通用户随手修改官方运营入口的便利性；
- 检测误编辑和明显损坏；
- 避免发行资源直接以明文 JSON 呈现。

它不是：

- secret store；
- publisher signature；
- DRM；
- anti-debug；
- anti-reverse-engineering；
- License / entitlement system。

因此 `.odcfg` 中不得保存 token、密码、License key、私钥或其他 secret。

未来确实需要抵抗恶意配置替换时，独立升级到 publisher-signed config，例如：

```text
canonical payload
+ Ed25519 signature
+ embedded public key
+ immutable built-in fallback
```

不要为了一个 URL 修改提前引入完整 DRM 或远程授权体系。

## 5. Runtime 加载优先级与反降级

`apps/opendesk/official-shell.js` 的加载优先级固定为：

```text
1. assets/official-shell.odcfg
2. sibling assets/official-shell.json（只在 .odcfg 不存在时作为开发/诊断入口）
3. built-in fallback
```

关键规则：

```text
.odcfg exists but invalid
-> fallback
-> DO NOT silently load sibling plaintext JSON
```

这样避免“保护文件被破坏后自动降级到更容易替换的明文配置”。

正式 distribution 应包含 `.odcfg`，不应把仓库维护源 `configs/official-shell.json` 一起打入 AppMode payload。

## 6. Official Action namespace

保留 action：

```text
opendesk.home
opendesk.help
opendesk.customize
opendesk.marketplace
opendesk.upgrade
```

`opendesk.*` 是官方 namespace。业务 App 和 Extension 不得占用。

推荐区分：

```text
opendesk.*                        official
app.<package>.*                   application
extension.<publisher>.<plugin>.* extension
```

## 7. UI ownership

```text
App Shell
- Tray / Menu Bar
- main window lifecycle
- single instance
- Recorder / Scheduler / Quit system actions

Generic Script Runner controller
- script discovery / ordering
- Run / Stop
- list / empty / error state
- child recipe process

Official Shell
- official action metadata
- operational config loading
- HTTPS-only external navigation
- pending/unavailable result
- homepage action bridged to System.product.website
```

Product composition 把 Generic Runner 与 Official Shell 组合起来。Generic Runner 不应该知道 Marketplace、License、VIP 或 OEM；Official Shell 不应该接管 Run/Stop 状态机。

## 8. Product Runner toolbar

P0 使用同一个 FloatingWindow：

```text
[OpenDesk] │ [运行] [停止] [当前脚本] [列表] │ [定制] [帮助]
```

规则：

- OpenDesk Logo 固定在第一位；
- Logo 是真实 native icon button，有 tooltip、Accessibility name 和 callback；
- Logo 点击只做品牌导航，不改变 recipe running state；
- 定制 / 帮助是 secondary group；
- Marketplace / Upgrade 当前不加入 toolbar；
- Help / Customize 不跟随 recipe running state disabled。

## 9. URL、pending 与外部打开

运营配置只接受：

```text
https://...
```

拒绝 `file:`、`javascript:`、`shell:` 等协议。

Help/Customize URL 为空时：

```text
click
-> OfficialShell.activate(...)
-> status = pending
-> ui.notify(message)
-> 不打开浏览器
```

当前 placeholder：

```text
帮助中心待开放。
定制自动化服务待开放。
```

正式运营推荐稳定 redirect endpoint，例如：

```text
/go/help/desktop
/go/customize/desktop
/go/store/desktop
/go/pro/desktop
```

这样最终文档站、CRM、商城或活动页变更不要求重新发布桌面客户端。

## 10. 商业化顺序

```text
P0  定制自动化 / 实施 / 支持
    -> 最短现金流路径

P1  Marketplace
    -> Recipe / Plugin / Template / Service

P2  Pro / Business
    -> 有明确 Premium capability 后再显示升级入口

P3  OEM / White-label
    -> 品牌、官方入口和发布策略成为可授权能力
```

暂不优先增加充值/余额/金币。只有出现明确计量型云成本后，再设计 Credits / Billing。

## 11. 与 .odpkg 的关系

Official Shell 只负责产品导航，不复制 `.odpkg` 的加密、签名、License、ContentKeyProvider 或执行逻辑。

```text
commercial Recipe
-> protected package (.odpkg)
-> protected package loader / entitlement
-> existing Execution Runtime
```

这与官网/帮助/定制入口配置是两个独立问题。

## 12. 文件地图

```text
polyfills/000-systemBase.js
└── System.product.{id,name,website}

configs/official-shell.json
└── publisher-owned plaintext source

pkg/officialconfig/
└── schema + ODCFG1 compiler/decoder

internal/configcli/
└── opendesk config compile

apps/opendesk/
├── main.js
├── official-shell.js
├── assets/
│   └── official-shell.odcfg
├── script-runner-simple.js
└── recorder/

workflows/official-product-config/
└── README + manage-official-product-config Skill
```

## 13. 固定维护流程

修改官网：

```text
System.product.website
-> search duplicate literals
-> Runtime/API tests
-> Script Runner smoke
-> Recorder smoke
-> distribution check
```

修改 Help / Customize / Marketplace / Upgrade：

```text
configs/official-shell.json
-> opendesk config compile
-> generated .odcfg
-> parser/compiler tests
-> AppMode payload check
-> relevant UI smoke
```

新增官方 action：

```text
action definition
+ config schema
+ plaintext source
+ generated payload
+ UI placement
+ tests
+ docs
```

不允许只改 JSON 或只改某一个 UI。

## 14. P0 验收

至少验证：

- `System.product.website` 可读且不可被脚本替换；
- Official Shell 的 `opendesk.home` 来自 `System.product.website`；
- `configs/official-shell.json` 不允许 `home`；
- `opendesk config compile` 可以确定性生成 `.odcfg`；
- `.odcfg` checksum/schema 无效时 fail closed；
- `.odcfg` 存在但无效时不降级到 sibling plaintext；
- Help/Customize 不能被配置隐藏；
- URL 非空时只能 HTTPS；
- Script Runner 与 Recorder 不再分别维护官网 literal；
- macOS / Windows AppMode payload 都包含需要的 `.odcfg`；
- distribution 不包含仓库维护用 plaintext source；
- 真实点击 Logo / Help / Customize 的行为与当前配置一致。

未实际执行的 Windows/macOS live UI 验证必须写 `not run` 或 `not qualified`，不能由单元测试或 cross-build 代替。
