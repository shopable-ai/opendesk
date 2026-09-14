---
name: manage-official-product-config
description: 维护 OpenDesk publisher-owned 产品配置 configs/product.json，统一官网及官方 action URL source，编译 product.odcfg，并检查 System.product.website、Script Runner、Recorder、App Mode 与 distribution 是否遗漏。产品配置保持 language-neutral；窗口标题和其他可翻译 UI 文案走 locale/i18n 层。
---

# 管理 OpenDesk 官方产品配置

通过 `$manage-official-product-config` 调用本 Skill。

目标：让 OpenDesk 官方运营入口保持单一来源、可编译、可验证、可发布，同时保持 App Manifest、产品配置、多语言 UI 文案三种职责分离。

## 开始前

先检查当前 branch / HEAD / git status、根目录 `AGENTS.md` / `README.md` / `CONTRIBUTING.md`（存在时），并重新读取：

```text
workflows/official-product-config/README.md
configs/product.json
apps/opendesk/official-shell.js
apps/opendesk/.release/app-mode-runtime-files.txt
apps/opendesk/opendesk.app.json
pkg/officialconfig/
internal/officialassets/
```

涉及 UI 时再读取 `apps/opendesk/script-runner-simple.js` 与 `apps/opendesk/recorder/`。有并行会话时必须重新取得最新 `master`，不得按旧 SHA 覆盖其他改动。

## Ownership 边界

```text
apps/opendesk/opendesk.app.json
-> App Mode package manifest

configs/product.json
-> publisher-owned、language-neutral 产品运营配置

apps/opendesk/assets/product.odcfg
-> product.json 的生成发行资源

locale / i18n provider（未来）
-> title / label / placeholder / toast / dialog 等可翻译 UI copy
```

禁止把窗口标题、按钮翻译、提示语塞进 `configs/product.json`。禁止把官网/Help/Customize 等运营 URL 再写进 `opendesk.app.json` 或 UI 文件。

## URL 与 action 规则

`configs/product.json` 是唯一明文产品 URL source。当前 action：

```text
home
help
customize
examples
apiDocs
marketplace
upgrade
```

`home`、`help`、`customize`、`examples`、`apiDocs` 必须可见；`home` 必须有非空 HTTPS URL；其余 URL 非空时必须为 HTTPS；不存 secret。

Runtime 从同一生成配置派生：

```js
System.product.website
```

它是只读投影，不是第二个维护源。

## 编译合同

官方发行路径：

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

开发态可以用：

```bash
go run ./cmd/opendesk config compile \
  --input configs/product.json \
  --output apps/opendesk/assets/product.odcfg
```

ODCFG1 wire format 与 basename 是两个概念：文件已改为 `product.{json,odcfg}` 不代表 wire format 升级。禁止手工修改 HEX/checksum。

## Runtime 读取规则

`apps/opendesk/official-shell.js` 应使用 basename `product`：

```text
product.odcfg valid   -> bundle config
product.odcfg invalid -> built-in fallback；不得降级读取 plaintext
product.odcfg missing -> sibling product.json 可用于开发/诊断
both missing          -> built-in fallback
```

正式 App Mode payload 只携带 `assets/product.odcfg`，不得携带维护源 `configs/product.json`。

旧 `official-actions.{json,odcfg}` 不作为兼容 fallback。

## UI / i18n 规则

窗口 title 是 UI copy，不是产品运营配置字段。当前默认验收：

```text
Script Runner -> OpenDesk — Script Runner
Recorder      -> OpenDesk — Recorder
```

窗口控制器应接受 `windowTitle` override。未来 locale provider 通过该 seam 注入翻译，不重新设计窗口生命周期。

主 App Shell 标题仍可为 `OpenDesk`。

## 搜索遗漏

修改后至少运行：

```bash
rg -n --hidden -g '!.git/**' -g '!dist/**' \
  'official-actions|zz_generated_official_actions|generatedOfficialActions' .

rg -n --hidden -g '!.git/**' -g '!dist/**' \
  'CONFIG_BASENAME|windowTitle|OpenDesk —|\\u200B' \
  apps internal pkg workflows configs
```

旧 basename 若仍作为当前有效路径、loader 或 generated symbol 出现必须清理；纯历史说明必须明确是旧名。

## 必测项

先跑最窄 gate：

```bash
go test ./pkg/officialconfig ./internal/officialassets ./internal/configcli

go run ./cmd/opendesk config inspect \
  --input apps/opendesk/assets/product.odcfg

go run ./cmd/opendesk config verify \
  --input configs/product.json \
  --output apps/opendesk/assets/product.odcfg
```

再按仓库当前标准运行相关 JS/product tests、`go test ./...`、构建和 App Mode/distribution payload 检查。

涉及窗口标题时必须覆盖默认值与 `windowTitle` override。若本机环境允许，运行：

```bash
./dist/opendesk -app "$PWD/apps/opendesk" -allow-recorder-capture -console-mode script
```

真实查看 Script Runner、Recorder 标题并验证官方入口。无法进行 live UI 时必须写 `not run`。

## Distribution 检查

最终应满足：

```text
configs/product.json exists
configs/official-actions.json absent
apps/opendesk/assets/product.odcfg exists
apps/opendesk/assets/official-actions.odcfg absent
AppMode runtime manifest contains assets/product.odcfg
AppMode payload does not contain configs/product.json
macOS / Windows staging use the same generated product resource contract
```

## 完成输出

最终逐项报告：

```text
Product source: pass/fail
Old basename cleanup: pass/fail
System.product.website: pass/fail
ODCFG compile/inspect/verify: pass/fail
Script Runner title: pass/fail/not run
Recorder title: pass/fail/not run
windowTitle override: pass/fail/not run
App Mode payload: pass/fail/not run
macOS distribution: pass/fail/not run
Windows distribution: pass/fail/not run
Live UI: pass/fail/not run
Blockers: only real blockers
```

同时列出实际改动文件与实际执行命令。不要用设计说明替代测试或真实 UI evidence。
