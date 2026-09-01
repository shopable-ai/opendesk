---
title: 自定义 JavaScript API
description: 使用 OpenDesk 已有公开 JavaScript API 组合自己的辅助接口、业务封装和 Polyfill。
order: 15
---

# 自定义 JavaScript API

本页只讨论一种最安全、最容易维护的扩展方式：

> **不修改 Go Runtime，只使用 OpenDesk 已有公开 JavaScript API，组合出自己的接口。**

适合脚本作者、自动化使用者和 Agent 开发者。

如果你的需求必须新增原生系统能力、Go 代码、特殊设备驱动或运行时内部接口，请直接阅读本文末尾的“超出 JavaScript 自定义范围时怎么办”。

## 自定义 JavaScript API：适用场景

优先使用 JavaScript 组合已有能力：

- 给现有 API 增加默认参数。
- 做参数校验和输入规范化。
- 把多个 API 组合成一个业务辅助函数。
- 统一返回值结构。
- 封装重复的窗口、截图、OCR、文件、网络操作。
- 给具体应用建立轻量 helper / adapter。
- 对历史调用方式做兼容包装。

例如已有：

```js
System.getSystemInfo();
File.exists(path);
```

可以组合成自己的公开对象：

```js
(function (global) {
  const workspace = {
    systemInfo() {
      return System.getSystemInfo();
    },

    exists(path) {
      if (typeof path !== 'string' || !path.trim()) {
        throw new TypeError('workspace.exists(path) requires a non-empty path');
      }
      return File.exists(path);
    }
  };

  global.workspace = Object.freeze(workspace);
})(globalThis);
```

用户脚本随后可以调用：

```js
const info = workspace.systemInfo();
const exists = workspace.exists('./data.json');
```

## 自定义 JavaScript API：两种使用方式

### 自定义 JavaScript API：方式一，直接写在业务脚本中

这是最简单、兼容性最高的方法。

适合：

- 单个项目使用。
- 还在实验接口命名和参数。
- 不需要多个脚本共享。

推荐先在业务脚本中验证 API 设计，再决定是否做成自动加载的共享 JavaScript 文件。

### 自定义 JavaScript API：方式二，放入完整的 `polyfills/` 目录

如果一个 JavaScript 扩展已经稳定并需要多个脚本共享，当前源码可以把它放入 Runtime 实际选中的完整 `polyfills/` 目录。

例如：

```text
polyfills/900-workspace.js
```

但这只是当前实现下的兼容方式，不代表 OpenDesk 已经具有正式的 User Extension / Project Extension 插件系统。

**重要：当前 OpenDesk 还没有独立的 User / Project Extension 合并加载机制。**

运行时会从可执行文件目录和当前工作目录向上寻找一个可用的 `polyfills/` 目录，并使用找到的目录。因此不要随意创建一个只包含单个自定义文件的不完整 `polyfills/` 目录，否则可能遮蔽完整的 Runtime Polyfill 资源。

开发环境中应把自定义文件放进当前完整的 `polyfills/` 目录；二进制发行环境中，如果 Runtime 资源目录不可写或不可见，优先继续在业务脚本内封装，或由项目作者 / 维护者提供对应扩展或定制构建。

## 自定义 JavaScript API：文件加载规则与顺序

这一规则会直接影响多个 JavaScript 文件之间的依赖关系，必须明确理解。

当前 Runtime 的行为是：

```text
1. 选中一个 polyfills/ 目录
2. 只读取该目录第一层的 *.js 文件
3. 对文件名执行 Go sort.Strings() 字符串排序
4. 按排序结果逐个 RunString()
```

也就是说，**加载顺序由完整文件名的字符串顺序决定，不是把数字前缀解析成整数后排序。**

因此推荐文件名始终使用固定宽度前缀，例如：

```text
900-workspace.js
910-company-tools.js
920-wechat-helper.js
```

不要混用：

```text
9-a.js
10-b.js
100-c.js
```

