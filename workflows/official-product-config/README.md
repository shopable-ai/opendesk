# Official Product Config 工作流

本工作流维护 OpenDesk 官方产品身份与产品运营入口，解决“官网、帮助、定制、商店、专业版等入口以后修改时容易重复硬编码、漏改、忘记重新生成发行资源”的问题。

它不是普通用户配置，也不是 App Mode package 的 `opendesk.app.json` 配置；不要把官方品牌地址、帮助地址或商业入口重新塞进用户可编辑 Manifest。

## 固定模型

```text
Publisher-owned operational source
configs/official-actions.json
        |
        | opendesk config compile --input ... --output ...
        v
apps/opendesk/assets/official-actions.odcfg
        |
        +--> native System.product.website
        |       +--> Script Runner Logo / 官网
        |       +--> Recorder Logo / 官网
        |
        +--> opendesk.home
        +--> opendesk.help
        +--> opendesk.customize
        +--> opendesk.marketplace
        +--> opendesk.upgrade
```

## 为什么叫 `official-actions`

这个 basename 描述的是实际数据域：OpenDesk 保留的 `opendesk.*` action 中，Home / Help / Customize / Marketplace / Upgrade 的可见性和 HTTPS 目标。它不代表完整 Official Shell，也不包含产品名称、ID、窗口、菜单或普通 App Manifest。

- 不使用 `app-config.json`：它容易与普通 App Mode 的 `opendesk.app.json` 混淆，并暗示这里能配置整个 App；
- 不使用 `app-info.json`：它通常表示静态名称、版本、图标等 metadata，而这里是会影响运行行为的运营策略；
- 不改成 `links.json`：URL 可以为空且 action 仍保留为 pending，文件还拥有 `visible` policy，不只是链接清单。

因此继续使用 `official-actions.{json,odcfg}`。如果未来数据职责发生变化，应先拆 owner/schema，而不是靠更宽泛的文件名吸收更多配置。

### 1. 官网与官方按钮共享唯一 URL source

官网不是用户配置项，但与其他官方按钮 URL 一起进入生成的 `.odcfg`。唯一明文维护源是：

```text
configs/official-actions.json
```

其中 `home` 必须 `visible=true` 且包含非空 HTTPS URL。Runtime 从嵌入的生成资源派生兼容身份属性：

```js
System.product.website
```

Script Runner、Recorder 或以后新增的官方品牌入口都必须读取该值，不得再次写死 URL。`System.product.website` 是生成配置的只读投影，不是第二个可维护 URL source。

修改官网时应修改 `configs/official-actions.json`，重新生成 `.odcfg`，并同时更新/验证 Runtime identity、Official Shell、API/架构文档和相应测试；不要只修改某个 UI 文件。

### 2. 五个 action 的配置约束

可随发行调整的入口只编辑明文源文件：

```text
configs/official-actions.json
```

当前 action：

```text
home
help
customize
marketplace
upgrade
```

其中 `home`、`help`、`customize` 是核心入口，不能由配置隐藏；`home` URL 不能为空；`marketplace`、`upgrade` 在真实产品能力上线前保持隐藏。

明文源文件是开发/维护输入，不是发行资源。

### 3. 发行资源必须由 CLI 生成

修改 `configs/official-actions.json` 后，从仓库根目录执行：

```bash
./dist/opendesk config compile \
  --input configs/official-actions.json \
  --output apps/opendesk/assets/official-actions.odcfg
```

这是官方发行调用方对路径的显式选择，不是编译器内置默认。`config compile` 的合同只有“读取一个 JSON、写出一个 `.odcfg`”。它不构建 macOS `.app`、Windows distribution，不执行 App Mode 全量 staging，也不运行测试。需要确认 CLI 与当前源码一致时，可先独立执行 `make build`；这只是刷新命令行二进制。

等价的源码开发入口可以使用：

```bash
go run ./cmd/opendesk config compile \
  --input configs/official-actions.json \
  --output apps/opendesk/assets/official-actions.odcfg
```

通用 CLI 形式：

```bash
./dist/opendesk config compile --input <file.json> [--output <file.odcfg>]
```

`--input` 必填。省略 `--output` 时，只在 input 文件所在目录生成同 basename 的 `.odcfg`：

