# AGENT_TEXT_DRIVEN_DEVELOPMENT

## 1. 目的

在真实桌面软件自动化开发早期，优先使用 `-script-text` / `-script-stdin` 做文本驱动试验，而不是一开始就把所有探索都写成固定脚本文件。

这不是框架能力本身，而是 Agent 开发与调试策略。

目标：

- 降低试错成本
- 更快拿到运行期证据
- 先验证单步假设，再沉淀代码
- 减少一次性写大脚本导致的上下文爆炸

## 2. 适用范围

适用于：

- 权限探测
- 窗口发现
- 局部截图
- OCR 小实验
- 模板匹配阈值试探
- 单步动作验证
- 失败复盘后的最小重试

不适用于：

- 已稳定、需要长期复用的正式能力
- 需要进入统一 gate / replay / recovery 的框架主链
- 需要被其他 worker 或主命令稳定消费的能力

## 3. 推荐工作流

### Phase A：文本驱动试错

优先使用：

```bash
./scripts/run_macos_stable.sh -script-text "console.log('probe')"
```

或：

```bash
cat <<'EOF' | ./scripts/run_macos_stable.sh -script-stdin -timeout 4
console.log("step probe");
EOF
```

目标：

- 快速验证一个最小假设
- 只做一个动作或一个观测
- 立刻拿到截图、OCR、窗口状态、报错信息

### Phase B：局部脚本沉淀

当文本驱动试验重复出现时，再沉淀为小脚本：

- 一个脚本只解决一个小问题
- 一个脚本只负责一个动作或一个验证
- 不要一开始就写成大而全的 `send` 脚本

建议拆分粒度：

- `locate_search_area`
- `focus_search_input`
- `type_search_query`
- `open_chat`
- `verify_chat_header`
- `focus_input`
- `type_draft`
- `locate_send_action`
- `click_send`
- `read_reply`
- `scroll_message_list`

### Phase C：组合验证

单步稳定后，再逐步组合：

- 1 步组合：`open_chat`
- 2 步组合：`open_chat -> verify_chat_header`
- 3 步组合：`open_chat -> verify_chat_header -> focus_input`

不要直接从单步跳到完整发送闭环。

### Phase D：框架沉淀

只有满足以下条件，才值得放入框架主链：

- 已跨多次运行稳定
- 已脱离某次临时窗口状态
- 能产出统一 artifact
- 对后续 worker / replay / recovery 有复用价值

## 4. 文档边界

以下内容适合写进框架文档：

- capture contract
- template audit
- send safety
- real validation
- replay / checkpoint / recovery

以下内容不应默认写进框架主链：

- 为了开发方便设计的临时 step mode
- 一次性的调试顺序
- 某轮试验中的临时阈值
- 仅用于当前 agent 调试上下文的拆分结构

## 5. 多文件建议

对于复杂 worker，不建议持续堆到一个 `.js` 文件。

推荐结构：

```text
examples/mac/wechat_steps/
  00_window_guard.js
  10_capture_helpers.js
  20_template_relocate.js
  30_search_flow.js
  40_open_chat.js
  50_focus_input.js
  60_send_guard.js
  70_read_reply.js
```

主入口脚本只负责：

- 读取配置
- 选择当前执行步骤
- 组织组合顺序
- 汇总证据输出

## 6. 判断标准

### 应继续文本驱动

- 假设还没被验证
- 只想看一张截图/一个 OCR 结果
- 需要快速试探窗口/坐标/阈值

### 应沉淀成小脚本

- 同类试验已重复 2 次以上
- 需要反复回归
- 输出已经变成固定证据格式

### 应进入框架

- 已不是开发便利，而是稳定能力
- 对多个脚本/worker 有复用价值
- 需要进入统一 gate

## 7. 结论

`-script-text` / `-script-stdin` 是 Agent 开发加速器，不是框架本体。

正确顺序是：

```text
text probe
-> small script
-> gradual composition
-> framework promotion
```

不要把“为了开发方便的拆分方式”过早固化成框架结构。

相关文档：

- `docs/EXECUTION_FAILURE_CASES.md`
- `docs/EXECUTION_RUNTIME_NOTES.md`
