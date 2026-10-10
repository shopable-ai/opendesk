# R16 Go Codex Provider：实施与验证记录

日期：2026-10-10。源码分支：`master`。实施基线：`a02fe4810393b334526e1692b9d1d872b0956888`。候选提交由跨仓负责人串行记录；本页不把基线 SHA 当作本轮完成提交。

## 已实现与验收边界

`internal/browserai` 已运行真实 `codex app-server --listen stdio://`。不是 `codex exec` 包装，也没有把 MCP Server 当模型接口。已有受信任 Go Native Host 接收独立 `opendesk.workflow-ai.v1` 消息；原 Browser 十个 RPC、Controller、RunHost、Authority 和结果存储保持原 owner。

本轮已审计并实测的 CLI 为 **`codex-cli 0.159.2`**。版本 allowlist、实际生成的协议 Schema、初始化握手、授权类型、有效配置和线程策略均须通过。其他版本返回 `E_CODEX_UNSUPPORTED`，没有跳过核验开关。后续扩大版本表必须补相应官方源码与真实二进制证据，不能只因字段名字仍存在就推断隔离语义不变。

| 项目 | 本轮证据与状态 |
| --- | --- |
| 真实 CLI 发现、版本、App Server 初始化、当前官方登录类型 | PASS；Linux 当前执行账号下实际 `chatgpt`，未执行登录、未读取凭据文件正文 |
| 同一线程连续规划、真实流式事件 | PASS；纯合成 JSON 数字 `17 → 21`，两轮分别 8 个关联事件 |
| 实际活动推理停止 | PASS；先看到模型 delta，再调用 `turn/interrupt`，最终收到该 turn 的 `interrupted` 回执 |
| 真实模型生成 Workflow JSON | PASS；通过 Browser `workflowCodexInput` 生成纯合成输入，返回 232 字节、一个 `observe` 步骤，51 个关联事件；Browser 编译验证单独计证据 |
| 默认个人 MCP 配置隔离 | PASS（限定观察窗）；真实 App Server + 无凭据合成 `CODEX_HOME`，已有 MCP canary 在进程活动的 1 秒启动观察窗内未启动 |
| 关闭后的持久线程恢复 | 当前 CLI 不支持安全恢复，`resumeSupported:false`、`close.resumable:false`；真实旧尝试拒绝于 `E_CODEX_POLICY`，现已在恢复调用之前明确拒绝。恢复子测试 SKIP / NOT_TESTED，不计成功 |
| 包内并发、协议、授权与预算负例 | 定向 `go test -race`，见下方命令与日志 |
| Go 静态检查与 Darwin 编译 | `go vet` 三个相关包通过；browserai、browserbridge 的 darwin/arm64 无 cgo 测试二进制交叉编译通过；未运行这些 Mach-O，不计 macOS 真机通过 |
| 测试目录架构审计 | FAIL（既有登记缺口）：24 个未登记测试全部已在实施基线中；本轮 3 个新增测试均已登记，未扩改无关测试 |
| 实际 macOS App 构建、Native 安装、Chrome Sidebar → 观察 → RunHost → 保存 → AI 关闭后重复执行 | NOT_TESTED；必须在用户本机相同候选上补验 |
| 原 Go Socket 完整桥接回归 | 本容器无法创建 Unix Socket，既有 6 个 case 在实施前即 `socket: operation not permitted`；无 Socket 的 Native 合同测试单独通过，不能代替完整互通 |

真实推理使用当前容器已有官方 CLI 授权和在线模型，仅提交明确的合成数字、合成工作流需求。此证据不是用户 macOS 登录、额度或浏览器权限证明。`READY_FOR_TURN` 始终表示登录与受限线程协议就绪；只有某次非空最终消息和成功终态同时到达，该 turn 才设 `inferenceVerified:true`。不会以 `model/list`、登录检查或取消 ACK 冒充模型成功。

## 文件归属

