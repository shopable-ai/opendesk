---
docType: index
---

# 桌面目标与取值

按文字、图片或原生语义发现目标、读值、等待和操作

从 [Agent 短入口](README.md) 按任务进入本组；不顺序通读其他组。下表由唯一 Reference/类型确定性生成，不是另一份行为合同。

`node scripts/api-docs.js read <文档名> <方法名>` 返回正文及必要共享段；只读文档，不调用方法。类型中的公开声明不等于当前宿主已授权/已实现。摘要中的省略不用于执行决策。


## UI

方法状态逐项确认；目标唯一、窗口新鲜；unknown 后停止重复输入。

来源：[desktop-ui.md](../desktop-ui.md)。

| 精确方法；主要输入 → 输出（签名） | 解决的问题 | 副作用；适用限制 | 契约获取 |
| --- | --- | --- | --- |
| `Locator.find(options?: OpenDeskUILocatorFindOptions): Promise<OpenDeskUITargetMatch \| null>;` | 对当前 Scope 做一次有界、只读观察。 完整且可靠的零匹配返回 `null`。唯一匹配返回普通、冻结的 `OpenDeskUITargetMatch` snapsho…（摘要） | 观察/查询；可能读取敏感数据，不等于业务完成；继承本节限制 | [Locator.find](../desktop-ui.md#locatorfindoptions)；`read desktop-ui Locator.find` |
| `Locator.getValue(options?: OpenDeskUILocatorValueOptions): Promise<string>;` | 读取当前 Locator 指向的严格 native `textField` 字符串值。 目标原生 owner 实际读取的完整字符串，包含空字符串、Unicode 和空白。…（摘要） | 观察/查询；可能读取敏感数据，不等于业务完成；继承本节限制 | [Locator.getValue](../desktop-ui.md#locatorgetvalueoptions)；`read desktop-ui Locator.getValue` |
| `Locator.setValue(value: string, options?: OpenDeskUILocatorValueOptions): Promise<OpenDeskUISetValueResult>;` | 用原生 `setValue` action 设置完整字符串，并复用现有严格回读验证。 `OpenDeskUISetValueResult`，其中 `verified: t…（摘要） | 有：输入/应用或系统状态改变；继承本节限制 | [Locator.setValue](../desktop-ui.md#locatorsetvaluevalue-options)；`read desktop-ui Locator.setValue` |
| `Locator.tap(options?: OpenDeskUILocatorTapOptions): Promise<OpenDeskUITapResult<OpenDeskUITextTarget> \| OpenDeskUITapResult<OpenDeskUIImageTarget> \| OpenDeskUISemanticTapResult>;` | 通过现有 target-specific action owner 对当前 Locator 最多提交一次动作。 对应原 action owner 的真实 result。 …（摘要） | 有：输入/应用或系统状态改变；继承本节限制 | [Locator.tap](../desktop-ui.md#locatortapoptions)；`read desktop-ui Locator.tap` |
| `Locator.waitFor(options?: OpenDeskUILocatorWaitOptions): Promise<void>;` | 只读等待 Locator 的 `exists` 或 `visible` 状态。 条件被可靠证明时返回 `Promise<void>`。 每轮都是一次新只读观察，且不会重置…（摘要） | 观察/查询；可能读取敏感数据，不等于业务完成；继承本节限制 | [Locator.waitFor](../desktop-ui.md#locatorwaitforoptions)；`read desktop-ui Locator.waitFor` |
| `UI.findImage(template: OpenDeskImageTemplate, options?: OpenDeskUIImageOptions): Promise<OpenDeskUIImageTarget \| null>;` | 返回唯一模板匹配。 | 观察/查询；可能读取敏感数据，不等于业务完成；Stable | [UI.findImage](../desktop-ui.md#uifindimagetemplate-options)；`read desktop-ui UI.findImage` |
| `UI.findImages(template: OpenDeskImageTemplate, options?: OpenDeskUIImageOptions): Promise<OpenDeskUIImageTarget[]>;` | 返回全部模板匹配。 | 观察/查询；可能读取敏感数据，不等于业务完成；Stable | [UI.findImages](../desktop-ui.md#uifindimagestemplate-options)；`read desktop-ui UI.findImages` |
| `UI.findMenuItem(path: OpenDeskUIMenuPath, options: OpenDeskUIMenuOptions): Promise<OpenDeskUIMenuItem \| null>;` | 只读查找完整原生菜单路径。 | 观察/查询；可能读取敏感数据，不等于业务完成；Experimental | [UI.findMenuItem](../desktop-ui.md#uifindmenuitempath-options)；`read desktop-ui UI.findMenuItem` |
| `UI.findText(text: string, options?: OpenDeskUITextLocateOptions): Promise<OpenDeskUITextTarget \| null>;` | 返回唯一匹配文本。 | 观察/查询；可能读取敏感数据，不等于业务完成；Stable | [UI.findText](../desktop-ui.md#uifindtexttext-options)；`read desktop-ui UI.findText` |
| `UI.findTextMatches(queries: Array<string \| RegExp>, options?: OpenDeskUITextMatchOptions): Promise<OpenDeskUITextMatchGroup[]>;` | 用一次截图和 OCR 批量计算多组字符串或正则匹配。 | 观察/查询；可能读取敏感数据，不等于业务完成；Stable | [UI.findTextMatches](../desktop-ui.md#uifindtextmatchesqueries-options)；`read desktop-ui UI.findTextMatches` |
| `UI.findTexts(text: string, options?: OpenDeskUITextLocateOptions): Promise<OpenDeskUITextTarget[]>;` | 返回全部匹配文本。 | 观察/查询；可能读取敏感数据，不等于业务完成；Stable | [UI.findTexts](../desktop-ui.md#uifindtextstext-options)；`read desktop-ui UI.findTexts` |
| `UI.getCapabilities(): OpenDeskUICapabilities;` | 查询当前高层 UI 能力。 | 观察/查询；可能读取敏感数据，不等于业务完成；Stable | [UI.getCapabilities](../desktop-ui.md#uigetcapabilities)；`read desktop-ui UI.getCapabilities` |
| `UI.getMenuItems(options: OpenDeskUIMenuOptions): Promise<OpenDeskUIGetMenuItemsResult>;` | 只读观察当前已物化的原生菜单。 | 观察/查询；可能读取敏感数据，不等于业务完成；Experimental | [UI.getMenuItems](../desktop-ui.md#uigetmenuitemsoptions)；`read desktop-ui UI.getMenuItems` |
| `UI.getValue(target: OpenDeskAccessibilitySelector, options: OpenDeskUIValueOptions): Promise<string>;` | 读取唯一原生文本框的字符串值。 | 观察/查询；可能读取敏感数据，不等于业务完成；Experimental · Local | [UI.getValue](../desktop-ui.md#uigetvaluetarget-options)；`read desktop-ui UI.getValue` |
| `UI.hasText(text: string, options?: OpenDeskUITextLocateOptions): Promise<boolean>;` | 判断是否存在匹配文本。 | 观察/查询；可能读取敏感数据，不等于业务完成；Stable | [UI.hasText](../desktop-ui.md#uihastexttext-options)；`read desktop-ui UI.hasText` |
| `UI.readText(options?: OpenDeskUIReadTextOptions): Promise<string>;` | 读取当前唯一 native value 或局部 OCR 实际文字。 | 观察/查询；可能读取敏感数据，不等于业务完成；Experimental · Local | [UI.readText](../desktop-ui.md#uireadtextoptions)；`read desktop-ui UI.readText` |
| `UI.setValue(target: OpenDeskAccessibilitySelector, value: string, options: OpenDeskUIValueOptions): Promise<OpenDeskUISetValueResult>;` | 设置唯一原生文本框的完整字符串值并用同一引用回读。 | 有：输入/应用或系统状态改变；Experimental · Local | [UI.setValue](../desktop-ui.md#uisetvaluetarget-value-options)；`read desktop-ui UI.setValue` |
| `UI.tapImage(template: OpenDeskImageTemplate, options?: OpenDeskUIImageOptions): Promise<OpenDeskUITapResult<OpenDeskUIImageTarget>>;` | 查找并点击唯一图片。 | 有：输入/应用或系统状态改变；Stable | [UI.tapImage](../desktop-ui.md#uitapimagetemplate-options)；`read desktop-ui UI.tapImage` |
| `UI.tapMenuItem(path: OpenDeskUIMenuPath, options: OpenDeskUITapMenuItemOptions): Promise<OpenDeskUITapMenuItemResult>;` | 逐层展开并执行完整原生菜单路径。 | 有：输入/应用或系统状态改变；Experimental | [UI.tapMenuItem](../desktop-ui.md#uitapmenuitempath-options)；`read desktop-ui UI.tapMenuItem` |
| `UI.tapTargets(targets: OpenDeskUISemanticTapTarget[], options?: OpenDeskUISemanticTapOptions): Promise<OpenDeskUISemanticTapResult>;`（2 个声明；--types 核对） | 逐步骤文字或扁平语义目标；由 Runtime 负责定位、执行和清理。 | 有：输入/应用或系统状态改变；Experimental · Local | [UI.tapTargets](../desktop-ui.md#uitaptargetstargets-options)；`read desktop-ui UI.tapTargets` |
| `UI.tapText(text: string, options?: OpenDeskUITextLocateOptions): Promise<OpenDeskUITapResult<OpenDeskUITextTarget>>;` | 查找并点击唯一文本。 | 有：输入/应用或系统状态改变；Stable | [UI.tapText](../desktop-ui.md#uitaptexttext-options)；`read desktop-ui UI.tapText` |
| `UI.tapTexts(texts: string[], options?: OpenDeskUITapTextsOptions): Promise<OpenDeskUITapTextsResult>;` | 按顺序等待、重新定位并点击多个文本，默认步间隔 300 ms。 | 有：输入/应用或系统状态改变；Stable；序列等待为 Experimental | [UI.tapTexts](../desktop-ui.md#uitaptextstexts-options)；`read desktop-ui UI.tapTexts` |
| `UI.waitText(text: string, options?: OpenDeskUITextOptions): Promise<OpenDeskUITextTarget>;` | 等待唯一文本出现。 | 观察/查询；可能读取敏感数据，不等于业务完成；Stable | [UI.waitText](../desktop-ui.md#uiwaittexttext-options)；`read desktop-ui UI.waitText` |
| `UI.waitTextGone(text: string, options?: OpenDeskUITextOptions): Promise<true>;` | 等待文本消失。 | 观察/查询；可能读取敏感数据，不等于业务完成；Stable | [UI.waitTextGone](../desktop-ui.md#uiwaittextgonetext-options)；`read desktop-ui UI.waitTextGone` |
| `UI.within(win: OpenDeskWindowInfo): OpenDeskUIWindowScope;` | 同步绑定一个已解析窗口，返回可复用的轻量 UI Scope。 | 需核对正文；不能假定无副作用；Experimental · Local | [UI.within](../desktop-ui.md#uiwithinwin)；`read desktop-ui UI.within` |
| `scope.findImage(template: OpenDeskImageTemplate, options?: OpenDeskUIWindowImageOptions): Promise<OpenDeskUIImageTarget \| null>;` | 同步创建一个绑定到已解析 `WindowInfo` identity 的轻量 UI Scope。构造只复制并校验窗口描述：不截图、不扫描 Accessibility tr…（摘要） | 观察/查询；可能读取敏感数据，不等于业务完成；继承本节限制 | [scope.findImage](../desktop-ui.md#uiwithinwin)；`read desktop-ui scope.findImage` |
| `scope.findImages(template: OpenDeskImageTemplate, options?: OpenDeskUIWindowImageOptions): Promise<OpenDeskUIImageTarget[]>;` | 同步创建一个绑定到已解析 `WindowInfo` identity 的轻量 UI Scope。构造只复制并校验窗口描述：不截图、不扫描 Accessibility tr…（摘要） | 观察/查询；可能读取敏感数据，不等于业务完成；继承本节限制 | [scope.findImages](../desktop-ui.md#uiwithinwin)；`read desktop-ui scope.findImages` |
| `scope.findText(text: string, options?: OpenDeskUIWindowTextOptions): Promise<OpenDeskUITextTarget \| null>;` | 同步创建一个绑定到已解析 `WindowInfo` identity 的轻量 UI Scope。构造只复制并校验窗口描述：不截图、不扫描 Accessibility tr…（摘要） | 观察/查询；可能读取敏感数据，不等于业务完成；继承本节限制 | [scope.findText](../desktop-ui.md#uiwithinwin)；`read desktop-ui scope.findText` |
| `scope.findTextMatches(queries: Array<string \| RegExp>, options?: Omit<OpenDeskUITextMatchOptions, "within">): Promise<OpenDeskUITextMatchGroup[]>;` | 同步创建一个绑定到已解析 `WindowInfo` identity 的轻量 UI Scope。构造只复制并校验窗口描述：不截图、不扫描 Accessibility tr…（摘要） | 观察/查询；可能读取敏感数据，不等于业务完成；继承本节限制 | [scope.findTextMatches](../desktop-ui.md#uiwithinwin)；`read desktop-ui scope.findTextMatches` |
| `scope.findTexts(text: string, options?: OpenDeskUIWindowTextOptions): Promise<OpenDeskUITextTarget[]>;` | 同步创建一个绑定到已解析 `WindowInfo` identity 的轻量 UI Scope。构造只复制并校验窗口描述：不截图、不扫描 Accessibility tr…（摘要） | 观察/查询；可能读取敏感数据，不等于业务完成；继承本节限制 | [scope.findTexts](../desktop-ui.md#uiwithinwin)；`read desktop-ui scope.findTexts` |
| `scope.getValue(target: OpenDeskUILocatorSemanticTarget, options?: OpenDeskUILocatorValueOptions): Promise<string>;` | 同步创建一个绑定到已解析 `WindowInfo` identity 的轻量 UI Scope。构造只复制并校验窗口描述：不截图、不扫描 Accessibility tr…（摘要） | 观察/查询；可能读取敏感数据，不等于业务完成；继承本节限制 | [scope.getValue](../desktop-ui.md#uiwithinwin)；`read desktop-ui scope.getValue` |
| `scope.hasText(text: string, options?: OpenDeskUIWindowTextOptions): Promise<boolean>;` | 同步创建一个绑定到已解析 `WindowInfo` identity 的轻量 UI Scope。构造只复制并校验窗口描述：不截图、不扫描 Accessibility tr…（摘要） | 观察/查询；可能读取敏感数据，不等于业务完成；继承本节限制 | [scope.hasText](../desktop-ui.md#uiwithinwin)；`read desktop-ui scope.hasText` |
| `scope.locator(target: OpenDeskUILocatorTarget): OpenDeskUILocator;` | 同步创建一个 lightweight Locator。Locator 只保存 Scope identity 与复制后的 target description；它不是 `E…（摘要） | 需核对正文；不能假定无副作用；继承本节限制 | [scope.locator](../desktop-ui.md#ui-scope-locatortarget)；`read desktop-ui scope.locator` |
| `scope.readText(options?: OpenDeskUIWindowReadTextOptions): Promise<string>;` | 同步创建一个绑定到已解析 `WindowInfo` identity 的轻量 UI Scope。构造只复制并校验窗口描述：不截图、不扫描 Accessibility tr…（摘要） | 观察/查询；可能读取敏感数据，不等于业务完成；继承本节限制 | [scope.readText](../desktop-ui.md#uiwithinwin)；`read desktop-ui scope.readText` |
| `scope.setValue(target: OpenDeskUILocatorSemanticTarget, value: string, options?: OpenDeskUILocatorValueOptions): Promise<OpenDeskUISetValueResult>;` | 同步创建一个绑定到已解析 `WindowInfo` identity 的轻量 UI Scope。构造只复制并校验窗口描述：不截图、不扫描 Accessibility tr…（摘要） | 有：输入/应用或系统状态改变；继承本节限制 | [scope.setValue](../desktop-ui.md#uiwithinwin)；`read desktop-ui scope.setValue` |
| `scope.tapImage(template: OpenDeskImageTemplate, options?: OpenDeskUIWindowImageOptions): Promise<OpenDeskUITapResult<OpenDeskUIImageTarget>>;` | 同步创建一个绑定到已解析 `WindowInfo` identity 的轻量 UI Scope。构造只复制并校验窗口描述：不截图、不扫描 Accessibility tr…（摘要） | 有：输入/应用或系统状态改变；继承本节限制 | [scope.tapImage](../desktop-ui.md#uiwithinwin)；`read desktop-ui scope.tapImage` |
| `scope.tapTargets(targets: OpenDeskUISemanticTapTarget[], options?: OpenDeskUIWindowSemanticTapOptions): Promise<OpenDeskUISemanticTapResult>;`（2 个声明；--types 核对） | 同步创建一个绑定到已解析 `WindowInfo` identity 的轻量 UI Scope。构造只复制并校验窗口描述：不截图、不扫描 Accessibility tr…（摘要） | 有：输入/应用或系统状态改变；继承本节限制 | [scope.tapTargets](../desktop-ui.md#uiwithinwin)；`read desktop-ui scope.tapTargets` |
| `scope.tapText(text: string, options?: OpenDeskUIWindowTextOptions): Promise<OpenDeskUITapResult<OpenDeskUITextTarget>>;` | 同步创建一个绑定到已解析 `WindowInfo` identity 的轻量 UI Scope。构造只复制并校验窗口描述：不截图、不扫描 Accessibility tr…（摘要） | 有：输入/应用或系统状态改变；继承本节限制 | [scope.tapText](../desktop-ui.md#uiwithinwin)；`read desktop-ui scope.tapText` |
| `scope.tapTexts(texts: string[], options?: OpenDeskUIWindowTapTextsOptions): Promise<OpenDeskUITapTextsResult>;` | 同步创建一个绑定到已解析 `WindowInfo` identity 的轻量 UI Scope。构造只复制并校验窗口描述：不截图、不扫描 Accessibility tr…（摘要） | 有：输入/应用或系统状态改变；继承本节限制 | [scope.tapTexts](../desktop-ui.md#uiwithinwin)；`read desktop-ui scope.tapTexts` |


## Accessibility

Experimental/可信本地授权；AX/UIA、ref 生命周期与坐标映射限制。

来源：[accessibility.md](../accessibility.md)。

| 精确方法；主要输入 → 输出（签名） | 解决的问题 | 副作用；适用限制 | 契约获取 |
| --- | --- | --- | --- |
| `Accessibility.find(selector: OpenDeskAccessibilitySelector, options: OpenDeskAccessibilityFindOptions): Promise<OpenDeskAccessibilityElementRef \| null>;` | 在完整有界搜索中返回唯一受管元素引用。 | 观察/查询；可能读取敏感数据，不等于业务完成；继承本节限制 | [Accessibility.find](../accessibility.md#accessibilityfindselector-options)；`read accessibility Accessibility.find` |
| `Accessibility.getCapabilities(): OpenDeskAccessibilityCapabilities;` | 同步读取 backend、授权、权限、限制与动作能力摘要。 | 观察/查询；可能读取敏感数据，不等于业务完成；继承本节限制 | [Accessibility.getCapabilities](../accessibility.md#accessibilitygetcapabilities)；`read accessibility Accessibility.getCapabilities` |
| `Accessibility.perform(ref: OpenDeskAccessibilityElementRef, action: OpenDeskAccessibilityAction, options?: OpenDeskAccessibilityPerformOptions): Promise<OpenDeskAccessibilityPerformResult>;` | 对受管引用最多提交一次原生动作。 | 有：输入/应用或系统状态改变；继承本节限制 | [Accessibility.perform](../accessibility.md#accessibilityperformref-action-options)；`read accessibility Accessibility.perform` |
| `Accessibility.read(ref: OpenDeskAccessibilityElementRef, options?: OpenDeskAccessibilityReadOptions): Promise<OpenDeskAccessibilityReadResult>;` | 读取受管引用的白名单属性。 | 观察/查询；可能读取敏感数据，不等于业务完成；继承本节限制 | [Accessibility.read](../accessibility.md#accessibilityreadref-options)；`read accessibility Accessibility.read` |
| `Accessibility.release(ref: OpenDeskAccessibilityElementRef): Promise<boolean>;` | 释放当前 execution 创建的元素引用。 | 需核对正文；不能假定无副作用；继承本节限制 | [Accessibility.release](../accessibility.md#accessibilityreleaseref)；`read accessibility Accessibility.release` |
| `Accessibility.snapshot(options: OpenDeskAccessibilitySnapshotOptions): Promise<OpenDeskAccessibilitySnapshotResult>;` | 在明确 scope 内读取普通数据树。 | 需核对正文；不能假定无副作用；继承本节限制 | [Accessibility.snapshot](../accessibility.md#accessibilitysnapshotoptions)；`read accessibility Accessibility.snapshot` |


## 生成依据

维护命令：`node scripts/api-docs.js generate`；校验：`node scripts/api-docs.js check`。不能手工改本表；修改 canonical 正文/类型后重生成。下面是内容版本，不把旧行号当成当前定位。


- `docs/api/desktop-ui.md` SHA-256 `db569ea662dca041f89a03a8e1c05d150c2fb8aef56a91c9f732f82eaef72d91`

- `types/UI.d.ts` SHA-256 `be602cd9f79d4cbb8d25614d01d2f3b7def264e5c6e16e30bbee5377c3cd1b5e`

- `docs/api/accessibility.md` SHA-256 `ddbabb31c1226afe8795a902408a49deb38faae4314453055c995aa9b4bce324`

- `types/Accessibility.d.ts` SHA-256 `6f47b859b86761f5a1f904d518d65482c9fe32b29169e6448d406e13878b49fa`
