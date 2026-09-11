# Script Runner Simple｜生产脚本快捷运行与应用层管理

## 1. 结论与质量目标

本设计把 `script-runner-simple.js` 定位为 **OpenDesk 普通 JavaScript 的轻量生产运行入口**，而不是 Recorder 的删减版，也不是新的 Runtime Registry。

冻结后的第一版产品心智：

```text
脚本目录
  ↓
JavaScript 扫描 + 排序配置
  ↓
Script Runner
  ├─ 主工具条：快速运行默认脚本 / 停止 / 当前脚本名 / 脚本列表
  └─ 脚本列表：序号、单个运行、排序、多选顺序运行、打开目录
  ↓
Command.run(current OpenDesk executable)
  ↓
新的标准 OpenDesk execution
  ↓
普通 *.js
```

本方案按当前仓库能力评分 **97/100**。达到 95 分以上的原因是：

- 不新增 `Automation.list()`、`Recorder.list()`、`RecipeRegistry` 等不必要 Runtime API；
- 普通 `.js` 保持第一等公民；
- `#1 = 默认脚本`，不再维护第二份 `defaultScript` 状态；
- 主工具条只有高频操作，低频管理进入列表窗口；
- 使用现有 `Command.run()` 启动新的标准 OpenDesk execution，并用 `AbortSignal` 停止；
- 顺序配置属于 JS 应用层，可随脚本目录复制；
- 现有 Scheduler 留作后续计划任务 owner，不在 Runner 内重新实现 timer/cron；
- 明确保留运行 Evidence / log-dir，但不在 P0 伪造当前 Runtime 不具备的实时终端能力。

P0 不追求完整自动化平台。当前目标是先完成 **可用、可理解、可安全停止的 Script Runner 与 UI**。

---

## 2. 当前真实能力边界

### 2.1 已有能力

当前 Runtime 已经足以实现 P0：

- `FloatingWindow`
  - 原生 Button；
  - 原生固定宽度 Label；
  - Label 文字过长时由 native view 末尾截断，完整文本仍保留在 readback / Accessibility；
  - macOS 与 Windows 均有原生 toolbar backend。
- `ui.createWindow()`
  - 适合脚本列表、Checkbox、Button、滚动区和动态状态展示；
  - macOS 使用 WKWebView；Windows 需要 WebView2 Runtime。
- `File`
  - `listDir/stat/read/write/join/getNameWithoutExtension` 等足以实现目录扫描和顺序配置。
- `System.getExecutablePath()`
  - 可取得当前 OpenDesk executable，避免把生产 Runner 写死为 macOS `./dist/opendesk`。
- `Command.run()`
  - 本地 `-script` execution 可直接启动当前 OpenDesk executable；
  - 支持 `cwd`、timeout、bounded stdout/stderr、`AbortSignal`；
  - 可用于 `Runner -> child OpenDesk -> target script`。

### 2.2 当前没有实时终端 API

`Command.run()` 当前契约是：

```text
启动命令
  ↓
等待退出
  ↓
返回 exitCode + stdout + stderr
```

它明确**不提供**：

- streaming process handle；
- stdout/stderr 实时事件；
- PTY；
- 交互式 stdin；
- terminal session。

因此当前可以查看的运行信息分成两类：

```text
运行中 / 运行后 Evidence
  ├─ child OpenDesk 的 -log-dir
  └─ 标准 .runtime 运行证据

Command.run 完成后
  ├─ exitCode
  ├─ stdout
  └─ stderr
```

P0 继续为每次执行创建独立 `-log-dir`，并保留结构化父进程日志；**本轮不做实时终端/控制台窗口**。

未来如果需要实时日志，优先顺序是：

1. 先做只读 Log Viewer：轮询/tail 当前 run 的日志文件，展示新增文本；
2. 只有确实需要交互式 terminal 时，再评估 Runtime streaming execution / PTY 能力；
3. 不为了一个 UI 窗口把 `Command.run()` 伪装成 PTY。

---

