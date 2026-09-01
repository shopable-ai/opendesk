---
title: Scheduler
description: 内置 JavaScript 定时任务、SQLite 持久化、本地管理页与 HTTP API。
order: 12
---

# Scheduler

OpenDesk HTTP 模式内置一个轻量 Scheduler，用来持久化执行当前工作目录中的
JavaScript 文件或用户直接提交的内联 JavaScript。它不是普通的进程内 `sleep`/timer：
关闭并重新启动 OpenDesk 后，任务和内联正文仍保存在 SQLite 中，并会按 misfire 规则
恢复。

## Scheduler：启动和打开页面

```bash
./opendesk -http -port 60844
```

浏览器打开：

```text
http://127.0.0.1:60844/scheduler
```

页面可以选择“脚本文件”或“内联代码”，创建任务、查看下一次执行时间、暂停、恢复、
立即运行、删除，并查看最近执行记录。页面是嵌入二进制的单个 HTML 文件，不需要
Node.js、npm 或前端构建步骤。

Scheduler 页面和 API 只接受本机 loopback 请求，同时校验 `Host` 与 `Origin`；不会
为 Scheduler 开启 `CORS: *`。即使已有 HTTP 服务监听其他网卡，远程客户端也不能
调用这些 Scheduler 路由。

## Scheduler：脚本来源

任务只支持 `taskType: "script"`，来源分为两种。

### Scheduler：脚本文件

file 模式的脚本必须：

- 是 OpenDesk 启动时当前工作目录内已经存在的 `.js` 文件；
- 不能通过 `..`、绝对路径或符号链接逃出该工作目录；
- 在每次执行开始时重新读取，因此脚本内容更新会用于下一次运行。

旧任务和只传 `scriptPath` 的旧 API 请求自动保持 file 模式。

### Scheduler：内联代码

inline 模式直接保存用户在页面 textarea 或 API `inlineScript` 中提交的 JavaScript
原文：

- 去除首尾空白后必须非空，最大 256 KiB；
- 不要求 `scriptPath`，也不能同时提供有效文件路径；
- 正文持久化到 SQLite，重启恢复后继续使用同一份源码；
- 任务列表、普通日志和校验错误不回显正文，只显示来源为“内联代码”；
- 不是 Markdown eval，也不会从说明文本中提取代码。

Scheduler 会创建一次标准 Execution，并复用现有 JavaScript Runtime、30 分钟默认
timeout、结构化日志和 Evidence。Evidence 默认仍在：

```text
.runtime/runs/scheduler-<timestamp>-<id>/
```

file execution 的 source label 是 `scheduler:file:<path>`，inline execution 是
`scheduler:inline:<jobId>`。两种来源都会生成 `script_snapshot.js`、事件、summary 与
Execution ID。内联 snapshot 属于该次执行的受控 Evidence，不会出现在普通 Job list。

## Scheduler：时间类型

### Scheduler：一次（`at`）

页面中选择日期和时间即可。HTTP API 接受 RFC3339 或本地时间：

```json
{
  "scheduleType": "at",
  "scheduleExpression": "2026-09-02 09:00",
  "timezone": "Asia/Shanghai"
}
```

任务执行一次后自动停用，不自动重试。

### Scheduler：每隔（`every`）

页面中输入数字并选择分钟或小时。HTTP API 使用 Go duration 表达式，例如：

```json
{
  "scheduleType": "every",
  "scheduleExpression": "30m",
  "timezone": "Asia/Shanghai"
}
```

`every` 是 fixed-delay：一次执行完成后，再等待完整 interval，然后开始下一次。
长任务不会按固定时钟频率堆积。第一版最小 interval 是 1 分钟。

### Scheduler：高级（`cron`）

Cron 使用标准 Linux 五字段格式：

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

不接受带秒的六字段 Quartz 表达式。

## Scheduler：重启与 misfire

SQLite 是任务状态的事实源，运行时轮询器只认领数据库中的到期任务。默认策略为：

```text
run_once
```

如果关机期间错过了一次或多次时间，恢复后最多补执行一次。不会把每 5 分钟的任务
一次性补跑几十次。API 也接受 `misfirePolicy: "skip"`，表示跳过错过的时间并计算
下一个未来时间；已经过期的 `at + skip` 会停用。

程序停止时仍处于 `queued` 或 `running` 的记录会标为 `canceled`，随后任务按自己的
misfire 策略恢复。

## Scheduler：串行与操作语义

所有由 Scheduler 触发的 Execution 共用单个 worker，默认串行控制共享桌面：

```text
Scheduler A 执行中 → Scheduler B 排队 → A 完成 → B 开始
```

- 暂停：停止未来自动调度，保留任务和历史；已在运行的 Execution 不会被强制取消。
- 恢复：从当前时间重新进入调度；`run_once` 的过期一次任务会尽快补执行一次。
- 立即运行：无论任务是否暂停，都追加一次串行执行；不会改变原来的未来时间。
- 删除：删除任务和未来调度；已写入 `.runtime/runs/` 的 Evidence 以及 SQLite 中的
  `job_runs` 历史不会被删除。第一版不提供已删除任务的 UI 历史查询入口。

## Scheduler：SQLite 文件

默认数据库位置与 OpenDesk AppStorage 目录保持一致：

```text
~/.opendesk/opendesk/scheduler.db
```

首次进入 HTTP 模式时自动创建目录、数据库表和索引；旧 schema 会幂等增加
`source_type` 与 `inline_script` 列，原有 `scheduled_jobs` 和 `job_runs` 不变。使用的是
`modernc.org/sqlite` 的 CGo-free 嵌入式驱动；用户不需要安装 `sqlite3` CLI、SQLite
动态库、SQLite Server 或任何数据库 daemon。

测试或隔离运行时可以覆盖路径：

```bash
./opendesk -http -scheduler-db ./.runtime/tests/scheduler/scheduler.db
```

## Scheduler：HTTP API

普通用户不必手写 HTTP 请求，直接使用 `/scheduler` 管理页即可。需要从外部本机工具
集成时，可使用创建、列表、暂停、恢复、立即运行、删除和运行历史接口。字段约束、
请求/响应模型、全部端点与 curl 示例见 [Scheduler HTTP API](scheduler-api.md)。

## Scheduler：第一版边界

第一版只在 OpenDesk HTTP 进程持续运行时调度 JavaScript，不负责安装 launchd、
systemd 或 Windows Task Scheduler，也不实现 Agent/Workflow/Shell/Webhook 任务、
分布式 worker、复杂 retry、Scheduler 自带通知策略或 DAG。脚本仍可调用现有 Runtime
的 `notify()`；系统是否展示通知取决于操作系统权限和勿扰设置，不能作为唯一成功证据。
