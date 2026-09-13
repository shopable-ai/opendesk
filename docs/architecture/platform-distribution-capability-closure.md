# Platform Distribution Capability Closure

## 决策与验收状态

公共 capability contract 对称，不等于 macOS / Windows 必须拥有完全相同的文件树、二进制或系统依赖。当前 P0 继续采用 **full same-platform Runtime template**：官方发行先形成完整同平台 Runtime，Installed App Builder 再保全该 Runtime 并替换 App Mode package；不从 `opendesk.app.json.capabilities` 推导可删除文件，不改变 schema v1，也不在本轮引入 dependency solver / minimal packaging。

当前源码已经完成 Windows Desktop / CLI 的文件名角色收口：

```text
opendesk-desktop.exe        -> Windows GUI desktop entry；普通用户唯一启动入口
opendesk.exe                -> Console CLI；开发 / 自动化入口
ui-host/opendesk-ui-host.exe
                            -> Runtime 自动管理的 Native UI child helper
```

旧的 `opendesk.exe` / `OpenDesk.exe` 仅靠大小写区分的方案已不再是目标源码合同。源码、distribution provenance、Installed App Builder、payload checker、Windows/App Builder CI 和对应文档均使用独立 Desktop entry 名称。

**这只代表 source / artifact contract 已收口，不代表 Windows consumer release 已验收。** Windows 原生构建、真实 Explorer/shortcut 启动、无 Console、helper 生命周期、Authenticode、SmartScreen / Smart App Control / Defender、WebView2 clean-machine、UAC 和产品窗口仍需要 Windows 环境证据。

### 立即生效的架构决定

| 决定 | 结论 |
| --- | --- |
| 两个平台都保留 Native UI Host | Custom UI 的真实链路需要 platform host；不能为了“单进程外观”删除 |
| Windows 普通用户只启动一个 Desktop entry | CLI 是开发入口；`ui-host` 是内部 child helper，不是第二/第三个用户 App |
| Windows 保留 UI Host 的实际 publish closure | .NET self-contained / single-file 的真实输出由 publish 决定，不手写猜测 DLL 清单 |
| macOS / Windows 使用各自 native implementation | capability role 对称，implementation/payload 不要求相同 |
| Installed App Builder 继续复制完整同平台 Runtime | 当前没有正式 no-ui/minimal artifact contract |
| 第三方 App 不继承官方 AppMode | Builder 排除旧 AppMode，再 stage 用户 package |
| Optional 是职责分类，不是裁剪授权 | OCR、Inspector、audio 等只有建立组件依赖闭包后才能安全裁剪 |
| 文件存在与功能通过分开验收 | Hash/layout/build 不能替代 UI、权限、系统依赖和安全信誉证据 |

## 1. 三类交付物必须分开

| 交付物 | 责任 | 不能混入的语义 |
| --- | --- | --- |
| Official Runtime distribution | Runtime core、同平台 native implementation、默认 provider、Builder marker；官方发行可 stage 官方 AppMode | 不是源码工作区，也不是所有平台 implementation 的合集 |
| Installed Builder artifact | 从已安装同平台 Runtime 复制完整 payload，排除旧 AppMode / owner-specific provenance，再 stage 用户 package | 不执行 Go 编译，不按 capabilities 静默删文件，不替用户完成 publisher signing |
| App Mode package | JavaScript、assets、`opendesk.app.json` | 不是 Runtime/.NET/AppKit 安装目录；允许 package 同时带两平台业务 assets |

不要按照 `.icns` / `.ico` / `.exe` 后缀猜测并删除用户 package 资源。未来 target filtering 必须来自明确 component ownership、dependency closure 和 target declaration。

## 2. 当前目标发行树

以下是源码声明的目标布局，不等于本页已经在目标机器完成 live qualification。