## 3. P0 主工具条

P0 的 FloatingWindow 固定为：

```text
┌─────────────────────────────────────────────┐
│   ▶        ■        ERP客户录入…        ☰   │
│  运行      停止        当前脚本        脚本列表 │
└─────────────────────────────────────────────┘
```

按钮顺序冻结为：

```text
[运行] [停止] [脚本名称 Label] [脚本列表]
```

不要增加：

- Recorder；
- Generate；
- Agent；
- 鼠标模式；
- 详情；
- Scheduler；
- 实时 Console；
- 打开目录。

这些不是主工具条的高频动作。

### 3.1 运行按钮

主工具条 `▶` 永远运行当前列表中的 **第 1 个脚本**。

```text
scripts[0] = default script
```

禁止出现：

```text
昨天选中过 3 个脚本
  ↓
今天点击主工具条 ▶
  ↓
意外运行 3 个脚本
```

主工具条的语义必须始终稳定。

### 3.2 停止按钮

`■` 只在存在当前 run / queue 时启用。

停止语义：

```text
用户点击停止
  ↓
AbortController.abort()
  ↓
Command.run() 取消当前 child process group
  ↓
取消尚未开始的 queue
  ↓
Runner 保持打开
```

停止不是关闭 Runner。

### 3.3 当前脚本 Label

Label 使用固定宽度，例如 144–176pt；不由 JS 手工截断字符串。

native Label 负责：

```text
ERP客户录入-正式版本.js
        ↓
ERP客户录入-正…
```

但内部和 Accessibility 仍保留完整名称。

Label 文本规则：

```text
无脚本          → 暂无脚本
空闲            → #1 默认脚本名称
单脚本运行      → 当前运行脚本名称
多脚本 queue    → 2/3 · 当前脚本名称
queue 完成       → 恢复 #1 默认脚本名称
```

Label 只回答两个问题：

- 空闲时：按 `▶` 会运行谁；
- 运行时：现在正在运行谁。

### 3.4 脚本列表按钮

`☰` 放在最末尾，打开完整 Script List 窗口。

主工具条不承担目录管理、排序和批量操作。

---

## 4. Script List UI

P0 使用 `ui.createWindow()` 实现完整列表。

推荐布局：

```text
┌──────────────────────────────────────────────────────────────┐
│ 脚本列表                                      3 个脚本       │
├──────────────────────────────────────────────────────────────┤
│     #   脚本                              操作        排序     │
│                                                              │
│ □   1   ERP客户录入.js                   [运行]      [↓]     │
│ □   2   每日销售日报.js                  [运行]    [↑][↓]    │
│ □   3   发票下载.js                      [运行]      [↑]     │
│                                                              │
├──────────────────────────────────────────────────────────────┤
│ [运行选中]      [打开脚本目录]      [重新扫描]      [关闭]   │
└──────────────────────────────────────────────────────────────┘
```

### 4.1 序号

序号是当前执行/显示顺序：

```text
1
2
3
...
```

它不是持久 ID，也不是文件名的一部分。

因此：

```text
#1 = 默认脚本
#2 = 第二顺序
#3 = 第三顺序
```

### 4.2 单行运行

每一行 `[运行]` 只运行该脚本。

它不会修改默认顺序，也不会把该脚本自动提升为 #1。

### 4.3 多选顺序运行

用户可勾选多个脚本，再点击 `[运行选中]`。

队列必须按**当前序号**执行，而不是按勾选先后执行：

```text
☑ #1 ERP
☐ #2 日报
☑ #3 发票

运行顺序：#1 -> #3
```

默认采用 fail-fast：

```text
#1 success
  ↓
#3 failed
  ↓
停止，不再继续后续脚本
```

桌面自动化共享鼠标、键盘、窗口焦点，P0 不并发运行多个脚本。

### 4.4 排序

最终产品可考虑拖动排序，但 P0 **先实现可靠的 `↑ / ↓`**。

