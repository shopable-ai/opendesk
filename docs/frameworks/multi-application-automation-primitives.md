# 多应用自动化高频框架能力

## 定位与状态

本文回答一个具体问题：哪些代码不应由 Calculator、TextEdit、Safari、微信、千牛、拼多多等 Recipe 反复实现，而应成为 OpenDesk 的跨应用框架能力。

状态：2026-09-10 的实施路线图。`UI.getValue()`／`UI.setValue()` 已按 Experimental local 能力进入当前工作树；其余未在 API Reference、类型和 manifest 同时出现的方法名仍只是用于冻结职责和验收范围的设计草案，不是当前已公开 API。实际实现仍须按[Runtime API 扩展与定制框架](runtime-api-extension-framework.md)完成 owner、类型、API 文档和 Runtime 测试。

目标不是隐藏业务逻辑，而是让生产 Recipe 主要保留：应用／窗口目标、页面或布局约束、业务值、业务步骤和影响后续控制流的状态判断。窗口枚举、身份重验、坐标空间转换、原生 ref 清理和通用轮询不应在每个 Recipe 中重写。

### 当前实现状态

| 项目 | 状态 | 当前边界 |
| --- | --- | --- |
| 批次 A.1：Recorder 生成物消费 Geometry | 当前工作树已实现；正式 JavaScript 合成 Gate 8/8 通过 | basic generator 使用既有 `Geometry.pointOffset()`、`Geometry.contains()` 和 tagged `mouse.clickPoint()`，不新增 Runtime API；仍不能关闭窗口解析到输入提交之间的竞态 |
| Calculator 生产 Recipe 的 Geometry 收敛 | 当前工作树已实现；golden／源码冻结静态检查通过，新源码的 live 资格待重跑 | 保留 active-window、固定布局和 `mouse.clickForPID()` 门禁，只移除手写 `active.x/y + offset`；当前源码 SHA-256 为 `751d25b682c9d1591507cddacee298a51d298ef9658d6c8b03e96a996c8a7e96` |
| TextEdit 校准 | 已有独立 Recipe 代码证据；未形成 human production/gate 双层基线 | 现有 AI CLI Recipe 已使用 `Geometry.pointPercent()`、`Geometry.contains()` 和 `mouse.clickPoint()`，但运行、截图、断言和 evidence 仍混在一个文件中 |
| 批次 B.1：原生文本值 facade | 当前工作树已实现；Experimental local；current-source deterministic 17/17 与 Recorder 14/14 通过 | `UI.getValue()`／`UI.setValue()` 复用现有 `Accessibility.find/read/perform/release`；current8 Recorder 已证明同一 locator/ref/actionState 合同和专用文本 patch 可共存；Windows UIA 真机仍需独立验证 |
| 批次 B.2：其他语义控件 facade | 设计候选 | 多属性读取继续使用 `Accessibility.read()`；`UI.invoke()`、通用 `UI.read()` 与 checkbox／range／selection 等尚未公开，不建立同义入口或第二套 locator |
| 结构化界面集合读取 | **设计候选；v0.3 边界已冻结** | 当前只冻结“当前明确观察范围 → generic CollectionItem[]”的合同方向；复用 AX/UIA、OCR、Layout/Image、截图和 application-engineer。滚动、分页、跨批去重、结束判断归 Recipe；不再把 `UI.collectCollection()` 作为目标公共 API。详细正文见[结构化界面集合读取](../architecture/desktop-automation/structured-ui-collection-reading.md) |
| 批次 C：精确窗口生命周期 | 设计草案 | 当前 title/PID mutation 没有在所有平台贯穿 exact native handle，不能把工作形状当作已实现 API |
| 批次 D：确切窗口内原子动作 | 设计草案，依赖 C | 当前 `mouse.clickForPID()` 只提供 macOS PID-scoped AXPress，不是 exact-window action receipt |
| 批次 E：生产 Recipe 全量迁移 | 未开始 | Calculator 的单项 Geometry 收敛不等于 Calculator/TextEdit 已完成全部通用样板迁移 |

状态必须按“设计草案／工作树已实现／静态或合成已验证／真实应用已验证”分别报告；不得用较低一层替代较高一层。

## 一、跨应用重复证据

对 `examples/**/*.js` 的静态初筛得到以下重复面；计数用于判断工程优先级，不是覆盖率或质量分数：

