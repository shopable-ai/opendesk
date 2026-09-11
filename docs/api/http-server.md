---
title: HTTP Server API
description: 内置 HTTP 服务的脚本执行、状态查询、SSE 事件流、视觉接口与隔离的 Accessibility Workbench 合同。
order: 510
---

# HTTP server API

当前项目支持 HTTP 服务模式：

- `opendesk -http`
- 显式 HTTP Server 的 legacy 默认端口：`60844`

这里的 `-http` 是用户明确启动的公开 HTTP Server，保持固定 `-port` 合同；它不同于无参数桌面/Framework 启动使用的
内部 Runtime endpoint。桌面/Framework 启动默认绑定 loopback 并由操作系统自动分配端口，实际地址会在启动日志的
`OpenDesk ready` 行公布。

路由以 `pkg/http/handler.go` 为准。

## HTTP Server API：接口总表

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
| GET | /scheduler | 本机 Scheduler 管理页 |
| GET/POST | /api/scheduler/jobs | 列出或创建定时任务 |
| GET | /accessibility-workbench/ | 打开由当前 OpenDesk 构建提供的同源 Inspector 页面 |
| POST | /api/accessibility-workbench/v1/launch | 当前同源页面创建短期只读 Workbench 授权 generation |

统一响应包装

成功时通常为：

```json
{
  "code": 0,
  "message": "success",
  "data": {}
}
```

错误时通常为：

```json
{
  "code": 400,
  "message": "error message"
}
```

## POST /SCRIPT_RUN

旧版兼容入口；创建一次异步脚本 execution。

**签名**

```text
POST /SCRIPT_RUN
```

**参数**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `script` | string | 是 | 无 | JavaScript 源码 |
| `timeout` | number | 否 | `30` | 秒 |
| `stack` | string | 否 | `legacy` | 兼容标签；新调用应省略 |
| `consoleMode` | string | 否 | server 默认值 | 终端输出模式 |
| `outputFormat` | string | 否 | `text` | 输出格式 |
| `logDir` | string | 否 | 自动目录 | artifact 目录 |
| `capabilities` | string[] | 否 | `[]` | v1 仅支持 `ui`，且需 server 与 loopback 双重授权 |

**返回值**

返回 `executionId`、`status`、`statusUrl`、`summaryUrl`、`streamUrl`、`cancelUrl` 和 `artifacts`。

**行为与错误**

源码为空或 JSON 不合法返回 400；未知 capability 返回 400；未获授权的 `ui` 返回 403。此接口不会授予 Accessibility。

**示例**

```json
{
  "script": "console.log('hello')",
  "timeout": 30,
  "consoleMode": "agent",
  "outputFormat": "json",
  "logDir": "./.runtime/examples/http-run",
  "capabilities": ["ui"]
}
```

## POST /executions

推荐使用的新入口。

**签名**

```text
POST /executions
```

**参数**

请求 JSON 的 `script`、`timeout`、`stack`、`consoleMode`、`outputFormat`、`logDir` 和 `capabilities` 字段定义与
`POST /SCRIPT_RUN` 的参数表一致。

**返回值**

统一成功 envelope 的 `data` 含 execution ID、状态、查询／摘要／事件／取消路径和 artifact 元数据。

**行为与错误**

创建后立即返回，执行异步继续；参数、capability 和授权错误与 `POST /SCRIPT_RUN` 一致。

**示例**

```bash
curl -X POST http://127.0.0.1:60844/executions \
  -H 'Content-Type: application/json' \
  -d '{
    "script": "console.log(page.title())",
    "stack": "legacy",
    "timeout": 30
  }'
```

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

## GET /executions/{id}

查询一次 execution 的当前状态。

**签名**

```text
GET /executions/{id}
```

**参数**

`id`：路径参数，创建接口返回的 execution ID。

**返回值**

统一 envelope 的 `data` 是当前 execution result 快照。

**行为与错误**

未知 ID 返回 404；GET 不等待 execution 完成。

**示例**

```bash
curl http://127.0.0.1:60844/executions/http-xxxx
```

## DELETE /executions/{id}

