# Platform Distribution Capability Closure

## 决策与验收状态

公共能力契约对称，不等于目录、二进制或平台可用性完全相同。P0 保留同平台完整 Runtime 模板复制；不以 `opendesk.app.json.capabilities` 推导可删除文件，不改变 schema v1，不新增 dependency solver。

本轮代码审查先读取 `2761470f4cdb47132d7f87fa8f092afbfbde0e29`，提交前复核 `73d44ee7af4459e0d95239481da52d2fa617d4f9` 及两者差异。本文记录的是这些源码快照，不是目标系统 live qualification。后续并行提交可能继续修改路径。

**尚未完成完整发布验收。** 只读检查器与 fixture 回归已落地；Windows/macOS 原生构建、无源码机器启动、权限、签名和各产品窗口尚需实际证据。尤其是复核时发现 Windows CLI/GUI 文件名大小写冲突，不能把当前 Windows portable 标记为已收口。

### 立即生效的架构决定

| 决定 | 理由 |
| --- | --- |
| 两个平台都保留 Native UI Host | `ProcessDriver.Create -> ensureStarted -> resolveUIHostPath -> exec.Command -> NDJSON create` 是真实运行链路 |
| Windows 保留 publish 的实际完整输出 | 当前 C# 工程启用 self-contained、single-file、native-library self-extract；不能凭经验硬编码一串必需 DLL，也不能只凭 EXE 存在断言 closure 完整 |
| macOS 不复制 Windows host/.NET 实现，Windows 不复制 Apple 实现 | 同一 capability role 使用目标平台 implementation |
| Installed Builder 继续 full same-platform copy | 当前模板入口校验直接要求主程序及 UI host；没有受支持的 no-ui/minimal artifact contract |
| 第三方 App 不继承官方 AppMode 业务包 | Builder 已排除旧 AppMode，重新 stage 用户 package；不是整包无差别复制 |
| Optional 是职责分类，不是当前裁剪授权 | OCR/native extension 等即便业务不使用，P0 仍保留已验证模板中的 payload |
| 文件保全与功能通过分别验收 | 文件存在、散列相同、成功编译都不能证明窗口、权限或系统依赖可用 |
| Windows 对用户只暴露一个普通桌面启动角色 | CLI 是开发/自动化入口；`ui-host` 是 Runtime 自动管理的 child helper，不是第二或第三个用户 App |

### Windows 产品进程模型：多个 executable role，不是多个用户应用

Windows distribution 中存在多个 `.exe` 是实现分工，不代表用户需要手工启动多个程序。目标产品链路固定为：

```text
普通用户
  -> desktop entry                      # 唯一正常桌面启动入口
       -> OpenDesk Runtime / App Mode
            -> Script Runner / Recorder / Scheduler Center / Runtime Log
            -> 需要 host-backed UI 时自动启动 ui-host

开发者 / Terminal / 自动化调用方
  -> CLI entry                          # 命令行入口，不是第二个桌面产品

ui-host
  -> Runtime child helper               # 不在 Explorer/Start Menu 作为用户入口宣传
```

因此需要区分“发行目录里有几个 executable”与“用户需要启动几个 App”：

- 普通用户只启动一个 desktop entry；
- CLI 仅在开发、脚本或运维场景显式调用；
- `ui-host` 由 Runtime 按需启动和关闭，用户不应手工运行；
- Installer/shortcut 层未来只需要把 desktop entry 暴露成正常应用图标，内部 helper 保持隐藏实现角色。

当前大小写冲突不改变上述产品模型；它只是说明现有 Windows 文件名合同错误，必须把 CLI 与 desktop role 改成两个真正不同的路径。

## 1. 三种不同的 closure

| 交付物 | 内容与责任 | 不应混入的语义 |
| --- | --- | --- |
| 官方 Runtime distribution | Runtime core、同平台 native implementation、默认 provider、正式 Builder marker；按发布配置 stage 官方 AppMode | 不等于源码仓库，也不是每个 OS 的实现合集 |
| Installed Builder desktop artifact | 复制已安装的同平台 Runtime，排除旧 AppMode/特定 provenance，stage 用户包；macOS 改写身份并移除失效外层签名 | 不执行 Go 编译、不依据 capabilities 静态裁剪、不证明 publisher signing |
| App Mode package | JavaScript、assets、`opendesk.app.json`；允许 Windows/macOS tray 图标并存 | 不是 Runtime/.NET/AppKit 的安装目录，不要求与目标 artifact 文件树相同 |

