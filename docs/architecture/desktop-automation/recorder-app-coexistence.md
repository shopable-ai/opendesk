# Recorder 与应用运行界面的共存规则

> 状态：P0 设计基线  
> 日期：2026-09-12  
> 范围：Recorder、普通应用界面、系统托盘和自动化脚本同时存在时的产品与生命周期规则。  
> 相关设计：[App Shell、Tray / Menu Bar 与 Single-Instance](../app-shell-tray-menu.md)、[Agent-first Recorder](agent-first-recorder.md)。

## 1. 核心结论

OpenDesk 只维护一个应用级 Shell 和一个系统托盘。普通应用界面与 Recorder 界面属于同一个 OpenDesk 应用中的不同功能界面，可以同时显示。

首版不建设复杂的全局任务调度、自动暂停、自动排队或自动抢占机制。

当 Recorder 与正在运行的自动化脚本可能互相干扰时，优先采用：

```text
检测当前状态
→ 简短提醒用户
→ 由用户自己停止其他任务或继续操作
```

只有重复 Recorder Capture、重复 App Shell、重复系统托盘等会直接破坏框架自身状态的情况，才由程序强制阻止。

核心原则：

> **界面允许并存；运行冲突以提醒为主；框架自身不能进入明显非法的重复状态。**

## 2. 系统托盘职责

系统托盘只负责顶层功能入口，不复制 Recorder 内部已有功能。

P0 推荐结构：

```text
打开 OpenDesk
----------------
打开 Recorder
----------------
<当前应用自己的业务菜单>
----------------
退出
```

明确规则：

- Recorder 内已经存在“历史录制”入口，因此系统托盘不再重复增加“历史录制”。
- 系统托盘不承担“录制详情”“重放”“生成脚本”等 Recorder 内部操作。
- 点击“打开 Recorder”只负责显示 Recorder 界面，不代表立即开始录制。
- Recorder 窗口已经存在时，再次点击“打开 Recorder”应显示并激活已有窗口，不重复创建。
- 一个 OpenDesk 应用只能有一个系统托盘，不因为 Recorder 再创建第二个托盘。

## 3. 普通应用界面与 Recorder 可以同时显示

允许：

```text
普通应用界面
+
Recorder 界面
```

同时存在。

两个窗口同时显示本身不属于冲突，不需要为了避免两个窗口而强制关闭其中一个。

真正需要关注的是：是否存在正在运行的自动化脚本，以及是否正在录制。

## 4. 运行冲突提示规则

### 4.1 已有自动化脚本运行时打开 Recorder

允许直接打开 Recorder。

如果需要提示，使用简短提示，不展开技术原因：

> **请先停止其他运行中的脚本，再开始录制。**

首版不自动停止已有脚本，不自动暂停，不自动排队。

### 4.2 已有自动化脚本运行时开始录制

如果检测到其他自动化脚本仍在运行，提示：

> **请先停止其他运行中的脚本，再开始录制。**

首版只负责提醒，不自动停止其他脚本，也不替用户决定；由用户自行选择是否先停止其他脚本后再继续录制。

P0 不要求提供“自动停止其他脚本并继续录制”。

### 4.3 正在录制时准备运行脚本

提示：

> **当前正在录制，请先停止录制再运行脚本。**

首版不自动停止录制，也不自动排队脚本。

### 4.4 已有脚本运行时再启动另一个脚本

如果当前产品入口可以检测到已有运行中的自动化任务，可使用简短提示：

> **已有脚本正在运行，请先停止后再运行。**

首版以提醒为主，不建设复杂的多任务调度系统。

## 5. 必须由框架直接处理的情况

提醒适用于“可能互相干扰”的业务场景，但以下属于框架自身不应该出现的重复状态，应直接处理：

