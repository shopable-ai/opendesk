---
title: Environment Configuration
description: OpenDesk CLI 的项目级 .env、.opendesk.env、输出配置与优先级。
order: 15
---

# 环境配置（Environment Configuration）

OpenDesk 可在**命令启动的工作目录**读取项目级默认值。它适合把经常重复的 CLI 输出参数
固定下来，而不取代一次命令中的显式参数。

当前环境文件只配置终端输出；`OPENDESK_TIMEOUT`、`OPENDESK_STACK` 等通用变量尚未被
支持，不应假定存在“任意 flag 自动映射”。

## 快速开始

从仓库根目录复制模板：

```bash
cp .opendesk.env.example .opendesk.env
```

日常用户推荐保持默认的安静输出：

```dotenv
OPENDESK_CONSOLE_MODE=normal
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

最终值的优先级从低到高为：内建默认值 → `.env` → `.opendesk.env` → 已导出的
`OPENDESK_CONSOLE_*` shell 环境变量 → 显式 CLI 参数。

指定文件时，只读取该文件，不再探测默认文件：

```bash
./opendesk -env-file config/dev.env -script script.js
```

相对 `-env-file` 路径以命令启动工作目录为基准；不存在或包含无效 OpenDesk 设置的文件会在
脚本启动前报错并退出。

## 支持的参数

| 环境键 | 等价 CLI 默认值 | 可选值 | 说明 |
| --- | --- | --- | --- |
| `OPENDESK_CONSOLE_MODE` | `-console-mode <mode>` | `normal`、`script`、`full`、`meta`、`summary`、`quiet`、`agent` | 选择预设输出档位。 |
| `OPENDESK_CONSOLE_CATEGORIES` | `-console-categories <list>` | `framework`、`meta`、`script`、`summary`、`error` 的逗号列表 | 精确替代 mode 默认类别。 |

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

环境文件可使用空行、`#` 注释、`export KEY=value`、单/双引号值。OpenDesk 只读取两个
`OPENDESK_CONSOLE_*` 键；不会执行 shell、展开 `$VARIABLE`、修改父 shell 或导入其他
项目变量。未知键会被忽略，已知键使用不支持的 mode/category 则明确失败，避免静默回退。

这套配置只影响 OpenDesk CLI 的终端回显，不改变 JavaScript API、脚本业务结果、artifact
记录或 HTTP/MCP 调用契约。