Package 自身可以保持 platform-neutral，但业务脚本调用某个 API 的可用性仍需检测。schema v1 的 `capabilities` 是 declaration/prerequisite metadata，不是完整依赖集合、权限授予或 sandbox。

不按 `.icns`、`.ico` 后缀删除用户 package assets：同一 package 可以同时供两平台构建，脚本也可能读取这些文件。未来 target filtering 必须来自明确的资源声明及闭包规则，而不是目录扫描猜测。

## 2. 已读取的真实发行树

这是构建脚本所声明的布局，不是本轮构建出的二进制清单。`[条件]` 表示由发布输入决定。

```text
macOS: OpenDesk.app/Contents/
├── Info.plist
├── MacOS/
│   ├── opendesk
│   ├── polyfills/
│   └── jslibs/
├── Helpers/
│   ├── opendesk-ui-host
│   ├── clawdesk-ui-host       # 当前兼容副本；本轮未删除
│   └── opendesk-status
└── Resources/
    ├── OpenDesk.icns
    ├── inspector_web/
    ├── opendesk-payload.sha256
    ├── OpenDeskAppBuilder/template.json
    ├── NativeExtensions/
    │   ├── com.example.macos-vision/
    │   └── [条件] 其他 provider bundles
    └── [条件] AppMode/

Windows: portable root/
├── opendesk.exe               # 源码声明的 CLI role
├── OpenDesk.exe               # 当前源码声明的 GUI role；大小写冲突，见 P0
├── ui-host/
│   ├── opendesk-ui-host.exe
│   ├── build-provenance.json
│   └── publish 实际产生的其他文件（如有）
├── polyfills/
├── jslibs/
├── resources/opendesk-notification.png
├── sounds/public/{done,fail,warn,captcha}.mp3
├── app-builder-template.json
├── distribution-provenance.json
└── [条件] app-mode/
```

macOS 脚本将 Go host 链接至 `pkg/customui/machost`，Apple Vision helper 从 Swift 源码编译到 `NativeExtensions/com.example.macos-vision`。Swift 源码及编译器是 build 输入；已编译 provider 是 runtime payload。两者不能混为“都可删除的开发资源”。

Windows 完整发布脚本限制为 win-x64。`build_windows_ui.ps1` 单独接受 win-arm64，不代表完整 OpenDesk ARM64 已获支持。

## 3. Platform Payload Classification / Runtime matrix

分类是组件职责；同一 capability 的接口与实现可能分别属于不同类别。

| 组件 | 分类 | 消费者与缺失影响 | macOS / Windows 决策 |
| --- | --- | --- | --- |
| Runtime executable | A 公共必需角色 + B 平台实现 | JS/Execution/File/HTTP/Command 等 Runtime owner | 各自 Mach-O/PE，不能跨 OS 复制 |
| polyfills / jslibs | A | JS facade/库加载；空目录不能证明完整 | 保留实际 `.js` payload；位置按各平台 resolver |
| Native UI Host | B；native-ui capability 实现 | ProcessDriver 启动及协议握手；缺失导致 UI unavailable/创建失败 | 两平台均保留自身实现 |
| .NET publish closure | B Windows | Windows host 启动及 managed/native 依赖 | 保留实际 publish 输出；不要求 single-file 已内嵌的外部文件 |
| WebView2 Runtime | C，HTML/WebSurface 的系统前置依赖 | HTML UI renderer；不是普通 WinForms 控件本身 | 需明确 Evergreen 前置依赖或 Fixed Version 发布方案；.NET self-contained 不代替浏览器 Runtime |
| AppKit / Apple frameworks | B macOS | macOS native host、平台权限/生命周期 | 系统 framework 和本地实现，Windows 不携带 Apple payload |
| Info.plist / CFBundle / TCC usage strings | B macOS | bundle 身份、LaunchServices、权限说明 | Windows 不应要求这些文件；修改身份后重做签名与权限验收 |
| Apple Vision OCR helper | C；当前 macOS 默认打包 | 本地 OCR provider | Windows 不复制；未配置 Windows provider 不得假称同等 OCR 可用 |
| 其他 Native Extensions | C | 对应 extension consumer | P0 保留模板中已打包的 provider；将来按 component/target 规则裁剪 |
| opendesk-status | B macOS，具体状态辅助角色 | legacy/status 生命周期消费者；不同于 ui-host | 本轮保留；不能直接等同于所有 App Shell tray 都必须通过它 |
| notification PNG | B Windows 发布资源 | notification 资源解析 | 当前 Windows 有明确 staging 目的，不应删除 |
| predefined sounds | C，完整 Runtime 默认能力资源 | 预定义声音读取/播放 | Windows `sounds/public/` 有明确消费者；用户不调用不等于 Builder 已支持剥离 |
| Inspector frontend | C，Runtime 附带诊断能力 | Inspector HTTP/UI 静态页面 | macOS 明确打包；不能归为“无 runtime consumer 的源码”；Windows 自包含证据仍需补足 |
| Script Runner / Recorder / Scheduler Center / Runtime Log JS | D 官方产品 | 官方 AppMode 产品入口与窗口 | 官方发布保留；第三方由用户 package 替换，不删除通用 Runtime 后端 |
| App Builder marker | E 构建消费元数据（随 SDK 安装） | 已安装 Runtime 的 `app build` 定位与校验 | 不是开发垃圾，不能因“不在业务脚本运行时读取”就从 SDK 删除 |
| distribution/build provenance、散列 | E 构建/验证/支持元数据 | 模板来源、输入输出归属、完整性 | 替换或保留须遵循 owner；旧发行包 provenance 不代表用户 App 的 provenance |
| icons | 按 owner 分 B / C / D | bundle/tray/native UI/业务资源 | macOS `.icns`、Windows `.ico` 与公共 semantic icon catalog 分开；用户 assets 不盲删 |
| Go/Swift/C# 源码、bin/obj cache、源工作区绝对路径 | E 仅 build/dev | 编译/维护，不是一般 end-user runtime consumer | 明确不应从源码目录整体复制；声明文件/合法 package 源码不按后缀误杀 |
| permissions center UI | D + B native-ui | 窗口展示；permission backend 另有 OS owner | 不把 UI 依赖等同于全部权限检查依赖 |

