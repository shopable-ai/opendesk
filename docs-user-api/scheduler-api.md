---
title: Scheduler HTTP API
description: OpenDesk 本地 Scheduler 的任务管理与运行历史 HTTP API 契约。
order: 13
---

# Scheduler HTTP API

本文是 OpenDesk Scheduler 的 HTTP API 契约。面向普通用户的启动、页面操作、时间
语义、SQLite 位置与重启恢复说明见 [Scheduler 用户指南](scheduler.md)。

## Scheduler API：服务地址与边界

先在需要执行 JavaScript 的项目目录启动 OpenDesk：

```bash
go run ./cmd/opendesk -http -port 60844
```

API 基地址：

```text
http://127.0.0.1:60844/api/scheduler
```

Scheduler API 只接受来自本机 loopback 地址的请求，并校验 `Host` 与浏览器发送的
`Origin`。它不开放跨域访问，也不提供公网认证能力。不要通过反向代理把这些接口
暴露到局域网或公网。

管理页使用本 API，但 Scheduler 执行任务时不会发 HTTP 请求调用自己。内部执行链路
是 `Scheduler Service -> Execution Runtime -> JavaScript Runtime`。当前版本通过
`-http` 模式承载 Scheduler 的长驻生命周期，因此 OpenDesk 进程必须保持运行。

## Scheduler API：通用响应

成功响应的 HTTP 状态为 `200`，统一格式为：

```json
{
  "code": 0,
  "message": "success",
  "data": {}
}
```

错误响应使用对应的 HTTP 状态码，并把同一个状态码写入 `code`：

```json
{
  "code": 400,
  "message": "job name is required"
}
```

常见状态码：

| HTTP 状态 | 含义 |
| --- | --- |
| `200` | 请求成功 |
| `400` | JSON、字段、时间表达式或脚本来源无效，或请求体超限 |
| `403` | 非本机请求、非法 `Host` 或跨域 `Origin` |
| `404` | 任务不存在或已删除 |
| `405` | 当前路径不支持该 HTTP 方法 |

所有时间字段在 JSON 中使用 RFC3339 格式。任务 ID、运行 ID 和 Execution ID 都应视为
不透明字符串，不要解析其内部格式。

## Scheduler API：数据模型

### Scheduler API：Job 数据模型

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | string | 任务 ID |
| `name` | string | 任务名称，最长 200 字符 |
| `enabled` | boolean | 是否参与未来自动调度 |
| `scheduleType` | string | `at`、`every` 或 `cron` |
| `scheduleExpression` | string | 与时间类型对应的表达式 |
| `timezone` | string | IANA 时区名，例如 `Asia/Shanghai`；默认 `Local` |
| `misfirePolicy` | string | `run_once` 或 `skip`；默认 `run_once` |
| `taskType` | string | 当前只支持 `script` |
| `sourceType` | string | `file` 或 `inline`；旧任务和未传此字段的请求默认为 `file` |
| `scriptPath` | string | 仅 file 模式返回；相对于 OpenDesk 启动目录的 `.js` 文件路径 |
| `hasInlineScript` | boolean | 仅 inline 模式返回 `true`，表示正文已持久化；不会返回正文 |
| `createdAt` | string | 创建时间 |
| `updatedAt` | string | 最后更新时间 |
| `lastRunAt` | string | 可选，上一次开始执行的时间 |
| `nextRunAt` | string | 可选，下一次自动调度时间；暂停或单次任务完成后省略 |
| `lastRun` | JobRun | 可选，最近一次运行 |

### Scheduler API：JobRun 数据模型

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | string | Scheduler 运行记录 ID |
| `jobId` | string | 所属任务 ID |
| `scheduledAt` | string | 此次运行计划进入队列的时间 |
| `startedAt` | string | 可选，实际开始时间 |
| `finishedAt` | string | 可选，完成时间 |
| `status` | string | `queued`、`running`、`succeeded`、`failed`、`canceled` 或 `skipped` |
| `error` | string | 可选，失败或取消原因 |
| `executionId` | string | 可选，对应现有 Execution Runtime 与 `.runtime/runs/` Evidence |