| 重复面 | 命中文件数 | 代表应用／表面 | 当前问题 |
| --- | ---: | --- | --- |
| `window.list()` | 34 | Calculator、TextEdit、Safari、微信、千牛、拼多多 | 每个脚本自行按 PID、路径、标题和尺寸筛选唯一窗口 |
| `window.getActiveWindow()` | 37 | 同上及 Custom UI | 重复比较 id／PID／title，并自行决定是否拒绝或重新聚焦 |
| `window.focus()`／`bringToTop()` | 25 | Safari、微信、千牛、测试窗口 | 标题型 mutation 与后续焦点轮询散落，精确窗口身份不能贯穿动作 |
| 鼠标动作 | 26 | Calculator、TextEdit、微信、千牛、拼多多 | 语义控件、窗口内相对点和全局坐标混在业务代码中 |
| 手工窗口坐标相加 | 14 | Calculator、TextEdit、微信、千牛 | 重复 `win.x + offset`；Geometry 已有能力却没有和窗口动作原子结合 |
| 固定等待或自建轮询 | 56 | Calculator、TextEdit、Safari、微信、千牛、拼多多 | readiness、焦点、元素出现和业务后置各自重写 |
| Accessibility ref 生命周期 | 当前公开示例 2 | 原生控件、菜单 fixture | `find → read/perform → finally release` 对普通 Recipe 过于底层 |

这组证据已经足以进入跨应用公共能力设计，但不表示所有命中文件都应机械迁移，也不表示设计草案已经通过真实应用资格。

另一类跨应用重复问题是会话列表、消息 timeline、订单／商品／文件／联系人、table/grid/cards/tree 等重复 UI。它不能通过一个同时负责区域发现、OCR/VLM、业务 schema、滚动、分页和去重的 `UI.extractList()` 解决。

当前统一边界：

```text
当前明确观察范围
→ ObservationBundle
→ 记录分段
→ 字段归属
→ 结构验证
→ generic CollectionItem[]
→ App Adapter 解释业务字段
→ Recipe 决定滚动 / 分页 / 去重 / 结束 / 后续动作
```

## 二、目标分层

```text
业务 Recipe / AppProfile
  只给出目标、布局约束、业务参数与步骤
        ↓
JavaScript 高层 facade
  组合语义查找、读取、动作、等待与资源清理
        ↓
Go / native Runtime
  保证应用/窗口身份、OS 权限、坐标与动作原子性、取消和错误状态
        ↓
平台 backend
  macOS AX / WindowServer、Windows UIA / Win32 等
```

归属判断不看“最终由 JavaScript 调用”，而看不可分割的正确性边界。纯组合放 JavaScript；身份、权限、native handle、竞态和 execution lifecycle 放 Go；应用按钮名称、区域、模式和恢复策略仍留在 AppProfile／Adapter／Recipe。

Structured Collection Reading 沿用同一原则，但当前不提前决定它一定是 Go Runtime API。先用现有 Accessibility、Vision、Geometry 和普通 JavaScript 验证 `ObservationBundle → CollectionItem[]` 合同；只有出现跨应用重复且 JS 无法可靠承担的生命周期、性能或原子性问题，再评审公共 facade/native owner。

## 三、优先能力清单

| 优先级 | 能力 | 建议 owner | 主要消除的 Recipe 代码 |
| --- | --- | --- | --- |
| P0 | 精确窗口解析、刷新与激活 | Go `window` owner＋薄 JS 映射 | `window.list().filter()`、`sameWindow()`、标题型 focus、手写焦点轮询 |
| P0 | 语义控件读取与动作 facade | `polyfills/006-ui.js` 组合现有 Go Accessibility | `find → read/perform → finally release`、每个应用的相同唯一性和 ref 清理代码 |
| P0 | 确切窗口内相对点原子动作 | Go `mouse/window/accessibility` 共同 native owner，公开位置最终只选一个 | `active.x + offsetX`、动作前再次核对 PID／窗口、坐标与点击之间的竞态 |
| P1 | 当前观察范围的 Structured Collection core | 先用普通 JS 组合 Accessibility / Vision / Geometry；是否升级公共 facade 后评审 | 各应用重复的 item 分段、字段归属、多源 evidence 归一和结构验证 |
| P1 | 窗口、语义控件、图片和属性状态等待 | JS 轮询策略＋Go 新鲜身份/取消能力 | `for + Date.now + sleep + reread`、无理由固定等待 |
| P1 | 读取或完整设置原生文本值 | 当前 `UI.getValue()`／`UI.setValue()` JS facade 组合 native Accessibility | 普通脚本中的唯一查找、同-ref 读写、回读验证和 ref 清理样板 |
| P1 | 统一 Action Receipt 与失败分类 | Go 原始 action state＋JS 规范化 | 各 Recipe 自建 `acknowledged/unknown/not-started`、重试和错误包装 |
| P2 | Locator portfolio、局部观察缓存和漂移诊断 | 框架服务／JS 策略，按实际 backend 分层 | 大型应用中重复的 OCR、图片、AX 候选排序和缓存失效代码 |

