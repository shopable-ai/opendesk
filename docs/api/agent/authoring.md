---
docType: index
---

# 录制、扩展与 Flow

人工录制、原生扩展发现、已安装 Flow 的资源路径

从 [Agent 短入口](README.md) 按任务进入本组；不顺序通读其他组。下表由唯一 Reference/类型确定性生成，不是另一份行为合同。

`node scripts/api-docs.js read <文档名> <方法名>` 返回正文及必要共享段；只读文档，不调用方法。类型中的公开声明不等于当前宿主已授权/已实现。摘要中的省略不用于执行决策。


## Recorder

状态、前置权限、平台、错误/等待/取消与副作用按选中正文核对。

来源：[recorder-runtime.md](../recorder-runtime.md)。

| 精确方法；主要输入 → 输出（签名） | 解决的问题 | 副作用；适用限制 | 契约获取 |
| --- | --- | --- | --- |
| `Recorder.buildActions(recordingDir: string): Promise<OpenDeskRecorderActionsResult>;` | 从终结包或可校验的未终结 raw 前缀确定性制作固定版本 actions | 需核对正文；不能假定无副作用；继承本节限制 | [Recorder.buildActions](../recorder-runtime.md#recorderbuildactionsrecordingdir)；`read recorder-runtime Recorder.buildActions` |
| `Recorder.generateScript(actionsFile: string, options?: OpenDeskRecorderGenerateOptions): Promise<OpenDeskRecorderScriptResult>;` | 从固定 actions 生成简洁 semantic 候选；显式 basic 为物理回放 | 需核对正文；不能假定无副作用；继承本节限制 | [Recorder.generateScript](../recorder-runtime.md#recordergeneratescriptactionsfile-options)；`read recorder-runtime Recorder.generateScript` |
| `Recorder.getCapabilities(): OpenDeskRecorderCapabilities;` | 无副作用地查询采集、actions、semantic 和 basic 生成能力 | 观察/查询；可能读取敏感数据，不等于业务完成；继承本节限制 | [Recorder.getCapabilities](../recorder-runtime.md#recordergetcapabilities)；`read recorder-runtime Recorder.getCapabilities` |
| `Recorder.start(options: OpenDeskRecorderStartOptions): Promise<OpenDeskRecorderSession>;` | 在明确授权下记录起始窗口上下文并开始桌面级人工输入采集 | 需核对正文；不能假定无副作用；继承本节限制 | [Recorder.start](../recorder-runtime.md#recorderstartoptions)；`read recorder-runtime Recorder.start` |
| `RecorderSession.excludeControlClick(event: OpenDeskRecorderControlClickEvent): Promise<OpenDeskRecorderControlClickResult>;` | 为 Custom UI 控制点击写入可审计排除边界，避免生成目标动作 | 需核对正文；不能假定无副作用；继承本节限制 | [RecorderSession.excludeControlClick](../recorder-runtime.md#recordersessionexcludecontrolclickevent)；`read recorder-runtime RecorderSession.excludeControlClick` |
| `RecorderSession.pause(): Promise<OpenDeskRecorderControlResult>;` | 在保留 session 和 native lease 的同时暂停接受输入并写入明确边界 | 需核对正文；不能假定无副作用；继承本节限制 | [RecorderSession.pause](../recorder-runtime.md#recordersessionpause)；`read recorder-runtime RecorderSession.pause` |
| `RecorderSession.resume(): Promise<OpenDeskRecorderControlResult>;` | 在当前前台窗口继续接受输入并写入明确边界 | 需核对正文；不能假定无副作用；继承本节限制 | [RecorderSession.resume](../recorder-runtime.md#recordersessionresume)；`read recorder-runtime RecorderSession.resume` |
| `RecorderSession.status(): OpenDeskRecorderStatus;` | 读取当前采集和保存状态快照 | 观察/查询；可能读取敏感数据，不等于业务完成；继承本节限制 | [RecorderSession.status](../recorder-runtime.md#recordersessionstatus)；`read recorder-runtime RecorderSession.status` |
| `RecorderSession.stop(): Promise<OpenDeskRecorderStopResult>;` | 固定截止边界、停止监听、排空 writer 并终结录制包 | 需核对正文；不能假定无副作用；继承本节限制 | [RecorderSession.stop](../recorder-runtime.md#recordersessionstop)；`read recorder-runtime RecorderSession.stop` |


## Native Extension Plugin

真实已安装插件及 manifest 决定能力；不把示例插件当作内置 API。

来源：[native-extension.md](../native-extension.md)。

| 精确方法；主要输入 → 输出（签名） | 解决的问题 | 副作用；适用限制 | 契约获取 |
| --- | --- | --- | --- |
| `NativeExtension.call<TResult = unknown>(options: OpenDeskUnsafeNativeExtensionCallOptions): TResult;` | 现有 `pkg/nativeextension` Host 与 Protocol V0 仍是唯一 process/protocol 实现。Direct Host CLI …（摘要） | 需核对正文；不能假定无副作用；继承本节限制 | [NativeExtension.call](../native-extension.md#nativeextensioncall低层-v0-兼容入口)；`read native-extension NativeExtension.call` 共享整页兜底 |
| `NativeExtensions.diagnostics(): readonly OpenDeskNativeExtensionDiscoveryDiagnostic[];` | NativeExtensions.diagnostics；所属能力：真实已安装插件及 manifest 决定能力；不把示例插件当作内置 API。 | 需核对正文；不能假定无副作用；继承本节限制 | [NativeExtensions.diagnostics](../native-extension.md)；`read native-extension NativeExtensions.diagnostics` 共享整页兜底 |
| `NativeExtensions.get<K extends keyof OpenDeskNativeExtensionPluginById>(pluginId: K): OpenDeskNativeExtensionPluginById[K];`（2 个声明；--types 核对） | NativeExtensions.get；所属能力：真实已安装插件及 manifest 决定能力；不把示例插件当作内置 API。 | 观察/查询；可能读取敏感数据，不等于业务完成；继承本节限制 | [NativeExtensions.get](../native-extension.md)；`read native-extension NativeExtensions.get` 共享整页兜底 |
| `NativeExtensions.list(): readonly OpenDeskNativeExtensionDescriptor[];` | NativeExtensions.list；所属能力：真实已安装插件及 manifest 决定能力；不把示例插件当作内置 API。 | 观察/查询；可能读取敏感数据，不等于业务完成；继承本节限制 | [NativeExtensions.list](../native-extension.md)；`read native-extension NativeExtensions.list` 共享整页兜底 |


## Flow

状态、前置权限、平台、错误/等待/取消与副作用按选中正文核对。

来源：[flow.md](../flow.md)。

| 精确方法；主要输入 → 输出（签名） | 解决的问题 | 副作用；适用限制 | 契约获取 |
| --- | --- | --- | --- |
| `Flow.dataDir: string;` | 当前 Flow 独立的可写业务数据目录。 | 读取当前执行/资源上下文；`string` | [Flow.dataDir](../flow.md#flowdatadir)；`read flow Flow.dataDir` |
| `Flow.resolve(relativePath: string): string;` | 解析 Flow 内的一个合法相对资源路径。 | 读取当前执行/资源上下文；`string` | [Flow.resolve](../flow.md#flowresolverelativepath)；`read flow Flow.resolve` |
| `Flow.root: string;` | 当前安装 Flow 的只读资源根。 | 读取当前执行/资源上下文；`string` | [Flow.root](../flow.md#flowroot)；`read flow Flow.root` |


## 生成依据

维护命令：`node scripts/api-docs.js generate`；校验：`node scripts/api-docs.js check`。不能手工改本表；修改 canonical 正文/类型后重生成。下面是内容版本，不把旧行号当成当前定位。


- `docs/api/recorder-runtime.md` SHA-256 `de7ce383e53f6458a04623a18e2823d39c4c8241b6dc49a5e3af65491b35a018`

- `types/recorder.d.ts` SHA-256 `30a4958671a9baabd8c665ad3624e7d078e17c98394799e623d69a63d2575795`

- `docs/api/native-extension.md` SHA-256 `0a4589364bde890a51fade0d8b84aa92f0a2e8c6feca7c3df28aac880a42ceb2`

- `types/NativeExtension.d.ts` SHA-256 `082245987a328e5d65776ecaec33f0201594251968dad7e5f91517c3891eabe5`

- `docs/api/flow.md` SHA-256 `42785fd59890f272003e22c0d51b39982627d77766f337e57dfe7025a179e70f`
