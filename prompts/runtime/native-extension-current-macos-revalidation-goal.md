# Native Extension：当前 macOS 完善与验收 Goal

## 1. 任务目标

只在当前这台 macOS 上，完成并真实证明这条用户路径：

```text
插件作者编译已有 go-basic 示例
→ 得到不含源码的可安装 bundle
→ 普通用户把完整 bundle 放进固定默认目录
→ OpenDesk 自动发现 manifest 并生成不可变 Binding
→ 任意目录中的 .js 成功调用 hello 和 add
```

普通用户不编译 OpenDesk，也不编译扩展。日常调用固定为：

```js
NativeExtensions.goBasic.hello({ name: "OpenDesk" });
NativeExtensions.goBasic.add({ a: 20, b: 22 });
```

最终必须有当前源码对应的真实 macOS Runtime Evidence，多角色评分必须高于 **95/100**。

## 2. 用户最终应该怎样使用

用户取得的完整 bundle：

```text
com.example.go-basic/
  extension.json
  bin/native-ext-go-basic
  types/index.d.ts              # 可选
```

完整 bundle 放入唯一推荐目录：

```text
$HOME/Library/Application Support/OpenDesk/NativeExtensions/
  com.example.go-basic/
    extension.json
    bin/native-ext-go-basic
    types/index.d.ts            # 可选
```

`main.go`、`go.mod`、`quickstart.js` 不放入插件目录，也不能只复制 executable。

可直接保存并运行的 JavaScript：

```js
function main() {
  const hello = NativeExtensions.goBasic.hello({ name: "OpenDesk" });
  const sum = NativeExtensions.goBasic.add({ a: 20, b: 22 });
  console.log(JSON.stringify({ hello, sum }));
}

main();
```

```bash
opendesk -experimental-native-extension \
  -script /absolute/path/quickstart.js \
  -console-mode script
```

预期结果：

```json
{"hello":{"message":"Hello OpenDesk"},"sum":{"value":42}}
```

## 3. 关键文件

| 文件 | 用途 |
| --- | --- |
| `docs-user-api/native-extension.md` | 普通用户权威文档 |
| `examples/native-extensions/README.md` | 示例、作者构建和验证说明 |
| `examples/native-extensions/quickstart.js` | 可直接运行的用户示例 |
| `examples/native-extensions/go-basic/` | 插件作者源码、manifest 和类型 |
| `schemas/native-extension/extension-manifest-v1.schema.json` | manifest 正式规则 |
| `pkg/nativeextension/` | 自动发现、安全检查和进程调用 |
| `automation/native_extensions.go` | 不可变 JavaScript Binding |
| `tests/runtime-api/unit/native-extension.test.js` | 正式 JavaScript API 测试 |
| `python3 tests/extensions/native-plugin/tools/proof-harness/main.py` | 当前 macOS 专项验收入口 |
| `docs/quality/native-extension-plugin-v1.md` | 最终证据和评分 |

API 文档和 examples 索引必须直接链接到示例，用户不能靠搜索仓库猜文件位置。

## 4. 本轮范围

- 只处理当前 macOS，不研究、构建或测试 Linux/Windows。
- 保持当前 `master`，不创建或切换分支。
- 保护共享 dirty working tree；不擅自 reset、clean、stage、commit 或 push。
- 不实现 machine-wide 目录、Manager、下载器、自动更新或构建系统。
- 不自动执行任何第三方 JavaScript。
- 自定义 JavaScript facade 留给独立 V1.1。

当前工作树中的旧修改只是待审候选。旧 `.runtime` Evidence 只能用于定位问题，不能证明当前源码。

## 5. 执行顺序

### A. 先确认现场

1. 完整读取本 Goal、`AGENTS.md` 和 `docs-user-api/`。
2. 确认 branch、HEAD 和 working tree 状态。
3. 区分关键文件的 HEAD、Git index、working tree 三层内容。
4. 明确本轮验收的是哪个 working-tree snapshot。
5. 只读检查真实 `$HOME` 对应的默认目录，不覆盖已有插件。
6. 证明旧 Evidence 与当前源码是否一致；不一致即作废。

基线没有说明清楚前，不继续编码或运行最终 proof。

### B. 完成核心功能

必须确认：