| 文件 | 职责 |
| --- | --- |
| `internal/browserai/protocol.go` | 独立 Native 子协议、严格请求、固定错误、数据/目标/回执大小边界 |
| `internal/browserai/process.go` | CLI 发现、已审核版本与实际 Schema、固定启动配置、stdout JSONL adapter、内部 RPC 白名单、错误脱敏 |
| `internal/browserai/process_unix.go` / `process_other.go` | 受控子进程及 Unix 进程组退出，不依赖浏览器进程管理 |
| `internal/browserai/manager.go` | owner/session/thread/turn、连续规划、事件游标、逐次观察审批、取消、已知线程恢复门禁和生命周期预算 |
| `internal/browserbridge/host_ai_unix.go` / `host_unix.go` | 原已认证 Native Host 的 AI 路由；hello 发布 `workflowAiVersion:1`；普通请求与清理控制分别有界 |
| `internal/browsercli/command.go` | `opendesk browser ai doctor` 的真实状态诊断 |
| 三个新增 `*_test.go` | Go 私有 Native seam、真实 stdio fixture、并发/授权负例及明确 opt-in 的实际 CLI 测试；不代替 JS Runtime API 或真实 Chrome |

## 当前线协议

外层请求固定为 `{v:1,kind:"ai.request",protocol:"opendesk.workflow-ai.v1",requestId,ownerId,registrationId,generation,sessionId?,method,params}`；响应保持同一关联字段，`kind:"ai.response"`，仅含 `result` 或固定 `error`。Browser SW 从已注册 Host 和当前 Native 连接生成 owner/registration/generation；不接受网页自行声明的身份。

| 方法 | 参数与主要结果 |
| --- | --- |
| `ai.capabilities.read` | `{}` → `sourceKey:"local_codex"`、状态、CLI 版本、授权类型、`readyForTurn`、`inferenceVerified:false`、`resumeSupported`、`onlineInference:true` |
| `ai.session.open` | `{consent:{model:true,workflow:true,observation:boolean},model?,resumeSessionId?}` → session/thread、`READY_FOR_TURN`、cursor。恢复只能指向同一 owner 已关闭且确实可恢复的会话，不接受任意 CLI thread/history/path |
| `ai.plan.start` | `{input,outputSchema?,consent,target?}` → 精确 session/thread/turn。每轮重新检查同意；观察不能从初始未授权范围自行扩大 |
| `ai.events.read` | `{cursor,limit?}` → 顺序事件、cursor、hasMore、状态。缺口报错，禁止静默跳过或自动重发 |
| `ai.approval.answer` | `{approvalId,decision:"approve"\|"deny",result?}`；只有当前待审批只读观察可批准，结果必须符合固定回执与精确 origin |
| `ai.plan.cancel` | `{}`；首先 `CANCELLING`，只有真实 interrupted terminal 才为 `CANCELLED`。RPC 错误或超时关闭自有进程并报告不确定性 |
| `ai.session.close` | `{}`；有 sessionId 关闭该会话并按实际协议报告 resumable；无 sessionId 撤销整个精确 owner，连正在打开的会话也不能迟到落地 |

事件类型：`session.ready`、`turn.started`、`message.delta`、`message.completed`、`plan.updated`、`tool.request`、`approval.required`、`provider.retry`、`turn.completed`、`session.closed`。每条事件带 sequence/session/thread/turn；`provider.retry` 只表示官方服务还将重试，必须继续等真实终态。未知特权工具的 `approval.required` 固定 `canApprove:false`；唯一可批准观察为 `tool.request` 且 `canApprove:true`。

`target` 固定六元组 `windowId/tabId/frameId/documentId/url/origin`，首版仅 `frameId:0`。它只留在 Go 及 Browser 授权链，不进入模型 input 或 tool result。模型工具为 `opendesk_browser_observe`，参数只能是空对象，不能让模型选择任意 URL、tab、selector 或 script。

批准后回传的观察必须是：

