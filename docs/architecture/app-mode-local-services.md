# App Mode Local Services：Scheduler + Inspector

> 状态：P0 implementation baseline
> 日期：2026-09-13
> 范围：官方 `com.opendesk.desktop` App Mode 的本机 loopback 服务组合。

## 结论

App Mode 不为 Inspector 启动第二个 OpenDesk、Python/Node 静态服务器或独立 Inspector listener。

当前 App Scheduler 已经拥有一个由操作系统自动分配的 `127.0.0.1:0` listener。本轮将它收敛为 **App Local Services endpoint**：

```text
OpenDesk App Mode
└── App Local Services 127.0.0.1:<auto-port>
    ├── Scheduler
    │   ├── /api/scheduler/status
    │   └── /api/scheduler/jobs...
    └── Inspector
        ├── /accessibility-workbench/
        ├── /api/accessibility-workbench/v1/launch
        └── /api/accessibility-inspector/v1/...
```

Scheduler 路由继续要求 `X-OpenDesk-App-Token`。Inspector 复用 `pkg/http` 已有的 pairing、Bearer/session、TTL、same-origin 和 loopback policy，不共享 Scheduler token，也不开放通用 `/SCRIPT_RUN`、`/executions`、Vision 等 Framework HTTP API。

## 生命周期

```text
executeAppMode
→ single-instance primary acquired
→ startAppScheduler（兼容名称；实际承载 App Local Services）
→ bind 127.0.0.1:0
→ start Scheduler
→ 官方 OpenDesk 且发现 inspector_web 资源时挂载 Inspector routes
→ 把实际 endpoint / Inspector URL 写入当前 App Execution environment
→ start App Shell
→ main.js 注册 inspector.open
→ 用户点击 Inspector
→ 系统默认浏览器打开当前 runtime 的 /accessibility-workbench/
→ Quit / cancellation
→ HTTP listener、Inspector session、Scheduler、SQLite store 同一生命周期关闭
```

点击 `Inspector` **只打开 URL，不启动服务**。服务在 App primary instance 的启动阶段一次性准备好，因此不会出现重复 listener、端口竞态、额外 Runtime 或浏览器点击后的启动时序问题。

## Runtime state

以下值只属于当前进程，不写回 `opendesk.app.json`：

- `OPENDESK_APP_LOCAL_ENDPOINT`：App Local Services 实际 loopback origin。
- `OPENDESK_APP_SCHEDULER_ENDPOINT`：兼容 Scheduler client 的同 origin alias。
- `OPENDESK_APP_SCHEDULER_TOKEN`：仅 Scheduler bridge 使用。
- `OPENDESK_APP_INSPECTOR_URL`：官方 OpenDesk 且 Inspector frontend 可用时提供的完整本机 URL。

Inspector URL 必须形如：

```text
http://127.0.0.1:<runtime-port>/accessibility-workbench/
```

前端资源定位：

- 开发：`apps/opendesk` 的 sibling `apps/inspector_web`；
- macOS bundle：`Contents/Resources/AppMode` 的 sibling `Contents/Resources/inspector_web`。

资源不存在时 App Mode 继续运行，但 Inspector capability 为 unavailable；菜单 action 给出失败反馈并写结构化日志。

## 产品边界

当前只对官方 package id `com.opendesk.desktop` 自动挂载 Inspector。普通第三方 App Mode 不因为 Runtime 自带 Inspector 代码就自动获得产品菜单或开发工具入口。

`apps/opendesk/opendesk.app.json` 中的 `inspector.open` 只是官方产品菜单 action。它不会改变 App Manifest 的通用 schema，也不会新增 `port` / `runtimePort` 配置。

## 与 Runtime Endpoint Allocation 的关系

`docs/architecture/runtime-endpoint-allocation.md` 中“App Mode 当前没有 TCP endpoint”的旧 inventory 已被后续 App Scheduler 实现超越。当前真实模型是：App Mode 有一个内部 auto loopback endpoint，由 App primary instance 拥有；Scheduler 与 Inspector 复用该 endpoint。固定 `60844` 仍不属于 App Mode identity，也不得写入 Manifest。

## 验收

P0 至少验证：

1. Scheduler 无 token 返回 403，带 token保持正常。
2. Inspector 页面与 launch control 与 Scheduler 使用同一 origin。
3. Inspector 保持 `local-only`，页面 CSP 为 same-origin。
4. `/SCRIPT_RUN` 在 App Local Services endpoint 返回 404。
5. Inspector frontend 不存在时 App 仍可启动，且不发布伪 Inspector URL。
6. Quit 时 listener、Inspector authorization、Scheduler 和 store 全部关闭。
7. `Inspector` 菜单只打开 `OPENDESK_APP_INSPECTOR_URL`，不 spawn 第二个 Runtime/server。
