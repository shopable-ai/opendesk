# macOS 自动化授权配置

这份说明只处理一件事: 让当前 macOS 机器上的 Clawdesk 权限绑定到正确的主体, 并且能稳定触发授权窗口。

## 需要哪些权限

1. `辅助功能 (Accessibility)`
   - 用于点击、键盘输入、窗口焦点和窗口控制
   - 路径: `系统设置 -> 隐私与安全性 -> 辅助功能`
2. `屏幕录制 (Screen Recording)`
   - 用于截图、窗口识别、OCR、布局分析
   - 路径: `系统设置 -> 隐私与安全性 -> 屏幕录制`
3. `自动化 (Automation)`
   - 用于控制 `System Events`、Finder、Safari、微信等其他应用
   - 这项没有“+ 添加应用”，只能靠程序先发起一次真实 AppleEvents 请求，再由系统弹窗授权
4. `输入监控 (Input Monitoring)`
   - 当前不是基础链路硬要求，但很多录制/热键场景会需要

## 怎样检查当前权限

先区分两件事:

1. `Screen Recording` / `Accessibility` 可以做运行时预检
2. `Automation` 不能靠静态布尔值确认, 必须发起一次真实 AppleEvents 请求

推荐检查顺序:

### 1. 先重编当前仓库 app

```bash
./scripts/build_macos_app.sh
```

这一步会同时更新:

- `dist/clawdesk`
- `dist/Clawdesk.app`

### 2. 检查 app 身份是不是对的

```bash
plutil -p dist/Clawdesk.app/Contents/Info.plist | rg CFBundleIdentifier
codesign -dv --verbose=4 dist/Clawdesk.app 2>&1 | rg 'Identifier=|Signature='
```

至少要看到:

- bundle id 是 `com.clawdesk.cli`
- 你当前调试用的就是同一个 `dist/Clawdesk.app`

如果一台机器同时有多个 `Clawdesk.app` 副本, 调试时尽量只固定使用一个路径, 否则 TCC 身份容易漂。

### 3. 运行时预检 Screen Recording / Accessibility

```bash
./dist/clawdesk -script-text 'const r = await page.checkScreenshotPermissions(); console.log(JSON.stringify(r, null, 2));' -timeout 5
```

预期结果:

- `screenCapture=true`
- `accessibility=true`
- `ok=true`

`automation` 字段如果显示 `requires runtime AppleEvents trigger`, 这是正常的, 不是失败。

说明:

- 这条命令检查的是“当前运行主体”的权限状态
- 如果你是从终端或 Codex 里执行, 结果反映的是 shell-hosted 身份
- 它的好处是不会额外读取仓库里的脚本文件, 因而不会把 `Documents Folder` 提示混进来

### 4. 触发并验证 Automation

```bash
open dist/Clawdesk.app --args -script examples/mac/request-macos-automation-popup.js -timeout 2
```

如果你只想跑一个最小“判断脚本”:

```bash
open dist/Clawdesk.app --args -script examples/mac/automation_permission_check.js -timeout 2
```

验收点:

- 系统弹窗主体显示为 `Clawdesk`
- 目标应用通常是 `System Events`
- 允许后再次运行同一命令, 不应该再卡在授权弹窗

`automation_permission_check.js` 的返回重点:

- `state=granted`: 当前 app 身份已经有 Automation 权限
- `state=pending_user_consent`: 系统刚触发弹窗, 还在等用户确认
- `state=denied_or_failed`: 当前没有通过, 需要继续排查主体身份或 TCC 记录

如果你想看系统侧证据, 触发后马上检查 TCC 日志:

```bash
log show --style compact --last 5m --predicate 'process == "tccd" OR subsystem == "com.apple.TCC"' | rg 'com.clawdesk.cli|ScreenCapture|AppleEvents|Accessibility'
```

这里最有价值的是:

- 请求主体是不是 `com.clawdesk.cli`
- `ScreenCapture` / `AppleEvents` 是不是落到了错误宿主上

如果你的仓库路径本身在 `~/Documents/...`, 那么首次用下面这种方式启动:

```bash
open dist/Clawdesk.app --args -script examples/mac/request-macos-automation-popup.js -timeout 2
```

macOS 还可能先弹一个 `Documents Folder` 权限。这个权限只说明 app 正在读取位于 `Documents` 目录下的脚本文件, 不代表自动化链路本身又多了一个必需 TCC 项。

如果你不想让这个提示干扰 Automation 调试, 直接改用 bootstrap helper:

```bash
./scripts/run_permission_bootstrap.sh
```

### 5. 手动在系统设置里复核

打开下面几页确认:

- `系统设置 -> 隐私与安全性 -> 辅助功能`
- `系统设置 -> 隐私与安全性 -> 屏幕录制`
- `系统设置 -> 隐私与安全性 -> 自动化`
- `系统设置 -> 隐私与安全性 -> 输入监控`（仅在你要跑热键/录制时）

