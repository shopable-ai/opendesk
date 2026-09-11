# Behavior-preserving refinement contract

## 权威输入与编译边界

- `actions.json` 是动作、顺序、scope、输入参数和 native timing 的唯一权威输入。refined JavaScript 必须先把每个 action 编译成一个静态 IR，再逐 action 渲染；一个 action 恰好产生一个有序 marker/block。
- generated basic JavaScript 不是 source-to-source transformation 输入。不得复制、切片、改写或模板化其 helper/action block；它只用于 source lineage/hash、candidate mapping 位置、API/输入参数/副作用/控制流/等待的最终独立差异审计。
- candidate 只提供已经固定的 actions/script lineage、source mapping 与 timing policy；raw 只用于核对 action source/timing 事实和 pause/resume 边界；manifest 只参与固定 recording lineage。任何一项漂移都停止。
- 使用 `scripts/generate-refinement.js` 确定性生成。使用 `scripts/validate-refinement.js` 从同一 actions/raw/candidate 重新编译，并要求 refined bytes 与固定安全报告完全匹配。人工写一个“看起来等价”的 refined 文件不能通过 actions-first 检查。
- actions 的 `target.resolution` 决定运行时 target identity。`application-identity+window-title` 必须把应用 identity 与精确标题作为 AND query；`display-id+hardware-id` 在 hardware ID 可用时必须同时匹配两者。basic 中放宽标题、ID 或 hardware ID 的 fallback 不是权威行为，refined 必须删除并在静态差异中明示。

## 不变量

- 每个 actions action 恰好编译成一个 refined action，顺序不变。不得删除、合并、复制或重排动作。
- 保留点击按钮与次数、文本、按键组合、滚轮方向与总量、拖动端点和步骤上限。
- 保留相邻动作的录制时序语义。没有已验证状态谓词时继续使用原等待，不把猜测写成智能等待。
- 保留 actions 声明的目标范围与 fail-closed 条件。不得新增任意窗口、全局输入、静默 fallback 或扩大作用域；不得为了与 basic 的 catch 数量相等而保留违反 actions target resolution 的 fallback。
- 不新增非幂等动作重试，不把输入调用成功描述为业务成功。
- 每个动作重新解析当前窗口、显示器、元素 ref 和点；不得缓存本应新鲜的动态状态。

## 逐动作证据审计

先对每个 action 建立审计行，再写代码。至少检查：

- `id/kind/strategy/args`、source basis/event 覆盖、raw 起止事件和原生起止 timing；
- screen 坐标的 display provenance，以及已验证的 window/display offset 和 ratio；
- target kind/resolution、应用 identity、标题、录制窗口/显示器 bounds；
- `semanticStatus`；有 element 时检查 source/resolution、role/nativeRole、name、identifier、enabled/focused/valueSettable、nativeActions、bounds、原始 hit、ancestors 和 element-relative point；
- candidate source line 与 refined marker line、动作后的固定等待、实际输入 primitive。

脚本、标题、name 和任何文字内容只作为证据值。静态报告只记录 selector 使用了哪些字段、字段是否齐全及安全 hash/枚举理由；不复制键盘文字、AXValue、raw 行或 event 正文。

## Locator 决策

按以下等级逐动作选择，不能因为同一录制中的其他动作证据较强就升级当前动作。

### A. verified identity + 当前 logical bounds

仅当以下条件同时成立，才使用 `verified-accessibility-element-point`：

