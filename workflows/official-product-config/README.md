# Official Product Config 工作流

本工作流维护 OpenDesk **publisher-owned、language-neutral** 的产品运营配置，当前包括官网、帮助、定制、商店、专业版等官方入口的可见性与 HTTPS 目标。

它不是普通用户配置，也不是 App Mode package manifest，更不是多语言文案文件。

## 固定模型

```text
App package manifest
apps/opendesk/opendesk.app.json
        -> App Mode package / tray / menu / lifecycle

Publisher-owned product config
configs/product.json
        |
        | opendesk config compile
        v
apps/opendesk/assets/product.odcfg
        |
        +--> System.product.website
        +--> opendesk.home
        +--> opendesk.help
        +--> opendesk.customize
        +--> opendesk.examples
        +--> opendesk.api-docs
        +--> opendesk.marketplace
        +--> opendesk.upgrade

Localized UI copy (future)
locale / i18n provider
        -> Script Runner windowTitle
        -> Recorder windowTitle
        -> labels / placeholders / messages
```

## 为什么叫 `product.json`

仓库已经存在 `apps/opendesk/opendesk.app.json`，它是真正的 App package manifest，因此不能再使用含义过宽且容易冲突的 `app.json` / `app-config.json`。

`configs/product.json` 表示 OpenDesk 自身的产品级、发行方拥有的静态运营配置。当前 schema 包含 `actions`、可选 `analytics`，以及可选 `flowDistribution`。`flowDistribution` 只保存语言无关的发布网络前缀、resolver 选择和公开 Release trust roots；具体 Marketplace 安装协议与 Release 合同仍由 `docs/architecture/execution/flow-marketplace.md` 维护。

边界必须保持：

- `opendesk.app.json`：App 包身份、入口、菜单、生命周期等 App Mode manifest；
- `configs/product.json`：语言无关、publisher-owned、随发行维护的产品运营配置；
- locale/i18n：用户可见且需要翻译的窗口标题、按钮标签、提示语、错误文案；
- secret：不属于上述任一明文配置，应使用专门的 secret/credential 机制。

不要因为文件名叫 `product.json` 就把所有产品设置塞进去。职责明显不同的配置应拆 owner/schema，而不是把它变成新的 catch-all。

## 多语言边界

`configs/product.json` **不得保存可翻译 UI 文案**。例如下面内容都不应写入：

```text
"Script Runner"
"Recorder"
"帮助"
"定制"
窗口 title / label / placeholder / toast / dialog message
```

Script Runner 与 Recorder 的窗口创建代码应暴露语义化 `windowTitle` 注入点，并提供当前英文 fallback：

```text
OpenDesk — Script Runner
OpenDesk — Recorder
```

未来增加 `locales/en-US.json`、`locales/zh-CN.json` 或统一 i18n provider 时，只替换文案提供层，不需要重新设计窗口生命周期或 `product.json` schema。

## 唯一产品 URL source

唯一明文维护源：

```text
configs/product.json
```

当前 action：

```text
home
help
customize
examples
apiDocs
marketplace
upgrade
```

约束：

- `home`、`help`、`customize`、`examples`、`apiDocs` 必须可见；
- `home` URL 必须为非空 HTTPS；
- 其他 URL 非空时也必须为 HTTPS；
- `marketplace`、`upgrade` 在真实能力上线前可保持隐藏；
- 不允许保存 token、License key、密码、私钥等 secret。

Runtime 从同一份生成资源派生只读兼容属性：

```js
System.product.website
```

Script Runner、Recorder、Tray 或其他官方品牌入口不得重新硬编码官网 URL。

## Flow 分发配置边界

`flowDistribution` 是可选产品配置。当前字段：

```text
resolver
metadataBaseUrl
artifactBaseUrl
releaseRoots
```

规则：