取消运行中的执行。取消会同时中止执行 context、在途 HTTP、timer 和尚未执行的
Promise callback；最终状态、摘要和 artifacts 仍通过现有查询接口获得。

**签名**

```text
DELETE /executions/{id}
```

**参数**

`id`：路径参数，运行中的 execution ID。

**返回值**

统一 envelope 的 `data` 是取消后的 execution result 快照。

**行为与错误**

未知 ID 返回 404；已经完成的 execution 保持终态，不会重新执行。

**示例**

```bash
curl -X DELETE http://127.0.0.1:60844/executions/http-xxxx
```

## GET /executions/{id}/summary

获取 execution 的 Agent 摘要。

**签名**

```text
GET /executions/{id}/summary
```

**参数**

`id`：路径参数，execution ID。

**返回值**

统一 envelope 的 `data` 是当前摘要；终态后保持可查询。

**行为与错误**

未知 ID 返回 404；运行中时摘要可能尚未最终化。

**示例**

```bash
curl http://127.0.0.1:60844/executions/http-xxxx/summary
```

## GET /executions/{id}/events

打开 execution 的 SSE 实时事件流。

**签名**

```text
GET /executions/{id}/events?categories={comma-separated-categories}
```

**参数**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `id` | string | 是 | 无 | 路径参数，execution ID |
| `categories` | string | 否 | `meta,script,summary,error` | 逗号分隔的事件 category |

**返回值**

响应为 `text/event-stream`，包含 `status`、`log`、`summary` 和 `done` 事件，设置 `Cache-Control: no-cache`。

**行为与错误**

即使 categories 过滤日志，`done`、`status` 和 `summary` 仍发送；未知 ID 返回 404。

**示例**

```bash
curl -N 'http://127.0.0.1:60844/executions/http-xxxx/events?categories=script,error'
```

## GET /status

查看服务状态和最近一次 execution 概览。`service` 固定为 `"opendesk"`。

**签名**

```text
GET /status
```

**参数**

无。

**返回值**

包含 `service`、`status`、`execution_capacity`、`scheduler`、`vision_enabled`、`timestamp`，并可能包含
`latestExecution`。

**行为与错误**

桌面 App 只用 `service` 与其他健康字段识别可复用的本机 OpenDesk；Inspector 凭据不会授权或改变此路由。

**示例**

```json
{
  "service": "opendesk",
  "status": "ok",
  "execution_capacity": 10,
  "scheduler": true,
  "vision_enabled": true
}
```

```bash
curl http://127.0.0.1:60844/status
```

## POST /vision/ocr

通过 multipart/form-data 调用 Vision OCR。

**签名**

```text
POST /vision/ocr
```

**参数**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `image` | file | 是 | 无 | 图片文件 |
| `provider` | string | 否 | `paddle` | OCR provider |
| `lang` | string | 否 | `ch` | 语言参数 |

**返回值**

统一 envelope 的 `data` 是 OCR provider 结果。

**行为与错误**

缺图片或 multipart 错误返回 400；provider 失败返回 500。

**示例**

```bash
curl -X POST http://127.0.0.1:60844/vision/ocr \
  -F image=@./.runtime/examples/input.png \
  -F provider=local \
  -F lang=chi_sim+eng
```

## POST /vision/detect-ui

通过 multipart/form-data 调用 Vision.detectUI。

**签名**

```text
POST /vision/detect-ui
```

**参数**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `image` | file | 是 | 无 | 图片文件 |
| `target_text` | string | 是 | 无 | 目标文本 |

**返回值**

统一 envelope 的 `data` 是 UI 文本检测结果。

**行为与错误**

缺图片或 `target_text` 返回 400；provider 失败返回 500。

**示例**

```bash
curl -X POST http://127.0.0.1:60844/vision/detect-ui \
  -F image=@./.runtime/examples/dialog.png \
  -F target_text=确定
```

## POST /api/accessibility-workbench/v1/launch

当前 OpenDesk 同源页面请求一个短期 Accessibility Workbench 授权 generation。页面、控制和数据均位于当前 Framework
HTTP listener；显式 `-http` 示例可能是 `60844`，desktop/internal Runtime 使用启动时实际分配的端口。

**签名**

