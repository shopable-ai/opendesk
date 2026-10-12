# OpenDesk Reset Clock · Go 桌面客户端演示

> 状态（2026-10-12）：**独立 Go 模块及本地 HTTP 合成演示已实现**。这不是官方实时公告源，也不是已发行、已签名的 macOS / Windows 产品。桌面实窗、托盘系统权限、多屏、休眠与 Explorer / Spaces 稳定性尚待对应真机验收。

## 一条命令运行 V1 → V2 → V3 演示

在 **OpenDesk 仓库根目录**执行：

```bash
(cd examples/desktop-reset-clock && go run ./cmd/demo)
```

- 需要 **Go 1.22+**；不要求安装 OpenDesk Runtime、Codex CLI、Node 或额外 Go 依赖。macOS 原生窗口需要系统 Xcode Command Line Tools / CGO。Windows 提供原生 Win32 卡片、通知区域菜单和设置窗；Linux 构建用于协议/提醒测试，仅提供控制台降级显示。
- Demo 在 `127.0.0.1` 的随机端口启动**受控合成 HTTP Feed**，终端打印 `模拟控制页面` 地址。将这个地址复制到浏览器，即可点击 V1 / V2 / V3 / 过期 V4，也可从 macOS / Windows 托盘选择 `模拟公告 V1/V2/V3`。
- 选择 **V1**：看到「【模拟数据】」标签、三天前的发布时间、未来约 40 分钟的预计时间和实时倒计时，**不会补发三天前的新公告推送**。
- 选择 **V2**：点击托盘「立即刷新」（或等待默认 5 分钟轮询），相同 `id` 的 `revision` 由 1 → 2、`feed_version` 由 1 → 2，预计时间改为启动后约 90 分钟；旧提醒计划取消并建立新计划。
- 选择 **V3**：再刷新，`revision` 变为 3、`state=withdrawn`；卡片显示已撤回，不保留倒计时，不触发旧提醒。
- 可切换控制页「模拟无变化（304）」和「启用正常上游检查（200）」：304 只更新客户端有效检查时间；200 无公告变化但可更新**上游检查时间**。
- V4 用于已过期历史事件；版本号有意单调，**从 V3/V4 倒回 V1/V2 会因版本倒退被拒绝**。重跑 Demo 即重置 Mock 版本（随机端口产生独立 Feed 身份），无需清理生产缓存。
- Demo 状态文件：仓库根 `.runtime/tests/desktop-reset-clock/demo-state.json`，不应提交。Linux 控制台仅打印状态变化；真实交互窗口须在 Mac/Windows 运行。

## 使用自己的 HTTPS Feed

在同一示例目录下：

```bash
go run ./cmd/desktop-reset-clock -feed 'https://YOUR-OWN-TRUSTED-SERVER.example/events.json'
```

上述 URL **仅是需替换的占位符**，没有配置任何官方在线服务。设置窗中也可以输入正式 HTTPS Feed URL 并保存刷新；仅显式 `-allow-local-http` 或 Demo 开启本机回环 HTTP。认证、Cookie、浏览器登录采集均不在本模块内。用户名、密码形式的 URL 会被拒绝；请勿将密钥放进 URL 参数或公开日志。

简化 JSON 契约（以下是*虚构格式*）：

```json
{
  "schema_version": 1,
  "channel_id": "example-public-channel",
  "feed_version": 1,
  "generated_at": "2026-10-12T07:00:00Z",
  "source_health": {"status": "ok", "last_checked_at": "2026-10-12T06:59:00Z"},
  "events": [{
    "id": "stable-001", "revision": 1, "type": "reset_announcement",
    "state": "active", "audience": "all_users",
    "source_published_at": "2026-10-09T07:00:00Z",
    "verified_at": "2026-10-12T06:59:00Z",
    "effective_at": "2026-10-12T08:00:00Z",
    "source_url": "https://example.org/illustrative-source",
    "summary": "演示用途，请不要视为真实公告"
  }]
}
```

