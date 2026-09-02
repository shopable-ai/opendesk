---
title: TestMonkey HTTP API
description: 说明 -http 模式下的脚本执行、事件流、OCR 与 UI 检测接口。
order: 80
---

# TestMonkey HTTP API

更新时间：2026-05-18

启动方式：

```bash
go run main.go -http
```

默认端口：

- `60844`

默认地址通常为：

- `http://127.0.0.1:60844`

## 通用响应结构

成功：

```json
{
  "code": 0,
  "message": "success",
  "data": {}
}
```

错误：

```json
{
  "code": 400,
  "message": "具体错误"
}
```

## POST /SCRIPT_RUN

旧版脚本执行入口。

### 请求体

```json
{
  "script": "console.log('hello')",
  "timeout": 60,
  "consoleMode": "agent",
  "outputFormat": "json",
  "logDir": ".runtime/runs/custom"
}
```

### 字段说明

- `script`: 必填，JS 源码字符串
- `timeout`: 可选，单位秒；内部会向上换算成分钟
- `consoleMode`: 可选
- `outputFormat`: 可选
- `logDir`: 可选

### 成功响应

```json
{
  "code": 0,
  "message": "script execution started successfully",
  "data": {
    "executionId": "http-xxxx",
    "status": "running",
    "statusUrl": "/executions/http-xxxx",
    "summaryUrl": "/executions/http-xxxx/summary",
    "streamUrl": "/executions/http-xxxx/events",
    "artifacts": { }
  }
}
```

说明：
- 接口是异步执行模型
- 返回 executionId 后，再通过 `/executions/*` 查询

## POST /executions

新版执行创建接口，功能与 `/SCRIPT_RUN` 基本一致。

### 请求体

```json
{
  "script": "console.log('hello')",
  "timeout": 60,
  "logDir": ".runtime/runs/custom"
}
```

## GET /executions/{id}

查询执行状态。

### 成功响应示例

```json
{
  "code": 0,
  "message": "success",
  "data": {
    "executionId": "http-xxxx",
    "status": "running"
  }
}
```

若不存在：
- `404 execution not found`

## GET /executions/{id}/summary

获取执行汇总。

适合在执行结束后读取最终摘要、统计和结果概览。

## GET /executions/{id}/events

SSE 事件流接口。

### 响应头

- `Content-Type: text/event-stream`
- `Cache-Control: no-cache`
- `Connection: keep-alive`

### 事件类型

- `status`
- `log`
- `summary`
- `done`

### categories 过滤

支持：

```text
/executions/{id}/events?categories=meta,script,error,summary
```

默认类别：

- `meta`
- `script`
- `summary`
- `error`

### SSE 示例

```text
event: status
data: {"status":"running",...}

event: log
data: {...}

event: done
data: {...}
```

## GET /status

服务健康检查。

### 返回示例

```json
{
  "status": "ok",
  "runtime_pool": 1,
  "vision_enabled": true,
  "timestamp": 1710000000,
  "latestExecution": {
    "executionId": "http-xxxx",
    "status": "completed"
  }
}
```

## POST /vision/ocr

通过 HTTP 触发 OCR。

### Content-Type

- `multipart/form-data`

### 表单字段

- `image`: 必填，图片文件
- `provider`: 可选，默认 `paddle`
- `lang`: 可选，默认 `ch`

### curl 示例

```bash
curl -X POST http://127.0.0.1:60844/vision/ocr   -F image=@test.png   -F provider=paddle   -F lang=ch
```

### 成功响应

```json
{
  "code": 0,
  "message": "success",
  "data": {
    "provider": "paddle",
    "lang": "ch",
    "text": "识别文本",
    "lines": [],
    "lineCount": 0
  }
}
```

### 常见错误

- 非 POST：`405 method not allowed`
- 表单解析失败：`400 failed to parse form`
- 缺少图片：`400 image file is required`
- OCR 失败：`500 OCR failed: ...`

## POST /vision/detect-ui

通过 HTTP 做基于 OCR 文本的 UI 检测。

### Content-Type

- `multipart/form-data`

### 表单字段

- `image`: 必填，图片文件
- `target_text`: 必填，要定位的文本

### curl 示例

```bash
curl -X POST http://127.0.0.1:60844/vision/detect-ui   -F image=@test.png   -F target_text=登录
```

### 成功响应

```json
{
  "code": 0,
  "message": "success",
  "data": {
    "provider": "paddle",
    "lang": "ch",
    "text": "整图 OCR 文本",
    "count": 1,
    "elements": [
      {
        "role": "button",
        "text": "登录",
        "bbox": { "x": 10, "y": 20, "width": 80, "height": 24 },
        "score": 0.99,
        "clickPoint": { "x": 50, "y": 32 }
      }
    ]
  }
}
```

### 常见错误

- 非 POST：`405 method not allowed`
- 表单解析失败：`400 failed to parse form`
- 缺少图片：`400 image file is required`
- 缺少 `target_text`：`400 target_text is required`
- 检测失败：`500 UI detection failed: ...`