因为字符串排序可能与人脑理解的数值顺序不同。

### 自定义 JavaScript API：当前 Core Polyfill 的真实顺序

以当前仓库文件名为准，现阶段排序大致为：

```text
000-console.js
000-demo.js
000-global.js
000-page.js
000-systemBase.js
001-promise.js
001-timers.js
002-sleep.js
003-window.js
004-axios.js
url-search-params.js
```

这里有一个特别容易误判的地方：

```text
900-workspace.js
```

虽然数字看起来很大，但在纯字符串排序下仍然会排在：

```text
url-search-params.js
```

之前加载。

因此：

- `900-`、`910-`、`920-` 只是当前推荐的自定义文件命名风格，不是 Runtime 强制保留的正式编号区间。
- 不要因为数字更大就假设它一定在所有 Core Polyfill 后执行。
- 如果一个文件依赖另一个文件，必须根据**实际文件名排序**验证依赖顺序。
- 当前 Core 中仍存在没有数字前缀的文件，因此暂时不能把“数字越大 = 越晚加载”当成稳定契约。

后续计划会把 Core / User / Project 分层、Core 文件命名统一以及 Embedded Core JS 作为独立 Runtime 演进事项；在正式机制实现前，本页只记录当前真实行为。

## 自定义 JavaScript API：多文件组织

如果确实需要多个自定义文件，优先按依赖关系留出明确间隔：

```text
900-workspace-base.js
910-workspace-file.js
920-workspace-vision.js
930-workspace-actions.js
```

其中：

```text
900
→ 定义基础对象和共享工具

910 / 920
→ 增加独立能力

930
→ 组合前面的能力
```

不要让两个文件循环依赖，例如：

```text
900-a.js 依赖 910-b.js
910-b.js 又依赖 900-a.js
```

如果一个业务封装只有几十行，并且只被一个脚本使用，继续放在业务脚本中通常比拆成多个自动加载文件更简单。

## 自定义 JavaScript API：推荐结构

一个稳定的 JavaScript 自定义接口建议包含：

```text
公开对象名
→ 参数校验
→ 默认值
→ 调用已有公开 API
→ 返回值规范化
→ 明确错误
```

例如：

```js
(function (global) {
  if (!global.window || !global.page) {
    throw new Error('[desktopHelper] required OpenDesk APIs are unavailable');
  }

  const desktopHelper = {
    async captureActiveWindow(options = {}) {
      const cfg = {
        type: 'png',
        encoding: 'base64',
        ...options
      };

      return await page.screenshot({
        target: 'activeWindow',
        ...cfg
      });
    }
  };

  global.desktopHelper = Object.freeze(desktopHelper);
})(globalThis);
```

## 自定义 JavaScript API：不要直接依赖 `____Inject`

普通自定义脚本不要使用：

```js
page____Inject
browser____Inject
context____Inject
```

这类名称属于运行时内部桥接面，主要用于 OpenDesk 自己的 Polyfill / facade 构造。

用户扩展应优先依赖已经公开的：

```text
page
mouse
keyboard
window
Screen
Vision
ImageColor
System
File
AppStorage
clipboard
http
axios
```

原因是公开 API 可以保留兼容层，而内部桥对象可能随 Runtime 重构发生变化。

## 自定义 JavaScript API：公开 owner 只能定义一次

自定义全局对象时，避免多个文件重复执行：

```js
globalThis.workspace = ...
```

否则后加载文件会覆盖前一个对象。

推荐每个公开全局对象只有一个 owner 文件，例如：

```text
900-workspace.js        → globalThis.workspace
910-company-tools.js    → globalThis.companyTools
920-wechat-helper.js    → globalThis.wechatHelper
```

这里的数字主要用于同一批自定义文件之间保持清晰顺序；是否位于所有 Core 文件之后仍以“当前文件加载规则与顺序”为准。

不同能力需要协作时，通过调用彼此公开对象完成，而不是重复覆盖同一个全局对象。