滚动／分页 traversal 目前**不作为 Structured Collection 公共能力批次**。Recipe 可以复用已有 scroll/wait/target primitives，但继续承担业务上的继续条件、跨批 identity/去重和结束判断。

## 四、P0 合同草案

以下名称只表示能力形状，正式 API 评审可以改名。

### 4.1 精确窗口目标

工作形状：

```js
const target = await window.resolve({
  app: { bundleId: 'com.apple.calculator' },
  title: 'Calculator',
  require: { visible: true, width: 232, height: 321 },
});

const current = await window.activate(target, { timeout: 3000 });
```

必须满足：

- 用稳定应用 identity 限定候选；多实例、多窗口或 unresolved identity 默认拒绝，不选第一个。
- 返回可在当前 execution 内重新解析的确切窗口 identity，并保留当前普通 `WindowInfo` 观察。
- `activate` 接受确切目标而不是只接受标题；完成前原生验证前台／焦点，返回新的当前观察。
- `refresh/current` 重新验证同一生命周期；窗口关闭重建、PID 实例变化或 handle 失效返回 `STALE_TARGET`。
- 通用 `require` 只执行调用方给出的尺寸、可见性或 popup 约束；框架不内置某个应用的数字。

该能力属于 Go，因为当前各平台窗口身份、前台策略和 focus verification 已由 native Window owner 掌握。JavaScript facade 只负责友好的 selector/options。

### 4.2 原生文本值快捷操作

当前 Experimental local 调用：

```js
const value = await UI.getValue(
  { role: 'textField', identifier: 'total' },
  { within: current },
);

const receipt = await UI.setValue(
  { role: 'textField', identifier: 'total' },
  '00123\n中文',
  { within: current },
);
```

必须满足：

- 复用现有 `Accessibility.find/read/perform/release`，不创建第二个原生 Accessibility runtime。
- `within` 必须显式给出；完整搜索并证明唯一；未找到、歧义、搜索不完整、disabled、readonly、protected 或 unsupported action 分别 fail closed。
- selector、scope、唯一性和 stale ref 规则与 `Accessibility.find()` 相同；标签只是证据。
- `getValue()` 只返回原生字符串 value；空字符串、前导零、Unicode、空白和换行原样保留，不用 name、OCR 或数值转换补值。
- `setValue()` 只接受完整字符串，只支持非受保护、未明确 disabled、可原生 `setValue` 的 text field。
- 整个操作共用一个有界 deadline；当前 owner 未接通 per-call cancellation，因此不公开假的 `signal` 语义。
- `setValue()` 最多提交一次动作；回执保留 native `actionState`，`acknowledged` 不等于业务成功，回读失败或 cleanup 失败都不能触发自动重做或 OCR／鼠标／键盘 fallback。

这是 JavaScript 高层组合能力；唯一性、ref authority、原生动作和 teardown 仍由现有 Go Accessibility owner 保证。多属性读取继续直接使用 `Accessibility.read()`。

### 4.3 确切窗口内相对点动作

工作形状：

```js
await UI.actAtWindowPoint(
  current,
  { x: 33, y: 107, coordinateSpace: 'window' },
  { strategy: 'accessibility-press', requireActive: true },
);
```

`UI.actAtWindowPoint` 也是工作名。必须在一个 native action lifecycle 中重新解析同一确切窗口、按最新 bounds 投影点、拒绝越界或窗口重建、验证输入接收者并最多提交一次动作。动作可能已提交时返回 `unknown`，调用方不得自动重做。

动作策略必须显式区分原生 accessibility press 与物理点击；二者不得静默互相 fallback。`Geometry.pointOffset()` 继续负责普通快照计算，但它不能单独关闭“读取窗口 → 计算点 → 发送输入”的竞态。

## 五、P1 组合能力

### 5.1 状态等待

建议分别提供窄而可验证的等待，不先引入任意 Workflow Runtime：

