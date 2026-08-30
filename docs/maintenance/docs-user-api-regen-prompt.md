---
title: docs-user-api regen prompt
description: 给 Codex / Hermes / 其他 Agent 的 Clawdesk 用户 API 文档、Agent 索引与编辑器类型声明一致性检查清单。
order: 20
---

# docs-user-api regen prompt

## 用途

用于 Clawdesk 版本升级后更新或重建：

- `docs-user-api/` 可渲染用户文档
- `docs-user-api/runtime-api.ai.json` Agent 索引
- `types/*.d.ts` 编辑器类型声明

完整 TOC/写作规则见：

- `docs/maintenance/docs-user-api-editme-toc-maintenance.md`
- `docs/maintenance/repository-documentation-map.md`

## 可直接复用的 prompt

你正在维护 Clawdesk 的用户 API 表达层。

目标：

基于当前源码和运行时行为，让以下三种消费形式保持同一 API 事实：

```text
docs-user-api/*.md
docs-user-api/runtime-api.ai.json
types/*.d.ts
```

必须遵守：

1. **源码优先**
   - 先从 `automation/`、`polyfills/`、`main.go`、`pkg/http/` 等当前实现确认事实。
   - 文档或类型与源码冲突时修派生资料，不复制历史错误。

2. **只维护一个用户 API 文档根**
   - 不创建 `docs-api/`
   - 不创建 `docs-api-user/`
   - 不创建 `docs/api/`
   - 不恢复 `dev/api.md`
   - 不恢复仓库根旧 `types.md`
   - 历史内容只通过 Git 历史查阅。

3. **区分 API 来源/状态**
   - Native
   - Polyfill
   - Compatibility facade
   - Stable / Secondary / Experimental / Conditional

4. **同时维护机器可读索引**
   - 新增/删除/改名全局对象或主要方法时更新 `docs-user-api/runtime-api.ai.json`。
   - JSON 是 Agent 索引，不高于当前源码。

5. **同步维护 `types/*.d.ts`**
   - 类型只表达方法、参数、返回值和关键结构。
   - 不把教程、历史说明、大段示例复制到 `.d.ts`。
   - Native 方法不要无依据统一声明成 Promise；先检查最终用户 Runtime 是否被 polyfill 包装。
   - Conditional API 需要在类型中体现可缺失。
   - 修改后运行 TypeScript 声明检查。

6. **Markdown 用于直接渲染**
   - 页面级 / 对象级 / 方法级可以做 heading。
   - 参数 / 返回值 / 行为规则 / 错误 / 示例通常使用粗体标签、表格和紧凑列表。
   - 类型系统的用户说明写入 `docs-user-api/types.md`。

7. **示例必须贴近真实运行时**
   - 不推断不存在的 DOM / Playwright 能力。
   - upgraded / playwright 只按兼容 facade 解释。
   - 高风险系统动作应明确副作用。

8. **禁止环境污染**
   - 不写 `/Users/...`、`C:\Users\...` 等开发者本机绝对路径。
   - 不把旧 TestMonkey 名称重新写成当前产品名或默认存储路径。

## 推荐更新顺序

1. 确认源码 / Runtime API 面
2. `docs-user-api/index.md`
3. 对应专题 Markdown
4. `docs-user-api/runtime-api.ai.json`
5. 对应 `types/*.d.ts`
6. `docs-user-api/types.md`（若类型使用方式发生变化）
7. 示例 / cookbook
8. TypeScript 声明检查与链接检查

## 内容检查

- [ ] 当前所有主要全局对象在 `index.md` 有归属
- [ ] `runtime-api.ai.json` 与当前对象地图一致
- [ ] 对应 `types/*.d.ts` 存在且没有明显复制错误
- [ ] native / polyfill / compatibility 没混写
- [ ] 默认值与源码一致
- [ ] 同步 / Promise 返回语义与最终 Runtime 一致
- [ ] lowerCamelCase / 返回结构与用户侧实际值一致
- [ ] 页面没有本机绝对路径
- [ ] 没有重新引入退役 API 文档目录/草稿
- [ ] 旧 DOM 风格 API 没有误写为稳定桌面 API
- [ ] 重要示例能从当前运行时语义解释

## TypeScript 检查

至少保证声明文件本身可以通过：

```bash
tsc --noEmit --project jsconfig.json
```

如果完整仓库因为某些历史 JavaScript 文件不适合 TypeScript 项目解析，应至少对 `types/**/*.d.ts` 做独立声明检查，并记录未验证范围，不能声称“全部通过”。

## TOC 检查

- [ ] TOC 主要展示页面 / 对象 / 方法
- [ ] 参数、返回值、错误、示例没有大量挤进 TOC
- [ ] cookbook 仍按场景分组，而不是每个例子一个 heading

## 一句话判断法

**API 事实看源码，用户解释看可渲染 Markdown，Agent 路由看 JSON，编辑器签名看 `.d.ts`；四者冲突时回到当前 Runtime 校准。**
