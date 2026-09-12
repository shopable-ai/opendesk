---
title: App Package CLI
description: 验证、诊断和从已安装 Runtime 构建 App Mode package，并向开发者、Agent 和 CI 输出稳定结果。
order: 605
---

# App Package CLI

`opendesk app` 是 `opendesk.app.json` / App Mode package 的开发工具。它验证 manifest 和声明的 package-local 资源；`build` 还会从当前已安装的同平台 OpenDesk Runtime/SDK 复制 desktop payload 并写入已验证的 package。三个命令都不会执行 `main.js`、启动 App Shell、创建窗口或触发 tray action。

它与 `opendesk package protect|inspect|verify` 不同：后者只负责 `.odpkg` 受保护 recipe package 的构建和密码学检查。App Mode package validation 不属于 protected-package namespace。

仓库内示例从仓库根目录运行，并先用 `make build` 生成与当前源码匹配的 `./dist/opendesk`。普通应用作者不需要源码或 Go：请使用安装 Runtime 中的 `opendesk`，并按 [Installed Runtime App Builder](app-builder.md) 的工作目录和命令运行。

## API 一览

| 命令 | 用途 |
| --- | --- |
| `opendesk app validate <package-dir> [--json]` | 确定性 package/compatibility gate。 |
| `opendesk app doctor <package-dir> [--json]` | 展示逐阶段诊断和未检查项。 |
| `opendesk app build <package-dir> --target <macos\|windows> --output <path> [--json]` | 从已安装的同平台 Runtime 生成 `.app` 或 portable directory。 |

## 公共约定

### Exit status

| code | 含义 |
| --- | --- |
| `0` | validate、doctor 或 build 成功。 |
| `1` | manifest、compatibility、entry/resource containment、Runtime template、staging 或 artifact build 失败。 |
| `2` | 未知 subcommand、缺少 package directory、未知 flag，或 build 缺少必需的 `--target` / `--output`。 |

### JSON output

`--json` 可以与 package directory/flags 一同给出。stdout 只包含一个 JSON envelope；调用方不得把 human stderr 文本解析成 Agent API。

失败 envelope 的 `error` 可包含 `code`、`message`、`field`、`expected`、`actual` 和 `hint`。Doctor 的 `result.checks[]` 始终包含 `id`、`status`、`message`，并在适用时携带相同的字段级上下文。Build 成功时使用 `command: "app.build"`，并在 `result` 中返回 package/runtime checksums、signing state、provenance 和 UTC `builtAt`。

### Validation authority

`opendesk app validate`、`opendesk app doctor`、`opendesk app build` 的输入检查和 Runtime `LoadPackage()` 共用 `pkg/appshell.ValidatePackage()`。Build 会在 staging 后再次验证将被启动的 payload。JSON Schema 只提供更早的 editor/CI structure feedback；真实 Runtime 继续负责 SemVer、兼容性、资源内容、Windows/POSIX path 和 symlink/canonical containment。

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

## opendesk app build

从当前机器已安装的、同平台 OpenDesk desktop Runtime/SDK 生成桌面 artifact。它不调用 `go build`、`go run`、仓库 build scripts 或 package 业务 JavaScript。

**签名**

```text
opendesk app build <package-dir> --target <macos|windows> --output <path> [--json]
```

**参数**

| 参数 | 必填 | 说明 |
| --- | --- | --- |
| `<package-dir>` | 是 | 含 `opendesk.app.json` 的 App Mode package。 |
| `--target macos` | 二选一 | 只能由完整的同平台 `OpenDesk.app` Runtime 构建；output 必须以 `.app` 结尾。 |
| `--target windows` | 二选一 | 只能由完整的同平台 Windows portable Runtime 构建；output 是 directory。 |
| `--output <path>` | 是 | 新 artifact 的显式路径。父目录必须存在、目标必须不在 package 内且尚不存在。没有默认值或覆盖 flag。 |
| `--json` | 否 | stdout 输出一个 machine-readable envelope。 |

**返回值**

