# JavaScript Modules

## Goal

OpenDesk supports file-backed ECMAScript module entrypoints without turning the Goja Runtime into a Node.js process and without implementing JavaScript module parsing in OpenDesk itself.

The first supported path is:

```text
.mjs entry
→ pkg/scriptloader.ModuleScriptLoader
→ esbuild resolves and bundles the static import graph
→ normal .js execution payload
→ existing Goja + EventLoop Execution
```

This is **compiled module support**, not native Goja ESM and not a general Node.js compatibility layer.

## Ownership

- `pkg/scriptloader/` owns file-backed module preparation and dependency resolution policy.
- esbuild owns JavaScript parsing, `import` / `export` syntax, package `exports` resolution, and bundling.
- `pkg/execution/` keeps ownership of the existing Goja Runtime, EventLoop, completion, timeout, cancellation, logs, and native resource teardown.
- `polyfills/` and `jslibs/` keep their existing automatic global bootstrap behavior. ESM application modules and npm dependencies must not be placed there.

No imported module creates another OpenDesk Execution or another Goja Runtime.

## Source and dependency layout

A module entry stays with the project that owns it:

```text
project/
├── main.mjs
├── lib/
│   └── helper.mjs
├── package.json          # optional, for third-party packages
└── node_modules/         # prepared dependency installation, not runtime output
```

Relative imports are resolved from the importing file. Package imports are resolved by esbuild using the package graph visible from the module entry.

OpenDesk does not copy imported source into `polyfills/` or `jslibs/`, and module execution does not install npm packages automatically.

Runtime logs, probes, screenshots, generated diagnostics, and other execution evidence belong under `.runtime/`. The current module bundling path is in-memory and does not create `.opendesk-module-bundle.js` on disk (`Write: false`).

## Entry contract

A `.mjs` file may execute side effects during module initialization. If it exports a named `main` function, OpenDesk invokes it once after the graph has been linked and waits for its returned Promise:

```js
import { runTask } from "./task.mjs";

export async function main() {
  await runTask();
}
```

Imported modules are never auto-invoked just because they also export a function named `main`.

The bundle is emitted as an IIFE and then passed through the existing JavaScript Execution path. The exported entry namespace is private implementation detail and is not a new public Runtime global.

## Resolution profile

The initial module loader uses esbuild's browser platform profile. This intentionally favors browser/Web-compatible package exports over Node-only exports. It is appropriate for OpenDesk's embedded JavaScript Runtime and allows packages that publish a standards-based browser entry to avoid Node built-ins.

This profile does **not** make OpenDesk a browser and does not synthesize missing Web APIs. A package is supported only when both of these are true:

1. its module graph can be resolved and bundled for the OpenDesk profile; and
2. the resulting JavaScript only depends on Runtime capabilities that OpenDesk actually provides.

## Current support boundary

P0 targets:

- `.mjs` file-backed entrypoints;
- static relative `import` / `export`;
- npm package imports resolvable from the entry project;
- package `exports` handled by esbuild;
- async exported `main()` using the existing OpenDesk EventLoop;
- failure propagation from module build and from exported `main()`;
- execution cancellation can cancel an in-progress esbuild rebuild through the esbuild Context API.

Not promised by P0:

- native Goja ESM semantics;
- arbitrary runtime `import()` targets;
- module-level top-level await across an ESM graph;
- Node built-in modules such as `node:fs` or `node:async_hooks`;
- native `.node` addons;
- automatic npm installation;
- remote URL module imports;
- full source-map rewriting of Goja stack traces.

Existing `.js` scripts keep their current behavior, including the established OpenDesk top-level-await wrapper. P0 does not reinterpret every `.js` file as a module.

## LangGraph compatibility probe

`examples/runtime/modules/langgraph/main.mjs` intentionally imports from the package root:

```js
import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
```

The example is a compatibility probe, not proof that the complete LangGraph / LangChain ecosystem is supported. The pinned package version must be installed in that example project before execution. Passing the example proves only the exercised StateGraph path: package resolution, graph construction, async node execution, state propagation, and result validation.

If a future LangGraph feature requires Node-specific APIs, OpenDesk should either provide a real, generally useful Runtime capability or run that workload through a separate controlled Node/Agent process. Do not grow one-off fake Node polyfills just to make an import succeed.

## Test locations

- internal bundler behavior: `pkg/scriptloader/module_test.go`
- direct executable module fixture: `tests/javascript-modules/basic/main.mjs`
- public third-party compatibility probe: `examples/runtime/modules/langgraph/main.mjs`

The final acceptance must use the built OpenDesk executable to run the `.mjs` entrypoints. A successful esbuild-only test or a successful Node.js run does not prove OpenDesk module execution.
