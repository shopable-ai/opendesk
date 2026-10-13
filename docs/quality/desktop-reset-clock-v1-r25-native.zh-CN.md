# Reset Clock V1 / R2.5 — Desktop Widget First 实施与验收报告

日期：2026-10-13  
仓库：`shopable-ai/opendesk`；唯一写入分支：`master`  
本次需求：**不再制作 HTML 原型，直接沿用 Go Collector/Bridge、AppKit/Win32，完成原生桌面背景挂件和可验证的数据来源。**

## 0. 结论（证据优先，不虚报发布）

- **已写入正式 Go 原生源码**：macOS AppKit 和 Windows Win32 386px 背景挂件，深青绿渐变、准确未来时间/“下一次时间待公布”、最近第三方事件、最多三条常显动态、可点击数据署名；沿用原生设置/历史/资讯窗口、菜单栏/托盘、点击穿透和缓存/历史协议。
- **Go V1 联调路径有代码**：`codex-reset.com` → 现有 Go Collector → Bridge `/feed`+`/archive` → 独立 Go 桌面客户端；`cmd/demo` 仍仅用于隔离模拟，不是正式产品数据来源。没有部署可供终端使用的公共 HTTPS Bridge，必须本机双进程启动。
- **真实公共数据是否显示**：尚无此次 R2.5 的实际 Go 公网 `probe.live_api_verified=true` 记录，不得宣称在真机采集到了真实三条新闻；缺少公开完整准确未来时默认明确显示“下一次时间待公布”。
- **真实 Mac AppKit/Windows Win32 视觉**：源码已实现，**NOT_TESTED**；尚无来自此次提交的真实系统窗口截图和前台覆盖、鼠标穿透、多 Spaces、多屏、Explorer 恢复、休眠唤醒完整证据。C3 HTML 截图不计算在原生 UI 验收内。
- **macOS 开发包**：`scripts/build-macos-app.sh` 生成非签名、不公证的 `LSUIElement` 菜单栏 `.app` 到 `.runtime/tests/desktop-reset-clock/v1/`；没有发布证书或线上分发承诺。**登录自动启动开关仍未实现**。
- **质量门槛**：任何未有对应真实证据的维度均为 `NOT_TESTED`，不能凭代码评审计为 ≥95 分；以九项独立通过为 V1 对外宣布完成的先决条件。

## 1. V1 采用的唯一产品入口

在**仓库根目录**开两个终端；不直接调用第三方 API 作为桌面 Feed：

```sh
# 终端 A
cd examples/desktop-reset-clock
go run ./cmd/reset-clock-bridge serve -listen 127.0.0.1:8788

# 终端 B（另一个终端，同样从仓库根目录进入）
cd examples/desktop-reset-clock
go run ./cmd/desktop-reset-clock -feed http://127.0.0.1:8788/feed -allow-local-http
```

上游四个 API 是 `/api/forecast`、`/api/timeline`、`/api/feed`、`/api/status-history`；Go Bridge 以全域 **至少 60 秒**请求间隔访问，处理原始缓存、修订、撤回、HTTP ETag/304、429 冷却并发布来源健康。四次真实 GET 的首次完整循环至少约 3 分钟，视上游限速和网络而变。桌面客户端不会绕过 Bridge 发上游请求；直接输入 `https://codex-reset.com/api/forecast` 不是合法桌面 Feed。公网未部署时不能复制“正式公开服务地址”。

在 Mac 生成原生 `.app`：

```sh
cd examples/desktop-reset-clock
bash scripts/build-macos-app.sh
cd ../..
open '.runtime/tests/desktop-reset-clock/v1/Reset Clock.app' --args -feed http://127.0.0.1:8788/feed -allow-local-http
```

Mac 构建需要 macOS + Xcode Command Line Tools + CGO。Windows 原生可执行需要在 Windows 上运行，Linux 不提供独立 GUI。桥与客户端各自独立运行；隐藏客户端卡片≠退出/停止定时 HTTP 刷新；明确退出客户端才终止它的 poll loop。

## 2. 功能证据矩阵

| 环节 | 源码位置 | 已实施 / 缺少的实测 |
| --- | --- | --- |
| 单一公开 Provider | `internal/provider/codexreset/` | R2.4B Go Collector，限流、缓存、凭证禁用；R2.5 尚无新公网 `probe` 验收 |
| Bridge 真实 HTTP | `internal/bridge/`、`cmd/reset-clock-bridge/` | 既有 `/feed`、`/archive`、`/healthz` 和分页；不是公共 HTTPS 上线服务 |
| 共用客户端事实模型 | `internal/app/app.go`、`internal/desktop/desktop.go` | 统一处理第三方历史、无未来精确时间、最多三条动态、离线缓存标签、署名 URL |
| AppKit 卡片 | `internal/desktop/native_darwin.m` | 原生 NSPanel 渐变、三条常显、真实可见署名与菜单栏；真机视觉/点击待验 |
| Win32 卡片 | `internal/desktop/native_windows.go` | 原生 GDI 渐变、三条常显、托盘及 WorkerW 回退；实窗待验 |
| 历史与资讯 | `internal/app/app.go` + 原生详情窗口 | 区分第三方全员/储备/故障，修订、撤回及真实 HTTPS 原始证据；真实来源窗口待验 |
| 本地持久化和单实例 | `internal/settings/`、`internal/instance/` | 复用原文件缓存、位置、锁定、隐藏状态、锁文件/Mutex；实机重启/失效恢复待验 |
| macOS `.app` | `scripts/build-macos-app.sh` | 非签名开发包，待 CI macOS 原生编译、实际 Finder 启动与截图 |
| 自动启动与多屏恢复 | 平台内核、设置待增强 | **NOT_IMPLEMENTED**：登录启动控制；**NOT_TESTED**：多屏/Spaces/Explorer/睡眠恢复 |

