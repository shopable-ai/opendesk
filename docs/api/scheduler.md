---
title: Scheduler
description: OpenDesk 计划任务的用户工作流、真实调度验证、时间语义与 Execution 行为。
order: 520
docType: guide
---

# Scheduler

Scheduler 把普通 OpenDesk JavaScript 保存为持久计划，并在未来时间创建标准 Execution。它不是脚本内的 `sleep()` 或前端 timer：真正到期、领取、创建 Run 和 Execution 都由 Scheduler service 完成。

## 普通用户入口：计划中心

OpenDesk Desktop 普通用户优先从 **计划中心** 创建、查看和管理计划。

产品链路是：

```text
计划中心
→ 当前 App Scheduler
→ 到期领取
→ standard Execution
→ JavaScript Runtime
→ normal OpenDesk APIs
```

关闭计划中心窗口、刷新窗口、关闭后重开，或者隐藏 Runner，都不应停止已经由 App Scheduler 保存的计划。

计划中心不会在打开、刷新或重开时自动创建测试任务。测试任务只有在用户明确点击“添加两条测试计划”时创建。

## 创建普通计划

计划中心当前允许：

- 从已有可调度 `.js` 脚本下拉框选择；
- 继续编辑脚本路径；
- 浏览选择文件；
- 直接输入 JavaScript 脚本文本。

本轮不增加搜索框，也不建立第二套独立 Catalog 页面。

已有脚本下拉只承担“便于选择当前 Scheduler 能正确调度的对象”。已安装 Flow 仍必须经过 Flow 自己的受控执行链；不能通过直接选择 Flow 内部文件来绕过 Publisher Trust、Permission、Entitlement 或其他 Flow 运行边界。不支持调度的对象应明确不可用，而不是伪装成普通 `.js` 计划。

取消文件选择不会清空用户已经填写的路径。无论下拉选择还是手填路径，最终创建和实际执行前都继续由 Scheduler 做路径、普通文件、扩展名和 script root 边界校验。

## 真实调度测试

计划中心提供两个产品级测试操作：

- **添加两条测试计划**；
- **清理本轮测试**。

添加操作创建真实 Scheduler Job，不调用 Run Now，也不使用 payload sleep 模拟未来执行。

默认同一时间基准：

```text
文本提醒  → 15 秒后
文件提醒  → 45 秒后
```

两条任务都保存为绝对 `at` 时间并采用 `misfirePolicy=skip`。创建完成后客户端可以退出；只要当前 Desktop App Scheduler 仍在运行，到期执行由 Scheduler 自己完成。

每轮测试有自己的 `batchId`，并持久化两个真实 `jobId` 与计划时间。重复请求可使用同一 request ID 获得幂等语义；部分创建失败也保留已经拥有的 job ID，后续只按这些 ID 清理，不按名字扫描删除。

文件提醒使用 OpenDesk 为 Scheduler 测试保留的产品内受控文件位置。完全相同的测试文件可以复用；如果保留位置已经存在不同内容，OpenDesk 不会覆盖用户文件。

## 怎样判断定时设置真的生效

倒计时归零、日志出现、payload 自己说“我是 Scheduler”、或者手动点击 Run Now，都不能单独证明自动调度成功。

可信事实来自 Scheduler 服务端 JobRun：

| `triggerType` | 含义 |
| --- | --- |
| `scheduled` | 到期后由 Scheduler 自动领取创建 |
| `manual` | Run Now / 立即运行创建 |
| `unknown` | 历史记录无法证明来源 |

`triggerType` 由服务端写入，payload 无权声明。因此真实调度测试只接受 `triggerType=scheduled`。

完整验证至少核对：

- 创建请求的未来时间与重新查询得到的持久化时间一致；
- 第一条到期前，两条任务都没有运行记录；
- 自动 Run 的 `scheduledAt` 等于预期绝对时间；
- `startedAt` 不早于计划时间；
- `triggerType` 为 `scheduled`；
- 两条任务拥有不同 Execution ID；
- stdout 与 artifact 能关联到正确 job / Execution；
- 正常验收期间每条一次性任务只自动执行一次；
- 完成后没有下一次自动排期。

应用空闲、设备保持唤醒、系统时间没有调整时，产品验证默认把 **3 秒**作为启动延迟容差。超过容差要如实报告排队、系统调度或环境阻塞，不要把宽容差藏在 UI 倒计时里。

## 通知调用与 Native 可见是不同事实

测试 payload 使用当前 canonical `ui.toast()`。

需要区分三层结果：

