# TASK-011 — Display Control

Status: TODO
Priority: P2
Depends on: none

## Goal

在现有 `Screen.getDisplays()` / display geometry 基础上评估最小可控显示器能力，重点服务桌面自动化测试和环境准备；避免把 OpenDesk 变成显示器管理工具。

## 开始前必须审计

- 当前 display enumeration / virtual bounds / scale factor。
- 是否已有系统亮度、分辨率或显示配置 helper。
- macOS / Windows 对内置屏与外接屏可用的稳定公开 API。

## 候选能力

```js
Display.list()
Display.getPrimary()
Display.getBrightness(id)
Display.setBrightness(id, value)
Display.getMode(id)
Display.listModes(id)
Display.setMode(id, mode)
```

rotation / sleep / color profile 仅在有明确、稳定需求时进入后续阶段。

## 设计约束

- display identity 必须稳定，不仅使用数组 index。
- brightness 对不支持的外接显示器明确 Unsupported。
- resolution/mode 修改必须可恢复，测试不得把开发机留在异常状态。
- 不使用 shell command 作为无声明的 silent backend。
- 不支持的能力优先通过 capability 表达，而不是伪成功。

## 非目标

- 不做 DDC/CI 全功能显示器控制中心。
- 不做色彩校准工具。
- 不强求所有外接显示器一致支持亮度。

## 测试

至少覆盖：display enumeration identity、read-only mode、可支持设备的 brightness read/write/readback、mode change restore、unsupported device、权限/系统错误。

## Done

- 只有稳定且能真实验证的能力进入 Core。
- 不稳定或硬件特定控制转 Native Extension。
- 文档、类型、capability 与真实实现一致。