成功时返回 exit `0`。human output 显示 target、output、App identity、payload/runtime SHA-256、signing state 与 provenance path。JSON 成功 envelope 的稳定外层为：

```json
{
  "ok": true,
  "command": "app.build",
  "result": {
    "target": "macos",
    "output": "/absolute/release/My App.app",
    "package": {
      "id": "com.example.my-app",
      "version": "1.0.0",
      "name": "My App",
      "policyApplied": false,
      "files": [{ "path": "main.js", "sha256": "..." }],
      "sha256": "..."
    },
    "runtime": {
      "version": "0.1.0",
      "source": "/installed/OpenDesk.app",
      "executable": "/installed/OpenDesk.app/Contents/MacOS/opendesk",
      "executableSHA256": "...",
      "template": "/installed/OpenDesk.app/Contents/Resources/OpenDeskAppBuilder/template.json",
      "templateSHA256": "..."
    },
    "signing": {
      "status": "unsigned",
      "notarization": "not-notarized",
      "detail": "..."
    },
    "provenance": "/absolute/release/My App.app/Contents/Resources/OpenDeskAppBuilder/build-provenance.json",
    "builtAt": "2026-09-12T11:12:55Z"
  }
}
```

`result.package.files[]` 是 staged package 文件的 SHA-256 清单；`result.package.sha256` 是其按 path 排序后的摘要。`result.runtime.executableSHA256` 和 `result.runtime.templateSHA256` 分别证明被复制的 Runtime executable 与 Builder Template。`builtAt` 和 Runtime/template 输入会变化，因此这不是跨环境 artifact bit-for-bit reproducibility 承诺。

**行为与错误**

Build 先验证 source package，再复制安装 Runtime 的完整 template、stage package、复核 layout/provenance，最后原子发布到新的 output path。已有 output 返回 `APP_BUILD_OUTPUT_EXISTS` 且保持不变。macOS 删除源 template 中会因 package identity 改写而失效的外层签名，result 必定报告 `unsigned` / `not-notarized`；Windows 报告 `not-signed-by-builder`。

`APP_BUILD_TARGET_INVALID` 表示 target 不是 `macos` 或 `windows`。`APP_BUILD_TARGET_UNAVAILABLE` 表示当前 executable 没有请求目标的同平台 desktop layout；Builder 不 cross-build。`APP_BUILD_RUNTIME_NOT_FOUND` 或 `APP_BUILD_RUNTIME_TEMPLATE_INVALID` 表示没有完整的官方 Runtime/SDK template。`APP_BUILD_OUTPUT_INVALID` 表示 output parent、扩展名或 package containment 不符合要求；`APP_BUILD_STAGING_FAILED` / `APP_BUILD_OUTPUT_COMMIT_FAILED` 表示 staging 或最终发布失败。详情和修复路径见 [Installed Runtime App Builder](app-builder.md#退出码json-与常见失败)。

**示例**

从安装 Runtime 运行的 macOS / Windows 完整命令、artifact layout、启动方式和 CI pattern 见 [Installed Runtime App Builder](app-builder.md)。仓库维护者从源码构建 Runtime template 的命令仍见 [Script App Packaging](script-app-packaging.md)。

## App Mode 与受保护包边界

`opendesk app validate|doctor|build` 只负责普通 App Mode package。`opendesk package protect|inspect|verify` 只负责 `.odpkg` 受保护 recipe package；它们不共享 output、签名或 License 语义。详见 [受保护包 CLI](protected-packages.md)。

## JSON Schema association

正式 Draft 2020-12 schema 位于 [`schemas/app-package/opendesk.app.schema.json`](../../schemas/app-package/opendesk.app.schema.json)，canonical `$id` 是 `https://opendesk.dev/schemas/app-package/opendesk.app.schema.json`。仓库通过 `.vscode/settings.json` 把 `**/opendesk.app.json` 与该 schema 关联。

不要把 `$schema` 写进 manifest。`schemaVersion: 1` 的 strict unknown-field contract 不包含 `$schema`，旧的 schema-v1 Runtime 会拒绝它。其他 editor 应采用 filename/workspace association。
