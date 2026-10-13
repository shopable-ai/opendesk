# Reset Clock R2.4-B — Go 原生 Collector / Feed Bridge 核验

日期：2026-10-13。唯一目标分支：`master`。真实上游为独立第三方 `https://codex-reset.com/`，**不属于 OpenAI 官方数据**。

## 已实现的真实 Go 代码

- `examples/desktop-reset-clock/internal/provider/codexreset/`：唯一四接口 GET Provider。无 Token/Cookie、不跟随重定向、只接受公开预设 HTTPS 域名；注入 loopback mock 只限测试代码。默认 12 秒超时、2 MiB 限制、HTTP 200/304/404/429/5xx、ETag、Last-Modified、Retry-After、Cache-Control 和来源发布时钟；全域请求间隔不小于 60 秒，**发起请求前**持久化下一次允许时间，429 延长冷却。网络中断不会清除最后有效原始 JSON。
- `internal/bridge/`：第三方 reset/credits 与 service incident 分类，缺失原帖 HTTPS 链接放待核验队列，普通 tweets 仅作为资讯；同 ID timeline/feed 关联，保留原始发布与第三方报告时间的区别；仅明确 `announcement_state=withdrawn` 才撤回，绝不因列表滚动而推断撤回。修订单调化、持久化历史版本与完整事件快照。
- `cmd/reset-clock-bridge/`：`probe` 和 `serve` 共用同一代码；`serve` 默认仅监听 `127.0.0.1:8788`，暴露 `GET /feed`、`GET /archive`、`GET /healthz`，支持稳定 ETag 和条件 304；持久状态保存为原子写入的私有 JSON。
- 对原 `events/history/news` 仅做向后兼容扩展：可标识 `source_type:third_party`、`third_party_reset`、`third_party_credits`、`service_incident` 及 `provider_reported_at`；绝不为第三方设置 `verified_at`、`effective_at`、`confirmed_at`。已有官方历史类别、校验函数与 `history.Analyze` 仍只对具备完整覆盖的官方或用户观察证据计算正式指标。

## 数据映射及有限承诺

| 上游 | 存储/输出 | 安全边界 |
| --- | --- | --- |
| `timeline.events[] group=reset && announcement_state=announced` | `events.Event reset_completed` + `history.Record third_party_reset` | `source_type=third_party`；这是追踪服务确认，不是官方精确完成时刻；未来 `effective_at=null` |
| `timeline.events[] group=credits` | `extra_opportunity` + `third_party_credits` | 与全员重置独立，不能混算 |
| `feed.tweets[]` | `news.Item`，与 timeline 同 ID 关联 | 不用关键词识别重置；未确证的原帖不发布 |
| `status-history.incidents[]` | `history.Record service_incident` | 永不计入配额重置统计 |
| 缺 HTTPS URL / 无效时间 | 有界 `pending` 待核验队列及原始 JSON | 不捏造 URL、发布时刻、验证码或官方身份 |
| forecast 24/48h 概率 | 原始响应保存在缓存 | 不推出任何具体未来时间 |
| 任何接口 429 / stale / invalid / 无响应 | 标记 `source_health.status=stale` | 保留最后版本，不产生新的事件版本或新提醒 |

`/archive` 统一返回 `complete:false`。历史尚未证实全时窗，因此近期 30 天/本月仍显示“数据不足”，不会输出虚假的 0 次。`/feed` 携带 `data_source_url:https://codex-reset.com/`；展示端仍需同屏可见 `Data: codex-reset.com` 链接，R2.4-B 不修改 AppKit/Win32，**公开展示的来源署名验收未完成**。

## 可复现命令

在仓库根目录执行：

```bash
cd examples/desktop-reset-clock
go test ./... -count=1
go test -race ./... -count=1
go vet ./...
go build ./cmd/reset-clock-bridge
go build ./cmd/desktop-reset-clock
# 四个公开 API 的真实轮询至少间隔 60 秒；命令需要公网 DNS：
go run ./cmd/reset-clock-bridge probe
# 用第二个终端从 /feed /archive 检查真实服务：
go run ./cmd/reset-clock-bridge serve -listen 127.0.0.1:8788
```

默认文件保存至**仓库根目录** `.runtime/desktop-reset-clock/bridge-state.json`。同一路径只有一个进程可运行；`*.lock/` 为实例锁，异常退出需先确认无存活进程再手动清除。Bridge 是本机开发服务，公网部署需要 HTTPS、负载控制和展示端数据署名。

