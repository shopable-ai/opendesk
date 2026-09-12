---
name: manage-official-product-config
description: 维护 OpenDesk 官方官网、帮助、定制、商店、专业版等产品入口，统一 System.product.website 与 Official Shell 配置源，编译 official-shell.odcfg，并检查 Script Runner、Recorder 和发行 payload 是否遗漏或重复硬编码。用于“修改官网地址”“配置帮助/定制 URL”“重新生成 .odcfg”“检查官方按钮链接”“官方产品配置”等请求。
---

# 管理 OpenDesk 官方产品配置

通过 `$manage-official-product-config` 调用本 Skill。

目标是让官方产品入口保持单一来源、可编译、可验证、可发布，避免以后新增按钮或更换网址时只改某个 UI 文件而遗漏 Recorder、Script Runner、AppMode distribution 或文档。

## 开始前

先读取：

1. 根目录 `AGENTS.md`、当前 branch / HEAD / git status；有并行会话时重新取得最新 `master`，不得假设旧 SHA 仍有效。
2. [`workflows/official-product-config/README.md`](../../README.md)。
3. [`docs/architecture/official-shell-commercial-entrypoints.md`](../../../../docs/architecture/official-shell-commercial-entrypoints.md)。
4. `polyfills/000-systemBase.js`、`configs/official-shell.json`、`apps/opendesk/official-shell.js`。
5. 涉及 UI 时再读取 `apps/opendesk/script-runner-simple.js` 与 `apps/opendesk/recorder/`；涉及发行时再读取 AppMode packaging/distribution 脚本。

不要为了改一个 URL 扫描整个 Runtime，也不要重新设计 Recorder 或 Script Runner 状态机。

## 先分类：身份还是运营入口

### A. 官网 / 产品身份

官网属于 Runtime-owned product identity：

```js
System.product.website
```

规则：

- Script Runner、Recorder、Tray 或以后新增的品牌按钮必须读取统一值；
- 不得在各 UI 文件重新写 `https://...`；
- 不进入 `opendesk.app.json`；
- 不进入 `official-shell.odcfg`；
- 修改后必须搜索旧 URL 和常量名，确认没有产品级重复来源。

### B. Help / Customize / Marketplace / Upgrade

属于 publisher-owned operational config：

```text
configs/official-shell.json
```

规则：

- 只在明文 source 修改；
- `help`、`customize` 必须 `visible=true`；
- `marketplace`、`upgrade` 没有真实能力前保持隐藏；
- URL 非空时必须是 HTTPS；
- 不存 secret。

## 编译动作

修改运营 source 后必须执行：

```bash
make build
./dist/opendesk config compile
```

开发态也可执行：

```bash
go run ./cmd/opendesk config compile
```

默认合同：

```text
source: configs/official-shell.json
target: apps/opendesk/assets/official-shell.odcfg
format: ODCFG1
```

禁止手工维护 ODCFG HEX/checksum。CLI 失败时先修 source/validator/compiler，不要绕过生成器直接改目标文件。

## Runtime 读取规则

确认 `apps/opendesk/official-shell.js` 保持：

```text
.odcfg exists + valid   -> use protected bundle config
.odcfg exists + invalid -> built-in fallback, never downgrade to plaintext
.odcfg missing          -> sibling .json may be used for development
both missing            -> built-in fallback
```

`home` 必须始终从 `System.product.website` 构造，不能重新加入 config action schema。

## 搜索遗漏

每次修改后至少搜索：

```bash
git grep -n "https://github.com/shopable-ai/opendesk"
git grep -n "OPENDESK_HOMEPAGE_URL"
git grep -n "official-shell.odcfg"
git grep -n "official-shell.json"
git grep -n "opendesk.home\|opendesk.help\|opendesk.customize\|opendesk.marketplace\|opendesk.upgrade"
```

允许文档、测试 fixture 或 Runtime identity source 出现预期 URL；产品 UI 业务文件出现新的官网 literal 默认视为遗漏，必须解释或消除。

## 必测项

至少执行：

```bash
go test ./pkg/officialconfig ./internal/configcli ./automation
go test ./cmd/opendesk
make build
./dist/opendesk config compile
```

随后验证生成文件可被当前 Official Shell 读取。仓库若已有更精确的 product/AppMode tests，优先追加而不是替换上述最小 gate。

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
AppMode payload contains apps/opendesk/assets/official-shell.odcfg
AppMode payload does not contain configs/official-shell.json
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
Identity source: pass/fail
Operational source: pass/fail
ODCFG compile: pass/fail
Duplicate URL search: pass/fail
Script Runner: pass/fail/not run
Recorder: pass/fail/not run
macOS payload: pass/fail/not run
Windows payload: pass/fail/not run
Live UI: pass/fail/not run
Blockers: only real blockers
```

同时列出真正修改的文件和实际执行的命令。不要用设计说明替代编译、测试和真实 UI evidence。
