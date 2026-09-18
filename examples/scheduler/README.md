# Scheduler JavaScript examples

本目录同时保留普通 Scheduler payload 示例和 **当前 OpenDesk Desktop App Scheduler** 的真实调度验证示例。

真实产品验证不再要求启动第二个固定端口 HTTP Scheduler，也不要求把 API URL/token 填入环境变量。

## 前置条件

先运行当前 OpenDesk Desktop App。开发仓库中可以从仓库根目录启动：

```bash
./dist/opendesk -app apps/opendesk -console-mode script
```

发布版可以正常启动 OpenDesk Desktop App。下面的 CLI / Runtime examples 会发现当前 App 发布的动态 loopback endpoint，并通过私有 token 连接同一个 Scheduler。

如果没有 App、发现多个可达 App 实例，或当前 App 不是 Scheduler active owner，命令会明确失败，不会悄悄启动另一套服务。

## 推荐链路：add → verify → remove

### 1. 添加两条真实计划

CLI：

```bash
./dist/opendesk scheduler test add
```

Runtime example：

```bash
./dist/opendesk -script examples/scheduler/test-add.js -console-mode script
```

兼容入口也只执行同一个 add 行为：

```bash
./dist/opendesk -script examples/scheduler/schedule-two-notifications.js -console-mode script
```

默认从实际提交时间使用同一个时间基准创建：

- 文本提醒：15 秒后；
- 文件提醒：45 秒后。

两条都是真实 `at + misfire=skip` Job。add 命令返回 `batchId`、真实 `jobId` 和绝对计划时间后退出；它不会等待到期，也不会调用 **Run Now**。

自动合同测试允许显式缩短间隔：

```bash
./dist/opendesk scheduler test add --first-delay 2s --second-delay 5s
```

产品默认仍保持 15 / 45 秒。

### 2. 查询并验证

CLI：

```bash
./dist/opendesk scheduler test verify --batch latest --wait 60s --latency-tolerance 3s
```

Runtime example：

```bash
./dist/opendesk -script examples/scheduler/test-verify.js -console-mode script
```

verify 只查询当前 App Scheduler，不运行任务。它检查：

- 创建请求时间与服务端重新查询的持久化时间一致；
- 到期前不存在 Run；
- `scheduledAt` 等于预期时间；
- `startedAt >= scheduledAt`；
- 服务端 `triggerType === "scheduled"`；
- 两个 Job 拥有不同 Execution ID；
- 每个一次性 Job 正常验收期间只有一次自动 Run；
- 完成后没有下一次排期；
- stdout / artifact 与正确 Execution 关联；
- `ui.toast()` 的调用、返回和关闭结果被记录。

结构化报告位于产品数据目录：

```text
.runtime/scheduler-tests/<batchId>/report.json
```

这里的 `.runtime` 是 OpenDesk 产品数据根目录下的运行证据目录，不是仓库根目录要求提交的源码。

`verificationStatus: "passed"` 证明 Scheduler / Execution 客观合同通过；它**不自动证明 Native Toast 肉眼可见**。没有真实观察时 `nativeVisual` 和未验收平台保持 `NOT_RUN`。

### 3. 清理本轮测试

CLI：

```bash
./dist/opendesk scheduler test remove --batch latest
```

Runtime example：

```bash
./dist/opendesk -script examples/scheduler/test-remove.js -console-mode script
```

remove 只读取指定 batch 持久化的真实 job ID 并删除这些 Job，不按名称扫描，不清空用户数据库。

如果删除时某个 Execution 已经 running，返回结果会通过 `runningAtRemovalJobIds` 报告；删除只保证未来调度被移除，不能被表述为已停止正在运行的业务。

## UI 验证

计划中心中的“添加两条测试计划 / 清理本轮测试”复用与上面相同的批次逻辑。

建议实际验收时保持计划中心可见，观察：

1. add 后两条 Job 立即出现在列表，时间是未来绝对时间；
2. 第一条到期前没有 Run；
3. 到期后列表/历史从服务端更新，而不是倒计时本地推断；
4. 历史显示计划时间、实际开始、延迟、`scheduled` 触发方式、Execution ID 和真实结果；
5. 两条一次任务完成后显示已结束且无下一次排期；
6. 关闭计划中心、隐藏 Runner 不影响已创建计划到期执行。

Native Toast 是否实际可见必须单独肉眼/真实 UI 观察。日志、Execution success、`ui.toast()` 返回都不能替代这一项。

## 可信来源：JobRun.triggerType

[`notify-and-log.js`](notify-and-log.js) 仍可作为诊断 payload，但它不再根据 `Execution.source` 自己宣布“Scheduler 自动触发通过”。

自动/手动来源的事实源是 Scheduler 服务端的 JobRun：

```text
scheduled → 到期调度领取
manual    → Run Now
unknown   → 历史记录无法确认
```

因此手动运行同一个 payload 不能让真实调度验收通过。

## 普通管理 CLI

当前 App Scheduler 还支持薄管理命令：

```bash
./dist/opendesk scheduler list
./dist/opendesk scheduler create --name "测试" --at "2026-09-18T21:00:00+09:00" --script "example.js" --misfire skip
./dist/opendesk scheduler runs --job <jobId> --limit 20
./dist/opendesk scheduler delete --job <jobId>

# 启动产品 App，并以当前目录作为 Flow Runner 的可运行根。
OPENDESK_FLOW_RUNNER_DIR="$PWD" ./dist/opendesk -app apps/opendesk -scheduler-db ./.runtime/examples/scheduler/scheduler.db -console-mode script
```

完整合同见 `docs/api/scheduler-cli.md`。

## Headless API acceptance 仍是独立测试域

Headless HTTP Scheduler 仍用于 API/并发测试，但它不替代本页的 Desktop App 产品闭环。

例如现有 API smoke 可以继续使用隔离数据库和独立端口；它验证 HTTP 协议本身。Desktop App 的真实产品验收必须使用当前 App Scheduler，不能用 Headless owner 的成功替代。

Scheduler 多进程 ownership / takeover 测试仍可使用：

```bash
go run ./tests/scheduler/tools/multiruntime
go run -race ./tests/scheduler/tools/multiruntime
```

## 平台结果

- macOS 只有在 macOS 真机上真实完成 Native 验收后才能标 `PASS`；
- Windows 只有在 Windows 真机上真实完成 Native 验收后才能标 `PASS`；
- 没有执行时标 `NOT_RUN`；
- 环境、权限或设备阻塞时标 `BLOCKED`；
- 编译成功、mock、日志存在或其他平台结果不能替代目标平台 Native PASS。
