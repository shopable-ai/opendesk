---
title: Installed Runtime App Builder
description: 使用预编译 OpenDesk Runtime 或 SDK，把已有 App Mode package 生成 macOS .app 或 Windows portable application；不需要源码 checkout 或 Go 工具链。
order: 603
---

# Installed Runtime App Builder

Installed Runtime App Builder 面向已经有 App Mode package 的应用作者。它从当前机器已安装的、同平台 OpenDesk desktop Runtime/SDK 复制完整 Runtime payload，再写入并复核你的 package，生成可搬移的桌面产物。

```text
安装完整的 OpenDesk Runtime / SDK
→ 准备 my-app/opendesk.app.json 与 entry
→ validate
→ doctor
→ build
→ macOS .app 或 Windows portable directory
```

这条路径不需要 OpenDesk 源码 checkout、`make build`、`go build` 或 `go run`。`build` 只验证和复制文件：不会执行 `main.js`、启动窗口、创建 tray，或运行 package 的业务逻辑。

公开命令为：

```text
opendesk app build <package-dir> --target <macos|windows> --output <path> [--json]
```

完整 Manifest、App Shell 与开发态运行方式见 [Script App Packaging](script-app-packaging.md)。CLI 参数、JSON envelope 和错误码的 Reference 见 [App Package CLI](app-package-cli.md)。

## 前置条件

安装官方的完整 desktop Runtime/SDK，并在目标操作系统上运行 Builder：

| 目标 | 安装输入 | Builder 发现的正式模板 | 不支持的用法 |
| --- | --- | --- | --- |
| macOS | 完整 `OpenDesk.app` | `Contents/Resources/OpenDeskAppBuilder/template.json` | 用 Windows Runtime 或源码构建脚本交叉生成 `.app` |
| Windows | 完整 OpenDesk portable directory | `app-builder-template.json` | 用 macOS Runtime 或源码构建脚本交叉生成 Windows portable directory |

不要只复制一个 `opendesk` 可执行文件或 template marker。macOS 应保留整个 `OpenDesk.app`；Windows 应保留整个官方 portable directory，包括 `opendesk.exe`、`ui-host/opendesk-ui-host.exe` 和 Runtime assets。Builder 会复制这份已安装 payload，因此最终产物不依赖安装位置或 OpenDesk 源码目录。

准备一个通过 App Mode schema 的 package。最小目录如下；`entry` 和所有在 Manifest 中声明的资源都必须在 package 内且不是 symlink。

```text
work/
├── my-app/
│   ├── opendesk.app.json
│   ├── main.js
│   └── assets/
└── release/                 # 必须先存在；每次使用一个新 output 名称
```

