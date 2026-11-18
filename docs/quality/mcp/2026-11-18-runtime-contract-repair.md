# MCP 公开 Runtime 方法契约修复与验收

日期：2026-11-18（北京时间）。基线：`master` / `975f7f111c6ffe6b18002c08574b762eb1aa06c1` 加原有和本轮未提交修改。未创建分支/worktree，未提交、推送或核对远端同步状态。

## 本轮目标与通过条件

修复上一阶段登记的 29 个 canonical 正文缺口，使 Agent 从现有能力目录进入完整、准确且可校验的契约，再选择普通 MCP execution 或具备必要条件的原入口调用。复用现有 reader 与 Runtime，不建立第二份方法数据库。

通过条件：29 项以默认阅读和 `withTypes: true` 均经真实 MCP 返回完整 packet，来源/依赖/完整读取账本可验证；可安全运行的方法使用正式 `tests/runtime-api/*.js`，文件和 HTTP 有宿主独立后置条件；输入校验、宿主授权、异步、取消、只读及受限模式回归保持通过；候选通过后原子安装本地 CLI，并从安装路径复验。条件性未实测项保留明确边界。

## 契约与实现变化

| canonical Reference | 本轮补齐 |
| --- | --- |
| `file.md` | `File.appendBytes`、`create`、`createIfNotExists`、`getExtension`、`getHumanReadableSize`、`getName`、`getNameWithoutExtension`、`getSimplifiedPath`、`remove`、`removeDir`、`rename`、`renameWithoutExtension` |
| `image-color.md` | `ImageColor.findBlueChannel`、`findGreenChannel`、`findRedChannel`、`toHSL`、`toHSLA`、`toRGB`、`toRGBA` |
| `page.md` | `page.ensureMacPermissions`、`page.waitForNavigation` |
| `system.md` | `System.getNetworkInterfaces`、`getPowerInfo` |
| `sound.md` | `playback.isPlaying`、`playback.startedAt` |
| `ui.md` | `FloatingWindow.id` |
| `http.md` | `axios.defaults`、`axios.request` |
| `webhook.md` | `handle.name` |

此表仅是本次修复快照；参数、返回、错误和调用条件只在对应 canonical Reference 维护。类型声明补充权限兼容选项、电源结果结构和相关属性注释；由正式 generator 更新能力目录。导航/抽取检查的 `sourceContractGaps` 由 29 降为 0，`contractReadiness` 为 `no-detected-gaps`；这不是全方法语义认证或现场通过结论。

按真实 owner 核对并修复以下问题：

- `ImageColor.toHSL/toHSLA` 曾把 16 位 `RGBA()` 通道直接传入按 8 位计算的函数。旧安装版真实 MCP 将红色算为 `hsl(0.000000,-100.784314%,12850.000000%)`。native owner 现在先取高 8 位，两处最小改动；正式 JS 检查原色、黑白、灰色、无前缀大小写和非法输入。
- 阅读包校验曾按 JSON 字符串比较范围对象，Go transport 重排键后误报 `PACKET_SOURCE_OR_PLAN_CHANGED`。现在对完整 report 作结构和值比较：对象键顺序可变，数组顺序、来源哈希、范围、依赖及其他计划值不能被篡改。回归也验证读取账本篡改被拒绝。
- `tm_runtime_capabilities` 增加 Custom UI / Native Extension 的 `conditionalCapabilities`：`enabled` 仅表示授权，`checked:false`、必要条件与后续诊断明确可见，不伪造 `available`。此工具不启动 host 或执行插件。
- 真实 gate 推翻了“未授权普通 execution 也可构造 FloatingWindow”的假设。契约已纠正为必须先获得 Custom UI 授权；构造/读取 id 无需显示 host，但不能据此声称 UI 可用。

File 合同明确现有截断、创建竞态、非独占 rename、同步取消边界和递归删除语义，没有改变其 owner 或扩大文件权限。`page.waitForNavigation` 按真实实现明确只轮询 executable 字段，不能被用作浏览器导航 readiness；本轮不发明 URL 观察后端。`ensureMacPermissions` 按兼容 alias 路由到 canonical guard，关闭设置导航不能阻止系统权限请求。

## 实际验证范围

正式入口均从仓库根目录执行。新 gate：

```bash
OPENDESK_MCP_BINARY="$HOME/.local/bin/opendesk-mcp" node --test tests/mcp/runtime-contracts.test.js
```

既有权限、结果和取消回归：

```bash
OPENDESK_MCP_BINARY="$HOME/.local/bin/opendesk-mcp" node --test tests/mcp/advanced-runtime.test.js
```