### 来源真实性与历史数字

`codex-reset.com` 是独立第三方，不是 OpenAI 官方。上游 forecast 概率和 `last_reset_at` **不会变成未来精确重置时间或个人账号额度声明**；仅带已验证官方未来有效时刻的现有事件契约才允许倒计时。第三方事件没有 `effective_at` 和 `verified_at`，最近一次重置显示为**历史第三方记录**，非官方通知。缓存动态必须标注“缓存”；撤回动态不能当作有效动态。来源失效时停止新的未核实提醒。历史区间覆盖不足仍返回“数据不足”，不假装是 0 次。

在正式卡片及详情显示链接 `Data: codex-reset.com`；点击目标限定 `https://codex-reset.com/`，并保留菜单栏/托盘操作（卡片默认锁定穿透）。**第三方数据的使用条款遵循公开开发者文档，商业重分发时必须重新确认。**

## 3. 测试项目与证据分级

从 `examples/desktop-reset-clock/` 执行：

```sh
go test ./... -count=1
go test -race ./... -count=1
go vet ./...
go build ./cmd/reset-clock-bridge
go build ./cmd/desktop-reset-clock
# 平台开发者 CI：Windows amd64 cross-build 与 macOS arm64 non-CGO fallback
```

新增回归：`internal/app/r25_widget_test.go` 测第三方最后重置、全员/储备/故障分别显示、三条带 HTTPS 来源动态、撤回留档、覆盖不完整不产生 0、离线缓存显示但不伪报未来时间；原 `display_test.go` / `r22_card_test.go` 更新为常显 V1 合同。CI `reset-clock-ci.yml` 运行 Ubuntu、macOS、Windows Go + vet + bridge & client build、race-and-cross 和离线 Chromium 原型（该原型视觉**不能**当 AppKit/Win32 实窗）。

- Linux 远端开发容器当前没有目标 Mac/Windows 图形会话；不使用 HTML 截图充当原生验收。
- 测试输出和真实窗口截图仅保存根目录 `.runtime/tests/desktop-reset-clock/v1/`，遵循 `AGENTS.md`，**不提交本地运行数据**。
- 当前网络执行环境未完成真实上游 Go `probe`；任何 HTTP Mock 验收均仅证明协议路径，不证明第三方 API 已真实采集。
- GitHub Actions CI 的具体最新成功或失败状态以该 SHA 对应的 `Reset Clock Standalone R2` 运行结果为准。旧版 R2.4B 基线 CI 成功不能代表 R2.5 变更已经通过。

## 4. 独立质量门槛：不做虚高评分

| 维度 | 目标 | R2.5 证据状态 |
| --- | --- | --- |
| 数据准确性 | ≥95 | `NOT_TESTED`：需实际四 API Go probe + 真源 Bridge 展示 |
| 原生卡片视觉 | ≥95 | `NOT_TESTED`：需 AppKit/Win32 实窗截图 |
| 信息排版与可读性 | ≥95 | `NOT_TESTED`：需长中文、多种桌面背景、分辨率实测 |
| 桌面常驻行为 | ≥95 | `NOT_TESTED`：需浏览器前后台/图标/WorkerW / Spaces |
| 后台运行可靠性 | ≥95 | `NOT_TESTED`：需隐藏、锁定、休眠、重启、单实例实测 |
| 来源安全与合规 | ≥95 | `NOT_TESTED`：已实现署名与协议守卫，尚需实际验链与条款复核 |
| 历史及资讯可用性 | ≥95 | `NOT_TESTED`：真实三条动态/30 天覆盖需要真源确认 |
| Go 代码质量 | ≥95 | `NOT_TESTED`：需最新 SHA go test/race/vet/build 成功后评审 |
| 真实测试充分性 | ≥95 | `NOT_TESTED`：只有 CI、原生真机/公网整链验收后才能评分 |

## 5. 尚未完成的 P0 / P1

1. **P0：公网真数据实证**：连接可联网 Mac，执行 Go `probe`（不缩短四接口全域 60s 冷却），用 `/feed`、`/archive` 验证真实 200/304、revision、stale；核对不是服务故障冒充额度重置；标注实际最多几条有效动态。
2. **P0：真机原生截图**：用当次源码编译出的 macOS `.app`，记录实际进程、构建身份、NSPanel、长中文、明/暗背景、多屏、Spaces、浏览器遮挡、穿透、菜单栏、详情、可点击来源、关闭详情≠退出；截图保存 `.runtime/tests/desktop-reset-clock/v1/`。Windows 无设备时明确 `NOT_TESTED`。
3. **P0：CI 最新 SHA 完整通过**：如实际失败，读 Actions 具体日志逐项修复、重跑；不得凭旧 SHA 通过推断。
4. **P1：自动登录启动**：默认关闭，只以 OS 用户级机制选择启用，不需管理员权限，不额外部署守护进程；目前未写入控制入口。
5. **发布条件**：生产用 HTTPS Bridge 部署、来源合规复核、用户级单实例/休眠/网络可靠性、正式包签名、公证与 Windows 行为证据；无 URL 和证书时不可声称发布完成。

**阶段定义：R2.5 原生源码实施与回归准备已交付；V1 真机可用、真实公网数据、Windows 视觉/行为与 95+ 尚未取得完成证据。**