```bash
./dist/opendesk config compile --input /x/official-actions.json
# /x/official-actions.odcfg
```

显式 `--output` 时只写该文件，并自动创建其父目录。input 必须是 `.json`，output 必须是 `.odcfg`；二者不得是同一文件（包括硬链接别名）。命令不接受多个 input、位置参数或上述合同之外的参数名。输出通过同目录临时文件原子替换；输入、校验、写入或替换失败时不得留下半成品，也不得破坏已有 output。

不要手工编辑 HEX payload 或 checksum。

### 查看生成配置

直接解码并验证当前 `.odcfg`：

```bash
./dist/opendesk config inspect --input apps/opendesk/assets/official-actions.odcfg
```

输出是结构化 JSON；`result.config` 就是 Runtime 将接受的运营配置。checksum、ODCFG1 格式、schema、核心 action 可见性或 HTTPS URL 任一不合法时，命令以非零状态失败。

### 确认 input 与生成物一致

```bash
./dist/opendesk config verify \
  --input configs/official-actions.json \
  --output apps/opendesk/assets/official-actions.odcfg
```

该命令同时验证唯一明文 input 与保护 output，并要求 output 精确等于 input 的确定性编译结果。保护文件即使自身合法但内容已经落后，也会失败并提示重新运行 `config compile`。

自定义 inspect/verify 路径使用其只读命令自己的参数，不要套用到 compile：

```bash
./dist/opendesk config inspect --input /path/to/official-actions.odcfg
./dist/opendesk config verify \
  --input /path/to/official-actions.json \
  --output /path/to/official-actions.odcfg
```

## 三阶段边界

```text
1. config compile
   一个可读 JSON -> 一个 .odcfg

2. Runtime load
   Official Shell 按固定 basename 加载并执行 fail-closed policy

3. release staging
   macOS / Windows packaging 只消费已生成的 .odcfg
```

这三段是相邻合同，不是同一个命令。单文件编译不要求构建 `.app`；编译成功也不能替代 Runtime 加载或最终 payload 验收。

## Runtime 加载优先级

Official Shell 的加载顺序固定为：

```text
1. official-actions.odcfg
2. sibling official-actions.json（仅当 .odcfg 不存在时用于开发/诊断）
3. built-in fallback
```

反降级规则：如果 `.odcfg` 已存在但损坏、schema 不合法或 checksum 不匹配，不允许静默改读旁边的明文 `.json`；直接使用内置 fallback 并记录错误。

正式 distribution 只应携带需要的 `.odcfg` 资源，不应把 `configs/official-actions.json` 作为 AppMode payload 一起发布。旧 `official-shell.{json,odcfg}` 不作为兼容 fallback，以免形成第二个隐式配置源。

## URL 约束

运营 URL：

- 只能是 `https://...`；
- 除 `home` 外可以为空，表示入口保留但当前 pending；`home` 必须是非空 HTTPS URL；
- 不允许 `file:`、`javascript:`、`shell:` 等协议；
- 正式运营建议指向稳定 redirect endpoint，而不是把最终 CRM/文档/商店页面散落硬编码到桌面客户端。

`.odcfg` 当前是轻量混淆 + checksum，用来降低随手修改成本并检测误编辑；它不是 secret store、DRM 或密码学签名。不得放 token、License key、密码、私钥或其他 secret。

## 每次修改的固定检查

修改任一官网/帮助/定制/商店/专业版 URL 时：

```text
configs/official-actions.json
-> opendesk config compile
-> opendesk config inspect
-> opendesk config verify
-> System.product.website 派生值
-> Official Shell parser tests
-> Script Runner / Recorder product tests
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

配置编译器的主要证据是 Go tests、当前 OpenDesk CLI 与 Runtime 实际加载；`node --test` 形式的 host test 只能补充 JavaScript seam，不替代这些证据。

没有实际执行的层级必须写 `not run`，不能用“配置完成”代替 UI 或 distribution 验收。

## Skill

重复维护时直接使用：

```text
$manage-official-product-config
```

入口：[`skills/manage-official-product-config/SKILL.md`](skills/manage-official-product-config/SKILL.md)。
