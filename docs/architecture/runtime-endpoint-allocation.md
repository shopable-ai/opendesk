# Runtime Endpoint Allocation 与 App Instance Isolation 设计

> 状态：P0 Implemented / macOS local verified / Windows main Runtime cross-build blocked by an existing robotgo dependency / Windows live not performed
> 日期：2026-09-12  
> 范围：OpenDesk 本地 Runtime / App Shell / Script App Packaging 在 localhost endpoint、固定端口兼容、多应用并行与 single-instance 下的端点所有权、分配、发现、覆盖和迁移规则。  
> 目标：消除多个 OpenDesk / Script App 因共享固定 localhost 端口而产生的天然冲突，同时不把 Runtime 实现细节错误塞入 `opendesk.app.json`。

## 1. 结论

冻结以下设计：

```text
Runtime endpoint 不是 Script App identity
Runtime endpoint 不是 opendesk.app.json 的默认业务配置
固定 60844 不应继续作为所有可分发实例的唯一共享端口
默认端口应由 Runtime 在启动时自动分配
显式 CLI / environment override 只用于确有外部依赖的场景
同 appId + singleInstance=true 先复用已有实例，不创建第二个 endpoint
不同 appId 的应用拥有彼此独立的 Runtime endpoint
动态 actualPort 属于运行时状态，不持久化回 Manifest
```

目标结构：

```text
Script App Packaging
└── App Shell
    ├── App Manifest
    │   └── opendesk.app.json
    ├── App Identity
    │   └── appId
    ├── Single Instance
    │   └── same appId -> activate existing instance
    └── Runtime Endpoint
        ├── owner
        ├── host = 127.0.0.1
        ├── requestedPort = auto | explicit
        ├── actualPort = runtime assigned
        └── optional auth token / discovery metadata
```

## 2. 为什么不能只把 60844 改成环境变量

把固定 `60844` 简单改成：

```text
OPENDESK_PORT=xxxxx
```

只能把“硬编码冲突”变成“人工配置冲突”，不能解决：

- 同一台机器运行多个用户打包的 OpenDesk Script App；
- 同一用户同时运行普通 OpenDesk 与一个或多个 Script App；
- 两个开发者应用恰好使用相同默认端口；
- 用户并不知道当前哪些端口已经占用；
- portable app 被复制到其他机器后仍要求手工改配置；
- second instance 在端口 bind 前后产生竞态；
- 外部 UI / helper 需要知道 Runtime 最终实际端口。

因此主问题是 **Runtime Endpoint Allocation + App Instance Isolation**，环境变量只应作为显式 override。

## 3. Endpoint Owner 必须先分类

历史架构资料中曾使用 `127.0.0.1:60844`：普通 OpenDesk service 的 `cmd/opendesk-status` helper 通过内部 Framework endpoint 与主进程交互。当前 helper 改为接收 parent 注入的实际地址；它与 `opendesk.app.json` 的 App identity 不是同一概念。

实施前必须先把每个 localhost listener 归属到明确 owner，不允许继续用一个无语义的“OpenDesk port”覆盖所有用途：

| Owner | 典型用途 | 是否允许多个并行实例 | 推荐策略 |
| --- | --- | --- | --- |
| Framework service / control | 普通 OpenDesk service、status helper、developer control | 取决于产品生命周期 | owner 自己管理 endpoint 与 discovery |
| App Shell instance | 某个 App Mode 应用内部控制 / bridge（如实际需要） | 不同 appId 可以 | 每实例 auto endpoint |
| HTTP Server public entry | 用户明确启动的外部 HTTP API | 可能有外部固定依赖 | 支持显式 port；冲突时明确失败 |
| Test / development fixture | 测试、调试、临时 host | 可以 | 优先 auto，测试按需注入固定端口 |

如果一个 listener 实际属于 Framework service，就不能仅因为 Script App Packaging 遇到冲突而把它重命名成 `APP_PORT`。

### 当前实现的 Endpoint Owner Inventory

