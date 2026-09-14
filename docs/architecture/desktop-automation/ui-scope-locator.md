# 窗口作用域与轻量 Locator：不依赖 UI 树的高层 UI 接口

## 1. 目标需求与最终决定

状态：用户已确认的设计与实施合同；本文不是新增 API 已发布、代码已完成或真机验收已通过的声明。

让普通 OpenDesk JavaScript 可以围绕一个实际窗口和可重复定位的目标编写自动化；目标可以来自原生语义、屏幕文字或图片。没有 UI 树时，受支持的视觉查找、等待与点击仍可使用；无法证明的字段值、控件状态或业务结果必须明确保留未知或报告不支持。

最终链路：

```text
解析一个真实窗口
→ 可选绑定 UI 窗口作用域
→ 定义轻量 Locator
→ 按本次操作重新定位和检查实际能力
→ 查找／等待／点击／原生字段读写
→ 返回真实观察或动作结果
→ 业务脚本独立验证最终结果
```

冻结决定：

| 问题 | 决定 |
| --- | --- |
| 是否把一个窗口变成 Page | 不改造现有 `page`；使用 `UI.within(win)` 创建 UI 作用域。 |
| 是否支持控件对象 | 支持轻量 Locator；保存范围和目标描述，不长期持有 UI 树节点或旧坐标。 |
| 是否依赖 UI 树 | 不依赖。按目标与操作检查实际能力，不按整个应用统一开关。 |
| 是否替换已有函数式调用 | 不替换。简单任务继续使用 `UI.tapTexts` 等现有接口。 |
| find 返回什么 | 一次观察快照或 `null`，不是可执行对象。 |
| waitFor 返回什么 | `Promise<void>`；只等待条件，不充当对象工厂。 |
| 是否使用 `item.value = text` | 不使用。真实读写使用 `await item.getValue()`／`setValue()`。 |
| 是否自动无限换策略 | 不允许。只在目标、操作语义、权限和动作提交状态允许时切换。 |
| 归属 | Runtime 高层 UI 框架能力，不是 `apps/` 中的独立产品应用。 |

本轮不再展开完整浏览器式 Page/DOM 框架，不重复建设 Accessibility、Recorder、Execution 或通用自动修复平台。

## 2. 与已有合同的关系

本设计扩展调用方式，不撤销已有公开合同：

- [Desktop UI API](../../api/desktop-ui.md)：已发布方法的参数、返回值和错误合同。
- [Window API](../../api/window.md)：窗口查询、WindowInfo、身份刷新和单目标范围。
- [Page API](../../api/page.md)：现有截图、通用等待、打开应用和权限入口；不是 DOM Page。
- [Accessibility API](../../api/accessibility.md)：原生观察、字段读取、动作和 execution-owned refs。
- [UI.tapTargets 自动定位](ui-tap-targets-auto-resolution.md)：已有 semantic target、内部策略、顺序执行和 legacy 兼容路径。
- [Action Target Model](action-target-model.md)：证据、消歧、前后条件与安全失败。
- [定位维修方法](../../frameworks/ui-locator-repair.md)：复用资产、无输入预检、最小实测和定向维修。

实施时以当前源码、类型、测试和 Reference 核对实际状态，不把历史对话或本文当作已实现接口清单。已有 semantic `tapTargets` 应直接复用；legacy `{ locator: ... }` 的兼容语义不得因增加对象层而改变。若源码与文档有差异，应明确记录并同步，不能覆盖并行会话的有效实现。

本文负责 Scope/Locator 的设计决定；正式发布时，方法合同进入现有 canonical Reference 和类型，不把本文件变成第二份 API Reference。

## 3. 推荐调用方式

本节包含拟新增 API，表示目标使用效果，不能据此宣称当前 Runtime 已可直接执行。

### 3.1 简单任务保持原写法

```js
await UI.tapTexts(["2", "5", "×", "4", "="], { within: win });
```

不要求每个按钮都创建对象，不强制迁移已有 Recipe。

### 3.2 同一窗口内多次操作：绑定范围

```js
const win = await window.wait({ title: "测试表单" });
const form = UI.within(win);

await form.tapTexts(["设置", "高级"]);
```

