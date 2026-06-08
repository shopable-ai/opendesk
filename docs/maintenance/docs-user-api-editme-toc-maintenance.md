---
title: docs-user-api editme-cli TOC maintenance
description: 维护 docs-user-api 在 editme-cli 中的 TOC 友好结构，并为未来版本升级或从头重生成提供操作规则。
order: 10
---

# docs-user-api editme-cli TOC maintenance

## 背景

这份维护文档记录了 testMonkey-go 项目中 `docs-user-api/` 的一轮 TOC 结构治理经验。

目标不是补内容覆盖，而是保证这些 API 页面在 editme-cli 预览时：
- 右侧 TOC 自然
- 层级克制
- 页面像正式 SDK/reference 文档
- 不被方法内部小节刷屏

适用目录：
- `/Users/a0000/Documents/workspace/testMonkey-go/docs-user-api`

相关上游约束已同步落地到 editme-cli：
- `packages/editme-cli/src/ai-rules-sidecar.js`
- `packages/editme-cli/src/init-docs-site.js`
- 对应 tests

## 这轮治理覆盖了哪些页面

已整理页面：
- `page.md`
- `window.md`
- `vision.md`
- `http.md`
- `runtime.md`
- `cookbook.md`
- `input.md`
- `screen.md`
- `file.md`
- `system.md`
- `clipboard-console.md`
- `libs.md`

说明：
- `http.md` 中的方法级 `###` 仍保留，因为它们承载真实方法导航价值。
- `vision.md` 中 `OCR.extractText(image, lang)` 已提升到方法级标题，以便和其它方法保持同类结构。

## editme-cli 场景下的核心结构规则

### 1. TOC 应该突出什么

右侧 TOC 应主要体现：
- 页面级 section
- 对象级 section
- 方法级 section

换句话说，TOC 应该像“目录骨架”，而不是“方法内部说明清单”。

### 2. 方法内部什么内容要降级

以下内容通常不要继续使用深层 Markdown heading：
- 参数
- 返回值
- 行为规则
- 错误条件
- 示例
- 注意事项
- 特殊规则块，例如：
  - `returnType 行为`
  - `displayIndex 规则`

这些内容优先改成：
- 粗体标签
- 表格
- 紧凑列表
- 引导句
- blockquote

推荐写法：
- `**参数**`
- `**返回值**`
- `**常见错误**`
- `**示例**`

不推荐写法：
- `### 参数`
- `### 返回值`
- `### 示例`
- `#### 行为规则`

### 3. 页面应像正式 SDK 文档

页面整体应更像：
- 用户可读 reference
- SDK 文档
- 手册页

而不是：
- 源码分析提纲
- 调研笔记
- 逐段剖析型层级树

## 本次实际采用的结构模式

### 模式 A：对象/方法保留 heading，方法内部块降级

适用页面：
- `page.md`
- `window.md`
- `vision.md`
- `screen.md`
- `clipboard-console.md`

模式：
- 保留 `## page.screenshot(options)`、`## window.getActiveWindow()` 这类方法级结构
- 把方法内部块改成粗体小标签或表格前导

### 模式 B：cookbook / 示例页按场景分组

适用页面：
- `cookbook.md`
- `libs.md`
- `page.md` / `window.md` / `input.md` / `screen.md` 的实战示例区

模式：
- 先保留少量场景组 heading，例如：
  - `## 截图与窗口`
  - `## 视觉与交互`
  - `## 文件、HTTP 与数据`
- 每个具体例子改成粗体块，例如：
  - `**示例 1：截图当前活动窗口**`
  - `**示例 2：处理时间参数**`

这样 TOC 只显示组级导航，不显示几十条例子。

### 模式 C：纯 reference 索引页保留方法级 heading，但不再深挖内部 heading

适用页面：
- `file.md`
- `system.md`
- `input.md`

模式：
- 保留方法目录项的 heading 价值
- 但方法内部说明不再继续细分 heading

## 各页面的结构改写摘要

### `page.md`
- 保留方法级标题
- `page.screenshot()` 内部的 参数/行为/错误/示例 全部降级
- 实战示例区不再使用多级 heading

### `window.md`
- 保留窗口方法级标题
- 实战示例改成粗体示例块

### `vision.md`
- 保留 `Vision.runOCR` / `Vision.detectUI` / `Vision.getCapabilities`
- 错误区与建议区内部块降级
- `OCR.extractText(image, lang)` 提升为方法级标题

