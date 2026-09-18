---
docType: index
---

# 应用、窗口与几何

识别应用/窗口、等待就绪、截图入口与坐标换算

从 [Agent 短入口](README.md) 按任务进入本组；不顺序通读其他组。下表由唯一 Reference/类型确定性生成，不是另一份行为合同。

`node scripts/api-docs.js read <文档名> <方法名>` 返回正文及必要共享段；只读文档，不调用方法。类型中的公开声明不等于当前宿主已授权/已实现。摘要中的省略不用于执行决策。


## App

身份唯一；平台支持、启动/终止权限与结果分开判断。

来源：[app.md](../app.md)。

| 精确方法；主要输入 → 输出（签名） | 解决的问题 | 副作用；适用限制 | 契约获取 |
| --- | --- | --- | --- |
| `App.get(target: OpenDeskAppTarget): OpenDeskAppGroup \| null;` | 按 identity 返回当前匹配 group。 | 观察/查询；可能读取敏感数据，不等于业务完成；继承本节限制 | [App.get](../app.md#appgettarget)；`read app App.get` |
| `App.getCapabilities(): OpenDeskAppCapabilities;` | 返回当前平台和 backend 的能力矩阵。 | 观察/查询；可能读取敏感数据，不等于业务完成；继承本节限制 | [App.getCapabilities](../app.md#appgetcapabilities)；`read app App.getCapabilities` |
| `App.isRunning(target: OpenDeskAppTarget): boolean;` | 判断当前是否存在匹配实例。 | 观察/查询；可能读取敏感数据，不等于业务完成；继承本节限制 | [App.isRunning](../app.md#appisrunningtarget)；`read app App.isRunning` |
| `App.launch(target: Exclude<OpenDeskAppTarget, number \| { pid: number }>, options?: OpenDeskAppLaunchOptions): Promise<OpenDeskAppGroup>;` | 启动或激活应用并可等待 readiness。 | 有：输入/应用或系统状态改变；继承本节限制 | [App.launch](../app.md#applaunchtarget-options)；`read app App.launch` |
| `App.list(options?: Record<string, never>): OpenDeskAppInstance[];` | 返回当前应用/进程 snapshot。 | 观察/查询；可能读取敏感数据，不等于业务完成；继承本节限制 | [App.list](../app.md#applist)；`read app App.list` |
| `App.restart(target: OpenDeskAppTarget, options?: OpenDeskAppLaunchOptions & { force?: boolean }): Promise<OpenDeskAppGroup>;` | 终止匹配实例后按稳定 identity 重新启动。 | 有：输入/应用或系统状态改变；继承本节限制 | [App.restart](../app.md#apprestarttarget-options)；`read app App.restart` |
| `App.terminate(target: OpenDeskAppTarget, options?: OpenDeskAppTerminateOptions): Promise<OpenDeskAppTerminateResult>;` | 向开始时匹配的实例发出 graceful 或 force 终止请求。 | 有：输入/应用或系统状态改变；继承本节限制 | [App.terminate](../app.md#appterminatetarget-options)；`read app App.terminate` |
| `App.waitForExit(target: OpenDeskAppTarget, options?: { timeout?: number }): Promise<true>;` | 等待该 identity 当前不再运行。 | 观察/查询；可能读取敏感数据，不等于业务完成；继承本节限制 | [App.waitForExit](../app.md#appwaitforexittarget-options)；`read app App.waitForExit` |
| `App.waitForLaunch(target: OpenDeskAppTarget, options?: OpenDeskAppWaitOptions): Promise<OpenDeskAppGroup>;` | 等待应用达到 process/window readiness。 | 观察/查询；可能读取敏感数据，不等于业务完成；继承本节限制 | [App.waitForLaunch](../app.md#appwaitforlaunchtarget-options)；`read app App.waitForLaunch` |


## window

WindowTarget 与 WindowInfo 不混用；唯一性/新鲜度/坐标按公共约定。

来源：[window.md](../window.md)。

| 精确方法；主要输入 → 输出（签名） | 解决的问题 | 副作用；适用限制 | 契约获取 |
| --- | --- | --- | --- |
| `window.activate(target: OpenDeskWindowInfo, options?: OpenDeskWindowActivateOptions): Promise<OpenDeskWindowInfo>;` | 有界激活同一精确窗口并验证前台状态。 | 有：输入/应用或系统状态改变；继承本节限制 | [window.activate](../window.md#windowactivatetarget-options)；`read window window.activate` |
| `window.bringToTop(title: string, pid?: number): void;` | 将目标窗口提升到顶层。 | 需核对正文；不能假定无副作用；继承本节限制 | [window.bringToTop](../window.md#windowbringtotoptitle-pid)；`read window window.bringToTop` |
| `window.closeActiveWindow(): void;` | 关闭当前活动窗口。 | 需核对正文；不能假定无副作用；继承本节限制 | [window.closeActiveWindow](../window.md#windowcloseactivewindow)；`read window window.closeActiveWindow` |
| `window.closeWindow(title: string): void;` | 关闭唯一标题窗口。 | 需核对正文；不能假定无副作用；继承本节限制 | [window.closeWindow](../window.md#windowclosewindowtitle)；`read window window.closeWindow` |
| `window.content(): string;` | 同步读取活动窗口可访问文本。 | 观察/查询；可能读取敏感数据，不等于业务完成；继承本节限制 | [window.content](../window.md#windowcontent)；`read window window.content` |
| `window.current(target: OpenDeskWindowInfo): Promise<OpenDeskWindowInfo>;` | 快速刷新同一 PID/native handle 的窗口。 | 观察/查询；可能读取敏感数据，不等于业务完成；继承本节限制 | [window.current](../window.md#windowcurrenttarget)；`read window window.current` |
| `window.focus(title: string): void;` | 聚焦唯一标题窗口。 | 有：输入/应用或系统状态改变；继承本节限制 | [window.focus](../window.md#windowfocustitle)；`read window window.focus` |
| `window.get(target: OpenDeskWindowTarget): Promise<OpenDeskWindowInfo>;` | 取得唯一、身份与几何有效的窗口快照。 | 观察/查询；可能读取敏感数据，不等于业务完成；继承本节限制 | [window.get](../window.md#windowgettarget)；`read window window.get` |
| `window.getActiveWindow(): Promise<OpenDeskWindowInfo>;` | 返回活动窗口信息。 | 观察/查询；可能读取敏感数据，不等于业务完成；继承本节限制 | [window.getActiveWindow](../window.md#windowgetactivewindow)；`read window window.getActiveWindow` |
| `window.getCapabilities(): OpenDeskWindowCapabilities;` | 返回当前平台的窗口能力矩阵。 | 观察/查询；可能读取敏感数据，不等于业务完成；继承本节限制 | [window.getCapabilities](../window.md#windowgetcapabilities)；`read window window.getCapabilities` |
| `window.getContent(selector: string): string;` | 读取指定窗口可访问文本。 | 观察/查询；可能读取敏感数据，不等于业务完成；继承本节限制 | [window.getContent](../window.md#windowgetcontentselector)；`read window window.getContent` |
| `window.getFocusWindow(): OpenDeskWindowInfo \| null;` | 同步返回当前焦点窗口。 | 观察/查询；可能读取敏感数据，不等于业务完成；继承本节限制 | [window.getFocusWindow](../window.md#windowgetfocuswindow)；`read window window.getFocusWindow` |
| `window.getTitle(selector: string): string;` | 返回指定窗口标题。 | 观察/查询；可能读取敏感数据，不等于业务完成；继承本节限制 | [window.getTitle](../window.md#windowgettitleselector)；`read window window.getTitle` |
| `window.getWindowByTitle(title: string): Promise<OpenDeskWindowInfo>;` | 按标题查找唯一窗口。 | 观察/查询；可能读取敏感数据，不等于业务完成；继承本节限制 | [window.getWindowByTitle](../window.md#windowgetwindowbytitletitle)；`read window window.getWindowByTitle` |
| `window.kill(processId: number): void;` | 终止窗口所属进程。 | 有：输入/应用或系统状态改变；继承本节限制 | [window.kill](../window.md#windowkillprocessid)；`read window window.kill` |
| `window.list(target?: OpenDeskWindowTarget): OpenDeskWindowInfo[];` | 同步返回全部或筛选后的窗口快照。 | 观察/查询；可能读取敏感数据，不等于业务完成；继承本节限制 | [window.list](../window.md#windowlisttarget)；`read window window.list` |
| `window.maximize(title: string): void;` | 最大化窗口。 | 需核对正文；不能假定无副作用；继承本节限制 | [window.maximize](../window.md#windowmaximizetitle)；`read window window.maximize` |
| `window.maximizeByPID(pid: number): void;` | 按 PID 最大化窗口。 | 需核对正文；不能假定无副作用；继承本节限制 | [window.maximizeByPID](../window.md#windowmaximizebypidpid)；`read window window.maximizeByPID` |
| `window.minimize(title: string): void;` | 最小化窗口。 | 需核对正文；不能假定无副作用；继承本节限制 | [window.minimize](../window.md#windowminimizetitle)；`read window window.minimize` |
| `window.minimizeByPID(pid: number): void;` | 按 PID 最小化窗口。 | 需核对正文；不能假定无副作用；继承本节限制 | [window.minimizeByPID](../window.md#windowminimizebypidpid)；`read window window.minimizeByPID` |
| `window.restore(title: string): void;` | 恢复窗口。 | 需核对正文；不能假定无副作用；继承本节限制 | [window.restore](../window.md#windowrestoretitle)；`read window window.restore` |
| `window.restoreByPID(pid: number): void;` | 按 PID 恢复窗口。 | 需核对正文；不能假定无副作用；继承本节限制 | [window.restoreByPID](../window.md#windowrestorebypidpid)；`read window window.restoreByPID` |
| `window.setAlwaysOnTop(title: string, alwaysOnTop: boolean): void;` | 设置/取消置顶。 | 需核对正文；不能假定无副作用；继承本节限制 | [window.setAlwaysOnTop](../window.md#windowsetalwaysontoptitle-alwaysontop)；`read window window.setAlwaysOnTop` |
| `window.setHeight(title: string, height: number): void;` | 只设置高度。 | 需核对正文；不能假定无副作用；继承本节限制 | [window.setHeight](../window.md#windowsetheighttitle-height)；`read window window.setHeight` |
| `window.setWidth(title: string, width: number): void;` | 只设置宽度。 | 需核对正文；不能假定无副作用；继承本节限制 | [window.setWidth](../window.md#windowsetwidthtitle-width)；`read window window.setWidth` |
| `window.setWindowBounds(title: string, x: number, y: number, width: number, height: number): void;` | 设置位置与尺寸。 | 需核对正文；不能假定无副作用；继承本节限制 | [window.setWindowBounds](../window.md#windowsetwindowboundstitle-x-y-width-height)；`read window window.setWindowBounds` |
| `window.title(): string;` | 同步返回活动窗口标题。 | 观察/查询；可能读取敏感数据，不等于业务完成；继承本节限制 | [window.title](../window.md#windowtitle)；`read window window.title` |
| `window.unsetTopMost(title: string): void;` | 取消置顶。 | 需核对正文；不能假定无副作用；继承本节限制 | [window.unsetTopMost](../window.md#windowunsettopmosttitle)；`read window window.unsetTopMost` |
| `window.wait(target: OpenDeskWindowTarget, options?: OpenDeskWindowWaitOptions): Promise<OpenDeskWindowInfo>;` | 等待唯一窗口出现，支持超时和取消。 | 观察/查询；可能读取敏感数据，不等于业务完成；继承本节限制 | [window.wait](../window.md#windowwaittarget-options)；`read window window.wait` |


## page

当前 execution、可见范围与截图/应用权限；等待不证明业务结果。

来源：[page.md](../page.md)。

| 精确方法；主要输入 → 输出（签名） | 解决的问题 | 副作用；适用限制 | 契约获取 |
| --- | --- | --- | --- |
| `page.captureScreen(options?: OpenDeskPageScreenshotOptions): Promise<string \| ArrayBuffer \| OpenDeskScreenshotResult \| null>;` | 截屏兼容入口，返回形式与 `page.screenshot()` 一致。 | 依选项：采集/生成文件或资源；继承本节限制 | [page.captureScreen](../page.md#pagecapturescreenoptions)；`read page page.captureScreen` |
| `page.checkPermissions(options?: OpenDeskPermissionOptions): Promise<OpenDeskPermissionReport>;` | 读取跨平台权限快照。 | 需核对正文；不能假定无副作用；继承本节限制 | [page.checkPermissions](../page.md#pagecheckpermissionsoptions)；`read page page.checkPermissions` |
| `page.checkScreenshotPermissions(): Record<string, unknown>;` | 检查截图相关权限。 | 需核对正文；不能假定无副作用；继承本节限制 | [page.checkScreenshotPermissions](../page.md#pagecheckscreenshotpermissions)；`read page page.checkScreenshotPermissions` |
| `page.ensureMacPermissions(options?: Record<string, unknown>): Promise<OpenDeskPermissionReport>;` | page.ensureMacPermissions；所属能力：当前 execution、可见范围与截图/应用权限；等待不证明业务结果。 | 需核对正文；不能假定无副作用；继承本节限制 | [page.ensureMacPermissions](../page.md)；`read page page.ensureMacPermissions` **正文缺口：禁止据类型直接生成调用** |
| `page.ensurePermissions(options?: OpenDeskPermissionOptions): Promise<OpenDeskPermissionReport>;` | 严格确保所需权限已满足。 | 需核对正文；不能假定无副作用；继承本节限制 | [page.ensurePermissions](../page.md#pageensurepermissionsoptions)；`read page page.ensurePermissions` |
| `page.goto(url: string): Promise<void>;` | 交给系统默认方式打开 URL。 | 需核对正文；不能假定无副作用；继承本节限制 | [page.goto](../page.md#pagegotourl)；`read page page.goto` |
| `page.keyboard: OpenDeskKeyboard;` | page.keyboard；所属能力：当前 execution、可见范围与截图/应用权限；等待不证明业务结果。 | 观察/查询；可能读取敏感数据，不等于业务完成；继承本节限制 | [page.keyboard](../page.md)；`read page page.keyboard` 共享整页兜底 |
| `page.mouse: OpenDeskMouse;` | page.mouse；所属能力：当前 execution、可见范围与截图/应用权限；等待不证明业务结果。 | 需核对正文；不能假定无副作用；继承本节限制 | [page.mouse](../page.md)；`read page page.mouse` 共享整页兜底 |
| `page.openApp(appName: string): void;` | 打开本地应用。 | 需核对正文；不能假定无副作用；继承本节限制 | [page.openApp](../page.md#pageopenappappname)；`read page page.openApp` |
| `page.openMacOSPrivacySettings(section?: string): Record<string, unknown>;` | 打开指定 macOS Privacy 设置页。 | 需核对正文；不能假定无副作用；继承本节限制 | [page.openMacOSPrivacySettings](../page.md#pageopenmacosprivacysettingssection)；`read page page.openMacOSPrivacySettings` |
| `page.openURL(url: string): void;` | `page.goto()` 的语义别名。 | 需核对正文；不能假定无副作用；继承本节限制 | [page.openURL](../page.md#pageopenurlurl)；`read page page.openURL` |
| `page.openURLInApp(appName: string, url: string): void;` | 用指定应用打开 URL。 | 需核对正文；不能假定无副作用；继承本节限制 | [page.openURLInApp](../page.md#pageopenurlinappappname-url)；`read page page.openURLInApp` |
| `page.requestMacAutomationPermission(targetApp?: string): Record<string, unknown>;` | 触发指定应用的 AppleEvents 权限请求。 | 需核对正文；不能假定无副作用；继承本节限制 | [page.requestMacAutomationPermission](../page.md#pagerequestmacautomationpermissiontargetapp)；`read page page.requestMacAutomationPermission` |
| `page.requestMacPermissions(options?: Record<string, unknown>): Record<string, unknown>;` | 请求/检查 macOS 权限。 | 需核对正文；不能假定无副作用；继承本节限制 | [page.requestMacPermissions](../page.md#pagerequestmacpermissionsoptions)；`read page page.requestMacPermissions` |
| `page.requestPermissions(options?: OpenDeskPermissionOptions): Promise<OpenDeskPermissionReport>;` | 请求或引导用户处理跨平台权限。 | 需核对正文；不能假定无副作用；继承本节限制 | [page.requestPermissions](../page.md#pagerequestpermissionsoptions)；`read page page.requestPermissions` |
| `page.screenshot(options?: OpenDeskPageScreenshotOptions): Promise<string \| ArrayBuffer \| OpenDeskScreenshotResult \| null>;` | 截取活动窗口、屏幕或明确 clip。 | 依选项：采集/生成文件或资源；继承本节限制 | [page.screenshot](../page.md#pagescreenshotoptions)；`read page page.screenshot` |
| `page.title(): string;` | 读取当前活动窗口标题。 | 观察/查询；可能读取敏感数据，不等于业务完成；继承本节限制 | [page.title](../page.md#pagetitle)；`read page page.title` |
| `page.touchscreen: OpenDeskTouchscreen;` | page.touchscreen；所属能力：当前 execution、可见范围与截图/应用权限；等待不证明业务结果。 | 需核对正文；不能假定无副作用；继承本节限制 | [page.touchscreen](../page.md)；`read page page.touchscreen` 共享整页兜底 |
| `page.url(): string;` | 返回 Page 内部 executable 字段；不是浏览器 URL。 | 观察/查询；可能读取敏感数据，不等于业务完成；继承本节限制 | [page.url](../page.md#pageurl)；`read page page.url` |
| `page.waitFor(milliseconds: number, options?: { signal?: AbortSignal \| null }): Promise<void>;`（2 个声明；--types 核对） | 分派到固定等待或条件等待。 | 观察/查询；可能读取敏感数据，不等于业务完成；继承本节限制 | [page.waitFor](../page.md#pagewaitforvalue-options)；`read page page.waitFor` |
| `page.waitForAll<T>(promises: Array<Promise<T> \| T>, options?: { timeout?: number; signal?: AbortSignal \| null }): Promise<T[]>;` | 有界等待一组值/Promise。 | 等待/订阅；回调副作用由调用方决定，须清理；继承本节限制 | [page.waitForAll](../page.md#pagewaitforallvalues-options)；`read page page.waitForAll` |
| `page.waitForFunction<T>(predicate: (...args: any[]) => T \| Promise<T>, options?: OpenDeskPageWaitOptions, ...args: any[]): Promise<T>;` | 轮询条件，带独立 deadline。 | 等待/订阅；回调副作用由调用方决定，须清理；继承本节限制 | [page.waitForFunction](../page.md#pagewaitforfunctionfn-options-args)；`read page page.waitForFunction` |
| `page.waitForNavigation(options?: { timeout?: number }): Promise<void>;` | page.waitForNavigation；所属能力：当前 execution、可见范围与截图/应用权限；等待不证明业务结果。 | 观察/查询；可能读取敏感数据，不等于业务完成；继承本节限制 | [page.waitForNavigation](../page.md)；`read page page.waitForNavigation` **正文缺口：禁止据类型直接生成调用** |
| `page.waitForTimeout(milliseconds: number, options?: { signal?: AbortSignal \| null }): Promise<void>;` | 非阻塞固定等待。 | 观察/查询；可能读取敏感数据，不等于业务完成；继承本节限制 | [page.waitForTimeout](../page.md#pagewaitfortimeoutms-options)；`read page page.waitForTimeout` |


## Geometry

使用真实逻辑坐标与当前父区域；纯换算不证明目标仍有效。

来源：[geometry.md](../geometry.md)。

| 精确方法；主要输入 → 输出（签名） | 解决的问题 | 副作用；适用限制 | 契约获取 |
| --- | --- | --- | --- |
| `Geometry.anchorPoint( target: OpenDeskGeometryTarget, position: OpenDeskGeometryAnchorPosition, options?: OpenDeskGeometryAnchorOptions, ): OpenDeskScreenPoint;` | 返回标准锚点。 | 纯计算/路径；不提交外部输入；继承本节限制 | [Geometry.anchorPoint](../geometry.md#geometryanchorpointtarget-position-options)；`read geometry Geometry.anchorPoint` |
| `Geometry.center(target: OpenDeskGeometryTarget): OpenDeskScreenPoint;` | 返回内部中心点。 | 纯计算/路径；不提交外部输入；继承本节限制 | [Geometry.center](../geometry.md#geometrycentertarget)；`read geometry Geometry.center` |
| `Geometry.contains(region: OpenDeskGeometryTarget, point: OpenDeskScreenPoint): boolean;` | 判断点是否在区域内。 | 纯计算/路径；不提交外部输入；继承本节限制 | [Geometry.contains](../geometry.md#geometrycontainsregion-point)；`read geometry Geometry.contains` |
| `Geometry.inset(target: OpenDeskGeometryTarget, margins: OpenDeskGeometryInset): OpenDeskScreenRegion;` | 将区域向内缩。 | 纯计算/路径；不提交外部输入；继承本节限制 | [Geometry.inset](../geometry.md#geometryinsettarget-margins)；`read geometry Geometry.inset` |
| `Geometry.intersect(regionA: OpenDeskGeometryTarget, regionB: OpenDeskGeometryTarget): OpenDeskScreenRegion \| null;` | 返回区域交集。 | 纯计算/路径；不提交外部输入；继承本节限制 | [Geometry.intersect](../geometry.md#geometryintersectregiona-regionb)；`read geometry Geometry.intersect` |
| `Geometry.pointOffset(target: OpenDeskGeometryTarget, x: number, y: number): OpenDeskScreenPoint;` | 按逻辑坐标偏移得到点。 | 纯计算/路径；不提交外部输入；继承本节限制 | [Geometry.pointOffset](../geometry.md#geometrypointoffsettarget-x-y)；`read geometry Geometry.pointOffset` |
| `Geometry.pointPercent(target: OpenDeskGeometryTarget, xPercent: number, yPercent: number): OpenDeskScreenPoint;` | 按百分比得到点。 | 纯计算/路径；不提交外部输入；继承本节限制 | [Geometry.pointPercent](../geometry.md#geometrypointpercenttarget-xpercent-ypercent)；`read geometry Geometry.pointPercent` |
| `Geometry.rect(target: OpenDeskGeometryTarget): OpenDeskScreenRegion;` | 正规化为 screen region。 | 纯计算/路径；不提交外部输入；继承本节限制 | [Geometry.rect](../geometry.md#geometryrecttarget)；`read geometry Geometry.rect` |
| `Geometry.regionByEdges(target: OpenDeskGeometryTarget, options: OpenDeskGeometryEdgeRegion): OpenDeskScreenRegion;` | 用边距和尺寸确定子区域。 | 纯计算/路径；不提交外部输入；继承本节限制 | [Geometry.regionByEdges](../geometry.md#geometryregionbyedgestarget-options)；`read geometry Geometry.regionByEdges` |
| `Geometry.regionOffset(target: OpenDeskGeometryTarget, region: OpenDeskGeometryOffsetRegion): OpenDeskScreenRegion;` | 按逻辑坐标偏移得到子区域。 | 纯计算/路径；不提交外部输入；继承本节限制 | [Geometry.regionOffset](../geometry.md#geometryregionoffsettarget-region)；`read geometry Geometry.regionOffset` |
| `Geometry.regionPercent(target: OpenDeskGeometryTarget, region: OpenDeskGeometryPercentRegion): OpenDeskScreenRegion;` | 按百分比得到子区域。 | 纯计算/路径；不提交外部输入；继承本节限制 | [Geometry.regionPercent](../geometry.md#geometryregionpercenttarget-region)；`read geometry Geometry.regionPercent` |


## 生成依据

维护命令：`node scripts/api-docs.js generate`；校验：`node scripts/api-docs.js check`。不能手工改本表；修改 canonical 正文/类型后重生成。下面是内容版本，不把旧行号当成当前定位。


- `docs/api/app.md` SHA-256 `52578f1d4d53ba790343a94d6f3ac931607993cb2eebbb6da9c9f7b5c252cc39`

- `types/App.d.ts` SHA-256 `e4220ee0659274e619c693a36a6e581af7c7f346304f0cf4879432f9309fc0ef`

- `docs/api/window.md` SHA-256 `019f35f85057bc7c9161cb0f2e166740411e63f55f79ba41ba993d6c953960c0`

- `types/window.d.ts` SHA-256 `3dfd6c0c84d7f4ef1341efbcb5cd82f022f01dd63d7df7322e6c0eb8078fc7ae`

- `docs/api/page.md` SHA-256 `97bce04f6f4bd2f6e20ed2a46bdf86972db7c5cae880bee5feea6c8fcc9d98c7`

- `types/page.d.ts` SHA-256 `bed6a9d357676b3af10051c4c265925b2219cca3746b0354bfe14d138c343244`

- `docs/api/geometry.md` SHA-256 `383b3ee662653f470c2f2f4a0f5cbae2ba2d5c53a46aed864af3a5a26e40f812`

- `types/Geometry.d.ts` SHA-256 `831ef6e8951735d7d5d55f51fa5cdb96cad357cc01861a482520e56587523cbb`