```text
POST /api/accessibility-workbench/v1/launch
```

**参数**

请求体必须是空 JSON 对象 `{}`；未知字段返回 400。页面不能指定 frontend URL、API origin、端口或网络策略。

**返回值**

统一 envelope 的 `data` 包含：`url`（同一页面 URL 加一次性 `pair` fragment）、当前 listener authority、`mode`
（`local-only` 或 `trusted-lan`）和 `boundary`。`url` 不含 `api` fragment 参数，不得记录、持久化或把 pairing secret 移入查询参数。

**行为与错误**

请求必须携带 `X-OpenDesk-Workbench-Control: 1`、精确 HTTP Origin，并满足当前显式网络策略。默认 `local-only` 只接受真实
loopback socket、loopback IP Host 和完全匹配的 Origin。macOS tray 显式启用 `trusted-lan` 后，额外接受私有网段 socket、
当前机器实际私有 IP Host 和完全匹配的 HTTP Origin。公网来源、伪造私有 Host、`Origin: null`、跨源以及 `Forwarded`／
`X-Forwarded-*` 始终拒绝；接口不发 CORS access headers。

每个 OpenDesk 进程同一时刻只有一个 Workbench generation；第二次 launch 返回 409。未配对 generation 在 5 分钟后失效；
配对后最长保留到 30 分钟 bearer 到期；撤销 authorization 时立即停用。LAN 开关只存在于当前进程内存，重启恢复关闭。

**示例**

浏览器页面通常直接完成此请求。以下命令假定先以显式 legacy HTTP 模式启动
`opendesk -http -port 60844`，只用于本机维护诊断，会把一次性 URL 输出到终端；不要保存响应：

```bash
curl --noproxy '*' -fsS http://127.0.0.1:60844/api/accessibility-workbench/v1/launch \
  -X POST \
  -H 'Origin: http://127.0.0.1:60844' \
  -H 'Content-Type: application/json' \
  -H 'X-OpenDesk-Workbench-Control: 1' \
  --data '{}'
```

## Accessibility Workbench transport contract

OpenDesk 在当前 Framework listener 同源提供 `/accessibility-workbench/`、launch control 和下列数据 API。Inspector 的
bearer/session 只授权这些只读数据 handler，不是 `/SCRIPT_RUN`、`/executions`、Scheduler、MCP、Vision 或通用 Runtime 的
capability。增加 Inspector 路由与 trusted-LAN 策略不会改写或扩大其他 Framework 路由的既有授权。

`apps/inspector_web/` 保留纯 HTML/CSS/JavaScript 源码；开发 checkout 直接从该目录提供允许清单中的四项资源，macOS build 把
同一资源复制到 app bundle。服务器不提供任意静态文件路径。

| 方法 | 路径 | 用途 |
| --- | --- | --- |
| POST | `/api/accessibility-inspector/v1/pair` | 一次性配对 |
| DELETE | `/api/accessibility-inspector/v1/authorization` | 撤销 bearer 和所属 session |
| GET | `/api/accessibility-inspector/v1/capabilities` | 读取受限 capability |
| GET | `/api/accessibility-inspector/v1/windows` | 主动列出必要窗口元数据 |
| POST | `/api/accessibility-inspector/v1/sessions` | 为明确窗口创建 scope |
| GET | `/api/accessibility-inspector/v1/sessions/{sessionId}` | 读取 session 状态 |
| DELETE | `/api/accessibility-inspector/v1/sessions/{sessionId}` | 停止并撤销 session |
| POST | `/api/accessibility-inspector/v1/sessions/{sessionId}/observations` | 获取有界真实树 |
| POST | `/api/accessibility-inspector/v1/sessions/{sessionId}/visual-captures` | 显式获取当前 observation 的短期窗口像素参考 |
| POST | `/api/accessibility-inspector/v1/sessions/{sessionId}/validate` | 只读实时定位校验 |
| PUT | `/api/accessibility-inspector/v1/sessions/{sessionId}/review` | 保存人工修订和 handoff |
| POST | `/api/accessibility-inspector/v1/sessions/{sessionId}/import` | 以不可信数据导入人工修订 |
| GET | `/api/accessibility-inspector/v1/sessions/{sessionId}/handoff` | 导出安全交接包 |