- 默认目录与当前 cwd、脚本路径和源码目录无关；
- manifest 自动发现不会执行插件代码；
- Host 固定 executable、plugin、wire method、protocol 和 version；
- 普通脚本只传业务参数，不能指定 route 或 discovery root；
- Binding 不可修改或替换；
- `list()`、`get()`、`diagnostics()` 不启动扩展进程；
- 重复 id/namespace 全部 quarantine，不采用 last-wins；
- macOS 路径、权限、ACL、symlink、摘要和文件替换检查 fail closed；
- HTTP/MCP 不能开启或重定向 Native Extension；
- `facade.js`、`install.js` 等第三方 JavaScript 保持 inert。

### C. 完成用户与作者文档

消费者文档第一屏必须回答：

```text
拿什么 → 放哪里 → 写什么 → 怎么运行 → 看到什么 → 失败时怎样诊断
```

作者流程必须真实执行：

```text
Go release build → wire test → source-free bundle → digest/schema 校验
→ darwin-<arch> archive/checksum → 默认目录安装 → 正式 .js smoke
```

若没有公开下载资产，明确写 `Not Published / Not Verified`；本地 `.runtime` archive 不得冒充
Release Asset。

### D. 冻结并验收

停止所有写入后冻结输入，再真实运行：

1. Native Extension 的 Go 路径、安全和远程门禁测试；
2. `./scripts/test_runtime_apis.sh unit` 正式 `.js` 测试；
3. 当前 Mac 的 host-only 专项 proof；
4. source-free bundle 默认目录安装；
5. 独立 zero-child diagnostics；
6. installed `hello/add`；
7. 真实 Apple Vision OCR；
8. 文档中的 macOS build、安装、打包和 checksum 命令。

最终 proof 期间关键输入发生变化必须失败，不能反复运行直到偶然绿色。

## 6. Runtime Evidence 最低要求

最终报告必须记录：

- branch、HEAD、working-tree snapshot 和运行前后零漂移；
- run id、外层真实 exit code；
- OpenDesk、extension、archive、installed executable 的 SHA-256；
- source-free bundle 文件清单和默认目录安装结果；
- diagnostics child count 为 0；
- hello/add 与真实 OCR 结果；
- 正式 `.js` 测试结果；
- Native Extension Event 和 diagnostics 的隐私扫描。

用户控制台可以显示业务结果；持久化 Native Extension Event/diagnostics 不得保存原始业务参数、
业务结果、用户目录、绝对 executable 或扩展原始错误文本。

## 7. 多角色审计

只有主执行者可以修改文件，其他角色只读：

1. 架构审计：确认发现、Binding、Host、CLI 是一条正确路径。
2. macOS 安全红队：攻击路径、权限、ACL、替换、超时和隐私边界。
3. 用户体验审计：实际复制执行消费者和作者文档。
4. Evidence 审计：核对新鲜度、hash、exit code、zero-child 和 source-free inventory。
5. 反方终审：寻找假绿色、旧 Evidence、mock 冒充 Runtime 和 index/worktree 混淆。

顺序固定为：基线 → 修复 → 冻结 → 真实测试 → Evidence 复核 → 反方终审。

## 8. 评分与完成条件

| 维度 | 分值 |
| --- | ---: |
| 普通用户首次安装和调用 | 20 |
| 插件作者构建和发行 | 15 |
| 自动发现和不可变 Binding | 20 |
| macOS 安全 | 20 |
| 当前源码 Runtime Evidence | 20 |
| 范围纪律 | 5 |

完成必须同时满足：

- 总分高于 95/100；
- 所有专家 P0、P1 为零；
- 正式 `.js` 和 installed Runtime 均通过；
- 文档第一屏足以让新用户独立完成首次调用；
- 没有自动执行第三方 JavaScript；
- 没有扩展到 Linux、Windows 或 V1.1。

旧 Evidence、假绿色、route/root 可注入、zero-child 失败、安全绕过、未执行的文档命令或
index/worktree 混淆，任一存在时最高 80 分，状态必须为 `Incomplete / Not Accepted`。

## 9. 最终交付

最终回答简洁列出：当前 snapshot、默认目录、用户调用、作者构建、修改文件、测试结果、run id、
exit code、关键 hash、zero-child、隐私结论、Public asset 状态和多角色评分。

最后明确声明：结论只适用于当前 macOS；Linux/Windows 未评估。

没有当前源码对应的真实 installed Runtime Evidence，或用户仍不能明确回答“拿什么、放哪里、
怎么调用”，不得宣布完成。
