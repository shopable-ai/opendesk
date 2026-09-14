# Recorder Semantic Evidence → Recipe Lowering

## 结论

Recorder 的 `actions.json` 是**录制事实与证据**，不是 `UI.tapTexts()` / `UI.tapTargets()` 的参数文件，也不是必须保存完整 UI Tree 的中间 IR。

当前 `evidence: "target-semantics"` 保存的是点击目标附近的**有界 UI Tree 语义快照**：命中元素、可执行祖先、role / name / identifier / nativeActions / bounds 等。它明确**不是整棵 AX/UIA Tree，也不是 OCR 结果**。

因此 Generator 的核心判断不是：

```text
证据来自 OCR → tapTexts
证据来自 UI Tree → tapTargets
```

而是：

```text
当前已有证据能否把“我要操作什么”表达得足够简单、稳定、可重定位？
```

Runtime 继续是 OCR / Accessibility / UIA / AX 定位协作的唯一执行 owner。

---

## 当前 evidence 的能力边界

`target-semantics` 当前提供的是 target-level semantic snapshot：

```text
recorded pointer action
→ current window/application
→ point-hit element
→ nearest actionable ancestor（必要时）
→ bounded ancestors / containers
→ role / name / identifier / enabled / nativeActions / bounds
```

它适合回答：

- 录制时用户点到了哪个语义控件；
- 控件是否可执行；
- 有哪些可以跨 Execution 重新解析的稳定字段；
- 是否存在足够证据生成 semantic candidate。

它**不能单独证明**：

- 当前窗口整棵 UI Tree 中不存在另一个同名控件；
- 一个 Accessibility `name` 一定等于视觉 OCR 文本；
- 录制时 bounds 在未来仍然可复用；
- 当前 candidate 已经通过真实业务资格验证。

所以“录制里没有看到冲突”只能作为 candidate lowering 依据，不能冒充全窗口唯一性证明。最终唯一性必须由新 Execution 的 Runtime 重新解析和 qualification 验证。

---

## Generator 的 API 选择规则

### 1. 优先 `UI.tapTexts([...])`

当一个 exact string 已经足够表达该动作的业务意图时，Generator 可以输出：

```js
await UI.tapTexts(["2", "5", "×", "4", "="]);
```

该字符串可以来自可靠的 UI Tree label/name；这并不表示 Recorder 声称自己采集过 OCR。

适用条件至少包括：

- action semantic evidence 已验证；
- 目标是普通可激活控件；
- 有非空、可维护的人类可读 label/name；
- Recorder 已知 evidence 中没有必须保留的结构性约束；
- 生成结果仍要求 Runtime 在当前窗口中重新解析并保证唯一；
- qualification 失败时能通过 candidate mapping 回到原始 action evidence。

这里的 `tapTexts` 表达的是“按这个文字语义激活目标”，不是“强制使用 OCR 点击”。Runtime 可以内部使用 OCR，也可以在安全条件下使用 Accessibility/UIA/AX。

### 2. 使用 `UI.tapTargets([...])`

当一个字符串不足以表达目标，而 UI Tree evidence 中存在稳定约束时，Generator 使用最小必要 semantic target：

```js
await UI.tapTargets([
  { role: "button", name: "确定" }
]);
```

或者：

```js
await UI.tapTargets([
  { role: "button", name: "确定", identifier: "confirm" }
]);
```

典型情况：

- 已知同名目标存在冲突；
- role 是必要的 disambiguation；
- identifier 是必要的稳定 identity；
- 仅靠文字会把目标语义弱化。

调用者仍然不配置 `strategy`、fallback order、OCR provider 或 Accessibility provider。

### 3. 使用更低层公开 API

仅当动作本身不是简单“按语义目标激活”时使用对应 API，例如：

- keyboard shortcut；
- focused text edit；
- 其他已有专用公开能力。

不能因为 evidence 来自 Accessibility，就机械生成 `Accessibility.find/read/perform/release`。

### 4. `GENERATION_BLOCKED`

当当前 evidence 无法稳定表达目标时，semantic generation 必须阻止，而不是退回坐标：

- semanticStatus 不可用；
- 没有稳定 name / identifier；
- 同 role/name 冲突且没有更强 identity；
- action 只能依赖 recording-time bounds / index / x,y；
- evidence 本身存在矛盾或不足。

`mode: "basic"` 是显式物理回放合同，不是 semantic failure 的自动 fallback。

---

## Evidence source 与 API 的关系

| actions evidence | 可以生成什么 | 说明 |
| --- | --- | --- |
| UI Tree target snapshot only | `tapTexts` 或 `tapTargets` | 取决于“文字是否足够表达目标”，不是取决于 source 名称 |
| OCR text only（未来若正式加入） | 通常 `tapTexts` | 不能凭 OCR 自行发明 role / identifier |
| UI Tree + OCR 且一致 | 优先最简单稳定表达 | 可以增强 qualification confidence，但最终 source 仍保持可追溯 |
| UI Tree + OCR 不一致 | 不静默合并 | 保留冲突 evidence；优先结构性约束或进入 review / block |
| pointer/coordinate only | 不生成 semantic click | 只能显式 basic replay，或先补 semantic evidence |

当前 Recorder 没有把 OCR 作为 `target-semantics` 的静默 fallback，也不需要为了生成 `tapTexts` 强行新增 OCR 采集。

---

## 为什么不保存整棵 UI Tree

普通 Recorder 不应为了 Generator 方便就默认持久化完整 UI Tree：

- 数据量和隐私面更大；
- tree 很容易在新 Execution 中失效；
- 大量 sibling/descendant 对最终 Recipe 没有价值；
- 最终仍必须在运行时重新解析当前 UI；
- 会把 actions 从“事实证据”推向平台耦合的静态 DOM/AX dump。

优先策略是：

```text
target-level evidence
+ bounded structural context
+ candidate mapping
+ Runtime fresh resolution
+ live qualification
```

如果未来真实失败数据显示仅靠 target snapshot 无法可靠决定 `tapTexts` / `tapTargets`，优先增加**有界竞争候选证据**，例如同一容器中同名可执行控件摘要、scope completeness，而不是直接持久化整棵 UI Tree。

---

## Candidate 与最终 Recipe 的边界

Recorder semantic generation 只生成 candidate：

```text
rich recording evidence
→ source-aware semantic lowering
→ concise candidate
→ fresh Runtime resolution
→ live qualification
→ repair if needed
→ qualified Recipe
```

如果 Generator 只有 target-level UI Tree evidence，可以生成简洁 candidate，但不能因此宣称：

- OCR 已经验证；
- 全窗口唯一性已经证明；
- Calculator 等业务最终结果已经通过。

这些都必须由后续真实执行与业务验证完成。

---

## Calculator 示例

Calculator 的按钮录制如果只得到可靠 Accessibility/UIA/AX target snapshot：

```text
role=button
name=2 / 5 / × / 4 / + / 1 / 0 / =
native action=invoke / AXPress
```

并且没有 evidence 表明某一步必须保留 role/identifier，那么 candidate 可以继续生成：

```js
await UI.tapTexts(["2", "5", "×", "4", "+", "1", "0", "="]);
```

这里不声称 `"×"` 是 OCR 读取结果。它只是 Recorder 从真实 UI Tree evidence 获得的 semantic label。

如果某个 label 在真实应用中需要 `role/name/identifier` 才能唯一表达，则该步应升级为 `UI.tapTargets`；如果仍无法可靠表达，则阻止 semantic generation。

不得增加 Calculator-specific alias、固定坐标或特殊 fallback。