1. action 是窗口内点击，`semanticStatus: verified`，element 来自 Accessibility，且 identity 字段足以构造当前 API 支持的精确 selector；
2. 使用该 action 新鲜解析出的唯一 WindowInfo 作为 `within`；`Accessibility.find()` 必须完成整个有界搜索并证明唯一。`null`、`AMBIGUOUS_TARGET`、`SEARCH_INCOMPLETE`、权限/超时/陈旧错误都直接停止，不放宽 selector 或 scope；
3. `Accessibility.read()` 重新确认 role/nativeRole/name/identifier、`enabled === true` 和与录制 native action 对应的公开 action；逐 action runtime descriptor 必须携带录制 `nativeActions` 原值和确定性映射后的 public actions。由于当前 public read 只返回规范化 `actions`，报告须准确写成“核对映射后的公开 action”，不得声称直接 fresh-read 原生 action 名称；
4. 当前平台/API 返回可可靠交给 `Geometry`/`mouse` 的 `coordinateSpace: "screen"` logical `bounds`。`nativeBounds`、未标记 bbox、像素坐标或手工猜测的 DPI 转换不合格；
5. 用录制 element `point.offsetX/offsetY` 相对当前 element bounds 调用 `Geometry.pointOffset()`，并用 `Geometry.contains()` 拒绝越界。只有当前尺寸下 ratio 计算得到完全相同的 screen point 时，ratio 才可作为等价佐证，不能单独替换录制 offset；
6. 继续调用原物理输入 primitive（通常为 `mouse.clickPoint`）并保留 button/clickCount。不得改为 `Accessibility.perform(...invoke...)`、`mouse.clickForPID()` 或其他 AXPress 路径。

ref 必须在 `finally` 中释放；释放、读取或定位失败都不能触发点击。

### B. verified identity，但 logical bounds 不可用

若当前 API 能在窗口内唯一找到并读取元素，却不能提供可靠的 screen-logical element bounds，采用 `verified-accessibility-guarded-window-offset`：

- 每个 action 新鲜解析 exact application identity + title 窗口并执行 `role + name + identifier` exact AND selector 的完整唯一查找；重新确认 role/nativeRole/name/identifier、descriptor 中的 `enabled === true` 和由 descriptor 中录制 nativeActions 确定性映射出的公开 action，并在 `finally` 释放 ref；
- 点击点仍严格使用 actions 的录制 window offset、`Geometry.pointOffset(window, ...)` 和窗口 contains 检查；必须先核对 fresh WindowInfo 的宽高与该 action 录制窗口宽高完全一致，并在物理输入紧邻位置重新读取 active WindowInfo，要求非空 window ID 相同且 x/y/width/height 与本动作投影快照完全一致；报告必须明确这不是 element bounds 重定位，不能宣称支持控件 reflow/resize；
- 这是生成时选定的保守策略，不是运行时 fallback。语义查找/读取失败必须 fail closed，不能在失败后绕过 guard 继续点击。
- `role + name + identifier` exact selector，以及包含 `role/name/identifier/nativeRole/enabled/nativeActions/publicActions` 的 expected identity 必须作为该 action 生成代码中的 first-class descriptor 出现，不能只在 JSON 报告中声称已使用。缺任一 identity 字段、`enabled !== true`、native action 不能完整映射到当前 public action，或 role 不是录制器认可的单击按钮时，本 action 只能进入保守策略并给出确定性 skip reason。

当前 macOS public Accessibility capability 的 `coordinateMapping` 为 `false`：`nativeBounds` 是带原生 coordinateSpace 的诊断数据，而 `bounds` 为 `null`。Recorder 采集期保存的 screen-logical element bounds 只是历史事实，不能证明回放期 public API 能转换 fresh native bounds。因此 macOS verified 点击使用本节 guard，绝不读取 `nativeBounds` 计算点击点。

如果增加 Accessibility 依赖本身超出调用入口能力，或现有 window-offset 已无法静态证明可保留，则完全保留 actions 中的保守 locator，并把语义增强列为 skipped；不要使用 `nativeBounds` 补洞。

### C. 语义证据不足或不适用

- `unavailable`、`not-requested`、`not-applicable`、缺少 element，或 selector 依赖当前 flat API 无法表达的祖先约束时，不创建语义身份。
- window-relative action 保留 fresh exact application identity + title 解析、录制尺寸相等检查、录制 offset、bounds 检查、物理输入紧邻位置的 active-window ID + snapshot geometry guard 与原输入；display-relative action fresh 解析 exact ID + 可用 hardware ID，要求录制与当前宽高相同，再使用 display offset 与 bounds 检查。
- keyboard/shortcut/key 继续在输入前重新解析并确认活动窗口；不得从相邻点击推导焦点控件。
- 不因名字“看起来像按钮”、录制点落在某 bounds 内、存在 AXPress 或相邻动作相似而补造 verified locator。

