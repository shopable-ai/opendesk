# R2 Mac 安全配对与项目 GUI：01a124da

2026-10-10。在 master 串行集成；不创建分支，不上传或发布，不覆盖旧 Node 或其他任务现场。

## 实施与消费者

- `install_unix.go` 的 Setup / SetupAutomatic：供官方 Go CLI、新装 App 自动准备和开发配对使用；已有认证登记在普通启动或同 ID 配对时沿用，禁止隐式 executable 迁移。精确扩展身份与现有 Node 冲突保护保留。
- `install_transaction_unix.go`：全实例共享 flock（包括读取屏障）、新旧两代全部文件预检、0600 私有 journal、目录 fsync、完整原字节恢复。耐久性收尾无法确认时明确 E_INSTALL_COMMIT_UNKNOWN / OUTCOME_UNKNOWN，不谎称已回滚。混合状态 Load 拒绝；恢复不覆盖未知修改。启动遗留恢复与自动更新共用锁。
- `pairing*.go`：仅接受两分钟开发申请；URL 不携带权限、路径或 browser/profile；nonce 私有持久消费，取消后也禁止重放；原生独立确认后才调用 SetupContext，提交期间过期/取消触发回滚。
- `pkg/appshell/browser*` 与 `native_darwin.*`：产品菜单诊断、JS 单文件选择、运行类型与精确 Origin 确认、撤权；默认取消。配对模态窗口到期/上下文取消后关闭，非法或重放 URL 不抢前台。
- `cmd/opendesk/app_browser.go` / `app_mode.go`：产品 App 启动自动准备、系统 URL 收件、菜单到 Go Provider；授权本身不执行脚本。继续使用现有 Browser Controller/运行所有权。
- `project_origin.go`：拒绝 Go/Chrome 解释不一致的 Origin（大小写、默认端口、旧式 IPv4、非标准 IPv6、Unicode 等）。

- `internal/browsercli/admission.go` / `command.go` / `browserbridge/admission_digest.go`：UNKNOWN 输出保留自动生成的原 requestId 与 registrationId/admissionMethod/requestDigest；省略 registration 时只读查询一次 Sidebar 并绑定精确登记，不重放。十条真实 Browser digest 向量及 Go IPC EOF 错误路径回归通过。

## 本轮证据

原始日志：`.runtime/tests/browser-r2-01a124da/`。未删除初次共享工作区 FAIL、错误命令与构建 FAIL。

- `go-final-short-canonical-tmp.log`：最终 browserbridge / browsercli / appshell / cmd 四包 PASS；含独立反方修复和 CLI 恢复回归。短规范 TMPDIR=/private/tmp/od-r2-01a124da，满足 Unix socket 路径长度并规避 /var 符号链接身份差异。
- `go-cmd-final-normalized.log`：cmd/opendesk PASS；TMPDIR 显式设置为仓库私有测试目录，规避 macOS /var 与 /private/var 身份差异。
- `app-final-build.log`：较早 R2 源码快照完整 x86_64 Mac App 构建 PASS，后续安全修复未绑定此旧构建；快照排除 foreign floating-toolbar 未提交修改；只构建，不替代系统安装验收。
- `go-provider.log` 位于 Browser 本轮 evidence：真实 Go 可执行文件 + 模拟 Chrome 的组件回归 PASS，明确不是 Chrome 原生验收。
- 真实 Chrome、系统安装、真实 Native 提示、Run/Stop/Result/重连由 R5 唯一资源负责人在本轮提交后归档源码并 ARM64 重建执行；旧候选证据不能升级为本候选证据。

## 限制与最终验收门槛

官方稳定 CWS Extension ID 尚无可核验发布证据，常量继续为空。新安装自动准备返回 E_OFFICIAL_ID_UNAVAILABLE；没有账号授权，不预留或上传草稿，不猜 ID。

GUI Provider 当前明确支持 JS 单文件；多文件 ESM/npm/HTTPS 仍为高级 MCP 能力。默认用户 Native 安装为 Node 在用时不自动迁移。受控 CFT 使用已审查的命名实例与显式 Profile，开发 URL 无权改变这些参数。

独立反方复审、同提交真实 GUI/Chrome、安全矩阵、App 先安装/扩展先安装与多 Profile 等必须逐项记录；没有原始证据则 NOT_TESTED，不判 95+。最终分数与源码 SHA 在后续验收记录绑定。
