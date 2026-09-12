# OpenDesk product assets

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
