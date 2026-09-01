# TASK-009 — macOS Menu / MenuBar Integration

Status: TODO
Priority: P1
Depends on: TASK-001 recommended
Mode: INTEGRATE_FIRST

## Goal

补齐 macOS 应用菜单、菜单项和系统菜单栏自动化能力，但默认优先复用 Accessibility / Peekaboo / 已有 third-party backend，不重复自研一套成熟 macOS Driver。

## 开始前决策

必须先输出 Build / Extend / Integrate / Skip 判断：

1. OpenDesk Accessibility API 是否已能稳定遍历和操作 AXMenuBar / AXMenu / AXMenuItem。
2. Peekaboo 当前是否已有稳定 menu/menu bar 能力及可复用接口。
3. 现有许可证、进程调用方式、CLI/MCP/库集成成本。
4. OpenDesk 是否只需要统一 facade，而非 native reimplementation。

若 Integration 已覆盖目标，禁止再写第二套 native menu driver。

## MVP 公共能力候选

```js
Menu.list({ app })
Menu.find(path, { app })
Menu.click(path, { app })
Menu.getEnabled(path, { app })
MenuBar.list()
MenuBar.click(item)
```

`path` 示例：`['File', 'Export', 'PDF…']`。

## 必须解决

- 菜单路径本地化与动态项。
- disabled / hidden / separator。
- submenu 展开与 timeout。
- app identity / pid。
- 系统菜单栏与 app menu bar 边界。
- integration backend 的版本与 capability。

## 非目标

- 不依赖 OCR 识别菜单文字作为默认实现。
- 不为了菜单自动化复制 Peekaboo 的整个 macOS 驱动层。
- 不把菜单业务流程硬编码进 core。

## 测试

至少覆盖：

1. 系统应用 File/Edit 等标准菜单读取。
2. 多级 submenu。
3. disabled item。
4. 菜单项不存在。
5. 本地化或动态菜单至少一例。
6. integration backend 不可用时的明确错误。

## Done

- 首先有明确 integration decision 和证据。
- 公共 API 与 backend 解耦。
- 若选择 Peekaboo/第三方，OpenDesk 只维护 adapter、capability 和 contract tests。
- 若必须自研，文档中必须证明现有 backend 无法满足目标。
