# Reset Clock R2.6 — 多形态原生桌面 + 浏览器详情交接/验收

日期：2026-10-14。仓库：`shopable-ai/opendesk`，唯一可写分支：`master`。

## 已写入源码，不以原型替代

1. **macOS 原生菜单栏**：继续使用 `NSStatusItem`（`internal/desktop/native_darwin.m`），状态图形取自 SF Symbols 模板图标，`NSStatusBarButton.appearsDisabled` 表示灰态；用户可控制有有效预告时是否显示简短倒计时。状态摘要通过原生菜单访问。
2. **可选迷你卡片**：同进程第二个 `NSPanel`，默认关闭，支持独立拖动位置、持久化以及显式 `NSFloatingWindowLevel` 选项。主卡片的 C3 已批准渐变与三条动态保留；默认没有 Dock 图标，未侵入 Dock。
3. **单一事实模型**：`internal/app/compact.go` 根据已有 `HasUpcoming` 与合法未来时刻投射 `MenuStatus`。历史、第三方统计或来源异常不会被改写成未来确定倒计时。
4. **网页详情**：现有 `cmd/reset-clock-bridge` 进程新增 `GET /reset-clock/`；HTML/CSS 直接由 Go `html/template` 从 Bridge 内存可信状态渲染，响应 CSP、HTML 自动转义、不含第三方远程脚本；页面有概览、历史记录、资讯、原始来源。无额外轮询。
5. **可恢复的原生窗口**：菜单「记录与动态」和主卡片按钮在 `web_details_url` 出自本 Feed 同源合法网址时，使用默认浏览器打开；网站不可用、未提供或无法打开时，打开既有本地详情。原生「设置」保留在本机。
6. **Windows 兼容**：保留 Win32 UI，详情入口适配同源网页，暂不声称已做 Windows 迷你浮窗。

## 如何看到实际入口

从 OpenDesk **仓库根**使用两个终端：

``bash
# 终端 A：启动已有 Go Collector + Bridge，监听本机
(cd examples/desktop-reset-clock && go run ./cmd/reset-clock-bridge serve -listen 127.0.0.1:8788)
``

``bash
# 终端 B：启动桌面常驻应用
(cd examples/desktop-reset-clock && go run ./cmd/desktop-reset-clock -feed http://127.0.0.1:8788/feed -allow-local-http)
``

直接打开网页版地址：`http://127.0.0.1:8788/reset-clock/`。这是**本机网页，不是正式官网**。桌面卡片默认锁定点击穿透，需要用**顶部菜单栏 Reset Clock 图标 →「记录与动态（网页优先）」**打开；「设置」也在同一菜单。若菜单栏因 macOS 显示限制被折叠，应在真实 Mac 验收中记录。

Mac 开发 .app 构建：`(cd examples/desktop-reset-clock && bash scripts/build-macos-app.sh)`。该脚本目前保留既有 `.runtime/tests/desktop-reset-clock/v1/Reset Clock.app` 不覆盖旧开发包；要实测新源码，必须确认当前实际运行二进制来自最新 HEAD，不得误用旧包。此为开发包，不是已签名/公证的安装产品。

## 独立验收证据与现状

| Gate | 目标 | 现状 |
| --- | --- | --- |
| Go 单元：状态、迁移与同源链接 | PASS | 测试源码已写入；等待最新 GitHub Actions 完成，不先写 PASS |
| Bridge 网页输出/XSS/GET 限制 | PASS | 测试源码已写入；待 GitHub CI |
| CGO AppKit 编译/Win32 编译 | PASS | 待当次提交 CI；不能用上一版结果 |
| 菜单栏图标与迷你卡片真实 Mac 可视 | ≥95 | **NOT_TESTED**：需真实 WindowServer 实窗截图和交互 |
| 主卡片 C3 一致性 | ≥95 | **NOT_TESTED**：保留代码不能替代视觉对比 |
| 多屏、Dock 位置、多 Spaces/休眠 | ≥95 | **NOT_TESTED**：需要真实 Mac 测试 |
| 网页可信来源/历史真实数据 | ≥95 | 协议与代码存在，公网真数据、正式域名与商业授权 **NOT_TESTED** |
| 生产官网发布 | 可访问 HTTPS | **NOT_DEPLOYED**：目前没有经确认的 Reset Clock 官网域名或部署 |

所有实机截图、PID、构建身份、HTTP 头部及测试日志存放在仓库根 `.runtime/tests/desktop-reset-clock/r26/`，不提交。这次对用户说的「其他窗口」对应的是「记录与动态」弹窗；「设置」不可误作此类线上内容迁移。

## 下一轮最有价值的动作

在真实 Mac 上：核对最新 HEAD / 当前 PID / `.app` 生成时间，执行独立模块 Go 测试、race、vet、Go Bridge HTTP 回归，并启动最新版原生 AppKit。用 **无数据 / 有合法预告 / 15m 内 / 撤回 / 来源 stale** 验证菜单栏图标、文本、VoiceOver、迷你挂件拖动、悬浮与主卡片隐藏。确认从菜单进入的浏览器 URL 来自实际 Bridge，并验证服务断开会安全回退。任何失败先修再签字。

**不承诺这轮已经完成本地 macOS 实测，也不以静态网页预览代替原生截图；请根据最新 CI 和实际运行证据更新本报告。**