| 验证 | 证明范围 |
| --- | --- |
| 29 项 × 默认/带类型阅读，58 个 MCP packet | canonical H2、完整正文/依赖、哈希、字节数和完整账本均可校验；不执行示例 |
| `mcp-file.js` | 12 方法正常/适用错误边界，3 种字节输入、创建/截断/保留、重命名、路径纯计算、单项/递归删除；最终 symlink 删除不破坏 referent。仅操作 gate 的 `.runtime` fixture，宿主独立对账文件内容/状态 |
| `mcp-image-color.js` | 7 方法的转换、列优先扫描、通道阈值、灰色、Alpha、区域和错误输入，内嵌确定性 PNG，源自真实 Runtime |
| `mcp-system.js` | 两项 native 只读查询和结构，不打印或保存真实网卡标识、计数、电源原文，不证明网络可达或电池业务状态 |
| `mcp-http-webhook.js` | axios 两项的请求/defaults 合并、header 优先级、503/自定义校验/非法响应类型；独立随机 IPv4 loopback fixture 记录 7 次真实请求。Webhook 显式授权后验证 name 规范化、冲突、关闭及重用，不发送 delivery |
| `mcp-floating-id.js` | 已授权 execution 内构造、显式/自动 id、非法/重复 id；没有 `show` 或其他 native 窗口操作 |
| `mcp-page-wait.js` | 原生 URL 不变时 timeout rejection，null options 同步 TypeError；不打开页面、不替换 native owner |
| `mcp-resource-boundaries.js` | 未授权时 registry/构造器缺席；授权后只读 UI capability 和 Native Extension discovery。无 host handshake、窗口、权限提示或插件调用 |
| `advanced-runtime.test.js` | 原有只读/权限、JSON/null、SQLite、异常、CPU deadline/取消、执行槽重用、64 次上限、摘要写盘错误、输出限额、stdout JSON-RPC 和 EOF 退出 |

所有 Runtime 场景都分别断言受理与最终终态，并核对落盘 summary、execution ID 和正式 JS 完成标记。没有通过 mock、静态类型或 Goja 包装替代这些公开 Runtime 测试。

## 构建、安装及结果

候选构建命令：

```bash
GOARCH=arm64 CGO_ENABLED=1 /Users/shopme/.local/opt/go1.25.13-amd64/bin/go build -o .runtime/tests/mcp-contracts/20261118/bin/opendesk-mcp ./cmd/opendesk-mcp
```

候选通过 10 个新子场景（Node 计数 11 tests，含父用例），既有回归 17 个子场景（Node 计数 18 tests），均无跳过。2026-11-18 北京时间 16:15:01 已原子更新 `dist/opendesk-mcp` 与 `/Users/shopme/.local/bin/opendesk-mcp`，SHA-256 均为：

```text
abdedc20e7cfd865f6e42eb80e8779d743e37b55769b69261aafc983269b309b
```

安装只涉及 MCP CLI；PATH 可解析安装路径。旧版本备份、source hashes 和安装回执保存在 `.runtime/tests/mcp-contracts/20261118/install-receipt.json`。文档读取仍依赖宿主显式绑定的可信 checkout 与 Node；CLI 文件安装不更新现有进程、GUI、UI helper、Native 插件、Host/Tunnel profile 或 Native 配对。

安装路径的两条原样命令复验通过：新 gate **11/11 tests**、既有 gate **18/18 tests**，全部无跳过。相关 Go 三包、MCP/CLI vet 已通过，仅有现有 native 编译警告。文档测试 **42/42**、宿主安全回归 **8/8** 通过。全仓测试架构审计仍有同样 68 项既有错误，新增为 0；不能报告全仓检查通过。TypeScript 5.9.3 以 Runtime 的 ES2022（不含浏览器 DOM）声明集检查：HEAD 基线与当前均为 12 条相同诊断，新增为 0，完整类型检查仍未通过，未扩大修复无关类型；证据为 `types-comparison.json`。

最终安装新 gate 证据：`.runtime/tests/mcp-contracts/1794989723571-H4cDIS/`；既有 gate 证据：`.runtime/tests/mcp-advanced/1794989723571-92635-w0dk90/`。每组均含实际协议、summary、fixture 或 provenance。聚合日志、安装回执、审计比较和失败前证据位于 `.runtime/tests/mcp-contracts/20261118/`。

候选新 gate 证据：`.runtime/tests/mcp-contracts/1794989665499-5GX6ly/`。候选既有 gate 证据：`.runtime/tests/mcp-advanced/1794989276685-65868-Qyh9yx/`。旧 HSL 故障、阅读包误拒绝和未授权 FloatingWindow 假设的失败记录均保留，不能把它们列为通过。

## 明确未实测和停止边界

29 项 canonical 正文缺口已补齐，无本轮待补的方法正文。以下调用条件仍未现场验收：

- `page.ensureMacPermissions`：可能请求权限、AppleEvents 或打开设置，未执行。不能将 `openSettingsOnFail:false` 当成无副作用的权限预检。
- `playback.isPlaying/startedAt`：合同已按 native 状态和句柄 owner 补全，未创建真实播放对象、未录音/播放；startedAt 是创建时刻，不能当作首个音频样本被听见的时间。
- `page.waitForNavigation` 仅实测超时/参数边界，未证明真实网页导航成功。
- Custom UI 未做 host 握手、真实窗口、交互或视觉验收；安装位置的 inert 诊断观测为 UI 授权可开启而 host 不可用。候选位置的 Native Extension registry 为空；发现诊断不证明插件执行能力。
- 未进行外部模型/provider、真实桌面输入、云端 Tunnel 新工具、Linux/Windows live 或新增跨编译、全项目测试、内存压力验收。

未改模型/provider/认证/路由、远程 Tunnel 或现有服务；没有为填补未实测标签启动 VM、Docker、模拟器、重置 TCC 或读取凭证。现有并行改动继续保留，运行产物均留在 `.runtime/`，不提交。
