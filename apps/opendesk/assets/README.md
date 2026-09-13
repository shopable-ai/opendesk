# OpenDesk product assets

`apps/opendesk/assets/` 只保存 **App package 确实需要以文件形式存在的产品资源**。它不是通用图标库，也不是 Go / Swift / generator 的实现目录。

## 图标 ownership

OpenDesk 的图标分为三类：

1. **Runtime built-in UI icons**：按钮、状态、文件夹、播放/暂停、设置、AI 等通用语义图标统一使用 `pkg/customui/assets/toolbar-icons-v1.json` 中的内置 ID。JS 直接写 `play.fill`、`folder.fill`、`timer` 等，不复制 PNG/SVG 到 App 目录。
2. **Product identity assets**：当前 App Shell 仍要求以文件路径加载的 OpenDesk Logo、macOS Tray template PNG、Windows ICO 保留在本目录，直到 App Shell 提供正式的 embedded product-default asset contract。
3. **Feature-internal compiled assets**：只服务于 OpenDesk 内置功能、且需要编译进程序的二进制资源归对应 `internal/<feature>/assets/` 所有，不放进 `apps/opendesk/**`。

因此：

```text
apps/opendesk/**                 -> JS App/package source; no Go source/generators
pkg/customui/assets/             -> shared semantic UI icon catalog
internal/<feature>/assets/       -> compiled built-in feature resources
apps/opendesk/assets/            -> file-backed product identity/package resources only
```

新增普通 UI 图标前必须先查中央 catalog；catalog 已存在同义图标时，禁止新增私有 PNG/SVG 副本。

## Official actions config

`official-actions.odcfg` 是 **generated release resource**，不要手工编辑。

维护源：

```text
configs/official-actions.json
```

生成：

```bash
./dist/opendesk config compile --input configs/official-actions.json --output apps/opendesk/assets/official-actions.odcfg
./dist/opendesk config inspect --input apps/opendesk/assets/official-actions.odcfg
./dist/opendesk config verify --input configs/official-actions.json --output apps/opendesk/assets/official-actions.odcfg
```

这些路径是官方发行调用方显式选择的，不是编译器默认值。`compile` 只做单个 JSON input 到单个 `.odcfg` output 的编译；省略其 `--output` 时，只会在 input 同目录生成同 basename 的 `.odcfg`。`inspect` 解码并校验生成物；`verify` 进一步确认明文 input 与保护 output 精确一致。三个命令都输出结构化 JSON，实际配置位于 `result.config`。`make build`、App Mode staging、`.app` 与 Windows distribution 构建是独立步骤。

官方发行链路：

```text
configs/official-actions.json
    -> pkg/officialconfig
    -> internal/configcli
    -> apps/opendesk/assets/official-actions.odcfg
```

官网与其他官方 action URL 都在这个文件中。Runtime 为兼容产品身份 API，从同一份生成资源派生：

```js
System.product.website
```

`home`、Help、Customize、Marketplace、Upgrade 都属于 `official-actions.json` / `.odcfg`；其中 `home` 必须可见且使用非空 HTTPS URL。`System.product.website` 不是第二个维护源。`official-shell.js` 是 Runtime 组件名，不再与配置 basename 混用。

不使用 `app-config`，因为它会与 `opendesk.app.json` 混淆；不使用 `app-info`，因为本文件不是静态 metadata。`official-actions` 精确对应 `opendesk.*` action 的可见性与 HTTPS URL policy。

ODCFG1 当前只是可逆混淆 + checksum，不是 secret store、签名配置或 DRM。禁止保存 token、密码、License key、私钥或其他 secret。

完整维护流程与防遗漏检查见：

```text
workflows/official-product-config/README.md
workflows/official-product-config/skills/manage-official-product-config/SKILL.md
```

本 README 是源码维护说明，不进入 `apps/opendesk/.release/app-mode-runtime-files.txt` 的正式 AppMode payload。
