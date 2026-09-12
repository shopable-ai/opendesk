#!/usr/bin/env python3
"""LangGraph decision worker for OpenDesk Command.run().

stdin: one strict JSON request
stdout: one strict JSON response
stderr: diagnostics only

The default local selector exists so the bridge can be tested without credentials.
Set OPENDESK_LANGGRAPH_DECISION_COMMAND_JSON to a JSON argv array to delegate the
decision node to a real model wrapper or another controlled decision process.
"""

from __future__ import annotations

import json
import os
import secrets
import subprocess
import sys
from typing import Any, TypedDict

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


def _strict_int(value: Any, name: str) -> int:
    if type(value) is not int:
        raise ProtocolError(f"{name} must be an integer")
    return value


def _run_decision_command(minimum: int, maximum: int) -> tuple[int, str]:
    raw = os.environ.get("OPENDESK_LANGGRAPH_DECISION_COMMAND_JSON", "").strip()
    if not raw:
        span = maximum - minimum + 1
        return minimum + secrets.randbelow(span), "local-fallback"

    try:
        argv = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise ProtocolError("OPENDESK_LANGGRAPH_DECISION_COMMAND_JSON must be JSON") from exc
    if (
        not isinstance(argv, list)
        or not argv
        or any(not isinstance(item, str) or not item for item in argv)
    ):
        raise ProtocolError("OPENDESK_LANGGRAPH_DECISION_COMMAND_JSON must be a non-empty string array")

    prompt = {
        "schemaVersion": 1,
        "task": "choose_integer",
        "minimum": minimum,
        "maximum": maximum,
        "instruction": "Return JSON only: {\"value\": <integer>}.",
    }
    timeout = float(os.environ.get("OPENDESK_LANGGRAPH_DECISION_TIMEOUT_SECONDS", "30"))
    try:
        completed = subprocess.run(
            argv,
            input=json.dumps(prompt, ensure_ascii=False),
            text=True,
            capture_output=True,
            timeout=timeout,
            check=False,
        )
    except (OSError, subprocess.TimeoutExpired) as exc:
        raise ProtocolError(f"decision command failed: {exc}") from exc
    if completed.returncode != 0:
        diagnostic = completed.stderr.strip()[-1000:]
        raise ProtocolError(
            f"decision command exited with {completed.returncode}"
            + (f": {diagnostic}" if diagnostic else "")
        )
    try:
        payload = json.loads(completed.stdout)
    except json.JSONDecodeError as exc:
        raise ProtocolError("decision command stdout must be one JSON object") from exc
    if not isinstance(payload, dict) or set(payload) != {"value"}:
        raise ProtocolError("decision command response must contain only value")
    value = validate_increment(payload["value"], minimum=minimum, maximum=maximum)
    return value, "external-command"


def choose_node(state: DecisionState) -> DecisionState:
    value, source = _run_decision_command(state["minimum"], state["maximum"])
    return {"value": value, "source": source}


_builder = StateGraph(DecisionState)
_builder.add_node("choose", choose_node)
_builder.add_edge(START, "choose")
_builder.add_edge("choose", END)
DECISION_GRAPH = _builder.compile()


def handle(value: Any) -> dict[str, Any]:
    request = validate_request(value)
    data = request["data"]
    minimum = _strict_int(data.get("minimum", 5), "data.minimum")
    maximum = _strict_int(data.get("maximum", 15), "data.maximum")
    if minimum > maximum:
        raise ProtocolError("data.minimum must be <= data.maximum")
    result = DECISION_GRAPH.invoke({"minimum": minimum, "maximum": maximum})
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