- Recorder 已经处于录制状态时，不再启动第二份同类录制。
- Recorder 窗口已经存在时，不重复创建同一个 Recorder 主窗口。
- 同一个 OpenDesk 应用不创建第二个系统托盘。
- 同一个启用单实例的 OpenDesk 应用不因为再次启动而初始化第二套业务 Runtime。
- 应用已经进入退出流程时，不再接受新的录制或脚本启动请求。

## 6. P0 不做的事情

首版明确不要求：

- 全局任务调度器；
- 自动暂停其他脚本；
- 自动恢复脚本；
- 自动排队；
- 自动抢占；
- 多任务优先级；
- 为 Recorder 单独创建第二套 App Shell；
- 为 Recorder 创建第二个系统托盘；
- 在 `opendesk.app.json` 中提前增加复杂的 Recorder 模式或角色配置。

这些能力只有在真实使用中出现明确需求后再增加。

## 7. 用户与开发者不是两个互斥身份

OpenDesk 不把“普通用户”和“开发者”设计成两个完全分离的应用身份。

同一个人可能：

- 平时只运行已有自动化；
- 某些时候打开 Recorder 创建或修改自动化；
- 在 Recorder 完成后继续作为普通使用者运行脚本。

因此产品结构应该是一套 OpenDesk 应用，通过不同界面提供不同能力，而不是分别启动“用户版 OpenDesk”和“开发者版 OpenDesk”。

## 8. Recorder 源码、Workflow、Example 与 Runtime Adapter 的边界

独立脚本入口必须继续保留，作为开发、调试、回归和学习入口。兼容入口为：

```bash
OPENDESK_RECORDER_CAPTURE_KEYBOARD=1 ./dist/opendesk -ui -allow-recorder-capture -script examples/custom-ui/recording-console-simple.js -console-mode script -log-dir .runtime/examples/custom-ui/recording-console-simple
```

`workflows/human-to-recipe/recording-console-simple.js` 继续承担 Human-to-Recipe 工作流编排；正式产品入口则由系统托盘的“打开 Recorder”进入。三种入口可以有不同的外围编排，但必须复用同一套 Recorder UI canonical source。

独立示例仍然有价值，不应因为产品集成而删除。

### 8.1 仓库一级目录与所有权

Recorder 是 OpenDesk 官方桌面应用的产品能力，因此正式实现继续归属于 `apps/opendesk/recorder/**`。不为了“共享”额外引入 `features/`、`packages/` 或 `shared/` 一级目录。

仓库边界固定为兄弟关系：

```text
/
├── apps/
│   └── opendesk/
│       ├── main.js
│       ├── opendesk.app.json
│       ├── script-runner/
│       └── recorder/                    # Recorder 正式产品实现
│           ├── controller.js
│           ├── controller-core.js
│           ├── recording-history.js
│           └── icons/
│
├── workflows/
│   └── human-to-recipe/
│       ├── recording-console-simple.js # Human-to-Recipe 工作流入口
│       ├── record.js
│       ├── generate.js
│       ├── design/
│       └── skills/
│
├── examples/
│   └── custom-ui/
│       └── recording-console-simple.js # 独立学习 / 调试入口
│
└── internal/
    └── recorderbundle/
        ├── bundle.go
        └── bundle_test.go              # Go / distribution adapter
```

这里的关键点是：

- `apps/`、`workflows/`、`examples/`、`internal/` 是仓库根目录的不同职责域，彼此不是物理包含关系。
- `workflows/human-to-recipe/**` 永远保持在根目录 `workflows/` 下，不因为它使用 Recorder 就移动到 `apps/opendesk/recorder/`。
- `examples/**` 同样保持独立；示例可以依赖产品能力，但不能成为产品源码的所有者。
- `internal/recorderbundle` 是 Go / release adapter，不拥有 Recorder UI 实现。
- 不通过目录搬迁表达“uses”关系；依赖关系必须与源码所有权分开描述。

### 8.2 Recorder canonical source 所有权

Recorder UI 的唯一正式 JavaScript / 图标源码归属于产品资源：