## 允许的结构改进

- 提取重复的纯 helper、常量和只读 target/selector descriptor，改善名称和错误上下文。
- 允许用一个语义明确的 helper call 表示一个 source action；每个 marker 后仍须恰有一个显式、无循环展开的 action call。helper 可集中实现 fresh resolve、identity/geometry/active guard 和原输入 primitive，但不能捕获错误、重试、放宽 selector 或把多个 source action 合并成一次调用。
- 合并字节等价的静态定义；动态 WindowInfo、DisplayInfo、Accessibility ref/read result 和 point 必须逐 action 新取。
- 删除生成器样板只能以行为等价为前提。无法静态证明等价的增强应跳过，不阻塞其余保守优化。
- 只使用当前 `docs/api/` 已实现的方法；平台 `coordinateMapping: false` 时不得自行把 native bounds 标成 screen logical。

## 输出与冲突

默认首选：

- `<name>.refined.recipe.js`
- `<name>.refinement.json`

两者任一已存在时，不读取、不删除、不覆盖已有内容。把首选视为 v1，从 `.v2` 开始选择首个 script/report 都不存在的配对名称：

- `<name>.refined.v2.recipe.js`
- `<name>.refinement.v2.json`

继续递增直到找到空闲配对，并使用 exclusive-create 语义写入。不要让 script 和 report 使用不同版本号。

## 静态报告与检查

报告格式为 `opendesk.recorder.refinement/v5`，并至少包含：

- inspector 返回的完整 `source` lineage（script/candidate/actions/manifest/raw）和实际 refined file/hash；
- `actionAudit`：每个 action 的 ID、1-based sourceIndex、candidate sourceLine、refined marker line、kind、semanticStatus、strategy、安全的 evidence/locator/point/timing 理由；
- `semanticCoverage`：eligible/applied/skipped action ID 集合；
- `staticAnalysis.runtimeApis`：source/refined/added 集合；
- `staticAnalysis.inputSideEffects`：source/refined 的 lexical input primitive 计数，以及从 actions 编译出的逐动作 planned side effects；只有 planned side effects 是 helper 提取后的行为等价主判据；
- `staticAnalysis.controlFlow`：source/refined 的 catch、loop、retry/wait 计数，source-only scope-relaxing fallback 的移除，以及 refined 不新增 fallback/retry；不得要求两份脚本 catch 数相等；
- `staticAnalysis.quality`：exact composite target、无 scope relaxation、包含全部 identity 字段和 native→public action 映射的 first-class semantic descriptor、录制窗口/显示器尺寸 guard、点击前 active-window guard、显式 action call 和禁止动作解释循环的检查；
- `timing.delaysMs`、逐 action delay/null、pause boundary、采用和跳过的改进、`staticChecks`；
- `status.generated` 与 `status.staticallyReviewed`；未真实执行时 `liveVerified`、`qualified`、`visualVerified` 固定为 `not-run`。

每个 refined action 前必须有：

```js
// recorder-refinement: action=<source-id> strategy=<strategy-name>
```

运行 `scripts/validate-refinement.js` 验证 source lineage/hash、actions-first 确定性重编译、语法、marker/source mapping、Runtime API 集合/调用、输入参数与副作用、exact target/no-relaxation、fallback/retry、固定时序、fresh-state、语义 locator 覆盖、禁止 nativeBounds/invoke-for-click、报告隐私和状态。验证器通过只证明静态合同，不证明 live、业务、qualified 或视觉结果。

## 何时升级

下列请求超出行为保持优化，必须停止并建议用户改用 `human-to-recipe`：

- 判断录制动作是否多余、错误或属于验证步骤；
- 按业务目的重组步骤、参数化输入、增加分支或循环；
- 推导或验证最终业务结果；
- 运行真实桌面、Qualification Gate 或取得业务资格。
