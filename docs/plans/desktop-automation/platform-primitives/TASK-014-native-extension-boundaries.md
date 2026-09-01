# TASK-014 — Native Extension Boundaries for Peripheral Capabilities

Status: DEFERRED
Priority: P3
Depends on: none
Mode: ARCHITECTURE_ONLY_BY_DEFAULT

## Goal

为 Camera、Bluetooth、USB、Serial、Printer、Wi-Fi/VPN 管理等外围系统能力建立清晰扩展边界，避免 OpenDesk Core 因“什么都能控制”而持续膨胀。

本任务默认不是实现这些硬件/网络功能，而是确定：哪些能力值得进入 Core，哪些必须通过 Native Extension / integration / external tool 提供。

## 默认判断

以下能力默认不进入 Core：

```text
Camera capture/control
Bluetooth discovery/pairing/control
USB device management
Serial port protocol stacks
Printer management
Wi-Fi/VPN configuration
hardware-specific sensors
```

只有同时满足“桌面自动化高频、跨应用通用、稳定 OS primitive、可统一抽象、维护成本可控”时才允许提出 Core 升级。

## 必须审计

- 当前 Native Extension 机制的 ABI/API、权限、生命周期和错误模型。
- 是否能让 extension 注册 JS namespace / MCP tool / capability。
- extension 的版本兼容、加载失败、签名/权限、安全模型。
- 是否已有第三方 CLI/SDK 可以通过 integration 而非 native code 复用。

## 交付物

至少形成一份 capability placement matrix：

| Capability | Core | Native Extension | Integration | Defer |
|---|---|---|---|---|
| Camera | No | bounded adapter candidate | FFmpeg / OS capture SDK first | generic API / stream |
| Bluetooth | No | device protocol candidate | OS framework / BlueZ first | pairing/admin |
| USB | No | VID/PID protocol candidate | libusb / vendor SDK first | generic management |
| Serial | No | bounded request/response candidate | library / vendor CLI first | persistent stream |
| Printer | No | workflow-specific candidate | CUPS/IPP / platform API first | generic management |
| Wi-Fi | No | deployment-specific only | platform manager first | generic credentials/admin |
| VPN | No | vendor bounded control only | vendor client/service first | tunnel lifecycle/admin |

并给出每项的理由：自动化价值、平台稳定性、权限、依赖体积、维护成本。

## 设计约束

- 不因为某能力“可以做”就加入 Core。
- 不为了单一设备型号增加核心公共 API。
- extension 不允许绕过 OpenDesk 的 execution/evidence/error 边界。
- 若 extension 能力需要高权限，必须显式 capability 与 permission requirement。

## Done

- Core / Extension / Integration 的边界可执行、可审计。
- 文档给出至少一个最小 Native Extension 示例或验证现有示例足够。
- 不实现无明确需求的外围硬件功能。

## Execution record — 2026-09-02

Decision: `DEFER`

Base HEAD: `fb574ea731c73fba91d4fa092184e1c7d6c75f48`

Final Commit: 本任务的 task-closing commit（实际 SHA 见 Git 历史与连续执行最终报告）

Implementation:

- 当前 Native Extension V1 已提供严格 manifest、程序相对 discovery root、不可变 JS namespace、
  one-shot process、1..60000ms deadline、结构化错误与隐私最小化 Evidence；无需再造 extension host。
- `NativeExtensions` 只在受信任的本机 CLI JavaScript 暴露。HTTP/MCP 不能通过请求开启或注入 root，
  也不会把 manifest method 自动注册为 tool/route。
- V1 不是 sandbox/permission broker；manifest 没有 host-enforced permission/capability schema，
  executable 继承 OpenDesk 当前 OS 用户权限。该缺口不在没有具体插件需求时扩展 ABI。
- 更新 [Runtime API 扩展与定制框架](../../../frameworks/runtime-api-extension-framework.md)，明确
  L3a manifest Native Extension 与 L3b first-party Go Core 的分流、外围 placement matrix、
  high-privilege confirmation/capability contract、long-lived external service 边界和第三方 integration
  候选；`docs/api/native-extension.md` 链接该 gate。
- Camera、Bluetooth、USB、Serial、Printer、Wi-Fi、VPN 和 hardware sensors 均未进入 Core；没有
  新增 Runtime global、MCP/HTTP surface、依赖或设备代码。

Tests:

- 当前源码的隔离 source-free `go-basic` bundle 从真实 `<program-directory>` 按公开命令原样通过：
  `./opendesk -script ./quickstart.js -console-mode script`；结果为 `Hello OpenDesk` 和 `42`。
- `go test ./pkg/nativeextension -count=1` 通过。
- `automation`、`pkg/execution`、`pkg/http`、`pkg/mcpserver` 的 Native Extension focused tests 全部
  通过，覆盖冻结 route、execution opt-in、Evidence privacy 及 HTTP/MCP fail-closed。
- 最近的正式 JavaScript Runtime unit gate 418/418 通过；Evidence 位于
  `.runtime/tests/runtime-api/20260901T224026Z-55454/`，其中包含当前 NativeExtensions contract。
- `go test ./...`：Native Extension 与其调用链全部通过；全仓仍仅因既有 `pkg/visionrun` 4 个缺少
  real input/fixture 的测试失败，本卡没有新增失败。
- `git diff --check` 通过。

Evidence:

- `.runtime/tests/platform-primitives/task-014-native-extension-boundaries/audit.json` 记录当前 ABI/API、
  permission/lifecycle/error/Evidence 边界、placement 结论、构建 hash 和测试边界。
- 隔离公开示例 run `direct-20260902-064713-567000` 产生 exactly two successful
  `native_extension_call` events；source-free bundle inventory 仅有 manifest、直接 executable 与可选
  types，没有源码或第三方 JS facade。
- 真实用户 Native Extension root 未写入；没有访问硬件、设备标识、网络凭据或个人业务数据。
- integration 依据：
  [FFmpeg devices](https://ffmpeg.org/ffmpeg-devices.html)、
  [Apple Core Bluetooth](https://developer.apple.com/documentation/corebluetooth)、
  [Windows devices and sensors](https://learn.microsoft.com/en-us/windows/apps/develop/devices-and-sensors)、
  [BlueZ Adapter API](https://bluez.readthedocs.io/en/latest/adapter-api/)、
  [libusb](https://libusb.sourceforge.io/api-1.0/)、
  [go.bug.st/serial](https://pkg.go.dev/go.bug.st/serial)、
  [CUPS](https://openprinting.github.io/cups/) 与
  [NetworkManager nmcli](https://networkmanager.pages.freedesktop.org/NetworkManager/NetworkManager/nmcli.html)。

Remaining:

- 所有外围能力保持 P3/deferred。只有出现明确设备/业务需求、目标平台与权限范围后，才为其中一项
  建独立 integration/Native Extension Goal；不得用本卡作为实现授权。
- Camera stream、Bluetooth watcher、Serial 长驻流与 VPN tunnel lifecycle 不适合 V1 one-shot；
  应使用 external service/MCP，并独立设计认证、取消、backpressure 与 Evidence。
- 若未来要求 Host 强制 permission metadata、publisher authentication、Windows ACL/Job Object 或
  自动 MCP tool registration，均属于 Native Extension ABI/security 的独立 breaking-design Goal。
