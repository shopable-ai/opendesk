---
docType: index
---

# 输入、剪贴板与事件

键鼠触摸、剪贴板、快捷键、桌面事件与通知观察

从 [Agent 短入口](README.md) 按任务进入本组；不顺序通读其他组。下表由唯一 Reference/类型确定性生成，不是另一份行为合同。

`node scripts/api-docs.js read <文档名> <方法名>` 返回正文及必要共享段；只读文档，不调用方法。类型中的公开声明不等于当前宿主已授权/已实现。摘要中的省略不用于执行决策。


## mouse

状态、前置权限、平台、错误/等待/取消与副作用按选中正文核对。

来源：[mouse.md](../mouse.md)。

| 精确方法；主要输入 → 输出（签名） | 解决的问题 | 副作用；适用限制 | 契约获取 |
| --- | --- | --- | --- |
| `mouse.click(x: number, y: number, options?: OpenDeskMouseClickOptions): void;` | 移动到屏幕点并点击。 | 有：输入/应用或系统状态改变；继承本节限制 | [mouse.click](../mouse.md#mouseclickx-y-options)；`read mouse mouse.click` |
| `mouse.clickForPID(processID: number, x: number, y: number): void;` | macOS 对指定 PID 的可按压 Accessibility 控件执行 `AXPress`。 | 有：输入/应用或系统状态改变；继承本节限制 | [mouse.clickForPID](../mouse.md#mouseclickforpidprocessid-x-y)；`read mouse mouse.clickForPID` |
| `mouse.clickPoint(point: OpenDeskScreenPoint, options?: OpenDeskMouseClickOptions): void;` | 点击 tagged screen point。 | 有：输入/应用或系统状态改变；继承本节限制 | [mouse.clickPoint](../mouse.md#mouseclickpointpoint-options)；`read mouse mouse.clickPoint` |
| `mouse.down(options?: OpenDeskMouseButtonOptions): void;` | 按下鼠标键。 | 有：输入/应用或系统状态改变；继承本节限制 | [mouse.down](../mouse.md#mousedownoptions)；`read mouse mouse.down` |
| `mouse.getPos(): OpenDeskPoint;` | 读取当前指针坐标。 | 观察/查询；可能读取敏感数据，不等于业务完成；继承本节限制 | [mouse.getPos](../mouse.md#mousegetpos)；`read mouse mouse.getPos` |
| `mouse.move(x: number, y: number, options?: OpenDeskMouseMoveOptions): void;` | 移动指针。 | 需核对正文；不能假定无副作用；继承本节限制 | [mouse.move](../mouse.md#mousemovex-y-options)；`read mouse mouse.move` |
| `mouse.up(options?: OpenDeskMouseButtonOptions): void;` | 释放鼠标键。 | 有：输入/应用或系统状态改变；继承本节限制 | [mouse.up](../mouse.md#mouseupoptions)；`read mouse mouse.up` |
| `mouse.wheel(options?: OpenDeskMouseWheelOptions): void;` | 在当前指针位置滚动。 | 有：输入/应用或系统状态改变；继承本节限制 | [mouse.wheel](../mouse.md#mousewheeloptions)；`read mouse mouse.wheel` |


## Input APIs

状态、前置权限、平台、错误/等待/取消与副作用按选中正文核对。

来源：[input.md](../input.md)。

| 精确方法；主要输入 → 输出（签名） | 解决的问题 | 副作用；适用限制 | 契约获取 |
| --- | --- | --- | --- |
| `keyboard.combination(...keys: string[]): void;` | 顺序按下并逆序释放组合键。 | 有：输入/应用或系统状态改变；继承本节限制 | [keyboard.combination](../input.md#keyboardcombinationkeys)；`read input keyboard.combination` |
| `keyboard.down(key: string): void;` | 按住一个键。 | 有：输入/应用或系统状态改变；继承本节限制 | [keyboard.down](../input.md#keyboarddownkey)；`read input keyboard.down` |
| `keyboard.press(key: string): void;` | 按下并释放单个键。 | 有：输入/应用或系统状态改变；继承本节限制 | [keyboard.press](../input.md#keyboardpresskey)；`read input keyboard.press` |
| `keyboard.type(text: string): void;` | 输入文本。 | 有：输入/应用或系统状态改变；继承本节限制 | [keyboard.type](../input.md#keyboardtypetext)；`read input keyboard.type` |
| `keyboard.up(key: string): void;` | 释放一个键。 | 有：输入/应用或系统状态改变；继承本节限制 | [keyboard.up](../input.md#keyboardupkey)；`read input keyboard.up` |
| `touchscreen.tap(x: number, y: number): void;` | 在全局坐标执行一次轻量 tap。 | 有：输入/应用或系统状态改变；继承本节限制 | [touchscreen.tap](../input.md#touchscreentapx-y)；`read input touchscreen.tap` |


## clipboard

状态、前置权限、平台、错误/等待/取消与副作用按选中正文核对。

来源：[clipboard.md](../clipboard.md)。

| 精确方法；主要输入 → 输出（签名） | 解决的问题 | 副作用；适用限制 | 契约获取 |
| --- | --- | --- | --- |
| `clipboard.clear(): void;` | 清空剪贴板。 | 需核对正文；不能假定无副作用；Stable | [clipboard.clear](../clipboard.md#clipboardclear)；`read clipboard clipboard.clear` |
| `clipboard.copy(text: string): void;` | 写入纯文本。 | 需核对正文；不能假定无副作用；Stable | [clipboard.copy](../clipboard.md#clipboardcopytext)；`read clipboard clipboard.copy` |
| `clipboard.getCapabilities(): OpenDeskClipboardCapabilities;` | 返回 backend、格式、限制与 watcher 契约。 | 观察/查询；可能读取敏感数据，不等于业务完成；Experimental rich | [clipboard.getCapabilities](../clipboard.md#clipboardgetcapabilities)；`read clipboard clipboard.getCapabilities` |
| `clipboard.getFormats(): OpenDeskClipboardFormat[];` | 返回当前可识别格式，不读取正文。 | 观察/查询；可能读取敏感数据，不等于业务完成；Experimental rich | [clipboard.getFormats](../clipboard.md#clipboardgetformats)；`read clipboard clipboard.getFormats` |
| `clipboard.paste(): string;` | 读取当前纯文本。 | 需核对正文；不能假定无副作用；Stable | [clipboard.paste](../clipboard.md#clipboardpaste)；`read clipboard clipboard.paste` |
| `clipboard.read(options?: OpenDeskClipboardReadOptions): OpenDeskClipboardReadResult;` | 读取一致的内容与元数据快照。 | 观察/查询；可能读取敏感数据，不等于业务完成；Experimental rich | [clipboard.read](../clipboard.md#clipboardreadoptions)；`read clipboard clipboard.read` |
| `clipboard.write(payload: OpenDeskClipboardPayload): OpenDeskClipboardWriteResult;` | 一次写入一种或多种 canonical representation。 | 需核对正文；不能假定无副作用；Experimental rich | [clipboard.write](../clipboard.md#clipboardwritepayload)；`read clipboard clipboard.write` |


## globalShortcut

状态、前置权限、平台、错误/等待/取消与副作用按选中正文核对。

来源：[global-shortcut.md](../global-shortcut.md)。

| 精确方法；主要输入 → 输出（签名） | 解决的问题 | 副作用；适用限制 | 契约获取 |
| --- | --- | --- | --- |
| `globalShortcut.isRegistered(accelerator: string): boolean;` | 检查当前 Runtime 是否拥有该注册。 | 观察/查询；可能读取敏感数据，不等于业务完成；继承本节限制 | [globalShortcut.isRegistered](../global-shortcut.md#globalshortcutisregisteredaccelerator)；`read global-shortcut globalShortcut.isRegistered` |
| `globalShortcut.register(accelerator: string, callback: () => unknown \| Promise<unknown>): void;` | 注册当前 Runtime 拥有的系统快捷键。 | 等待/订阅；回调副作用由调用方决定，须清理；继承本节限制 | [globalShortcut.register](../global-shortcut.md#globalshortcutregisteraccelerator-callback)；`read global-shortcut globalShortcut.register` |
| `globalShortcut.unregister(accelerator: string): void;` | 注销当前 Runtime 的一个快捷键。 | 需核对正文；不能假定无副作用；继承本节限制 | [globalShortcut.unregister](../global-shortcut.md#globalshortcutunregisteraccelerator)；`read global-shortcut globalShortcut.unregister` |
| `globalShortcut.unregisterAll(): void;` | 注销当前 Runtime 的全部快捷键。 | 需核对正文；不能假定无副作用；继承本节限制 | [globalShortcut.unregisterAll](../global-shortcut.md#globalshortcutunregisterall)；`read global-shortcut globalShortcut.unregisterAll` |


## Events

状态、前置权限、平台、错误/等待/取消与副作用按选中正文核对。

来源：[events.md](../events.md)。

| 精确方法；主要输入 → 输出（签名） | 解决的问题 | 副作用；适用限制 | 契约获取 |
| --- | --- | --- | --- |
| `Events.getCapabilities(): OpenDeskDesktopEventCapabilities;` | 查询各事件类型的支持、backend 与轮询能力。 | 观察/查询；可能读取敏感数据，不等于业务完成；继承本节限制 | [Events.getCapabilities](../events.md#eventsgetcapabilities)；`read events Events.getCapabilities` |
| `Events.on( event: OpenDeskDesktopEventType, callback: (event: OpenDeskDesktopEvent) => void \| Promise<void>, ): OpenDeskDesktopEventSubscription;` | 持续订阅桌面事件。 | 等待/订阅；回调副作用由调用方决定，须清理；继承本节限制 | [Events.on](../events.md#eventsontype-callback)；`read events Events.on` |
| `Events.once(event: OpenDeskDesktopEventType, options?: OpenDeskDesktopEventOnceOptions): Promise<OpenDeskDesktopEvent>;` | 等待下一次指定事件。 | 等待/订阅；回调副作用由调用方决定，须清理；继承本节限制 | [Events.once](../events.md#eventsoncetype-options)；`read events Events.once` |


## Notifications：自身通知交互

状态、前置权限、平台、错误/等待/取消与副作用按选中正文核对。

来源：[notifications.md](../notifications.md)。

| 精确方法；主要输入 → 输出（签名） | 解决的问题 | 副作用；适用限制 | 契约获取 |
| --- | --- | --- | --- |
| `Notifications.dismiss(target: string \| { id: string }): Promise<{ id: string; dismissed: true }>;` | 只移除 OpenDesk 自身已投递通知，并在返回前 readback 确认该 identifier 已不存在。目标已经消失时拒绝并给出 `NOT_FOUND`，不会把幂…（摘要） | 需核对正文；不能假定无副作用；继承本节限制 | [Notifications.dismiss](../notifications.md#notificationsdismisstarget)；`read notifications Notifications.dismiss` |
| `Notifications.getCapabilities(): OpenDeskNotificationCapabilities;` | 读取当前平台和 backend 的静态能力状态，不发送通知，也不请求系统权限。它是诊断/适配接口，不是 `list()`、`waitFor()` 或 `dismiss()…（摘要） | 观察/查询；可能读取敏感数据，不等于业务完成；继承本节限制 | [Notifications.getCapabilities](../notifications.md#notificationsgetcapabilities)；`read notifications Notifications.getCapabilities` |
| `Notifications.list(options?: OpenDeskNotificationListOptions): Promise<OpenDeskNotificationRecord[]>;` | 默认只返回： 标题和正文可能包含敏感数据，因此只有显式传入 `{includeContent: true}` 才返回 `title` 和 `message`。结果只包含仍…（摘要） | 观察/查询；可能读取敏感数据，不等于业务完成；继承本节限制 | [Notifications.list](../notifications.md#notificationslistoptions)；`read notifications Notifications.list` |
| `Notifications.waitFor(options?: OpenDeskNotificationWaitOptions): Promise<OpenDeskNotificationRecord>;` | `id`、`title`、`message` 是精确匹配；可组合使用。 - 默认不匹配调用前已经存在的通知；`includeExisting: true` 才允许返回旧记…（摘要） | 观察/查询；可能读取敏感数据，不等于业务完成；继承本节限制 | [Notifications.waitFor](../notifications.md#notificationswaitforoptions)；`read notifications Notifications.waitFor` |


## 生成依据

维护命令：`node scripts/api-docs.js generate`；校验：`node scripts/api-docs.js check`。不能手工改本表；修改 canonical 正文/类型后重生成。下面是内容版本，不把旧行号当成当前定位。


- `docs/api/mouse.md` SHA-256 `e4b729ea4cfbd084e6be0fa46b3b92c3d62e3c01817d7f420e93b9d535f46a0f`

- `types/mouse.d.ts` SHA-256 `d842af24c1794e87aa294e38c79fe1795f16508baaf7493d5887cb52a7770580`

- `docs/api/input.md` SHA-256 `3404e1cf58d0623a54b23da03893ce02d1325b158902cbe9dea24cb42594f99b`

- `types/keyboard.d.ts` SHA-256 `47b60300ec0a88eddb18bfcca0ce6fce6a7c9a02d127fdd3b927bfb596efed2b`

- `types/touchscreen.d.ts` SHA-256 `30061c0e4e62d604a49cb420a7513e339001e9a5ec8152b51f1dcdbbdc9837f1`

- `docs/api/clipboard.md` SHA-256 `f679a270e3c9f8b0ca90c157cabc8f1e9848a8219477c07a65178ed566d2261f`

- `types/clipboard.d.ts` SHA-256 `e7e65393d9908e0bdc63d758902dd3d1edca9d89734efbd1d4eaf966782066f2`

- `docs/api/global-shortcut.md` SHA-256 `3796a8de6730dc0277d9dc747dcef7a89ed8483760c4cf26cf6f0dae3ba0c98b`

- `types/globalShortcut.d.ts` SHA-256 `3315ad1c08c15dcd853dd77088749b6cd4b87f651ef0a0e980cdd22d863265cc`

- `docs/api/events.md` SHA-256 `20b400138adb6b62242f138306b7747509148c67daf8dfe0bea60d378b93b170`

- `types/Events.d.ts` SHA-256 `f187fa3310a0ade4b44e9685746e85d55d61d3d982f6a38628e7c7dbaf0be646`

- `docs/api/notifications.md` SHA-256 `f2561d00ac28111cf5edc6760b31e4c5ce9bd3b84badcc8048abaf82d3db4f5d`

- `types/Notifications.d.ts` SHA-256 `76f24f532177796125f00f8690ae2f22245a7141266bf6cb5a8ed70ca798deac`