## 4. ui-host 调用链与功能矩阵

```text
公开 ui.createWindow / FloatingWindow
  -> customui Runtime / Driver
  -> ProcessDriver.Create
  -> ensureStarted
  -> resolveUIHostPath
  -> exec.Command(platform host)
  -> hello / versioned NDJSON / create
     macOS: cmd/opendesk-ui-host/main_darwin.go -> machost.Run -> AppKit
     Windows: opendesk-ui-host.exe -> WinForms native host
              HTML/WebSurface additionally needs WebView2
```

`ProcessDriver.Capabilities` 会检查平台和 host 解析；真正创建时还需要启动与协议握手。路径存在不是协议兼容保证。删除 bundle-local host 后，即使开发机 PATH 恰好补上一个 host，也不能据此证明 artifact 自包含。

| 功能 | native-ui host 依赖 | 其他依赖/验收边界 |
| --- | --- | --- |
| Custom UI / FloatingWindow | 是 | native protocol、控件、事件、窗口生命周期 |
| App Mode 主窗口 | 使用 Custom UI 的主窗口是；App Mode 包解析/生命周期本身不等于窗口 | manifest mainId 与真实窗口一致；两平台实窗仍需验证 |
| 官方 Script Runner | 是 | `apps/opendesk/main.js` 调用产品 runner；还依赖 Command/Execution/脚本列表 |
| Recorder 工具栏 | 是（界面部分） | capture/AX/UIA/OCR/图像/权限属于额外能力；host 存在不代表录制全功能对等 |
| Scheduler Center | 是（中心窗口） | Scheduler backend、存储、执行归属不因此变成 host 实现 |
| Runtime Log | 是（查看窗口） | 日志生产、持久化和读取须独立验证 |
| Tray/Menu | 不笼统归于 ui-host | App Shell 有平台 native 实现；菜单打开中心窗口时才继承该窗口依赖 |
| notification | Custom UI notification 路径依赖 host；其他通知 API 按其 owner 区分 | Windows 资源与系统策略、macOS identity/授权；不能只测打印 |
| OCR | 不因使用 OCR 就必然依赖 ui-host | provider、图像输入、OS 支持；必须用真实图像及读数验证 |
| audio | 不因使用 audio 就必然依赖 ui-host | 播放资源、采集后端、设备/权限、平台版本；不能仅验证音频文件存在 |
| Inspector | 浏览器页面本身不是 native-ui host | 服务器、正确 endpoint、前端 assets 与启动入口；Windows portable 闭包需单独证明 |

App Mode / 官方产品初始化代码已审查，但本表不是每个产品窗口在两个 OS 上均已点击通过的声明。

**Headless 结论：** 理论上，不创建 Custom UI、不调用 host-backed notification、不打开产品窗口的纯 automation 可以拥有 no-ui 配置。但当前 installed Builder 仍要求 host，并执行完整模板复制；当前没有正式 headless/minimal packaging contract。不能通过手工删除 ui-host 把理论变成已支持功能。

## 5. App Builder artifact matrix

