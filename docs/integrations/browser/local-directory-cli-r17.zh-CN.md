# OpenDesk Go · 本地目录直连 R17

日期：2026-10-10。OpenDesk 仅在 `master`，Browser 仅在 `main`。日常入口、实际 npm 包安装和 Chrome 验收见 [Browser R17 使用指南](https://github.com/shopable-ai/opendesk-browser/blob/main/docs/framework/local-directory-cli-r17.zh-CN.md)。

## 双入口和原命令

```sh
cd "/absolute/path/项目 A"
opendesk browser
opendesk browser dev
opendesk browser dev "/absolute/path/项目 B"
opendesk-dev
opendesk-dev "/absolute/path/项目 B"
```

裸 `browser` 等价于 `browser dev .`，带特殊目录名时使用 `dev -- <路径>`。原 `setup/update/doctor/cleanup/workspace/project/ai/native-host/bridge.status/run.*/page.*` 子命令不改语义；未知子命令不会冒充目录。帮助与版本查询没有文件、Node Provider、浏览器打开或授权副作用。

`internal/browsercli/dev_unix.go` 通过私有安装凭据关联已注册的 `@shopable/opendesk-dev` npm 全局包入口，核对入口路径及 SHA-256，按数组参数启动 Node，并保留工作目录、stdio、退出码和中断信号。Go Native Host 自身不依赖 Node；它也不会从当前工作目录找同名程序、切换旧 Host、安装未知 npm 依赖或请求 latest。本期支持已配对 macOS/Linux Host；其他平台应报告明确不支持。

## 原生协议：共享 Host，多个来源

仍使用原 `com.shopable.opendesk_browser.agent`、精确扩展 ID、同一用户受认证 Socket、60 KiB 消息预算和 Browser 的原网页权限/RunHost/Controller。双方须显式协商 `localDevMultiVersion:1`；旧端不兼容时拒绝目录 CLI，而不是降级成抢占旧 MCP 的独占 Provider。

本地 CLI 将明确目录通过 `dev.attach` 登记为**临时只读** Workspace。Go 校验路径、owner、设备/inode 和已配对安装身份，为它生成不透明 `sourceId/workspaceId`。普通 MD/HTML 目录不要求程序清单。只有已声明合法 `opendesk.project.v1` 的目录才由同一 Node `LocalDevSession/Resolver/Provider` 提供运行源码；没有第二套执行器或项目数据库。

`host_dev_multi_unix.go` 将 Node `catalogVersion:2` 来源、旧 MCP Provider 和现有 Go JS 单文件授权汇总成 Browser `projects.list`；`project.resolve` 使用有界映射按 owner、Provider epoch 和原始 binding ID 路由。不同文件夹即使 basename 和程序 ID 相同也不混淆；同一来源不允许第二个 CLI/Provider 抢占。回复身份、消息大小、超时和 Provider 所属会话均须检查。源集合变化旋转聚合 epoch，迟到回复不能恢复过期源码。

CLI Ctrl+C 只撤销自己拥有的临时目录、关闭自己的 Provider；不撤销原 `WorkspaceAdd` 产生的长期写授权，不停止其它目录，也不重放业务。Host 不通过 CLI 自动执行网页 JS、npm scripts、HTTPS 模块下载或 Shell。

## 文件安全与页面

`dev_workspace_unix.go` 重用 `files_service_unix.go` 的目录扫描、文本预算、路径穿越/符号链接拒绝和已授权文件读写接口。新增临时只读目录拒绝 `files.write/files.create`；已有长期 `read-write` 仍使用原 SHA-256 乐观并发冲突与保存后读回。Chrome URL 仅携带不透明来源定位 ID，权限依旧在每个 Native 文件请求中检查。

扩展复用 `native-agent/workspace.html` 而非新 IDE；用户在页面上可以看目录、静态预览与编辑，显式保存、另存或进入原开发侧栏。Chrome Side Panel 仍必须由用户手势开启，扩展文件 Workspace 不能替代实际网站的运行目标。

## 测试分级

Go 定向入口：`go test -count=1 ./internal/browserbridge ./internal/browsercli ./internal/browserai`。新增 `dev_workspace_unix_test.go` 覆盖临时目录只读/隔离/重复接入/长期授权不被退出撤销；新增 `host_dev_multi_unix_test.go` 使用真实 Socket 和模拟 Chrome Native 帧核对双 Provider/回包/生命周期。最终 PASS 必须依据对应当前 SHA 的 GitHub Actions 结果。

Browser R17 CI 在 macOS、Ubuntu 将真实 npm tarball 安装于源码树之外，并从安装包导入 Resolver/Session 后运行扩展构建；该结果是组件和打包证据，不是 Chrome UI 或本机 OpenDesk.app 已加载新代码。真实 Mac 安装、Chrome Profile/扩展 ID、双目录标签页打开、外部文件冲突、Controller 新运行与原结果身份，均须用户设备实际验证后才可标为 PASS；否则记 `NOT_TESTED`。

R17 与高级 Codex MCP、Go JS 单文件和长期 Workspace 授权共存，不扩张 R16 AI 规划器或桌面自动化权限。
