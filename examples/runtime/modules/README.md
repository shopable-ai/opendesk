# JavaScript module examples

Run commands from the repository root.

## Basic relative import example

The public example entry is:

```text
examples/runtime/modules/basic/main.mjs
```

It exercises a nested relative module graph:

```text
main.mjs
→ import "./lib/math.mjs"
→ math.mjs imports "../constants.mjs"
→ main() calls the imported function
```

After building the current source, run:

```bash
./dist/opendesk -script examples/runtime/modules/basic/main.mjs -console-mode script
```

Expected console marker:

```text
ESM_RELATIVE_IMPORT_OK 42
```

The executable ESM entry currently uses the `.mjs` extension. Plain `.js` entries continue through the established plain-script loader.

The repository also keeps a deterministic regression fixture at `tests/javascript-modules/basic/main.mjs`.

## LangGraph compatibility probe

Prepare the pinned npm dependencies once:

```bash
cd examples/runtime/modules/langgraph && npm install && cd ../../../..
```

Then run the actual OpenDesk module entry from the repository root:

```bash
./dist/opendesk -script examples/runtime/modules/langgraph/main.mjs -console-mode script
```

Expected console marker:

```text
LANGGRAPH_DEMO_OK
```

The LangGraph example is deliberately small. It validates the exercised `StateGraph` path; it does not claim complete Node.js or complete LangGraph/LangChain compatibility.
