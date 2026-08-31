---
title: HTTP Server API
description: 内置 HTTP 服务的脚本执行、状态查询、SSE 事件流与视觉接口。
order: 11
---

# HTTP server API

当前项目支持 HTTP 服务模式：
- `go run main.go -http`
- 默认端口：60844

路由以 `pkg/http/handler.go` 为准。

## 接口总表

| 方法 | 路径 | 用途 |
| --- | --- | --- |
| POST | /SCRIPT_RUN | 旧版脚本执行入口 |
| GET | /status | 服务状态与最近执行概览 |
| POST | /executions | 创建新的脚本执行 |
| GET | /executions/{id} | 查询执行状态 |
| DELETE | /executions/{id} | 取消运行中的执行 |
| GET | /executions/{id}/summary | 查询执行摘要 |
| GET | /executions/{id}/events | SSE 事件流 |
| POST | /vision/ocr | OCR HTTP 接口 |
| POST | /vision/detect-ui | UI 文本检测 HTTP 接口 |

统一响应包装

成功时通常为：

```json
{
  "code": 0,
  "message": "success",
  "data": { ... }
}
```

错误时通常为：

```json
{
  "code": 400,
  "message": "error message"
}
```

## 1. POST /SCRIPT_RUN

说明
- 旧版兼容入口
- 本质上也会启动一次执行任务

请求体

```json
{
  "script": "console.log('hello')",
  "timeout": 30,
  "stack": "legacy",
  "consoleMode": "agent",
  "outputFormat": "json",
  "logDir": "./.runtime/examples/http-run"
}
```

字段说明

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| script | string | 必填，JS 源码 |
| timeout | number | 秒 |
| stack | string | legacy / upgraded / playwright |
| consoleMode | string | 可选 |
| outputFormat | string | 可选 |
| logDir | string | 可选，产物目录 |

返回值重点
- executionId
- status
- statusUrl
- summaryUrl
- streamUrl
- cancelUrl
- artifacts

## 2. POST /executions

推荐使用的新入口。

请求体与 `/SCRIPT_RUN` 相同。

示例

```bash
curl -X POST http://127.0.0.1:60844/executions \
  -H 'Content-Type: application/json' \
  -d '{
    "script": "console.log(page.title())",
    "stack": "legacy",
    "timeout": 30
  }'
```

成功返回示例

```json
{
  "code": 0,
  "message": "success",
  "data": {
    "executionId": "http-xxxx",
    "status": "running",
    "statusUrl": "/executions/http-xxxx",
    "summaryUrl": "/executions/http-xxxx/summary",
    "streamUrl": "/executions/http-xxxx/events",
    "cancelUrl": "/executions/http-xxxx",
    "artifacts": {
      "scriptSnapshotPath": "..."
    }
  }
}
```

## 3. GET /executions/{id}

作用
- 查询某次执行当前状态

示例

```bash
curl http://127.0.0.1:60844/executions/http-xxxx
```

## 4. DELETE /executions/{id}

取消运行中的执行。取消会同时中止执行 context、在途 HTTP、timer 和尚未执行的
Promise callback；最终状态、摘要和 artifacts 仍通过现有查询接口获得。

```bash
curl -X DELETE http://127.0.0.1:60844/executions/http-xxxx
```

## 5. GET /executions/{id}/summary

作用
- 获取执行摘要

示例

```bash
curl http://127.0.0.1:60844/executions/http-xxxx/summary
```

## 6. GET /executions/{id}/events

作用
- SSE 实时事件流

响应头
- `Content-Type: text/event-stream`
- `Cache-Control: no-cache`
- `Connection: keep-alive`

事件类型
- status
- log
- summary
- done

可选查询参数
- `categories`
  - 逗号分隔
  - 例如：`meta,script,error,summary`

示例

```bash
curl -N 'http://127.0.0.1:60844/executions/http-xxxx/events?categories=script,error'
```

说明
- 即使 categories 过滤了日志，done/status/summary 事件仍会发送

## 7. GET /status

作用
- 查看服务当前状态
- 可能附带最近一次执行快照

返回结构通常包含
- status
- execution_capacity
- vision_enabled
- timestamp
- latestExecution

示例

```bash
curl http://127.0.0.1:60844/status
```

## 8. POST /vision/ocr

作用
- 通过 multipart/form-data 调 Vision OCR

表单字段

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| image | file | 是 | 图片文件 |
| provider | string | 否 | 默认 paddle |
| lang | string | 否 | 默认 ch |

示例

```bash
curl -X POST http://127.0.0.1:60844/vision/ocr \
  -F image=@./.runtime/examples/input.png \
  -F provider=local \
  -F lang=chi_sim+eng
```

## 9. POST /vision/detect-ui

作用
- 通过 multipart/form-data 调 Vision.detectUI

表单字段

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| image | file | 是 | 图片文件 |
| target_text | string | 是 | 目标文本 |

示例

```bash
curl -X POST http://127.0.0.1:60844/vision/detect-ui \
  -F image=@./.runtime/examples/dialog.png \
  -F target_text=确定
```

## stack 参数说明

HTTP 执行接口支持：
- legacy
- upgraded
- playwright

含义
- legacy：默认旧栈
- upgraded：page 指向升级 facade
- playwright：page / browser / context 指向升级 facade

`USE_DI_CONTAINER=0` 不再启用一套独立 Runtime 实现；它保留为路由兼容别名，
与默认模式共享本页的执行、超时、事件、产物和错误语义。

## 错误条件

常见 400
- script 为空
- JSON 不合法
- vision 接口未上传 image
- detect-ui 未传 `target_text`

常见 404
- execution id 不存在

常见 405
- 方法不匹配

## 用户建议

- 新项目优先用 `/executions`
- 需要实时输出时用 `/events`
- 需要 OCR 与 UI 检测时直接走 `/vision/ocr` 与 `/vision/detect-ui`
