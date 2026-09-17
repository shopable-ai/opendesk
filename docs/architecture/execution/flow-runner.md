# Flow Runner

## 目标与边界

OpenDesk 的用户界面名称是“自动化”，其产品组件是 **Flow Runner**。它的入口和实现为：

```text
apps/opendesk/flow-runner.js
apps/opendesk/flow-runner/controller.js
apps/opendesk/flow-runner/player-controller.js
apps/opendesk/flow-runner/shortcut-controller.js
```

Recorder 是独立组件，用户显示名称保持为“操作录制器”；它不属于 Flow Runner 的别名或子模块。

## Runnable Entry

Flow Runner 的列表领域对象是 Runnable Entry，而不是 JavaScript 脚本列表。一个 entry 可以是：

| 类型 | 运行方式 |
| --- | --- |
| JavaScript `.js` / `.mjs` | 通过 Runtime 的 `-script` 参数启动 |
| Protected Package `.odpkg` | 通过 Runtime 的 `-script` 参数启动 |
| Installed Flow | 通过 Flow Catalog 的 `flow run <installId>` 启动 |

因此 JavaScript 文件路径、`scriptPath`、`script filename` 和 `-script` 都是准确的技术术语，不能为统一名称而改写。跨类型列表、选择、排序和显示使用 `entries`、`selectedEntryKey`、`runnableRoot` 等 Flow Runner 术语。

## 组件组合

`apps/opendesk/main.js` 按以下顺序组合 Flow Runner：

1. 加载通用 `OpenDeskFlowRunner` controller；
2. 加载播放器与快捷键装饰器；
3. 通过 `OpenDeskProductFlowRunner` 创建产品壳；
4. 将 `flowRunner` 注入 App Controller、Runtime Log、Developer Tools 和 Promotion owner；
5. 启动时调用 `flowRunner.launch()`。

主产品不会加载 `apps/opendesk/script-runner/` 或 `apps/opendesk/script-runner-simple.js`。

## 用户界面合同

主窗口标题与高频控件使用以下文案：

```text
自动化
流程列表
当前流程
选择流程
运行
停止
上一个流程
下一个流程
刷新
暂无可运行的流程
```

专门表示 JavaScript 文件的说明仍可称为 JavaScript、脚本文件、脚本目录或脚本路径。

## 配置与迁移兼容

Flow Runner 使用 `OPENDESK_FLOW_RUNNER_DIR` 指定外部 runnable root。为已安装产品保留读取 `OPENDESK_SCRIPT_RUNNER_DIR` 的 fallback；前者优先。新示例和新部署只使用 canonical 变量。

排序与选择继续保存在 runnable root 内的 `.opendesk-runner.json`，以避免升级时丢失已有用户状态。该文件是持久数据格式，不因产品改名而迁移或删除。

新运行日志写入：

```text
.runtime/flow-runner/runs/
```

Runtime Log 以只读方式发现旧 `.runtime/examples/custom-ui/script-runner-simple/runs/`，不会移动或删除已有运行证据。

内部产品错误码使用 `FLOW_RUNNER_*`。历史 `SCRIPT_RUNNER_*` 仅留在 frozen implementation、旧环境变量与旧运行证据读取兼容范围内。

## 验证

从仓库根目录运行：

```bash
node --test tests/custom-ui/flow-runner.test.js tests/custom-ui/product-flow-runner.test.js tests/custom-ui/flow-runner-player.test.js
```

真实 child Stop 生命周期验证：

```bash
./dist/opendesk -script tests/custom-ui/flow-runner-runtime.js -console-mode script -log-dir .runtime/tests/flow-runner/runtime-parent
```

该命令直接使用用户实际会复制的 Runtime 入口；原生窗口视觉验证另见 [Flow Runner Qualification](../../quality/flow-runner-qualification.md)。

## 历史实现

`apps/opendesk/script-runner-v1/` 是 **legacy / frozen historical implementation**。它不被当前产品加载、导入或执行，只作为版本历史参考保留。
