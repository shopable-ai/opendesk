# 多应用自动化高频框架能力

## 定位与状态

本文回答一个具体问题：哪些代码不应由 Calculator、TextEdit、Safari、微信、千牛、拼多多等 Recipe 反复实现，而应成为 OpenDesk 的跨应用框架能力。

状态：2026-09-09 的实施路线图。下文方法名是用于冻结职责和验收范围的设计草案，不是当前已公开 API。实际实现时仍须按[Runtime API 扩展与定制框架](runtime-api-extension-framework.md)完成 owner、类型、API 文档和 Runtime 测试。

目标不是隐藏业务逻辑，而是让生产 Recipe 主要保留：应用／窗口目标、页面或布局约束、业务值、业务步骤和影响后续控制流的状态判断。窗口枚举、身份重验、坐标空间转换、原生 ref 清理和通用轮询不应在每个 Recipe 中重写。

### 当前实现状态

| 项目 | 状态 | 当前边界 |
| --- | --- | --- |
| 批次 A.1：Recorder 生成物消费 Geometry | 当前工作树已实现；正式 JavaScript 合成 Gate 8/8 通过 | basic generator 使用既有 `Geometry.pointOffset()`、`Geometry.contains()` 和 tagged `mouse.clickPoint()`，不新增 Runtime API；仍不能关闭窗口解析到输入提交之间的竞态 |
| Calculator 生产 Recipe 的 Geometry 收敛 | 当前工作树已实现；golden／源码冻结静态检查通过，新源码的 live 资格待重跑 | 保留 active-window、固定布局和 `mouse.clickForPID()` 门禁，只移除手写 `active.x/y + offset`；当前源码 SHA-256 为 `751d25b682c9d1591507cddacee298a51d298ef9658d6c8b03e96a996c8a7e96` |
| TextEdit 校准 | 已有独立 Recipe 代码证据；未形成 human production/gate 双层基线 | 现有 AI CLI Recipe 已使用 `Geometry.pointPercent()`、`Geometry.contains()` 和 `mouse.clickPoint()`，但运行、截图、断言和 evidence 仍混在一个文件中 |
| 批次 B：普通语义控件 facade | 设计草案 | 现有 `Accessibility.find/read/perform/release` 可组合，但普通控件 facade 尚未公开，cleanup/action-state 合同仍需评审 |
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

这组证据已经足以进入跨应用公共能力设计。它不表示所有命中文件都应机械迁移，也不表示设计草案已经通过真实应用资格。

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

归属判断不看“最终由 JavaScript 调用”，而看不可分割的正确性边界。纯组合放 JavaScript；身份、权限、native handle、竞态和 execution lifecycle 放 Go；应用按钮名称、区域、模式和恢复策略仍留在 AppProfile／Recipe。

## 三、优先能力清单

| 优先级 | 能力 | 建议 owner | 主要消除的 Recipe 代码 |
| --- | --- | --- | --- |
| P0 | 精确窗口解析、刷新与激活 | Go `window` owner＋薄 JS 映射 | `window.list().filter()`、`sameWindow()`、标题型 focus、手写焦点轮询 |
| P0 | 语义控件读取与动作 facade | `polyfills/006-ui.js` 组合现有 Go Accessibility | `find → read/perform → finally release`、每个应用的相同唯一性和 ref 清理代码 |
| P0 | 确切窗口内相对点原子动作 | Go `mouse/window/accessibility` 共同 native owner，公开位置最终只选一个 | `active.x + offsetX`、动作前再次核对 PID／窗口、坐标与点击之间的竞态 |
| P1 | 窗口、语义控件、图片和属性状态等待 | JS 轮询策略＋Go 新鲜身份/取消能力 | `for + Date.now + sleep + reread`、无理由固定等待 |
| P1 | 聚焦并填写输入控件 | JS facade 组合 native `setValue`；显式选择 keyboard 策略 | 点击输入区、确认焦点、全选、输入、读取回值的通用样板 |
| P1 | 统一 Action Receipt 与失败分类 | Go 原始 action state＋JS 规范化 | 各 Recipe 自建 `acknowledged/unknown/not-started`、重试和错误包装 |
| P2 | Locator portfolio、局部观察缓存和漂移诊断 | 框架服务／JS 策略，按实际 backend 分层 | 大型应用中重复的 OCR、图片、AX 候选排序和缓存失效代码 |