```json
{
  "format": "opendesk.workflow-observation.v1",
  "runId": "run-id",
  "resultId": "result-id",
  "sourceHash": "64位小写十六进制SHA256",
  "summary": {
    "kind": "semantic-dom-summary",
    "origin": "https://example.test",
    "nodes": [],
    "truncated": false
  }
}
```

Go 核对固定 schema、hash 形状、节点对象数组不超过 24 项及 origin；真实源哈希、精确文档、网站权限、用户本次批准和持久回执由原 Browser Authority/Controller 验证。这里只转发它的有界结果，不自行执行浏览器操作。App Server server-request ID 和 callId 均按 turn 去重，重复请求不能生成新观察授权。

原 Native 60KiB 限制继续有效；input 32KiB、outputSchema 16KiB、单工具结果 12KiB、事件批次 44KiB / 24 条。完整编码后的单事件也受预算约束，避免特殊字符转义导致事件永远读不出。活动会话最多 4 个，单连接最多保留 32 个 session、512 个 mutation ledger；每轮最多 8 个观察、同时待批 1 个、默认审批 2 分钟、规划 5 分钟。清理与取消有独立有界控制准入，不能被普通挂起请求或已满 mutation ledger 挡住。

## 进程与隐私边界

隔离策略参考已审核的官方 0.159.2 `temporary_structured_request.rs`：线程及每一轮固定 `environments:[]`、空 runtime roots、空 selected capability roots，并禁用 shell/unified exec、desktop/browser 扩展入口、apps、plugins、hooks、skills、memories、web search 等。通过 `config/read` 在 Go 内枚举已有 MCP 名称，逐名设置 `enabled:false`；空表会 merge，不能假定它清除了原 MCP。

`readOnly` 本身不表示 HOME 不可读。本集成依靠**没有执行环境**、固定工具注册和启动配置，配合实际回包核验。启动前还仅 `Lstat` 当前 Codex home 中 `environments.toml` 的存在性：此配置可能在 initialize 前启动 stdio 命令或远端连接，因此存在或无法判定时拒绝启动，不读取内容、不改配置，也不复制凭据去另一个 home。

启动时固定官方 provider 与官方 ChatGPT base，清空用户 OpenAI base override；遥测出口、notify、个人模型/compact instruction 文件入口均在启动前覆盖为自有临时工作区的静态文件。持久历史写入策略为 `history.persistence:"none"`，禁止额外环境上下文。CLI 的原官方授权存储仍由 CLI 自己管理，OpenDesk 不读取 token/auth 正文、不复制授权到 Chrome、日志或服务器。

本机规划子进程还固定注入 `CODEX_INTERNAL_APP_SERVER_REMOTE_CONTROL_DISABLED=1`。已审核的官方 0.159.2 在工作线程启动前消费此标志，选用 `DisabledEphemeral`，不会因当前账号此前的 remote-control enrollment 自动启用远端控制传输。该设置只作用于自有子进程，不修改用户持久偏好；固定启动参数不含 `--remote-control`，内部 RPC 白名单也不包含 `remoteControl/enable`。

环境只继承必要账号/PATH/locale/temp 以及已有且合法的无凭据 HTTP(S)/SOCKS proxy、NO_PROXY；拒绝 userinfo、query、fragment、异常路径和控制字符。没有 API key、NODE_OPTIONS、预加载库或替代模型端点继承，也不把 proxy 值输出。这个修复源自真实直接联网超时：删除既有本机代理会让同一 CLI 在终端可用、在 Native Host 内不可达。

Native EOF/断线、owner 消失、超时和权限失败都会关闭自有进程；Unix 使用进程组，连版本/Schema 检查的 npm wrapper 子进程也有统一 Cancel 和有限 WaitDelay。对原用户 CLI 进程不作广泛清理。

**冷恢复限制：**0.159.2 公开 `thread/resume` 没有 environments 覆盖，且不会持久化原线程的空环境选择。恢复时会重建默认本机环境，启动上下文/技能/MCP 预热可能先于下一轮发生。因此当前版本不调用冷恢复，活跃同线程多轮仍可用。未来安全恢复必须同时满足已审版本、实际 Schema 与回包策略核验。

