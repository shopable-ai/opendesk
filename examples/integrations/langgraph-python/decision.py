#!/usr/bin/env python3
"""Small Python LangGraph decision worker for OpenDesk Command.run().

stdin: one strict JSON request
stdout: one strict JSON response
stderr: diagnostics only

The standalone worker deliberately uses a local bounded selector so direction A
can be exercised without credentials. The separate Python-owned desktop graph
in main.py calls OpenDesk's Agent.run Recipe directly.
"""

from __future__ import annotations

import json
import secrets
import sys
from typing import Any, Callable, Mapping, TypedDict

from langgraph.graph import END, START, StateGraph

from protocol import (
    ProtocolError,
    error_response,
    success_response,
    validate_increment,
    validate_request,
)


class DecisionState(TypedDict, total=False):
    minimum: int
    maximum: int
    value: int
    source: str
    meta: dict[str, Any]


def _strict_int(value: Any, name: str) -> int:
    if type(value) is not int:
        raise ProtocolError(f"{name} must be an integer")
    return value


DecisionChooser = Callable[[int, int], Mapping[str, Any]]


def build_decision_graph(chooser: DecisionChooser):
    """Build the one-node decision graph around an injected decision boundary."""

    def choose_node(state: DecisionState) -> DecisionState:
        minimum = state["minimum"]
        maximum = state["maximum"]
        decision = chooser(minimum, maximum)
        if not isinstance(decision, Mapping):
            raise ProtocolError("decision result must be an object")
        value = validate_increment(decision.get("value"), minimum=minimum, maximum=maximum)
        source = decision.get("source")
        if not isinstance(source, str) or not source:
            raise ProtocolError("decision source must be a non-empty string")
        result: DecisionState = {"value": value, "source": source}
        meta = decision.get("meta")
        if meta is not None:
            if not isinstance(meta, dict):
                raise ProtocolError("decision meta must be an object")
            result["meta"] = meta
        return result

    builder = StateGraph(DecisionState)
    builder.add_node("choose", choose_node)
    builder.add_edge(START, "choose")
    builder.add_edge("choose", END)
    return builder.compile()


def _local_chooser(minimum: int, maximum: int) -> Mapping[str, Any]:
    span = maximum - minimum + 1
    return {
        "value": minimum + secrets.randbelow(span),
        "source": "local-fallback",
    }


LOCAL_DECISION_GRAPH = build_decision_graph(_local_chooser)


def handle(value: Any) -> dict[str, Any]:
    request = validate_request(value)
    data = request["data"]
    minimum = _strict_int(data.get("minimum", 5), "data.minimum")
    maximum = _strict_int(data.get("maximum", 15), "data.maximum")
    if minimum > maximum:
        raise ProtocolError("data.minimum must be <= data.maximum")
    result = LOCAL_DECISION_GRAPH.invoke({"minimum": minimum, "maximum": maximum})
    chosen = validate_increment(result.get("value"), minimum=minimum, maximum=maximum)
    return success_response(
        request["requestId"],
        {"value": chosen, "source": result.get("source", "unknown")},
    )


def _best_effort_request_id(value: Any) -> str:
    if isinstance(value, dict):
        request_id = value.get("requestId")
        if isinstance(request_id, str) and 0 < len(request_id) <= 256:
            return request_id
    return "invalid-request"


def main() -> int:
    value: Any = None
    try:
        raw = sys.stdin.read()
        value = json.loads(raw)
        response = handle(value)
        sys.stdout.write(json.dumps(response, ensure_ascii=False, separators=(",", ":")) + "\n")
        return 0
    except Exception as exc:
        request_id = _best_effort_request_id(value)
        code = "PROTOCOL_ERROR" if isinstance(exc, (ProtocolError, json.JSONDecodeError)) else "WORKER_ERROR"
        response = error_response(request_id, code, str(exc) or exc.__class__.__name__)
        sys.stdout.write(json.dumps(response, ensure_ascii=False, separators=(",", ":")) + "\n")
        sys.stderr.write(f"[decision-worker] {code}: {exc}\n")
        return 2 if code == "PROTOCOL_ERROR" else 1


if __name__ == "__main__":
    raise SystemExit(main())