## 自定义 JavaScript API：参数和返回值

建议自定义 API 遵循以下约定：

- 对外优先使用对象参数，方便以后增加字段。
- 必填参数尽早检查并抛出明确错误。
- 不把 `undefined`、空字符串和失败混成同一种状态。
- 业务型方法优先返回结构化对象。
- 不把“调用没有抛异常”当成业务成功。

推荐：

```js
async function locateAndClick(options = {}) {
  if (!options.target) {
    throw new TypeError('target is required');
  }

  // locate...
  // act...
  // verify...

  return {
    ok: true,
    target: options.target
  };
}
```

## 自定义 JavaScript API：同步和异步

如果底层公开 API 返回 Promise，自定义接口应继续使用 `async/await`：

```js
const custom = {
  async requestJSON(url) {
    const response = await axios.get(url);
    return response.data;
  }
};
```

不要因为外层函数写成 `async`，就假设一个同步、阻塞的底层原生调用自动变成后台任务。

长时间任务应优先使用 OpenDesk 已有执行、HTTP 或 MCP 能力，而不是在一个 helper 中无限阻塞。

## 自定义 JavaScript API：编辑器类型提示

当自定义 API 已经稳定，可以增加对应 `.d.ts`：

```text
types/workspace.d.ts
```

例如：

```ts
interface WorkspaceAPI {
  systemInfo(): unknown;
  exists(path: string): boolean;
}

declare const workspace: WorkspaceAPI;
```

当前 `jsconfig.json` 已包含 `types/**/*.d.ts`，用于 VS Code / TypeScript 风格的自动补全。

如果只是个人临时脚本，不必为了一个实验 helper 立即增加类型文件。

## 自定义 JavaScript API：最小测试

至少验证：

1. 正常参数可以成功运行。
2. 缺少必填参数时返回明确错误。
3. 底层 API 失败时错误不会被吞掉。
4. 相同脚本重复运行不会污染全局状态。
5. 如果依赖平台或权限，需要验证对应失败路径。
6. 多文件扩展必须验证实际加载顺序和依赖关系。
7. 重要业务动作有动作后验证，而不是只检查函数返回。

## 自定义 JavaScript API：何时停止 JavaScript 包装

出现以下情况时，继续增加 JavaScript wrapper 通常已经不能真正解决问题：

- 当前 Runtime 根本没有需要的系统能力。
- 需要调用新的 OS 原生 API。
- 需要新的设备、驱动或底层库。
- 对性能、实时性或内存复制有原生级要求。
- 需要修改 goja Runtime 的注入和生命周期。
- 需要新的权限模型或安全边界。
- 需要把能力正式加入 OpenDesk 核心并跨 CLI / HTTP / MCP 保持一致。

这时属于 **Native / Runtime Extension**，而不是普通用户 JavaScript 自定义。

## 自定义 JavaScript API：超出范围后的方案

按以下顺序判断：

```text
现有 JavaScript API 能组合完成？
→ 可以：继续使用本页方案

已有能力可以通过独立服务提供？
→ 可以：优先通过 HTTP / MCP 外置扩展

能力适合由本机独立 executable 通过 one-shot JSON 调用？
→ 可以：使用 Experimental Native Extension Plugin V1；底层复用 Native Process Protocol V0，不需要 OpenDesk Core 源码

必须修改 OpenDesk Go Runtime？
→ 当前需要源码权限、重新构建和运行时级测试

需要完整插件生命周期、自动安装或 Stable Native ABI？
→ 当前尚未提供；使用外置扩展，或联系项目作者 / 维护者定制
```

### 自定义 JavaScript API：HTTP / MCP 外置扩展

如果能力已经存在于 Python、Node.js、模型服务、数据库服务或公司内部系统中，通常没必要编译进 OpenDesk。

可以采用：

```text
OpenDesk JavaScript
→ http / axios 或 MCP
→ 外部服务
→ 返回结构化结果
```