| Endpoint / listener | Owner / 创建位置 | listen address | 连接者 | 生命周期 | 多实例 | 60844 状态 | 当前迁移方式 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Framework Runtime HTTP | `cmd/opendesk/startContainerBasedServer` → `runtimeEndpoint` | desktop/internal：`127.0.0.1:0`；显式 HTTP：`0.0.0.0:<port>` | status/helper、Scheduler、Inspector、HTTP clients | 主进程 Runtime | desktop/internal 可并行；显式端口按用户合同 | 只保留为显式 HTTP 默认值 | listener 直接返回 `actualAddress` / `actualPort`，所有内部 URL 从实际值构造 |
| `opendesk-status` | `cmd/opendesk-status` helper | 不 listen | parent 注入的完整 status/scheduler/Inspector URL 与可选 token | helper 进程跟随 parent | 每个 parent 独立 | 不猜、不扫描 | argv 显式接收 actual endpoint |
| App Mode instance control | `pkg/appshell/instance_darwin.go` / `instance_windows.go` | macOS Unix socket；Windows named pipe | 同 `appId` 的 secondary 启动 | App Shell primary lease | 同 appId 仲裁；不同 appId 独立 | 不使用 | 先 `AcquireSingleInstance`，secondary 激活后退出 |
| Inspector / Developer control | `pkg/http`，复用 Framework HTTP listener | 与 Framework listener 相同 | Workbench 页面、parent helper | Framework Server | 随 Runtime 实例 | 显式 legacy HTTP 才可能是 60844 | policy 使用 owner 注入的实际端口；auto loopback 不启用 LAN token |
| MCP | `cmd/opendesk-mcp` / `pkg/mcpserver` | stdio，无 TCP listener | MCP client 的 stdin/stdout | MCP 进程 | 由进程启动 | 不使用 | 保持 stdio |
| Script execution coordination | `cmd/opendesk/script_instance.go` | `127.0.0.1:0` 临时 loopback socket | 同一脚本实例协调者 | 脚本 execution | execution-scoped | 不使用 | 与 Framework HTTP endpoint 分离 |

App Mode 当前没有 TCP endpoint；不要为 `opendesk.app.json` 增加 `port`、`runtimePort` 或 endpoint discovery 字段。

## 4. 默认端口策略

### 4.1 默认使用自动分配

对不需要外部客户端提前知道固定端口的内部 Runtime endpoint，默认采用：

```text
host = 127.0.0.1
port = 0
```

即让操作系统分配当前可用 ephemeral port，然后 Runtime 读取 listener 的真实地址得到：

```text
actualPort
```

示例：

```text
OpenDesk framework service -> 127.0.0.1:53127
Script App A              -> 127.0.0.1:53128
Script App B              -> 127.0.0.1:53129
```

具体数字不可作为稳定身份、持久配置或业务逻辑的一部分。

### 4.2 host 默认只绑定 loopback

内部 endpoint 默认：

```text
127.0.0.1
```

不得为了避免冲突改成 `0.0.0.0`。

若未来提供 LAN / remote access，必须作为独立能力显式启用，并单独处理认证、授权、CSRF/origin、TLS/网络边界等问题。

## 5. 配置优先级

对真正需要用户或外部系统指定端口的 owner，统一采用：

```text
explicit CLI
    > explicit environment override
        > owner-specific config（仅当该 owner 已公开配置）
            > auto
```

原则：

1. **默认是 auto**，不是 60844。
2. CLI 是一次运行的最高优先级显式决定。
3. environment 是部署级 override。
4. 不因为 Runtime 内部需要端口就在 `opendesk.app.json` 添加字段。
5. 每个 owner 使用有语义的配置名，避免一个泛化 `PORT` 控制所有 listener。

最终环境变量名称必须在实现时依据 endpoint owner 冻结。例如：

```text
OPENDESK_CONTROL_PORT
OPENDESK_HTTP_PORT
```

只有当端点确实属于 App Shell instance 时，才考虑类似：

```text
OPENDESK_APP_PORT
```

在 owner 未确认、实现与测试未落地前，本设计不把上述候选名称声明为已存在公共 API。

## 6. 显式端口的冲突行为

### 默认 auto

如果调用方没有指定端口：

```text
bind 127.0.0.1:0
-> OS chooses port
-> startup continues
```

不需要“端口占用后递增 +1”的扫描策略。

### 显式 override

如果用户明确指定：

```text
--port 60844
```

或等价已公开 environment override，则：

```text
60844 available -> use 60844
60844 occupied  -> fail clearly
```

不要静默改成另一个端口。显式配置通常意味着外部调用方依赖这个地址，静默 fallback 会产生更难排查的半失败状态。

错误至少应包含：

```text
owner
requested host
requested port
reason = address already in use
```

不得泄露 token 或其他秘密。

## 7. Single Instance 与 Endpoint Allocation 的顺序

对：

```json
{
  "id": "com.example.invoice-helper",
  "singleInstance": true
}
```

正确启动顺序是：

```text
resolve package
-> validate manifest
-> derive stable app identity
-> acquire / inspect single-instance ownership
-> if existing primary:
     activate existing app
     exit secondary
   else:
     become primary
     allocate required runtime endpoint(s)
     start business Execution
```

关键点：

> **不要先创建第二套业务 Runtime 和随机端口，再发现自己其实是 second instance。**

同一 `appId` 的 single-instance 应共享“应用实例身份”，而不是共享固定端口。

不同 `appId`：

```text
com.example.app-a -> independent primary -> independent endpoint
com.example.app-b -> independent primary -> independent endpoint
```

两者可以同时运行。

