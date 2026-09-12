"""CLI bridge from Python/LangGraph to a parameterized OpenDesk Recipe."""

from __future__ import annotations

from dataclasses import dataclass
import json
import os
from pathlib import Path
import signal
import subprocess
from typing import Any, Mapping
import uuid

from protocol import ProtocolError, new_request, validate_response


class OpenDeskBridgeError(RuntimeError):
    def __init__(self, code: str, message: str, *, stdout: str = "", stderr: str = "") -> None:
        super().__init__(message)
        self.code = code
        self.stdout = stdout
        self.stderr = stderr


@dataclass(frozen=True)
class RecipeRun:
    request_id: str
    execution_id: str | None
    data: dict[str, Any]
    result_path: Path
    cli_envelope: dict[str, Any]


class OpenDeskBridge:
    """Synchronous CLI owner.

    A running `opendesk ai run` process is the owner of the OpenDesk execution.
    Timeout or KeyboardInterrupt terminates that process group; the Runtime is
    expected to perform its normal execution cancellation and teardown.
    """

    def __init__(
        self,
        *,
        opendesk: str | os.PathLike[str],
        workdir: str | os.PathLike[str],
        timeout_seconds: float = 60.0,
    ) -> None:
        self.workdir = Path(workdir).resolve()
        raw = Path(opendesk)
        if not raw.is_absolute():
            raw = self.workdir / raw
        self.opendesk = raw.resolve()
        self.timeout_seconds = float(timeout_seconds)
        if self.timeout_seconds <= 0:
            raise ValueError("timeout_seconds must be > 0")

    def run_recipe(
        self,
        recipe: str | os.PathLike[str],
        data: Mapping[str, Any],
        *,
        request_id: str | None = None,
    ) -> RecipeRun:
        rid = request_id or str(uuid.uuid4())
        result_dir = self.workdir / ".runtime" / "external-workflow-results"
        result_dir.mkdir(parents=True, exist_ok=True)
        result_path = result_dir / f"{rid}.json"
        result_path.unlink(missing_ok=True)
        relative_result = result_path.relative_to(self.workdir).as_posix()

        request = new_request(
            data,
            request_id=rid,
            meta={"resultPath": relative_result},
        )
        recipe_path = Path(recipe)
        if not recipe_path.is_absolute():
            recipe_path = self.workdir / recipe_path
        recipe_path = recipe_path.resolve()

        command = [
            str(self.opendesk),
            "ai",
            "run",
            str(recipe_path),
            "--input-stdin",
            "--timeout",
            f"{max(1, int(self.timeout_seconds))}s",
        ]
        completed = self._communicate(command, json.dumps(request, ensure_ascii=False))

        try:
            envelope = json.loads(completed.stdout)
        except json.JSONDecodeError as exc:
            raise OpenDeskBridgeError(
                "INVALID_CLI_JSON",
                "opendesk ai run stdout was not one JSON envelope",
                stdout=completed.stdout,
                stderr=completed.stderr,
            ) from exc
        if not isinstance(envelope, dict) or type(envelope.get("ok")) is not bool:
            raise OpenDeskBridgeError(
                "INVALID_CLI_ENVELOPE",
                "opendesk ai run returned an invalid envelope",
                stdout=completed.stdout,
                stderr=completed.stderr,
            )
        if completed.returncode != 0 or envelope.get("ok") is not True:
            error = envelope.get("error") if isinstance(envelope.get("error"), dict) else {}
            raise OpenDeskBridgeError(
                str(error.get("code") or "EXECUTION_FAILED"),
                str(error.get("message") or f"opendesk exited with {completed.returncode}"),
                stdout=completed.stdout,
                stderr=completed.stderr,
            )
        if not result_path.is_file():
            raise OpenDeskBridgeError(
                "RESULT_MISSING",
                f"recipe completed without bridge result: {relative_result}",
                stdout=completed.stdout,
                stderr=completed.stderr,
            )

        try:
            payload = json.loads(result_path.read_text(encoding="utf-8"))
            response = validate_response(payload, request_id=rid)
        except (OSError, json.JSONDecodeError, ProtocolError) as exc:
            raise OpenDeskBridgeError("INVALID_RESULT", str(exc)) from exc

        result_obj = envelope.get("result") if isinstance(envelope.get("result"), dict) else {}
        execution_id = result_obj.get("executionId")
        if execution_id is not None and not isinstance(execution_id, str):
            execution_id = None

        return RecipeRun(
            request_id=rid,
            execution_id=execution_id,
            data=response.data,
            result_path=result_path,
            cli_envelope=envelope,
        )

    def _communicate(self, command: list[str], stdin_text: str) -> subprocess.CompletedProcess[str]:
        creationflags = 0
        start_new_session = False
        if os.name == "nt":
            creationflags = getattr(subprocess, "CREATE_NEW_PROCESS_GROUP", 0)
        else:
            start_new_session = True

        try:
            process = subprocess.Popen(
                command,
                cwd=self.workdir,
                stdin=subprocess.PIPE,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                start_new_session=start_new_session,
                creationflags=creationflags,
            )
        except OSError as exc:
            raise OpenDeskBridgeError("START_FAILED", f"unable to start OpenDesk: {exc}") from exc

        try:
            stdout, stderr = process.communicate(stdin_text, timeout=self.timeout_seconds)
        except subprocess.TimeoutExpired:
            self._terminate(process)
            stdout, stderr = process.communicate()
            raise OpenDeskBridgeError(
                "TIMEOUT",
                f"OpenDesk recipe exceeded {self.timeout_seconds:g}s",
                stdout=stdout,
                stderr=stderr,
            )
        except KeyboardInterrupt:
            self._terminate(process)
            process.communicate()
            raise

        return subprocess.CompletedProcess(command, process.returncode, stdout, stderr)

    @staticmethod
    def _terminate(process: subprocess.Popen[str]) -> None:
        if process.poll() is not None:
            return
        try:
            if os.name == "nt":
                ctrl_break = getattr(signal, "CTRL_BREAK_EVENT", None)
                if ctrl_break is not None:
                    process.send_signal(ctrl_break)
                else:
                    process.terminate()
            else:
                os.killpg(process.pid, signal.SIGTERM)
            process.wait(timeout=3)
        except Exception:
            try:
                if os.name == "nt":
                    process.kill()
                else:
                    os.killpg(process.pid, signal.SIGKILL)
            except Exception:
                process.kill()
