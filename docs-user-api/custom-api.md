---
title: 自定义 JavaScript API
description: 使用 Clawdesk 已有公开 JavaScript API 组合自己的辅助接口、业务封装和 Polyfill。
order: 15
---

# 自定义 JavaScript API

本页只讨论一种最安全、最容易维护的扩展方式：

> **不修改 Go Runtime，只使用 Clawdesk 已有公开 JavaScript API，组合出自己的接口。**

适合脚本作者、自动化使用者和 Agent 开发者。

如果你的需求必须新增原生系统能力、Go 代码、特殊设备驱动或运行时内部接口，请直接阅读本文末尾的“超出 JavaScript 自定义范围时怎么办”。

## 适合用 JavaScript 自定义的场景

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

## 两种使用方式

### 方式一：直接写在业务脚本中

这是最简单、兼容性最高的方法。

适合：

- 单个项目使用。
- 还在实验接口命名和参数。
- 不需要多个脚本共享。

推荐先在业务脚本中验证 API 设计，再决定是否做成自动加载的 Polyfill。

### 方式二：做成 Polyfill

如果一个 JavaScript 扩展已经稳定并需要多个脚本共享，可以放入运行时实际加载的 `polyfills/` 目录。

例如：

```text
polyfills/900-workspace.js
```

文件名建议使用较大的数字前缀，让它在基础 Polyfill 之后加载。

当前运行时会按文件名排序执行 `polyfills/*.js`。

**重要：当前 Clawdesk 还没有独立的 `user-polyfills/` 合并加载机制。**

运行时会从可执行文件目录和当前工作目录向上寻找一个可用的 `polyfills/` 目录，并使用找到的目录。因此不要随意创建一个只包含单个自定义文件的不完整 `polyfills/` 目录，否则可能遮蔽完整的运行时 Polyfill 资源。

开发环境中应把自定义文件放进当前完整的 `polyfills/` 目录；二进制发行环境中，如果运行时资源目录不可写或不可见，优先继续在业务脚本内封装，或由项目作者/维护者提供包含该 Polyfill 的定制发行包。

## 自定义 API 的推荐结构

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
    throw new Error('[desktopHelper] required Clawdesk APIs are unavailable');
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

## 不要直接依赖 `____Inject`

普通自定义脚本不要使用：

```js
page____Inject
browser____Inject
context____Inject
```

这类名称属于运行时内部桥接面，主要用于 Clawdesk 自己的 Polyfill / facade 构造。

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

## 一个对象只定义一次公开 owner

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

不同能力需要协作时，通过调用彼此公开对象完成，而不是重复覆盖同一个全局对象。

## 参数和返回值规则

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

## 同步和异步

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

长时间任务应优先使用 Clawdesk 已有执行、HTTP 或 MCP 能力，而不是在一个 helper 中无限阻塞。

## 编辑器类型提示

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

## 自定义 API 的最小测试

至少验证：

1. 正常参数可以成功运行。
2. 缺少必填参数时返回明确错误。
3. 底层 API 失败时错误不会被吞掉。
4. 相同脚本重复运行不会污染全局状态。
5. 如果依赖平台或权限，需要验证对应失败路径。
6. 重要业务动作有动作后验证，而不是只检查函数返回。

## 什么情况下不要继续用 JavaScript 包装

出现以下情况时，继续增加 JavaScript wrapper 通常已经不能真正解决问题：

- 当前 Runtime 根本没有需要的系统能力。
- 需要调用新的 OS 原生 API。
- 需要新的设备、驱动或底层库。
- 对性能、实时性或内存复制有原生级要求。
- 需要修改 goja Runtime 的注入和生命周期。
- 需要新的权限模型或安全边界。
- 需要把能力正式加入 Clawdesk 核心并跨 CLI / HTTP / MCP 保持一致。

这时属于 **Native / Runtime Extension**，而不是普通用户 JavaScript 自定义。

## 超出 JavaScript 自定义范围时怎么办

按以下顺序判断：

```text
现有 JavaScript API 能组合完成？
→ 可以：继续使用本页方案

已有能力可以通过独立服务提供？
→ 可以：优先通过 HTTP / MCP 外置扩展

必须修改 Clawdesk Go Runtime？
→ 需要源码权限、重新构建和运行时级测试

只有二进制发行版或没有源码权限？
→ 联系项目作者 / 维护者进行原生能力定制或定制构建
```

### HTTP / MCP 外置扩展

如果能力已经存在于 Python、Node.js、模型服务、数据库服务或公司内部系统中，通常没必要编译进 Clawdesk。

可以采用：

```text
Clawdesk JavaScript
→ http / axios 或 MCP
→ 外部服务
→ 返回结构化结果
```

这种方式更容易独立升级，也不会修改核心 Runtime。

### 源码级 Go 扩展

如果你拥有对应源码和构建权限，可以由 Clawdesk 维护者按项目的 Runtime API 扩展框架增加原生能力。

源码级扩展不是本页的普通用户 API 范围，也不建议业务脚本直接依赖内部 Go bridge 名称。

### 联系作者 / 维护者定制

如果你拿到的是二进制版本、没有源码权限，或者希望得到正式支持的原生能力，可以联系 Clawdesk 项目作者 / 维护者提出定制需求。

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

如果未来项目建立统一商务邮箱、Issue 模板或其他官方支持入口，应在这里链接官方入口；不要把私人联系方式硬编码进 API 文档。

## 相关文档

- `index.md`：当前公开 API 地图。
- `runtime.md`：Runtime 注入与 stack。
- `polyfills.md`：当前 Polyfill 加载和已有增强能力。
- `http.md`：脚本内 HTTP 调用。
- `http-server.md`：从外部触发 Clawdesk。
- `cookbook.md`：脚本组合示例。