`UI.within(win)` 同步创建轻量作用域。它只接受已经解析、结构有效的 WindowInfo，不承担按标题猜测、启动应用或等待窗口的职责。

创建时不查树、不截图、不激活窗口、不输入、不创建新 Execution，不修改全局默认窗口。保存不可被调用方后续修改污染的窗口身份描述；存活性在真实观察／动作时重新检查。

作用域内不得再次传入另一个 `within` 偷换窗口。窗口移动或缩放只刷新同一身份的几何信息；窗口关闭、重建或身份无法验证时安全失败，不能改绑同名窗口。创建作用域不会使全局 `keyboard`、`mouse` 或 `page.keyboard` 自动变成该窗口专属输入设备。

### 3.3 重复使用同一目标：定义 Locator

```js
const save = form.locator({ text: "保存" });
const observed = await save.find();
await save.waitFor({ state: "visible", timeout: 5000 });
await save.tap();
```

不要求每次点击前都先 find、再 wait；上例只是分别展示方法。日常调用可以直接 `await save.tap()`，由动作路径完成其必要的操作前检查。

原生文本框读写：

```js
const input = form.locator({
  role: "textField",
  identifier: "messageInput",
});

await input.waitFor({ state: "exists", timeout: 5000 });
await input.setValue("你好");
const actual = await input.getValue();
console.log(actual);
```

示例中的窗口与 identifier 是测试目标配置，不是 OpenDesk 内置应用适配规则。

## 4. 对象、目标与观察结果

### 4.1 三个概念不能混合

| 对象 | 含义 | 生命周期与用途 |
| --- | --- | --- |
| Locator | 窗口范围 + 目标描述 | 当前执行内可重复调用；不是某个长期原生节点。 |
| TargetMatch | 一次有界观察的普通数据 | 可记录和诊断，不是下一次操作的授权或永久坐标。 |
| Accessibility ElementRef | 原生受管引用 | 继续由既有 Accessibility owner 管理，不改变高级接口生命周期。 |

`scope.locator(target)` 同步复制、校验目标描述，不观察桌面，不保证目标此刻存在，不创建长期原生 ref。

每次方法调用重新验证同一窗口和目标。内部按需短暂持有 ref，结束时释放；不能把旧 ref、树节点编号或截图中心点当作跨运行身份。Locator 不通过 JSON 传到另一 Execution 继续使用；需要保存的是普通目标描述和已有配套证据。

### 4.2 三类简洁的目标表达

```js
form.locator({ role: "button", name: "保存" }); // 原生语义
form.locator({ text: "保存" });                 // 文字目标
form.locator({ image: "./assets/save.png" });   // 图片目标
```

语义目标必须满足提供的 role/name/identifier 约束；不得降级成无法证明这些约束的 OCR 候选。文字观察关注当前范围实际显示的文字；隐藏 accessible name 不能被作为可见文字返回。图片观察复用现有视觉素材、坐标和匹配机制，不伪造原生 role 或 identifier。

三类是推荐表达方式，不是重新破坏已有参数兼容性的理由。已有 semantic `tapTargets` 支持的 text 与原生约束组合继续按原合同处理；不要仅为接口整齐拒绝已经支持的合法组合。新 Locator 不引入图片、语义、权重、OR 条件与 fallback 顺序混杂的万能对象，不把策略参数放进普通目标。

首版默认精确匹配，复用已有规范化规则；不新增模糊匹配 DSL，不改变已有 OCR 接口的正则／匹配选项。不得全局猜测按钮别名、翻译名称或默认取第一个候选。

首版不承诺完整嵌套 Locator 查询。若某个任务需要父容器约束才能唯一定位，继续使用已支持的容器能力或明确阻塞；不能丢掉必要约束后全窗口查找。已有容器合同不得因本文件被删除。

### 4.3 一次观察的返回边界

`find()` 返回当前匹配快照，不承诺目标之后仍有效：零匹配在受支持且完整的本次观察范围内返回 `null`；唯一目标返回快照；多个候选或无法证明唯一时分别报告歧义或搜索不完整。

视觉零匹配仅表示本次指定可见范围内未识别到目标，不表示应用中永久不存在该对象。语义遍历完成也不等于应用已经暴露所有画面内容；纯视觉目标不能因原生树未匹配就提前返回 `null`。