- `window.waitFor(target, { state: 'active' | 'visible' | 'gone' })`；
- `UI.waitControl(selector, { within, until, timeout, polling })`；
- `UI.waitImage()`／`UI.waitImageGone()`。

每轮必须取得新鲜目标；Accessibility ref 不跨轮次缓存；timeout 包含观察成本；取消跟随 execution；已发送动作不得因等待失败被自动重做。

### 5.2 输入控件

当前高层能力必须显式区分三种不可自动互换的策略：

- `UI.setValue()`：完整原生字符串设值；
- verified keyboard：先激活确切窗口并证明控件已聚焦，再发送键盘输入；
- Recorder text patch：保留 UTF-16 长度/hash 前置、patch 边界/完整性、native action state 和回读后置的专用组合。

即使最终字符串相同，也不得自动互换，更不能建立“setValue 失败就点坐标并键盘输入”的隐式 fallback。

### 5.3 Action Receipt

所有高层动作至少规范化：`operation、target、backend、actionState、startedAt、completedAt`。Receipt 用于控制流和诊断，不等同于业务 Evidence；业务 Oracle 仍由 Recipe 或独立资格 Gate 按风险决定。

### 5.4 Structured Collection Reading

详细技术合同只维护在[结构化界面集合读取](../architecture/desktop-automation/structured-ui-collection-reading.md)。本节只登记公共能力晋级边界。

当前推荐先实现普通 JavaScript 原型，而不是先发布方法名：

```text
明确 scope / region + CollectionProfile
→ AX/UIA + OCR + Screenshot/Layout observations
→ ObservationBundle
→ normalize
→ CollectionSegmenter
→ FieldAssociator
→ CollectionValidator
→ optional Semantic Vision proposal
→ validate again
→ generic CollectionItem[]
```

它只处理**当前明确观察范围**。明确不负责：

```text
scroll
pagination / load-more
跨批去重
whole-list end detection
任意业务 Schema
后续业务控制流
```

这些由 Recipe 负责；App Adapter 负责 `CollectionItem[] → Conversation[] / Message[] / Order[]` 等业务解释。

VLM 默认先用于 application-engineer 作者期建立/修订 Profile。运行期 assist 只有确定性路线不足且任务显式允许时才评审；VLM proposal 必须重新经过 Validator。

如果至少两个独立应用反复出现相同 current-region 读取组合，并证明需要统一生命周期、性能或调用形状，再评审是否发布 `UI.readCollection()` 或更窄 facade。当前不把 `UI.collectCollection()` 作为公共 API 目标。

## 六、已存在但应优先复用的能力

在新增 API 前，生成器和新 Recipe 应先消费已有能力：

- `App.launch(..., { waitUntilReady: 'window' })`，不要自建 process readiness。
- `Geometry.pointOffset()`／`pointPercent()`／`region*()`，不要手写 `win.x + offset` 作为长期模式。
- `UI.tapText()`／`tapTexts()` 及动态 `region`／`relativeTo`，不要重复 OCR 截图映射。
- `UI.getValue()`／`UI.setValue()` 用于显式 scope 下的原生文本值，多属性继续使用 `Accessibility.read()`。
- `Accessibility` 的显式 `within` 和结构化 `actionState`，不要用全桌面首候选。
- `mouse.clickForPID()` 作为当前 macOS PID-scoped AXPress 原语；在原子窗口动作落地前，Recipe 仍须做确切窗口和布局门禁。
- 集合读取不得复制 OCR、布局或 Accessibility backend；应统一为 Observation/evidence 并复用现有 scope/ROI/coordinate/lifecycle 语义。

Recorder 的 basic generator 也应迁移为公共能力的消费者；框架函数存在但生成代码继续内联另一套 resolver，仍然没有减少用户维护面。

## 七、实施顺序与完成门槛

### 批次 A：现有能力收敛

1. 冻结 Calculator 生产 Recipe 和资格 Gate；把 TextEdit 作为第二个独立应用校准，但未拆出 production/gate 前明确标记为“代码证据”。
2. 记录当前重复 helper、有效失败行为、源码行数和正常命令，避免只比较 happy path。
3. 让新的生成代码优先使用 `Geometry` 等已有公开能力；不改变业务步骤和资格 Gate 责任。

### 批次 B：语义控件 facade

