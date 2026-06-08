---
title: docs-user-api regen prompt
description: 给 Hermes / Codex / 其他 agent 的精简版重生成提示词与检查清单，用于在版本升级后重建 editme-cli 友好的 docs-user-api 文档结构。
order: 20
---

# docs-user-api regen prompt

## 用途

这是一份短版可复用 prompt/checklist。

适合在以下场景直接丢给 agent：
- testMonkey-go 升级后，`docs-user-api/` 需要跟随源码更新
- 现有页面结构已经漂移，需要重新整理 TOC
- 需要从头重生成一套新的 `docs-user-api/`

完整维护说明请看：
- `docs/maintenance/docs-user-api-editme-toc-maintenance.md`

## 可直接复用的 prompt

你现在在项目：
`/Users/a0000/Documents/workspace/testMonkey-go`

目标：
重建或更新 `docs-user-api/`，并确保这些 Markdown 页面在 editme-cli 中渲染时，右侧 TOC 保持自然、克制、可导航。

必须遵守：

1. 先以当前源码为准，重建真实 API 面
- 区分 native API / polyfill API / legacy API
- 不要沿用旧文档里已经失真的 page / DOM 风格假设

2. 页面结构要为 editme-cli 的右侧 TOC 优化
- TOC 应主要体现：
  - 页面级 section
  - 对象级 section
  - 方法级 section
- 不要让方法内部的小节主导 TOC

3. 方法内部以下内容通常不要继续用深层标题
- 参数
- 返回值
- 行为规则
- 错误条件
- 示例
- 注意事项
- 类似 `returnType 行为`、`displayIndex 规则` 这样的内部规则块

4. 方法内部优先使用轻量结构表达
- 粗体标签
- 表格
- 紧凑列表
- 引导句
- blockquote

5. 页面整体应更像用户可读的 SDK/reference 文档
- 不是源码分析提纲
- 不是调研笔记树
- 不能为了 TOC 简洁而删空内容覆盖

6. cookbook / 示例页特殊处理
- 不要让每个例子都成为 heading
- 先按场景分组，再把具体例子写成粗体示例块
- 例如：
  - `## 截图与窗口`
  - `**示例 1：截图当前活动窗口**`

7. 完成后做一次 TOC 审核
- 检查页面是否被“参数 / 返回值 / 示例 / 错误”刷屏
- 必要时再做一次 heading 降级整理

## 推荐页面生成顺序

如果需要从头重生成，建议顺序：
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

## 快速检查清单

### 结构检查
- [ ] TOC 主要显示页面级 / 对象级 / 方法级
- [ ] 方法内部说明块大多已降级为轻量结构
- [ ] cookbook 页面没有把每个例子都做成 heading

### 内容检查
- [ ] 文档仍覆盖真实可用 API
- [ ] native / polyfill / legacy 没有混写
- [ ] 页面仍像正式 reference，而不是笔记提纲

### 上游约束检查
- [ ] editme-cli 的约束入口仍存在
- [ ] 如有需要，同步检查：
  - `packages/editme-cli/src/ai-rules-sidecar.js`
  - `packages/editme-cli/src/init-docs-site.js`

## 一句话判断法

如果一个标题不是帮助读者导航到另一个页面 section / 对象 / 方法，而只是解释某个方法的内部细节，那么它大概率不该继续作为高权重 Markdown 标题存在。