### `http.md`
- 保留方法级导航
- `方法总表`、`默认配置`、`请求拦截器`、`响应拦截器` 降级为轻量块

### `runtime.md`
- 保留 runtime stack 主骨架
- 常见增强方法 / 推荐 / 示例块降级

### `cookbook.md`
- 从“25 个例子 heading”改成“4 个场景组 + 粗体 recipe 块”

### `input.md`
- 保留 mouse / keyboard / touchscreen 及其方法级标题
- 方法内部签名/参数/示例/说明降级
- 实战示例区降级

### `screen.md`
- 保留 Screen 方法级标题
- 参数/返回值/注意/示例降级
- 实战示例区降级

### `file.md`
- 保留常用文件方法为方法级条目
- `File.open()` 等方法的内部结构降级
- 实战示例区降级

### `system.md`
- 保留 System 方法级导航
- 返回结构和说明块降级

### `clipboard-console.md`
- 保留 clipboard / console 的关键方法级导航
- 方法总表 / 示例 / 说明 / 注意 降级

### `libs.md`
- 保留库对象级 section
- 使用建议里的 3 个示例不再作为 `###` heading，而是粗体示例块

## 以后版本升级时，应该怎么处理

未来升级 testMonkey-go 或 editme-cli 后，这批页面可能出现两类情况：

### 情况 1：只需要局部调整

适用场景：
- API 变动不大
- 只是新增/删除少量方法
- 某些方法参数或行为变了

建议做法：
1. 先对照当前源码确认 API 是否变动
2. 保持现有页面骨架不变
3. 只修改对应方法内容
4. 新增的方法也遵守本文件中的 TOC 规则

### 情况 2：需要从头重生成

适用场景：
- runtime 暴露方式大改
- 对象/方法大规模增删
- polyfill / facade 层重新组织
- docs-user-api 需要完全重建

建议做法：
1. 先基于源码重建“真实 API 面”
   - 区分 native API / polyfill API / legacy API
2. 先搭页面骨架，再填内容
   - 页面级 section
   - 对象级 section
   - 方法级 section
3. 禁止一上来就把方法内部每个说明块都写成 heading
4. 在完成首稿后，专门做一次 TOC 审核
   - 检查右侧 TOC 是否被 参数/示例/错误 之类刷屏
5. 必要时再次按本文件模式进行“结构降级”整理

## 重生成时的建议顺序

如果需要从头再生成一次 docs-user-api，推荐顺序：

1. `index.md`
2. `page.md`
3. `input.md`
4. `window.md`
5. `screen.md`
6. `system.md`
7. `file.md`
8. `clipboard-console.md`
9. `http.md`
10. `vision.md`
11. `runtime.md`
12. `polyfills.md`
13. `libs.md`
14. `http-server.md`
15. `cookbook.md`

原因：
- 先搭核心运行时对象
- 再补外围能力
- 最后再写 cookbook / 示例页，避免示例页先把结构带偏

## 重生成后的检查清单

每次升级后都建议跑一次人工检查：

### TOC 检查
- [ ] 右侧 TOC 主要展示页面级 / 对象级 / 方法级
- [ ] 方法内部的 参数/返回值/错误/示例 没有大量挤进 TOC
- [ ] cookbook 页面没有把每个例子都做成 heading

### 内容检查
- [ ] 文档仍覆盖当前真实可用 API
- [ ] native / polyfill / legacy 边界没有写乱
- [ ] 示例没有因为降级结构而丢失可读性

### editme-cli 约束检查
- [ ] `.editme/rules.md` 或 editme-cli scaffold 仍保留 TOC 规则
- [ ] 若 editme-cli 上游改了 sidecar/template 入口，需把这套规则重新补进去

## 与 skill / 上游规则的关系

后续如果由 Hermes / Codex / 其他 agent 重新生成或修订这套文档，应优先参考：

1. Hermes skill：
   - `editme-cli-docs-authoring`
   - `cli-docs-information-architecture`
   - `source-derived-api-docs`

2. editme-cli 上游约束入口：
   - `packages/editme-cli/src/ai-rules-sidecar.js`
   - `packages/editme-cli/src/init-docs-site.js`

## 一句话原则

如果一个标题只是在解释某个方法的内部细节，而不是帮助读者在页面中“导航到另一个对象/方法”，那它大概率不该继续作为高权重 Markdown 标题存在。