快照保留必要的来源、范围、观察时间与完整性说明，并复用现有 tagged bounds 类型。无法读取的状态用现有可空／未知表达；不得伪造 `false`、空 value、原生属性或统一 confidence。默认不额外采集敏感字段值；字段值通过明确读取获取，沿用密码与受保护内容边界。

Locator 本身不提供看似实时的 `.value`、`.enabled` 或 `.bounds` 属性，也不把观察快照混入可执行方法。

## 5. P0 方法与等待合同

### 5.1 最小方法集合

| 方法 | 首轮行为 |
| --- | --- |
| `locator.find(options?)` | 一次有界观察，返回 TargetMatch 或 null；不是等待未来目标出现。 |
| `locator.waitFor(options?)` | 只读等待明确状态，返回 Promise<void>。 |
| `locator.tap(options?)` | 复用适用的现有 tap 路径、目标校验和动作结果，不新增独立点击执行器。 |
| `locator.getValue(options?)` | 严格原生完整字段值读取，复用 UI.getValue 合同。 |
| `locator.setValue(value, options?)` | 严格原生完整值设置与回读，复用 UI.setValue 合同。 |

窗口绑定的现有方法如 `scope.tapTexts()`、`tapTargets()`、`findText()`、`findImage()` 只省去重复的 `within`。只绑定已经支持的方法，不为了对称一次发布所有新方法。

若本轮补充函数式 `UI.findTarget()`、`UI.waitFor()` 或已有同等入口，必须与 Locator 方法共用同一个实现，不能出现不同的观察或等待合同。不新增 `UI.readTarget()`、`UI.element()`、`UI.$()`、桌面 `page.locator()` 等竞争入口；`UI.tapTarget()` 仅在需要稳定公开单目标入口时作为同核便捷方法，不是另一个执行层。

### 5.2 等待职责不混用

| 场景 | 入口 |
| --- | --- |
| 等待实际窗口 | `window.wait()` |
| 等待目标状态 | `locator.waitFor()`／同核 `UI.waitFor()` |
| 任意 JavaScript 条件 | 现有 `page.waitForFunction()` |
| 固定延迟 | 现有 `page.waitForTimeout()` |

不向 `page.waitFor(number | function)` 增加 target 或 selector 字符串重载。可以共享 timer、deadline、取消设施，但不能直接继承通用条件轮询吞掉异常的行为。

`waitFor` 使用小型 `state` 枚举，默认 `exists`，不引入复杂条件 DSL。首轮闭合存在／视觉出现的等待；`gone`、`enabled`、`disabled` 等状态仅在合同与可靠证据同时实现时发布，不为枚举对称伪造支持。

- `exists`：在目标类型定义的观察范围内能够可靠解析目标；原生存在不等于可见。
- `visible`：当前观察有足够的显示证据；文字／图片可使用实际可见范围中的匹配，原生 offscreen=false 或非空 bounds 单独不足以证明鼠标能命中。
- `gone`：受支持、有效且足够完整的本次范围内无匹配；对视觉目标只表示当前可见范围未观察到，不宣称对象已被应用删除。不能用查询失败或失效 ref 证明消失。
- `enabled/disabled`：目标存在，并有可靠对应状态证据；纯视觉颜色或控件外观不自动成为该属性。

权限失败、窗口身份失效、非法参数、明确不支持和无法消歧应及时报告；暂未满足或暂时未知可以在剩余预算内继续只读观察。超时携带最后观察和原因，不能把已知不支持伪装成普通定位超时。

等待不点击、不激活、不滚动，也不物化虚拟列表。条件成立后，下一次动作仍重新检查，waitFor 不提供持久有效性保证。

### 5.3 自动等待、超时与取消

新的 Locator tap 可在同一个总 deadline 内等待本次动作所需条件；自动等待仅针对观察与动作前条件，不包括重新提交可能已发生的输入。既有函数的默认等待和 timeout 含义保持兼容，不通过对象包装偷偷改变。

getValue/setValue 保持原严格值方法的即时有界操作语义；需要先等字段出现时使用 waitFor。底层不能真正接受或执行的 signal 不得在对象层假装支持。