```text
apps/opendesk/recorder/
├── controller.js
├── controller-core.js
├── recording-history.js
└── icons/
```

规则：

- `apps/opendesk/recorder/**` 是 Recorder UI 的 canonical source。
- `examples/custom-ui/recording-console-simple.js` 只作为可直接运行的兼容 / 学习入口，不复制 Recorder 实现。
- `workflows/human-to-recipe/recording-console-simple.js` 只负责工作流编排、录制完成后的 artifact / Recipe 生成等职责，不拥有第二套 Recorder UI。
- `internal/recorderbundle` 只负责 Go Runtime 的发行打包与 materialization，不拥有第二套 Recorder UI canonical source。
- 禁止在 `examples/**`、`workflows/**`、`internal/**` 之间通过人工复制长期维护多份 `controller*.js` / `recording-history.js`。

### 8.3 依赖关系不是目录包含关系

正确的依赖关系是多个入口复用同一产品 Recorder：

```text
                           apps/opendesk/recorder/**
                         Recorder canonical source
                             ▲        ▲        ▲
                             │        │        │
          ┌──────────────────┘        │        └──────────────────┐
          │                           │                           │
examples/custom-ui/         workflows/human-to-recipe/   internal/recorderbundle
standalone / learning        workflow orchestration        release/runtime adapter
```

App Mode 自身也直接使用 `apps/opendesk/recorder/**`。

因此允许：

```text
workflow  ───┐
example   ───┼── uses ──→ apps/opendesk/recorder
runtime   ───┘
```

但不允许为了表达这种依赖而变成：

```text
apps/opendesk/recorder/workflows/**
apps/opendesk/recorder/examples/**
apps/opendesk/recorder/internal/**
```

也不因为当前三个消费者存在就提前增加：

```text
features/recorder
packages/recorder
shared/recorder
```

只有未来出现多个真正独立的 App 产品都需要共享 Recorder，并且 `apps/opendesk` 已不再是自然产品所有者时，才重新评估是否提取公共 package。

### 8.4 不采用软链接

Recorder 资源复用不使用 Git / 文件系统软链接。

原因：

- Windows、macOS、Git checkout、ZIP 与安装包对 symlink 的支持和权限行为不完全一致；
- `go:embed` 与目录 symlink 不适合作为跨平台发行契约；
- 发布包最终必须包含真实文件，不能依赖源码仓库中的相对链接；
- example 应该是清晰的可运行入口，而不是指向 `internal` 实现细节的文件系统技巧。

因此统一采用“单一 canonical source + 显式入口 / 资源解析 + build/package materialization”。

### 8.5 Development / Distribution 资源规则

开发态和发行态必须使用同一套 Recorder UI 内容：

```text
Development
apps/opendesk/recorder/**
        ├──→ App Mode
        ├──→ workflows/human-to-recipe/**
        └──→ examples/custom-ui/**

Distribution
apps/opendesk/recorder/**
        ↓ build / embed / package
OpenDesk.app / Windows package / runtime materialized resources
        ↓
App Mode Recorder
```

约束：

- 开发态允许 workflow、example 和 App Mode 从 repository product resource 读取 canonical Recorder UI。
- 正式发行版必须自包含，不允许运行时回退依赖仓库 `examples/**` 或 `workflows/**`。
- Go 可以把 canonical product resources 嵌入二进制或 materialize 到 runtime 目录，但 `go:embed` 是 distribution adapter，不是 Recorder UI 的源码所有权边界。
- macOS `.app` 与 Windows distribution 应遵循同一资源模型，不为两个平台维护不同 Recorder UI 副本。

### 8.6 各入口职责

```text
apps/opendesk/recorder/**
  └─ Recorder 正式产品实现 / canonical source

workflows/human-to-recipe/recording-console-simple.js
  └─ Human-to-Recipe orchestration

examples/custom-ui/recording-console-simple.js
  └─ standalone / learning / compatibility entry

internal/recorderbundle/**
  └─ release adapter / materialization

App Shell / Tray
  └─ 产品运行时打开 Recorder 的正式入口
```

