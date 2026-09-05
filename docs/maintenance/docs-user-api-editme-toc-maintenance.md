---
title: docs/api editme-cli TOC maintenance
description: 维护 OpenDesk docs/api 的 TOC、用户可读性与长期重生成边界。
order: 10
---

# docs/api editme-cli TOC maintenance

## 背景

`docs/api/` 是 OpenDesk 当前唯一维护、并直接用于渲染的用户 API 文档目录。

目标：

- 右侧 TOC 自然
- 页面像正式 SDK/reference
- API 覆盖完整但不把内部说明碎片全部变成标题
- 人类与 Agent 都能快速定位接口

历史上的 `docs-api/`、`docs-api-user/`、`dev/api.md` 已经退役，不再作为平行 API 文档来源。

## 如何判断文档归属

| 要回答的问题 | 应放位置 | 典型内容 |
| --- | --- | --- |
| “我怎样调用它？” | `docs/api/` | 参数、返回、错误、平台限制、权限、可复制命令与脚本。 |
| “OpenDesk 怎样实现它？” | `docs/implementation/` | Go 注入、polyfill、内部对象、资源加载、架构与排障。 |
| “这些文档怎样保持一致？” | `docs/maintenance/` | Markdown / JSON / `.d.ts` 同步、生成、检查清单与事实优先级。 |
| “未来可能怎样演进？” | `docs/plans/` | 尚未承诺的路线、提案和迁移计划。 |

判断时以读者是否能只靠正文完成一次调用为准：能，则写用户接口文档；若正文要求修改
OpenDesk 源码、运行时资源或内部构造，则属于实现文档。不要仅因为内容涉及 JavaScript 就把
扩展作者指南放进 `docs/api/`。

## 核心结构规则

### 1. TOC 应突出什么

优先：

- 页面级 section
- 对象级 section
- 方法级 section

TOC 应表现“用户导航骨架”，不是内部维护机制清单。

### 1.1 接口章节标题格式

接口专属章节的标题必须包含可检索的接口名，并把用户语义放在后面：

```text
## notify：系统通知
## clipboard.copy(text)：写入剪贴板
## setTimeout / clearTimeout：一次性计时器
```

方法标题使用完整调用名；多个接口共同承担一个语义时并列列出接口名。只有术语解释、
目录导航、实现边界和维护规则等非接口章节可以使用概念型标题，例如“接口一览”或
“Native / Polyfill：接口来源”。避免只使用“快速用法”“说明”“错误行为”“实战示例”
等无法从 TOC 识别归属的标题。

### 2. 方法内部什么内容要降级

通常不要继续使用深层 heading：

- 参数
- 返回值
- 行为规则
- 错误条件
- 示例
- 注意事项
- `returnType`、displayIndex 等局部规则

优先改成粗体标签、表格和紧凑列表。

### 3. 页面应像 SDK 文档

应像用户 reference / SDK 手册 / 可复制的接口说明，不应像源码分析笔记、迁移记录或编辑器配置说明。

`types/*.d.ts`、`jsconfig.json` 的维护机制不需要单独占一个 `docs/api` 页面；只在 README/index 保留必要入口说明，详细治理规则留在 `docs/maintenance/`。

## 当前页面分组

### 核心桌面

- `page.md`
- `mouse.md`
- `input.md`
- `window.md`
- `screen.md`

### 视觉

- `vision.md`
- `image-color.md`

### 系统与数据

- `system.md`
- `file.md`
- `storage.md`
- `clipboard.md`

### 网络与服务

- `http.md`
- `http-server.md`

### Runtime

- `execution.md`
- `runtime.md`
- `global-apis.md`
- `libs.md`
- `sound.md`
- `custom-ui.md`

### 索引与示例

- `README.md`
- `index.md`
- `runtime-api.ai.json`
- `cookbook.md`

## 文档分层与 Runtime 归属

`docs/api/` 只保留用户最终能调用的 API、参数、返回值、错误、平台限制和可复制示例。它不应
解释 Go 注入顺序、polyfill 构造、资源查找或内部 `*____Inject` 对象。

- `docs/api/execution.md` 说明 `Execution` 的完整用户可见字段、输入、artifact 和安全边界。
- `docs/api/runtime.md` 说明脚本运行、异步生命周期、取消和历史兼容边界；不把内部
  browser-shaped facade 当作维护中的用户 API。
- [Runtime API composition](../implementation/runtime/runtime-api-composition.md) 记录 native
  注入、polyfill / facade 组成、内部对象和运行时资源排障。
- `page____Inject`、`browser____Inject`、`context____Inject` 不得被标记为用户 API，也不应
  出现在用户脚本示例、`runtime-api.ai.json` 或类型声明中。

## 事实优先级

接口事实冲突时按以下顺序判断：

1. 当前源码与实际 Runtime 行为
2. `docs/api/*.md` 的正式用户调用契约
3. `docs/api/runtime-api.ai.json` 的机器索引
4. `types/*.d.ts` 的编辑器类型声明
5. Git 历史

已退役的 `docs-api/`、`docs-api-user/`、`dev/api.md` 和根目录旧 `types.md` 不能恢复为平行
接口事实源。

## 机器可读索引与类型同步

`runtime-api.ai.json` 用于 Agent 上下文、API 检索和文档路由；`types/*.d.ts` 用于编辑器签名。

用户 API 变化时至少执行：

```text
源码确认
→ 对应 Markdown
→ index / runtime-api.ai.json（需要时）
→ types/*.d.ts
→ 声明检查
→ 示例检查
```

不要通过新增一页维护文档来代替真正的 `.d.ts` 同步。

## 版本升级处理

### 局部变化

1. 对照源码 / Runtime
2. 修改对应专题页
3. 导航变化时更新 `index.md`
4. 对象/主要方法路由变化时更新 `runtime-api.ai.json`
5. 参数、返回或同步语义变化时更新对应 `types/*.d.ts`
6. 做 TypeScript 声明、TOC 与示例复核

### 大规模变化

1. 先重建真实 API 面
2. 再定义页面归属
3. 再写 Markdown
4. 再生成/校准 `runtime-api.ai.json`
5. 再整体校准 `types/*.d.ts`
6. 最后做 TOC、声明与示例审核

不要从 Git 历史里的旧 TestMonkey 文档直接复制回当前目录。

## 每次维护后的检查清单

### 内容

- [ ] 所有主要全局对象都有 Markdown 归属
- [ ] native / polyfill / compatibility 边界清楚
- [ ] 默认值与源码一致
- [ ] 条件能力明确写出注入条件
- [ ] 高副作用 API 有风险提示
- [ ] 不存在开发者本机绝对路径
- [ ] 没有并行旧 API 文档树复活
- [ ] 没有内部维护专页污染用户导航

### Type / Agent

- [ ] `runtime-api.ai.json` 可以解析且文档路径存在
- [ ] 对应 `types/*.d.ts` 与用户最终调用签名一致
- [ ] Conditional API 在类型中体现可缺失
- [ ] Native / Polyfill 的同步与 Promise 语义没有混淆
- [ ] TypeScript 声明检查已执行或明确记录未执行范围

### TOC

- [ ] TOC 主要展示页面/对象/方法
- [ ] 参数/返回/错误/示例没有刷屏
- [ ] cookbook 没有把每个 recipe 变成 heading

## 一句话原则

**标题只服务用户导航；Markdown 负责渲染；JSON 和 `.d.ts` 是派生接口资产；API 变化必须同步校准。**
