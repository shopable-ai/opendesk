---
title: Scheduler
description: OpenDesk 计划任务的用户工作流、时间语义、Execution 行为与桌面/Headless 入口。
order: 520
docType: guide
---

# Scheduler

Scheduler 用来把普通 OpenDesk JavaScript 保存为持久计划任务，并在未来时间创建标准 Execution 执行。它不是脚本内的 `sleep()` / timer：OpenDesk 重启后，计划和运行历史仍可恢复，并按明确的 misfire 规则处理错过的时间。

## 先选入口

### OpenDesk 桌面产品

普通桌面用户优先从 OpenDesk 的 **计划中心（Scheduler Center）** 创建、查看和管理计划。

产品层只负责把用户操作连接到 Scheduler service；真正执行仍走：

```text
Scheduler Service
→ standard Execution
→ JavaScript Runtime
→ normal OpenDesk APIs
```

因此计划任务不是另一套脚本 Runtime，也不会因为从桌面 UI 创建就获得额外 API 权限。

OpenDesk Desktop 的菜单、窗口生命周期和 Scheduler Center 归属见 [Desktop Product Shell](../architecture/opendesk-desktop-product-shell.md)。

### Headless / 开发 / 本机集成

需要长驻 HTTP 进程、开发调试或本机工具集成时，可以从要执行脚本的项目目录启动：

```bash
./opendesk -http -port 60844
```

本地管理页：

```text
http://127.0.0.1:60844/scheduler
```

HTTP endpoint、请求/响应字段和 curl 示例统一见 [Scheduler HTTP API](scheduler-api.md)。Web 管理页是本地协议客户端，不是桌面产品里需要重复暴露的第二个普通用户“计划中心”。

## 脚本来源

当前任务类型是 `script`，来源有两种。

### 文件脚本

file 模式执行当前 Scheduler 工作目录内已经存在的 `.js` 文件：

- 路径不能通过 `..`、绝对路径解析或符号链接逃出工作目录；
- 每次执行开始时重新读取，因此文件更新会作用于下一次运行；
- 旧任务和只提供 `scriptPath` 的旧请求保持 file 语义。

### 内联脚本

inline 模式保存调用方明确提交的 JavaScript 源码：

- 去除首尾空白后必须非空；
- 当前正文上限为 256 KiB；
- 不与有效 `scriptPath` 同时使用；
- 不从 Markdown/说明文本中提取代码；
- 普通任务列表和校验错误不回显完整源码。

无论来源如何，实际执行都创建标准 Execution，并生成 Execution ID、结构化事件、summary 与 `script_snapshot.js` 等 Evidence。默认执行证据仍位于 `.runtime/runs/` 下对应的 execution artifact 目录。

## 时间类型

### 一次 at

指定一个时间点。HTTP/协议层接受 RFC3339 或结合 `timezone` 解释的本地时间，例如：

```json
{
  "scheduleType": "at",
  "scheduleExpression": "2026-09-14 09:00",
  "timezone": "Asia/Shanghai"
}
```

一次任务完成后不再产生下一次自动运行。

### 固定间隔 every

使用 duration，例如：

```json
{
  "scheduleType": "every",
  "scheduleExpression": "30m",
  "timezone": "Asia/Shanghai"
}
```

`every` 是 fixed-delay：一次执行结束后，再等待完整 interval 才开始下一次。长任务不会按固定时钟频率叠加自身实例。

### Cron

使用 Linux 五字段 cron：

```text
分钟 小时 日 月 星期
```

例如每天 09:00：

```json
{
  "scheduleType": "cron",
  "scheduleExpression": "0 9 * * *",
  "timezone": "Asia/Shanghai"
}
```

当前不把带秒的六字段 Quartz 表达式当成同一种格式。

## Misfire

Scheduler 必须明确区分“任务本来应该运行”与“OpenDesk 当时没有运行”。

当前策略：

| 策略 | 行为 |
| --- | --- |
| `run_once` | 恢复后最多补执行一次，不把错过的每个间隔全部重放。 |
| `skip` | 跳过已经错过的发生点并计算下一个未来时间；已经过期的一次任务会停用。 |

`run_once` 不等于 exactly-once。进程崩溃、操作系统终止等情况下，业务脚本仍应使用自己的幂等键、外部状态或 postcondition 防止重复副作用。Scheduler 的多 Runtime ownership、takeover 与 SQLite 并发边界见 [Scheduler Runtime Concurrency](../architecture/scheduler-runtime-concurrency.md)。

## 任务操作语义

- **暂停**：阻止未来自动调度；已运行的 Execution 不因暂停而被强制取消。
- **恢复**：让任务重新进入调度并计算下一次时间。
- **立即运行**：额外请求一次运行，不改写正常计划时间；其是否可以被当前 Runtime 接受仍受 Scheduler ownership 规则约束。
- **删除**：删除任务及未来调度，不把已经生成的 Execution Evidence 当成从未发生。

当前 Scheduler 的桌面型任务默认避免同时争用共享桌面资源。具体 single-active Runner、standby、takeover、DB lock 等实现合同属于架构层，不在本用户 Guide 复制，见 [Scheduler Runtime Concurrency](../architecture/scheduler-runtime-concurrency.md)。

## Execution 与权限

计划任务复用现有 JavaScript Runtime，但 Execution mode 仍然决定权限：

- Scheduler 不因为持久化执行而自动获得 `Command`、`SQLite`、Recorder capture 等可信本地能力；
- 通知、桌面、网络等能力仍遵守各自 API 的 capability/permission contract；
- “计划已触发”与“业务完成”是不同事实，最终成功应由 Execution 结果和业务 postcondition 判断。

如果脚本需要给用户提示，可以使用当前 Execution 实际可用的通知能力；通知展示本身不能替代成功证据。

## HTTP 安全边界

Headless 管理页和 Scheduler HTTP API 只面向本机 loopback，并校验 `Host` / 浏览器 `Origin`。不要把这套没有公网认证模型的接口通过反向代理暴露到 LAN 或公网。

完整 transport contract 见 [Scheduler HTTP API](scheduler-api.md)。

## 哪份文档负责什么

| 需求 | 文档 |
| --- | --- |
| 普通用户如何选择入口、理解时间和操作语义 | 本页 |
| HTTP endpoint、Job/JobRun 数据模型、curl | [Scheduler HTTP API](scheduler-api.md) |
| 多 Runtime、Store/Runner ownership、SQLite/WAL/lock、takeover/recovery | [Scheduler Runtime Concurrency](../architecture/scheduler-runtime-concurrency.md) |
| OpenDesk Desktop 中计划中心和菜单归属 | [Desktop Product Shell](../architecture/opendesk-desktop-product-shell.md) |
| Execution 生命周期与 evidence | [Execution Context](execution.md) |

不要在本页重新维护内部表结构、SQLite driver、锁文件和迁移实现；这些细节变化不应迫使普通用户重新理解 Scheduler 的产品语义。