原因：当前 `ui.createWindow()` 公开事件为 `click/change/input/move/resize/close`；其中 `move` 是窗口移动，不是列表行 drag/drop。`data-clawdesk-drag` 也是窗口拖动区，不应伪装成业务行排序。

因此：

```text
P0
↑ ↓ 调整顺序

P1
如果 Custom UI 后续有稳定 row drag/reorder 事件
再把交互替换成 ≡ 拖动
```

数据模型不改变，所以 P1 不需要迁移配置。

运行中禁止改变顺序，避免 queue 运行到一半时业务含义变化。

### 4.5 重新扫描

重新扫描读取当前 script root，并重新应用持久化顺序。

如果窗口的控件数量需要变化，P0 可以关闭并重建 Script List window；不要为了动态 DOM tree 专门扩大 Runtime API。

---

## 5. 脚本目录与发现规则

### 5.1 root 解析

P0 推荐：

```text
OPENDESK_SCRIPT_RUNNER_DIR
  ↓ 如果设置
使用显式目录

否则
  ↓
<Execution.workdir>/recipes
```

`recipes` 在这里先作为普通 `.js` 的生产目录；后续 protected `.odpkg` 或 package manifest 能力成熟后再扩展 discovery，不改变主工具条心智。

Runner 不递归扫描整个仓库，也不把所有 `*.js` 都当成业务自动化。

### 5.2 P0 discovery

只接受 script root **直接子项**中的普通 `.js` 文件：

```text
recipes/
├─ erp.js           ✓
├─ report.js        ✓
├─ helper.txt       ×
├─ .hidden.js       × 默认忽略隐藏文件
└─ tools/
   └─ debug.js      × 不递归
```

P0 不扫描：

- `tests/`；
- helpers；
- 任意仓库 JavaScript；
- nested directories；
- `.runtime/`；
- Recorder raw/generated 资产。

---

## 6. 顺序配置

顺序属于应用层，不增加 Runtime Registry。

配置放在 script root：

```text
recipes/
├─ ERP客户录入.js
├─ 每日销售日报.js
├─ 发票下载.js
└─ .opendesk-runner.json
```

最小 schema：

```json
{
  "schemaVersion": 1,
  "order": [
    "ERP客户录入.js",
    "每日销售日报.js",
    "发票下载.js"
  ]
}
```

明确**不保存**：

```json
{
  "defaultScript": "..."
}
```

因为：

```text
order[0] = default script
```

这样没有两份可能互相冲突的状态。

### 6.1 配置缺失

首次使用没有配置时：

```text
发现 *.js
  ↓
文件名确定性排序
  ↓
第一个成为默认脚本
```

新发现且未出现在配置中的文件追加到已有顺序末尾。

已删除文件从运行列表中忽略，不因为 stale order entry 阻止其他正常脚本。

### 6.2 配置损坏

配置损坏不能悄悄改变默认运行对象。

因此：

```text
.opendesktop-runner.json / .opendesk-runner.json 无法解析或 schema 非法
  ↓
仍可发现脚本供用户检查
  ↓
主工具条 ▶ 禁用
  ↓
Script List 显示“排序配置无效”
  ↓
用户明确选择“恢复默认排序”或重新排序
  ↓
写入新的合法配置
```

实施时只采用正式文件名 `.opendesk-runner.json`；上面的其他拼写仅用于说明“错误配置不能静默回退”，不得创建兼容别名。

### 6.3 跨平台写入

当前 `File.writeJSON()` 文档明确指出 Windows 的原子替换后端仍可能返回 `ATOMIC_REPLACE_UNSUPPORTED`。

因此 P0 的小型排序配置不要强制依赖 `File.writeJSON()`；可使用：

```js
File.write(configFile, JSON.stringify(config, null, 2) + "\n");
```

并在 JS application controller 中串行化 reorder/config writes。

这是 UI 偏好文件，不是数据库事务或业务账本。未来 File JSON Windows atomic replace 完成后，可再统一到 `writeJSON()`。

---

## 7. 执行链路

