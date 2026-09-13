---
name: manage-official-product-config
description: 维护 OpenDesk 官方官网、帮助、定制、商店、专业版等产品入口，统一 System.product.website 与 Official Actions 配置源，编译 official-actions.odcfg，并检查 Script Runner、Recorder 和发行 payload 是否遗漏或重复硬编码。用于“修改官网地址”“配置帮助/定制 URL”“重新生成 .odcfg”“检查官方按钮链接”“官方产品配置”等请求。
---

# 管理 OpenDesk 官方产品配置

通过 `$manage-official-product-config` 调用本 Skill。

目标是让官方产品入口保持单一来源、可编译、可验证、可发布，避免以后新增按钮或更换网址时只改某个 UI 文件而遗漏 Recorder、Script Runner、AppMode distribution 或文档。

## 开始前

先读取：

1. 根目录 `AGENTS.md`、当前 branch / HEAD / git status；有并行会话时重新取得最新 `master`，不得假设旧 SHA 仍有效。
2. [`workflows/official-product-config/README.md`](../../README.md)。
3. [`docs/architecture/official-shell-commercial-entrypoints.md`](../../../../docs/architecture/official-shell-commercial-entrypoints.md)。
4. `polyfills/000-systemBase.js`、`configs/official-actions.json`、`apps/opendesk/official-shell.js`。
5. 涉及 UI 时再读取 `apps/opendesk/script-runner-simple.js` 与 `apps/opendesk/recorder/`；涉及发行时再读取 AppMode packaging/distribution 脚本。

不要为了改一个 URL 扫描整个 Runtime，也不要重新设计 Recorder 或 Script Runner 状态机。

## 命名边界

固定 basename 使用 `official-actions`，因为文件只拥有 OpenDesk 官方 action 的 `visible` 与 HTTPS `url` policy：

- `official-shell` 会误导为完整 Runtime 组件配置；
- `app-config` 会与 `opendesk.app.json` / 普通 App Mode 配置混淆；
- `app-info` 会误导为静态产品 metadata；
- 泛化为 `links` 会遗漏 URL 为空时的 pending action 与 visibility policy。

不要为“更通用”而把产品名称/ID、App Manifest、窗口、菜单或 secret 塞入此文件。`home` 的 visible/URL policy 与其他官方 action 一样属于这里；只读 `System.product.website` 从生成资源派生，不是第二个 source。职责变化时优先拆 schema/owner，不用宽泛名称掩盖混合职责。

## 统一 URL source 与身份投影

### A. 官网 / 产品身份投影

官网 URL 的唯一明文 source 是 `configs/official-actions.json` 中的 `home`。Runtime 将其从嵌入的生成资源投影为：

```js
System.product.website
```

规则：

- Script Runner、Recorder、Tray 或以后新增的品牌按钮必须读取统一的 `System.product.website`；
- 不得在各 UI 文件重新写 `https://...`；
- 不进入 `opendesk.app.json`；
- `System.product.website` 不得再有独立 URL literal；
- `home` 必须 `visible=true` 且 URL 为非空 HTTPS；
- 修改后必须搜索旧 URL 和常量名，确认没有产品级重复来源。

### B. Home / Help / Customize / Marketplace / Upgrade

属于 publisher-owned operational config：

```text
configs/official-actions.json
```

规则：

- 只在明文 source 修改；
- `home`、`help`、`customize` 必须 `visible=true`；
- `marketplace`、`upgrade` 没有真实能力前保持隐藏；
- URL 非空时必须是 HTTPS；
- 不存 secret。

## 编译动作

通用单文件编译接口是：

```bash
./dist/opendesk config compile --input <file.json> [--output <file.odcfg>]
```

`--input` 必须明确传入。省略 `--output` 时，输出位于 input 同目录，并把最后的 `.json` 扩展名替换为 `.odcfg`；显式传入 `--output` 时只写指定文件。例如：

```bash
./dist/opendesk config compile --input /x/official-actions.json
# output: /x/official-actions.odcfg
```

CLI 每次只读取一个 `.json` input 并生成一个 `.odcfg` output；不接受内置产品路径、多个 input、位置参数或上述合同之外的参数名。input/output 必须是不同文件，缺失目录由编译器创建，发布 output 使用同目录临时文件原子替换，失败不得留下半成品或破坏已有 output。

它不会构建 macOS `.app`、Windows distribution、执行 App Mode staging 或运行测试。需要从当前源码刷新 CLI 后再验收时，先独立执行 `make build`；这是取得当前二进制的前置步骤，不是 `config compile` 的一部分。开发态也可直接执行：

```bash
go run ./cmd/opendesk config compile --input <file.json> [--output <file.odcfg>]
```

官方发行是调用方显式选择 input/output：

```bash
./dist/opendesk config compile \
  --input configs/official-actions.json \
  --output apps/opendesk/assets/official-actions.odcfg
```

输出格式为 `ODCFG1`。禁止手工维护 ODCFG HEX/checksum。CLI 失败时先修 input/validator/compiler，不要绕过生成器直接改 output。