## 实际完成的测试及真实性范围

- 当前隔离 Linux 执行容器中，针对已存在的 Go Collector/Bridge 及其必要协议包镜像运行定向 `go test`、`go test -race`、`go vet`、`go build ./cmd/reset-clock-bridge`，**通过**。完整仓库模块 `go test ./...` 需以相同提交的 GitHub Actions 为准，不能由局部镜像推断。其中包含真正的 `httptest.Server → Collector → Bridge HTTP → feed.Client.Fetch → events.Decode → FetchArchive → history.Analyze → news.Top` 断言；多轮相同响应、304、修订、显式撤回、重启、DNS/错误状态、来源异常、持续限流、防 SSRF、无虚假未来时间均通过模拟测试。
- **尚未完成**：当前隔离容器无法解析公共域名，无法在该容器运行真实 Go `probe` 对公网四接口的 200/304/缓存响应头验收。本期开发者文档及实时 JSON 网络访问与 **Go 程序实际公网请求** 是两类证据，不能混同。四接口真实联通、Go 项目完整原仓库测试和 macOS/Windows 编译由 `master` GitHub Actions 及具备外网的开发环境继续核验；CI 测试不证明上游公网数据已经采集。
- 测试覆盖不等于生产评审 95 分。特别是上游历史窗口截断、未文档化的撤回表达、尚无官方未来执行时间、单机文件锁在异常结束后需人工恢复、V1 快照 256 条 / News 64 条 / 历史 2400 版本容量限制，仍须后续谨慎迭代。超过容量时明确停止本轮发布，不静默遗忘历史。

## 下一阶段边界

R2.4-C 新建真实/模拟数据隔离的 C4 HTML，**不可覆盖 C3**；在 C4 严格展示“下一次时间待公布”、第三方来源和 `Data: codex-reset.com` 同屏链接。只有用户确认视觉及状态后再实施 AppKit/Win32，同屏署名和 Mac/Windows 原生实窗验收须独立判定。商业化重分发前重新评估数据使用条款。

## R2.4-B 持续修复补充（2026-10-13）

在上游无法访问期间，修复了三个有真实失败风险的边界：

1. **读时来源健康**：`/feed` 和 `/healthz` 在没有新的轮询时仍以最近发布检查时间判断 30 分钟新鲜度。超过期限时将对外 `source_health.status` 计算为 `stale`，`/healthz` 返回 503，`/feed` ETag 因健康变化而失效；不改写已保存的事件修订版本、原文和原始检查时间。
2. **原帖时钟的迟到补证**：首轮仅有 Timeline 的第三方确认时间、短 Feed 后续才出现同 ID 原帖时间时，允许 `SourcePublishedAt` 从未知变成有证据的发布时间并生成一次修订；已保存的原帖发布时间严禁改写或删除。历史归档保持 `complete:false`，第三方仍无 `verified_at/effective_at`。
3. **探针真实性与轮询间隔**：`probe.live_api_verified` 仅在四个端点都确实通过 HTTP 200/304 完成请求并验证时才为 true；完全从本地缓存读取不得伪称实网通过。完成一轮四接口之后空闲 5 分钟，再进入下一轮，而非空闲 30 分钟；全域 60 秒和 Cache-Control 约束保持原样。

验收：当前隔离 Linux 容器执行 `go test`、`go test -race`、`go vet` 定向包（`internal/bridge`、`internal/history`、`internal/provider/codexreset`、`cmd/reset-clock-bridge`）均通过；编译 Linux、`GOOS=windows GOARCH=amd64 CGO_ENABLED=0`、`GOOS=darwin GOARCH=arm64 CGO_ENABLED=0` Bridge 成功；本机回环实测 `/feed=200`、`/archive=200`、来源未知时 `/healthz=503`。这些是独立进程的本地 HTTP 验证，不是公网四接口成功请求。实际 `curl` 公网域名仍返回 `Could not resolve host: codex-reset.com`，**Go 真实四接口采集与服务端可公开署名的合规验收仍为未通过 / 未验收**。

代码新增了明确的矛盾来源检测（`announcement_state=announced` 但明确 `confirmed=false` 的追踪记录仅入待核验，不直接确认为完成），以及超过一页的 Go HTTP 归档分页回归测试。GitHub CI 的 `Windows Core` 还出现与 Reset Clock 无关的 `internal/browsercli/command.go: host.Close undefined` 编译失败，须由其模块独立修复，不应把该失败误认为 Go Bridge 的运行测试失败。