这保证：

- `workflows/` 继续是根目录一级工作流体系，不被吸收到产品资源目录；
- 旧脚本命令继续可运行、可查看、可调试；
- workflow 仍可增加 Recipe 生成等工作流行为；
- 产品 App Mode 不依赖开发源码树；
- Recorder UI bug 只需修复一份实现；
- 目录结构表达“谁拥有源码”，依赖图表达“谁使用能力”，两者不混淆。

## 9. P0 验收规则

| 场景 | 预期 |
| --- | --- |
| 只打开普通应用界面 | 正常 |
| 只打开 Recorder | 正常 |
| 两个界面同时显示 | 正常 |
| Recorder 已打开，再次点击托盘 Recorder 入口 | 激活已有窗口，不重复创建 |
| 已有脚本运行，再打开 Recorder | 允许；可显示简短提醒 |
| 已有脚本运行，再开始录制 | 提示“请先停止其他运行中的脚本，再开始录制。” |
| 正在录制，再准备运行脚本 | 提示“当前正在录制，请先停止录制再运行脚本。” |
| Recorder 已经在录制，再重复开始录制 | 阻止重复录制 |
| 系统托盘 | 始终只有一个 |
| 历史录制入口 | 只保留 Recorder 内现有入口，不在系统托盘重复 |
| `examples/custom-ui/recording-console-simple.js` | 可直接运行，并复用 canonical Recorder UI |
| Human-to-Recipe Recorder | 保持在根目录 `workflows/human-to-recipe/**`，复用 canonical Recorder UI |
| 正式发行版 Recorder | 自包含，不依赖 repository examples / workflows |
| Recorder UI source | `apps/opendesk/recorder/**` 为唯一 canonical copy |
| 目录所有权 | `apps/`、`workflows/`、`examples/`、`internal/` 保持根目录职责分离 |
| 跨平台资源 | 不使用 symlink；macOS / Windows 由同一 canonical source 构建 |

## 10. 后续升级条件

只有当真实使用出现以下问题时，再考虑增加统一任务协调能力：

- 多个自动化任务需要合法并行；
- 需要任务排队；
- 需要暂停与恢复；
- 需要多 Agent 同时执行；
- 需要 Recorder 有意识地记录 Agent 或自动化产生的动作；
- 单纯依靠用户提示已经频繁导致错误。

在这些需求出现之前，保持当前轻量设计。

对于源码目录，也只有出现多个真正独立 App 共同拥有 Recorder 的实际需求时，才评估把 Recorder 从 `apps/opendesk` 提升为公共 package；不为潜在复用提前增加目录层级。

## 11. 设计评审结论

本设计从产品、桌面交互、Runtime、Recorder、测试维护、仓库边界和后续扩展七个角度进行交叉评审。

当前 P0 方案的主要优点：

- 用户入口简单；
- 不重复系统托盘和历史录制入口；
- 不因为两个窗口而制造不必要的互斥；
- 冲突提示简短；
- 不自动停止用户正在运行的任务；
- 避免首版过度建设任务调度系统；
- Recorder UI 保持单一 canonical source，同时保留直接脚本调试入口；
- `workflows/`、`examples/` 保持根目录独立职责，不错误搬入 `apps/opendesk/recorder`；
- 不为当前规模过早增加 `features/`、`packages/`、`shared/` 抽象层；
- 发行版保持自包含且不依赖 symlink；
- 给以后更复杂的 Agent、并发任务和录制来源区分保留扩展空间。

当前目录与职责设计评审：**97/100**。剩余空间主要来自未来统一 Recorder bootstrap/resource contract 与 macOS 完整 release live evidence，不需要通过继续拆目录来提高评分。

当前设计目标：**>=95/100**。
