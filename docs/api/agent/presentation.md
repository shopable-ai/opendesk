---
docType: index
---

# OpenDesk 界面与交互

提示、确认、自定义窗口、工具栏和 App Mode 生命周期

从 [Agent 短入口](README.md) 按任务进入本组；不顺序通读其他组。下表由唯一 Reference/类型确定性生成，不是另一份行为合同。

`node scripts/api-docs.js read <文档名> <方法名>` 返回正文及必要共享段；只读文档，不调用方法。类型中的公开声明不等于当前宿主已授权/已实现。摘要中的省略不用于执行决策。


## Custom UI

小写 ui 不是外部 UI；平台/host/授权和句柄生命周期按正文。

来源：[ui.md](../ui.md)。

| 精确方法；主要输入 → 输出（签名） | 解决的问题 | 副作用；适用限制 | 契约获取 |
| --- | --- | --- | --- |
| `control.getState(): Promise<ControlState>` | 读取控件的实际状态。 无。 包含 id、type、值/checked/active/disabled/busy/error、localBounds/screenBound…（摘要） | 依方法：呈现/交互/资源；不得视为纯查询；继承本节限制 | [ControlHandle.getState](../ui.md#controlhandlegetstate)；`read ui ControlHandle.getState` |
| `control.on(type: EventType \| '*', listener: UIEventListener): () => void` | 监听当前控件事件。 事件类型与 listener。 取消订阅函数。 只接收该控件关联事件。 | 等待/订阅；回调副作用由调用方决定，须清理；继承本节限制 | [ControlHandle.on](../ui.md#controlhandleontype-listener)；`read ui ControlHandle.on` |
| `control.update(patch: ControlPatch): Promise<ControlState>` | 更新允许的非结构控件状态。 按控件类型允许 `text`、内置 `icon`、`active`、`busy`、`error`、`value`、`checked`、`dis…（摘要） | 有：输入/应用或系统状态改变；继承本节限制 | [ControlHandle.update](../ui.md#controlhandleupdatepatch)；`read ui ControlHandle.update` |
| `new FloatingWindow(options?: FloatingWindowOptions): FloatingWindow` | 创建 compact typed native toolbar；只有当前 execution 已授权 UI 时可用。 核心选项： `FloatingWindow` 实例。…（摘要） | 需核对正文；不能假定无副作用；继承本节限制 | [FloatingWindow](../ui.md#new-floatingwindowoptions)；`read ui FloatingWindow` |
| `FloatingWindow.addButton(id: string, label: string, icon: ClawdeskFloatingIconSource, callback?: ClawdeskFloatingButtonCallback): void;` | 显示前增加 icon-only native Button。 `id` 稳定且唯一；`label` 同时是 tooltip 和 Accessibility name。`i…（摘要） | 依方法：呈现/交互/资源；不得视为纯查询；继承本节限制 | [FloatingWindow.addButton](../ui.md#floatingwindowaddbuttonid-label-icon-callback)；`read ui FloatingWindow.addButton` |
| `FloatingWindow.addCheckbox(id: string, label: string, options?: ClawdeskFloatingToggleOptions, callback?: ClawdeskFloatingToggleCallback): void;` | 增加独立选择 Checkbox。 `value` 默认 false；Checkbox 之间不自动互斥。 `undefined`。 互斥选择请使用 `addSegmente…（摘要） | 依方法：呈现/交互/资源；不得视为纯查询；继承本节限制 | [FloatingWindow.addCheckbox](../ui.md#floatingwindowaddcheckboxid-label-options-callback)；`read ui FloatingWindow.addCheckbox` |
| `FloatingWindow.addInput(id: string, label: string, options?: ClawdeskFloatingInputOptions, callback?: ClawdeskFloatingInputCallback): void;` | 增加单行原生输入。 `maxLength` 默认 256；width 默认 180。Input 不支持 autofocus。 `undefined`。 `show()` …（摘要） | 依方法：呈现/交互/资源；不得视为纯查询；继承本节限制 | [FloatingWindow.addInput](../ui.md#floatingwindowaddinputid-label-options-callback)；`read ui FloatingWindow.addInput` |
| `FloatingWindow.addLabel(id: string, text: string, options?: ClawdeskFloatingLabelOptions): void;` | 显示前增加固定宽度 native status text。 宽度默认 120、范围 48–240；固定 40pt 高。 `undefined`。 显示后可更新文字/对齐/…（摘要） | 依方法：呈现/交互/资源；不得视为纯查询；继承本节限制 | [FloatingWindow.addLabel](../ui.md#floatingwindowaddlabelid-text-options)；`read ui FloatingWindow.addLabel` |
| `FloatingWindow.addProgress(id: string, label: string, options?: ClawdeskFloatingProgressOptions): void;` | 增加 determinate 或 indeterminate Progress。 默认 `min:0,max:1,value:min`；width 默认 160。 `un…（摘要） | 依方法：呈现/交互/资源；不得视为纯查询；继承本节限制 | [FloatingWindow.addProgress](../ui.md#floatingwindowaddprogressid-label-options)；`read ui FloatingWindow.addProgress` |
| `FloatingWindow.addSegmentedControl(id: string, label: string, options: ClawdeskFloatingChoiceOptions, callback?: ClawdeskFloatingChoiceCallback): void;` | 增加 first-class 互斥选择组。 与 Select 相同的 2–12 个唯一 options。 `undefined`。 native Accessibilit…（摘要） | 依方法：呈现/交互/资源；不得视为纯查询；继承本节限制 | [FloatingWindow.addSegmentedControl](../ui.md#floatingwindowaddsegmentedcontrolid-label-options-callback)；`read ui FloatingWindow.addSegmentedControl` |
| `FloatingWindow.addSelect(id: string, label: string, options: ClawdeskFloatingChoiceOptions, callback?: ClawdeskFloatingChoiceCallback): void;` | 增加固定 options 单选 Select。 `options` 为 2–12 个唯一 `{value,label}`；value 默认首项。 `undefined`。…（摘要） | 依方法：呈现/交互/资源；不得视为纯查询；继承本节限制 | [FloatingWindow.addSelect](../ui.md#floatingwindowaddselectid-label-options-callback)；`read ui FloatingWindow.addSelect` |
| `FloatingWindow.addSeparator(id: string): void;` | 显示前在相邻内容组之间增加 native divider。 唯一 item id。 `undefined`。 不能位于首尾、不能连续；没有 callback、focus …（摘要） | 依方法：呈现/交互/资源；不得视为纯查询；继承本节限制 | [FloatingWindow.addSeparator](../ui.md#floatingwindowaddseparatorid)；`read ui FloatingWindow.addSeparator` |
| `FloatingWindow.addSlider(id: string, label: string, options?: ClawdeskFloatingSliderOptions, callback?: ClawdeskFloatingSliderCallback): void;` | 增加按 step 吸附的有界数值 Slider。 默认 `min:0,max:100,step:1`；value 必须位于范围内。 `undefined`。 范围/ste…（摘要） | 依方法：呈现/交互/资源；不得视为纯查询；继承本节限制 | [FloatingWindow.addSlider](../ui.md#floatingwindowaddsliderid-label-options-callback)；`read ui FloatingWindow.addSlider` |
| `FloatingWindow.addSpacer(id: string): void;` | 显示前增加固定标准 group gap，不是 flexible space。 唯一 item id。 `undefined`。 与 Separator 一样只能位于两个 …（摘要） | 依方法：呈现/交互/资源；不得视为纯查询；继承本节限制 | [FloatingWindow.addSpacer](../ui.md#floatingwindowaddspacerid)；`read ui FloatingWindow.addSpacer` |
| `FloatingWindow.addSwitch(id: string, label: string, options?: ClawdeskFloatingToggleOptions, callback?: ClawdeskFloatingToggleCallback): void;` | 增加立即生效的 boolean Switch。 `value` 默认 false；`width` 默认 140，48–79 为紧凑 tooltip-only 可见标签模式…（摘要） | 依方法：呈现/交互/资源；不得视为纯查询；继承本节限制 | [FloatingWindow.addSwitch](../ui.md#floatingwindowaddswitchid-label-options-callback)；`read ui FloatingWindow.addSwitch` |
| `FloatingWindow.close(): Promise<ClawdeskUIWindowState \| null>;` | 关闭 toolbar 并释放 native 资源。 无。 关闭状态或兼容 null。 终结后不可继续修改。 | 依方法：呈现/交互/资源；不得视为纯查询；继承本节限制 | [FloatingWindow.close](../ui.md#floatingwindowclose)；`read ui FloatingWindow.close` |
| `FloatingWindow.getButtonState(id: string): Promise<ClawdeskFloatingButtonState>;` | 读取 Button 逻辑/native/Accessibility/bounds 状态。 Button id。 包含 label/icon/active/disabled…（摘要） | 依方法：呈现/交互/资源；不得视为纯查询；继承本节限制 | [FloatingWindow.getButtonState](../ui.md#floatingwindowgetbuttonstateid)；`read ui FloatingWindow.getButtonState` |
| `FloatingWindow.getControlState(id: string): Promise<ClawdeskFloatingControlState>;` | 读取 typed control 的 value/native/Accessibility/bounds 状态。 control id。 根据 `type` 返回 tog…（摘要） | 依方法：呈现/交互/资源；不得视为纯查询；继承本节限制 | [FloatingWindow.getControlState](../ui.md#floatingwindowgetcontrolstateid)；`read ui FloatingWindow.getControlState` |
| `FloatingWindow.getLabelState(id: string): Promise<ClawdeskFloatingLabelState>;` | 读取 Label native 布局与 Accessibility 状态。 Label id。 包含完整 text、alignment、tone、truncated、re…（摘要） | 依方法：呈现/交互/资源；不得视为纯查询；继承本节限制 | [FloatingWindow.getLabelState](../ui.md#floatingwindowgetlabelstateid)；`read ui FloatingWindow.getLabelState` |
| `FloatingWindow.getState(): Promise<ClawdeskUIWindowState>;` | 读取共享 WindowState；首次 show 前可返回完整声明的 hidden state。 无。 当前状态。 host-only identity/bounds 在…（摘要） | 依方法：呈现/交互/资源；不得视为纯查询；继承本节限制 | [FloatingWindow.getState](../ui.md#floatingwindowgetstate)；`read ui FloatingWindow.getState` |
| `FloatingWindow.hide(): Promise<ClawdeskUIWindowState \| null>;` | 隐藏 toolbar，但不终止实例。 无。 隐藏状态或兼容 null。 之后可以再次 show。 | 依方法：呈现/交互/资源；不得视为纯查询；继承本节限制 | [FloatingWindow.hide](../ui.md#floatingwindowhide)；`read ui FloatingWindow.hide` |
| `FloatingWindow.id: string;` | FloatingWindow.id；所属能力：小写 ui 不是外部 UI；平台/host/授权和句柄生命周期按正文。 | 依方法：呈现/交互/资源；不得视为纯查询；继承本节限制 | [FloatingWindow.id](../ui.md)；`read ui FloatingWindow.id` **正文缺口：禁止据类型直接生成调用** |
| `FloatingWindow.on(type: ClawdeskFloatingLifecycleEventType, listener: ClawdeskUIEventListener): ClawdeskUIUnsubscribe;` | 监听 toolbar 的 `move` / `close` 生命周期。 生命周期类型和 listener。 取消订阅函数。 Button activation 仍由 ad…（摘要） | 等待/订阅；回调副作用由调用方决定，须清理；继承本节限制 | [FloatingWindow.on](../ui.md#floatingwindowontype-listener)；`read ui FloatingWindow.on` |
| `FloatingWindow.onButtonClick(buttonID: string, callback: ClawdeskFloatingButtonCallback): void;` | 为已声明 Button 绑定或替换 callback。 Button id 与 callback。 `undefined`。 callback 在所属 EventLoop…（摘要） | 依方法：呈现/交互/资源；不得视为纯查询；继承本节限制 | [FloatingWindow.onButtonClick](../ui.md#floatingwindowonbuttonclickbuttonid-callback)；`read ui FloatingWindow.onButtonClick` |
| `FloatingWindow.onControlChange(controlID: string, callback: ClawdeskFloatingControlCallback): void;` | 为交互 control 绑定或替换 callback。 control id 与 callback。 `undefined`。 Input 发 `input`；其余可交互…（摘要） | 依方法：呈现/交互/资源；不得视为纯查询；继承本节限制 | [FloatingWindow.onControlChange](../ui.md#floatingwindowoncontrolchangecontrolid-callback)；`read ui FloatingWindow.onControlChange` |
| `FloatingWindow.onError(callback: (error: ClawdeskUIError) => unknown \| Promise<unknown>): void;` | 接收 toolbar callback failure。 error callback。 `undefined`。 用于显式处理 `UI_CALLBACK_FAILED`…（摘要） | 依方法：呈现/交互/资源；不得视为纯查询；继承本节限制 | [FloatingWindow.onError](../ui.md#floatingwindowonerrorcallback)；`read ui FloatingWindow.onError` |
| `FloatingWindow.removeButton(id: string): void;` | 首次 show 前删除 Button 及需要清理的相邻结构边界。 Button id。 `undefined`。 show 后返回 `INVALID_STATE`；不存在…（摘要） | 依方法：呈现/交互/资源；不得视为纯查询；继承本节限制 | [FloatingWindow.removeButton](../ui.md#floatingwindowremovebuttonid)；`read ui FloatingWindow.removeButton` |
| `FloatingWindow.removeControl(id: string): void;` | 首次 show 前删除 Switch/Checkbox/Input/Select/Slider/SegmentedControl/Progress。 control id…（摘要） | 依方法：呈现/交互/资源；不得视为纯查询；继承本节限制 | [FloatingWindow.removeControl](../ui.md#floatingwindowremovecontrolid)；`read ui FloatingWindow.removeControl` |
| `FloatingWindow.removeLabel(id: string): void;` | 首次 show 前删除 Label。 Label id。 `undefined`。 遵循与 removeButton 相同的生命周期限制。 | 依方法：呈现/交互/资源；不得视为纯查询；继承本节限制 | [FloatingWindow.removeLabel](../ui.md#floatingwindowremovelabelid)；`read ui FloatingWindow.removeLabel` |
| `FloatingWindow.run(): Promise<ClawdeskUIWindowState>;` | 无。 与 `waitUntilClosed()` 相同。 没有独立 run loop，也不会创建第二个 Runtime。 | 依方法：呈现/交互/资源；不得视为纯查询；继承本节限制 | [FloatingWindow.run](../ui.md#floatingwindowrun)；`read ui FloatingWindow.run` |
| `FloatingWindow.setAlwaysOnTop(alwaysOnTop: boolean): Promise<boolean \| ClawdeskUIWindowState>;` | 切换 native window level。 boolean。 兼容返回形状由当前类型声明约束。 不改变业务状态。 | 依方法：呈现/交互/资源；不得视为纯查询；继承本节限制 | [FloatingWindow.setAlwaysOnTop](../ui.md#floatingwindowsetalwaysontopalwaysontop)；`read ui FloatingWindow.setAlwaysOnTop` |
| `FloatingWindow.setDraggable(enabled: boolean): Promise<ClawdeskUIWindowState>;` | 运行时切换 native dragging。 boolean。 host readback。 不重新创建 toolbar。 | 依方法：呈现/交互/资源；不得视为纯查询；继承本节限制 | [FloatingWindow.setDraggable](../ui.md#floatingwindowsetdraggableenabled)；`read ui FloatingWindow.setDraggable` |
| `FloatingWindow.setPlacement(placement: ClawdeskUIWindowPlacement): Promise<ClawdeskUIWindowPlacement \| ClawdeskUIWindowState>;` | 按显示器 work area 重新锚定 toolbar。 left/center/right × top/center/bottom，可选 margin/display。…（摘要） | 依方法：呈现/交互/资源；不得视为纯查询；继承本节限制 | [FloatingWindow.setPlacement](../ui.md#floatingwindowsetplacementplacement)；`read ui FloatingWindow.setPlacement` |
| `FloatingWindow.setPosition(x: number, y: number): Promise<ClawdeskUIBounds \| ClawdeskUIWindowState>;` | 按 absolute logical coordinate 移动 toolbar。 有限 number。 兼容返回形状由现有类型声明约束。 成功后当前位置成为 absol…（摘要） | 依方法：呈现/交互/资源；不得视为纯查询；继承本节限制 | [FloatingWindow.setPosition](../ui.md#floatingwindowsetpositionx-y)；`read ui FloatingWindow.setPosition` |
| `FloatingWindow.show(): Promise<ClawdeskUIWindowState>;` | 创建或显示 native toolbar。 无。 显示后的共享 `WindowState`。 首次 show 前必须至少有一个 content item，且结构边界闭合合…（摘要） | 依方法：呈现/交互/资源；不得视为纯查询；继承本节限制 | [FloatingWindow.show](../ui.md#floatingwindowshow)；`read ui FloatingWindow.show` |
| `FloatingWindow.updateButton(id: string, patch: ClawdeskFloatingButtonPatch): Promise<ClawdeskFloatingButtonState>;` | 更新 Button 的非结构状态。 `active` 是持久业务状态，不是 pressed；普通一次性动作通常保持 false。badge string 为 1–4 Un…（摘要） | 有：输入/应用或系统状态改变；继承本节限制 | [FloatingWindow.updateButton](../ui.md#floatingwindowupdatebuttonid-patch)；`read ui FloatingWindow.updateButton` |
| `FloatingWindow.updateControl(id: string, patch: ClawdeskFloatingControlPatch): Promise<ClawdeskFloatingControlState>;` | 按 control kind 更新允许的运行时字段。 Toggle: `checked/disabled`；Input: `value/placeholder/disab…（摘要） | 有：输入/应用或系统状态改变；继承本节限制 | [FloatingWindow.updateControl](../ui.md#floatingwindowupdatecontrolid-patch)；`read ui FloatingWindow.updateControl` |
| `FloatingWindow.updateLabel(id: string, patch: ClawdeskFloatingLabelPatch): Promise<ClawdeskFloatingLabelState>;` | 更新 Label text/alignment/verticalAlignment/tone。 至少一个可更新字段；width 不可更新。 native readback…（摘要） | 有：输入/应用或系统状态改变；继承本节限制 | [FloatingWindow.updateLabel](../ui.md#floatingwindowupdatelabelid-patch)；`read ui FloatingWindow.updateLabel` |
| `FloatingWindow.waitUntilClosed(): Promise<ClawdeskUIWindowState>;` | 等待 toolbar 关闭并保持当前 execution 的这段异步工作存活。 无。 关闭终态。 推荐的生命周期等待方法。 | 依方法：呈现/交互/资源；不得视为纯查询；继承本节限制 | [FloatingWindow.waitUntilClosed](../ui.md#floatingwindowwaituntilclosed)；`read ui FloatingWindow.waitUntilClosed` |
| `toast.close(): Promise<WindowState>` | 幂等关闭 Toast，不取消业务任务。 无。 关闭后的 `WindowState`。 与 timeout/用户关闭竞争时返回最终状态；真实 driver 故障仍明确报错。 | 依方法：呈现/交互/资源；不得视为纯查询；继承本节限制 | [ToastHandle.close](../ui.md#toasthandleclose)；`read ui ToastHandle.close` |
| `toast.getState(): Promise<WindowState>` | 读取当前 Toast 与 native 窗口状态。 无。 `WindowState`；首选读取 `state.toast`。`state.notification` 是 …（摘要） | 依方法：呈现/交互/资源；不得视为纯查询；继承本节限制 | [ToastHandle.getState](../ui.md#toasthandlegetstate)；`read ui ToastHandle.getState` |
| `toast.update(patch: Partial<ToastOptions>): Promise<{ applied: boolean; reason?: 'closed'; state: WindowState; }>` | 原位更新 Toast，不创建第二个提示。 `patch` 至少包含一个受支持字段。`progress` 与 `position` 完整替换，不深层 merge；`prog…（摘要） | 有：输入/应用或系统状态改变；继承本节限制 | [ToastHandle.update](../ui.md#toasthandleupdatepatch)；`read ui ToastHandle.update` |
| `toast.waitUntilClosed(): Promise<WindowState>` | 显式等待 Toast 被脚本、用户或 timeout 关闭。 无。 关闭终态；execution 被取消时拒绝并清理资源。 只有明确观察这个 Promise 才让该等待参…（摘要） | 依方法：呈现/交互/资源；不得视为纯查询；继承本节限制 | [ToastHandle.waitUntilClosed](../ui.md#toasthandlewaituntilclosed)；`read ui ToastHandle.waitUntilClosed` |
| `window.close(): Promise<WindowState>` | 终止窗口并释放其资源。 无。 关闭终态。 关闭后原 WindowHandle/ControlHandle 不再可用于重新显示或更新；同 execution 的 windo…（摘要） | 依方法：呈现/交互/资源；不得视为纯查询；继承本节限制 | [WindowHandle.close](../ui.md#windowhandleclose)；`read ui WindowHandle.close` |
| `window.control(id: string): ControlHandle` | 获取一个稳定控件句柄。 `id` 为公开控件 id。 `ControlHandle`。 未知 id 返回 `NOT_FOUND`。 | 依方法：呈现/交互/资源；不得视为纯查询；继承本节限制 | [WindowHandle.control](../ui.md#windowhandlecontrolid)；`read ui WindowHandle.control` |
| `window.controls(): Array<{id:string; type:string; order:number}>` | 返回创建时解析出的公开控件稳定顺序。 无。 控件描述数组。 不暴露 `<style>` / `<meta>` / `<option>` 等内部节点。 | 依方法：呈现/交互/资源；不得视为纯查询；继承本节限制 | [WindowHandle.controls](../ui.md#windowhandlecontrols)；`read ui WindowHandle.controls` |
| `window.getState(): Promise<WindowState>` | 读取当前窗口状态。 无。 `WindowState`。 返回 host 已确认状态，不把声明值伪装成 native readback。 | 依方法：呈现/交互/资源；不得视为纯查询；继承本节限制 | [WindowHandle.getState](../ui.md#windowhandlegetstate)；`read ui WindowHandle.getState` |
| `window.hide(): Promise<WindowState>` | 暂时隐藏窗口，可用同一句柄再次 `show()`。 无。 隐藏后的状态。 `hide()` 不是终止；与 `close()` 语义不同。 | 依方法：呈现/交互/资源；不得视为纯查询；继承本节限制 | [WindowHandle.hide](../ui.md#windowhandlehide)；`read ui WindowHandle.hide` |
| `window.on(type: EventType \| '*', listener: UIEventListener): () => void` | 监听本窗口事件。 公开事件类型与 listener。 取消订阅函数。 只接收本窗口事件。 | 等待/订阅；回调副作用由调用方决定，须清理；继承本节限制 | [WindowHandle.on](../ui.md#windowhandleontype-listener)；`read ui WindowHandle.on` |
| `window.setAlwaysOnTop(enabled: boolean): Promise<WindowState>` | 更新 native 置顶状态。 `enabled` boolean。 host readback。 只影响当前窗口层级。 | 依方法：呈现/交互/资源；不得视为纯查询；继承本节限制 | [WindowHandle.setAlwaysOnTop](../ui.md#windowhandlesetalwaysontopenabled)；`read ui WindowHandle.setAlwaysOnTop` |
| `window.setBounds(bounds: {x:number; y:number; width:number; height:number}): Promise<WindowState>` | 同时设置窗口位置和尺寸。 宽高必须为正，坐标使用 OpenDesk logical desktop coordinate space。 应用后的状态。 失败不伪装成成功；…（摘要） | 依方法：呈现/交互/资源；不得视为纯查询；继承本节限制 | [WindowHandle.setBounds](../ui.md#windowhandlesetboundsbounds)；`read ui WindowHandle.setBounds` |
| `window.setDraggable(enabled: boolean): Promise<WindowState>` | 运行时切换声明的 native dragging 行为。 `enabled` boolean。 host readback。 HTML 中只有允许的 `data-claw…（摘要） | 依方法：呈现/交互/资源；不得视为纯查询；继承本节限制 | [WindowHandle.setDraggable](../ui.md#windowhandlesetdraggableenabled)；`read ui WindowHandle.setDraggable` |
| `window.setPlacement({horizontal, vertical, margin?, display?}): Promise<WindowState>` | 按目标显示器 work area 重新停靠窗口。 `horizontal`: left/center/right；`vertical`: top/center/botto…（摘要） | 依方法：呈现/交互/资源；不得视为纯查询；继承本节限制 | [WindowHandle.setPlacement](../ui.md#windowhandlesetplacementplacement)；`read ui WindowHandle.setPlacement` |
| `window.setPosition(x: number, y: number): Promise<WindowState>` | 移动窗口而不改变尺寸。 `x`、`y` 为有限 logical coordinates。 应用后的状态。 一次明确移动，不建立持续 anchor constraint。 | 依方法：呈现/交互/资源；不得视为纯查询；继承本节限制 | [WindowHandle.setPosition](../ui.md#windowhandlesetpositionx-y)；`read ui WindowHandle.setPosition` |
| `window.setRelativeTo(anchor: Bounds, options: {preferredSides: Array<'above'\|'below'\|'left'\|'right'>, align?: 'start'\|'center'\|'end', gap?: number}): Promise<WindowState>` | 把窗口放在当前控件或其他已核验 surface 的真实 logical bounds 附近。 `anchor` 为正 finite logical desktop bou…（摘要） | 依方法：呈现/交互/资源；不得视为纯查询；继承本节限制 | [WindowHandle.setRelativeTo](../ui.md#windowhandlesetrelativetoanchor-options)；`read ui WindowHandle.setRelativeTo` |
| `window.setSize(width: number, height: number): Promise<WindowState>` | 改变窗口尺寸。 正有限 number。 应用后的状态。 不隐式恢复先前 anchor。 | 依方法：呈现/交互/资源；不得视为纯查询；继承本节限制 | [WindowHandle.setSize](../ui.md#windowhandlesetsizewidth-height)；`read ui WindowHandle.setSize` |
| `window.show(): Promise<WindowState>` | 显示 native 窗口。 无。 可见后的 `WindowState`。 Floating kind 不主动抢焦点；只有 host 确认真正 on-screen 后才 r…（摘要） | 依方法：呈现/交互/资源；不得视为纯查询；继承本节限制 | [WindowHandle.show](../ui.md#windowhandleshow)；`read ui WindowHandle.show` |
| `window.waitUntilClosed(): Promise<WindowState>` | 显式等待窗口终结。 无。 关闭终态。 参与 execution 生命周期；不要用长 sleep 代替。 | 依方法：呈现/交互/资源；不得视为纯查询；继承本节限制 | [WindowHandle.waitUntilClosed](../ui.md#windowhandlewaituntilclosed)；`read ui WindowHandle.waitUntilClosed` |
| `ui.closeAll(): Promise<void>;` | 幂等关闭当前 execution 的所有 Custom UI 窗口。 | 依方法：呈现/交互/资源；不得视为纯查询；继承本节限制 | [ui.closeAll](../ui.md#uicloseall)；`read ui ui.closeAll` |
| `ui.createWindow(spec: WindowSpec): Promise<WindowHandle>;` | 创建受限 HTML/CSS `WindowHandle`。 | 依方法：呈现/交互/资源；不得视为纯查询；继承本节限制 | [ui.createWindow](../ui.md#uicreatewindowspec)；`read ui ui.createWindow` |
| `ui.getCapabilities(): Capabilities;` | 读取当前 execution 的 UI 授权、平台和 driver 能力。 | 依方法：呈现/交互/资源；不得视为纯查询；继承本节限制 | [ui.getCapabilities](../ui.md#uigetcapabilities)；`read ui ui.getCapabilities` |
| `ui.notify(messageOrOptions: string \| NotificationOptions): Promise<NotificationHandle>;` | Deprecated/Compatibility：`ui.toast()` 的历史名称。 | 依方法：呈现/交互/资源；不得视为纯查询；继承本节限制 | [ui.notify](../ui.md#uinotifymessageoroptions)；`read ui ui.notify` |
| `ui.on(type: EventType \| "*", listener: (event: UIEvent) => void \| Promise<void>): () => void;` | 监听当前 execution 的 Custom UI 事件。 | 等待/订阅；回调副作用由调用方决定，须清理；继承本节限制 | [ui.on](../ui.md#uiontype-listener)；`read ui ui.on` |
| `ui.toast(messageOrOptions: string \| ToastOptions): Promise<ToastHandle>;` | 推荐的 transient feedback；返回可更新 `ToastHandle`。 | 依方法：呈现/交互/资源；不得视为纯查询；继承本节限制 | [ui.toast](../ui.md#uitoastmessageoroptions)；`read ui ui.toast` |


## Dialog

状态、前置权限、平台、错误/等待/取消与副作用按选中正文核对。

来源：[dialog.md](../dialog.md)。

| 精确方法；主要输入 → 输出（签名） | 解决的问题 | 副作用；适用限制 | 契约获取 |
| --- | --- | --- | --- |
| `Dialog.alert(message: string \| OpenDeskAlertOptions): Promise<void>;` | 显示单按钮提示框。 | 依方法：呈现/交互/资源；不得视为纯查询；`Dialog.alert()` | [Dialog.alert](../dialog.md#dialogalertmessageoroptions)；`read dialog Dialog.alert` |
| `Dialog.confirm(message: string \| OpenDeskConfirmOptions): Promise<boolean>;` | 显示确认/取消对话框。 | 依方法：呈现/交互/资源；不得视为纯查询；`Dialog.confirm()` | [Dialog.confirm](../dialog.md#dialogconfirmmessageoroptions)；`read dialog Dialog.confirm` |
| `Dialog.getCapabilities(): OpenDeskDialogCapabilities;` | 查询 Dialog capability。 | 依方法：呈现/交互/资源；不得视为纯查询；— | [Dialog.getCapabilities](../dialog.md#dialoggetcapabilities)；`read dialog Dialog.getCapabilities` |
| `Dialog.prompt(message: string \| OpenDeskPromptOptions): Promise<string \| null>;` | 显示文本输入对话框。 | 依方法：呈现/交互/资源；不得视为纯查询；`Dialog.prompt()` | [Dialog.prompt](../dialog.md#dialogpromptmessageoroptions)；`read dialog Dialog.prompt` |
| `alert(message: string \| OpenDeskAlertOptions): Promise<void>;` | `Dialog.alert()` 的全局兼容 alias。 `Promise<void>`。 Canonical method：`Dialog.alert()`；参数、返…（摘要） | 依方法：呈现/交互/资源；不得视为纯查询；继承本节限制 | [alert](../dialog.md#alertmessageoroptions)；`read dialog alert` |
| `confirm(message: string \| OpenDeskConfirmOptions): Promise<boolean>;` | `Dialog.confirm()` 的全局兼容 alias。 `Promise<boolean>`。 Canonical method：`Dialog.confirm(…（摘要） | 依方法：呈现/交互/资源；不得视为纯查询；继承本节限制 | [confirm](../dialog.md#confirmmessageoroptions)；`read dialog confirm` |
| `prompt(message: string \| OpenDeskPromptOptions): Promise<string \| null>;` | `Dialog.prompt()` 的全局兼容 alias。 `Promise<string \| null>`。 Canonical method：`Dialog.pro…（摘要） | 依方法：呈现/交互/资源；不得视为纯查询；继承本节限制 | [prompt](../dialog.md#promptmessageoroptions)；`read dialog prompt` |


## notify()：系统通知

状态、前置权限、平台、错误/等待/取消与副作用按选中正文核对。

来源：[notify.md](../notify.md)。

| 精确方法；主要输入 → 输出（签名） | 解决的问题 | 副作用；适用限制 | 契约获取 |
| --- | --- | --- | --- |
| `notify(message: string): void; notify(options: OpenDeskNotifyOptions): void;` | 发送一条系统通知。它适合报告后台任务完成、需要稍后留意的状态；通知显示不是业务成功、状态持久化或执行证据的替代品。 这是同步函数，不需要 `await`。成功时返回 `u…（摘要） | 依方法：呈现/交互/资源；不得视为纯查询；继承本节限制 | [notify](../notify.md#notifymessageoroptions)；`read notify notify` |


## automation.app

仅当前 App Mode execution；不是外部应用 App。

来源：[automation-app.md](../automation-app.md)。

| 精确方法；主要输入 → 输出（签名） | 解决的问题 | 副作用；适用限制 | 契约获取 |
| --- | --- | --- | --- |
| `automation.app.getCapabilities(): OpenDeskAppShellCapabilities;` | 可选的 execution-context / capability 探测；主要用于共享代码和兼容性判断。 | 观察/查询；可能读取敏感数据，不等于业务完成；继承本节限制 | [automation.app.getCapabilities](../automation-app.md#automationappgetcapabilities)；`read automation-app automation.app.getCapabilities` |
| `automation.app.onAction(handler: (event: OpenDeskAppActionEvent) => void \| Promise<void>): () => void;` | 接收当前 App Shell 分发的 Tray/Menu、activation 与 second-instance action。 | 需核对正文；不能假定无副作用；继承本节限制 | [automation.app.onAction](../automation-app.md#automationapponactionhandler)；`read automation-app automation.app.onAction` |
| `automation.app.quit(): Promise<void>;` | 请求当前 App Mode 应用沿统一 Execution 生命周期退出。 | 需核对正文；不能假定无副作用；继承本节限制 | [automation.app.quit](../automation-app.md#automationappquit)；`read automation-app automation.app.quit` |
| `automation.app.updateMenuItem(id: string, patch: OpenDeskAppMenuItemPatch): Promise<void>;` | 更新 Manifest 中一个已经存在的菜单项显示状态。 | 有：输入/应用或系统状态改变；继承本节限制 | [automation.app.updateMenuItem](../automation-app.md#automationappupdatemenuitemid-patch)；`read automation-app automation.app.updateMenuItem` |


## 生成依据

维护命令：`node scripts/api-docs.js generate`；校验：`node scripts/api-docs.js check`。不能手工改本表；修改 canonical 正文/类型后重生成。下面是内容版本，不把旧行号当成当前定位。


- `docs/api/ui.md` SHA-256 `59b12026e27e7cb8dbd137272e080e54c933df8da63bc1c413420bcc878136ef`

- `types/CustomUI.d.ts` SHA-256 `5cb41cd5f40b5b2f1ef906e0bb4ff6aeca3c408aa0efbd04fa495953faab2e60`

- `types/FloatingWindow.d.ts` SHA-256 `aa142586b322bb35f62f9e37c59f4ec0cfe9cbd3633533cb1fe6e39106192a43`

- `docs/api/dialog.md` SHA-256 `ad59fcfadd105b1177f349d082e0d77e782de49566564d1d98198d5431ceac45`

- `types/dialog.d.ts` SHA-256 `66b730c4f472e614356a6e8aee73347f3c8a15bcc6caa082bfb2fbdd779f1c3e`

- `docs/api/notify.md` SHA-256 `939c575d26e6a058b84c4bb26c1f2700a87eea0921d22df4ba3b0c1b9d88707c`

- `docs/api/automation-app.md` SHA-256 `b86b86224d3755fc0d9e7015aa451a5b41926a4e6b229ccc9f94741d723c87ca`

- `types/automation-app.d.ts` SHA-256 `6ca829f14acbc642ac9b22a26bced22ee8a7f53ff97b5b9231b1ff80a126b688`
