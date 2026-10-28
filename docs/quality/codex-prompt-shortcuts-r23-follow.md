# 提示词快捷栏 R23：事件驱动跟随

2026-10-28，master，起点 b7280bef765a4fe5c6076643d5c8313733d39e2b。保留五按钮和双栏管理器；本轮不修改输入事务、targets/insert 的并行 paste 策略，不点击提示词或发送消息，不提交或推送。

## 设计与回归计划

采用指定 PID/executable 的原生变化提示 + single-flight 定向查询 + 有界轮询兜底。通知只表示需要重查，不是前台、窗口身份或 Claude Code 资格证明。每次显示仍以新鲜场景及前后精确窗口读数为准；失活/换窗/场景失效立即递增 generation 并隐藏，迟到读取不得恢复旧栏。原生所有者为 automation，不在 polyfills 实现监听。

- 限定 KVO isActive 和 per-PID AXObserver；只注册目标进程/所选窗口，不订阅全桌面事件。每条订阅报告实际支持/失败状态，RunLoop 与 execution 生命周期共同清理。
- 静止且已显示：轻量守卫确认状态未变后跳过同步，避免重复 hide/show、完整 AX 树读取。缺栏但用户没有关闭时才重新资格化恢复；用户关闭将 bar 清空并进入现有管理器流程，不自动创建。
- 激活：立即唤醒查询，不加长 debounce；活动目标变化先隐藏。几何提示合并，串行读取，无重叠查询；不把 16–33ms 的调度目标宣称为真实跟随延迟。
- 同一轮守卫观察交给同步消费一次；显示前后精确复核保留。删除 getAppWindow 中冗余的中间前台查询，保留 AX 前与返回前 fresh 核验。
- 原生监听缺失、unsupported、终止及异常均保留显式 fallback。场景变化不能仅依靠 activation，保留定期结构复核；未经新鲜资格化不重新显示 Claude 栏。
- `getAppWindow` 使用 execution 所有的后台串行 worker，最多 32 个待完成请求，每个请求独立新鲜读取；不缓存前台，不丢弃不同 scope。Promise 只在 JS owner 结算，取消后拒绝迟到成功结果，Close/Wait 与资源计数均接入现有生命周期。
- 不在前台且栏已隐藏时只保留轻量守卫，不因隐藏状态反复补充 40ms 短重试；返回目标后仍完整资格化。此回归已先在旧实现复现失败，再修复通过。
- 正在读取守卫时合并纯 registration/capability 和严格重复 activation 提示，避免额外扫描排到资格化前面；包含失活、场景或几何变化的混合提示仍保留失效及立即补查。不广泛过滤 nonowner 提示，不清除已有 pending 标记。
- 拖动保持原生 owner/generation、160ms 合并、最终帧确认和按应用位置隔离。

先增加离线回归锁定：无变化不重复深读、轻量观察只消费一次、失活先隐藏、快速切换/迟到结果丢弃、缺栏恢复/关闭不重开、订阅清理及 unsupported fallback；保留 R22 Code/Cowork、几何与最终拖动帧测试。随后定向 Node、native 编译、文档/类型契约检查。实窗先核实加载及视觉，再做切换、拖动、位置隔离与至少20个稳定切换样本。

响应目标：warm 常见100–200ms、P95≤500ms；首次识别单列P95≤1000ms。动作→正确稳定可见和事件→可见分开记录。现有旧样本受干扰，不能作为优化百分比的基线。只有本轮候选实窗证据才能证明响应、拖动和视觉结果。

## 首轮实窗与发现

证据根 `.runtime/tests/codex-prompt-shortcuts-r23/`。`live-01` 加载正式 main.js，SHA256 `bf16d9ee3b0a6d185440908f167475f237c9e233030f09fa0524f47190f53001`；主程序 `0e72e422c970260b6f1bf5cc89377106e62046f3ccee2b70ed045b1d3a6e2691`，UI host `44e68f6db6cada6fd7c2de0344a4bfef3fffaddefde7dfe9b7bc2d3d83c98a09`。固定入口构建及 `codesign --verify --deep --strict dist/OpenDesk.app` 通过。

21:11–21:16 的首轮只激活配置内 Claude/OpenCode、读取精确窗口及本轮快捷栏。两者 per-PID KVO/AX activation/deactivation 提示实际送达；激活后的能力状态报告所选窗口移动/缩放等注册成功，但这不证明对应通知实际送达。没有点击提示词、发送消息或修改真实草稿。首轮初段有非目标 PID 抢占前台，未计入测量；另一个任务的旧快捷栏自然退出，本轮未终止它。

`switches-02.jsonl` 的 20 次受控切换均先证实为真正切换，并以独立 fresh front ASN/PID 标识确认。只查本轮快捷栏 WindowServer ID，约 10ms 采样正确位置，持续 120ms 才记稳定；该确认时间包含在下表。前台采样在独立线程执行，未出现已确认目标后被其他 PID 打断的样本。分位采用 nearest-rank，P50 为第10个、P95为第19个样本；这是此候选的测量，不是优化百分比基线。

| 动作起点至结果 | 样本数 | P50 | P95 | 最大 |
| --- | --- | --- | --- | --- |
| 首个正确可见位置 | 20 | 659ms | 869ms | 983ms |
| 正确位置持续120ms | 20 | 784ms | 992ms | 1109ms |

