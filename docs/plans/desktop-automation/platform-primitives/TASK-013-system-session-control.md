# TASK-013 — System Session Control

Status: TODO
Priority: P2
Depends on: none

## Goal

在现有 shutdown / restart / sleep 等 System 能力基础上，补齐桌面自动化中真正有价值的会话级控制，并保持与电源管理职责清晰。

## 开始前必须审计

- 当前 `System` power/session 相关实现和文档。
- 已有 shutdown/restart/sleep 的权限和错误语义。
- 平台是否已有 lock/logout/screensaver helper。

## 候选能力

```js
System.lock()
System.logout(options?)
System.startScreenSaver()
System.getSessionState()
```

是否加入 `wake`、用户切换等能力必须经过平台稳定性与权限审计，不因接口对称而强行实现。

## 必须解决

- destructive action 的显式确认/安全边界。
- 当前 session identity。
- logout 与 shutdown/restart 的区别。
- 自动化执行被 session lock/logout 中断时的 evidence 和 teardown。
- 平台不支持时明确 capability。

## 非目标

- 不实现账户管理。
- 不实现密码/解锁绕过。
- 不实现远程桌面服务。

## 测试

破坏性操作不能只靠普通 CI。至少要求：unit contract、可安全执行的 lock/screensaver smoke、logout 的人工/隔离环境 evidence，且测试步骤必须能恢复环境。

## Done

- 复用现有 System 架构，不创建第二套 Power/Session 模块。
- destructive action 有清晰安全语义。
- 文档明确真实平台支持矩阵。
