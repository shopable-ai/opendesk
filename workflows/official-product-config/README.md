# Official Product Config 工作流

本工作流维护 OpenDesk 官方产品身份与产品运营入口，解决“官网、帮助、定制、商店、专业版等入口以后修改时容易重复硬编码、漏改、忘记重新生成发行资源”的问题。

它不是普通用户配置，也不是 App Mode package 的 `opendesk.app.json` 配置；不要把官方品牌地址、帮助地址或商业入口重新塞进用户可编辑 Manifest。

## 固定模型

```text
Runtime-owned product identity
System.product.website
        |
        +--> Script Runner Logo / 官网
        +--> Recorder Logo / 官网

Publisher-owned operational source
configs/official-shell.json
        |
        | opendesk config compile
        v
apps/opendesk/assets/official-shell.odcfg
        |
        +--> opendesk.help
        +--> opendesk.customize
        +--> opendesk.marketplace
        +--> opendesk.upgrade
```

### 1. 官网是产品身份

官网不是用户配置项，也不进入 `.odcfg`。

当前 Runtime 通过：

```js
System.product.website
```

提供统一值。Script Runner、Recorder 或以后新增的官方品牌入口都必须读取该值，不得再次写死 URL。

修改官网时，应修改 Runtime-owned product identity，并同时更新 API/架构文档和相应测试；不要只修改某个 UI 文件。

### 2. 帮助/定制等是运营配置

可随发行调整的入口只编辑明文源文件：

```text
configs/official-shell.json
```

当前 action：

```text
help
customize
marketplace
upgrade
```

其中 `help`、`customize` 是核心入口，不能由配置隐藏；`marketplace`、`upgrade` 在真实产品能力上线前保持隐藏。

明文源文件是开发/维护输入，不是发行资源。

### 3. 发行资源必须由 CLI 生成

修改 `configs/official-shell.json` 后，从仓库根目录执行：

```bash
make build
./dist/opendesk config compile
```

等价的源码开发入口可以使用：

```bash
go run ./cmd/opendesk config compile
```

默认输入和输出：

```text
configs/official-shell.json
    -> apps/opendesk/assets/official-shell.odcfg
```

需要临时路径时可以显式指定：

```bash
./dist/opendesk config compile \
  --source /path/to/official-shell.json \
  --target /path/to/official-shell.odcfg
```

不要手工编辑 HEX payload 或 checksum。

## Runtime 加载优先级

Official Shell 的加载顺序固定为：

```text
1. official-shell.odcfg
2. sibling official-shell.json（仅当 .odcfg 不存在时用于开发/诊断）
3. built-in fallback
```

反降级规则：如果 `.odcfg` 已存在但损坏、schema 不合法或 checksum 不匹配，不允许静默改读旁边的明文 `.json`；直接使用内置 fallback 并记录错误。

正式 distribution 只应携带需要的 `.odcfg` 资源，不应把 `configs/official-shell.json` 作为 AppMode payload 一起发布。

## URL 约束

运营 URL：

- 只能是 `https://...`；
- 可以为空，表示入口保留但当前 pending；
- 不允许 `file:`、`javascript:`、`shell:` 等协议；
- 正式运营建议指向稳定 redirect endpoint，而不是把最终 CRM/文档/商店页面散落硬编码到桌面客户端。

`.odcfg` 当前是轻量混淆 + checksum，用来降低随手修改成本并检测误编辑；它不是 secret store、DRM 或密码学签名。不得放 token、License key、密码、私钥或其他 secret。

## 每次修改的固定检查

修改官网时：

```text
System.product.website
-> Script Runner 读取统一值
-> Recorder 读取统一值
-> API / architecture docs
-> runtime/product tests
```

修改帮助/定制/商店/专业版 URL 时：

```text
configs/official-shell.json
-> opendesk config compile
-> official-shell.odcfg diff
-> Official Shell parser tests
-> App Mode / distribution payload check
```

新增一个官方 action 时，不允许只改 JSON。至少同步检查：

```text
action definition
+ config schema / validator
+ plaintext source
+ generated .odcfg
+ product UI placement
+ tests
+ docs
```

## 验收边界

一次完整修改至少区分以下层级：

- source validation：明文 JSON schema、HTTPS、核心 action 可见性；
- compile validation：CLI 成功且生成内容可 decode；
- runtime validation：Official Shell 能读取 `.odcfg`，失败时 fail closed；
- product integration：Script Runner / Recorder 不存在重复官网硬编码；
- distribution validation：macOS / Windows AppMode payload 含 `.odcfg` 且不含维护用明文 source；
- live UI：真实点击 Logo / Help / Customize 后行为符合当前配置。

没有实际执行的层级必须写 `not run`，不能用“配置完成”代替 UI 或 distribution 验收。

## Skill

重复维护时直接使用：

```text
$manage-official-product-config
```

入口：[`skills/manage-official-product-config/SKILL.md`](skills/manage-official-product-config/SKILL.md)。