`switches-01.jsonl` 的前台检查阻塞了采样，仅保留为粗粒度上界，不混入上述分布。首轮首次资格化没有独立分布；事件→可见与完整同步结束未混为动作→稳定指标。**首轮未达到 P95≤500ms**。

首轮揭示关键瓶颈：公开 JS facade 虽返回 Promise，反射绑定的 native `GetAppWindow` 仍在 Goja owner 同步运行，延迟了原生提示处理。随后修复为真正后台查询；上述样本不能证明此后候选的响应。

首轮 `toolbar-live-01.png` 是精确自有窗口截图：五按钮 60×280pt，未见拉宽、裁切或错位。它只证明首轮候选的视觉状态。自有主程序 PID18744/UI host18819 已受控停止，两个 PID 均已消失；安装版和其他任务进程未被结束。

## 当前离线状态与未完成验收

用户要求先优化逻辑。后台查询及缺目标空转修复已写入并构建；公开 JS 命令取得明确 PASS 后，于21:29再次通知开始短时受控复测。

- 四模块 Node 回归 `node-all-05.log` 当时440项，438通过、0失败、2项可选 Browser 路径跳过。其后共享源码继续发生输入适配修改；`node-all-07.log` 为443项，410通过、31失败、2跳过。再次确认源码变化后执行的最新 `node-all-08.log` 为443项，413通过、28失败、2跳过；输入适配失败尚未归因收口，不能称当前整套通过。`node-all-08-provenance.json` 记录执行前后5份源码/测试哈希一致，非运行中换版本所得。本轮没有修改 targets.js / insert.js 的输入策略，也没有回退并行改动。
- 最后通知去重补丁的跟随专项 `follow-focused-final.log`：20/20通过。新增“读取中软提示不追加扫描”先复现失败，再修复通过；混合失活仍隐藏、丢弃旧结果并立即补查。独立审查2条新增回归通过，未发现新的高中问题。
- 固定命令 `GO_BIN=/Users/shopme/.local/opt/go1.25.13-amd64/bin/go ./scripts/build_macos_app.sh` 的 `build-02.log` 和严格签名核验通过；只读独立审查没有发现新的高中风险问题。
- 仓库根目录原样命令 `./dist/opendesk -script tests/runtime-api/window-app-scoped.js -console-mode script` 的 `api-scoped-03.log`：24项参数检查通过，2个独立scope均结算，等待期间58次timer tick，运行清理总workers/callbacks均为0。早先未顶层await的测试退出0却没有PASS，已判无效并修正测试入口；没有修改通用runner。`./dist/opendesk -script tests/runtime-api/window-app-watch.js -console-mode script` 的 `api-watch-02.log`：35项参数检查通过，不建立真实订阅。`api-docs-check-03.log` 和文档契约检查通过。

第二轮 `live-02` 实际加载后台查询构建：主程序SHA256 `9cf076cd3e67029f7dc7a5898093fb22e40e133bb2fed93e1b44699dbf270839`；UI host不变；main.js SHA256 `f4ee266b541f2b4160b3c4389c84e450c9c19b040f613828093a1db8ba0e9eab`。`toolbar-live-02.png` 再次确认五按钮外观、280pt高度及对齐，没有裁切。21:29:49该执行被另一启动替换，stdout明确记录 `Script execution was replaced by a newer invocation`，summary为canceled，总运行40382ms；并非本轮主动关闭或证明主逻辑自动退出。清理日志总workers/callbacks均为0，主程序PID46099和host46184均消失。

`switches-03.jsonl` 共尝试18次：前14次取得正确稳定帧，此后3次位置超时、1次前台被其他PID打断，探针退出2。取消前后的证据不能拼成完整20次分布，也不能据此宣布P95达标。发现后已提前通知结束桌面动作；没有继续点击或拖动。最后的软提示去重JS补丁及并行输入改动尚未重新加载。

| 层次 | 当前结论 |
| --- | --- |
| 代码已修改 | 原生监听、后台查询、快照属性筛选/坐标校准及跟随去重已落地；未提交。 |
| 构建 | build-02固定入口与严格签名通过；之后仅跟随JS去重，无本轮native修改。 |
| 实际已加载 | 后台查询构建已在live-02加载；最终JS未加载，见final-provenance.json区分。 |
| 视觉已确认 | live-01/02精确自有窗口截图通过，不替代最终JS加载证据。 |
| 功能已验证 | Runtime参数/异步和跟随专项通过；整体输入回归有失败，完整实窗响应/拖动未完成。 |

待完成：稳定协调下的最终候选加载、响应分布、真实拖动/松手保存、按应用偏移隔离、移动/缩放通知实际送达和Code/Cowork切换隐藏。需避免另一次启动替换同一执行；下轮桌面动作前再次发开始通知。旧的未达标分布保留，不当作当前通过证据。

私人库仅核对 SHA256 `046f55a4cef84b8be6aa77e50158c441a18cc477146ece1c13880bf5bcf8a4e4`，未读取或输出正文。没有访问 Codex UI/AX/窗口内容、全局应用/窗口清单、全桌面截图或全局输入监听。严格安全追加不属于本轮完成项；常规 paste 输入由并行任务单独验收。本轮没有创建分支、提交或推送。
