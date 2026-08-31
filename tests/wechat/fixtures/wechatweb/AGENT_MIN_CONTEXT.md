# WeChatWeb 最小 Agent 上下文

适用场景：这是一个 **开发阶段用的 HTML 黄金样本**，服务于应用脚本开发，而不是运行时资源。

## 入口文件

优先读取：

- `tests/wechat/fixtures/wechatweb/index.html`

如果只是做脚本开发参考，这一个文件通常就够了。

---

## 调试与分析原则

默认采用 **DOM-first**：

1. 先看 DOM 结构 / 页面快照 / runtime HTML
2. 再看最少量的来源代码
3. 截图只用于：
   - 纯视觉问题确认
   - 最终视觉验收

原因：

- token 更省
- 结构信息更稳定
- 比截图更适合做定位、选择器设计、区域分析和流程调试

---

## 推荐读取顺序

### 第一层：默认只读这些

1. `tests/wechat/fixtures/wechatweb/index.html`
2. 页面 DOM / accessibility snapshot
3. 需要时再看 runtime HTML 或结构化快照文件

用途：
- 快速理解目标 UI 的整体布局
- 用于开发阶段的脚本定位、结构分析、交互流程设计
- 保持上下文干净，不把 Vue 工程整包读进来

---

### 第二层：只有在需要追溯来源时再读

3. `.runtime/cache/external/wechatweb/20260405/repo/package.json`
4. `.runtime/cache/external/wechatweb/20260405/repo/src/main.ts`
5. `.runtime/cache/external/wechatweb/20260405/repo/src/App.vue`
6. `.runtime/cache/external/wechatweb/20260405/repo/src/components/SideBar.vue`
7. `.runtime/cache/external/wechatweb/20260405/repo/src/components/FriendBar.vue`
8. `.runtime/cache/external/wechatweb/20260405/repo/src/components/ChatContent.vue`

这些文件足够追溯：
- 页面骨架
- 左侧图标来源
- 会话列表结构
- 聊天区域结构

---

### 第三层：需要细化局部时再读

9. `.runtime/cache/external/wechatweb/20260405/repo/src/components/ChatRecords.vue`
10. `.runtime/cache/external/wechatweb/20260405/repo/src/components/HistoryItemMe.vue`
11. `.runtime/cache/external/wechatweb/20260405/repo/src/components/HistoryItemOther.vue`
12. `.runtime/cache/external/wechatweb/20260405/repo/src/components/TimeComponent.vue`
13. `.runtime/cache/external/wechatweb/20260405/repo/src/datas/records.js`

---

## 这个目录的角色

`tests/wechat/fixtures/wechatweb/` 表示：

- 这是 **开发期样本目录**
- 用来辅助某个应用脚本开发
- 脚本开发完成后，它通常不再是运行时依赖
- 但它可以保留，作为未来其它应用脚本开发的流程参考

---

## 未来扩展方式

以后其它应用也建议按同样结构放置：

- `tests/<domain>/fixtures/chrome/`
- `tests/<domain>/fixtures/finder/`
- `tests/<domain>/fixtures/vscode/`
- `tests/<domain>/fixtures/<app-name>/`

每个目录建议包含：

- `index.html`
- `assets/`
- `README.md`
- `AGENT_MIN_CONTEXT.md`
- `manifest.json`

---

## 给 Agent 的一句话提示词

> 优先读取 `tests/wechat/fixtures/wechatweb/index.html` 作为开发阶段的 HTML 黄金样本；只有在需要追溯原始 Vue 结构时，再补读 `.runtime/cache/external/wechatweb/20260405/repo/src/App.vue`、`SideBar.vue`、`FriendBar.vue`、`ChatContent.vue`，不要全量读取整个项目。

补充原则：

> 调试时优先分析 DOM/结构化页面快照，不要默认依赖截图；截图只在视觉问题或最终验收时使用。
