---
title: Environment Configuration
description: OpenDesk 本地 Execution.env、项目级 .env、.opendesk.env、输出配置与优先级。
order: 15
---

# 环境配置（Environment Configuration）

OpenDesk 可在**命令启动的工作目录**读取项目环境，并把合并后的只读字符串快照暴露为
`Execution.env`。这相当于 Vite 的 `import.meta.env`，但发生在本地 JavaScript execution 启动时，
不会构建期替换源码，也不会提供 Node.js `process.env`。

这里的“系统环境”特指 **OpenDesk 进程启动时由操作系统传入的环境快照**，也就是 shell 中已经
`export` 的变量，或服务管理器、IDE、GUI launcher 显式传给进程的变量。Runtime 不会启动 login
shell，不会读取 `.zshrc`、`.bashrc`、Windows 注册表或运行中后来修改的父进程环境。因此从 macOS
Finder/Dock 等 GUI 启动时，变量集合可能少于从 Terminal 启动；这类项目值应写入环境文件。

其中 `OPENDESK_CONSOLE_MODE`、`OPENDESK_CONSOLE_CATEGORIES` 和 `OPENDESK_CONSOLE_COLOR`
还会配置终端输出。其他键只进入 execution 环境；`OPENDESK_TIMEOUT`、`OPENDESK_STACK` 等不会
自动映射为同名 CLI flag。

## 快速开始

从仓库根目录复制模板：

```bash
cp .opendesk.env.example .opendesk.env
```

日常用户推荐保持默认的安静输出：

```dotenv
OPENDESK_CONSOLE_MODE=normal
MY_PROJECT_MODE=development
```

开发机需要默认显示完整诊断时，改为：

```dotenv
OPENDESK_CONSOLE_MODE=full
```

随后照常运行脚本即可，无需重复添加终端输出参数：

```bash
./opendesk -script script.js
```

`.opendesk.env` 是本地文件，已被 Git 忽略；应提交模板文件
`.opendesk.env.example`，而不是机器或项目的实际设置。模板位于仓库根目录，使用上面的
`cp` 命令即可复制。

## 文件选择与优先级

未传 `-env-file` 时，OpenDesk 按下列顺序读取当前工作目录的文件，后读到的同名键覆盖前者：

1. `.env`
2. `.opendesk.env`

`Execution.env` 的值优先级从低到高为：`.env` → `.opendesk.env` → OpenDesk 继承的 shell 环境。
shell 中已导出的同名键始终覆盖文件值。

与会把代码发送到浏览器的 Vite 不同，本地 OpenDesk 脚本同时承担桌面自动化和子进程启动，因而
不会只暴露特定前缀：`PATH`、`HOME`、代理配置、CI 变量以及其他合法系统键都会进入本地快照。
这也意味着本地快照可能包含 token 等秘密，脚本只能读取确实需要的键。远程 execution 仍遵循下文
的空环境隔离边界。

终端输出设置的完整优先级为：内建默认值 → `.env` → `.opendesk.env` → 已导出的
`OPENDESK_CONSOLE_*` shell 环境变量 → 显式 CLI 参数。

指定文件时，只读取该文件，不再探测默认文件：

```bash
./opendesk -env-file config/dev.env -script script.js
```

AI recipe 使用对应的长参数：

```bash
./opendesk ai run recipe.js --env-file config/dev.env
```

相对环境文件路径以命令启动工作目录为基准；不存在、不是普通文件或包含无效赋值时会在
脚本启动前报错并退出。

## JavaScript 中读取

```js
const mode = Execution.env.MY_PROJECT_MODE;
const endpoint = Execution.env.MY_SERVICE_ENDPOINT;
```

仓库提供了只报告变量是否存在、不会打印 `PATH`、home 或完整环境内容的安全示例。从仓库根目录
直接运行：

```bash
./opendesk -script examples/environment.js
```

可在 shell 或环境文件中设置 `OPENDESK_EXAMPLE_MODE`，观察项目变量进入同一个快照；不设置时示例
使用 `default`。源码见 [`examples/environment.js`](../../examples/environment.js)。