这些约束不提供针对同一 OS 用户主动替换 binary/config、或在配置核验与线程建立之间恶意添加配置的操作系统隔离；这一信任边界与官方模板一致。已经用户同意发送的历史消息可能保留在 CLI 的线程存储，关闭、撤销本次观察或 `history.persistence:none` 不等于抹除既有模型上下文。

## 可复验命令

在对应候选的 OpenDesk repo 根目录，先运行组件测试。默认 suite 不会触发实际模型消费：

```bash
go test -race ./internal/browserai ./internal/browsercli
go test -race ./internal/browserbridge -run 'TestWorkflowAI|TestFrameSplitUTF8AndByteLimit|TestBoundedLineAndRequestSchema'
node scripts/audit_test_architecture.js
```

在已安装并用 ChatGPT 登录官方 Codex 的本机，明确 opt-in 后执行；数字/取消测试会使用在线模型与实际账号额度：

```bash
OPENDESK_TEST_REAL_CODEX=1 go test ./internal/browserai -run '^TestInstalledCodex(Probe|AmbientMCPIsNotStarted)$' -v
OPENDESK_TEST_REAL_CODEX_TURNS=1 go test ./internal/browserai -run '^TestInstalledCodex(ContinuousSession|Cancellation)$' -v
```

合成 Browser 工作流测试需要本轮 Browser repo 的实际 prompt helper。以下命令仅创建公开合成输入，不读取网页内容：

```bash
node --input-type=module <<'NODE'
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
const browser=process.env.OPENDESK_BROWSER_REPO||'../opendesk-browser';
const {workflowCodexInput}=await import(pathToFileURL(path.resolve(browser,'src/ui/workflow/local-codex.js')));
const workflow={siteOrigin:'http://127.0.0.1:43111',title:'Synthetic observation',description:'Public synthetic protocol fixture only.',paramsSchema:{type:'object',additionalProperties:false,properties:{},required:[]},steps:[{stepId:'observe_page',op:'observe'}]};
const input=workflowCodexInput('Create a reusable workflow consisting of exactly one observe step for this synthetic origin. Do not request any tools. Keep an empty paramsSchema and do not add navigation or locators.',workflow);
fs.mkdirSync('.runtime/tests/browserai',{recursive:true});
fs.writeFileSync('.runtime/tests/browserai/workflow-input.json',JSON.stringify({input},null,2)+'\n',{mode:0o600});
NODE
OPENDESK_TEST_REAL_CODEX_WORKFLOW=1 go test ./internal/browserai -run '^TestInstalledCodexWorkflowProposal$' -v
```

输出是 `.runtime/tests/browserai/real-workflow-proposal.json`。还必须让 Browser 原 `normalizeAiProposal`、compiler、RunHost 和保存流程独立消费该结果，不能由本 Go test 自称已验证浏览器执行。

macOS 真机仍须按 [现有 Native 构建安装验收](native-mac-build-install-test-r5.zh-CN.md) 构建完整同候选 App，完成实际扩展配对后验证：

```bash
./scripts/build_macos_app.sh
./dist/OpenDesk.app/Contents/MacOS/opendesk browser ai doctor
opendesk browser doctor
opendesk browser ai doctor
go test -race ./internal/browserbridge ./internal/browsercli ./internal/browserai
```

本轮未在 macOS 执行以上构建/安装/运行命令，不用 Linux 编译或测试程序冒充完整 App。普通用户仍经现有安装、Native 配对及 Sidebar 设置入口使用，无需新 listener、手动 Node daemon 或复制 Codex key。

## 本轮证据目录与已发现失败

