---
title: docs-user-api regen prompt
description: 给 Codex / Hermes / 其他 Agent 的 Clawdesk 用户 API 文档重生成与一致性检查清单。
order: 20
---

# docs-user-api regen prompt

## 用途

用于 Clawdesk 版本升级后更新或重建 `docs-user-api/`。

完整 TOC/写作规则见：

- `docs/maintenance/docs-user-api-editme-toc-maintenance.md`
- `docs/maintenance/repository-documentation-map.md`

## 可直接复用的 prompt

你正在维护 Clawdesk 仓库的唯一用户 API 文档：

`docs-user-api/`

目标：

基于当前源码和运行时行为更新 `docs-user-api/`，让人类脚本作者与 AI Agent 都能可靠使用，同时保持 editme-cli 友好的 TOC。

必须遵守：

1. **源码优先**
   - 先从 `automation/`、`polyfills/`、`main.go`、`pkg/http/` 等当前实现确认事实。
   - 文档与源码冲突时修文档，不复制历史错误。

2. **只维护一个用户 API 文档根**
   - 不创建 `docs-api/`
   - 不创建 `docs-api-user/`
   - 不创建 `docs/api/`
   - 历史内容只通过 Git 历史查阅。

3. **区分 API 来源/状态**
   - Native
   - Polyfill
   - Compatibility facade
   - Stable / Secondary / Experimental / Conditional

4. **同时维护机器可读索引**
   - 新增/删除/改名全局对象或主要方法时更新 `docs-user-api/runtime-api.ai.json`。
   - JSON 是 Agent 索引，不高于当前源码。

5. **TOC 克制**
   - 页面级 / 对象级 / 方法级可以做 heading。
   - 参数 / 返回值 / 行为规则 / 错误 / 示例通常使用粗体标签、表格和紧凑列表。

6. **示例必须贴近真实运行时**
   - 不推断不存在的 DOM / Playwright 能力。
   - upgraded / playwright 只按兼容 facade 解释。
   - 高风险系统动作应明确副作用。

7. **禁止环境污染**
   - 不写 `/Users/...`、`C:\Users\...` 等开发者本机绝对路径。
   - 不把旧 TestMonkey 名称重新写成当前产品名或默认存储路径。

## 推荐页面生成顺序

1. `README.md`
2. `index.md`
3. `runtime-api.ai.json`
4. `page.md`
5. `input.md`
6. `window.md`
7. `screen.md`
8. `vision.md`
9. `image-color.md`
10. `system.md`
11. `file.md`
12. `storage.md`
13. `clipboard-console.md`
14. `http.md`
15. `http-server.md`
16. `runtime.md`
17. `polyfills.md`
18. `libs.md`
19. `runtime-utilities.md`
20. `cookbook.md`

## 内容检查

- [ ] 当前所有主要全局对象在 `index.md` 有归属
- [ ] `runtime-api.ai.json` 与当前对象地图一致
- [ ] native / polyfill / compatibility 没混写
- [ ] 默认值与源码一致
- [ ] 页面没有本机绝对路径
- [ ] 没有重新引入退役 API 文档目录
- [ ] 旧 DOM 风格 API 没有误写为稳定桌面 API
- [ ] 重要示例能从当前运行时语义解释

## TOC 检查

- [ ] TOC 主要展示页面 / 对象 / 方法
- [ ] 参数、返回值、错误、示例没有大量挤进 TOC
- [ ] cookbook 仍按场景分组，而不是每个例子一个 heading

## 一句话判断法

**API 事实看源码，用户解释看 `docs-user-api/`，Agent 索引看 `runtime-api.ai.json`；不要再维护平行旧文档树。**
