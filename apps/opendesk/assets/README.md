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

## Official shell config

`official-shell.odcfg` 是 **generated release resource**，不要手工编辑。

维护源：

```text
configs/official-shell.json
```

生成：

```bash
make build
./dist/opendesk config compile
```

默认链路：

```text
configs/official-shell.json
    -> pkg/officialconfig
    -> internal/configcli
    -> apps/opendesk/assets/official-shell.odcfg
```

官网不在这个文件中。官网属于 Runtime-owned：

```js
System.product.website
```

Help / Customize / Marketplace / Upgrade 才属于 `official-shell.json` / `.odcfg`。

ODCFG1 当前只是可逆混淆 + checksum，不是 secret store、签名配置或 DRM。禁止保存 token、密码、License key、私钥或其他 secret。

完整维护流程与防遗漏检查见：

```text
workflows/official-product-config/README.md
workflows/official-product-config/skills/manage-official-product-config/SKILL.md
```

本 README 是源码维护说明，不进入 `apps/opendesk/.release/app-mode-runtime-files.txt` 的正式 AppMode payload。