一次调用的排队、定位、检查、动作与验证共享剩余预算，不按后端或阶段重新计时。每轮等待最多一个在途观察。取消复用现有 execution 管理：阻止后续输入、释放本次 refs/listeners/timers，保留已完成前缀和不确定动作状态；不宣称能撤回已提交的同步 native 调用。迟到回调不得触发后续动作，清理错误不能覆盖原始错误。

## 6. 没有 UI 树时的能力合同

统一对象形态不等于每个目标都有同样能力。能力判定发生在“实际目标 + 本次操作 + 当前授权与证据”上，不要求普通脚本每次先手工查询全局 capability。

| 操作 | 原生信息可靠 | 只有屏幕画面 |
| --- | --- | --- |
| 查找与点击 | 语义定位及适用的原生或输入路径 | 文字／图片路径独立可用，检查窗口、唯一性、坐标和命中条件。 |
| 等待视觉出现 | 可使用足够的显示证据 | 使用有效截图中的文字／图片观察。 |
| getValue | 读取实际完整字段值 | 没有同目标原生字段证据时明确不支持；OCR 不冒充完整 value。 |
| setValue | 控件支持动作时原生设置并回读 | 明确不支持原生写值，不自动改成键盘输入。 |
| enabled/checked 等状态 | 读取对应属性或已验证的能力证据 | 没有可靠规则则未知或不支持，不按颜色推断。 |
| fill | 后续经验证的高层填写 | 需同时证明输入目标、焦点、替换语义和验证方式，P0 不承诺。 |

只看到输入区中的若干字不证明完整内容正确。当前提供的目标没有对应字段读取能力时，应尽早报告不支持，而不是等待后返回空字符串。

UI 树不可用不能让文字／图片 Locator 的构造、观察或点击整体失败。反过来，也不能用视觉通道绕过作用于该目标或操作的授权限制、受保护内容策略或已知 disabled 状态。

## 7. 共享执行核心与多源策略

```text
已有 UI.* 函数式调用
＋ 窗口作用域调用
＋ Locator 对象调用
    ↓
同一套范围解析、候选判定、操作检查、动作执行与诊断
    ↓
现有 Accessibility / OCR / 图片匹配 / 受控输入能力
```

Scope/Locator 是薄组合层。平台资源、输入提交和 execution 生命周期仍由现有 native owner 承担；polyfill 可以负责参数绑定和组合，不复制 native global，不创建第二 Runtime、窗口权限模型或长期原生引用系统。

不规定所有操作都走同一个 `AX → OCR → 图片 → 坐标` 队列。已有 text-only tapTargets 的策略和 native semantic 约束继续由其既有合同约束；新增观察、可见性等待和字段读取按各自要证明的事实选择证据。

特别区分：一个动作路径能按 accessible name 激活目标，不等于 findText 或 visible 等待已经证明同名文字显示在屏幕上。共享代码不能消除这项合同差异。

切换路径必须满足：

1. 本次动作尚未提交，或 backend 可靠证明 not_started；仅仅没有成功响应不是证明。
2. 新证据仍证明同一目标和所有必要约束，不丢弃 identifier、role 或容器条件。
3. 操作语义等价；invoke 不能替代右键、双击、拖拽或必须发送真实鼠标事件的任务。
4. 权限允许，且没有未解决的歧义、窗口失效或反对执行的可靠状态证据。

一旦 actionState=unknown 或输入可能发生，停止；不补点、不补键、不重放完成前缀。原生 acknowledged、控件状态验证和业务成功分别报告，不能相互替代。

诊断复用已有 code/operation/phase/actionState、failedIndex、completed、attempts、cause 等适用字段；观察失败、未找到、歧义、不支持、未知状态、取消和动作结果不明必须可区分。默认不把完整屏幕、输入秘密或敏感值塞进日志。

## 8. Recorder、适配与性能边界

Recorder／生成工作流保留已验证的窗口、语义、文字、图片、区域和结果读取证据，生成代码只输出最小但充分的目标信息；必要容器约束不能为了简短而删除。

只有 identifier、没有 UI 树和任何等价画面证据时，Runtime 无法凭空找到对应屏幕区域。配套证据复用已有 AppProfile／helper／录制资产，不在本轮新建全局 target registry 或自动修复平台。

