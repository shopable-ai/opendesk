# Mac96 能力优先的 CLI / 网页 MCP 验收（2026-11-18）

本轮把精确窗口的激活、原生正文读取和有界本地 OCR 接入默认 MCP。ChatGPT 网页已用普通业务目标完成
`17×23→391`，再保留实际结果计算 `+9→400`；用户没有提供 PID、坐标、base64 或内部路径。
本地参数化 JavaScript 的最终运行结果见下方验收矩阵。所有结果均区分真实运行、宿主模拟和未验证范围。

## 本轮实现

- `tm_window` 只接受新鲜窗口列表中的精确 `windowId`，提供 `activate`、`read`、`ocr`。
  不开放任意 JavaScript、Shell 或 Accessibility 引用/动作。原生语义可满足时不要求截图或 OCR。
- `activate` 复用 native owner，抬升一次并检查实际前台身份。`read` 把完整窗口身份传到 native owner，
  不在读取边界按标题重新选择窗口；保留保守的重名拒绝。
- macOS `window.getContent` / `window.content` 返回真正的普通正文；不再把标题当作正文成功返回。
  逐节点校验 PID 与 AXWindow/native handle，前后核对窗口身份和几何。受保护输入子树在读取名称、值或子节点前跳过；
  标准关闭、最小化、缩放和全屏窗口按钮也不属于正文。读取遇到不完整、身份变化或预算超限即整体失败。
- 原生读取最多深度 8、512 节点、64 KiB；单个 native reader、2 秒协作式截止时间，等待 native cleanup，
  不启动遗留超时 worker。底层 OS 调用可能影响实际墙钟耗时，不把该截止时间宣传成硬抢占。
- OCR 仅捕获已聚焦目标窗口内的矩形：最多 200 万逻辑像素、8 MiB PNG、3200 万实际像素，
  本地英文 OCR 超时 5 秒。只回传投影后的文本/框和实测 PNG 尺寸，不回传图像、base64 或 provider raw 数据。
  图像像素与屏幕坐标按实际尺寸换算，不假设固定 Retina 倍率；窗口身份/几何变化则丢弃结果。
- Calculator recipe 根据当前完整的窗口 snapshot 验证精确按钮和 Display；支持本机实际观察到的
  `乘/加/等于` 等精确语义别名，合并候选后要求唯一。Display 识别采用已观察到的 `StandardInputView`
  结构或既有确切名称，不能凭数值形状或 expected 选择读数。第二段表达式消费第一次实际读值。
  修复初始截图错误要求物理像素等于逻辑尺寸的问题；语义按钮定位不依赖截图倍率。
- AI CLI 优先映射结构化 `WindowError`，避免把后端不可用误报成权限不足。

## 验收矩阵

| 层面 | 当前证据与结果 |
|---|---|
| Go 定向检查 | `go test ./pkg/mcpserver ./internal/aicli -count=1` 通过，含精确 native 身份传递、陈旧目标、同进程兄弟窗口、边界和错误映射回归 |
| Runtime JS 真实读取 | `ai-20261118-154303-589000` 成功；同进程两个受控窗口各重复读取两次，正文互不串读、未暴露受保护值；不存在标题返回结构化 `NOT_FOUND`，共 3 项通过 |
| MCP 真实进程检查 | `2026-11-18T07-45-32-647Z-21897-y2O5mR` 通过：新鲜 schema、原生正文、一次激活、仅标题区局部 OCR、实测坐标映射、纯 JSON stdout 与 EOF 清理 |
| Recipe 宿主模拟 | 70/70 通过，覆盖唯一性、Display 结构、精确别名、权限/陈旧/未知输入停止；这些不替代桌面实测 |
| 本地 CLI / JS 两步实测 | `ai-20261118-155053-568000` 成功，耗时 162425 ms；14 次原生 invoke，Display 各两次稳定读到 `42`、`50`；实际生成第二段 `42+8`，两项 `verified:true` |
| ChatGPT 网页两步实测 | 网页模型 GPT-6.2 Sol / 轻度，实际逐键计算 `17×23→391`，随后 `+9→400`；中间回复明确读回 `391` 后继续 |
| 网页独立结果证据 | 网页完成后，native 正文另行读到 `391+9` 与 `400`；检查 460×816 的真实窗口 PNG，显示与按钮无裁切 |
| v3 网页原生读取 | 本地新参数流程结束后，另发“只读计算器当前显示值，用原生正文读取核对，不截图、不点击、不输入。”；网页实际读回 `50`，不再沿用先前 `400` |
| 文档检查 | agent 文档生成/检查成功，`API_DOC_CONTRACT_OK`；完整 canonical source 仍有既存缺口，不是全 API 语义认证 |

## 网页范围与停止记录

结果对话：<https://chatgpt.com/c/6afd5393-dfa8-83ee-989d-57b71c40e5da>。
网页刷新后的默认目录为 Write 24、Read 19，共 43 个工具，包括 `tm_window`、`tm_runtime_capabilities`
和既有 `tm_open_app`。本轮未启用并行任务开发的可选高级脚本/文档工具；此目录不证明其完成或通过。
Calculator 在本轮已经运行，网页调用了打开/聚焦入口并核对就绪；本轮不新增冷启动证明。

第一项网页任务读取了受控 Fixture 的普通正文，但未通过网页打开竞争窗口：自动审批拒绝整窗 OCR，原因是
它可能覆盖受保护输入区域。保留模型停止记录，未改变审批策略或重试该捕获。随后改用无受保护输入的 Calculator
完成网页两步验收。竞争窗口只在后续可信本地测试准备中通过已核验的原生按钮打开，不能记为网页成功。
最终 MCP 的 OCR 独立测试限定在 Fixture 顶部 80 个逻辑像素的标题区域，避开全部输入行。

