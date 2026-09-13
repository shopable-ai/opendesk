from __future__ import annotations

import json
import os
from pathlib import Path
import stat
import subprocess
import tempfile
import unittest


INTEGRATION_ROOT = Path(__file__).resolve().parents[1]
REPO_ROOT = INTEGRATION_ROOT.parents[2]
MAIN_JS = INTEGRATION_ROOT / "main.js"
OPENDESK = os.environ.get("OPENDESK_BIN")

FAKE_PYTHON = r'''#!/usr/bin/env python3
import json
import os
from pathlib import Path
import signal
import subprocess
import sys
import time

request = json.loads(sys.stdin.read())
mode = os.environ.get("FAKE_DECISION_MODE", "valid")
if mode == "nonzero":
    print("worker diagnostic", file=sys.stderr)
    raise SystemExit(17)
if mode == "invalid-json":
    print("not-json")
    raise SystemExit(0)

schema_version = 2 if mode == "schema-version" else 1
request_id = request["requestId"] + "-mismatch" if mode == "request-id" else request["requestId"]
values = {
    "string": "12",
    "float": 12.5,
    "bool": True,
    "below": 4,
    "above": 16,
}
value = values.get(mode, 12)
print(json.dumps({
    "schemaVersion": schema_version,
    "requestId": request_id,
    "ok": True,
    "data": {"value": value, "source": "runtime-fixture"},
    "error": None,
}, separators=(",", ":")))
'''


@unittest.skipUnless(OPENDESK, "set OPENDESK_BIN to run OpenDesk main.js integration tests")
class MainJsRuntimeTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary_directory = tempfile.TemporaryDirectory()
        self.fake_python = Path(self.temporary_directory.name) / "fake-python"
        self.fake_python.write_text(FAKE_PYTHON)
        self.fake_python.chmod(
            self.fake_python.stat().st_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH
        )

    def tearDown(self) -> None:
        self.temporary_directory.cleanup()

    def env(self, mode: str, **extra: str) -> dict[str, str]:
        result = os.environ.copy()
        result.update(
            {
                "OPENDESK_LANGGRAPH_PYTHON": str(self.fake_python),
                "FAKE_DECISION_MODE": mode,
                **extra,
            }
        )
        return result

    def run_main(
        self,
        mode: str,
        *,
        timeout: float = 10.0,
        **extra: str,
    ) -> subprocess.CompletedProcess[str]:
        env = self.env(mode, **extra)
        return subprocess.run(
            [str(OPENDESK), "-script", str(MAIN_JS), "-console-mode", "script"],
            cwd=REPO_ROOT,
            text=True,
            capture_output=True,
            timeout=timeout,
            check=False,
            env=env,
        )

    def test_valid_result_continues_javascript(self) -> None:
        completed = self.run_main("valid")
        self.assertEqual(completed.returncode, 0, completed.stdout + completed.stderr)
        self.assertIn("[DONE] Python/LangGraph returned increment=12", completed.stdout)

    def test_strict_result_failure_matrix(self) -> None:
        cases = {
            "invalid-json": "stdout must contain one JSON response",
            "schema-version": "schemaVersion must be 1",
            "request-id": "requestId mismatch",
            "string": "increment must be an integer between 5 and 15",
            "float": "increment must be an integer between 5 and 15",
            "bool": "increment must be an integer between 5 and 15",
            "below": "increment must be an integer between 5 and 15",
            "above": "increment must be an integer between 5 and 15",
            "nonzero": "EXIT_NONZERO",
        }
        for mode, expected in cases.items():
            with self.subTest(mode=mode):
                completed = self.run_main(mode)
                self.assertNotEqual(completed.returncode, 0)
                self.assertIn(expected, completed.stdout + completed.stderr)


if __name__ == "__main__":
    unittest.main()