```text
macOS: OpenDesk.app/Contents/
├── Info.plist
├── MacOS/
│   ├── opendesk
│   ├── polyfills/
│   └── jslibs/
├── Helpers/
│   ├── opendesk-ui-host
│   ├── clawdesk-ui-host       # compatibility candidate；退役需单独证据
│   └── opendesk-status
└── Resources/
    ├── OpenDesk.icns
    ├── inspector_web/
    ├── OpenDeskAppBuilder/template.json
    ├── NativeExtensions/
    │   ├── com.example.macos-vision/
    │   └── [条件] 其他 provider bundles
    └── [条件] AppMode/

Windows: portable root/
├── opendesk-desktop.exe       # normal user desktop entry
├── opendesk.exe               # CLI / developer entry
├── ui-host/
│   ├── opendesk-ui-host.exe   # Runtime child helper
│   ├── build-provenance.json
│   └── dotnet publish 实际输出（如有）
├── polyfills/
├── jslibs/
├── resources/opendesk-notification.png
├── sounds/public/{done,fail,warn,captcha}.mp3
├── app-builder-template.json
├── distribution-provenance.json
└── [条件] app-mode/
```

Windows whole-app 当前只声明 win-x64。`build_windows_ui.ps1` 可独立发布 win-arm64 host，不等于完整 OpenDesk ARM64 已通过。

## 3. Windows 产品进程模型

“发行目录中有多个 EXE”与“用户需要启动多个 App”是两个不同问题。产品链路固定为：

```text
普通用户
  -> opendesk-desktop.exe                 # 只启动一次
       -> OpenDesk Runtime / bundled App Mode
            -> Script Runner
            -> Recorder
            -> Scheduler Center
            -> Runtime Log
            -> Permissions Center
            -> host-backed UI 首次需要时
                 -> ui-host/opendesk-ui-host.exe

开发者 / Terminal / 自动化
  -> opendesk.exe                         # 显式 CLI
```

`ui-host` 是可信 sidecar 角色，不应拥有 Start Menu/Desktop shortcut，也不要求用户手工启动。未来 Installer 应只暴露一个普通用户 OpenDesk 快捷方式；CLI 可以作为 developer capability 安装，helper 保持内部 payload。

### Trusted sidecar 边界

Consumer release 的 helper 目标模型是：

```text
signed desktop entry
  -> package-owned Runtime
       -> fixed package-relative helper
            -> narrow local IPC / protocol handshake
```

要求：helper 随发行包交付；不运行时下载；不落地 `%TEMP%` 后执行；不通过 shell / PATH 猜测生产 helper；不为显示 UI 创建额外 UAC；Runtime 负责启动、握手、关闭和异常清理。

当前 Runtime 已有 packaged host discovery 与 versioned protocol handshake，但这不是 cryptographic publisher identity。Authenticode、安装目录 ACL、helper signer/integrity enforcement 和 updater trust chain属于后续 release-hardening，不能用“协议握手成功”替代。

## 4. Platform payload classification

| Component | 分类 | macOS / Windows 决策 |
| --- | --- | --- |
| Runtime executable / public JS runtime | A Cross-platform Required | 两平台都需要，各自 native executable |
| polyfills / jslibs | A | 完整 Runtime 必须保留真实 payload |
| Native UI Host | B Platform Required for native-ui | 两平台都保留自己的实现 |
| AppKit / macOS bundle metadata / TCC strings | B macOS | Windows 不复制 |
| Windows .NET UI Host publish closure | B Windows | 保留实际 publish output |
| WebView2 Runtime | C System prerequisite for HTML/WebSurface | 需 Evergreen / Fixed Version 明确策略；.NET self-contained 不代替 WebView2 Runtime |
| Apple Vision / other Native Extensions | C Capability Optional | P0 保全模板实际 provider；未建立依赖闭包前不裁剪 |
| predefined sounds / notification assets | C/B 按 consumer | 当前 Windows distribution 有明确 Runtime consumer，保留 |
| Inspector frontend | C Runtime diagnostic capability | 有 runtime consumer 就不是“开发垃圾”；各平台自包含需分别证明 |
| Script Runner / Recorder / Scheduler Center / Runtime Log JS | D Official Product | 官方 AppMode 保留；第三方 App Builder 用用户 package 替换 |
| Builder marker / build provenance | E Build/Support metadata | 属于 installed SDK / artifact validation，不因业务运行时不读取就删除 |
| source files / build cache / workspace paths | E Build/Development Only | 不进入普通 end-user Runtime payload |