首次 v3 MCP live 检查在 capture mapping 断言停止，FAIL 产物保留。随后保留白名单映射元数据并按字段比较，
新的独立运行通过；实际矩形为 720×80 逻辑像素，PNG 为 1440×160。没有据此修改生产端坐标公式，
也不把首次失败记录改成通过。

本地 recipe 首次在输入前发现截图倍率断言错误；修复后使用人为指定的 2 分钟外层超时运行，第一步实际读到
391，第二步部分输入后超时。该次状态为 `timed_out`，独立只读检查见实际显示 `39`；未继续补按或重放前缀。
最终验证采用新的输入和独立 execution，不能描述成恢复了该超时 execution。
最终输入为 `21*2`，follow-up 为 `{result}+8`，外层上限 6 分钟；真实运行 162.425 秒结束。
两张结果 PNG 分别显示 `21×2 / 42`、`42+8 / 50`，已检查最终实窗布局。
当前 recipe 源码 SHA-256 为 `3538e801d3dd0a5f2755743ece3cd165a682e0cedcbaa72b02a53b3ef3273907`；
execution snapshot SHA-256 为 `2907fdb539be11047df17cd2091e207c861189380b8357262a4fd52ef7bc8fbb`。
二者唯一差异是既有 `ai run` 将末尾 `main();` 归一为 `return await main();`，以等待异步结束；不是候选源码漂移。

## 源码、构建、安装和运行

- 工作区 `master`，HEAD `975f7f111c6ffe6b18002c08574b762eb1aa06c1`；共享 checkout 有大量并行未提交改动。
  本轮没有暂存、提交、切换分支或推送，也未重启共享 Native、改权限或覆盖已签名发行包。
- 运行构建为 darwin/amd64、Go 1.25.13、CGO 开启；所有相关 native source 的修改时间早于 v3 二进制。
  完整哈希、mtime 和 `vcs.modified=true` 的 build info 在 `build-provenance-final.json`。
  共享 dirty checkout 记录不等于发行源闭包证明。
- MCP v3 SHA-256：`1cd6a49781778305e21be73e930fc609e457b08ed4d90875f038346485b2a082`。
  CLI v3 SHA-256：`19415e31a4a9e830a9fe4f4266067b09394db50384748df4435db11817e13c98`。
- 官方 tunnel-client 0.0.18 使用本轮 `desktop-v3/desktop.yaml`，客户端 PID 784、MCP 子进程 PID 785
  是本轮观察值；后续必须重新发现。实际 MCP 测试的 Accessibility 与 Screen Capture 均为 true。
  没有把某个宿主的权限状态扩展为所有启动宿主或系统重启后的证明。
- `dist/opendesk`、稳定签名 App 和已安装发行包未替换；正式 JS 文件内的公开 `./dist/opendesk ...` 命令本轮未原样运行。
  本轮 CLI/JS 结果来自 `bin/opendesk-v3`，不能宣称公开发行命令已通过。

## 证据和复测

主要运行产物：`.runtime/tests/mcp-tunnel/20261118-capability-first/`。

- `build-provenance-final.json`、`opendesk-*-build-info.txt`：来源与哈希。
- `final-go-tests.log`、`api-check-final.json`、`api-contract-final.log`：定向检查。
- `runtime-window-content.json` 和其指向的 execution：正式 Runtime JS 的真实运行。
- `window-live-v3-diagnostic.log` 及 `.runtime/tests/mcp-window/2026-11-18T07-45-32-647Z-21897-y2O5mR/`：MCP live 证据。
- `R1/`、`R2/`、`R3/`：逐轮修复及宿主模拟；旧 qualification 不自动转移到新候选。
- `web-refreshed-tools.txt`、`web-expanded-transcript.txt`、`web-calculator-native-result.json`、
  `web-calculator-result.png`：网页目录、可见中间过程和独立真实窗口证据。未导出网页不可见的完整原始工具回执。
- `web-final-v3.txt`、`web-final-v3.png`：后续只读任务返回当前值 `50` 的网页证据。
- `calculator-recipe-v3*.json`：保留失败、超时及最终独立执行，均链接各自 execution snapshot 与结果。
- `R3/repair-record-final.json`：最终源码/归一化快照对应关系、70 项模拟检查和真实参数化流程的分开记录。

选择 **OpenDesk Desktop Mac96** 后可直接发送：

> 打开并聚焦计算器，算 17×23，再把读到的结果加 9，读回两个实际结果。自行选择合适能力并核对结果。

整仓测试架构审计仍失败，涉及本轮外未分类 Go 测试、历史分类格式、缺失的
`tests/runtime-api/single/window-app-watch.js` 以及文档/manifest 差异。本轮新增 Go 测试已登记；
不宣称整仓审计通过，也不为本次窗口接入扩大到无关整理。

窗口矩形截图仍可能包含遮挡，前台/几何检查不锁定 WindowServer，也不证明每个像素都属于目标窗口。
macOS 原生正文不可用、不完整或不支持时明确失败；不做自动 OCR/输入重试。
未新增 Windows/Linux live、发行签名/安装、重启持久化、任意应用通用成功或受保护字段视觉读取的资格。

本任务 Fixture 已通过既有 helper 核对完整进程命令后停止（cleanup execution `ai-20261118-155723-709000`）；
未关闭既有 Calculator。原生 UI 占用锁已释放，ego TaskSpace 只保留结果对话。
官方隧道保留运行，最终 `tunnel-status-final.json` 为 live/ready 且控制平面轮询正常；管理入口为
<http://127.0.0.1:3001/ui>。这是一份观察时点的就绪记录，服务停止或启动宿主变化后需要重新核对。
