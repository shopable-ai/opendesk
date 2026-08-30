---
title: docs-user-api editme-cli TOC maintenance
description: 维护 Clawdesk docs-user-api 的 TOC、用户可读性与长期重生成边界。
order: 10
---

# docs-user-api editme-cli TOC maintenance

## 背景

`docs-user-api/` 是 Clawdesk 当前唯一维护的用户 API 文档目录。

目标：

- 右侧 TOC 自然
- 页面像正式 SDK/reference
- API 覆盖完整但不把内部说明碎片全部变成标题
- 人类与 Agent 都能快速定位接口

历史上的：

- `docs-api/`
- `docs-api-user/`
- `docs/api/`

已经退役，不再作为平行 API 文档来源。

## 核心结构规则

### 1. TOC 应突出什么

优先：

- 页面级 section
- 对象级 section
- 方法级 section

TOC 应表现“导航骨架”，不是“方法内部说明清单”。

### 2. 方法内部什么内容要降级

通常不要继续使用深层 heading：

- 参数
- 返回值
- 行为规则
- 错误条件
- 示例
- 注意事项
- `returnType`、displayIndex 等局部规则

优先改成：

- `**参数**`
- `**返回值**`
- 表格
- 紧凑列表
- blockquote

### 3. 页面应像 SDK 文档

应像：

- 用户 reference
- SDK 手册
- 可复制的接口说明

不应像：

- 源码分析笔记
- 调研提纲
- 每一条实现细节都单独做标题的目录树

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

## 页面结构模式

### 模式 A：对象/方法保留 heading

适合：

- `page.md`
- `window.md`
- `vision.md`
- `image-color.md`
- `screen.md`
- `storage.md`

保留方法导航；参数/返回/示例降级成轻量块。

### 模式 B：cookbook 按场景分组

保留少量场景 heading：

- 截图与窗口
- 视觉与交互
- 文件、HTTP 与数据
- 服务、运行时与诊断

具体 recipe 使用粗体标签，不要让几十个例子占满 TOC。

### 模式 C：纯 reference 页

适合：

- `file.md`
- `system.md`
- `input.md`
- `http.md`

保留有导航价值的方法 heading，但方法内部不继续层层拆 heading。

## Runtime 文档特殊规则

`runtime.md` 需要清楚区分：

- 原生对象注入
- polyfill 加载
- JS libraries
- runtime console
- Screen 绑定
- legacy / upgraded / playwright stack

但不要把每个内部变量都做成用户 API。

`page____Inject`、`browser____Inject`、`context____Inject` 只需要作为内部构造机制解释，不建议用户直接依赖。

## 机器可读索引规则

`runtime-api.ai.json` 用于：

- Agent 上下文
- API 检索
- 文档一致性检查
- 后续生成其他视图

它必须：

- 标记对象状态
- 指向对应 Markdown
- 明确 source/runtime 才是最高事实源
- 不包含已经退役的旧文档作为优先级来源

## 版本升级处理

### 局部变化

如果只新增/删除少量方法：

1. 对照源码
2. 修改对应专题页
3. 更新 `index.md`
4. 更新 `runtime-api.ai.json`
5. 做 TOC 与示例复核

### 大规模变化

如果 runtime 暴露方式大改：

1. 先重建真实 API 面
2. 再定义页面归属
3. 再写 Markdown
4. 再生成/校准 `runtime-api.ai.json`
5. 最后做 TOC 审核

不要从 Git 历史里的旧 TestMonkey 文档直接复制回当前目录。

## 每次维护后的检查清单

### 内容

- [ ] 所有主要全局对象都有归属
- [ ] native / polyfill / compatibility 边界清楚
- [ ] 默认值与源码一致
- [ ] 条件能力明确写出注入条件
- [ ] 高副作用 API 有风险提示
- [ ] 不存在开发者本机绝对路径
- [ ] 没有并行旧 API 文档树复活

### TOC

- [ ] TOC 主要展示页面/对象/方法
- [ ] 参数/返回/错误/示例没有刷屏
- [ ] cookbook 没有把每个 recipe 变成 heading

### Agent

- [ ] `runtime-api.ai.json` 可以解析
- [ ] JSON 的文档路径全部存在
- [ ] JSON 没有把 compatibility facade 写成完整第三方引擎

## 一句话原则

**标题只服务导航；API 事实只服从当前实现；同一套用户 API 只维护一个权威目录。**