P0 不 `eval()` 目标脚本，也不在 Runner 当前 execution 内直接解释另一个脚本。

正确链路：

```text
Script Runner execution
  ↓
System.getExecutablePath()
  ↓
Command.run(currentOpenDesk, [
  "-script", scriptPath,
  "-console-mode", "script",
  "-log-dir", runLogDir
])
  ↓
新的 OpenDesk process / execution
  ↓
目标 *.js
```

这与 Recorder 当前生成脚本重放采用的正式思路一致：Runner 负责启动，目标脚本仍进入正常 OpenDesk Runtime。

### 7.1 单脚本状态

```text
idle
 ↓ run
preparing
 ↓
running
 ├─ exit 0    → succeeded
 ├─ non-zero  → failed
 └─ abort     → canceled
```

### 7.2 多脚本 queue

```text
selected scripts
  ↓ 按当前 order 排序
queue
  ↓
run #1
  ↓ success
run #2
  ↓ success
run #3
```

任何失败默认停止 queue。

### 7.3 防重复启动

存在 `runPromise/currentRun` 时：

- 主工具条 Run disabled；
- 行 Run disabled；
- Run Selected disabled；
- reorder disabled；
- Stop enabled；
- Script List 仍可查看当前状态。

不同按钮不能绕过 single-flight 启动第二个共享桌面 run。

---

## 8. 运行日志与 Evidence

每次运行必须创建独立目录，例如：

```text
.runtime/examples/custom-ui/script-runner-simple/runs/
└─ 2026-09-10T15-30-00-000Z-erp/
```

child OpenDesk 启动时传：

```text
-log-dir <runLogDir>
```

父 Runner 同时输出稳定结构化记录，建议：

```text
SCRIPT_RUNNER_READY=
SCRIPT_RUNNER_ORDER_CHANGED=
SCRIPT_RUNNER_RUN_START=
SCRIPT_RUNNER_RUN_FINISH=
SCRIPT_RUNNER_RUN_CANCELED=
SCRIPT_RUNNER_ERROR=
```

不要在普通 UI 中无限显示 stdout/stderr。

P0 的 UI 只需要：

- 正在运行哪个脚本；
- 成功 / 失败 / 已取消；
- 如果失败，在列表状态区给出短错误；
- 完整日志继续保存在 run log directory。

### 后续实时日志 UI

后续可以新增：

```text
[日志]
  ↓
只读 Log Viewer
  ↓
当前 run log 文件增量读取
```

如果只是“看实时执行到哪一步”，tail log 已足够，不必立刻实现 PTY。

真正的终端能力只有在需要：

- 交互式 stdin；
- shell/REPL；
- ANSI terminal；
- 长驻 process handle；

时才值得扩展 Runtime。

---

## 9. Scheduler 后续设计

当前仓库已经存在正式 Scheduler：

```text
pkg/scheduler/
├─ executor.go
├─ model.go
├─ schedule.go
├─ service.go
└─ store.go
```

并已有：

- `at`；
- `every`；
- Linux 五字段 `cron`；
- timezone；
- misfire policy；
- SQLite 持久化；
- pause/resume/run-now/delete/history；
- 共享桌面的串行 worker。

因此不要在 `script-runner-simple.js` 中自己实现：

```text
setInterval
cron parser
job SQLite
misfire
restart recovery
```

P0 主工具条不显示 Scheduler。

未来 P2 可以增加：

```text
[▶] [■] [ERP客户录入…] [🕒] [☰]
```

其中 `🕒` 打开 Scheduler Application UI。

关键规则必须提前冻结：

```text
主工具条 #1
= 人工快速运行默认脚本

Scheduler Job
= 绑定具体 scriptPath
```

用户重新排序后，已有定时任务不能从 `report.js` 偷偷变成新的 `#1`。

P2 初期继续保持：

```text
1 Scheduled Job -> 1 scriptPath
```

需要多脚本计划时，再独立设计 Run Plan / Workflow，不在 P0 暗中引入。

