---
title: docs/api regen prompt
description: 给 Codex / Hermes / 其他 Agent 的 OpenDesk 用户 API 文档、Agent 索引与编辑器类型声明一致性检查清单。
order: 20
---

# docs/api regen prompt

## 用途

用于 OpenDesk 版本升级后同步维护：

- `docs/api/*.md`：直接渲染的正式用户文档
- `docs/api/runtime-api.ai.json`：Agent 机器索引
- `types/*.d.ts`：VS Code / TypeScript 类型声明

完整 TOC/写作规则见：

- `docs/maintenance/docs/api-editme-toc-maintenance.md`
- `docs/maintenance/repository-documentation-map.md`

## 可直接复用的 prompt

你正在维护 OpenDesk 的用户 API 表达层。

目标：基于当前源码和实际 Runtime 行为，让以下三种消费形式保持一致，但职责不混写：

```text
docs/api/*.md
docs/api/runtime-api.ai.json
types/*.d.ts
```

必须遵守：

1. **源码 / Runtime 优先**
   - 先从 `automation/`、`polyfills/`、`cmd/opendesk/main.go`、`pkg/http/` 等当前实现确认事实。
   - 不能为了迁就旧文档或旧 `.d.ts` 修改真实 API 定义。

2. **Markdown 是正式可渲染用户文档**
   - 用户用途、方法说明、参数、返回、错误、示例、平台行为写入对应 Markdown。
   - 不为内部维护概念额外创建用户文档页。
   - 不创建专门用于解释 `.d.ts` 维护机制的 `docs/api/types.md`；类型维护规则属于 `docs/maintenance/`。

3. **只维护一个用户 API 文档根**
   - 不创建 `docs-api/`
   - 不创建 `docs-api-user/`
   - 不创建 `docs/api/`
   - 不恢复 `dev/api.md`
   - 不恢复仓库根旧 `types.md`
   - 历史内容只通过 Git 历史查阅。

4. **区分 API 来源和状态**
   - Native / Polyfill / Compatibility facade
   - Stable / Secondary / Experimental / Conditional

5. **同步维护 Agent 索引**
   - 新增、删除、改名全局对象或主要方法时更新 `docs/api/runtime-api.ai.json`。
   - JSON 负责机器索引和路由，不复制 Markdown 的完整教程。
   - JSON 与 Markdown 冲突时回到源码校准，并同步修正两者。

6. **同步维护 `types/*.d.ts`**
   - 任何用户可见方法的参数、返回值、同步/异步语义变化，都必须检查对应 `.d.ts`。
   - `.d.ts` 只表达方法、参数、返回值、关键结构和必要的可选/兼容状态。
   - Native 方法不要无依据统一声明成 Promise；先检查最终用户对象是否被 polyfill 包装。
   - Conditional API 必须体现可能不存在，例如 `FloatingWindow | undefined`。
   - 不把教程、历史说明、大段示例复制到 `.d.ts`。

7. **示例必须贴近真实运行时**
   - 不推断不存在的 DOM / Playwright 能力。
   - upgraded / playwright 只按兼容 facade 解释。
   - 高风险系统动作应明确副作用。

8. **禁止环境污染**
   - 不写 `/Users/...`、`C:\Users\...` 等开发者本机绝对路径。
   - 不把旧 TestMonkey 名称重新写成当前产品名或默认存储路径。

## 推荐更新顺序

```text
源码 / Runtime API 面
→ 对应 docs/api Markdown
→ index.md（导航或对象归属变化时）
→ runtime-api.ai.json（机器路由变化时）
→ 对应 types/*.d.ts
→ 示例 / cookbook
→ TypeScript 声明检查 + 链接检查
```

## 内容检查

- [ ] 当前主要全局对象都有正式 Markdown 归属
- [ ] Markdown 只承担用户可读内容，没有内部维护专页混入
- [ ] `runtime-api.ai.json` 与当前对象地图一致
- [ ] 对应 `types/*.d.ts` 存在且签名与最终 Runtime 一致
- [ ] native / polyfill / compatibility 没混写
- [ ] 默认值与源码一致
- [ ] 同步 / Promise 返回语义与最终 Runtime 一致
- [ ] lowerCamelCase / 返回结构与用户侧实际值一致
- [ ] Conditional API 在类型中可缺失
- [ ] 页面没有本机绝对路径
- [ ] 没有重新引入退役 API 文档目录或草稿
- [ ] 重要示例能从当前运行时语义解释

## TypeScript 检查

优先执行：

```bash
tsc --noEmit --project jsconfig.json
```

如果完整仓库里的历史 JavaScript 不能作为 TypeScript 工程通过，也至少要对 `types/**/*.d.ts` 做独立声明检查，并明确记录未验证范围。

## TOC 检查

- [ ] TOC 主要展示用户页面 / 对象 / 方法
- [ ] 参数、返回值、错误、示例没有刷屏
- [ ] 不把编辑器类型维护机制做成单独用户文档页
- [ ] cookbook 仍按场景分组

## 一句话判断法

**源码定义事实；Markdown 负责用户说明；JSON 负责 Agent 索引；`.d.ts` 负责编辑器签名。API 一变，三种派生表达一起检查。**