API 请求必须同时满足当前 local-only／trusted-LAN socket 与 Host 策略、`X-OpenDesk-Inspector: 1` 和同源浏览器规则。带 Origin
时必须与 `http://<Host>` 完全一致；同源 GET 可使用浏览器 Fetch Metadata。所有模式拒绝 `Origin: null`、错误 Origin、
`Forwarded` 和任何 `X-Forwarded-*`，并且不启用 CORS。非浏览器维护工具还必须发送
`X-OpenDesk-Inspector-Client: non-browser`；这不替代 bearer 和 session 凭据。

API 响应都设置 `Cache-Control: no-store`。一次性配对码有效 5 分钟且只能兑换一次；client bearer
有效 30 分钟；session token 有效 15 分钟。bearer 使用 `Authorization: Bearer <token>`，session 路由还需要
`X-OpenDesk-Inspector-Session: <sessionToken>`。网页只把凭据保存在内存，配对请求前先从地址栏移除 fragment。

成功和错误仍使用本页统一 envelope。API 请求体上限 64 KiB，单次 observation 响应上限 8 MiB；默认限制是
`timeout=3000` 毫秒、`maxDepth=6`、`maxNodes=500`。允许范围分别为 100–10000、1–16、1–1000。

## POST /api/accessibility-inspector/v1/pair

用可信启动 URL fragment 中的一次性值兑换 client bearer。

**签名**

```text
POST /api/accessibility-inspector/v1/pair
```

**参数**

`code`：必填 string，可信启动 URL fragment 中的一次性配对值，最长 128 个 Unicode 字符。需要共享 transport header，
不需要 bearer 或 session header。

**返回值**

`token`、固定 `tokenType: "Bearer"` 和 RFC 3339 `expiresAt`。

**行为与错误**

页面在请求前清除 fragment。重复、错误或过期 code 返回 401；请求体错误返回 400。配对值只来自控制接口返回 URL 的
fragment；页面与 API 始终来自当前 Framework listener 的同源入口。

**示例**

```json
{
  "code": "one-time-pair-code"
}
```

## DELETE /api/accessibility-inspector/v1/authorization

撤销当前 bearer，以及它创建的所有 session 和在途 native 观察。

**签名**

```text
DELETE /api/accessibility-inspector/v1/authorization
```

**参数**

无请求体；必须提供当前 bearer 和共享 transport header。

**返回值**

```json
{
  "revoked": true
}
```

**行为与错误**

成功后当前 bearer 和所属 session 立即不可用。缺失、错误或过期 bearer 返回 401。

**示例**

网页在 `pagehide` 时发送 keepalive DELETE；维护者非浏览器客户端按本节 transport contract 发送同一路径。

## GET /api/accessibility-inspector/v1/capabilities

通过一个 source-controlled internal execution 返回当前 Accessibility capability。该 execution 强制
`readOnly=true`、`valueAllowed=false`，不接受浏览器源码，也没有 `perform` 程序。

**签名**

```text
GET /api/accessibility-inspector/v1/capabilities
```

**参数**

无请求体；必须提供当前 bearer 和共享 transport header。

**返回值**

`accessibility` 与 `window` capability 对象；Accessibility 的 `hostAuthorization` 明确包含 `enabled`、`readOnly`、
`valueAllowed` 和 `windowScoped`。

**行为与错误**

只读取 capability，不枚举窗口或树。鉴权失败返回 401，backend 初始化失败返回 503。

**示例**

配对后页面自动调用此接口，并把真实 backend／permission 状态显示在顶栏。

## GET /api/accessibility-inspector/v1/windows

返回最多 256 个当前可选择窗口。每项包含临时 `windowId`、`title`、`pid`、`application` 和逻辑 `bounds`。
`windowId` 只属于当前 client 的最近一次列表，刷新后旧选择失效；它不是可跨 execution 复用的 native ref。

**签名**

```text
GET /api/accessibility-inspector/v1/windows
```

**参数**

无请求体；必须提供当前 bearer 和共享 transport header。

**返回值**

窗口元数据数组；不包含窗口 Accessibility 子树。

