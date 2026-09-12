#!/usr/bin/env python3
"""Python/LangGraph-owned OpenDesk Calculator workflow.

This is intentionally a small graph:
OpenDesk Recipe A -> dynamic decision -> OpenDesk Recipe B -> independent validation.

The desktop mutations remain serial. The decision node can delegate to a real model
wrapper through OPENDESK_LANGGRAPH_DECISION_COMMAND_JSON.
"""

from __future__ import annotations

import argparse
import os
from pathlib import Path
from typing import TypedDict

from langgraph.graph import END, START, StateGraph

from decision import DECISION_GRAPH
from opendesk_bridge import OpenDeskBridge
from protocol import ProtocolError, validate_increment


REPO_ROOT = Path(__file__).resolve().parents[3]
BASE_RECIPE = Path("examples/integrations/langgraph-python/recipes/calculator-base.js")
ADD_RECIPE = Path("examples/integrations/langgraph-python/recipes/calculator-add.js")


class WorkflowState(TypedDict, total=False):
    base_result: int
    base_display: str
    increment: int
    decision_source: str
    final_result: int
    final_display: str
    expected_result: int
    base_execution_id: str | None
    final_execution_id: str | None


def build_workflow(bridge: OpenDeskBridge):
    def calculate_base(_: WorkflowState) -> WorkflowState:
        run = bridge.run_recipe(BASE_RECIPE, {})
        base = run.data.get("baseResult")
        display = run.data.get("baseDisplay")
        if type(base) is not int or not isinstance(display, str):
            raise ProtocolError("calculator-base returned invalid business data")
        return {
            "base_result": base,
            "base_display": display,
            "base_execution_id": run.execution_id,
        }

    def decide(state: WorkflowState) -> WorkflowState:
        result = DECISION_GRAPH.invoke({"minimum": 5, "maximum": 15})
        increment = validate_increment(result.get("value"), minimum=5, maximum=15)
        return {
            "increment": increment,
            "decision_source": str(result.get("source") or "unknown"),
        }

    def calculate_final(state: WorkflowState) -> WorkflowState:
        base = state["base_result"]
        increment = state["increment"]
        run = bridge.run_recipe(
            ADD_RECIPE,
            {"baseResult": base, "increment": increment},
        )
        final_result = run.data.get("finalResult")
        final_display = run.data.get("finalDisplay")
        if type(final_result) is not int or not isinstance(final_display, str):
            raise ProtocolError("calculator-add returned invalid business data")
        return {
            "final_result": final_result,
            "final_display": final_display,
            "final_execution_id": run.execution_id,
        }

    def validate_final(state: WorkflowState) -> WorkflowState:
        expected = state["base_result"] + state["increment"]
        if state["final_result"] != expected:
            raise ProtocolError(
                f"independent validation failed: expected {expected}, got {state['final_result']}"
            )
        return {"expected_result": expected}

    graph = StateGraph(WorkflowState)
    graph.add_node("calculate_base", calculate_base)
    graph.add_node("decide", decide)
    graph.add_node("calculate_final", calculate_final)
    graph.add_node("validate_final", validate_final)
    graph.add_edge(START, "calculate_base")
    graph.add_edge("calculate_base", "decide")
    graph.add_edge("decide", "calculate_final")
    graph.add_edge("calculate_final", "validate_final")
    graph.add_edge("validate_final", END)
    return graph.compile()


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--opendesk",
        default=os.environ.get("OPENDESK_BIN", "./dist/opendesk"),
        help="OpenDesk executable path, relative to the repository root by default",
    )
    parser.add_argument("--timeout", type=float, default=60.0)
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    bridge = OpenDeskBridge(
        opendesk=args.opendesk,
        workdir=REPO_ROOT,
        timeout_seconds=args.timeout,
    )
    result = build_workflow(bridge).invoke({})
    print(
        "OpenDesk/LangGraph workflow complete:",
        {
            "baseResult": result["base_result"],
            "increment": result["increment"],
            "finalResult": result["final_result"],
            "decisionSource": result["decision_source"],
            "baseExecutionId": result.get("base_execution_id"),
            "finalExecutionId": result.get("final_execution_id"),
        },
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