## 5. ui-host 调用链与功能边界

真实主链路：

```text
ui.createWindow / FloatingWindow
  -> Custom UI Runtime / ProcessDriver
  -> ensureStarted
  -> resolveUIHostPath
  -> direct child process
  -> hello + versioned protocol
     macOS -> AppKit host
     Windows -> WinForms host
                 -> HTML/WebSurface additionally requires WebView2
```

| 功能 | Native UI Host | 额外边界 |
| --- | --- | --- |
| Custom UI / FloatingWindow | 需要 | protocol、窗口生命周期、renderer |
| App Mode 主窗口 | 使用 Custom UI 时需要 | package/App Shell 本身不等于 host |
| Script Runner | 需要界面 host | Execution / Command 等仍由 Runtime owner |
| Recorder toolbar | 需要界面 host | capture、AX/UIA、OCR、权限是另外 capability |
| Scheduler Center | 需要中心窗口 host | Scheduler backend/store 不是 host 实现 |
| Runtime Log | 需要查看窗口 host | 日志生产/持久化独立验收 |
| Tray/Menu | 不笼统归于 host | 打开某窗口时才继承窗口依赖 |
| OCR / audio | 不因使用能力本身必然依赖 host | provider/device/permission 单独验收 |
| Inspector | 浏览器页面本身不以 host 为前置 | server、endpoint、frontend assets 单独闭合 |

理论上纯 automation 可以存在 hostless profile，但当前 Installed Builder 仍要求完整 Runtime 与 Native UI Host；没有正式 headless/minimal packaging contract，因此不能通过手工删 host 宣称支持。

## 6. Installed App Builder matrix

| 内容 | macOS | Windows |
| --- | --- | --- |
| 同平台 Runtime template | full copy | full copy |
| 旧 AppMode | 排除后 stage 用户 package | 排除后 stage 用户 package |
| Desktop / CLI role | bundle 内 Runtime executable | `opendesk-desktop.exe` + `opendesk.exe` 均保全 |
| Native UI Host | 保全 | 保全 `ui-host/opendesk-ui-host.exe` 和 publish closure |
| Identity | 改写既有 Info.plist identity fields | portable artifact 使用现有 Windows entry contract |
| Signature | 修改后移除失效外层 bundle signature；重签另行完成 | Builder 不提供 publisher signing |
| Provenance | 写当前 App build provenance | 写当前 App build provenance |
| capabilities-based stripping | 不做 | 不做 |

P0 重点是“保全已验证 Runtime + 替换产品包”，不是建立新的 dependency resolver。

## 7. 当前 P0 / P1 / P2

### P0：Source / artifact correctness

当前源码合同已经完成 Windows entry rename，并在以下链路保持一致：Windows application build、portable distribution/provenance、Installed App Builder、App Builder fixtures、payload checker、Windows portable validation、Windows Core / App Builder workflows、App Mode / Builder / distribution docs。

仍必须由 Windows 原生 CI 证明实际 PE 产物满足：

```text
opendesk.exe            -> Console subsystem 3
opendesk-desktop.exe    -> Windows GUI subsystem 2
ui-host/...             -> correct architecture / publish closure
```

本页不把“workflow 已定义”写成“workflow 已通过”。

### P1：Consumer release hardening

Windows consumer release 尚缺的关键 closure：

