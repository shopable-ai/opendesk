# Icon & Product Asset Ownership

## 决策

OpenDesk 不允许每个产品界面各自维护一套通用按钮图标。图标与图片资源按 ownership 分层，而不是按“哪个页面正在使用”分目录。

```text
OpenDesk Runtime
├── pkg/customui/assets/toolbar-icons-v1.json
│   └── shared semantic UI icons (160 in v1)
├── internal/<feature>/assets/
│   └── compiled feature-internal binary resources
└── App Shell product identity contract
    └── file-backed brand / tray assets while required by the public contract

apps/opendesk/
├── JavaScript product source
├── opendesk.app.json
└── assets/
    └── only file-backed product/package resources that cannot use a runtime icon ID
```

## Rules

### 1. Generic UI icons are Runtime-owned

Buttons such as play, pause, stop, folder, info, settings, history, refresh, delete, edit, timer and AI actions must first use the central Custom UI catalog. A feature must not copy a PNG/SVG into its own directory merely to obtain a common toolbar icon.

The catalog is the single registry for semantic `FloatingWindow` icon IDs. Platform-specific SF Symbol / Segoe Fluent mapping stays behind Runtime and must not leak into product JavaScript.

### 2. Product identity assets are not semantic icons

OpenDesk logo, app icon and tray icon are identity resources. They must not be forced into the semantic glyph catalog merely because they are also images. While the public App Shell contract requires tray file paths, the official package may keep the required ICO/template PNG as file-backed product assets.

A later embedded product-default asset API may remove those files from the App package, but that change must update App Shell implementation, validation, tests and public docs together. Do not silently invent a manifest value such as `builtin:opendesk` before that contract exists.

### 3. Go/native implementation never lives in `apps/opendesk/**`

`apps/opendesk/` is the official JavaScript App/package source tree. Go embed adapters, Swift render helpers and build generators belong under `internal/`, `pkg/` or `tools/` according to ownership.

If Go `//go:embed` cannot reference a parent directory, the solution is a generated mirror/staging directory beside the Go package, guarded by parity tests. Do not move Go source into the App directory to satisfy an embed path restriction.

For the built-in Recorder:

```text
canonical JS source
apps/opendesk/recorder/*.js
        |
        | go generate ./internal/recorderbundle
        v
generated embedded mirror
internal/recorderbundle/assets/*.js
        |
        +-- feature-internal binary assets
        v
compiled OpenDesk -> materialized Recorder secondary execution
```

### 4. Distribution payload is explicit

`apps/opendesk/.release/app-mode-runtime-files.txt` lists the AppMode package files only. Internal compiled assets must not be copied into `Resources/AppMode` merely because the source feature uses them. Conversely, an App package file must not be assumed to exist because it happened to be reachable from the source repository.

## Guardrails

`go test ./internal/recorderbundle` enforces:

- embedded Recorder JavaScript mirrors match canonical `apps/opendesk/recorder/*.js`;
- the official `apps/opendesk/**` tree contains no `.go` implementation source;
- Recorder no longer owns a private `apps/opendesk/recorder/icons/` directory;
- the compiled Recorder payload is self-contained and does not depend on source workflow paths.

For normal UI work, review [Custom UI Icons](../api/ui-icons.md) before adding image assets. If the central catalog already contains the required semantic icon, adding a new per-feature PNG/SVG is an architecture regression.
