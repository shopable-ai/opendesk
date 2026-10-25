# ChatGPT 官方网页文件证明：连接准备与实际阻塞

开始日期：2026-10-25；本地准备收尾跨至 2026-10-26。工作目录：
`/Users/shopme/Documents/workspace/opendesk`；分支：`master`。

## 当前结果

**网页到本机的文件写读尚未通过，不能宣称完成。** 本轮已实际创建专用托管 Tunnel，
并在 ChatGPT 官方网页填入该 Tunnel、选择“无需身份验证”，提交一次插件创建。
网页返回：“应用配置受到速率限制。请稍等片刻后重试。如果你正在使用隧道，
也请检查隧道客户端是否正在运行且已连接。”插件未创建，没有发出网页工具调用。
该提示本身不能证明账户、套餐或 RBAC 不可用。

官方客户端对本轮实际 profile 执行 `doctor --explain`，退出 2，唯一失败检查为
`control_plane_api_key`：当前进程没有 `CONTROL_PLANE_API_KEY`。
没有启动官方控制面轮询，网页专用 proof 目录仍为空。
本地 stdio 发现通过、Tunnel 资源创建成功或插件表单提交均不算端到端成功。

| 验收项 | 结果 |
|---|---|
| 实际 Platform Tunnel、组织与 ChatGPT 工作区关联 | 已创建并在网页列表观察到 |
| ChatGPT 自定义 MCP 的 Tunnel 与无需身份验证选项 | 已实际配置并提交一次 |
| ChatGPT 插件创建、安装 | 未完成；网页返回上述报错 |
| 受限 MCP 编译与三工具发现 | 本地通过 |
| 官方 doctor | FAIL，退出 2，缺少 runtime key |
| 官方控制面认证与轮询 | NOT_TESTED |
| ChatGPT 网页发出写、读工具调用 | NOT_TESTED |
| 网页动作后的独立磁盘核对 | NOT_TESTED；没有生成 proof 文件 |

## 本轮增量

- `cmd/opendesk-mcp/main.go`：增加互斥的 `--web-file-test-dir` 启动模式，先于 native Runtime 初始化。
- `pkg/mcpserver/server.go`：接入同一 stdio MCP 的受限注册、调用策略。
- `pkg/mcpserver/web_file.go`：三个工具及目录/文件身份、独占创建、同实例读取边界。
- `pkg/mcpserver/web_file_test.go`：私有 adapter 的边界、替换与并发回归；不替代公共 Runtime JavaScript 测试。
- `docs/quality/go-test-file-classification.md`：在唯一增量登记章节追加测试归属。
- `docs/integrations/mcp/README.md`：记录模式契约和独立验真要求。

该模式不注册 desktop、Browser、Recorder 或通用文件/执行工具。
host 只能选择仓库 `.runtime/tests/mcp-chatgpt-web/` 下的现有专用 run 目录；
远端只能传入 32 个小写十六进制字符的 nonce，固定创建 `web-proof.txt`，
内容为 nonce 加换行，33 字节，0600 权限，拒绝覆盖。
目录祖先及打开句柄身份持续核对，拒绝符号链接与替换；
读工具仅读取本实例已成功创建并持有的文件，拒绝异常内容或跨实例读取。
普通 full/read-only 模式没有新增文件工具，也没有扩大远程桌面写权限。

## 官方身份验证的两层含义

用户选择的“无需身份验证”已用于 **ChatGPT → MCP 服务**；stdio 服务不需要 OAuth。
这不取消 **本机官方 tunnel-client → OpenAI 控制面** 的认证。
当前官方说明要求 runtime key，客户端也支持事先配置的 AWS workload identity；
AWS identity 同样是身份认证，不是匿名连接。本轮没有配置 AWS identity。

官方资料：