新 package 使用 `schemaVersion: 1`。`id`、`name`、`version`、`entry`、窗口和 tray 字段的公开 contract 不因 Builder 而改变；最小 Manifest 和完整示例见 [Script App Packaging](script-app-packaging.md#package-目录) 与 [App Mode example](../../examples/app-mode/README.md)。不要把 `$schema`、签名字段、template 路径或任何 Builder 专用字段加入 `opendesk.app.json`。

## macOS

以下命令的工作目录是包含 `my-app/` 的 `work/`。示例假设完整 Runtime 安装在 `/Applications/OpenDesk.app`；若安装位置不同，只替换可执行文件的绝对路径，不要从 `.app` 中抽出单个二进制文件。

```bash
mkdir -p release
/Applications/OpenDesk.app/Contents/MacOS/opendesk app validate ./my-app
/Applications/OpenDesk.app/Contents/MacOS/opendesk app doctor ./my-app
/Applications/OpenDesk.app/Contents/MacOS/opendesk app build ./my-app --target macos --output "$PWD/release/My App.app" --json
```

`--output` 必须以 `.app` 结尾，父目录必须已经存在，且目标路径必须尚不存在。没有默认 output，也没有 `--force` 或覆盖模式；为下一次构建选择新名称或新的 release directory。

成功后得到：

```text
release/My App.app/
└── Contents/
    ├── MacOS/opendesk
    ├── Helpers/opendesk-ui-host
    ├── Info.plist
    └── Resources/
        ├── AppMode/                         # 已验证的 my-app payload
        └── OpenDeskAppBuilder/
            └── build-provenance.json
```

Builder 把 Manifest `id`、`name` 和（如果声明）`version` 写入现有 `Info.plist` 的 app identity/display fields。它会移除复制 Runtime 的外层 `_CodeSignature`，因此 result 和 provenance 必定标为 `unsigned` 与 `not-notarized`。在 Finder 或 Launchpad 双击该 `.app` 即可启动；签名、公证和发布渠道资格需要在 Builder 之后按你的 Apple 发布流程另行完成。

## Windows

以下 PowerShell 命令的工作目录同样是包含 `my-app/` 的 `work/`。示例 Runtime 位于 `C:\OpenDesk\opendesk.exe`；这是解压后的官方 portable directory，不表示 Builder 已提供 MSI/MSIX 安装位置。

```powershell
Set-Location C:\work
New-Item -ItemType Directory -Force -Path .\release | Out-Null
$opendesk = 'C:\OpenDesk\opendesk.exe'
& $opendesk app validate .\my-app
& $opendesk app doctor .\my-app
& $opendesk app build .\my-app --target windows --output (Join-Path $PWD 'release\MyApp') --json
```

Windows output 是必须整体搬移的 portable directory；名称不要求扩展名：

```text
release/MyApp/
├── opendesk.exe
├── ui-host/
│   └── opendesk-ui-host.exe
├── app-builder-template.json
├── app-mode/                              # 已验证的 my-app payload
│   └── opendesk.app.json
└── app-build-provenance.json
```

在 Explorer 双击 `opendesk.exe` 启动。Builder 的 Windows signing status 是 `not-signed-by-builder`：它不生成 MSI、MSIX、installer、Start Menu shortcut、文件关联、Publisher 签名或 auto-update。

仓库的 App Builder workflow 配置在原生 Windows runner 上构建 portable payload、移动它并再次 validation。本次文档验收没有 Windows live desktop evidence；这类检查也不是对你的业务窗口、tray、权限、single-instance 或目标客户机器的验收。在目标 Windows 环境中另行执行这些交互验证；macOS 或 Linux 上的 cross/package 检查不能替代它。

## CI 与可追溯性

CI 应固定同平台 Runtime/SDK 版本，使用全新的 output 目录，并只解析 `--json` 的 stdout。下例从包含 `my-app/` 的工作目录运行；`OPENDESK` 必须是已安装 Runtime 中的真实可执行文件，不是源码构建步骤。

```bash
mkdir -p "$RUNNER_TEMP/app-release"
"$OPENDESK" app validate "$PWD/my-app" --json
"$OPENDESK" app doctor "$PWD/my-app" --json
"$OPENDESK" app build "$PWD/my-app" --target macos --output "$RUNNER_TEMP/app-release/My App.app" --json > "$RUNNER_TEMP/app-release/build.json"
```

成功 envelope 的固定外层为 `{"ok":true,"command":"app.build","result":...}`。`result` 包含：

| 字段 | 用途 |
| --- | --- |
| `target`、`output`、`builtAt` | 构建目标、绝对 artifact path 与 UTC 构建时间。 |
| `package.id`、`package.version`、`package.name` | Manifest identity。 |
| `package.files[]` | package 内每个 staged regular file 的 path 和 SHA-256。 |
| `package.sha256` | 按路径排序的 `path` + file SHA-256 清单摘要，不是整个 `.app` 或 portable directory 的摘要。 |
| `runtime.version`、`runtime.source`、`runtime.executable` | 被复制的安装 Runtime 的版本和来源。 |
| `runtime.executableSHA256`、`runtime.templateSHA256` | Runtime executable 和 Builder Template 的 SHA-256。 |
| `signing` | Builder 实际得到的签名/公证状态及其限制。 |
| `provenance` | artifact 内 `build-provenance.json` 或 `app-build-provenance.json` 的最终路径。 |

这些字段使相同 package 和固定 Runtime input 可被审计和复核，但 Builder 不承诺跨时间或不同 Runtime template 的整个 artifact bit-for-bit 相同：`builtAt` 会变化，且 Runtime/template 的版本与内容属于构建输入。

Builder 先在 sibling temporary directory staging，复核 payload、所需 Runtime 文件与 provenance 后才 rename 到 output。若 output 已存在，返回 `APP_BUILD_OUTPUT_EXISTS` 且不会覆盖它。不要在 CI 复用同一个 output path；如需重试，选择新的空目录并保留失败产物供检查。

## 退出码、JSON 与常见失败

| exit code | 含义 |
| --- | --- |
| `0` | validate/doctor/build 成功。 |
| `1` | Manifest validation、Runtime template、staging 或 artifact build 失败。 |
| `2` | CLI 用法错误，例如缺少 package、`--target`、`--output` 或未知 flag。 |

失败的 JSON 仍只写一个 envelope 到 stdout：`{"ok":false,"command":"app.build","error":...}`。`error` 可包含 `code`、`message`、`field`、`expected`、`actual` 和 `hint`；CI 不应解析 human stderr。

| code / 症状 | 修复 |
| --- | --- |
| `APP_BUILD_TARGET_INVALID` | `--target` 只能是 `macos` 或 `windows`。 |
| `APP_BUILD_TARGET_UNAVAILABLE` | 从目标操作系统上的同平台完整 Runtime/SDK 调用 Builder；它不 cross-build。 |
| `APP_BUILD_RUNTIME_NOT_FOUND` 或 `APP_BUILD_RUNTIME_TEMPLATE_INVALID` | 使用完整官方 desktop Runtime/SDK，不要使用脱离 `.app` 或 portable directory 的可执行文件。 |
| `APP_BUILD_OUTPUT_INVALID` | 先创建 output parent，macOS 使用 `.app` 结尾，并把 output 放在 package 外。 |
| `APP_BUILD_OUTPUT_EXISTS` | Builder 从不覆盖。选择全新 output path。 |
| package validation code，例如 `APP_RUNTIME_TOO_OLD`、entry/resource containment 失败 | 先运行 `validate` / `doctor`，修复 Manifest、版本、缺失资源或 symlink escape 后重新 build。 |
| `APP_BUILD_STAGING_FAILED` 或 `APP_BUILD_OUTPUT_COMMIT_FAILED` | 保留错误输出，检查 Runtime template 与 package resource；用新的空 output path 重试。 |

## 与源码打包和受保护包的边界

`opendesk app build` 是已安装 Runtime 的无源码构建入口。仓库中的 `scripts/build_macos_app.sh` 与 `scripts/build_windows_distribution.ps1` 是 OpenDesk 发行维护者从源码制作 Runtime template 的流程，会调用构建工具链；它们不是普通 App 作者的替代命令。

`opendesk package protect`、`inspect` 和 `verify` 只处理 `.odpkg` 受保护 recipe package、Publisher 签名与 License 流程。它们不生成 `.app`/portable directory；`opendesk app build` 也不加密源码、签发 License 或验证 `.odpkg`。需要两种交付能力时，分别按照 [受保护包 CLI](protected-packages.md) 和本页的契约完成资格验证；不要把 `.odpkg` 当作 `opendesk.app.json` 的替代品。

## 相关文档

- [App Package CLI](app-package-cli.md)：`validate`、`doctor`、`build` 的完整参数、JSON 与错误 Reference。
- [Script App Packaging](script-app-packaging.md)：Manifest、App Shell、开发态 `-app` 与源码维护者的 release staging。
- [automation.app](app-shell.md)：当前 App Mode application 的 tray/menu、action 和退出 API。
- [App Package Format](../architecture/app-package-format.md)：Manifest schema、兼容性和 containment contract。