## 为什么你会看到 `sshd-keygen-wrapper`

如果权限弹窗写的是:

- `Terminal wants to record this computer's screen`
- `iTerm wants to control System Events`
- `sshd-keygen-wrapper wants to record this computer's screen`

这表示本次请求是由“脚本宿主”发起的，不是由 `Clawdesk.app` 这个产品身份发起的。

在 Codex、Hermes、远程 shell、某些包装终端里跑脚本时，这种情况很常见。结果是:

- 权限会绑到宿主进程
- 不是绑到 `com.clawdesk.cli`
- 后续你换成 `.app` 启动时，权限可能还要再授一次

如果目标是给 Clawdesk 本身配置权限，优先使用固定的 App 身份:

```bash
open dist/Clawdesk.app --args -script examples/mac/request-macos-automation-popup.js -timeout 2
```

如果只是从命令行直接执行:

```bash
./dist/clawdesk -script examples/mac/request-macos-automation-popup.js -timeout 2
```

那么系统更可能把权限视为“终端宿主链路”的一部分。

除了弹窗主体不对, 命令行驱动还会带来两个额外问题:

1. 你授予的权限可能只对 `Terminal` / `iTerm` / `Codex` 生效, 换成 `.app` 启动后仍然要再授权
2. 如果你反复 ad-hoc 重签名或混用多个 `Clawdesk.app` 副本, TCC 可能把它们视为不同身份, 导致“昨天能用, 今天又要弹窗”

## 推荐流程

### 1. 先打开权限页

```bash
open dist/Clawdesk.app --args -script examples/mac/open-permission-settings.js -timeout 2
```

### 2. 触发 Automation 弹窗

```bash
open dist/Clawdesk.app --args -script examples/mac/request-macos-automation-popup.js -timeout 2
```

如果你想同时检查屏幕录制和辅助功能:

```bash
open dist/Clawdesk.app --args -script examples/mac/request-macos-permissions.js -timeout 2
```

### 3. 如果弹窗一闪而过, 用向导脚本保持进程

```bash
open dist/Clawdesk.app --args -script examples/mac/automation-permission-wizard.js -timeout 5
```

这个脚本会:

- 打开 Automation 设置页
- 派发一次真实的 AppleEvents 请求
- 保持进程一段时间, 方便你在系统弹窗里点“允许”

## 如果已经授权给了错误主体

重置后重新走 `.app` 流程:

```bash
./scripts/reset_macos_permissions.sh
```

这个脚本会重置:

- `com.clawdesk.cli`
- `com.apple.Terminal`
- `com.googlecode.iterm2`

如果你看到的是别的宿主名, 重点不是继续给那个宿主授权, 而是改用 `dist/Clawdesk.app` 重新触发。

## 如果本机工具链坏了, 先用 bootstrap helper

有些机器会遇到 Command Line Tools 的 linker 损坏, 典型表现是:

- `go build` 失败
- `swiftc` 失败
- 错误里出现 `Library not loaded: '@rpath/libtapi.dylib'`

这时不要继续从源码重编 `dist/Clawdesk.app`, 先构建一个纯 Go 的权限 bootstrap app:

```bash
./scripts/build_permission_bootstrap_app.sh
open -n "$(pwd)/artifacts/macos-permission-bootstrap/Clawdesk.app" --args -mode all -keepalive 90s
```

如果还需要稳定触发 `System Events` 的 Automation 授权弹窗, 再启动 AppleScript applet fallback:

```bash
./scripts/build_automation_bootstrap_app.sh
open -n "$(pwd)/artifacts/macos-permission-bootstrap/Clawdesk Automation.app" --args "System Events"
```

也可以直接一条命令同时启动两者:

```bash
./scripts/run_permission_bootstrap.sh
```

这个 helper 的目的只有两个:

1. 用 `Clawdesk` 的 bundle 身份触发 `Screen Recording` 与 `Automation` 弹窗
2. 避免把权限继续绑到 `Terminal`、`Codex`、`sshd-keygen-wrapper` 这类宿主上

说明:

- helper 的 bundle id 仍然是 `com.clawdesk.cli`
- `mode all` 会打开 `Screen Recording`、`Automation`、`Accessibility` 设置页
- `Accessibility` 这里仍然需要手动在系统设置里打开; macOS 没有可靠的非原生自动授权接口
- Screen/settings helper 的日志默认写到 `$(getconf DARWIN_USER_TEMP_DIR)clawdesk-permission-bootstrap.log`

## 验收标准

满足下面几条就算配置正确:

1. `dist/Clawdesk.app` 首次触发截图或自动化时, 系统弹窗主体是 `Clawdesk`
2. `page.checkScreenshotPermissions()` 返回 `screenCapture=true` 且 `accessibility=true`
3. `page.requestMacAutomationPermission("System Events")` 不再卡死脚本
4. 自动化脚本再次运行时, 不会把权限提示显示成 `sshd-keygen-wrapper`
