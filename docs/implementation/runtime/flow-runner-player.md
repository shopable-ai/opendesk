# Flow Runner Player 交互合同

OpenDesk 的产品组件是 **Flow Runner**，用户界面名称是“自动化”。生产入口为
`apps/opendesk/main.js`：它加载 `flow-runner/controller.js`、播放器和快捷键
装饰器，再加载 `flow-runner.js` 产品壳。`script-runner-v1/` 是 legacy / frozen
historical implementation，不参与当前产品。

## 主控与 Runnable Entry

固定主控顺序如下：

```text
[运行] [停止] [上一个流程] [当前流程] [下一个流程] [流程列表]
```

- 运行只运行当前 Runnable Entry；停止会取消当前运行和未开始的批量队列。
- 上一个/下一个只选择流程，不自动运行；首尾禁用，不循环。
- Entry 可以是 JavaScript `.js`/`.mjs`、Protected Package `.odpkg` 或 Installed
  Flow。只有实际 JavaScript 载荷及 Runtime `-script` 参数继续使用 script 术语。
- 显示名只剥离末尾 `.js`、`.mjs` 或 `.odpkg`；完整 entry key/path 保留为真实身份。
- 运行时禁用运行与当前流程的变更，停止可用，流程列表仍可查看。

## 流程列表

紧凑流程列表是临时 Panel，不取代完整管理器。

- 打开时从当前流程开始高亮；点击或 Enter 确认选择并隐藏，不运行。
- Escape 或交互组外点击只隐藏，不提交、不停止、不销毁；隐藏后复用 native
  句柄。关闭 Runner 才清理 Panel 与监听器。
- 运行时可浏览但不得改变选择；“管理流程”可进入完整管理器，完整管理器负责
  刷新、排序、批量选择与批量运行。
- 高亮、当前选择、批量选择和实际运行项必须分离，分别由
  `panelHighlightKey`、`selectedEntryKey`、`selectedEntryKeys` 与
  `activeRun.current` 表示。

刷新时保留仍存在的当前 entry；若被移除，按旧顺序优先选择下一个存活项、再选
前一个，最后才选择新集合第一项。合法空目录与读取错误必须区分；后者不得被当成
空列表或自动替换运行目标。

## 验证边界

Node 回归验证选择、Panel 生命周期和产品组合。真实 Runtime child-stop 验证使用
`tests/custom-ui/flow-runner-runtime.js`；原生交互、尺寸和截图证据见
`docs/quality/flow-runner-qualification.md`。Windows 没有真机时只能记录
cross-compile/package 结果，不得以其替代 live Runtime 或视觉验收。
