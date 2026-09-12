# JavaScript module examples

Run commands from the repository root.

## Basic module loader check

The repository-owned deterministic fixture is:

```text
tests/javascript-modules/basic/main.mjs
```

After building the current source, run:

```bash
./dist/opendesk -script tests/javascript-modules/basic/main.mjs -console-mode script
```

Expected console marker:

```text
ESM_IMPORT_OK 42
```

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