特殊应用的 OCR 别名、布局限制、图片素材和输入规则优先在开发期验证并保存。正常 Recipe 不在每次失败后让模型自由猜测目标或修改业务步骤。代码／配置中仍只描述部署环境的一个实际窗口，不扩展 WindowTarget 为平台路由表。

性能先做有界范围、必要属性、同次观察复用和资源释放；不要每次点击无条件全树扫描。缓存、事件驱动等待、虚拟列表、复杂嵌套查询和自动滚动后置。缓存不是当前状态证明，事件只触发重新观察。性能结论记录调用次数与耗时，不预先宣称收益百分比。

## 9. 实施顺序与交付物

### L0：本轮闭环

```text
复用当前 semantic tapTargets、视觉查找与原生值能力
→ 最小共享执行逻辑
→ UI.within 与 Locator 构造
→ find / waitFor / tap
→ getValue / setValue 同核绑定
→ 三类定位与能力缺失测试
→ Reference、types、机器索引、示例与验收记录同步
```

先做一个受控测试窗口的原生字段闭环，再验证部分 UI 树和无 UI 树的视觉路径；不只完成对象外观就宣布结束。

交付包含实际源码、JavaScript Runtime 合同测试、明确可运行的示例和实施状态记录。框架源码不放 `apps/`；示例、稳定 fixture 和运行产物按现有仓库规则归属，日志与截图写 `.runtime/`。不用 Node runner 代替普通 OpenDesk JavaScript。

### L1：L0 通过以后再做

`fill/focus`、状态设置、目标滚动显现、必要的嵌套容器定位与 Recorder 更广泛消费。每项必须有真实任务需求、能力合同和独立验证；不一次新增所有名字。

### L2：按证据优化

虚拟集合物化、批量观察、事件与缓存、更多应用族资格验证。不把 Collection、业务 App Adapter 或所有浏览器 Locator 功能并入 L0。

## 10. 完成标准与证据

| 编号 | 验收项 | 必须证明 |
| --- | --- | --- |
| A1 | 构造与范围 | within/locator 构造零桌面副作用、零长期 native ref；参数快照不受外部修改污染。 |
| A2 | 原生完整场景 | 唯一定位、状态等待、tap、setValue 与实际 getValue 回读闭环。 |
| A3 | 部分 UI 树 | 一个应用不同控件按实际能力执行，不因局部语义缺失整体失败。 |
| A4 | 无 UI 树 | 文字／图片查找、出现等待与点击可独立运行；不得把有树但空结果的 mock 当成全部真实证据。 |
| A5 | 能力边界 | 纯视觉目标不伪造完整 value、enabled 或 checked；明确不支持不伪装成普通 timeout。 |
| A6 | 身份与消歧 | 窗口移动后仍操作同一窗口；关闭重建、同名窗口、多个目标和必要容器约束有正确结果。 |
| A7 | 负向观察 | 权限／截图失败、树截断、未物化、遮挡和失效引用不被误判成消失或业务完成。 |
| A8 | 动作安全 | uncertain/部分成功后停止；无重复提交，保留完成前缀和错误来源。 |
| A9 | 取消与清理 | 取消阻止后续动作，处理在途／迟到结果，refs/listeners/timers 不泄漏；不承诺强撤回。 |
| A10 | 兼容一致性 | 原函数、scope 和 Locator 复用相同底层合同；legacy tapTargets、OCR 结果、page/window 和严格值方法无静默回归。 |
| A11 | 发布合同 | 实现、Reference、类型、机器 API 索引、示例和测试一致；新名字不只存在于文档。 |
| A12 | 实证 | 区分静态、模拟、真实 Runtime 和 macOS/Windows 真机结果；记录调用与耗时，未执行不标 PASS。 |

真实输入只使用受控 fixture 或用户明确授权的低风险目标；不为了验收向真实客户发送消息、提交订单、付款或删除数据。

宿主模拟测试验证合同与故障路径，真实 OpenDesk Runtime 测试验证实际注入与调用；两者不能互相冒充。目标平台或桌面权限暂不可用时，交付可执行测试、已完成代码与明确 BLOCKED 项，不补造通过结论，不因缺一项真机条件放弃其他交付。

