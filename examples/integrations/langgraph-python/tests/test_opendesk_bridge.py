from __future__ import annotations

import json
import os
from pathlib import Path
import stat
import tempfile
import time
import unittest
from unittest import mock

from opendesk_bridge import OpenDeskBridge, OpenDeskBridgeError


FAKE_OPENDESK = r'''#!/usr/bin/env python3
import json
import os
from pathlib import Path
import signal
import subprocess
import sys
import time

request = json.loads(sys.stdin.read())
mode = os.environ.get("FAKE_OPENDESK_MODE", "success")
if mode == "invalid-cli-json":
    print("not-json")
    raise SystemExit(0)
if mode == "failure":
    print(json.dumps({"ok": False, "error": {"code": "RECIPE_FAILED", "message": "fixture failure"}}))
    raise SystemExit(1)
if mode == "timeout-tree":
    pid_dir = Path(os.environ["FAKE_OPENDESK_PID_DIR"])
    pid_dir.mkdir(parents=True, exist_ok=True)
    pid_dir.joinpath("parent.pid").write_text(str(os.getpid()))
    child_code = (
        "import os,pathlib,signal,time; "
        "signal.signal(signal.SIGTERM, signal.SIG_IGN); "
        f"pathlib.Path({str(pid_dir / 'child.pid')!r}).write_text(str(os.getpid())); "
        "time.sleep(30)"
    )
    subprocess.Popen([sys.executable, "-c", child_code])
    while not pid_dir.joinpath("child.pid").exists():
        time.sleep(0.01)
    time.sleep(30)

result_path = Path.cwd() / request["meta"]["resultPath"]
result_path.parent.mkdir(parents=True, exist_ok=True)
response_request_id = request["requestId"]
if mode == "request-mismatch":
    response_request_id = "different-request"
result = {
    "schemaVersion": 1,
    "requestId": response_request_id,
    "ok": True,
    "data": {
        "value": 12,
        "resultPath": request["meta"]["resultPath"],
    },
    "error": None,
}
result_path.write_text(json.dumps(result))
print(json.dumps({"ok": True, "result": {"executionId": "fake-execution"}}))
'''


def pid_exists(pid: int) -> bool:
    try:
        os.kill(pid, 0)
    except ProcessLookupError:
        return False
    return True


class OpenDeskBridgeTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary_directory = tempfile.TemporaryDirectory()
        self.workdir = Path(self.temporary_directory.name)
        self.fake_opendesk = self.workdir / "fake-opendesk"
        self.fake_opendesk.write_text(FAKE_OPENDESK)
        self.fake_opendesk.chmod(
            self.fake_opendesk.stat().st_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH
        )
        self.recipe = self.workdir / "recipe.js"
        self.recipe.write_text("// fake OpenDesk does not execute this fixture\n")

    def tearDown(self) -> None:
        self.temporary_directory.cleanup()

    def bridge(self, *, timeout: float = 2.0) -> OpenDeskBridge:
        return OpenDeskBridge(
            opendesk=self.fake_opendesk,
            workdir=self.workdir,
            timeout_seconds=timeout,
        )

    def test_success_separates_cli_envelope_and_business_result(self) -> None:
        run = self.bridge().run_recipe(self.recipe, {"baseResult": 100})
        self.assertEqual(run.execution_id, "fake-execution")
        self.assertEqual(run.data["value"], 12)
        self.assertEqual(run.cli_envelope["ok"], True)
        self.assertTrue(run.result_path.is_file())

    def test_request_id_is_not_used_as_a_filesystem_path(self) -> None:
        run = self.bridge().run_recipe(
            self.recipe, {}, request_id="../unsafe/request-id"
        )
        result_root = (self.workdir / ".runtime" / "external-workflow-results").resolve()
        self.assertEqual(run.result_path.parent.resolve(), result_root)
        self.assertNotIn("..", run.data["resultPath"])

    def test_request_id_mismatch_is_rejected(self) -> None:
        with mock.patch.dict(os.environ, {"FAKE_OPENDESK_MODE": "request-mismatch"}):
            with self.assertRaisesRegex(OpenDeskBridgeError, "requestId") as caught:
                self.bridge().run_recipe(self.recipe, {})
        self.assertEqual(caught.exception.code, "INVALID_RESULT")

    def test_invalid_cli_json_is_rejected(self) -> None:
        with mock.patch.dict(os.environ, {"FAKE_OPENDESK_MODE": "invalid-cli-json"}):
            with self.assertRaises(OpenDeskBridgeError) as caught:
                self.bridge().run_recipe(self.recipe, {})
        self.assertEqual(caught.exception.code, "INVALID_CLI_JSON")

    def test_recipe_failure_is_not_business_success(self) -> None:
        with mock.patch.dict(os.environ, {"FAKE_OPENDESK_MODE": "failure"}):
            with self.assertRaises(OpenDeskBridgeError) as caught:
                self.bridge().run_recipe(self.recipe, {})
        self.assertEqual(caught.exception.code, "RECIPE_FAILED")

    @unittest.skipIf(os.name == "nt", "POSIX process-group cleanup assertion")
    def test_timeout_reaps_cli_and_descendant_process_group(self) -> None:
        pid_dir = self.workdir / "pids"
        started = time.monotonic()
        with mock.patch.dict(
            os.environ,
            {
                "FAKE_OPENDESK_MODE": "timeout-tree",
                "FAKE_OPENDESK_PID_DIR": str(pid_dir),
            },
        ):
            with self.assertRaises(OpenDeskBridgeError) as caught:
                self.bridge(timeout=2.0).run_recipe(self.recipe, {})
        self.assertEqual(caught.exception.code, "TIMEOUT")
        self.assertLess(time.monotonic() - started, 6.0)
        parent_pid = int((pid_dir / "parent.pid").read_text())
        child_pid = int((pid_dir / "child.pid").read_text())
        self.assertFalse(pid_exists(parent_pid))
        self.assertFalse(pid_exists(child_pid))


if __name__ == "__main__":
    unittest.main()