**行为与错误**

用户主动刷新时才枚举；服务不会选择活动窗口、按模糊标题匹配或取同名第一项。同名窗口仍是带不同 `windowId` 的独立行，
调用方应同时展示 application、原样标题、PID、bounds 和 picker identity 供人核对。刷新整个列表会替换该 client 的 picker
catalog，因此旧 `windowId` 随即 stale。超过全局并发额度返回 429，窗口 backend 错误按结构化错误返回。

**示例**

从返回数组选择一个 `windowId`，再传给 session 创建接口。

## POST /api/accessibility-inspector/v1/sessions

为列表中明确选择的窗口建立有界 scope。每个 client 最多 4 个 session，全服务最多 16 个。

**签名**

```text
POST /api/accessibility-inspector/v1/sessions
```

**参数**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `windowId` | string | 是 | 无 | 当前 bearer 最近一次窗口列表中的临时 ID |
| `limits.timeout` | number | 否 | `3000` | native 操作毫秒超时，100–10000 |
| `limits.maxDepth` | number | 否 | `6` | 最大树深度，1–16 |
| `limits.maxNodes` | number | 否 | `500` | 最大节点数，1–1000 |

**返回值**

`sessionId`、`sessionToken`、`expiresAt`、`generation`、安全窗口投影和实际 limits。

**行为与错误**

服务只使用请求中的 `windowId` 查找当前 bearer 最近一次窗口 catalog 中的那一项；`title`、`pid` 或 `application` 不参与
替代选择。后续 snapshot/find 每次都重新解析该项保存的精确 native window identity，并由 native Accessibility owner 校验
同一 window id；不能扩大到其他窗口。返回的安全窗口投影使前端可以继续显示已绑定目标，而不必从标题反推 scope。
过期窗口列表返回 409，quota 返回 429，输入错误返回 400。

**示例**

```json
{
  "windowId": "window-...",
  "limits": {
    "timeout": 3000,
    "maxDepth": 6,
    "maxNodes": 500
  }
}
```

## GET /api/accessibility-inspector/v1/sessions/{sessionId}

返回 session 的时间、generation、窗口、limits，以及当前是否已有 observation/review。若已有 observation 或 review，
返回它们的安全副本。session ID 与另一个 bearer 或 session token 组合时按不存在处理。

**签名**

```text
GET /api/accessibility-inspector/v1/sessions/{sessionId}
```

**参数**

`sessionId`：路径参数，当前 bearer 创建的 session ID；必须同时提供对应 session header。

**返回值**

session 状态，以及可选的 `latestObservation` 和 `review`。

**行为与错误**

错误 bearer 返回 401；错误或跨 client/session token 组合返回 404；过期 token 返回 401。

**示例**

页面刷新状态时读取当前 session，而不会由该 GET 触发新的 native observation。

## DELETE /api/accessibility-inspector/v1/sessions/{sessionId}

取消当前 session 的在途观察并撤销 session token。已经保存的审阅和 handoff artifact 保留，便于显式交接；
它们不包含 bearer、session token 或 native ref。

**签名**

```text
DELETE /api/accessibility-inspector/v1/sessions/{sessionId}
```

**参数**

`sessionId`：路径参数；无请求体，必须提供 bearer 和对应 session header。

**返回值**

`sessionId` 与 `closed: true`。

**行为与错误**

在途 context 会被取消；backend 不声明 hard cancel，迟到结果仍会被 generation/session 检查丢弃。错误凭据返回 404。

**示例**

用户点击 `Stop session` 或页面卸载时调用。

## POST /api/accessibility-inspector/v1/sessions/{sessionId}/observations

重新解析选定窗口，通过固定的只读程序调用 `Accessibility.snapshot()`，并立即释放 execution-scoped ref。请求体可为空对象，
或包含一组 `limits` 覆盖值。响应 schema 为 `opendesk.inspector.observation/v1`，关键字段包括：

**签名**

```text
POST /api/accessibility-inspector/v1/sessions/{sessionId}/observations
```

**参数**

`sessionId`：路径参数；请求体可为 `{}`，或提供与 session 创建接口相同的 `limits`。必须提供 bearer 和对应 session
header。