`POST .../run` 返回 `queued` 只表示已经入队。要获取最终结果，应查询任务运行记录，
直到该记录进入 `succeeded`、`failed`、`canceled` 或 `skipped`。

## Scheduler API：创建任务

```http
POST /api/scheduler/jobs
Content-Type: application/json
```

请求字段：

| 字段 | 必填 | 取值与默认值 |
| --- | --- | --- |
| `name` | 是 | 非空字符串，最长 200 字符 |
| `sourceType` | 否 | `file` 或 `inline`；省略时默认 `file`，保持旧请求兼容 |
| `scriptPath` | file 模式是 | 启动目录内已经存在的普通 `.js` 文件；推荐使用相对路径。绝对路径也必须解析到该目录内，不能通过 `..` 或符号链接逃出目录 |
| `inlineScript` | inline 模式是 | 要执行的 JavaScript 原文，去除首尾空白后必须非空，UTF-8 字节数最多 262144（256 KiB） |
| `scheduleType` | 是 | `at`、`every`、`cron` |
| `scheduleExpression` | 是 | 见下方三种时间格式 |
| `timezone` | 否 | IANA 时区或 `Local`；默认 `Local` |
| `misfirePolicy` | 否 | `run_once` 或 `skip`；默认 `run_once` |
| `taskType` | 否 | 只能是 `script`；默认 `script` |

`scriptPath` 与非空 `inlineScript` 必须恰好提供一个，不能同时提供。inline 模式不会把
正文当成 Markdown 或模板解析，而是把用户明确提交的 JavaScript 原文持久化并交给
现有 JavaScript Runtime。请求 JSON 不接受未知字段，也不接受一个请求体中出现多个
JSON 值；HTTP 请求体上限为 2 MiB，内联正文仍受独立的 256 KiB 上限约束。

### Scheduler API：脚本文件模式

旧请求可以继续省略 `sourceType`：

```json
{
  "name": "文件任务",
  "scriptPath": "scripts/report.js",
  "scheduleType": "at",
  "scheduleExpression": "2026-09-02 09:00",
  "timezone": "Asia/Shanghai"
}
```

也可以显式传 `"sourceType": "file"`。每次执行开始时重新读取文件，并继续执行路径
规范化、工作目录边界、符号链接和 `.js` 校验。

### Scheduler API：内联模式

```json
{
  "name": "内联完成提示",
  "sourceType": "inline",
  "inlineScript": "notify({title: 'OpenDesk', message: '定时任务完成'});\nconsole.log(new Date().toISOString());\nreturn {ok: true};",
  "scheduleType": "at",
  "scheduleExpression": "2026-09-02T09:00:05+08:00",
  "timezone": "Asia/Shanghai",
  "misfirePolicy": "run_once",
  "taskType": "script"
}
```

正文保存在 Scheduler SQLite 中，因此 OpenDesk 重启后仍可执行。创建响应、任务列表、
暂停/恢复响应、普通服务日志与校验错误都不会回显正文；公开 Job 只返回
`sourceType: "inline"` 与 `hasInlineScript: true`。执行时仍会在该 execution 的受控
`.runtime/runs/<executionId>/script_snapshot.js` 中生成标准 snapshot 和 Evidence。

### Scheduler API：一次任务（at）

`scheduleExpression` 接受 RFC3339，或按 `timezone` 解释的本地时间：

```json
{
  "name": "明早生成报告",
  "scriptPath": "scripts/report.js",
  "scheduleType": "at",
  "scheduleExpression": "2026-09-02 09:00",
  "timezone": "Asia/Shanghai",
  "misfirePolicy": "run_once",
  "taskType": "script"
}
```

本地时间支持 `YYYY-MM-DD HH:MM`、`YYYY-MM-DD HH:MM:SS` 以及使用 `T` 分隔的同类
格式。`at + skip` 不允许创建已经过去的时间；`at + run_once` 可以在恢复后最多补跑
一次。

### Scheduler API：固定间隔（every）

`scheduleExpression` 使用 Go duration，例如 `5m`、`30m`、`2h`，最小为一分钟：

```json
{
  "name": "每两小时同步",
  "scriptPath": "scripts/sync.js",
  "scheduleType": "every",
  "scheduleExpression": "2h",
  "timezone": "Asia/Shanghai"
}
```