- 一个 Feed 是同一 `channel_id` 的**完整事件快照**，不能删除旧事件而不留下 `withdrawn` 墓碑。旧版事件必须增加自己的 `revision`；Feed 中任意事件变更，`feed_version` 也要递增。撤回时 `effective_at: null`。
- 只有 `reset_announcement`、`active`、`all_users` / `public`、明确 `effective_at` 和 `verified_at`、且上游确实最近检查（30 分钟内）才建立自动公告提醒。其他适用范围仍显示公告，但不会暗示个人账户符合资格。
- `generated_at` 是 Feed 生成时间；`source_health.last_checked_at` 是提供方实际上游检查时间；两者不可互换。HTTP 200/304 **不能**自行证明来源最近检查过。
- 300 秒轮询；15 / 30 / 60 分钟来源新鲜度预警门槛是演示默认值，真实部署需根据来源 SLA 调整。401/403 暂停自动轮询；429 遵守 Retry-After；失效来源停止新的自动公告通知；离线显示最后有效缓存。
- 提醒有到时、可选提前 10 分钟、手动 10 分钟及免打扰；允许约 90 秒的睡眠恢复补偿，不重放更旧的提醒。Mac 系统通知权限需从菜单显式申请；Windows 使用系统通知区域提示。**系统是否展示通知仍依赖 OS 权限与打包身份。**
- 公告预计时刻到来不等于来源已经宣布完成，更不等于**用户个人 Codex 额度已经恢复**。

## 代码与测试

- `cmd/demo/` / `internal/mock/`：开发 Mock（独立于产品数据采集），回环控制页、HTTP V1/V2/V3。
- `cmd/desktop-reset-clock/`：正式单一程序入口，可配置 HTTPS Feed。
- `internal/feed/`：超时、重定向、条件 GET、上限 2 MiB、状态码与 JSON 校验。
- `internal/events/`：schema、稳定 ID、revision、版本冲突与撤回。
- `internal/health/`：HTTP、有效 Feed、上游来源、内容变化四条独立时间轴。
- `internal/settings/`：用户配置目录的权限受限 JSON 缓存与原子替换；无 SQLite。
- `internal/reminder/`：可撤销计划、跨重启去重、手动提醒与过期跳过。
- `internal/clock/`：UTC、IANA 时区、DST、基于绝对时刻计算倒计时。
- `internal/app/`：后台 5 分钟轮询、持久化优先、动作响应与 UI 状态。
- `internal/desktop/`：macOS AppKit CGO / Windows Win32 系统窗口与通知区；按 Go build tags 隔离。已查看 `pkg/appshell`，因其绑定 OpenDesk App Mode/Runtime 而未直接引入。

在 **`examples/desktop-reset-clock/`** 工作目录执行：

```bash
go test ./... -count=1
go test -race ./... -count=1
GOOS=windows GOARCH=amd64 CGO_ENABLED=0 go build -o ../../.runtime/tests/desktop-reset-clock/reset-clock-windows.exe ./cmd/desktop-reset-clock
```

首次跨编译前请创建 `.runtime/tests/desktop-reset-clock/`。Win64 编译通过**不等于 Windows 实际桌面验收通过**；Linux 无法直接编译 `AppKit`/Objective-C，需要在 Mac 运行 `go build ./cmd/desktop-reset-clock` 并实测。正式无控制台 Windows 发行版可使用 `-ldflags '-H=windowsgui'`，但请先完成普通测试构建与真机日志核查。

## 产品质量现状及后续 Codex 真机验收

- **VERIFIED（当前环境）**：Go 单测/HTTP Mock、Linux 构建/控制台 Demo、Windows amd64 交叉编译（见当次交付报告，不能替代用户电脑复验）。
- **IMPLEMENTED_UNVERIFIED**：AppKit 桌面卡片、Mac 通知中心、Windows WorkerW/Explorer 桌面附着、托盘/设置原生点击、系统级单实例与位置恢复。
- **NOT_TESTED**：Mac 真机 CGO 编译、Mac/Windows UI 截图、通知授权拒绝、锁定穿透、多显示器、时区切换、系统休眠 24h、Explorer 重启、安装升级卸载及资源占用。
- **BLOCKED**：真实官方 Feed 的 URL/授权证明尚未提供，无法声称真实官方公告已接通；两平台签名安装包未制作。

本轮测试产物统一放在仓库根 `.runtime/tests/desktop-reset-clock/`。正式视觉与行为验收须记录命令、VCS HEAD、进程来源、OS 版本、权限、截图/录像、通知权限及失败复现；不得把模拟 HTTP 单测当作真机验收。
