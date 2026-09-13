from __future__ import annotations

import json
from pathlib import Path
import subprocess
import sys
import unittest

from decision import build_decision_graph


INTEGRATION_ROOT = Path(__file__).resolve().parents[1]
DECISION = INTEGRATION_ROOT / "decision.py"


def request(*, request_id: str = "decision-test", schema_version: object = 1) -> dict[str, object]:
    return {
        "schemaVersion": schema_version,
        "requestId": request_id,
        "data": {"minimum": 5, "maximum": 15},
        "meta": {},
    }


class DecisionWorkerTests(unittest.TestCase):
    def run_worker(
        self,
        value: object,
        *,
        raw_input: str | None = None,
        timeout: float = 5.0,
    ) -> subprocess.CompletedProcess[str]:
        return subprocess.run(
            [sys.executable, str(DECISION)],
            cwd=INTEGRATION_ROOT,
            input=raw_input if raw_input is not None else json.dumps(value),
            text=True,
            capture_output=True,
            timeout=timeout,
            check=False,
        )

    def assert_error_response(self, completed: subprocess.CompletedProcess[str]) -> dict[str, object]:
        self.assertNotEqual(completed.returncode, 0)
        self.assertEqual(len(completed.stdout.splitlines()), 1)
        payload = json.loads(completed.stdout)
        self.assertEqual(
            set(payload), {"schemaVersion", "requestId", "ok", "data", "error"}
        )
        self.assertIs(payload["ok"], False)
        self.assertIsNone(payload["data"])
        self.assertIsInstance(payload["error"], dict)
        self.assertTrue(completed.stderr.startswith("[decision-worker]"))
        return payload

    def test_standalone_runs_real_langgraph_and_emits_machine_json_only(self) -> None:
        completed = self.run_worker(request())
        self.assertEqual(completed.returncode, 0, completed.stderr)
        self.assertEqual(completed.stderr, "")
        self.assertEqual(len(completed.stdout.splitlines()), 1)
        payload = json.loads(completed.stdout)
        self.assertEqual(
            set(payload), {"schemaVersion", "requestId", "ok", "data", "error"}
        )
        self.assertIs(payload["ok"], True)
        self.assertEqual(payload["requestId"], "decision-test")
        self.assertIs(type(payload["data"]["value"]), int)
        self.assertGreaterEqual(payload["data"]["value"], 5)
        self.assertLessEqual(payload["data"]["value"], 15)
        self.assertEqual(payload["data"]["source"], "local-fallback")

    def test_invalid_json_is_machine_error_on_stdout_and_diagnostic_on_stderr(self) -> None:
        completed = self.run_worker({}, raw_input="not-json")
        payload = self.assert_error_response(completed)
        self.assertEqual(payload["requestId"], "invalid-request")
        self.assertEqual(payload["error"]["code"], "PROTOCOL_ERROR")

    def test_wrong_schema_versions_are_rejected(self) -> None:
        for bad in (True, 1.0, "1", 2):
            with self.subTest(bad=bad):
                payload = self.assert_error_response(
                    self.run_worker(request(schema_version=bad))
                )
                self.assertEqual(payload["requestId"], "decision-test")

    def test_injected_decision_boundary_runs_inside_langgraph(self) -> None:
        graph = build_decision_graph(
            lambda minimum, maximum: {
                "value": 12,
                "source": "opendesk-agent",
                "meta": {"backend": "fixture"},
            }
        )
        result = graph.invoke({"minimum": 5, "maximum": 15})
        self.assertEqual(result["value"], 12)
        self.assertEqual(result["source"], "opendesk-agent")
        self.assertEqual(result["meta"], {"backend": "fixture"})


if __name__ == "__main__":
    unittest.main()