`every` 是 fixed-delay：上一次执行完成后，再等待完整 interval。它不会让同一任务
按固定时钟频率堆积。

### Scheduler API：Cron

Cron 使用 Linux 标准五字段，不含秒：

```text
分钟 小时 日 月 星期
```

例如每天 09:00：

```json
{
  "name": "每天九点",
  "scriptPath": "scripts/report.js",
  "scheduleType": "cron",
  "scheduleExpression": "0 9 * * *",
  "timezone": "Asia/Shanghai",
  "misfirePolicy": "run_once"
}
```

完整请求示例：

```bash
curl --fail-with-body -X POST \
  http://127.0.0.1:60844/api/scheduler/jobs \
  -H 'Content-Type: application/json' \
  -d '{
    "name": "每天九点",
    "scriptPath": "scripts/report.js",
    "scheduleType": "cron",
    "scheduleExpression": "0 9 * * *",
    "timezone": "Asia/Shanghai",
    "misfirePolicy": "run_once",
    "taskType": "script"
  }'
```

成功时，`data` 是创建后的公开 Job；inline 正文不会出现在响应中。

## Scheduler API：列出任务

```http
GET /api/scheduler/jobs
```

```bash
curl --fail-with-body http://127.0.0.1:60844/api/scheduler/jobs
```

成功时，`data` 是 Job 数组；没有任务时返回空数组 `[]`。inline 任务只显示来源类型与
正文存在标记，不显示完整源码。

## Scheduler API：暂停任务

```http
POST /api/scheduler/jobs/{id}/pause
```

```bash
curl --fail-with-body -X POST \
  http://127.0.0.1:60844/api/scheduler/jobs/job-example/pause
```

成功时，`data` 是更新后的 Job，`enabled` 为 `false`。暂停只阻止未来自动调度，保留
任务和运行历史；已经开始的执行不会被强制取消。

## Scheduler API：恢复任务

```http
POST /api/scheduler/jobs/{id}/resume
```

```bash
curl --fail-with-body -X POST \
  http://127.0.0.1:60844/api/scheduler/jobs/job-example/resume
```

成功时，`data` 是更新后的 Job，`enabled` 为 `true`，并重新计算 `nextRunAt`。

## Scheduler API：立即运行

```http
POST /api/scheduler/jobs/{id}/run
```

```bash
curl --fail-with-body -X POST \
  http://127.0.0.1:60844/api/scheduler/jobs/job-example/run
```

成功时，`data` 是新建的 JobRun，初始状态通常为 `queued`。立即运行也适用于暂停的
任务，并且不会修改原有的下一次自动调度时间。所有 Scheduler 执行共享一个串行
worker；另一个桌面任务正在执行时，本次运行会等待。

## Scheduler API：查询运行记录

```http
GET /api/scheduler/jobs/{id}/runs?limit=50
```

`limit` 可省略，默认 `50`，允许范围为 `1` 到 `100`。

```bash
curl --fail-with-body \
  'http://127.0.0.1:60844/api/scheduler/jobs/job-example/runs?limit=20'
```

成功时，`data` 是按最近优先排列的 JobRun 数组。

## Scheduler API：删除任务

```http
DELETE /api/scheduler/jobs/{id}
```

```bash
curl --fail-with-body -X DELETE \
  http://127.0.0.1:60844/api/scheduler/jobs/job-example
```

成功响应：

```json
{
  "code": 0,
  "message": "success",
  "data": {
    "id": "job-example",
    "deleted": true
  }
}
```

删除会停止未来调度。已经写入 `.runtime/runs/` 的 Evidence 和 SQLite 中的运行记录
不会被物理破坏，但当前 API 不再允许通过已删除任务 ID 查询历史。正在执行的任务
不会被强制终止。

## Scheduler API：与管理页的关系

管理页地址：

```text
http://127.0.0.1:60844/scheduler
```

页面只是一层极简本地客户端，通过本页定义的 API 完成创建、列表、暂停、恢复、立即
运行、删除和历史查询。调用 API 不是创建任务的唯一用户方式；普通用户可直接使用
管理页，自动化工具和集成程序再使用 HTTP API。