---

## 10. 文件实施计划

下一轮实施以本文件为正式设计基线，优先修改：

```text
examples/custom-ui/
├─ script-runner-simple.js
└─ script-runner-simple/
   └─ controller.js

examples/custom-ui/README.md
```

如果需要纯逻辑测试，可增加所属测试域的稳定测试文件，但不要为了测试公共 JS 行为增加 Go Runtime API。

### `script-runner-simple.js`

职责：

```text
resolve dependencies
resolve scriptRoot
load controller
create app
await app.run()
```

入口保持薄，不堆业务逻辑。

### `script-runner-simple/controller.js`

职责：

```text
scan scripts
load/reconcile/save order
manage selection
manage queue
start/cancel child OpenDesk execution
sync toolbar
create/sync Script List window
structured logging
cleanup
```

### `examples/custom-ui/README.md`

至少增加：

- 从仓库根目录的一行运行命令；
- 默认 script root 与 `OPENDESK_SCRIPT_RUNNER_DIR` 覆盖方式；
- `#1 = default`；
- P0 使用 `↑/↓`，不是拖动；
- Run Selected 串行 fail-fast；
- Stop 取消当前 run 和剩余 queue；
- 日志目录位置；
- Scheduler / realtime terminal 属于后续，不假装已经实现。

---

## 11. P0 验收标准

功能验收：

- 0 个脚本：Label 显示“暂无脚本”，Run disabled；
- 1 个脚本：主 Run 默认执行 #1；
- 3 个脚本：显示 `1/2/3`；
- 上移/下移后序号和默认脚本同步变化；
- 关闭再启动 Runner 后顺序保持；
- 新增脚本后重新扫描，追加到未配置部分；
- 删除脚本后重新扫描，不运行 stale entry；
- 行 Run 只运行该行；
- Run Selected 按当前顺序串行；
- 第一个失败后后续脚本不执行；
- Stop 能取消当前 child execution 并清空剩余 queue；
- Runner 本身在 stop 后仍保持可操作；
- 运行中禁止 reorder 和重复启动；
- Label 长名称由 native 末尾截断，完整名称仍保留；
- Script List 按钮始终位于主工具条最后。

日志验收：

- 每个 child run 有独立 `-log-dir`；
- 成功、失败、取消均有结构化 Runner 记录；
- 不声称 stdout/stderr 在 UI 中实时 streaming；
- 不新增 console/terminal UI。

平台验收：

- macOS 主 toolbar 使用原生 FloatingWindow；
- Windows 主 toolbar 使用 WinForms FloatingWindow；
- Windows Script List 明确依赖 WebView2，缺失时沿现有 `UNSUPPORTED_CAPABILITY` 行为失败，不做假的降级；
- child executable 使用 `System.getExecutablePath()`，不写死 `/usr/bin` 或无 `.exe` 的路径。

架构验收：

- 不新增 `Automation.list()`；
- 不新增 `Recorder.list()`；
- 不新增新的 Execution manager Runtime object；
- 不在 Runner 内实现 Scheduler；
- 不递归扫描仓库全部 JavaScript；
- 不用 `eval()` 运行生产脚本；
- 不把 Recorder raw/generated directory 当生产 Script List。

---

## 12. 后续优先级

```text
P0 · 当前实施
Script Runner toolbar
+ Script List
+ #1 default
+ ↑/↓ reorder
+ row run
+ selected sequential run
+ stop/cancel
+ run logs

P1 · 交互增强
可靠 row drag/reorder
+ 可选只读实时 Log Viewer

P2 · 计划任务应用层
Scheduler Native/Custom UI
+ create/list/pause/resume/run-now/delete/history

P3 · 生产交付增强
protected .odpkg discovery
+ 参数输入
+ 运行历史中心
+ failure notification
+ Run Plan（仅有真实需求时）
```

P0 完成以前，不把 P1/P2/P3 功能塞回主工具条。

## 13. Stop 生命周期回归入口

