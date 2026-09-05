# GOAL 05（按需执行）：文件元数据、临时目录和 HTTP 文件传输

这是前文提及但 File JSON GOAL 未覆盖的数据输入输出增强。它不是 path/command 的完成前置，也不默认一次实现所有文件 API。

## 执行边界（本卡必须遵守）

仓库：`shopable-ai/opendesk`。这是补充 GOAL，不替换、不重跑正在执行的 `opendesk-file-json-goal.md`。

- 用户已明确 `docs/command` 对应命令行功能完成：以本地该文档、源码和当前证据为准，只复用和回归，不重新规划或实现同一能力。若本地提供了等价 JS 能力，直接使用，不为满足本卡建议名称另造 owner。远端未找到不等于本地缺失。
- File JSON、统一 WorkDir、文件异步 owner、原子写入由前一 GOAL 负责。它们完成后只消费其接口，不复制后端、不改写既定语义。前一任务仍在写同一工作区时，本卡只能只读核对，不能并行修改共享文件。
- 先读本地 `AGENTS.md`、`docs/command` 的实际入口、相关 `docs/api/`、`docs/implementation/runtime/runtime-api-development-workflow.md`，搜索所有已存在的等价能力。记录 HEAD、dirty 状态和基线失败；不得 reset/checkout 覆盖用户修改。
- 本卡新增接口是设计目标，不是已实现事实。已有能力满足目标则记录“复用/已验证”，不重复实现；缺少必要输入或证据则记录具体 Blocked/Not Evaluated，继续可独立完成的部分。
- 普通脚本由 Runtime 自动注入后直接使用；不要求 import、require、new、npm install 或 Node 解释器。开发期已有 Node 工具可以保留，不能当产品脚本运行器。
- Route A：Agent-to-Recipe，普通 JavaScript、现有正常执行入口、真实后置条件验证。不得创建 Recorder / IR / Compiler / 专用 Replay 主链，也不把本卡扩成新的 Workflow Engine。
- 文件清单是建议落点。先查同职责代码再复用；“新增候选”不是已存在文件。公共文档、类型、机器索引、manifest、JS 测试、Go 必要测试、公开示例一起同步。公共能力不能只由 Go 单测证明。
- 默认不新增 CLI 子命令/flag，不重新实现 `docs/command`。必要的内部接线只做向后兼容增量；若修改会破坏已完成命令契约，报告边界而不是擅自更换协议。
- 未获用户另行授权，不 commit、push 或创建 PR。原始证据只写 `.runtime/`；报告写实际命令、二进制来源/hash、运行结果和未验证项。

## 入口与子阶段

先核对实际业务是否需要以下能力，并将已存在方法标复用：File.stat、File.makeTempDir、File.writeAtomic、异步/分块文件读写、文件下载、multipart 上传、二进制响应。已存在的 http/axios/AbortController 不能再造一遍。

按子阶段顺序执行，每个子阶段独立验收：

A. `await File.stat(path)` 返回文档化类型/大小/时间，拒绝把无权限或 I/O 错误当不存在。`await File.makeTempDir(options?)` 创建当前 Execution 所属临时目录，保证名称唯一及权限合理，正常结束/可控取消只清理自己目录。不新增全局 TempManager，不扩展成任意文件清理器。

A2. 确有非 JSON 文件安全写入需求时，补 `await File.writeAtomic(path, textOrBytes, options)`，复用前一 GOAL 的原子提交后端与权限/取消语义；不能把内部原子写入已经完成误写成这个公开方法也已存在。大文件异步/分块读写只按真实需求添加，不更改旧同步 read/write 签名，不一次承诺完整 Node streams。

B. 同一现有 http 后端增加文件下载能力（无同名方法时建议 `http.download(url, destination, options)`），流式且有界，超时/取消/失败不破坏已有目标文件。复用已完成的安全提交机制，不能通过把整文件转 Base64/JSON 再交 File JSON 写入来伪装流式处理。

C. 按真实调用场景增加 multipart 文件上传和二进制响应；公开名字沿用本地 http/axios contract，不新增第三套网络客户端。重定向的跨源授权头、TLS、代理和远程调用文件读取权限跟随已有政策，不因上传接口放宽。

文件传输默认无自动重试；只有明确安全/幂等操作可按调用者策略重试。上传取消不意味着服务器未接收，不自动重复发送有副作用请求。进度回调节流、有界且仅在 owner EventLoop。

## 文件清单

| 类型 | 文件 | 修改 |
|---|---|---|
| 修改 | `automation/file.go`、前一 GOAL 建立的文件异步 owner | 只加 metadata/temp 操作，不改 read/writeJSON 和安全替换语义。 |
| 新增候选 | `automation/file_metadata.go`、对应测试 | 若拆分有必要；新操作继续共享 WorkDir 和 lifecycle。 |
| 修改 | `automation/http.go` | 复用客户端、取消和授权，增加流式传输。 |
| 新增候选 | `automation/http_transfer.go`、`automation/http_transfer_test.go` | 上传/下载后端，不另建 HTTP client。 |
| 条件修改 | `polyfills/004-axios.js` | 仅已承诺的 facade 接线，避免两套错误/传输语义。 |
| 修改 | `types/File.d.ts`、`types/http.d.ts`、必要的 `types/axios.d.ts`；对应 docs/api；manifest/index | 公开行为与类型同步。 |
| 新增候选 | `tests/runtime-api/unit/file-metadata.test.js`、`http-transfer.test.js`、`acceptance/http-transfer.js` | 使用本地受控 HTTP fixture，不依赖公网服务。 |

## 验收

大文件传输不整体缓存在内存；大小上限按流执行；取消、断网、磁盘失败、已有目标保护；上传输入权限；临时目录不能清理其他任务目录；不同 execution 的同名临时前缀不冲突。

不承诺 SIGKILL 后立即清理，不自动扫描任意目录。原子提交、WorkDir 和文件 worker 原语复用前一 GOAL，不在本卡复制。

## 共同验收与交付

先运行本卡最小确定性测试，再按本地现有入口运行 contract、相关 unit 和 smoke；公开示例必须另行通过本次构建的 `./dist/opendesk ai run <script.js>` 原样执行。不要假设单独 `go build` 就已经配齐发行资源，应使用当前仓库的实际构建/打包流程。

涉及共享注册与 Runtime owner 的变动，追加已完成 File JSON 的回归，但不得以此重做其实现。新 gate 复用现有 watchdog、run context、日志与 hash 机制。不得使旧测试的动态 `covers` 自动声称覆盖未执行的新方法。

评审：架构/兼容 20、公开契约/数据正确性 20、生命周期/可靠性 20、安全/隐私 15、易用与交付 10、真实测试和文档证据 15。>=95 且全部相关硬门槛通过才可声明本卡完成；不以主观评分代替证据，不把本卡评分推广成整个项目评分。

硬门槛：不覆盖用户工作；不重复已完成命令和 File JSON；不依赖 Node 执行普通 recipe；不伪造 capability/平台/测试状态；不吞错假成功；不遗留本卡拥有的可控资源；不跨执行串数据；正式入口证据成立。无法运行的测试标 Not Evaluated 或 Blocked，不算通过。

最终输出：本地差额判断、实际新增/修改文件、复用/跳过项及理由、调用示例、命令结果、证据路径、评分和风险。若已等价完成，可以零产品代码改动交付核对和现有证据，不制造无意义 diff。
