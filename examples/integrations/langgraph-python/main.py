#!/usr/bin/env python3
"""Run one concrete human request through Python, OpenDesk, and Agent.run.

Human request: use macOS Calculator to compute 25 × 4 and read 100, let the
model choose a dynamic increment in 5..15 while the UI remains 100, continue
with 100 + increment, read the final UI, and verify the result in Python.

Graph: validate request -> establish Calculator base -> choose with Agent.run
-> continue from the verified UI state -> verify the human goal in Python.
"""

from __future__ import annotations

import argparse
import os
from pathlib import Path
from typing import TypedDict

from langgraph.graph import END, START, StateGraph

from opendesk_bridge import OpenDeskBridge
from protocol import ProtocolError, validate_increment


REPO_ROOT = Path(__file__).resolve().parents[3]
BASE_RECIPE = Path("examples/integrations/langgraph-python/recipes/calculator-base.js")
ADD_RECIPE = Path("examples/integrations/langgraph-python/recipes/calculator-add.js")
AGENT_DECISION_RECIPE = Path(
    "examples/integrations/langgraph-python/recipes/agent-decision.js"
)


class WorkflowRequest(TypedDict):
    goal: str
    base_expression: str
    expected_base: int
    decision_instruction: str
    minimum_increment: int
    maximum_increment: int
    success_criteria: list[str]


HUMAN_REQUEST: WorkflowRequest = {
    "goal": (
        "Use macOS Calculator to calculate 25 × 4 and read 100; ask the model "
        "to choose a dynamic increment from 5 through 15 while Calculator remains "
        "at 100; continue with 100 + increment; read the final Calculator UI; and "
        "have Python independently verify the result."
    ),
    "base_expression": "25 × 4",
    "expected_base": 100,
    "decision_instruction": (
        "Choose one integer increment from 5 through 15 inclusive to add to the "
        "verified Calculator result."
    ),
    "minimum_increment": 5,
    "maximum_increment": 15,
    "success_criteria": [
        "Calculator UI reads 100 after 25 × 4.",
        "Agent.run returns an integer increment from 5 through 15.",
        "Calculator UI still reads 100 immediately before continuation.",
        "Calculator UI reads the result of 100 + increment.",
        "Python independently verifies finalResult == 100 + increment.",
    ],
}


class WorkflowState(TypedDict, total=False):
    request: WorkflowRequest
    base_result: int
    base_display: str
    increment: int
    decision_source: str
    decision_meta: dict[str, object]
    final_result: int
    final_display: str
    base_display_before_continuation: str
    expected_result: int
    goal_satisfied: bool
    base_execution_id: str | None
    decision_execution_id: str | None
    final_execution_id: str | None