## 8. actualPort 的传播与发现

`actualPort` 是 Runtime state。

### 同进程消费者

优先通过：

```text
in-memory runtime context
```

传递，不写文件、不写 Manifest。

### 子进程 / native helper

如果 helper 是由主进程启动，优先在创建 helper 时显式传入：

```text
endpoint address
+ per-session auth material（若需要）
```

不要让 helper 猜端口或扫描 localhost。

### 独立第二进程发现 primary

如果 single-instance activation 或独立工具确实需要发现现有 primary，可以使用 owner 专属的 runtime discovery metadata，例如：

```text
per-user runtime directory
└── <owner-or-app-identity>/
    └── endpoint.json
```

但只有存在跨进程发现需求时才引入。

该文件只能保存最小瞬时 metadata，例如：

```json
{
  "pid": 12345,
  "host": "127.0.0.1",
  "port": 53127,
  "protocolVersion": 1
}
```

要求：

- 属于 runtime artifact，不进入源码仓库；
- owner shutdown 后删除；
- stale pid / stale file 必须可检测；
- 不能把长期 secret 明文持久化；
- 文件本身不能成为唯一身份或唯一锁机制。

## 9. 本地控制 endpoint 的认证

`127.0.0.1` 不等于可信调用者。

如果 endpoint 可执行控制动作，而不仅是读取无害状态，应使用每次启动随机生成的 session token 或等价认证材料。

推荐：

```text
Runtime startup
-> random token
-> only authorized helper receives token
-> request authenticates token
-> shutdown destroys token
```

token：

- 不进入 `opendesk.app.json`；
- 不作为通用环境变量长期保存；
- 不输出到普通日志；
- 不提交到 `.runtime/` 或仓库；
- 不由多个不相关 Script App 共享。

## 10. opendesk.app.json 的边界

`opendesk.app.json` 继续描述稳定应用意图：

```text
id
entry
singleInstance
window
tray/menu
```

默认不加入：

```text
port
runtimePort
controlPort
endpoint
actualPort
```

原因：

- 动态 port 是机器/进程实例状态；
- Manifest 会跟应用一起复制到其他电脑；
- 固定 port 会重新制造应用间冲突；
- transport 细节不是 Script App identity；
- 用户应用不应依赖 OpenDesk 内部控制 transport。

只有未来某个 App 明确“对外提供网络服务”，且该端口是该应用本身的产品配置时，才应由那个业务能力自己的公开配置负责，而不是复用 App Shell 内部 endpoint 字段。

## 11. 60844 兼容迁移

不能直接删除 60844，必须先确认当前 owner 与所有调用者。

推荐迁移：

### Phase A：Inventory

查清：

```text
谁 listen 60844
谁 connect 60844
哪些测试写死 60844
哪些 docs / examples / helper argv 写死 60844
普通 OpenDesk service 与 App Mode 是否真的共享同一个 listener
```

### Phase B：Endpoint abstraction

在 owner 内建立统一对象：

```text
EndpointConfig
EndpointListener
EndpointInfo / actual address
```

调用方不再自己拼 `127.0.0.1:60844`。

### Phase C：Auto default

默认切换为 auto endpoint。

如果必须保留迁移兼容，可以短期：

```text
legacy mode explicitly requests 60844
new mode defaults auto
```

不推荐长期采用：

```text
try 60844 -> occupied then silently auto
```

因为同一命令在不同机器上会产生不同可观察地址。

### Phase D：Discovery wiring

更新 helper、single-instance / control client，使其消费真实 endpoint，而不是固定端口。

### Phase E：Deprecate fixed port

当所有内部消费者都已通过 endpoint discovery / injection 获取地址后，60844 只在明确 legacy override 中存在，最终再决定是否移除。

## 12. 实现责任边界

推荐 owner：

```text
Runtime / native infrastructure
├── listener 创建与关闭
├── auto port allocation
├── endpoint lifecycle
├── endpoint discovery / injection
├── local auth
└── shutdown cleanup

App Shell
├── app identity
├── single-instance arbitration
├── activation
└── 在 primary 确定后启动需要的 endpoint

Script App Packaging
├── package / manifest 校验
├── 调用现有 App Mode 能力
├── 发布 staging
└── 不自行分配或硬编码 Runtime port
```

不要在 Packaging Skill、JavaScript Recipe 或 `opendesk.app.json` 中重复实现 listener 选择算法。

## 13. 实施任务树

- P0｜冻结真实 owner
  - 搜索所有 `60844`、`Listen`、`ListenAndServe`、`127.0.0.1`、localhost control client。
  - 建立 listener / client / test / doc 对照表。
  - 判断 Framework service、App Mode、HTTP Server 是否共享实现。