这种方式更容易独立升级，也不会修改核心 Runtime。

### 自定义 JavaScript API：源码级 Go 扩展

如果你拥有对应源码和构建权限，可以由 OpenDesk 维护者按项目的 Runtime API 扩展框架增加原生能力。

源码级扩展不是本页的普通用户 API 范围，也不建议业务脚本直接依赖内部 Go bridge 名称。

### 自定义 JavaScript API：无核心源码的 Native 扩展

当前 OpenDesk 尚未提供稳定的第三方 Native Extension ABI。

但“没有核心源码的 Native 扩展”已经不再只是未来计划：当前存在
[Experimental Native Extension Plugin V1](native-extension.md)。第三方可以用 Go、
Swift、Rust、C/C++ 等语言实现独立 executable 和公开 one-shot JSON 协议，不需要
import OpenDesk 内部 Go package，也不需要获得 OpenDesk Core 源码；完整 bundle 通过
严格 `extension.json` 被 Host 自动发现。

JavaScript 日常调用不传 executable、extension basename 或 wire method。Host 从
manifest 生成不可变 namespace/method closure：

```js
const result = NativeExtensions.goBasic.hello({ name: 'OpenDesk' });
```

这条能力仍是默认关闭的 Experimental V1：只有受信任的本机 CLI JavaScript execution
显式传入 `-experimental-native-extension` 才注入 `NativeExtensions`。Discovery、
list/get/diagnostics 不启动 executable，也不执行第三方 bundle JS；生成的方法真正调用
时才启动一次 one-shot process。当前没有 Extension Manager、在线安装/更新、sandbox、
自定义 JS facade 或 Stable ABI。低层 V0 `NativeExtension.call` 仅保留在独立 unsafe
本机诊断 gate 中，不是日常接口。

### 自定义 JavaScript API：联系作者 / 维护者定制

如果你拿到的是二进制版本、没有源码权限，或者希望得到正式支持的原生能力，可以联系 OpenDesk 项目作者 / 维护者提出定制需求。

适合定制的典型需求包括：

- 新的 Windows / macOS / Linux 原生能力。
- 企业内部软件或专有系统 Adapter。
- 特殊 OCR / Vision / 模型 provider。
- 特殊设备、SDK、数据库或业务系统集成。
- 新的 Runtime API、HTTP API 或 MCP Tool。
- 权限、部署、长期运行和可靠性工程。
- 私有业务 Workflow、Skill 与自动化方案。

提交定制需求时，建议至少提供：

```text
目标任务
使用平台
输入
期望输出
现有接口为什么不能完成
是否需要长期运行
权限 / 安全约束
验收条件
```

项目维护者可以据此判断应采用 JavaScript、HTTP/MCP 外置服务、原生 Go 扩展，还是独立应用 Adapter，而不是默认把所有需求都写进核心 Runtime。

统一支持、定制类型、需求模板和交付流程见仓库根目录：

```text
SUPPORT.md
```

所有用户文档统一指向这一处；未来增加官网、商务邮箱、Issue 模板、GitHub Discussions 或工单系统时，只更新 `SUPPORT.md`，不要把私人联系方式散落到各个 API 页面。

## 自定义 JavaScript API：相关文档

- `index.md`：当前公开 API 地图。
- `runtime.md`：Runtime 注入与 stack。
- [native-extension.md](native-extension.md)：Experimental Native Extension Plugin V1、底层 one-shot Native Process Protocol V0、默认目录与安全边界。
- `global-apis.md`：当前全局接口、运行时辅助能力和已有增强能力。
- `http.md`：脚本内 HTTP 调用。
- `http-server.md`：从外部触发 OpenDesk。
- `cookbook.md`：脚本组合示例。
- `../docs/plans/runtime/runtime-extension-roadmap.md`：未来 User / Project Extension、Embedded JS 与 Native Extension SDK 路线计划。
- `../SUPPORT.md`：统一支持与商业定制入口。
