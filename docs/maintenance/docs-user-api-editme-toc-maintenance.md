---
title: docs-user-api editme-cli TOC maintenance
description: 维护 OpenDesk docs-user-api 的 TOC、用户可读性与长期重生成边界。
order: 10
---

# docs-user-api editme-cli TOC maintenance

## 背景

`docs-user-api/` 是 OpenDesk 当前唯一维护、并直接用于渲染的用户 API 文档目录。

目标：

- 右侧 TOC 自然
- 页面像正式 SDK/reference
- API 覆盖完整但不把内部说明碎片全部变成标题
- 人类与 Agent 都能快速定位接口

历史上的 `docs-api/`、`docs-api-user/`、`docs/api/`、`dev/api.md` 已经退役，不再作为平行 API 文档来源。

## 核心结构规则

### 1. TOC 应突出什么

优先：

- 页面级 section
- 对象级 section
- 方法级 section

TOC 应表现“用户导航骨架”，不是内部维护机制清单。

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

`types/*.d.ts`、`jsconfig.json` 的维护机制不需要单独占一个 `docs-user-api` 页面；只在 README/index 保留必要入口说明，详细治理规则留在 `docs/maintenance/`。

## 当前页面分组

### 核心桌面

- `page.md`
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
- `clipboard-console.md`

### 网络与服务

- `http.md`
- `http-server.md`

### Runtime

- `runtime.md`
- `polyfills.md`
- `libs.md`
- `runtime-utilities.md`

### 索引与示例

- `README.md`
- `index.md`
- `runtime-api.ai.json`
- `cookbook.md`

## Runtime 文档特殊规则

`runtime.md` 需要清楚区分原生对象注入、polyfill、JS libraries、runtime console、Screen 绑定和 runtime stack，但不要把每个内部变量都做成用户 API。

`page____Inject`、`browser____Inject`、`context____Inject` 只作为内部构造机制解释，不建议用户直接依赖。

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