```text
ui.toast() 调用/返回
≠ Execution 成功
≠ 用户真实看见 Native 通知
```

结构化验证可以证明 `ui.toast()` 已调用、返回、关闭，以及 Execution 是否成功；**Native 通知是否真实可见必须由目标平台的真实 UI 验收确认**。

没有执行目标平台 UI 验收时记录 `NOT_RUN`；由于环境或权限阻塞无法完成时记录 `BLOCKED`。不得用 mock、编译通过或日志存在替代 Native `PASS`。

## 计划中心里的运行信息

列表和运行历史应以服务端记录为准，展示或可检查：

- 计划时间；
- 实际开始时间；
- 启动延迟；
- 触发方式；
- Execution ID；
- 最终状态 / 错误。

界面可见时可以自动刷新倒计时和运行状态，但倒计时只是显示信息。到点后如果服务端尚未产生 Run，界面应继续显示等待服务端状态，而不是本地推断“已运行”。

一次性任务完成后应显示已结束及真实结果，不应统一显示成“用户暂停”。

## 暂停、删除与到期并发

- **暂停**：阻止未来自动调度；已经开始的 Execution 不会被强制取消。
- **恢复**：重新建立未来调度；`at + skip` 不会把已经过去的时间重新伪造成未来执行。
- **立即运行**：创建额外的 `manual` Run，不改写正常计划时间。
- **删除**：删除任务及未来调度；已经开始的 Execution 不会因此被伪报为停止。

如果在第二条测试任务到期前暂停或删除，应当不再产生未来自动执行；如果操作与 Scheduler 到期领取发生竞态，就以服务端最终 JobRun 状态为准，如实报告任务已经被领取、running 或已经完成。

## 时间类型

### 一次 at

指定一个绝对时间点。协议层接受 RFC3339 或按 `timezone` 解释的本地时间。一次任务完成后不再产生下一次自动运行。

### 固定间隔 every

使用 duration，例如 `30m`、`2h`。`every` 是 fixed-delay：一次执行结束后，再等待完整 interval。

### Cron

使用 Linux 五字段 cron：

```text
分钟 小时 日 月 星期
```

当前不把带秒的六字段 Quartz 表达式当成同一种格式。

## Misfire

| 策略 | 行为 |
| --- | --- |
| `run_once` | 恢复后最多补执行一次，不重放所有错过间隔 |
| `skip` | 跳过已经错过的发生点并计算未来时间；过期一次任务停用 |

`run_once` 不等于业务 exactly-once。需要跨崩溃防重复副作用的业务脚本仍应有自己的幂等键或业务 postcondition。

## CLI 与 Runtime examples

当前 Desktop App Scheduler 可以通过薄 CLI 管理，而不要求手工复制动态 endpoint/token：

```bash
./dist/opendesk scheduler list
./dist/opendesk scheduler create ...
./dist/opendesk scheduler runs --job <jobId>
./dist/opendesk scheduler delete --job <jobId>
```

真实两任务测试：

```bash
./dist/opendesk scheduler test add
./dist/opendesk scheduler test verify --batch latest --wait 60s
./dist/opendesk scheduler test remove --batch latest
```

CLI 完整参数、JSON 输出、错误码和实例发现语义见 [Scheduler CLI](scheduler-cli.md)。

同一批次实现也由 [`examples/scheduler/README.md`](../../examples/scheduler/README.md) 中的 Runtime examples 复用；UI、CLI、examples 不维护三套不同的测试判定逻辑。

## Headless / 开发入口

独立 Headless 开发仍可以使用：

```bash
./opendesk -http -ui -port 60844
```

本地管理页：

```text
http://127.0.0.1:60844/scheduler
```

这是开发/本机集成入口，不是 Desktop 产品测试时应该偷偷启动的第二个 Scheduler owner。HTTP 字段与 transport contract 见 [Scheduler HTTP API](scheduler-api.md)。

## 文档职责

| 需求 | 文档 |
| --- | --- |
| 普通用户工作流、计划中心、真实调度测试语义 | 本页 |
| Desktop App Scheduler CLI | [Scheduler CLI](scheduler-cli.md) |
| HTTP endpoint、Job / JobRun 字段与 triggerType | [Scheduler HTTP API](scheduler-api.md) |
| ownership、SQLite/WAL、takeover/recovery | [Scheduler Runtime Concurrency](../architecture/scheduler-runtime-concurrency.md) |
| Execution 生命周期与 evidence | [Execution Context](execution.md) |

内部数据库 schema、锁文件和迁移实现不属于本用户 Guide 的事实源。
