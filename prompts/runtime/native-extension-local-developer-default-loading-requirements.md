# Native Extension：本机开发者默认加载需求（待确认）

## 这份文档要解决什么

本轮首先要让插件开发者在当前 macOS 上完成一个直接、可重复的闭环：

```text
写插件 → 编译插件 → 放进 OpenDesk 指定目录
→ 正常启动 OpenDesk → 自动发现 → JavaScript 调用
```

这不是插件商店、下载器、自动更新器，也不是发布资产验收。开发者能在自己的机器上
完成并运行这个闭环，是本轮唯一的主目标。

## 用户实际做什么

插件开发者维护自己的源码，例如 `go-basic`：

1. 编译出一个 macOS executable。
2. 组装一个完整插件目录：

   ```text
   com.example.go-basic/
     extension.json
     bin/native-ext-go-basic
     types/index.d.ts              # 可选
   ```

3. 把这个完整目录放入 OpenDesk 程序相对的指定插件目录。
4. 正常运行一个 JavaScript 文件；不注册插件、不传 executable 路径、不传 wire method。

业务脚本应当就是：

```js
function main() {
  const hello = NativeExtensions.goBasic.hello({ name: "OpenDesk" });
  const sum = NativeExtensions.goBasic.add({ a: 20, b: 22 });
  console.log(JSON.stringify({ hello, sum }));
}

main();
```

预期输出：

```json
{"hello":{"message":"Hello OpenDesk"},"sum":{"value":42}}
```

## 默认加载位置

本需求草案把**程序相对的指定目录**作为唯一默认自动发现位置：

| OpenDesk 形态 | 指定插件目录 |
| --- | --- |
| 命令行程序 | `<opendesk executable directory>/native-extensions/` |
| macOS `.app` | `OpenDesk.app/Contents/Resources/NativeExtensions/` |

因此命令行程序相邻的实际目录形态是：

```text
<program-directory>/
  opendesk
  native-extensions/
    com.example.go-basic/
      extension.json
      bin/native-ext-go-basic
```

这里的“自动加载”只表示：OpenDesk 启动一个本地 JavaScript execution 时，自动读取这个
指定目录、校验 manifest，并生成 `NativeExtensions` Binding。它**不**在发现阶段执行插件，
也不执行 bundle 内的 `facade.js`、`install.js` 或任何第三方 JavaScript。

> 本草案不把 `$HOME/Library/Application Support/OpenDesk/NativeExtensions/` 作为本轮默认
> 开发加载路径。是否在未来增加它作为另一种安装模式，应由独立需求决定，不能改变本轮的
> “程序相对目录”主路径。

## 默认可用的含义

在本机 CLI 的普通 JavaScript execution 中，`NativeExtensions` 默认可用，并自动扫描
上面的指定目录；用户不需要额外传 `-experimental-native-extension`。

这个默认只适用于本机 CLI。HTTP、MCP 和其他远程执行通道仍然不能启用、重定向或调用
Native Extension。低层任意 executable 调用也不作为日常 JavaScript API 暴露。

## 开发与运行的边界

- 源码可以留在开发者项目中；安装目录只能有 manifest、已编译 executable 和可选类型文件。
- 不要求先打 archive、发布下载链接、签名、商店或更新机制；它们是未来分发需求。
- 每次启动新的 OpenDesk execution 都重新发现目录；开发者重新编译并替换 bundle 后，启动
  新 execution 即可使用新版本，不承诺 hot reload。
- JavaScript 只传业务参数。目录、plugin id、可执行文件、protocol 和 wire method 由通过
  校验的 manifest 固定，脚本不能覆盖。
- `list()`、`get()`、`diagnostics()` 只能读取已发现的 registry，不能启动插件进程。
- 只有 `NativeExtensions.<namespace>.<method>(params)` 才启动一次受校验的插件进程。

## 本轮 macOS 验收

验收在当前 macOS 上从当前冻结工作树重新生成证据，至少证明：

1. `go-basic` 能由插件开发者源码构建。
2. 把不含源码的完整目录复制到程序相对指定目录后，OpenDesk 自动发现它。
3. 从与仓库和插件目录无关的工作目录运行正式 `.js`，成功得到 `hello` 与 `add` 结果。
4. 同一条自动发现链能真实调用 macOS Vision OCR，并返回实际 OCR 文本。
5. 发现、`list()`、`get()` 和 `diagnostics()` 的 child count 都是零；业务调用才会启动插件。
6. manifest、目录、权限、ACL、symlink、摘要、文件替换和 route/root 注入攻击都 fail closed。
7. 持久 Event/diagnostics 不保存业务参数、业务结果、用户目录、绝对 executable 或插件原始错误。
8. 正式 JavaScript 测试、主机 Runtime proof、外层 exit code、SHA-256 和前后 source snapshot
   必须对应同一个当前工作树。

完成条件仍是 macOS-only 评分高于 95/100，所有 P0/P1 为零。

## 平台状态：不要把“本轮只验 macOS”写成“产品只支持 macOS”

下面四件事必须分开表达：

| 层次 | 当前事实 |
| --- | --- |
| Native Extension V1 源码 | discovery root、路径安全和进程实现已有 Darwin、Linux、Windows 分支；这是跨平台实现候选，不等于已完成目标机验收。 |
| `go-basic` 示例插件 | 只使用 Go 标准库，设计上可为各目标系统分别构建；每个系统仍需要对应 executable 和目标机验证。 |
| `macos-vision` 示例插件 | 使用 Apple Vision / Swift，只支持 macOS；它不能作为 Linux 或 Windows 插件能力的承诺。 |
| 本轮 Goal | 只在当前 macOS 构建、运行、攻击和评分；Linux/Windows 是 **Not Evaluated**，不是 **Unsupported**。 |

本轮不得把 Linux/Windows 的未运行状态报告为已支持，也不得为了补齐它们而启动
cross-compile、容器、虚拟机或模拟器。未来的跨平台 Goal 应复用同一个“程序相对指定目录
自动发现”的产品语义，但必须在每个目标系统单独验证。

## 不在本轮做什么

- Linux 或 Windows 的构建、测试或评分；这不是对现有跨平台源码候选的否定。
- 用户主目录插件安装、机器级 root、多 root 优先级或迁移。
- 插件下载、管理器、自动更新、商店、签名体系或公开 Release Asset。
- 自定义插件 JavaScript facade、热更新、常驻插件进程或 sandbox。

## 审阅时只需确认三件事

1. 程序相对目录是否就是上表的两个精确位置。
2. 本机 CLI 是否应该默认发现插件、无需 `-experimental-native-extension`。
3. `$HOME/Library/Application Support/...` 是否明确留给后续独立需求。
