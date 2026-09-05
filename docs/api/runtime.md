---
title: JavaScript Runtime
description: OpenDesk 脚本运行入口、异步生命周期、默认执行模式与历史兼容边界。
order: 14
---

# JavaScript Runtime

OpenDesk 为每次脚本执行创建独立的 JavaScript Runtime，注入当前可用的桌面、系统、文件和
网络 API，然后运行脚本并等待受 Runtime 管理的异步资源结束。新脚本直接使用默认模式，
不需要选择所谓的 browser stack。

## 从仓库根目录运行

```bash
./opendesk -script examples/api-quickstart.js
```

也可以运行一段短脚本：

```bash
./opendesk -script-text "console.log(Execution.id)"
```

## JavaScript 语言基线

Runtime 支持 ECMAScript 2015（通常称为 ES6）引入的**模板字面量**（template literal）：字符串
两侧各使用一个反引号，可以直接跨行，并支持 `${expression}` 插值。这里确认的是模板字面量这一项
语法能力，不表示文档在笼统承诺全部 ES6 特性。源码中的换行、缩进和末尾换行都会成为字符串内容，
不会自动去除：

```js
const name = 'OpenDesk';
const text = `hello ${name}
this is the second line
`;
```

代码示例开头和结尾的三个反引号是 Markdown 代码围栏，只负责文档排版，不属于 JavaScript 源码；
真正的字符串分隔符是字符串两侧各一个反引号。若内容本身需要保留 `${NAME}`，应在模板字符串中写成
`\${NAME}`，否则 JavaScript 会先尝试计算 `NAME`。普通单引号和双引号字符串不能直接跨源码行，仍需
使用 `\n`。写入多行文件的完整示例见 [File API](file.md)，生成 dotenv 内容时的转义示例见
[Environment Configuration](environment.md)。

ES6 是 ES2015 的旧称；常说的 ES7、ES8 分别对应 ES2016、ES2017，此后 ECMAScript 版本通常直接
按年份称呼。OpenDesk 不以“支持 ES6”或“支持最新 JavaScript”概括兼容性，而是逐项验证脚本实际依赖
的能力。当前正式 language gate 覆盖以下常用作者基线；版本只表示该能力首次进入标准，不表示 Runtime
通过了该版本的全部一致性测试：

| 标准版本 | 当前已验证的代表能力 |
| --- | --- |
| ES2015（ES6） | `let` / `const`、箭头函数、模板字面量、对象/数组解构、默认参数、rest/spread、`class`、`for...of`、`Map`、`Set`、`Promise` |
| ES2016（常称 ES7） | 指数运算符 `**`、`Array.prototype.includes()` |
| ES2017（常称 ES8） | `async` / `await`、`Object.values()`、`Object.entries()` |
| ES2018 | 对象 rest/spread |
| ES2019 | `Object.fromEntries()`、`Array.prototype.flatMap()` |
| ES2020 | 可选链 `?.`、空值合并 `??`、`globalThis`、`BigInt`、`Promise.allSettled()` |
| ES2021 | 数字分隔符、逻辑赋值、`Promise.any()`、`String.prototype.replaceAll()` |
| ES2022 | class public/private fields 与 static block、`Error.cause`、`Object.hasOwn()`、`.at()` |
| ES2023 | `findLast()` / `findLastIndex()`、Array change-by-copy（`toSorted()`、`toReversed()`、`toSpliced()`、`with()`） |

从仓库根目录运行对应的正式 JavaScript 验证：

```bash
OPENDESK_RUNTIME_API_MODE=language ./dist/opendesk -script scripts/test_runtime_apis.js -console-mode script
```

测试源码是 [`tests/runtime-api/javascript-language.js`](../../tests/runtime-api/javascript-language.js)。
它是 OpenDesk 作者基线测试，不替代 JavaScript 引擎上游的 Test262，也不按每个 ECMAScript 年份复制
一份测试文件。以后只有在实际示例或公开契约需要某项新语法时，才先把代表性断言加入该文件，再更新
本表；引擎碰巧能运行但未列入和未测试的语法不属于稳定承诺。当前未把 ES2024 及之后版本列入作者
基线。

### 脚本级 `await` 与模块边界

