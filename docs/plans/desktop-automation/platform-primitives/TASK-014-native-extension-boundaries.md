# TASK-014 — Native Extension Boundaries for Peripheral Capabilities

Status: TODO
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
| Camera | | | | |
| Bluetooth | | | | |
| USB | | | | |
| Serial | | | | |
| Printer | | | | |
| Wi-Fi | | | | |
| VPN | | | | |

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