- [Secure MCP Tunnels](https://developers.openai.com/api/docs/guides/secure-mcp-tunnels)
- [Custom MCP server](https://developers.openai.com/api/docs/guides/custom-mcp-server)
- [官方客户端 onboarding](https://github.com/openai/tunnel-client/blob/master/docs/onboarding.md)

没有提取现有凭证、创建或保存新 key、切换账号、购买额度或绕过官方限制。
准备的 profile 使用 `env:CONTROL_PLANE_API_KEY` 引用；MCP 子命令以 `env -i` 启动，
不继承客户端密钥。一次性启动器要求本机 TTY 隐藏输入，禁止 getpass 回显降级，
不保存 key，仅保存经脱敏的客户端日志。新凭证需由用户在官方页面创建并在本机隐藏输入。

## 本地证据与命令

运行证据根目录：`.runtime/tests/mcp-chatgpt-web/20261025-web-file/`。
独立测试目录：`.runtime/tests/mcp-chatgpt-web/adapter-development/`，与网页 proof 目录分开。

- `platform-tunnel-created.jpg`：实际 Tunnel 列表的裁剪截图。
- `plugin-noauth-error.jpg`：本次表单的实际 Tunnel、无需身份验证和错误提示截图。
- `profiles/opendesk-web-file.yaml`：官方 `init` 生成的 profile，无密钥正文。
- `online-artifacts.json`：本次程序、profile、官方客户端、启动器与源码 SHA-256。
- `built-discovery.json`：实际编译程序的 initialize、三工具列表、状态、禁止桌面调用及读前拒绝。
- `no-key-doctor.log`：官方 doctor 退出 2 的原始非敏感诊断。
- `launcher-input-regression.json`：模拟终端回显控制失败，确认未进入原始输入或启动客户端。
- `check-launcher.py`：重现隐藏输入故障与三个取消窗口的启动器回归；不使用真实 key 或客户端。
- `verification-commands.json`：精确检查命令、退出码、执行来源与日志位置。
- `checkpoint.json`：恢复所需的资源 ID 和明确的未验证状态。

已执行的 Go 检查使用本机 Go 1.25.13，`GOARCH=arm64 CGO_ENABLED=1`：

```text
go test ./pkg/mcpserver ./cmd/opendesk-mcp -count=1
go vet ./pkg/mcpserver ./cmd/opendesk-mcp
go test -race ./pkg/mcpserver -run '^TestWebFile' -count=1 -v
```

独立审查发现的三项问题已定向修复：隐藏输入禁止回显降级；受限模式在 envelope 解码前拒绝
重复字段；写入在 Sync 后通过原持有 FD 回读内容，再授权后续读取和返回成功。
最终修复后重新执行 `go test ./pkg/mcpserver -count=1`、`go vet ./pkg/mcpserver`、
`go test -race ./pkg/mcpserver -run TestWebFile -count=1 -v`，均退出 0；
日志为 adapter-development 下 `final-test.log`、`final-vet.log`、`final-race.log`。
原生依赖仍有既存编译/链接警告。可选 host-root Go 测试未设置环境而跳过，
最终实际 binary 的发现检查则打开本轮真实 proof 目录并确认仍为空；没有以此声称写读通过。
启动器另验证了阶段入口、starting 状态写入和 Popen 期间的取消，
确认不启动下一阶段；若子进程恰已创建，只停止并回收本次拥有的进程。
最终程序已重新构建，实际三工具发现、调用拒绝和三项 CLI 互斥检查通过，MCP 退出 0。

新增测试已登记。`node scripts/audit_test_architecture.js` 仍退出 1：
当前 360 个 Go 测试文件，历史台账期望 300；保留既有 62 项历史错误，
本轮新增测试没有成为未登记项。没有为本次任务扩展修复历史台账。
R1 的 `dist/opendesk-mcp` 与官方客户端均未覆盖；本次程序单独放入证据目录。
既有 Browser 并行源码及测试修改未纳入本次交付。

## 继续验收的必要条件

1. 在关联组织提供具备 Tunnels Read + Use 的 runtime key，通过本机隐藏输入启动官方客户端；不把 key 发到聊天。
2. 确认真实控制面轮询与同一 MCP child 健康，再重试当前插件创建并核对三工具列表。
3. 从用户授权的 ChatGPT 测试对话发送含新随机 nonce 的自然语言要求，明确只写一次，再读一次。
4. 保留网页实际工具调用/返回及可见结果，宿主独立核对文件的 nonce、33 字节、0600 与 SHA-256。
5. 停止本次所属客户端，保留 proof 与最小证据；失败或动作状态未知时不重放。

本轮没有完成上述在线步骤，不沿用 R1 的 95.4 分作为在线验收评分。

## 独立复核与评分

独立 code-reviewer 与实现者分离。初次提出三项修复要求，随后发现并复现启动器阶段切换的
取消竞态；均已修复并加入定向回归。最终复核没有新增可操作问题，
独立重放隐藏输入、三个取消窗口及清理升级路径，确认当前源码和产物哈希一致。

| 本地准备维度 | 百分制 | 低于 95 的原因与后续措施 |
|---|---:|---|
| 安全边界 | 94 | 在线身份/RBAC 与真实客户端停止尚未验收；提供 runtime key 后验证实际轮询及所属进程停止。 |
| 正确性 | 94 | 当前证明限于本地 adapter；需从网页实际写读并独立核对磁盘。 |
| 协议兼容 | 92 | 未由 ChatGPT 通过正式 Tunnel 完成发现和调用；完成连接后保留真实请求/响应。 |
| 测试充分性 | 92 | 隐藏输入和停止路径目前为受控故障测试；需补充官方客户端真实生命周期和网页闭环。 |

算术平均：`(94 + 94 + 92 + 92) / 4 = 93/100`。该分数只评价本地准备，
尚未达到 95 的质量目标；实际网页结果为 `NOT_TESTED`，不计为通过。
审查工具未提供 LSP/AST-grep，已使用 Go test/vet/race 和实际编译程序检查，不能把工具缺失混报为测试通过。