所有值都是字符串，未定义键返回 `undefined`。`Execution.env` 是一次 execution 的冻结快照；给它
赋值不会修改宿主进程、后续 execution 或 `Command.run()` 的默认环境。完整 execution 契约见
[Execution Context](execution.md)。

环境键在 Linux/macOS 上大小写敏感；Windows 系统环境本身大小写不敏感，因此 Runtime 会把 Windows
键统一为大写，保证 `Execution.env.PATH` 和 `Command.run()` 的覆盖行为确定。项目环境键建议始终
使用大写。系统平台、架构等元数据应通过 `System.getPlatformInfo()` 读取，不会伪装成环境变量。

## 支持的参数

| 环境键 | 等价 CLI 默认值 | 可选值 | 说明 |
| --- | --- | --- | --- |
| `OPENDESK_CONSOLE_MODE` | `-console-mode <mode>` | `normal`、`script`、`full`、`meta`、`summary`、`quiet`、`agent` | 选择预设输出档位。 |
| `OPENDESK_CONSOLE_CATEGORIES` | `-console-categories <list>` | `framework`、`meta`、`script`、`summary`、`error` 的逗号列表 | 精确替代 mode 默认类别。 |
| `OPENDESK_CONSOLE_COLOR` | `-color <mode>` | `auto`、`always`、`never` | 控制终端语义色；默认 `auto`。 |

### 输出模式

| mode | 终端内容 | 适用场景 |
| --- | --- | --- |
| `normal` | 非调试脚本日志、完成摘要、错误 | 默认日常使用。 |
| `script` | 所有脚本日志，含 `console.debug` / `console.time*` | 调试脚本逻辑。 |
| `full` | script、framework、metadata、summary、error | 调试加载和执行链路。 |
| `meta` | 执行来源、hash、生命周期和错误 | 排查脚本启动与执行状态。 |
| `summary` | 最终摘要和错误 | 简短 CI 输出。 |
| `quiet` | 错误 | 静默批处理。 |
| `agent` | Agent JSON 摘要；错误仍输出到 stderr | Agent 传输；`-output-format json` 也会自动使用。 |

`normal` 会隐藏 framework、执行元数据、`console.debug` 与 `console.time*`，但完整事件和
原始 stdout/stderr 仍写入本次 `.runtime/runs/...` artifact。

### 终端颜色

交互终端默认使用语义色帮助快速扫描，同时始终保留文字标签，颜色不是识别日志的唯一方式：

| 标签/级别 | 终端样式 |
| --- | --- |
| `[FRAMEWORK]` | 灰色，降低加载细节的视觉权重 |
| `[SCRIPT]` | 粗体亮青色，突出用户脚本输出 |
| `[META]` | 紫色，表示执行上下文和生命周期 |
| `[SUMMARY]` | 成功为粗体绿色；失败/超时为红色；取消为黄色 |
| warn / error / debug | 额外保留 `[WARN]` / `[ERROR]` / `[DEBUG]` 文字标识，并分别使用黄色、粗体红色和弱化灰色 |

终端标签采用“owner + 方法/级别”两层结构，不能只靠颜色判断来源。例如 `full` 模式下：

```text
[FRAMEWORK] [DEBUG] Loaded polyfill: 006-ui.js
[SCRIPT] [LOG] order created id=42
[SCRIPT] [DEBUG] normalized payload
[SCRIPT] [WARN] retrying request
[SCRIPT] [ERROR] request rejected
```

Runtime 初始化、资源探测和 polyfill 装载属于 framework；其正常诊断统一为 `debug`，不会冒充业务
`console.log()`。用户脚本的 `console.log/info/debug/warn/error` 则保留 `SCRIPT` owner 和对应方法标签。
框架自身的完成通知只进入 `META` / `SUMMARY`，不会进入 `SCRIPT` 或 Agent 的 `scriptLogs`。因此即使
`full` 同时展示两类内容，也能按 `[FRAMEWORK]` / `[SCRIPT]` 搜索，并能在禁色环境中可靠区分。