- Authenticode + timestamp：desktop、CLI、ui-host 和 Windows 实际加载的 executable/native payload；
- installer / ACL-protected install location 与“只暴露一个用户 shortcut”；
- helper identity/integrity policy：package provenance、signer verification、certificate rotation/update policy；
- parent crash / logout / abnormal exit 后不留下 orphan helper；必要时评估 Windows Job Object / kill-on-close；
- helper crash 的 bounded failure/restart，禁止无限 respawn；
- WebView2 Evergreen / Fixed Version policy 与 clean-machine test；
- SmartScreen、Smart App Control、Defender 与代表性企业 EDR；
- 普通启动无意外 UAC；
- future updater 对下载内容做签名/完整性认证并延续 publisher trust chain；
- Explorer/shortcut 一次启动、无 Console、single-instance、Script Runner / Recorder / Scheduler Center / Runtime Log / Permissions Center、helper 自动启动的真实交互验收。

详见 [Windows Build and Distribution Contract](windows-build-distribution.md)。

### P2：Capability-aware artifact

未来若体积和部署收益足够，再引入独立 Runtime Template Component Manifest；它与 `opendesk.app.json` 分离，先做 inventory/provenance，再考虑 explicit opt-in minimal profile。

候选元数据包括 component id、target OS/arch、Runtime/protocol compatibility、owned files + hashes、dependencies、system prerequisites、optional/default、license/source/provenance。

未知动态依赖默认保留完整 Runtime，或明确拒绝 minimal；不能读取 `capabilities` 后静默删文件。

## 8. 验证器与证据级别

`scripts/verify_platform_payload.py` 是 maintainer read-only checker，不是 Runtime API 或 capability solver。

它负责：关键路径、JS payload、Builder marker、错平台 Runtime 文件、symlink 边界、Windows case-insensitive collision、Windows Desktop/CLI provenance role，以及可选 trusted-reference preservation。

它不证明：PE/Mach-O 真实架构、签名、OS authorization、SmartScreen/Defender、WebView2、UI 行为、OCR/audio 或目标机器 compatibility。

示例：

```bash
python3 -m unittest discover -s tests/distribution -p test_platform_payload.py -v
python3 scripts/verify_platform_payload.py --target macos --root dist/OpenDesk.app
```

Windows：

```powershell
python -m unittest discover -s tests/distribution -p test_platform_payload.py -v
python scripts/verify_platform_payload.py --target windows --root dist/windows/win-x64
```

真实 release gate 必须继续区分：fixture/static -> native build -> hosted deterministic -> interactive desktop -> signed clean-machine / security reputation。

## 9. 下一步执行顺序

```text
Windows source/artifact naming closure
  -> Windows hosted build + App Builder CI
  -> Windows interactive user-session acceptance
  -> Authenticode / clean-machine security qualification
  -> installer / distribution channel
  -> optional stronger helper identity enforcement
  -> 有实际收益后再考虑 capability-aware minimal packaging
```

不要因为都属于“Windows distribution”就把 signing、installer、Custom UI protocol、dependency solver、minimal packaging 在同一轮重构。每一层的 owner、失败模式和验收证据不同。

## 10. 相关文档

- [Windows Build and Distribution Contract](windows-build-distribution.md)：Windows Desktop / CLI / trusted helper 角色与 consumer release gates。
- [App Mode desktop launch](app-mode-desktop-launch.md)：开发态和正式 Desktop 启动语义。
- [Installed Runtime App Builder](../api/app-builder.md)：普通 App 作者从 installed Runtime 生成同平台 artifact。
- [App package format](app-package-format.md)：公开 App Mode package contract。
- `scripts/build_macos_app.sh` / `scripts/build_windows_app.ps1` / `scripts/build_windows_distribution.ps1`：发行源实现。
- `internal/appbuilder/appbuilder.go`：Installed Runtime Builder source-of-truth。
- `pkg/customui/process_driver.go`：Native UI Host discovery/start/protocol owner。
