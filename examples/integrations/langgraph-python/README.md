# OpenDesk + Python / LangGraph

This example is the first implementation scaffold for
`docs/architecture/external-workflow-runtime-integration.md`.

It intentionally proves two directions without adding a second workflow engine
inside OpenDesk:

```text
A. OpenDesk JavaScript
   -> Command.run(Python decision worker)
   -> strict JSON result
   -> JavaScript continues

B. Python / LangGraph
   -> opendesk ai run parameterized Recipe
   -> strict result file
   -> next graph node
```

The files are committed as an implementation baseline. They have **not** been
claimed as macOS live-qualified by the web-only implementation session. Run the
local acceptance below before treating the example as production-qualified.

## Why the Recipe result is a file

`opendesk ai run` owns stdout and returns one machine-readable CLI JSON
envelope. Recipe `console.log()` output belongs to its run artifacts. The bridge
therefore does not scrape console text for business data.

For direction B, Python creates a request-scoped path under:

```text
.runtime/external-workflow-results/
```

and passes that path through `Execution.input.meta.resultPath`. The Recipe writes
one strict JSON response with `File.writeJSON()`. This separates:

```text
CLI status        -> opendesk ai run stdout envelope
business result   -> request-scoped bridge JSON
diagnostics       -> stderr / OpenDesk artifacts
```

## Protocol

Request:

```json
{
  "schemaVersion": 1,
  "requestId": "uuid-or-correlation-id",
  "data": {},
  "meta": {}
}
```

Response:

```json
{
  "schemaVersion": 1,
  "requestId": "same-id",
  "ok": true,
  "data": {},
  "error": null
}
```

The validators intentionally reject implicit type conversion, unknown response
fields, mismatched request IDs, and out-of-range decision values.

## Python environment

The example pins LangGraph 1.2.11, the current release used when this scaffold
was written:

```bash
cd examples/integrations/langgraph-python
uv sync
```

The OpenDesk JavaScript -> Python example needs an explicit interpreter path
because GUI/runtime PATH inheritance must not be treated as a product contract:

```bash
export OPENDESK_LANGGRAPH_PYTHON="$PWD/.venv/bin/python"
```

## Direction A: OpenDesk owns the execution

Run from the repository root:

```bash
OPENDESK_LANGGRAPH_PYTHON="$PWD/examples/integrations/langgraph-python/.venv/bin/python" \
  ./dist/opendesk -script examples/integrations/langgraph-python/main.js -console-mode script
```

`main.js` sends one JSON request to `decision.py` with `Command.run()`.
`decision.py` runs a real LangGraph node and emits exactly one JSON response.

By default the decision node uses a credential-free local bounded selector so
the bridge itself can be tested independently from a model provider.

To delegate the decision node to a real model wrapper, set a JSON argv array:

```bash
export OPENDESK_LANGGRAPH_DECISION_COMMAND_JSON='["/absolute/path/to/model-wrapper"]'
```

The wrapper receives this JSON on stdin:

```json
{
  "schemaVersion": 1,
  "task": "choose_integer",
  "minimum": 5,
  "maximum": 15,
  "instruction": "Return JSON only: {\"value\": <integer>}."
}
```

and must write only:

```json
{"value": 12}
```

to stdout. This keeps LangGraph independent from any one model vendor; the
wrapper may use an SDK, HTTP service, Codex/Claude adapter, or another controlled
backend. Provider-specific authentication remains outside this example.

## Direction B: Python / LangGraph owns the workflow

Run from the repository root after building OpenDesk and granting the existing
Calculator permissions:

```bash
examples/integrations/langgraph-python/.venv/bin/python \
  examples/integrations/langgraph-python/main.py \
  --opendesk ./dist/opendesk
```

The graph is deliberately serial:

```text
calculator-base.js
-> decision
-> calculator-add.js
-> independent Python validation
```

`calculator-base.js` reuses the maintained Calculator semantic recipe's
qualified 232x321 window guard, button points for `25 x 4 =`, and Accessibility
display read. The result is the actual display value.

Before `calculator-add.js` mutates the desktop it reads the display again and
requires it to still equal the first Recipe's actual result. It then enters the
dynamic increment and reads the final display. Python calculates an expected
value only as an independent validator; that value is never substituted for the
UI result.

The extra digit points needed for arbitrary `5..15` input are explicitly marked
as candidates in `calculator-add.js`. They must be live-qualified on the target
macOS Calculator build during local acceptance.

## Decision backend

The default `local-fallback` is intentionally **not** presented as an LLM. It
only keeps protocol, LangGraph, cancellation, and desktop integration testable
without credentials.

A real model belongs behind the decision node. This is intentionally separate
from OpenDesk's in-progress `LLM.generate()` / `Agent.run()` work: Python may use
its own SDK or service, or may invoke a controlled wrapper through
`OPENDESK_LANGGRAPH_DECISION_COMMAND_JSON`.

## Cancellation and ownership

Direction A:

```text
OpenDesk Execution
-> Command.run
-> Python worker
```

The existing execution-owned Command lifecycle owns the child process.

Direction B:

```text
Python workflow
-> opendesk ai run
-> OpenDesk Execution
```

`opendesk_bridge.py` starts each CLI run in its own process group. Timeout or
KeyboardInterrupt terminates that process group so the CLI/Runtime can execute
its normal cancellation/teardown path.

This P0 bridge is synchronous by design. It does not claim to provide a detached
HTTP execution handle or durable LangGraph recovery. Those require a separate
HTTP backend with persisted `executionId` ownership and must not be faked by
closing only the Python client.

## Tests

Protocol-only tests do not need a desktop:

```bash
cd examples/integrations/langgraph-python
.venv/bin/python -m unittest discover -s tests -v
```

Local acceptance should additionally prove:

```text
[ ] Python environment installs from pyproject.toml
[ ] main.js -> decision.py succeeds
[ ] wrong schema / requestId / type is rejected
[ ] Python worker timeout/cancel leaves no child process
[ ] calculator-base reads actual 100 from Calculator
[ ] Calculator state change between stages stops before new input
[ ] each candidate digit point used by 5..15 is live-qualified
[ ] calculator-add reads the real final display
[ ] Python independent validation agrees with final display
[ ] Ctrl+C / timeout cleans up the active OpenDesk CLI execution
[ ] no second workflow/runtime layer was added inside OpenDesk
```

Do not convert this checklist into a PASS report until those items have actually
been run on the local target machine.