最终验收目标为 ≥95/100：语义与范围 25、动作安全 25、生命周期 15、平台与兼容 15、API/生成可维护性 10、性能与诊断 10。误点、结果不明时重做、伪造成功／能力、越权或破坏既有合同属于硬性不通过，不能用总分抵消。设计保存不等于取得该分数。

## 11. 当前交付与接续

本文初次保存只完成设计与实施交接，未执行 L0 代码开发或桌面验收。下一会话先按当前实际资产给出“可复用／需补齐／被证据阻塞”的简表，然后直接进入 L0 源码、测试和修复；不要从头重复方案讨论。

实施过程中只回写关键决定、已实现范围、测试结论和剩余阻塞。不得把本文所有拟定方法直接标成 Stable；具体发布合同落到 canonical API Reference。

## 附录 A：新对话实施提示词

复制以下提示词开始下一轮。本文件是设计依据；提示词不重复维护完整技术合同。

```text
# OpenDesk：实施窗口作用域与轻量 Locator L0

## 目标需求

让普通 OpenDesk JavaScript 能围绕一个实际窗口和可重复定位的目标完成查找、等待、点击及受支持的原生字段读写。

最终链路必须成立：
解析真实窗口 → UI.within(win) → locator(target) → find/waitFor/tap/getValue/setValue → 实际状态验证。

目标支持原生语义、屏幕文字和图片。没有 UI 树时，文字／图片查找、等待与点击仍可使用；无法读取完整字段值或可靠控件状态时明确报告，不伪造能力或成功。现有 UI.tapTexts/UI.tapTargets 等简单调用继续可用。

## 当前状态

正式设计位于：
docs/architecture/desktop-automation/ui-scope-locator.md

以该文档为本轮设计和验收边界，先完整读取。复用当前已有 semantic tapTargets、Accessibility、OCR、图片定位、原生值读写和执行生命周期；文档中的新增接口不代表已实现，也不要重做已完成能力。

## 本轮执行

先用简表说明当前可复用、需要补齐和被证据阻塞的部分，然后直接实施 L0，不再从头讨论命名与总体架构。

完成 UI.within(win)、scope.locator(target) 和最小 find/waitFor/tap/getValue/setValue 对象层。构造不操作桌面；方法调用重新验证同一窗口和目标。函数式、scope 和 Locator 共用同一套执行逻辑。

保留 page、window、既有文本／图片返回合同和严格 getValue/setValue 语义。tap 只在动作前进行必要等待，动作可能已提交后不再切换后端重做。

完成实际源码、JavaScript Runtime 测试、可运行示例，以及对应 Reference、类型和机器 API 索引同步。先验证受控原生表单，再验证部分 UI 树和无 UI 树的文字／图片场景。发现失败后沿失败链路最小修复并重验。

结果先给完成项、未完成项和下一步，再列必要证据；不得只输出审计报告、计划或新的提示词。

## 完成标准

1. Scope/Locator 构造无桌面副作用，不保留长期原生引用；窗口移动后仍绑定原窗口，身份失效不改绑同名窗口。
2. 三类目标按真实能力完成 find/waitFor/tap；无 UI 树不导致视觉接口整体失败。
3. 原生文本框完成 setValue 和实际 getValue 回读；纯视觉目标不把 OCR 当作完整字段值。
4. 歧义、观察不完整、权限失败、不支持与暂未满足可区分，不把失败解释成消失或成功。
5. 超时、取消、部分成功和未知动作状态安全收口，无重复提交、后续误操作或资源泄漏。
6. 原函数调用、scope 和 Locator 共享行为，旧 API 合同无静默回归，源码／文档／类型／索引／示例一致。
7. 按正式设计记录验收证据；静态、模拟、真实 Runtime 和各平台真机结果分开。未执行项目明确标为未运行或 BLOCKED，不虚报 PASS 或评分。

## 必要边界

不改造 page 为窗口对象；不实现隐式异步 .value 赋值；不新建 Runtime、全局目标注册或自动修复平台。
本轮不扩展 fill/focus、完整嵌套查询、滚动／虚拟列表、事件缓存和 Recorder 全面重构。
保留并行会话的有效修改；复用已有资产，不覆盖、回退或破坏性清理。
真实输入仅限受控 fixture 或已获授权的低风险目标；缺少桌面条件时先完成可验证交付，并明确剩余阻塞。
```
