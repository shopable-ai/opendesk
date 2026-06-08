---
title: TestMonkey HTTP 服务 API
description: 面向服务调用方的 HTTP 接口文档，包括脚本执行、状态查询、SSE 事件流与视觉接口。
order: 50
---

# TestMonkey HTTP 服务 API

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

## 1. POST /SCRIPT_RUN

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

| 字段 | 说明 |
| --- | --- |
| `script` | 必填，JS 源码字符串 |
| `timeout` | 可选，单位秒 |
| `consoleMode` | 可选 |
| `outputFormat` | 可选 |
| `logDir` | 可选 |

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
    "artifacts": {}
  }
}
```

说明：
- 这是异步执行模型
- 返回 `executionId` 后，再通过 `/executions/*` 查询

## 2. POST /executions

新版执行创建接口，和 `/SCRIPT_RUN` 基本一致。

## 3. GET /executions/{id}

查询执行状态。

## 4. GET /executions/{id}/summary

获取执行汇总。

## 5. GET /executions/{id}/events

SSE 事件流接口。

### 事件类型

- `status`
- `log`
- `summary`
- `done`

### categories 过滤

```text
/executions/{id}/events?categories=meta,script,error,summary
```

默认类别：
- `meta`
- `script`
- `summary`
- `error`

## 6. GET /status

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

## 7. POST /vision/ocr

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

## 8. POST /vision/detect-ui

### Content-Type
- `multipart/form-data`

### 表单字段
- `image`: 必填，图片文件
- `target_text`: 必填，目标文本

### curl 示例

```bash
curl -X POST http://127.0.0.1:60844/vision/detect-ui   -F image=@test.png   -F target_text=登录
```