- P1｜抽象 endpoint lifecycle
  - 统一 listener 创建入口。
  - 返回真实 `actualAddress` / `actualPort`。
  - endpoint 受所属 process / Execution / App Shell 生命周期管理。
- P2｜auto allocation
  - internal endpoint 默认使用 loopback + port 0。
  - 显式 override 冲突时 fail-fast。
- P3｜client wiring
  - helper 由主进程显式取得真实 endpoint。
  - 删除 client 侧固定 `60844` 假设。
  - 如确需独立发现，再实现 per-user transient discovery。
- P4｜single-instance ordering
  - secondary 不创建第二业务 Runtime / endpoint。
  - primary activation 继续使用稳定 app identity。
- P5｜security
  - 控制型 endpoint 使用 per-session auth。
  - 检查日志、process args、runtime metadata 的秘密边界。
- P6｜migration
  - 保留必要 legacy explicit override。
  - 文档标注 deprecated 固定端口行为。
- P7｜tests
  - 同时运行普通 OpenDesk + Script App A + Script App B。
  - 同 appId second launch 不新增 endpoint。
  - explicit occupied port 返回稳定错误。
  - stale discovery / crashed primary 可恢复。
  - shutdown 后 endpoint 与 runtime metadata 被清理。
- P8｜docs / Skill
  - 更新实际 environment / CLI Reference。
  - 更新 Script App Packaging 文档。
  - `$build-script-app` 只消费已经实现的公共 endpoint 能力。

## 14. 验收矩阵

| 场景 | 预期 |
| --- | --- |
| 默认启动普通 OpenDesk | endpoint 自动取得可用端口，不要求用户配置 |
| 默认启动 Script App A | 成功，拥有独立 endpoint（如该 app 需要） |
| 同时启动 Script App B | 成功，不与 A 因默认固定端口冲突 |
| A 再次启动且 `singleInstance=true` | 激活 A primary；不重新执行 `main.js`；不新增 endpoint |
| A 与 B 使用不同 appId | 可同时运行 |
| 显式指定一个空闲端口 | 精确使用指定端口 |
| 显式指定已占用端口 | 明确失败；不静默换端口 |
| internal helper | 从 primary 获得真实 endpoint，不扫描 localhost |
| endpoint shutdown | listener、auth session、transient discovery 全部清理 |
| package copied to another machine | 不因为 Manifest 写死端口而冲突 |

## 15. 与其他设计的关系

- [App Shell、Tray / Menu Bar 与 Single-Instance](app-shell-tray-menu.md)：负责 App Mode identity、single-instance、Tray/Menu 与 lifecycle；本设计补充 localhost endpoint 隔离，不改变其 Execution 边界。
- [App Mode desktop launch contract](app-mode-desktop-launch.md)：负责开发启动与 macOS/Windows release staging；发布产物不得因为复制多个应用而共享一个不可配置固定内部端口。
- [Script App Packaging](../api/script-app-packaging.md)：用户如何把已有 JavaScript 交付为 App Mode desktop app；它引用本设计，但不自己实现 endpoint allocator。
- [`$build-script-app`](../../workflows/script-app-packaging/skills/build-script-app/SKILL.md)：Agent / 开发者作业入口；只能使用当前 Runtime 已真实实现并文档化的 endpoint 能力。

## 16. 当前实现状态声明

P0 已在当前 Runtime 落地：

```text
desktop/internal runtime -> 127.0.0.1:0 -> actual listener address
explicit -http -> explicit port -> occupied port fails clearly
status helper -> parent-injected actual URLs; no fixed-port fallback
Inspector -> actual Framework port; auto loopback is local-only
App Mode -> no TCP endpoint; single-instance uses platform IPC/lock
no new OPENDESK_*_PORT environment variable
no runtime endpoint discovery file
```

仍保留的兼容合同是显式 `-http` 的 `-port` 参数，默认值为 legacy `60844`；这不表示 desktop/internal Runtime 使用该端口。
macOS local live、Windows cross-build 与 Windows live 的最终状态必须以本轮验证证据为准，不能把 cross-build 写成 Windows live。

## 17. Scheduler shared-state boundary

动态 Runtime endpoint 只解决 transport conflict，不定义 Scheduler 数据归属，也不提供 Scheduler leader election。

当前边界固定为：

```text
Runtime endpoint
→ runtime-instance scoped

Scheduler persistent store
→ OS-user scoped / shared by default

Scheduler runner ownership
→ one active Runtime per Scheduler Store
```

因此不得把默认 Scheduler DB 移入 per-runtime 临时目录，也不得用 `actualPort`、appId 或固定 TCP port 作为 Scheduler owner identity。多个 Runtime 对 shared Store 的执行权、standby takeover、SQLite migration concurrency 与 crash semantics 由 [Scheduler 多 Runtime 并发与执行归属](scheduler-runtime-concurrency.md) 负责。
