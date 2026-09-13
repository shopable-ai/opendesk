from __future__ import annotations

from pathlib import Path
from types import SimpleNamespace
import unittest

from main import HUMAN_REQUEST, build_workflow
from protocol import ProtocolError


class FakeBridge:
    def __init__(self) -> None:
        self.calls: list[tuple[str, dict[str, object]]] = []

    def run_recipe(self, recipe: Path, data: dict[str, object]):
        name = Path(recipe).name
        self.calls.append((name, data))
        if name == "calculator-base.js":
            return SimpleNamespace(
                data={
                    "expression": "25 × 4",
                    "baseResult": 100,
                    "baseDisplay": "100",
                },
                execution_id="base-execution",
            )
        if name == "agent-decision.js":
            return SimpleNamespace(
                data={
                    "value": 12,
                    "source": "opendesk-agent",
                    "meta": {"backend": "fixture", "callId": "call-1"},
                },
                execution_id="decision-execution",
            )
        if name == "calculator-add.js":
            return SimpleNamespace(
                data={
                    "baseResult": 100,
                    "increment": 12,
                    "baseDisplayBeforeContinuation": "100",
                    "finalResult": 112,
                    "finalDisplay": "112",
                },
                execution_id="final-execution",
            )
        raise AssertionError(f"unexpected recipe: {name}")


class MainWorkflowTests(unittest.TestCase):
    def test_graph_runs_base_agent_decision_add_and_python_validation_in_order(self) -> None:
        bridge = FakeBridge()
        result = build_workflow(bridge).invoke({"request": HUMAN_REQUEST})

        self.assertEqual(
            bridge.calls,
            [
                (
                    "calculator-base.js",
                    {"expression": "25 × 4", "expectedResult": 100},
                ),
                (
                    "agent-decision.js",
                    {
                        "humanGoal": HUMAN_REQUEST["goal"],
                        "baseExpression": "25 × 4",
                        "verifiedBaseResult": 100,
                        "decisionInstruction": HUMAN_REQUEST["decision_instruction"],
                        "minimum": 5,
                        "maximum": 15,
                    },
                ),
                ("calculator-add.js", {"baseResult": 100, "increment": 12}),
            ],
        )
        self.assertEqual(result["expected_result"], 112)
        self.assertEqual(result["final_result"], 112)
        self.assertEqual(result["base_display_before_continuation"], "100")
        self.assertIs(result["goal_satisfied"], True)
        self.assertEqual(result["decision_execution_id"], "decision-execution")

    def test_waited_on_calculator_state_drift_stops_python_validation(self) -> None:
        class DriftBridge(FakeBridge):
            def run_recipe(self, recipe: Path, data: dict[str, object]):
                run = super().run_recipe(recipe, data)
                if Path(recipe).name == "calculator-add.js":
                    run.data["baseDisplayBeforeContinuation"] = "101"
                return run

        with self.assertRaisesRegex(ProtocolError, "changed while waiting"):
            build_workflow(DriftBridge()).invoke({"request": HUMAN_REQUEST})

    def test_invalid_human_request_stops_before_any_recipe(self) -> None:
        bridge = FakeBridge()
        request = {**HUMAN_REQUEST, "base_expression": "10 × 10"}

        with self.assertRaisesRegex(ProtocolError, "supports the base expression"):
            build_workflow(bridge).invoke({"request": request})

        self.assertEqual(bridge.calls, [])


if __name__ == "__main__":
    unittest.main()