**返回值**

- `observationId`、`sessionId`、`generation`、`executionId`、`requestId`；
- `window`、`root`、`limits`、`backend`；
- `startedAt`、`observedAt`、`freshness`；
- `complete`、`truncated`、`reason`、`stats`；
- `sourceHash` 和固定 `evidenceSource: "accessibility-runtime"`。

每个 `root` 节点只投影只读白名单：`nodeId`、`role`、`nativeRole`、可空 `nativeSubrole`、可空
`name`／`identifier`、可空 `enabled`／`focused`／`selected`／`checked`／`expanded`、`actions`、可空
`nativeBounds`／`bounds` 和有序 `children`。`value`、native handle/ref 及未知 backend 字段即使被内部 runner 意外返回，也会在
HTTP controller 边界删除。macOS `name` 的 AXTitle/AXDescription 规则和平台字段可用性见
[Accessibility API](accessibility.md#可读属性)。

**行为与错误**

`root` 中的 `nodeId` 只用于本次快照内的网页选择，不是 native ref。相同、有序树的编号可在连续快照中碰巧一致，但不能据此跨
observation 复用；网页只会用 role/name/identifier 等受限语义锚点做唯一恢复，歧义或消失即标 stale。服务保存不可变、随机 ID
的 observation JSON。新 observation 成功后，上一份 review 和 validation receipt 立即失效，必须针对新 observation 重新保存／
验证。刷新因目标消失、权限、timeout、取消或 backend 错误失败时，session 只会把上一份树作为 `freshness: "stale"` 返回，并
清除当前 review/validation；stale 树不能保存 review、导入修订或导出 handoff。若 session 切换、过期或关闭，迟到结果不会写回
新 scope。

验收时必须分别记录四个层级：独立静态页面可达、此 API 返回真实 native 树、网页模型正确处理树与状态、Browser Skill 在真实
页面中完成交互和视觉检查。前一层成功不能替代后一层；静态页面返回 200 不证明浏览器已经配对、接收或正确展示 observation。

**示例**

```json
{
  "limits": {
    "timeout": 5000,
    "maxDepth": 8,
    "maxNodes": 800
  }
}
```

## POST /api/accessibility-inspector/v1/sessions/{sessionId}/visual-captures

在用户显式请求时，为当前 observation 获取一份短期、只在响应内存中返回的窗口像素参考。该接口属于 Inspector 专用
listener，不扩展公开 `page.screenshot`，也不接受客户端指定的路径、clip、格式或其他窗口。

**签名**

```text
POST /api/accessibility-inspector/v1/sessions/{sessionId}/visual-captures
```

**参数**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `sessionId` | string | 是 | 无 | 路径参数；还需 bearer 和对应 session header |
| `observationId` | string | 是 | 无 | 当前且 freshness 为 `current` 的 observation ID |
| `generation` | number | 是 | 无 | 当前 session generation，必须为正整数 |

请求体只允许上述 `observationId` 和 `generation`；未知字段按非法输入拒绝。

**返回值**

统一 envelope 的 `data` 使用 `opendesk.inspector.visual-capture/v1`，包含：

- `captureId`、`sessionId`、`observationId`、`generation`、`capturedAt`、`expiresAt`；
- 与当前 observation 绑定的安全窗口身份及 bounds；
- `image`：固定 PNG `dataUrl`、`mimeType`、像素 `width`／`height` 与 `sizeBytes`；
- `captureProvenance`：`method`、`scope`、`foregroundVerified`、`occlusionRisk`，以及固定
  `focusChanged: false`、`persisted: false`。

**行为与错误**

服务在截图前后重新解析并核对同一 native window identity、PID、原样标题、应用、bounds 和可用 native handle；不会聚焦、
前置、移动或操作目标。macOS 优先使用 exact-window CGWindow capture；只能使用可见屏幕 bounds 的 fallback 会把
`scope`／`occlusionRisk` 如实返回。前后身份或 bounds 改变时返回 409 并将 observation 标 stale。

像素不写入 Inspector artifact，PNG 上限 5 MiB，总响应仍受 8 MiB 限制，浏览器资格 30 秒后过期。新 observation、session／
generation 改变、关闭、stale、过期或来源校验失败时，前端必须立即清除旧图。缺 bearer 返回 401，错误 session token 返回
404，缺当前 observation、stale observation 或 generation 不匹配返回 409，非法 ID／generation／额外字段返回 400，截图权限
拒绝返回 403，不支持或 backend 失败返回 503，timeout／cancel 返回 504。所有响应仍为 `no-store`。

**示例**

```json
{
  "observationId": "observation-...",
  "generation": 1
}
```

## POST /api/accessibility-inspector/v1/sessions/{sessionId}/validate

在新 internal execution 中重新解析同一窗口，调用 `Accessibility.find()`、只读 `read()` 和 `release()`；绝不调用
`Accessibility.perform()`。

**签名**

```text
POST /api/accessibility-inspector/v1/sessions/{sessionId}/validate
```

**参数**

`sessionId`：路径参数。请求体 `locator` 至少含 `role`、`name` 或 `identifier` 之一；可选 `limits` 与 session 创建接口
一致。role 必须是当前规范化 Accessibility role；name 和 identifier 若存在则不得为空。必须提供 bearer 和对应
session header。

**返回值**

带 `performedAction: false` 的 validation receipt，状态只会是 `UNIQUE`、`NOT_FOUND`、`AMBIGUOUS`、
`SEARCH_INCOMPLETE`、`STALE_TARGET`、`TIMEOUT`、`PERMISSION_DENIED` 或 `BACKEND_UNAVAILABLE`。

**行为与错误**

只有当前 generation 且 selector 完全一致的 receipt 才能使 handoff 变为 verified。session 内已有观察／校验在途时返回
409；参数错误返回 400。

**示例**

```json
{
  "locator": {
    "role": "button",
    "name": "Save",
    "identifier": "fixture.save"
  }
}
```

## PUT /api/accessibility-inspector/v1/sessions/{sessionId}/review

保存独立的人类审阅层，不改写原始 observation。请求包含当前 `observationId`、当前快照中的 `selectedNodeId`、
`businessAlias`、`humanNote`、`intendedUsage` 和合法 `locator`。返回 review、重新生成的 handoff 和
`artifactPath`。文本被作为不可信数据原样保存；网页只用 `textContent`/表单值呈现。

**签名**

```text
PUT /api/accessibility-inspector/v1/sessions/{sessionId}/review
```

**参数**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `sessionId` | string | 是 | 无 | 路径参数；还需 bearer 和对应 session header |
| `observationId` | string | 是 | 无 | 当前 observation ID |
| `selectedNodeId` | string | 是 | 无 | 当前 observation 内的展示 ID |
| `businessAlias` | string | 否 | `""` | 人工业务别名，最长 256 字符 |
| `humanNote` | string | 否 | `""` | 人工备注，最长 4096 字符 |
| `intendedUsage` | string | 否 | `""` | 预期用途，最长 512 字符 |
| `locator` | object | 是 | 无 | 合法 role/name/identifier candidate |

**返回值**

`review`、重新生成的 `handoff` 和 `artifactPath`。

**行为与错误**

原 observation 保持不可变；stale observation 返回 409，未知 node 或非法字段返回 400，未观察即保存返回 409。

**示例**

在页面选中节点、编辑 Locator Playground 后点 `Save review`。

## POST /api/accessibility-inspector/v1/sessions/{sessionId}/import

将一个 `opendesk.inspector.handoff/v1` 文件中的人工字段和 locator 导入当前快照已选择节点：

**签名**

```text
POST /api/accessibility-inspector/v1/sessions/{sessionId}/import
```

**参数**

`sessionId`：路径参数；`selectedNodeId` 是当前 observation 内展示 ID；`handoff` 是不超过 64 KiB 的 JSON object。
必须提供 bearer 和对应 session header。

**返回值**

新 `review`、重新投影的 `handoff`、`artifactPath` 和固定 `validationStatus: "NOT_VALIDATED"`。

**行为与错误**

服务重新校验大小、schema、选中节点和 locator，只提取允许的人工字段；输入文件声称的 validation、recipe 或 Agent
资格一律丢弃。错误 schema／locator／node 返回 400，当前 session 尚无 observation 返回 409。

**示例**

```json
{
  "selectedNodeId": "node-12",
  "handoff": {
    "schemaVersion": "opendesk.inspector.handoff/v1"
  }
}
```

## GET /api/accessibility-inspector/v1/sessions/{sessionId}/handoff

返回 `opendesk.inspector.handoff/v1`。只有已经保存当前 review 时可用。内容包括安全窗口 target、observation 来源与
hash、选中元素的白名单事实、人工审阅、locator candidate、匹配的 validation receipt、未知项和 evidence refs。
它固定标记 `recipeVerification: "not-run"` 与 `agentStatus: "waiting-for-agent"`；不导出完整子树、value、
`nodeId`、native ref 或任何凭据。

**签名**

```text
GET /api/accessibility-inspector/v1/sessions/{sessionId}/handoff
```

**参数**

`sessionId`：路径参数；无请求体，必须提供 bearer 和对应 session header。

**返回值**

`opendesk.inspector.handoff/v1` object。

**行为与错误**

没有当前 review 返回 409；错误或跨 session 凭据返回 404。此 GET 不读取新的 native 数据，也不更改资格。

**示例**

页面的 `Export JSON`、`Copy Agent prompt` 和 `Copy OpenDesk JS` 从此对象生成本地交接。

开发树 artifact 位于 `.runtime/accessibility-inspector/<sessionId>/`；安装版位于操作系统用户配置目录下的
`opendesk/accessibility-inspector/<sessionId>/`。目录和文件仅允许当前用户访问；observation 和 review 使用随机、
版本化文件名，`review.json` 与 `handoff.json` 是当前指针。详细用户闭环见
[Desktop Agent 与 Accessibility Workbench](../integrations/desktop-agent.md)。

## HTTP Server API：stack 兼容参数

新请求应省略 `stack`，使用当前默认 JavaScript Runtime。服务端为了兼容早期调用仍接受
`legacy`、`upgraded` 和 `playwright`，但后两者只切换进程内 facade，不启动浏览器，也不提供
DOM、selector、tab、page realm、真实 cookie 或 storage 语义。它们不属于当前维护的用户 API，
不得用于新 workflow。完整边界见 [JavaScript Runtime](runtime.md)。

`USE_DI_CONTAINER=0` 不再启用一套独立 Runtime 实现；它保留为路由兼容别名，
与默认模式共享本页的执行、超时、事件、产物和错误语义。

内置 file/inline JavaScript 定时任务、SQLite 位置与页面使用见
[Scheduler](scheduler.md)；Scheduler 的来源互斥、大小上限、源码不回显策略、响应模型
和全部 action API 见 [Scheduler HTTP API](scheduler-api.md)。

## HTTP Server API：错误条件

常见 400
- script 为空
- JSON 不合法
- vision 接口未上传 image
- detect-ui 未传 `target_text`
- 请求了未知 execution capability

常见 403

- 请求声明 `capabilities: ["ui"]`，但服务器没有通过 `-ui` 或可信本地配置启用 UI
- UI 请求不是来自 `127.0.0.1` / `::1` loopback socket

Custom UI 与 [Dialog API](dialog.md) 的 HTTP 授权为三重门槛：服务器启用、单次请求声明、loopback 来源。只启用服务器但请求不声明时，该 execution 中的 `ui` 与 `Dialog` 仍为 dormant；来源成功时 `ui.getCapabilities().activationSource`、`Dialog.getCapabilities().activationSource` 与 `Execution.activationSource` 都是 `httpRequest`。`X-Forwarded-For`、任意 Host/Origin header 和 CORS 都不会绕过 socket loopback 检查；服务不会设置 `Access-Control-Allow-Origin: *`。完整窗口 API 见 [Custom UI](ui.md)，Dialog 行为见 [Dialog API](dialog.md)。

常见 404
- execution id 不存在

常见 405
- 方法不匹配

## HTTP Server API：使用建议

- 新项目优先用 `/executions`
- 需要实时输出时用 `/events`
- 需要 OCR 与 UI 检测时直接走 `/vision/ocr` 与 `/vision/detect-ui`