def build_workflow(bridge: OpenDeskBridge):
    def validate_human_request(state: WorkflowState) -> WorkflowState:
        request = state.get("request")
        if not isinstance(request, dict):
            raise ProtocolError("workflow request must be an object")
        expected_fields = {
            "goal",
            "base_expression",
            "expected_base",
            "decision_instruction",
            "minimum_increment",
            "maximum_increment",
            "success_criteria",
        }
        if set(request) != expected_fields:
            raise ProtocolError("workflow request fields do not match the example contract")
        if not isinstance(request.get("goal"), str) or not request["goal"].strip():
            raise ProtocolError("workflow goal must be a non-empty string")
        if request.get("base_expression") != "25 × 4":
            raise ProtocolError("this example supports the base expression 25 × 4")
        if type(request.get("expected_base")) is not int or request["expected_base"] != 100:
            raise ProtocolError("the expected base for 25 × 4 must be the integer 100")
        if (
            not isinstance(request.get("decision_instruction"), str)
            or not request["decision_instruction"].strip()
        ):
            raise ProtocolError("decision instruction must be a non-empty string")
        if (
            type(request.get("minimum_increment")) is not int
            or type(request.get("maximum_increment")) is not int
            or request["minimum_increment"] != 5
            or request["maximum_increment"] != 15
        ):
            raise ProtocolError("this example requires increment bounds 5 through 15")
        criteria = request.get("success_criteria")
        if (
            not isinstance(criteria, list)
            or not criteria
            or any(not isinstance(item, str) or not item.strip() for item in criteria)
        ):
            raise ProtocolError("success criteria must be a non-empty string list")
        return {"request": request}

    def establish_base_in_calculator(state: WorkflowState) -> WorkflowState:
        request = state["request"]
        run = bridge.run_recipe(
            BASE_RECIPE,
            {
                "expression": request["base_expression"],
                "expectedResult": request["expected_base"],
            },
        )
        if set(run.data) != {"expression", "baseResult", "baseDisplay"}:
            raise ProtocolError("calculator-base returned unexpected business fields")
        base = run.data.get("baseResult")
        display = run.data.get("baseDisplay")
        if type(base) is not int or not isinstance(display, str):
            raise ProtocolError("calculator-base returned invalid business data")
        if run.data.get("expression") != request["base_expression"]:
            raise ProtocolError("calculator-base returned the wrong expression")
        if base != request["expected_base"] or display != str(request["expected_base"]):
            raise ProtocolError("calculator-base did not establish the requested UI result")
        return {
            "base_result": base,
            "base_display": display,
            "base_execution_id": run.execution_id,
        }

    def choose_increment_with_agent(state: WorkflowState) -> WorkflowState:
        request = state["request"]
        minimum = request["minimum_increment"]
        maximum = request["maximum_increment"]
        run = bridge.run_recipe(
            AGENT_DECISION_RECIPE,
            {
                "humanGoal": request["goal"],
                "baseExpression": request["base_expression"],
                "verifiedBaseResult": state["base_result"],
                "decisionInstruction": request["decision_instruction"],
                "minimum": minimum,
                "maximum": maximum,
            },
        )
        if set(run.data) != {"value", "source", "meta"}:
            raise ProtocolError("agent-decision returned unexpected business fields")
        if run.data.get("source") != "opendesk-agent":
            raise ProtocolError("agent-decision returned an unexpected source")
        increment = validate_increment(run.data.get("value"), minimum=minimum, maximum=maximum)
        meta = run.data.get("meta")
        if not isinstance(meta, dict):
            raise ProtocolError("agent decision metadata is missing")
        return {
            "increment": increment,
            "decision_source": "opendesk-agent",
            "decision_meta": meta,
            "decision_execution_id": run.execution_id,
        }

    def continue_calculator_from_verified_state(state: WorkflowState) -> WorkflowState:
        base = state["base_result"]
        increment = state["increment"]
        run = bridge.run_recipe(
            ADD_RECIPE,
            {"baseResult": base, "increment": increment},
        )
        if set(run.data) != {
            "baseResult",
            "increment",
            "baseDisplayBeforeContinuation",
            "finalResult",
            "finalDisplay",
        }:
            raise ProtocolError("calculator-add returned unexpected business fields")
        if run.data.get("baseResult") != base or run.data.get("increment") != increment:
            raise ProtocolError("calculator-add returned mismatched continuation inputs")
        base_display_before_continuation = run.data.get("baseDisplayBeforeContinuation")
        final_result = run.data.get("finalResult")
        final_display = run.data.get("finalDisplay")
        if (
            not isinstance(base_display_before_continuation, str)
            or type(final_result) is not int
            or not isinstance(final_display, str)
        ):
            raise ProtocolError("calculator-add returned invalid business data")
        if base_display_before_continuation != str(base):
            raise ProtocolError("Calculator UI changed while waiting for the model")
        if final_display != str(final_result):
            raise ProtocolError("calculator-add result does not match its UI display")
        return {
            "base_display_before_continuation": base_display_before_continuation,
            "final_result": final_result,
            "final_display": final_display,
            "final_execution_id": run.execution_id,
        }

    def verify_human_goal(state: WorkflowState) -> WorkflowState:
        request = state["request"]
        expected = request["expected_base"] + state["increment"]
        if (
            state["base_result"] != request["expected_base"]
            or state["base_display"] != str(request["expected_base"])
            or state["base_display_before_continuation"] != str(request["expected_base"])
            or state["final_display"] != str(state["final_result"])
            or state["final_result"] != expected
        ):
            raise ProtocolError(
                f"independent validation failed: expected {expected}, got {state['final_result']}"
            )
        return {"expected_result": expected, "goal_satisfied": True}

    graph = StateGraph(WorkflowState)
    graph.add_node("validate_human_request", validate_human_request)
    graph.add_node("establish_base_in_calculator", establish_base_in_calculator)
    graph.add_node("choose_increment_with_agent", choose_increment_with_agent)
    graph.add_node(
        "continue_calculator_from_verified_state",
        continue_calculator_from_verified_state,
    )
    graph.add_node("verify_human_goal", verify_human_goal)
    graph.add_edge(START, "validate_human_request")
    graph.add_edge("validate_human_request", "establish_base_in_calculator")
    graph.add_edge("establish_base_in_calculator", "choose_increment_with_agent")
    graph.add_edge(
        "choose_increment_with_agent",
        "continue_calculator_from_verified_state",
    )
    graph.add_edge("continue_calculator_from_verified_state", "verify_human_goal")
    graph.add_edge("verify_human_goal", END)
    return graph.compile()


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--opendesk",
        default=os.environ.get("OPENDESK_BIN", "./dist/opendesk"),
        help="OpenDesk executable path, relative to the repository root by default",
    )
    parser.add_argument("--timeout", type=float, default=180.0)
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    bridge = OpenDeskBridge(
        opendesk=args.opendesk,
        workdir=REPO_ROOT,
        timeout_seconds=args.timeout,
    )
    result = build_workflow(bridge).invoke({"request": HUMAN_REQUEST})
    print(
        "OpenDesk/LangGraph workflow complete:",
        {
            "humanGoal": result["request"]["goal"],
            "baseResult": result["base_result"],
            "increment": result["increment"],
            "baseDisplayBeforeContinuation": result[
                "base_display_before_continuation"
            ],
            "finalResult": result["final_result"],
            "expectedResult": result["expected_result"],
            "goalSatisfied": result["goal_satisfied"],
            "successCriteria": result["request"]["success_criteria"],
            "decisionSource": result["decision_source"],
            "decisionMeta": result["decision_meta"],
            "baseExecutionId": result.get("base_execution_id"),
            "decisionExecutionId": result.get("decision_execution_id"),
            "finalExecutionId": result.get("final_execution_id"),
        },
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