OpenDesk 允许在脚本文件顶层直接写 `await`，因为 Runtime 会把脚本主体放入受控的 async function
执行；这不是 ES module 的 top-level await 语义。当前脚本入口没有公开的 ESM loader，不能使用静态
`import` / `export` 或动态 `import()` 组织脚本。

内部执行环境可能保留 `require`、`module`、`exports` 等 CommonJS 兼容全局，但它们不是公开 Runtime
API，也没有稳定的包解析、安全或跨平台契约；公开脚本不得依赖它们。OpenDesk 也不是 Node.js 或浏览器
Runtime：文件、路径、命令、网络和桌面能力应分别使用文档化的 `File`、`path`、`Command`、`http` /
`axios` 和桌面 API。

脚本内无需 `import` 即可使用 `page`、`window`、`mouse`、`keyboard`、`File`、`path`、`System` 等
对象。完整对象列表见 [API 文档索引](index.md)，本次运行的标识、输入和 artifact 目录见
[Execution Context](execution.md)。

`Execution.workdir` 是本次 execution 的规范化绝对工作目录；`File.cwd()` 和所有相对 File 路径
（包括 `await File.readJSON()` / `await File.writeJSON()`）都以同一目录为准。它不改变宿主进程 cwd，
也不是可由脚本重新赋值来改变 File 后端的设置。

同步的 [Path API](path.md) 只处理字符串。`path.resolve()` 与 `path.relative()` 复用同一个
execution-owned WorkDir；它们不会访问磁盘或依赖进程 cwd。

## 异步完成与取消

顶层 `await` 是推荐的异步入口：

```js
await page.waitForTimeout(100);
console.log('done');
```

脚本主体返回后，Runtime 会继续等待由其持有的 timer、HTTP 请求、事件回调、声音、窗口、
录屏和其他已登记资源。执行超时、CLI 中断或 transport cancellation 会取消同一次 execution，
并触发这些资源的清理。不要启动 Runtime 无法持有的后台任务后立即结束脚本；需要本地命令时
使用受 execution 管理的 [Command API](command.md)。本地 `-script` 和 `ai run` 默认提供该能力，
HTTP、MCP 与 Scheduler execution 不提供。

`opendesk ai run` 还会等待常见的末尾 `main();` Promise；其他入口应使用顶层 `await` 明确
表达完成条件。AI recipe 的输入与输出约定见 [AI CLI](ai-cli.md)。

## 默认模式与 `-stack` 历史参数

`-stack` 是为早期兼容实验保留的参数。省略它时，当前实现内部记录
`Execution.stack === "legacy"`；这里的 `legacy` 只是默认 Runtime 的历史标签，不表示应为新
脚本选择一套旧 API。

早期版本还接受 `upgraded` 和 `playwright`。这两个值只切换同一进程内的 JavaScript facade：

- 不启动 Chromium、WebKit 或 Firefox；
- 不创建真实 browser context、tab 或 page realm；
- 不提供 DOM、CSS/XPath selector、locator actionability 或 browser navigation；
- 不提供真实 cookie jar、profile、localStorage 或 sessionStorage；
- `page.openURL()` / `page.goto()` 的底层行为仍是请求操作系统打开 URL。

因此，`browser`、`context`、`pageUpgraded`、`browserUpgraded`、`contextUpgraded`、
`Automation` 和 `playwright` 均不属于当前维护的用户 API。它们可能为了兼容旧脚本仍出现在
某些构建中，但不提供公开方法契约，也不应出现在新示例或新 workflow 中。

如果确实需要网页 DOM 自动化，应使用独立、成熟的 browser driver；OpenDesk 当前公开能力是
桌面自动化，不应把兼容对象的命名解释成 Playwright 支持。

## 环境、输出和项目配置

直接运行脚本默认使用 `normal` 输出：保留非调试脚本日志、完成摘要和错误，隐藏 framework
装载过程。本地 `Execution.env`、输出档位、`.env` / `.opendesk.env`、`-env-file`、优先级和安全边界见
[Environment Configuration](environment.md)。

## 内部实现说明

Runtime 注入顺序、native owner、polyfill 组成、内部 bridge 和资源清理模型属于维护者信息，
见 [Runtime API composition](../implementation/runtime/runtime-api-composition.md)。内部对象存在
不等于它是用户 API；公开契约只以 `docs/api/`、机器索引和对应类型声明为准。