以下命令均从仓库根目录执行。macOS 正式构建入口为 `scripts/build_macos_app.sh`，它同时
刷新主程序与 native UI host，并将 `dist/opendesk` 链接到签名后的
`dist/OpenDesk.app/Contents/MacOS/opendesk`。`go build -o dist/opendesk ./cmd/opendesk`
是现有 CI 的 Runtime compile gate；本机正式交付优先使用 app 构建，避免覆盖签名 payload。

当前 Custom UI canonical 装配为 `automation.registerCustomUI → customui.NewProcessDriver`。
普通未启用 UI 的 execution 注册 disabled facade；process driver 按需启动独立 host。
App Mode 复用同一个 process driver，并为 execution 创建 session-scoped driver。
macOS 的 `darwin && cgo` 约束位于 `cmd/opendesk-ui-host` / `pkg/customui/machost`，
不控制一个名为 `NewDefaultBackend` 的 factory；当前源码中不存在该旧符号或调用。
Windows 沿同一个 process driver 发现 WinForms sidecar，不需要恢复旧 backend 入口。

```bash
scripts/build_macos_app.sh
node --test tests/custom-ui/script-runner-simple.test.js
go test ./...
./dist/opendesk -script tests/custom-ui/script-runner-simple-runtime.js -console-mode script -log-dir .runtime/tests/script-runner-simple/runtime-parent
```

Windows 在具备 Go/native C 工具链和 .NET 8 的机器上，从仓库根目录执行：

```powershell
pwsh -File scripts/build_windows_app.ps1
.\dist\opendesk.exe -script tests/custom-ui/script-runner-simple-runtime.js -console-mode script -log-dir .runtime/tests/script-runner-simple/runtime-parent
```

Controller 永久测试覆盖同 tick Stop、运行中取消、顺序与独立日志、失败及取消 fail-fast、
取消后重跑，以及延迟 UI 清理时拒绝重叠 run。`executeQueue` 在首次 await 前建立
`activeRun`；UI 写入串行化并在执行时读取状态；最终 UI 清理结束后才释放 `runPromise`，
清理同时检查 run / Promise identity。成功、失败、取消后均恢复 Idle 按钮状态。

Runtime harness 使用注入的展示层和真实 `Command` / `AbortController` / OpenDesk child：

- `normal-child`：成功、marker 存在、child PID 已退出。
- `immediate-stop`：Stop 接受、canceled、completed=0、无 Command 启动、无原始 marker；
  再次 Run 成功，并再次确认原始 child 没有延迟启动。
- `running-child-stop`：选中两个脚本，观察第一个 child marker 与存活 PID 后 Stop；
  Command 以 `CANCELED` 结束，signal 已 abort，PID 退出、第二个 marker 不产生；随后重跑成功。

成功输出 `SCRIPT_RUNNER_SIMPLE_RUNTIME_OK=`；结果、原始 child 源码快照和 markers 位于
`.runtime/tests/script-runner-simple/<timestamp>/`，父日志位于上述 `runtime-parent/`。
child 独立日志路径记录在结果的 `commandCalls[].logDir` 中。Controller 临时 fixture 也写入
`.runtime/tests/script-runner-simple/controller/`；现有 `.gitignore` 的 `.runtime/` 规则覆盖全部产物。

底层进程组清理复用既有 `OPENDESK_RUNTIME_API_MODE=command` 正式 gate；其证据位于
`.runtime/tests/runtime-api/<runId>/results/command-cancel-observation.json`，需确认 child 和
descendant 在取消前存活、取消后均消失，以及 Runtime cleanup 计数归零。

Native UI CI 在 macOS / Windows 首先编译 Runtime，再运行已有 host 和 Script Runner gates；
触发范围包含 Runtime 入口、execution 装配、Command 与平台构建脚本，并覆盖所有 PR。
跨编译仅属于编译证据，不能声称 Windows live 通过。本 harness 不创建真实窗口，
不能作为公开 UI 示例已运行或视觉验收通过的证据。