P0 先解决每个动作都可能用到的目标与输入基础设施；P1 解决常见状态交互；P2 只有在真实复杂应用证明收益后扩展，不能成为普通 Recipe 的前置系统。

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

### 4.2 语义控件快捷操作

工作形状：

```js
await UI.tapControl(
  { role: 'button', name: 'Save' },
  { within: current },
);

const value = await UI.readControl(
  { role: 'textField', identifier: 'total' },
  { within: current, property: 'value' },
);
```

必须满足：

- 复用现有 `Accessibility.find/read/perform/release`，不创建第二个原生 Accessibility runtime。
- 完整搜索并证明唯一；歧义、搜索不完整、disabled 或 unsupported action 均 fail closed。
- facade 在所有成功和失败路径释放 ref；普通 Recipe 不需要接触 opaque ref。
- `tapControl` 只返回 native action receipt，不宣称保存、发送或付款等业务成功。
- 不自动从 AX 降级到 OCR、坐标或键盘；fallback 必须由调用方显式选择并单独资格验证。

这是 JavaScript 高层组合能力；唯一性、ref authority、原生动作和 teardown 仍由现有 Go Accessibility owner 保证。

### 4.3 确切窗口内相对点动作

工作形状：

```js
await UI.actAtWindowPoint(
  current,
  { x: 33, y: 107, coordinateSpace: 'window' },
  { strategy: 'accessibility-press', requireActive: true },
);
```

`UI.actAtWindowPoint` 也是工作名。正式评审可以落在 `UI`、`mouse` 或更窄的公开对象，但 native owner 只能有一个。

必须在一个 native action lifecycle 中：

1. 重新解析同一确切窗口和进程实例；
2. 按最新 bounds 投影窗口内逻辑点；
3. 拒绝越界、窗口重建、前台不符和不支持的坐标空间；
4. 验证点所在窗口 owner／PID 和实际可执行元素；
5. 最多提交一次原生动作，并返回明确 `actionState`；
6. 动作可能已经提交时返回 `unknown`，调用方不得自动重做。

动作策略必须显式区分：`accessibility-press` 只对点命中的可执行 AX／UIA 元素调用语义动作；`physical-click` 只在平台 backend 能确认确切活动窗口并明确报告其保证等级时提供。二者不得静默互相 fallback，也不能把 AXPress 伪装成任意物理坐标点击。平台无法保证接收者时应拒绝或返回明确 `unknown`，不能报告确定成功。

该能力属于 Go。`Geometry.pointOffset()` 继续负责普通快照计算，但它不能单独关闭“读取窗口 → 计算点 → 发送输入”之间的竞态。视觉 `UI.tapText()`／`tapImage()` 未来可以在显式窗口 scope 下消费同一 native primitive，而不是各自实现另一个点击 owner。

## 五、P1 组合能力

### 5.1 状态等待

建议分别提供窄而可验证的等待，不先引入任意 Workflow Runtime：

- `window.waitFor(target, { state: 'active' | 'visible' | 'gone' })`；
- `UI.waitControl(selector, { within, until, timeout, polling })`；
- `UI.waitImage()`／`UI.waitImageGone()`，补齐现有文本等待的对称能力。

每轮必须取得新鲜目标；Accessibility ref 不跨轮次缓存；timeout 包含观察成本；取消跟随 execution；已发送动作不得因等待失败被自动重做。

### 5.2 输入控件

高层输入能力应显式区分：

- native `setValue`：目标支持且调用方选择时使用；
- verified keyboard：先激活确切窗口并证明控件已聚焦，再发送键盘输入；
- replace/append、敏感值日志策略和 readback 要在参数中明确。

不得建立“setValue 失败就点击坐标并键盘输入”的隐式 fallback。

### 5.3 Action Receipt

所有高层动作至少规范化：`operation、target、backend、actionState、startedAt、completedAt`。Receipt 用于控制流和诊断，不等同于业务 Evidence；业务 Oracle 仍由 Recipe 或独立资格 Gate 按风险决定。

## 六、已存在但应优先复用的能力

在新增 API 前，生成器和新 Recipe 应先消费已有能力：

- `App.launch(..., { waitUntilReady: 'window' })`，不要自建 process readiness。
- `Geometry.pointOffset()`／`pointPercent()`／`region*()`，不要手写 `win.x + offset` 作为长期模式。
- `UI.tapText()`／`tapTexts()` 及动态 `region`／`relativeTo`，不要重复 OCR 截图映射。
- `Accessibility` 的显式 `within` 和结构化 `actionState`，不要用全桌面首候选或解析错误字符串。
- `mouse.clickForPID()` 作为当前 macOS PID-scoped AXPress 原语；在原子窗口动作落地前，仍须由 Recipe 做确切窗口和布局门禁。