| 内容 | macOS Builder | Windows Builder |
| --- | --- | --- |
| 已安装同平台 Runtime | copyTree 保留 | copyTree 保留 |
| 旧官方 AppMode | 跳过 `Contents/Resources/AppMode`，再 stage 用户包 | 跳过 `app-mode`，再 stage 用户包 |
| package 校验 | stage 后再次验证准确输出 | 同左 |
| Runtime UI/provider/Inspector | 仍随模板保留；未按 capabilities 裁剪 | 实际模板中存在的文件仍保留 |
| 身份 | 改写 Info.plist 的 bundle id/name/version 等已有字段 | 使用现有 launcher/manifest contract；不虚构 MSI/MSIX |
| 外层签名 | 删除被修改后失效的 `Contents/_CodeSignature`；重新签名另行验收 | publisher signing 另行验收 |
| provenance | 写 App Builder build-provenance | 排除旧 distribution/app-build provenance，写当前 App build provenance |
| hostless input | 当前入口校验不接受 | 当前入口校验不接受 |

因此，优先优化的是“有证据的模板保全 + 产品包替换”，不是立即创建 runtime component resolver。

## 6. 当前问题与 P0 / P1 / P2

### P0：Correctness，尚有阻塞

**Windows CLI/GUI 文件名冲突。** 复核源码将 `opendesk.exe` 作为 Console subsystem 3、`OpenDesk.exe` 作为 GUI subsystem 2。Windows 默认目录大小写不敏感，两者不是可靠的两个文件；可能互相覆盖，随后 subsystem 检查失败。Builder 两次 `requireRegular` 也不能证明存在两种 role。

目标命名决定统一为：`opendesk.exe`（CLI / developer）与 `opendesk-desktop.exe`（GUI / normal user）。`ui-host/opendesk-ui-host.exe` 保持 Runtime 自动管理的内部 helper。同步改动 build_windows_app、distribution、Builder input/output checks、launcher/文档、native regression 与 provenance；不得只改复制目标。本轮增加检测、测试与架构合同，**尚未完成这组生产路径改名**。

这三个 executable role 的用户语义必须保持：

```text
用户只启动 opendesk-desktop.exe
CLI/脚本显式调用 opendesk.exe
Runtime 在需要 Custom UI 时自动管理 ui-host/opendesk-ui-host.exe
```

此外：

- 两平台 UI host 必须保留并通过握手及真实 UI 验收。
- Windows .NET single-file 与 WebView2 是不同闭包；不要宣称所有 HTML UI 已离线自包含。
- Windows Inspector：已读 Windows 构建脚本没有展示独立 frontend staging；仍需确认是否另有 embedded consumer，未证明前不称作已闭合，也不盲目复制 macOS 目录。
- macOS 默认 OCR helper 的编译、签名、迁移后发现路径仍需目标机证据。
- Runtime / native host 的版本、架构、协议、SHA 与 provenance 要绑定；文件名不是身份。

### P1：Payload Hygiene

不删除本轮没有充分无消费者证据的文件。保留 Windows ui-host/polyfills/jslibs/通知/声音资源；保留 macOS status helper、compatibility host、Inspector、默认 provider。`clawdesk-ui-host` 可成为后续独立兼容退役候选，但须先做 resolver/用户路径/回归审查，不能以“重复文件”直接删。

只对 Runtime-owned 路径执行错误平台检查；AppMode assets 不按平台后缀扫描删除。检查 source-only、cache、绝对工作区引用时使用明确 source/release policy。

### P2：Capability-aware artifact（未实现）

独立 Runtime Template Component Manifest，区别于现有 Builder marker，建议先描述 inventory，不直接驱动删除。

候选字段：component id、target OS/arch、Runtime/protocol compatibility、owned files + hashes、依赖、系统前置条件、optional/default、license/source/provenance。它们是设计内容，**不是本轮新增的公开 manifest 字段**。

顺序：发布端生成可验证 inventory -> Builder 保全校验 -> 实测体积/启动/维护收益 -> explicit opt-in profile -> dependency closure -> target filtering。未知动态调用默认保留完整 Runtime，或拒绝宣称 minimal 已闭合；不读取 capabilities 后静默删除。

只有把 native-ui、OCR、audio、Inspector、Scheduler 等代码与资产的真实 owner、动态依赖和系统前置条件讲清楚，才考虑独立组件化。Recorder/Scheduler Center 等产品 JS 不等于对应通用 backend。

## 7. 新增只读验证器及可执行命令

`scripts/verify_platform_payload.py` 使用 Python 标准库，不是 end-user Runtime 依赖，也不修改发布输入。

