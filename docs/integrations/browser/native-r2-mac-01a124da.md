# R2 Mac 安全配对与项目 GUI：01a124da

2026-10-10。OpenDesk master 单写入交接；不创建分支、不推送、不发布。初始提交 a9899757，R5 安装器保护 512e9495，R2 实现 e97e4d54299d1590daacfe72154dc4efafc891ea，后续上游集成 7518e3e30975934a941df3f03c73ae7e937fc3fa。本次闭环提交的实际 SHA、文件哈希与构建身份保存于 `.runtime/tests/browser-r2-01a124da/candidate-final.json`。

## 已实施

- SetupAutomatic / 无参数 setup、update 沿用经过认证的登记；普通 App 启动和同 ID 开发配对禁止隐式更换已登记 executable。固定官方 ID 未核验时返回 E_OFFICIAL_ID_UNAVAILABLE，不猜 ID、不扩大 allowed_origins、不改旧 Node 安装。
- 开发配对严格校验 URL、128 bit nonce 和两分钟期限；私有持久 replay ledger、独立原生确认、取消与过期默认拒绝。原生确认前不写 Host，不授权项目，不运行脚本。
- 所有安装实例和读取共用 flock；完整新旧两代预检、0600 journal、原字节回滚和目录 fsync。失败后的重试也同步已存在目录及稳定父目录，读取拒绝未恢复事务；未知修改不覆盖。提交耐久性不能确认时报告 E_INSTALL_COMMIT_UNKNOWN / OUTCOME_UNKNOWN。
- Go 产品菜单提供状态、单个 JS 文件选择、Controller/Page 类型及精确 Origin 授权和撤销。拒绝非标准 IPv4/IPv6（包括 mapped IPv6）、大小写或默认端口等非规范 Origin。原生模态确认支持提前取消、过期和迟到回执；已有 Controller 保留运行所有权和明确 Run。
- CLI 在派发前解析唯一 Sidebar；status 失败、零或多个 Sidebar 明确 NOT_DISPATCHED。EOF 和合法 OUTCOME_UNKNOWN 回复均保留原 requestId、registrationId、admissionMethod 和 requestDigest，不重派发。Go 摘要与实际 Browser canonical digest 的十个 Unicode/数字边界 oracle 一致。

## 本轮验证与证据等级

原始日志 `.runtime/tests/browser-r2-01a124da/`，失败文件不覆盖、不删除。

- `go-integrated-closure-final.log`：browserai、browserbridge、appshell、cmd/opendesk PASS；CLI 最初新测试调用了错误函数名，编译 FAIL 保留。
- `go-cli-closure-corrected.log`：保留新测试夹具错误字段造成的 FAIL。
- `go-cli-preflight-schema-corrected.log`：CLI PASS，包含真实本地 IPC 的六项预检失败与四项 EOF/合法 UNKNOWN 回复，无额外 mutation/replay。IPC 夹具不是 Chrome 验收。
- 较早 `go-final-short-canonical-tmp.log`、`go-provider.log`、App 构建等只代表各自旧输入；Go Provider 的模拟 Chrome 不提升为原生证据。
- 新 ARM64 App 的源提交、构建日志和二进制哈希见 candidate-final.json；本轮不安装、不替换系统 CLI、不启动 App/Chrome。

## 独立反方审计

只读审计 Agent Kepler 与实现者分离。完整原文保存在 independent-audit-*.md；旧发现与失败均保留。最后两个目录耐久性和预检错误分类缺口在限定静态复核中关闭，未发现新的安全关键 FAIL。早期86/82缺少分项账本，已由审计者修正为下表，不能使用早期分数。

| 类别 | 满分 | 设计 | 实现 |
|---|---:|---:|---:|
| 零命令行与可理解性 | 20 | 19 | 18 |
| Chrome 平台遵循 | 15 | 15 | 14 |
| 发行 ID、安全与迁移 | 20 | 18 | 17 |
| Go 原生 Host 与安装器 | 15 | 14 | 14 |
| 原生本地项目功能 | 15 | 9 | 6 |
| 失败与生命周期恢复 | 10 | 9 | 9 |
| 独立真实交付证据 | 5 | 0 | 0 |
| 合计 | 100 | 84 | 78 |

最终同候选真实 Mac 交付 NOT_TESTED，已核验同候选原始证据覆盖0/100；不评价或抹除历史证据，不判95+。

## 尚未关闭

可信 Chrome Web Store 官方稳定 ID 没有核验证据，也没有账号上传授权；不上传或预留草稿。正常发行版自动准备 Host 因此不可交付。原生 GUI 当前仅支持 JS 单文件；完整多文件/npm/HTTPS 项目继续保留高级 MCP 路线，不声称 GUI 已闭环。最终同候选 App-first/Extension-first、双 Profile、重启、原生授权、Controller/Page/Stop/Result、源码变化、释放及真实断电恢复均未完成。未执行远端 GitHub CI/发布。

R5 按用户要求暂停安装并准备交接；其 App、CFT profile、CDP60189、r5-mac实例由R5保管，本轮无GUI/CDP操作。用户默认Node、dev Node43120、其他GUI进程、padding会话的未提交文件及用户PNG保留。

## 用户流程

发行目标仍为：安装 OpenDesk → 安装扩展 → 真实点击授权连接 → 原生授权本地项目 → Sidebar 刷新后明确 Run。官方 ID 未核验，不能称此流程已交付。开发版可通过扩展开发配对按钮提交短期申请，在 OpenDesk 独立确认，然后单独授权 Native Messaging、网站、JS 文件及运行类型；项目授权不自动运行。人工网页唯一入口 http://127.0.0.1:43111/demo-form.html。63825 专用 fixture 仅是历史证据，不作为普通用户入口。
