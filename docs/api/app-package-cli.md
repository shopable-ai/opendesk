---
title: App Package CLI
description: 静态验证 App Mode package，并向开发者、Agent 和 CI 输出稳定诊断。
order: 605
---

# App Package CLI

`opendesk app` 是 `opendesk.app.json` / App Mode package 的静态开发工具。它读取 manifest 和声明的 package-local 资源，复用 Runtime 的 `pkg/appshell` validator，但不会执行 `main.js`、启动 App Shell、创建窗口或触发 tray action。

它与 `opendesk package protect|inspect|verify` 不同：后者只负责 `.odpkg` 受保护 recipe package 的构建和密码学检查。App Mode package validation 不属于 protected-package namespace。

所有命令从仓库根目录运行；先用 `make build` 生成与当前源码匹配的 `./dist/opendesk`。

## API 一览

| 命令 | 用途 |
| --- | --- |
| `opendesk app validate <package-dir> [--json]` | 确定性 package/compatibility gate。 |
| `opendesk app doctor <package-dir> [--json]` | 展示逐阶段诊断和未检查项。 |

## 公共约定

### Exit status

| code | 含义 |
| --- | --- |
| `0` | package 有效且与当前 Runtime 兼容。 |
| `1` | manifest、compatibility、entry、resource 或 containment validation 失败。 |
| `2` | 未知 subcommand、缺少 package directory、未知 flag 或其他 CLI usage error。 |

### JSON output

`--json` 可以放在 package directory 前或后。stdout 只包含一个 JSON envelope；调用方不得把 human stderr 文本解析成 Agent API。

失败 envelope 的 `error` 可包含 `code`、`message`、`field`、`expected`、`actual` 和 `hint`。Doctor 的 `result.checks[]` 始终包含 `id`、`status`、`message`，并在适用时携带相同的字段级上下文。

### Validation authority

`opendesk app validate`、`opendesk app doctor` 和 Runtime `LoadPackage()` 共用 `pkg/appshell.ValidatePackage()`。JSON Schema 只提供更早的 editor/CI structure feedback；真实 Runtime 继续负责 SemVer、兼容性、资源内容、Windows/POSIX path 和 symlink/canonical containment。

## opendesk app validate

从仓库根目录验证最小示例：

```bash
./dist/opendesk app validate examples/app-mode/basic
```

成功输出 package schema、identity、version、当前 Runtime compatibility 与 entry。它不会执行 entry。

Agent / CI 使用结构化输出：

```bash
./dist/opendesk app validate examples/app-mode/basic --json
```

成功 envelope：

```json
{
  "ok": true,
  "command": "app.validate",
  "result": {
    "schemaVersion": 1,
    "id": "com.opendesk.example.basic",
    "version": "0.1.0",
    "runtimeVersion": "0.1.0",
    "runtimeCompatible": true,
    "entry": "main.js"
  }
}
```

失败 envelope 示例：

```json
{
  "ok": false,
  "command": "app.validate",
  "error": {
    "code": "APP_RUNTIME_TOO_OLD",
    "message": "APP_RUNTIME_TOO_OLD ...",
    "field": "runtime.minVersion",
    "expected": ">=0.2.0",
    "actual": "0.1.0",
    "hint": "Upgrade OpenDesk Runtime."
  }
}
```

## opendesk app doctor

从仓库根目录运行：

```bash
./dist/opendesk app doctor examples/app-mode/basic
```

Doctor 按实际验证顺序显示 `PASS`、`FAIL`、`SKIP` 或 `NOT CHECKED`。例如 manifest 解析失败后，Runtime compatibility、entry 和 resource 不会被伪报为 PASS；它们保持 `NOT CHECKED`。

结构化诊断：

```bash
./dist/opendesk app doctor examples/app-mode/basic --json
```

每个 check 的稳定最小形状：

```json
{
  "id": "runtime.compatibility",
  "status": "PASS",
  "message": "Runtime 0.1.0 satisfies >=0.1.0."
}
```

## JSON Schema association

正式 Draft 2020-12 schema 位于 [`schemas/app-package/opendesk.app.schema.json`](../../schemas/app-package/opendesk.app.schema.json)，canonical `$id` 是 `https://opendesk.dev/schemas/app-package/opendesk.app.schema.json`。仓库通过 `.vscode/settings.json` 把 `**/opendesk.app.json` 与该 schema 关联。

不要把 `$schema` 写进 manifest。`schemaVersion: 1` 的 strict unknown-field contract 不包含 `$schema`，旧的 schema-v1 Runtime 会拒绝它。其他 editor 应采用 filename/workspace association。
