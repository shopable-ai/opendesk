# OpenDesk System Permissions + Recorder Recovery P0

> 状态：Frozen P0 implementation contract
> 日期：2026-09-14
> 范围：OpenDesk 官方桌面应用的系统权限菜单、权限窗口，以及 Recorder 在权限变化后的重新检查与恢复。
> 原则：解决当前真实用户链路，不建设新的 Automation Readiness 框架。

## 1. 目标

本轮只解决这一条产品链路：

```text
OpenDesk
→ 系统权限…
→ 查看/处理系统授权
→ 返回 Recorder
→ 查看详情时重新检查
→ 条件已恢复则恢复“开始录制”
→ 用户手动开始录制
```

必须做到：

- 权限检查本身不主动请求授权；
- 用户主动执行“请求授权”时才允许触发系统授权流程；
- Recorder 不长期使用启动时的一份旧 capability 结果；
- 权限或录制条件恢复后，不因为 UI 缓存旧状态而要求用户退出重开 OpenDesk；
- 检查成功只恢复按钮，不自动开始录制；
- 无法确认时保持 unknown/不可确认，不伪装为“已授权”或“可录制”。

## 2. Tray / Menu 冻结方案

本轮只调整现有权限入口，不新增新的诊断菜单。

相关片段目标：

```text
计划中心
新建计划…
────────────────
系统权限…
运行日志…
```

要求：

- `权限管理…` 改为 `系统权限…`；
- 保留现有 `open-permissions` menu id；
- 保留现有 `permissions.open` action；
- 保留原来的菜单位置；
- 菜单名称固定，不再动态改成“权限管理（部分功能受限）…”或“权限管理（需要处理）…”；
- 不新增“Automation Readiness”“能力诊断”“运行环境检测”等菜单。

原因：此入口只负责 OS/system permission，不应该向用户暗示它代表所有桌面自动化是否可执行。

## 3. 系统权限窗口

窗口定位从泛化的“权限管理”收口为“系统权限”。

目标展示：

```text
系统权限                         [重新检查] [关闭]

辅助功能        已授权
屏幕录制        已授权
输入监控        未授权            [打开系统设置]
自动化          按目标应用授权

这里只检查系统授权。
具体能否开始录制，请以录制器的检查结果为准。
```

要求：

- 窗口标题使用 `系统权限`；
- `刷新` 改为 `重新检查`；
- 重新检查只读取状态，不主动触发授权；
- 去掉容易被理解成“整个自动化系统可用”的泛化 `整体状态：可用/部分受限` 用户表达；
- 每个权限继续显示自己的真实状态；
- 已授权项目不显示无意义的“已就绪”操作按钮；
- 只有当前状态和平台确实支持的操作才显示/启用，例如 `请求授权` 或 `打开系统设置`；
- Windows 对不存在对称系统授权的能力明确显示“无需额外系统授权”，但不能表述成“自动化已经全部可用”；
- 保留当前窗口单实例/复用、请求去重、并发控制；
- 打开窗口、聚焦窗口、启动 preflight、点击重新检查都不得自动弹出授权窗口。

## 4. Recorder 恢复流程

不新增 Recorder 工具栏按钮，不移动现有按钮，不重构 Recorder UI。

复用：

- `开始录制`
- `查看详情`

当前问题是 Recorder 初始化时取得 `Recorder.getCapabilities()` 后，UI 容易继续使用这份旧结果。本轮应把 capability 读取变成可重新获取的当前状态。

### 4.1 开始录制

用户点击 `开始录制` 时：

```text
重新读取当前 Recorder capability
→ 条件可用：继续现有倒计时/录制流程
→ 条件不可用：不启动录制，保存明确原因，并引导查看详情
→ 检查失败：保持不可确认，不自动开始
```

不要自动请求权限。

### 4.2 查看详情

Recorder 处于非活动录制状态时，点击 `查看详情`：

```text
先静默重新读取当前 Recorder capability
→ 更新当前状态和详情
→ 如果条件已经恢复，恢复“开始录制”按钮
→ 显示当前最新结果
```

示例：

```text
暂不能录制

原因：输入监控未授权。
处理：从 OpenDesk 系统托盘打开“系统权限…”，完成设置。
返回录制器后，再次点击“查看详情”重新检查。
```

如果某项权限/能力在当前平台修改后确实必须重启才能生效，应明确提示重启；不得统一承诺“重新检查一定恢复”。

### 4.3 状态保护

重新检查不得：

- 丢弃已经保存的录制目录；
- 清掉已经生成的 actions/candidate/script；
- 自动重放；
- 自动开始录制；
- 把未知状态误判为 denied；
- 把非权限原因统一解释成权限失败。

## 5. 本轮代码修改范围

优先修改现有文件，不建立新的领域框架：

```text
apps/opendesk/opendesk.app.json
apps/opendesk/permissions-center.js
apps/opendesk/recorder/controller-core.js
```

根据真实实现补充/更新现有测试：

```text
tests/app-lifecycle/permissions-center.test.js
tests/app-lifecycle/product-app-controller.test.js
Recorder 对应现有 controller/UI 测试
```

如果底层 `Recorder.getCapabilities()` 或 permission bridge 被测试证明存在状态缓存、静默检查错误触发请求、或无法反映当前状态，才沿现有实现做最小修复。

不要预先新增：

```text
pkg/automationreadiness/
新的公共 Readiness API
新的诊断中心
新的 Tray owner
新的 Recorder 窗口
Windows integrity/session 探测框架
```

这些能力只有在后续出现多个真实消费者或明确故障场景时，再独立设计。

## 6. 验收标准

必须至少覆盖：

1. Tray 权限入口固定显示 `系统权限…`，不会因为 preflight/refresh 被动态改回旧名称。
2. 重复点击 `系统权限…` 复用同一个窗口，不创建多个窗口。
3. 启动、打开、聚焦、重新检查系统权限均不会自动触发授权请求。
4. 用户主动请求权限时，仍能沿现有 permission contract 工作。
5. 已授权权限不显示无意义操作；未授权时只展示适用的 remediation action。
6. Recorder 初始 capability 不可用时，显示真实原因，不统一写成“需要授权”。
7. 用户在系统设置完成授权后，返回 Recorder 点击 `查看详情` 能重新读取当前状态；如果 Runtime/OS 已生效，`开始录制` 恢复。
8. 点击 `开始录制` 前再次读取当前 capability，不能依赖应用启动时的旧快照。
9. capability 重新检查失败时，不自动开始录制，不伪造 ready，并保留现有录制/生成资产。
10. 原 Recorder 录制、停止、生成、历史、重放以及 Permission Center 请求授权流程不回归。
11. 单元/合同测试与真实 macOS/Windows UI 验收结果分开报告；未进行真实平台测试时明确标记 `NOT RUN`。

## 7. 与更大 Readiness 设计的关系

本轮明确不实施通用 Automation Readiness / Effective Capability 框架。

保留一个产品事实：

```text
System Permission != automation success
```

但当前只修复已经存在的系统权限入口和 Recorder capability refresh/recovery 链路。

后续只有出现例如 Windows higher-integrity target、cross-session target、多个产品功能都需要共享统一 capability decision 等真实需求时，再重新评估是否需要独立 Readiness 层。