生成后查看 Runtime 可接受的内容：

```bash
./dist/opendesk config inspect --input apps/opendesk/assets/official-actions.odcfg
```

确认明文 input 与生成 output 都合法且确定性内容一致：

```bash
./dist/opendesk config verify \
  --input configs/official-actions.json \
  --output apps/opendesk/assets/official-actions.odcfg
```

`inspect` 解码并校验 `.odcfg`；`verify` 还会比较 input 与 output，合法但过期的 output 也必须失败。两个命令都输出结构化 JSON，实际配置位于 `result.config`。它们是独立的只读维护命令，同样只使用 `--input` / `--output` 术语。

## 三阶段边界

必须分别处理和报告：

1. 配置单文件编译：`official-actions.json -> official-actions.odcfg`；
2. Runtime 配置加载：`official-shell.js` 按固定 basename 读取保护文件、开发态明文或内置 fallback；
3. 最终发行 staging：打包工具消费已经生成的 `.odcfg`，且排除明文 source。

前一阶段通过不代表后一阶段通过。不得为了验证单文件编译强制构建 `.app`，也不得把发行 staging 或 UI 结果表述成编译器行为。

## Runtime 读取规则

确认 `apps/opendesk/official-shell.js` 保持：

```text
.odcfg exists + valid   -> use protected bundle config
.odcfg exists + invalid -> built-in fallback, never downgrade to plaintext
.odcfg missing          -> sibling .json may be used for development
both missing            -> built-in fallback
```

`home` 必须属于 config action schema。Runtime 原生 `System.product.website` 从嵌入的同一生成资源派生；Official Shell 读取 staging 资源后还要校验两者一致，不一致时 fail closed，避免发布 payload 漂移。

## 搜索遗漏

每次修改后至少搜索：

```bash
git grep -n "https://github.com/shopable-ai/opendesk"
git grep -n "OPENDESK_HOMEPAGE_URL"
git grep -n "official-actions.odcfg"
git grep -n "official-actions.json"
git grep -n "official-shell.odcfg\|official-shell.json"
git grep -n "opendesk.home\|opendesk.help\|opendesk.customize\|opendesk.marketplace\|opendesk.upgrade"
```

允许唯一明文配置、文档或测试 fixture 出现预期 URL；Runtime identity 和产品 UI 业务文件出现新的官网 literal 默认视为第二来源，必须消除。

## 必测项

至少执行：

```bash
go test ./pkg/officialconfig ./internal/configcli ./automation
go test ./cmd/opendesk
make build
./dist/opendesk config compile --input configs/official-actions.json --output apps/opendesk/assets/official-actions.odcfg
./dist/opendesk config inspect --input apps/opendesk/assets/official-actions.odcfg
./dist/opendesk config verify --input configs/official-actions.json --output apps/opendesk/assets/official-actions.odcfg
```

随后验证生成文件可被当前 Official Shell 读取。仓库若已有更精确的 product/AppMode tests，优先追加而不是替换上述最小 gate。

不要把 `node --test` 作为配置编译器的主要验证方式。Go compiler/CLI tests、当前 OpenDesk CLI 编译和 Runtime 实际加载是主证据；host-side JavaScript test 如有运行只能作为补充。

涉及 Script Runner / Recorder 的改动，必须做真实 App Mode smoke：

```bash
./dist/opendesk -app "$PWD/apps/opendesk" -allow-recorder-capture -console-mode script
```

至少真实点击：

- Script Runner Logo；
- Recorder Logo；
- Help；
- Customize。

如果 Help/Customize URL 为空，正确行为是 pending/notify，不是打开空页面。

## Distribution 检查

正式发行前确认：

```text
AppMode payload contains apps/opendesk/assets/official-actions.odcfg
AppMode payload does not contain configs/official-actions.json
macOS and Windows resource staging are consistent
```

只完成 source/build 检查时不得声称 Windows/macOS live UI 已通过。

## 安全边界

ODCFG1 是低成本保护：

```text
version header + reversible obfuscation + checksum
```

它只能降低普通用户随手修改和误编辑成本。不要把它描述为加密 secret、签名配置、DRM 或防逆向。

需要抵抗恶意替换时，应单独升级为 publisher signed config（例如 Ed25519 public-key verification）；不要在一次 URL 修改中顺手引入 License、remote entitlement 或 anti-debug。

## 完成输出

最终优先报告：

```text
Single URL source: pass/fail
System.product.website derivation: pass/fail
ODCFG compile: pass/fail
ODCFG inspect: pass/fail
Input/output verify: pass/fail
Duplicate URL search: pass/fail
Script Runner: pass/fail/not run
Recorder: pass/fail/not run
macOS payload: pass/fail/not run
Windows payload: pass/fail/not run
Live UI: pass/fail/not run
Blockers: only real blockers
```

同时列出真正修改的文件和实际执行的命令。不要用设计说明替代编译、测试和真实 UI evidence。
