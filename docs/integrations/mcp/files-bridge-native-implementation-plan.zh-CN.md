# Files Bridge Native 接线实施计划

> 执行方式：当前对话原生执行，独立切片使用原生子 agent；以定向反例、真实部署和 ChatGPT 核心闭环验收。用户 2026-11-03 已明确要求专家判断处理并授予 Native 接线权限，不再等待原 owner。

**Goal:** 在原 Host 同一个 nativeFiles 上完成正式四工具的认证文件通道、可信精确授权、部署和官方 ChatGPT 文件闭环。

**Architecture:** 保留一般 Browser RPC allowlist。可信本机 CLI 管理专用 grant/lease/revoke，MCP 仅持有短期 purpose-bound capability；Host 为专用认证分支分发四种文件方法，并在同一文件服务锁、workspace durable fence 和 nativeFiles 执行器内校验和执行。Tunnel 只启动该四工具 CLI 模式，审计不保存正文/凭据。

**Tech Stack:** 现有 Go 1.25.13、Unix Socket、Python Tunnel launcher、官方 Secure MCP Tunnel/client 与官方 ChatGPT。

**Spec:** files-bridge-native-contract.zh-CN.md，以及本对话最初八步真实核心验收要求。

## Global Constraints

- 现有 master，不创建分支/worktree/PR；保留并行改动，不强杀共享服务。
- 最多32个精确已有UTF-8文件；read/read-write；TTL <=1800秒；独立正文输出同意。
- capability绑定原Host owner/session、workspace、CLI lease；文件0600、目录0700；权限ABA、撤权、lease退出和过期使旧能力失效。
- 32KiB正文、60KiB完整帧；模型不能声明身份或制造grant；UNKNOWN不重放、不换新ID重试。
- 重用原nativeFiles链接、owner/device/ACL、SHA、durable fence和requestId保护，无新文件执行器。
- 仅四工具；无创建/删除/桌面/Shell/Controller/Web Flow；无网页监听替代MCP。
- 先定向验证再编译受影响程序；部署保留恢复产物，证明实际PID/程序SHA加载后才进行网页实测。

## Review Focus

- 在receipt返回前撤权/权限ABA检查不可跳过；已确认写入与后续验证失败阶段不可改写。
- 同ID不同参数冲突；相同ID旧请求不产生新写入，旧receipt不代表当前磁盘。
- 模型字段/普通Browser凭据不可作为MCP capability；CLI control与file client区分用途。
- lease连接关闭/Host重启/期限结束后，status和receipt查询也必须拒绝。
- 列表不能泄露未授权同级文件；私有凭据的symlink/硬链接/模式/owner/TOCTOU校验。

## Task 1: Native 专用认证和可信管理入口

Files: 新建 internal/browserbridge/files_mcp*.go 和同包测试；最小修改 host_unix.go、files_service_unix.go；新建 internal/browsercli/files_mcp*.go，command.go仅添加分发。

Interfaces: `NewFilesMCPClient(credentialFile string) (*FilesMCPClient,error)`；`Call(context.Context,string,json.RawMessage)(json.RawMessage,error)`；`Close() error`。安全运输错误使用已有 `CallError{Code,Outcome}`。四工具结果遵循现有 MCP envelope/stages。

- [x] 先写/执行缺失接口反例；覆盖真实Unix IPC与真实临时文件的grant/read/SHA-write/readback、scope/read-only/stale/duplicate/conflict、revoke/expiry/lease/ABA/status receipt、凭据purpose及私有性、UNKNOWN不自动重试。
- [x] 实现专用认证、可信CLI grant(保持lease)/revoke、单一nativeFiles执行与锁内权限检查，不扩大普通RPC。
- [x] 定向 Native/CLI 测试及 vet/race；新增Go测试已登记到现有质量账本的唯一增量章节。独立安全复审 APPROVE。

## Task 2: MCP CLI adapter

Files: cmd/opendesk-mcp/main.go、main_test.go；需要时 pkg/mcpserver/files_bridge.go及测试。

- [x] 用不存在/错误私有引用反例验证入口失败关闭和无秘密输出，包含最终已编译程序直接检查。
- [ ] 准备有真实Native后的stdio四工具证据。
- [x] 创建Native客户端并接入NewFilesBridgeServer，映射安全Code/Outcome并关闭client；保持其他模式隔离。
- [x] 定向文件Bridge、CLI测试/vet/ARM64编译，记录源码与程序SHA。

## Task 3: 原Tunnel文件模式和最小安全审计

Files: tests/mcp/tools/secure-tunnel/prepare-run.py、start-online.py、stdio-audit.py及现有check-*。

- [x] 先反例验证显式files模式、候选/credential引用固定、60KiB界限、日志无正文/秘密及UNKNOWN无重试；旧nonce模式不变。
- [x] 实现files模式在本轮core run内准备、pin候选与官方client、使用既有Tunnel/key，不记录credential正文。故障注入并发隔离已修复，最终21项定向反例及独立复核通过。
- [x] 基础files模式29项、原prepare/relay/launcher回归通过；正式mode未接通前不启动nonce冒充正式链路。

## Task 4: 编译、受控部署与真实业务

- [x] 盘点当前writer/服务；使用既有Native instance隔离能力和独立测试Profile，避免覆盖其他owner运行链。复用稳定签名和真实setup入口，不发明配置/协议。
- [x] 编译Native与MCP并沿稳定签名入口部署Native、通过现有setup精确注册独占Profile，记录路径/SHA/签名。
- [ ] 验证Native实际Chrome加载PID/父链及Tunnel实际子进程；本轮已取得并释放UI锁，但CUA准确bundle路径仍选到其他Profile，BLOCKED_WINDOW_BINDING，无点击/输入，Native尚未启用。
- [ ] 可信CLI授权仅fixture/roundtrip.txt读写、readonly.txt只读，unapproved.txt保持不批准，显式同意合成正文输出。
- [ ] 取得profile/UI锁并验证登录及窗口归属；官方ChatGPT四工具发现、未知marker读取、SHA前提单次写入、读回、Mac独立SHA/字节对账。
- [ ] 负例、重复ID/冲突、可信撤权后read/write/status receipt拒绝。
- [ ] 通过仅本机显式开启的 relay 故障注入，原样转发指定写请求一次，在收到其真实回包后丢弃该回包并结束该子进程；一次性标记防止再次注入。官方网页遇未知后仅查询原requestId/read，不生成新ID或重放写入。该开关默认关闭，不增加Runtime能力或文件执行器。
- [ ] 更新逐项证据与M1-M4状态。仅完整目标有证据达成后标goal complete。

完整CI、跨平台/压力/变异矩阵和重新评分仍延期。本文档为执行计划，不是grant或运行成功证据。

最新登录准备：在独占无界面Profile按专用Skill导入用户既有Cookie一次后仍为验证页，NOT_VERIFIED；没有绕过验证或重复导入。自己的可见/无界面浏览器均已正常停止，自己的UI锁已释放，Profile保留以便续接。

第三轮现场复核：独占可见实例PID 82614与目录匹配，CUA仍选择其他Profile；自己页面明确显示“登录会话已过期”，Native开关仍关闭。已正常关闭自己的进程并释放锁。连续三轮相同阻塞审计通过，真实验收须等待精确窗口控制入口及有效测试登录态；实现、部署和现有requestId/fixture保留，不重新生成或自动写入。