- structural：检查关键路径、JS payload 非空、Builder marker、Runtime-owned 错平台文件、symlink 边界与 Windows 大小写冲突。
- reference-preservation：与**独立、已验证**的同平台 Runtime 对比所有不应变化文件的 SHA-256，以及 macOS executable bits；保留其实际 ui-host output 和 provider/Inspector 等，不猜 DLL 清单。
- `--require-reference`：没有独立 reference 时失败；不能拿 artifact 自己或嵌套目录作为证明。
- reference 比较发生在 publisher 重新签名前；签名会合法修改二进制，签名后要使用发布专用证据，不能掩盖 hash mismatch。
- structural 通过只是最小文件约束通过，不是完整 Runtime/provider 发布认证。该工具不检查 PE/Mach-O 架构、协议、签名、OS authorization、HTML renderer 或 UI 行为。

以下命令从仓库根目录运行，目标目录须已存在；检查器不负责构建。fixture 不使用真实 Runtime 二进制。

```bash
python3 -m unittest discover -s tests/distribution -p test_platform_payload.py -v
python3 scripts/verify_platform_payload.py --target macos --root dist/OpenDesk.app
python3 scripts/verify_platform_payload.py --target macos --kind app --root /absolute/output/MyApp.app --reference /Applications/OpenDesk.app --require-reference
```

Windows PowerShell，从仓库根目录运行：

```powershell
python -m unittest discover -s tests/distribution -p test_platform_payload.py -v
python scripts/verify_platform_payload.py --target windows --root dist/windows/win-x64
python scripts/verify_platform_payload.py --target windows --kind app --root C:/output/MyApp --reference C:/OpenDeskRuntime --require-reference
```

日志统一重定向至 `.runtime/tests/platform-payload/`，不提交执行产物。新增 `platform-payload-contract.yml` 仅在三种 OS 上运行 fixture tests；它不执行原生构建，也未替代现有 platform release gates。发布流水线仍应在实际产物生成后加入上面的 artifact 命令与目标 OS smoke。

## 8. 验证记录和剩余 release gate

本轮实际执行：19 个 Python fixture tests 全部通过。覆盖两平台缺失 host、空 JS/文件、marker target/BOM、错平台文件、用户双平台 assets、single-file host、reference 缺失/篡改/重叠、provider/Inspector 保全、symlink、大小写冲突、CLI 退出码和只读性。

本轮未执行：macOS/Windows 原生编译、真实 `app build`、GUI/CLI subsystem 实测、clean-machine launch、Custom UI/Recorder/Scheduler/日志窗口点击、notification/OCR/audio/Inspector 功能、签名/notarization。CI workflow 已定义，不能把定义写成运行通过。

发布资格至少补齐：源 Runtime 与 host 同源/协议；两平台 artifact matrix；移开源码和工具链后的桌面启动；主窗口隐藏/关闭/重开；tray/menu；Recorder；Scheduler Center 与 backend；Runtime Log 与日志源；notification；本地 OCR；audio；Inspector；无 host 的负向行为；Windows 无 WebView2 环境；macOS 新 publisher identity 签名/权限。

在这些证据补齐前，不给出“>=98/100 已验收”的结论。

## 9. 依据与相关文档

以源码为准，路径链接便于后续复核：

- [macOS builder](../../scripts/build_macos_app.sh)、[Windows application builder](../../scripts/build_windows_app.ps1)、[Windows distribution](../../scripts/build_windows_distribution.ps1)、[Windows UI publish](../../scripts/build_windows_ui.ps1)。
- [Installed App Builder](../../internal/appbuilder/appbuilder.go)、[AppMode stage](../../internal/appmodepayload/stage.go)。
- [ProcessDriver](../../pkg/customui/process_driver.go)、[macOS host entry](../../cmd/opendesk-ui-host/main_darwin.go)、[Windows host project](../../pkg/customui/winhost/OpenDesk.UIHost.csproj)。
- [官方 AppMode entry](../../apps/opendesk/main.js)、[Packaging Skill](../../workflows/script-app-packaging/skills/build-script-app/SKILL.md)。
- [App package format](app-package-format.md)、[App Mode desktop launch](app-mode-desktop-launch.md)、[Windows build/distribution](windows-build-distribution.md)；本文补充跨平台 closure 决策，不取代这些契约。
- Microsoft: [Windows case sensitivity](https://learn.microsoft.com/en-us/windows/wsl/case-sensitivity)、[WebView2 distribution](https://learn.microsoft.com/en-us/microsoft-edge/webview2/concepts/distribution)。
