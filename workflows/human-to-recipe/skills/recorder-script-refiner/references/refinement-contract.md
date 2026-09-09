# Behavior-preserving refinement contract

## 不变量

- 每个 source action 恰好映射到一个 refined action，顺序不变。不得删除、合并、复制或重排动作。
- 保留点击按钮与次数、文本、按键组合、滚轮方向与总量、拖动端点和步骤上限。
- 保留相邻动作的录制时序语义。没有已验证状态谓词时继续使用原等待，不把猜测写成智能等待。
- 保留原目标范围与 fail-closed 条件。不得新增坐标、任意窗口、全局输入或静默 fallback。
- 不新增非幂等动作重试，不把发送成功描述为业务成功。

## 允许的改进

- 提取重复的纯 helper、常量和只读 target descriptor，改善名称、结构、错误上下文和注释。
- 合并字节等价的重复定义，但不能缓存本应为每个 action 重新获取的新鲜窗口、显示器或元素状态。
- 仅在 actions 已有 verified 语义和当前 API 能证明等价时，采用更强的 locator 或 guard；否则保留 basic strategy。
- 删除生成器样板只能以行为等价为前提。无法静态证明等价的改进应跳过，不阻塞其余保守优化。
- 只使用当前 `docs/api/` 已实现的方法；不得把路线图、设计稿或其他 Skill 的未来能力当成 API。

## 输出

默认输出与输入 script 同目录：

- `<name>.refined.recipe.js`：行为保持的 refined candidate；
- `<name>.refinement.json`：source/candidate/actions/raw hash、逐 action source map、采用与跳过的改进、静态检查和所有未运行状态。

其中 `<name>` 是去掉 `.recipe.js` 的输入文件名。使用 exclusive-create 语义：目标不存在才写；已存在且字节相同时可复用，内容不同时停止并报告冲突。报告不得复制 action 文本、AXValue、键盘内容或 raw 正文。

静态报告至少证明：实际 source script hash 与 inspector 结果一致；actions 全部且唯一映射；refined script 没有新增 Runtime API、动作、副作用、fallback 或重试。没有真实执行时，`liveVerified`、`qualified` 和 `visualVerified` 必须为 `not-run`。

## 何时升级

下列请求超出行为保持优化，必须停止并建议用户改用 `human-to-recipe`：

- 判断某个录制动作是否多余、错误或属于验证步骤；
- 按业务目的重组步骤、参数化输入、增加分支或循环；
- 推导或验证最终业务结果；
- 运行真实桌面、Qualification Gate 或取得业务资格。
