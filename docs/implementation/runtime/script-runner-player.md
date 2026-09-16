# Script Runner Player 交互合同

## 目标

官方 OpenDesk Script Runner 的高频操作采用紧凑播放器模型；原完整脚本管理窗口继续承担排序、批量选择、批量执行、恢复排序、刷新和目录管理等低频能力。

生产入口为 `apps/opendesk/main.js`。它先加载 `apps/opendesk/script-runner/controller.js`，再使用 `apps/opendesk/script-runner/player-controller.js` 装饰 controller，最后加载 `apps/opendesk/script-runner-simple.js` 的产品壳。历史冻结副本 `apps/opendesk/script-runner-v1/` 不参与当前实现。

## Runner 主控

固定顺序：

```text
[运行] [停止] [上一个] [当前脚本] [下一个] [列表]
```

语义：

- `运行`：只运行当前脚本。
- `停止`：停止当前执行并取消剩余批量队列。
- `上一个 / 下一个`：只改变当前脚本，不运行；到首项/末项即禁用，不循环。
- 当前脚本显示只剥离文件名末尾 `.js`；例如 `report.v2.js` 显示为 `report.v2`。真实身份始终保留完整脚本名/path。
- 主控不显示 `3/12` 之类的队列序号，也不显示下拉箭头。
- 运行期间主控标题显示实际正在执行的脚本，而不是之后被选择的脚本。
- 运行期间 `运行 / 上一个 / 下一个` 禁用，`停止`启用，`列表`仍可打开和关闭。

## List Panel

`列表`打开的是临时 List Panel，不替代完整管理窗口。

Panel：

- 靠近 Runner 打开；初始优先位于 Runner 上方，并随 Runner move 事件重定位。
- 单击脚本只更新当前脚本，不执行，Panel 保持打开。
- 双击与单击同义，不提供任何隐式运行。
- 当前脚本与键盘高亮是两个状态；批量勾选继续由完整管理器独立维护。
- HTML `select` 承担键盘高亮：`Up / Down` 只改变高亮，`Enter` 才提交为当前脚本，且不执行、不关闭 Panel。
- `Tab` 使用正常浏览器/系统焦点顺序。
- `Esc` 的产品语义是只关闭/隐藏 Panel，不停止任务、不关闭 Runner。
- Panel 提供 `刷新`、`打开目录`、`管理脚本…`。进入目录或完整管理器前先收起 Panel。

运行期间：

- Panel 可打开、滚动、关闭。
- 脚本选择、Enter 提交、刷新等会改变当前脚本/集合的操作全部禁用。
- `管理脚本…` 可以进入完整管理器；完整管理器自身继续负责运行期禁用排序、刷新和批量选择变更。

## 状态身份

以下状态必须始终分离：

1. 当前脚本 `selectedScriptName`；
2. Panel 键盘高亮 `panelHighlightKey`；
3. 完整管理器批量勾选 `selectedNames`；
4. 实际正在执行的脚本 `activeRun.current`。

任何 UI 展示或 callback 都不得把这四个状态合并为同一个索引或字符串。

## Refresh / 删除后的确定性修复

刷新前保存旧有序集合与当前脚本。刷新成功后：

1. 当前脚本仍存在：保持不变；
2. 当前脚本被删除：优先选择旧顺序中位于其后的第一个仍存在脚本；
3. 若后方没有：选择旧顺序中最近的前方存活脚本；
4. 若旧顺序都无存活项：选择新集合第一项；
5. 新集合为空：当前脚本为 `null`。

读取失败与合法空目录必须区分。读取失败时 Run 必须禁用，不得把未知集合解释为空集合并替用户选择别的脚本。

## Run 目标缺失

点击 Run 后仍由正式 controller 在执行前检查真实文件。当前脚本文件已经不存在时返回明确失败；禁止自动替换为下一项、第一项或任何其他脚本。

## Panel 生命周期

Panel 生命周期至少区分：

```text
uncreated → creating → hidden → visible → destroyed
```

要求：

- 每个 Runner 同时最多一个 Panel；
- create 使用 single-flight；
- 快速连续开/关时，最终可见状态服从最新 intent；
- stale create 完成后不得自行弹出；
- hide 后复用同一句柄；
- native 句柄销毁后，下次打开重新创建；
- Runner 关闭时清理 Panel，并终止 base controller 生命周期；
- show/hide 不创建第二份脚本状态或第二套执行 runtime。

## 完整管理器

原 `controller.js` 的完整管理窗口保持有效：

- 排序与保存顺序；
- 批量勾选；
- 单行运行；
- 批量运行；
- Stop；
- Refresh；
- Open Directory；
- Restore Order。

Player 是高频入口层，不复制这些业务实现。

## 跨平台与真机边界

Player 只依赖公开 CustomUI/FloatingWindow 能力和现有 controller，不新增第二套脚本执行器。

当前源码已经为 Panel 的键盘提交保留 `data-opendesk-dialog-default`，并保留 `panelKeyEscape` / `panelBlur` bridge sink。最终发布前仍必须在 macOS 与 Windows 真机验证：

- Escape 是否按产品语义只收起 Panel；
- 点击桌面、其他应用、无关 OpenDesk 窗口后是否收起 Panel且不抢回焦点；
- Runner 内部点击是否不会误收起；
- 跨显示器与缩放下 Panel 是否保持在对应 work area 内。

这些项目不得用 Node mock 代替真实 native 证据。