Recorder 的 basic generator 也应迁移为这些公共能力的消费者。框架函数存在但生成代码继续内联另一套 resolver，仍然没有减少用户维护面。

## 七、实施顺序与完成门槛

### 批次 A：现有能力收敛

1. 冻结 Calculator 生产 Recipe 和资格 Gate；把 TextEdit 作为第二个独立应用校准，但在它拆出 production/gate 之前明确标记为“代码证据”，不写成双应用已资格。
2. 记录当前重复 helper、有效失败行为、源码行数和正常命令，避免只比较 happy path。
3. 让新的生成代码优先使用 `Geometry` 等已有公开能力；不改变业务步骤和资格 Gate 的责任。A.1 只收敛坐标投影样板，不引入设计中的 Window／UI 工作名。

当前双应用校准结果：

| 校准项 | Calculator | TextEdit | 提取决定 |
| --- | --- | --- | --- |
| 相对 Geometry | 固定窗口 offset，要求 `232×321` 布局 | document/toolbar/panel 使用窗口百分比，且 modal 会改变 surface | 生成器复用现有 Geometry；固定数值和布局仍留在 Recipe/AppProfile |
| 输入 owner | `mouse.clickForPID()` 的 PID-scoped AXPress | `mouse.clickPoint()` 与 keyboard/clipboard 组合 | Geometry 只产生点，不隐式选择动作策略或 fallback |
| 窗口生命周期 | 单一固定标题窗口，每步重验 active | 新文档、duplicate 和 Save sheet 可能替换窗口 ID | 不能从 Calculator 局部 helper 提前宣布精确 Window API 合同已定 |
| 资格分层 | production、Gate、Evidence 已分开；Gate 冻结并 instrument 实际源码 | 仍混合运行、断言、截图和 evidence | TextEdit 只能证明跨应用形状，不证明批次 A 完成或新 API live 通过 |

### 批次 B：语义控件 facade

实现 `tap/read/setValue` 的高层组合，补类型、`docs/api/`、`tests/runtime-api/*.js` 与 macOS／Windows 支持矩阵；用至少两个独立应用或一个应用加原生 fixture 验证 ref 清理、歧义和 action state。

### 批次 C：确切窗口生命周期

在 Go Window owner 增加 selector、精确 activate/current 与结构化错误；覆盖同标题、多 PID、多窗口、窗口关闭重建、前台抢占和 timeout。公开行为用 JavaScript Runtime 测试；Go 白盒只保留 JS 无法观察的 resolver seam。

### 批次 D：原子窗口内动作

复用 Window identity resolver 和 native Accessibility owner，实现相对点动作；覆盖窗口平移、resize、负坐标、多显示器、点越界、错误 owner、不支持 AXPress、取消及 action-state unknown。不得以全局 `mouse.click()` fallback 伪造通过。

### 批次 E：生成器与 Recipe 迁移

至少迁移 Calculator 与 TextEdit，再验证微信／Custom UI；生产 Recipe 不再自带通用窗口枚举、焦点轮询、ref cleanup 或坐标相加。迁移后的正式用户命令和独立资格 Gate 必须分别原样运行。

框架能力完成必须同时满足：

- 至少两个独立应用使用同一合同，不含应用名称硬编码；
- 正常 Recipe 中通用窗口／Accessibility 样板显著减少，业务步骤更直接；
- 目标歧义、窗口漂移和结果不确定时仍 fail closed；
- 公开类型、API 文档、AI 索引和 JavaScript Runtime 测试同步；
- native 构建物与源码一致，并保留所需实窗／视觉证据；
- 不把独立资格断言重新塞回生产 Recipe。

## 八、不进入框架的内容

- Calculator 的按钮表、`C/AC` 双清零和固定算式；
- TextEdit 的具体工具栏位置和保存业务规则；
- 微信会话身份、千牛订单状态、拼多多业务分支；
- 某个应用的窗口尺寸数字、OCR 文案别名和恢复路径；
- 来源 hash、逐步固定答案、截图矩阵和资格报告写入。

框架提供“怎样安全找到、等待和操作”，AppProfile 提供“这个应用中目标是什么”，Recipe 保留“这次业务要做什么”。
