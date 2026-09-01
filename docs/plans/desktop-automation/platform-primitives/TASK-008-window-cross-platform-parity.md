# TASK-008 — Window Cross-Platform Parity

Status: TODO
Priority: P1
Depends on: TASK-007 recommended

## Goal

审计并补齐 Window 在各平台的真实能力差异，使公共 API 的 capability、错误语义和文档与实现一致；重点不是追求所有平台 100% 相同，而是消除“接口存在但某平台静默失效/行为不同”的不确定性。

## 开始前必须审计

- `docs/api/window.md` 与源码逐项对照。
- Windows/macOS/Linux backend 的 method matrix。
- focus、bounds、maximize/minimize/restore、close、always-on-top、list、active window、PID variants。
- Recorder / Accessibility 是否已有窗口 identity 与 bounds helper。

## 第一阶段：Capability Matrix

为每个平台生成或维护机器可读 capability：

```text
window.list
window.active
window.findByTitle
window.focus
window.getBounds
window.setBounds
window.minimize
window.maximize
window.restore
window.close
window.alwaysOnTop
window.bringToTop
```

每项标记：Stable / Partial / Unsupported / Experimental。

## 第二阶段：修复高价值差异

优先级：

1. active/list/find/focus。
2. get/set bounds。
3. minimize/maximize/restore。
4. close。
5. always-on-top / bringToTop。

只实现有稳定 OS primitive 的能力；不为了矩阵好看使用高脆弱模拟点击。

## 必须解决

- 窗口 identity 与 title 不稳定问题。
- 多个同名窗口。
- coordinate space / scale factor。
- 窗口在不同 Space/desktop 的行为。
- target 已关闭/重建后的 stale reference。
- platform-specific error code。

## 非目标

- 本任务不实现 Menu/Dock/Spaces；分别由后续 integration 卡处理。
- 不把 Accessibility tree API 塞进 Window。
- 不保证 Linux 所有桌面环境一次性完整支持。

## 测试

至少建立同一组 contract tests，在支持的平台执行；Unsupported 必须得到明确结构化结果而不是假成功。

## Done

- 文档与实现的 Window capability matrix 一致。
- macOS/Windows 至少完成核心路径 smoke；其他平台明确列出缺口。
- 不存在新增的重复 Window backend。
- API、类型、机器索引同步。