B.1 只收敛原生文本 value：`UI.getValue()`／`UI.setValue()` 已有 facade、类型、API Reference、manifest、AI 索引、确定性 JavaScript unit 和原生 fixture gate，状态保持 Experimental local。Windows UIA 真机仍是后续独立验证项。

B.2 只有出现重复且后端明确支持的需求后，才分别评审 `UI.invoke()` 或 `UI.read()`；当前多属性读取复用 `Accessibility.read()`。

### Structured Collection Reading：独立实施线

当前只做：

1. 冻结 `ObservationBundle / CollectionProfile / CollectionItem` 的最低合同和来源/坐标/unknown/conflict 语义。
2. 建立普通 list、variable-height timeline、重复文本、同名行内按钮、no-usable-UI-tree 等离线 fixture。
3. 用当前公开 Accessibility / Vision / Geometry 做 current-region deterministic JavaScript prototype：normalize → segment → associate → validate。
4. 通过聊天会话列表、消息 timeline、订单/表格三类 Adapter 案例验证“结构读取”和“业务字段解释”能独立失败。
5. 再验证 authoring-time VLM proposal；只有有证据才考虑 runtime assist。
6. 最后评审是否存在值得公开的 `UI.readCollection()` 或更窄 facade。

**不在本实施线建设 `UI.collectCollection()`。** 滚动、分页、跨批去重和结束判断属于 Recipe 业务执行与资格测试。

### 批次 C：确切窗口生命周期

在 Go Window owner 增加 selector、精确 activate/current 与结构化错误；覆盖同标题、多 PID、多窗口、窗口关闭重建、前台抢占和 timeout。

### 批次 D：原子窗口内动作

复用 Window identity resolver 和 native Accessibility owner，实现相对点动作；覆盖窗口平移、resize、负坐标、多显示器、点越界、错误 owner、不支持 AXPress、取消及 action-state unknown。不得以全局 `mouse.click()` fallback 伪造通过。

### 批次 E：生成器与 Recipe 迁移

至少迁移 Calculator 与 TextEdit，再验证微信／Custom UI；生产 Recipe 不再自带通用窗口枚举、焦点轮询、ref cleanup 或坐标相加。

框架能力完成必须同时满足：

- 至少两个独立应用使用同一合同，不含应用名称硬编码；
- 正常 Recipe 中通用样板显著减少，业务步骤更直接；
- 目标歧义、窗口漂移和结果不确定时仍 fail closed；
- 公开类型、API 文档、AI 索引和 JavaScript Runtime 测试同步；
- native 构建物与源码一致，并保留所需实窗／视觉证据；
- 不把独立资格断言重新塞回生产 Recipe。

Structured Collection 额外要求：

- `ObservationBundle` 能证明 scope、来源、坐标和完整性语义；
- item 分段与字段归属可独立失败；
- VLM provider timeout/schema invalid/conflict 有界失败且不能绕过 Validator；
- business mapping parser failure 不计为 Collection segmentation failure；
- Collection core 漏项不能由 Adapter 猜值掩盖；
- Recipe 的跨 viewport 合并/去重/结束判断作为业务层另行验收，不反向写成 Collection core 成功。

## 八、不进入框架的内容

- Calculator 的按钮表、`C/AC` 双清零和固定算式；
- TextEdit 的具体工具栏位置和保存业务规则；
- 微信会话身份、千牛订单状态、拼多多业务分支；
- 某个应用的窗口尺寸数字、OCR 文案别名和恢复路径；
- `sender`、`price`、`customerName`、`conversationTitle` 等业务字段及业务 JSON schema；
- 某应用“下一页”或 Load More 控件的具体 locator/action；
- 某业务的跨批 identity、去重规则和结束判断；
- 来源 hash、逐步固定答案、截图矩阵和资格报告写入。

框架提供“怎样安全找到、观察、等待、分段、关联和操作”；AppProfile/CollectionProfile 提供“这个应用中结构与目标是什么”；App Adapter 解释“通用数据在该应用里是什么”；Recipe 保留“这次业务接下来做什么”。

## 九、2026-09-10 Collection 边界修订

此前版本曾把 scroll collector / `UI.collectCollection()` 作为未来公共能力方向。最新已批准架构取消该方向：

```text
Collection = 当前明确观察范围的通用结构读取
App Adapter = 业务字段解释
Recipe = 滚动 / 分页 / 跨批去重 / 结束判断 / 后续业务控制
```

未来若真实跨应用证据证明 traversal 存在稳定公共合同，可重新独立评审；不能从历史设计直接恢复。