| 归属与级别 | `normal` | `script` | `full` |
| --- | --- | --- | --- |
| framework debug | 隐藏 | 隐藏 | `[FRAMEWORK] [DEBUG]` |
| script log/info | `[SCRIPT] [LOG/INFO]` | `[SCRIPT] [LOG/INFO]` | `[SCRIPT] [LOG/INFO]` |
| script debug/time | 隐藏 | `[SCRIPT] [DEBUG/TIME]` | `[SCRIPT] [DEBUG/TIME]` |
| warn/error | 显示 | 显示 | 显示，并保留 owner 与级别标签 |

`auto` 会分别检查 stdout 和 stderr：真实 TTY 才着色，管道、文件重定向及 `TERM=dumb` 自动保持
纯文本。OpenDesk 继承的进程环境中，非空 `NO_COLOR` 会关闭 `auto` 配色；未设置它时，非空且不为
`0` 的 `FORCE_COLOR` 强制开启，`FORCE_COLOR=0` 关闭。两者同时存在时 `NO_COLOR` 优先。项目环境
文件不会把这两个通用变量解释为终端配置；需要项目默认值时使用 `OPENDESK_CONSOLE_COLOR`。显式
`-color always|never` 的优先级更高：`always` 适合保留 ANSI 的终端工具，`never` 则无条件关闭：

```bash
# 日常交互：自动判断 TTY。
./opendesk -script examples/environment.js

# 一次性关闭或强制开启。
./opendesk -script examples/environment.js -color never
./opendesk -script examples/environment.js -color always
```

`agent` / `-output-format json` 属于机器协议，即使指定 `always` 也不会加入颜色。OpenDesk 只在最终
终端渲染时给前缀着色；`.runtime/runs/...` 内的 `stdout.log`、`stderr.log`、`events.ndjson` 和
JSON 摘要始终不写入系统生成的 ANSI 控制码。

### 类别覆盖

设置 `OPENDESK_CONSOLE_CATEGORIES` 后，它会替代该 mode 的默认类别。例如：

```dotenv
# 只显示脚本结果、完成摘要和错误。
OPENDESK_CONSOLE_MODE=normal
OPENDESK_CONSOLE_CATEGORIES=script,summary,error
```

类别只决定来源；是否显示 debug 级别仍由 mode 决定。因此需要脚本 debug 日志时，使用
`OPENDESK_CONSOLE_MODE=script` 或 `full`。

## 与 CLI 参数的关系

环境文件提供的是默认值，显式 CLI 参数始终覆盖它：

```bash
# .opendesk.env 中为 full，当前这次改为 normal。
./opendesk -script script.js -console-mode normal

# 一次性查看完整诊断；等效于本次使用 full，且不会改动文件。
./opendesk -script script.js -debug

# 一次性使用另一份项目配置。
./opendesk -env-file config/ci.env -script script.js
```

若同时设置 `-debug` 和显式 `-console-mode` 或 `-console-categories`，后两者更具体，优先
生效。

## 解析与安全边界

环境文件可使用空行、`#` 注释、`export KEY=value`、空值以及匹配的单/双引号值。键必须满足
`[A-Za-z_][A-Za-z0-9_]*`。OpenDesk 不执行 shell、不展开 `$VARIABLE` / `${VARIABLE}`，也不修改
父 shell；例如 `LITERAL=${OTHER}` 会保留为原字符串。歧义行、非法键、未闭合引号和 NUL 会明确失败。

每个合法键都会进入本地 `Execution.env`，但只有上表三个 `OPENDESK_CONSOLE_*` 键具有 CLI 配置
含义。环境值可能含有访问令牌，禁止整体打印 `Execution.env` 或无选择写入 artifact。

HTTP、MCP 和 Scheduler execution 默认获得空的 `Execution.env`，不会继承服务端进程环境，也不会
自动读取服务端工作目录中的 `.env`。这保证远程提交的脚本不能通过 Runtime 环境入口读取宿主秘密。
框架不再提供第二套 `System.getenv()`：环境属于一次 execution，统一从 `Execution.env` 读取才能
保持快照、子进程继承和远程隔离语义一致。