**最终源码：**远控启动偏好已额外固定关闭；完整复验见 [最终硬化证据](evidence/r16-20261010/remote-control-final/README.md)。最终生产集合 `1e96b15cfaaa304408c71edb52ea021e00334df77a75a180f43c638beb6bb22c`，browserai 47、browsercli 2、Native 定向 5 个 race case（含子测试）通过；真实 CLI 五项再次通过，冷恢复仍明确 SKIP。下列顶层日志属于收敛过程中此前候选，保留原始结果和身份。

实际运行使用 Linux amd64、Go 1.25.13（`.runtime/tools/go/bin/go`）、`/opt/codex/bin/codex` 0.159.2。运行时原始证据在 `.runtime/tests/browserai/`，不进入发行包；可复核的文字日志、合成输入/输出和冻结 manifest 已归档到 [本轮证据目录](evidence/r16-20261010/README.md)。交叉编译的测试二进制仅记录哈希，不提交到文档目录：

- `real-final-candidate.log`：包含版本 allowlist、启动前环境门禁、状态错误映射的最终源码候选；实际 Probe、17→21 同线程两轮、明确 cold-resume SKIP、活动流式中断、1 秒 MCP canary、合成 Workflow；20.542 秒。
- `real-final.log`：收敛过程的先前真实候选；26.038 秒，保留其与最终候选的区别。
- `real-mcp-canary-final.log`：保持真实子进程活动 1 秒后再次核对 ambient MCP canary；通过。
- `component-tests.jsonl`、`native-contract-tests.jsonl`：相应 Go race 定向测试。
- `test-architecture-audit.log`：架构审计的 24 个既有未登记条目；已与基线文件树及基线账本核对，不能把此 gate 报为通过。
- `go-vet.log`、`cross-browserai-darwin.log`、`cross-browserbridge-darwin.log`：检查/编译 stdout；实际 exit code 与 Mach-O SHA256 写入 manifest，空日志本身不作为成功证明。
- `workflow-input.json`、`real-workflow-proposal.json`：仅合成公开数据及真实模型输出。
- `r16-evidence.json`：源码与日志 SHA256、环境和分层结果；不是提交凭证。
- `real-continuous-proxy.log`、`real-continuous-resume-diagnostic.log`、`real-cancel-workflow.log` 保留排障期间真实失败。先前丢失代理造成推理不可达；恢复测试暴露默认 environment；首次 turn/start ACK 后立即 interrupt 返回错误，进程已关闭。后续只声称**实际流式开始后**观察到的 interrupted terminal，不把早期失败改写成通过，也不重放 turn。

正式验收仍缺同候选真实 macOS Chrome、Go Native 与旧 Node 实际互通、网站权限/文档失效/停止、保存后 AI 关闭重复执行证据。额度不足、模型不可用、网络故障已实现独立错误映射及合成负例，但未用真实用户账号强行耗尽额度来制造失败。各独立评分必须按这些证据边界填写，不能笼统宣布 95+。

## 官方依据

- [App Server 官方协议](https://learn.chatgpt.com/docs/app-server)
- [0.159.2 官方受限结构化请求实现](https://github.com/openai/codex/blob/rust-v0.159.2/codex-rs/tui/src/temporary_structured_request.rs)
- [同版本配置 merge 规则](https://github.com/openai/codex/blob/rust-v0.159.2/codex-rs/config/src/merge.rs)
- [同版本工具注册](https://github.com/openai/codex/blob/rust-v0.159.2/codex-rs/core/src/tools/spec_plan.rs)
- [同版本启动配置 owner](https://github.com/openai/codex/blob/rust-v0.159.2/codex-rs/core/src/config/mod.rs)
- [App Server 启动与 EnvironmentManager](https://github.com/openai/codex/blob/rust-v0.159.2/codex-rs/app-server/src/lib.rs)
- [Environment 注册与连接](https://github.com/openai/codex/blob/rust-v0.159.2/codex-rs/exec-server/src/environment.rs)

本机由实际 CLI 生成的 `ThreadStartParams`、`TurnStartParams`、`ThreadResumeParams` Schema 也属于本轮协议依据；最新网页文档中的实验性字段不能自动视为已安装 CLI 支持。