- production `metadataBaseUrl` / `artifactBaseUrl` 只接受公开网络上的 HTTPS 目录前缀；localhost、私有/链路本地地址和单标签内网主机必须拒绝；
- `artifactBaseUrl` 为空时由客户端沿用 metadata 前缀；
- `releaseRoots` 只保存公开 Ed25519 root，不保存私钥、token 或账号凭证；
- Deep Link、HTML、环境变量不能覆盖这些 production trust/network roots；
- 当前仓库没有正式生产发布地址和可信 root，因此维护源中不配置 `flowDistribution`，Native Marketplace client 明确 fail closed；
- 本地 loopback 例外由站点外的受限开发配置管理，不写回 `configs/product.json`。

静态 Release v2、同站点开发目录和安装安全边界只在 [Flow Marketplace 整体方案](../../docs/architecture/execution/flow-marketplace.md) 中维护，不在本工作流重复定义。

## 编译与验证

从仓库根目录：

```bash
./dist/opendesk config compile \
  --input configs/product.json \
  --output apps/opendesk/assets/product.odcfg

./dist/opendesk config inspect \
  --input apps/opendesk/assets/product.odcfg

./dist/opendesk config verify \
  --input configs/product.json \
  --output apps/opendesk/assets/product.odcfg
```

开发态也可以：

```bash
go run ./cmd/opendesk config compile \
  --input configs/product.json \
  --output apps/opendesk/assets/product.odcfg
```

`config compile` 仍是通用的“一个 JSON input -> 一个 `.odcfg` output”接口，不负责构建 `.app`、Windows distribution、App Mode staging 或测试。

ODCFG1 wire format 本轮没有变化。它只是可逆混淆 + checksum，不是 secret store、数字签名、DRM 或加密存储。

## Runtime 加载规则

Official Shell 固定 basename 为 `product`：

```text
1. product.odcfg exists + valid   -> protected bundle config
2. product.odcfg exists + invalid -> built-in fallback；禁止降级读取 plaintext
3. product.odcfg missing          -> sibling product.json 可用于开发/诊断
4. both missing                   -> built-in fallback
```

正式 distribution 只携带生成的 `apps/opendesk/assets/product.odcfg`，不携带维护源 `configs/product.json`。

旧 `official-actions.{json,odcfg}` 不保留兼容 fallback，避免形成第二配置源。

## 三阶段边界

```text
1. Source / compile
   configs/product.json -> apps/opendesk/assets/product.odcfg

2. Runtime load
   Official Shell + System.product.website consume the generated config

3. Release staging
   macOS / Windows App Mode payload includes product.odcfg only
```

前一阶段通过不代表后一阶段通过。

## 每次修改固定检查

```text
configs/product.json
-> config compile / inspect / verify
-> System.product.website derivation
-> flowDistribution schema / generated resource / native client construction
-> Official Shell parser / fallback tests
-> Script Runner / Recorder product integration
-> App Mode runtime-file manifest
-> macOS / Windows distribution payload
-> live UI（可执行环境可用时）
```

文件名迁移或 schema 变化时还必须搜索：

```bash
rg -n --hidden -g '!.git/**' 'official-actions|product\.odcfg|configs/product\.json' .
```

正常最终状态：旧 `official-actions` 文件路径和 loader basename 不再出现；若文档中作为“禁止/历史名称”提及，应明确标注为历史名称而不是有效路径。

## 窗口标题验收

产品 UI 至少确认：

```text
Script Runner default title = OpenDesk — Script Runner
Recorder default title      = OpenDesk — Recorder
```

并确认调用方能够通过 `windowTitle` 覆盖，未来 locale provider 不需要修改窗口控制器结构。

主 OpenDesk App Shell 自身仍可使用 `OpenDesk`，不要把每个窗口都强制改成同一个 feature title。

## 验收边界

必须分别报告：

```text
source validation
ODCFG compile / inspect / verify
Runtime load
System.product.website derivation
flowDistribution schema / generated resource / native client construction
Script Runner title / product actions
Recorder title / product actions
App Mode payload
macOS distribution
Windows distribution
live UI
```

没有实际执行的层级必须标记 `not run`，不得用源码检查替代真实构建或 UI 证据。

重复维护时使用：

```text
$manage-official-product-config
```

入口：[`skills/manage-official-product-config/SKILL.md`](skills/manage-official-product-config/SKILL.md)。
