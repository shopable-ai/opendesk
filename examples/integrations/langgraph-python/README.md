# OpenDesk + Python / LangGraph

This example keeps one owner for each concern:

```text
Python LangGraph     owns graph state and node order
OpenDesk Recipes     own deterministic desktop actions and UI reads
OpenDesk Agent.run   owns the real model call and structured output
result-file bridge   connects each OpenDesk execution to Python
```

## Human request and success criteria

The example starts from this concrete human request, represented by the small
`WorkflowRequest` in `main.py`:

> Use macOS Calculator to calculate 25 × 4 and read 100; ask the model to
> choose a dynamic increment from 5 through 15 while Calculator remains at 100;
> continue with 100 + increment; read the final Calculator UI; and have Python
> independently verify the result.

The request maps directly to the graph:

| Requirement | StateGraph node | Owner | Success condition |
| --- | --- | --- | --- |
| Validate the supported request | `validate_human_request` | Python | Goal, `25 × 4`, expected `100`, bounds, and criteria have the exact supported types and values. |
| Establish the base | `establish_base_in_calculator` | OpenDesk Recipe A | Calculator UI is read as `100` after `25 × 4`. |
| Choose a dynamic increment | `choose_increment_with_agent` | `Agent.run()` | Native JSON output contains one integer in `5..15`. |
| Continue from the waited-on UI state | `continue_calculator_from_verified_state` | OpenDesk Recipe B | Its atomic pre-check reads `100`, then the final UI reads `100 + increment`. |
| Verify the human goal | `verify_human_goal` | Python | Independent arithmetic and both UI readbacks agree; `goalSatisfied` is true. |

The Python-owned path is intentionally linear and serial:

```text
validate_human_request
-> establish_base_in_calculator       -> calculator-base.js
-> choose_increment_with_agent        -> Agent.run({output: native JSON schema})
-> continue_calculator_from_verified_state -> calculator-add.js
-> verify_human_goal                  -> independent Python validation
```

There is no Python provider adapter, duplicated Codex JSONL parser, or second
workflow engine inside OpenDesk.

## Separate LangGraph JS Runtime example

OpenDesk can also load LangGraph JS directly. From the repository root, run:

```bash
./dist/opendesk -script examples/runtime/modules/langgraph/main.mjs -console-mode script
```

That example imports `@langchain/langgraph/StateGraph` inside the OpenDesk
JavaScript Runtime. It is not a Python bridge.

## Set up Python

From the repository root:

```bash
cd examples/integrations/langgraph-python && uv sync
```

The example pins its Python LangGraph dependencies in `pyproject.toml` and
`uv.lock`.

## Run the Python-owned real workflow

Before running, build the current OpenDesk binary, grant its existing macOS
Calculator permissions, and make an authenticated backend available to the
existing `Agent.run()` configuration. `Agent.run()` does not install or log in
to Codex or Claude Code for you; see `docs/api/agent.md` for profile selection.

From the repository root:

```bash
examples/integrations/langgraph-python/.venv/bin/python examples/integrations/langgraph-python/main.py --opendesk ./dist/opendesk
```

`main.py` owns the Python `StateGraph`. Its three OpenDesk calls use one
request-scoped result file each under `.runtime/external-workflow-results/`:

```text
opendesk ai run stdout  -> CLI execution envelope
strict result file      -> correlated business value
stderr / run artifacts  -> diagnostics and evidence
```

Recipe A receives the request's base expression and establishes and reads
Calculator `100`. The Agent Recipe receives the human goal, decision
instruction, verified base, and bounds before asking the existing `Agent.run()`
API for one native-schema integer in `5..15`. Recipe B re-reads the UI and
refuses to mutate unless it is still `100`, adds the model value, and returns
both that pre-continuation readback and the final UI display. Python
independently checks `finalResult == expectedBase + increment`.

The success record includes the human goal, success criteria,
`baseDisplayBeforeContinuation`, independent expected result, three OpenDesk
execution IDs, and `Agent.run()` metadata. A model's console prose is never
parsed as the business decision.

## OpenDesk-owned direction

`main.js -> decision.py` remains a small, credential-free example of OpenDesk
calling a Python LangGraph worker through `Command.run()`. Its local bounded
selector is a protocol fixture, not an LLM.

From the repository root:

```bash
OPENDESK_LANGGRAPH_PYTHON="$PWD/examples/integrations/langgraph-python/.venv/bin/python" ./dist/opendesk -script examples/integrations/langgraph-python/main.js -console-mode script
```

`emitOutput: false` keeps the worker's stdout as a machine-only protocol channel;
the JavaScript owner emits its own human-facing completion message.

## Bridge contract

Request:

```json
{
  "schemaVersion": 1,
  "requestId": "correlation-id",
  "data": {},
  "meta": {"resultPath": ".runtime/external-workflow-results/opaque.json"}
}
```

Response file:

```json
{
  "schemaVersion": 1,
  "requestId": "same-correlation-id",
  "ok": true,
  "data": {},
  "error": null
}
```

The bridge uses an opaque filename rather than `requestId` as a path. Validators
reject unknown fields, wrong schema types, request ID mismatches, invalid value
types, and values outside the declared bounds.

## Focused tests

The integration keeps only contract-level tests. Existing Runtime `Command` and
`Agent` suites remain responsible for their complete timeout, cancellation, and
backend lifecycle matrices.

From the integration directory:

```bash
.venv/bin/python -m unittest discover -s tests -v
```

Setting `OPENDESK_BIN` enables the small `main.js` Runtime contract test; without
it that test is skipped:

```bash
OPENDESK_BIN="$PWD/../../../dist/opendesk" .venv/bin/python -m unittest discover -s tests -v
```

The retained `qualify_calculator.py`, `observe-calculator.js`, and
`perturb-calculator.js` cover Calculator UI readback, the `5..15` candidate
points, screenshots, and state-drift rejection. They are qualification assets,
not another lifecycle framework. Run desktop mutation phases serially and keep
their evidence under `.runtime/tests/langgraph-python/`.

## What is borrowed from Langflow

Langflow/LFX is not installed or required by this example. Five design ideas are
useful if a future optional adapter is justified:

- typed component input/output ports map naturally to strict Recipe data schemas;
- an explicit flow ID or flow file is safer than scanning arbitrary source files;
- one-shot run and webhook endpoints are useful external entrypoint shapes;
- flow/run/session IDs and trace spans are good correlation primitives;
- a custom component is the right boundary for an OpenDesk adapter.

Current OpenDesk contracts already cover this example, so adding a Langflow
service now would add deployment, authentication, persistence, and lifecycle
ownership without improving the three-node path. A future Langflow/LFX adapter
must remain outside the OpenDesk Runtime and must call the same Recipe/result
contract.

## Limits

- The Calculator Recipes are currently macOS-specific and guard one qualified
  `232x321` Calculator layout.
- Linux and Windows have no live Calculator qualification for this example.
- The CLI bridge is synchronous and not a durable checkpoint/resume transport.
- A successful fixture test does not prove a real Agent backend is installed,
  authenticated, or available.
- Model nondeterminism is confined to the validated `5..15` decision; desktop
  actions remain deterministic and serial.
