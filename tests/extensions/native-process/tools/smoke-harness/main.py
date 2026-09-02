#!/usr/bin/env python3
"""Build and verify the Native Process Extension V0 prototype."""

from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import os
import platform
import re
import shutil
import signal
import subprocess
import sys
import time
from pathlib import Path
from typing import Any, Callable, Iterable


PROTOCOL = "opendesk-native-extension"
PROTOCOL_VERSION = 1
ROOT = Path(__file__).resolve().parents[5]
DOMAIN = ROOT / "tests" / "extensions" / "native-process"
FIXTURE_DIR = DOMAIN / "fixtures" / "ocr"
FIXTURE_MANIFEST = FIXTURE_DIR / "manifest.json"
GO_EXTENSION_DIR = ROOT / "examples" / "native-extensions" / "go-basic"
SWIFT_EXTENSION_SOURCE = ROOT / "examples" / "native-extensions" / "macos-vision" / "main.swift"
SOURCE_INPUT_SNAPSHOT = "source-input-snapshot.json"
JAVASCRIPT_DISTRIBUTION_PROOF = "javascript-distribution-isolation-proof.json"
JS_RUNTIME_ASSET_DIRS = ("polyfills", "jslibs")
SOURCE_INPUT_SUPPLEMENTAL = (
    "go.mod",
    "go.sum",
    "examples/native-extensions/go-basic/go.mod",
    "examples/native-extensions/go-basic/main.go",
    "examples/native-extensions/macos-vision/main.swift",
    "tests/extensions/native-process/smoke.js",
    "tests/extensions/native-process/fixtures/ocr/opendesk-ocr-123.png",
    "tests/extensions/native-process/fixtures/ocr/manifest.json",
    "tests/extensions/native-process/tools/faulty-extension/main.py",
    "tests/extensions/native-process/tools/generate-ocr-fixture/main.swift",
    "tests/extensions/native-process/tools/smoke-harness/main.py",
)
GO_BUILD_INPUT_FIELDS = (
    "GoFiles",
    "CgoFiles",
    "CFiles",
    "CXXFiles",
    "MFiles",
    "HFiles",
    "FFiles",
    "SFiles",
    "SysoFiles",
    "SwigFiles",
    "SwigCXXFiles",
    "EmbedFiles",
)


class SmokeError(RuntimeError):
    pass


def utc_now() -> str:
    return dt.datetime.now(dt.timezone.utc).isoformat().replace("+00:00", "Z")


def utc_run_id() -> str:
    return dt.datetime.now(dt.timezone.utc).strftime("%Y%m%dT%H%M%SZ") + f"-{os.getpid()}"


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def sha256_text(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def decode_json_stream(raw: str) -> list[Any]:
    """Decode the concatenated JSON objects produced by `go list -json`."""
    decoder = json.JSONDecoder()
    offset = 0
    values: list[Any] = []
    while offset < len(raw):
        while offset < len(raw) and raw[offset].isspace():
            offset += 1
        if offset >= len(raw):
            break
        value, offset = decoder.raw_decode(raw, offset)
        values.append(value)
    return values


def write_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    temporary.replace(path)


def append_ndjson(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(value, ensure_ascii=False, separators=(",", ":")) + "\n")


def summary_text(value: str, limit: int = 1200) -> str:
    compact = " ".join(value.strip().split())
    if len(compact) <= limit:
        return compact
    return compact[: limit - 15] + "...[truncated]"


def command_version(command: list[str]) -> str:
    try:
        completed = subprocess.run(command, cwd=ROOT, text=True, capture_output=True, timeout=10, check=False)
    except Exception as error:
        return f"unavailable: {error}"
    output = (completed.stdout or completed.stderr).strip()
    return summary_text(output, 400)


def git_output(arguments: list[str]) -> str:
    completed = subprocess.run(["git", *arguments], cwd=ROOT, text=True, capture_output=True, check=False)
    if completed.returncode != 0:
        raise SmokeError(f"git {' '.join(arguments)} failed: {summary_text(completed.stderr)}")
    return completed.stdout.strip()


def process_capture(
    command: list[str],
    *,
    cwd: Path,
    timeout_seconds: float,
    env: dict[str, str] | None = None,
) -> tuple[int, str, str, bool]:
    process = subprocess.Popen(
        command,
        cwd=cwd,
        env=env,
        stdin=subprocess.DEVNULL,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        start_new_session=True,
    )
    timed_out = False
    try:
        stdout, stderr = process.communicate(timeout=timeout_seconds)
    except subprocess.TimeoutExpired:
        timed_out = True
        os.killpg(process.pid, signal.SIGKILL)
        stdout, stderr = process.communicate()
    return process.returncode, stdout, stderr, timed_out


def walk(value: Any) -> Iterable[Any]:
    yield value
    if isinstance(value, dict):
        for child in value.values():
            yield from walk(child)
    elif isinstance(value, list):
        for child in value:
            yield from walk(child)


def strings_in(value: Any) -> list[str]:
    return [item for item in walk(value) if isinstance(item, str)]


def keyed_values(value: Any, names: set[str]) -> list[Any]:
    wanted = {name.lower() for name in names}
    found: list[Any] = []
    for item in walk(value):
        if not isinstance(item, dict):
            continue
        for key, child in item.items():
            if str(key).lower() in wanted:
                found.append(child)
    return found


def error_codes(value: Any) -> list[str]:
    codes: list[str] = []
    for item in keyed_values(value, {
        "code", "errorCode", "error_code", "extensionCode", "extensionErrorCode",
    }):
        if isinstance(item, str) and item not in codes:
            codes.append(item)
    return codes


def infer_success(payload: Any, exit_code: int) -> bool:
    if isinstance(payload, dict):
        if isinstance(payload.get("ok"), bool):
            return bool(payload["ok"])
        for key in ("status", "callStatus"):
            status = payload.get(key)
            if isinstance(status, str):
                lowered = status.lower()
                if lowered in {"passed", "success", "succeeded", "completed", "ok"}:
                    return True
                if lowered in {"failed", "failure", "error", "timed_out", "timeout"}:
                    return False
        if payload.get("error") is not None and payload.get("result") is None:
            return False
    return exit_code == 0


def strict_json(stdout: str) -> Any:
    stripped = stdout.strip()
    if not stripped:
        raise ValueError("stdout was empty")
    return json.loads(stripped)


def find_mapping(value: Any, required_keys: set[str]) -> dict[str, Any] | None:
    for item in walk(value):
        if isinstance(item, dict) and required_keys.issubset(item.keys()):
            return item
    return None


def validate_hello(payload: Any) -> tuple[bool, str]:
    if any("Hello OpenDesk" in value for value in strings_in(payload)):
        return True, "message=Hello OpenDesk"
    return False, "missing Hello OpenDesk result"


def validate_add(payload: Any) -> tuple[bool, str]:
    values = keyed_values(payload, {"value"})
    if any(isinstance(value, (int, float)) and not isinstance(value, bool) and value == 42 for value in values):
        return True, "value=42"
    return False, "missing numeric value=42"


def normalized_ocr_text(value: Any) -> str:
    return "".join(strings_in(value)).replace(" ", "").replace("\n", "").upper()


def validate_ocr(payload: Any) -> tuple[bool, str]:
    normalized = normalized_ocr_text(payload)
    if "OPENDESKOCR123" not in normalized:
        return False, "OCR result missing OPENDESK OCR 123"
    if "你好456" not in normalized:
        return False, "OCR result missing 你好 456"
    result = find_mapping(payload, {"text", "items", "image", "coordinateSystem"})
    if result is None:
        return False, "OCR result missing text/items/image/coordinateSystem"
    items = result.get("items")
    if not isinstance(items, list) or not items:
        return False, "OCR result items is empty"
    for item in items:
        if not isinstance(item, dict) or not isinstance(item.get("boundingBox"), dict):
            return False, "OCR item missing boundingBox"
        box = item["boundingBox"]
        if any(not isinstance(box.get(key), (int, float)) for key in ("x", "y", "width", "height")):
            return False, "OCR boundingBox is not numeric"
    coordinate = result.get("coordinateSystem")
    if not isinstance(coordinate, dict):
        return False, "OCR coordinateSystem is not an object"
    if coordinate.get("unit") != "normalized" or coordinate.get("origin") != "lower-left":
        return False, "OCR coordinateSystem must be normalized/lower-left"
    image = result.get("image")
    if not isinstance(image, dict) or not all(isinstance(image.get(key), (int, float)) and image[key] > 0 for key in ("width", "height")):
        return False, "OCR image dimensions are missing"
    return True, f"recognized {len(items)} items with normalized lower-left boxes"


def extract_extension_exit_codes(payload: Any) -> list[int]:
    values: list[int] = []
    for value in keyed_values(payload, {"exitCode", "exit_code"}):
        if isinstance(value, int) and not isinstance(value, bool) and value not in values:
            values.append(value)
    return values


def extract_extension_durations(payload: Any) -> list[float]:
    values: list[float] = []
    for value in keyed_values(payload, {"durationMs", "duration_ms"}):
        if isinstance(value, (int, float)) and not isinstance(value, bool) and value >= 0:
            number = round(float(value), 3)
            if number not in values:
                values.append(number)
    return values


def extract_startup_durations(payload: Any) -> list[float]:
    values: list[float] = []
    for value in keyed_values(payload, {"startupDurationMs", "startup_duration_ms"}):
        if isinstance(value, (int, float)) and not isinstance(value, bool) and value >= 0:
            number = round(float(value), 3)
            if number not in values:
                values.append(number)
    return values


def combined_stderr_summary(payload: Any, process_stderr: str) -> str:
    values: list[str] = []
    if process_stderr.strip():
        values.append(process_stderr.strip())
    for value in keyed_values(payload, {"stderrSummary", "stderr_summary"}):
        if isinstance(value, str) and value.strip() and value.strip() not in values:
            values.append(value.strip())
    return summary_text("\n".join(values))


class Harness:
    def __init__(self, run_id: str, run_dir: Path, proof_dir: Path, opendesk_override: Path | None) -> None:
        self.run_id = run_id
        self.run_dir = run_dir
        self.proof_dir = proof_dir
        self.opendesk_override = opendesk_override
        self.started_at = utc_now()
        self.started_clock = time.perf_counter()
        self.calls_path = run_dir / "calls.ndjson"
        self.results_dir = run_dir / "results"
        self.build_dir = run_dir / "build"
        self.bin_dir = run_dir / "bin"
        self.stderr_dir = run_dir / "stderr"
        self.call_logs_dir = run_dir / "call-logs"
        self.generated_dir = run_dir / "generated"
        self.records: list[dict[str, Any]] = []
        self.builds: list[dict[str, Any]] = []
        self.errors: list[str] = []
        self.performance: dict[str, Any] = {}
        self.isolation: dict[str, Any] | None = None
        self.javascript_distribution_isolation: dict[str, Any] | None = None
        self.start_commit = git_output(["rev-parse", "HEAD"])
        self.start_status = git_output(["status", "--porcelain=v1", "--untracked-files=all"])
        self.source_input_start: dict[str, dict[str, Any]] = {}
        self.source_input_definition: dict[str, Any] = {}

        self.opendesk = self.bin_dir / "opendesk"
        self.extension_dir = self.bin_dir / "native-extensions"
        self.go_extension = self.extension_dir / "native-ext-go-basic"
        self.swift_extension = self.extension_dir / "native-ext-macos-vision"
        self.faulty_extension = self.bin_dir / "native-ext-faulty"
        self.non_executable = self.bin_dir / "not-executable.txt"
        self.bad_exec_format = self.bin_dir / "bad-exec-format"
        self.ocr_image: Path | None = None

    def prepare(self) -> None:
        if self.run_dir.exists() and any(self.run_dir.iterdir()):
            raise SmokeError(f"run directory already exists and is not empty: {self.run_dir}")
        for path in (
            self.results_dir,
            self.build_dir,
            self.bin_dir,
            self.extension_dir,
            self.stderr_dir,
            self.call_logs_dir,
            self.generated_dir,
        ):
            path.mkdir(parents=True, exist_ok=True)
        self.capture_source_input_start()
        context = {
            "schemaVersion": "1.0.0",
            "runId": self.run_id,
            "runDir": str(self.run_dir),
            "startedAt": self.started_at,
            "git": {"commit": self.start_commit, "dirty": bool(self.start_status)},
            "environment": {
                "os": platform.system(),
                "release": platform.release(),
                "arch": platform.machine(),
                "python": platform.python_version(),
                "go": command_version(["go", "version"]),
                "swift": command_version(["xcrun", "swiftc", "--version"]),
            },
            "privacy": {
                "paramsRecorded": False,
                "imageBytesRecordedInCallEvidence": False,
                "stderrSummaryLimit": 1200,
                "fixture": "synthetic-no-user-data",
            },
        }
        write_json(self.run_dir / "context.json", context)

    def source_input_paths(self) -> tuple[list[str], dict[str, Any]]:
        """Return repository files that materially feed this build and smoke run.

        `go list` supplies the platform-selected, first-party source graph for
        `./cmd/opendesk`. The explicit supplement covers the independent
        extensions, fixture, fault process, JavaScript probe, and orchestrator.
        Re-deriving both the graph and hashes at finish also detects an input
        being added or removed while the smoke is running.
        """
        completed = subprocess.run(
            ["go", "list", "-deps", "-json", "./cmd/opendesk"],
            cwd=ROOT,
            text=True,
            capture_output=True,
            check=False,
        )
        if completed.returncode != 0:
            raise SmokeError(f"source input go list failed: {summary_text(completed.stderr or completed.stdout)}")

        paths = set(SOURCE_INPUT_SUPPLEMENTAL)
        for asset_dir_name in JS_RUNTIME_ASSET_DIRS:
            asset_dir = ROOT / asset_dir_name
            if asset_dir.is_dir():
                for asset in asset_dir.rglob("*"):
                    if asset.is_file():
                        paths.add(asset.relative_to(ROOT).as_posix())
        package_count = 0
        for package in decode_json_stream(completed.stdout):
            if not isinstance(package, dict):
                continue
            directory_raw = package.get("Dir")
            if not isinstance(directory_raw, str) or not directory_raw:
                continue
            directory = Path(directory_raw).resolve()
            try:
                directory.relative_to(ROOT)
            except ValueError:
                continue
            package_count += 1
            for field in GO_BUILD_INPUT_FIELDS:
                names = package.get(field, [])
                if not isinstance(names, list):
                    continue
                for name in names:
                    if not isinstance(name, str) or not name:
                        continue
                    candidate = Path(name)
                    if not candidate.is_absolute():
                        candidate = directory / candidate
                    try:
                        relative = candidate.resolve().relative_to(ROOT)
                    except ValueError:
                        continue
                    paths.add(relative.as_posix())

        definition = {
            "goBuildTarget": "./cmd/opendesk",
            "goBuildPlatform": {"goos": command_version(["go", "env", "GOOS"]), "goarch": command_version(["go", "env", "GOARCH"])},
            "firstPartyGoPackageCount": package_count,
            "goBuildInputFields": list(GO_BUILD_INPUT_FIELDS),
            "supplementalInputs": list(SOURCE_INPUT_SUPPLEMENTAL),
            "javascriptRuntimeAssetDirectories": list(JS_RUNTIME_ASSET_DIRS),
        }
        return sorted(paths), definition

    def source_input_entries(self) -> tuple[dict[str, dict[str, Any]], dict[str, Any]]:
        paths, definition = self.source_input_paths()
        entries: dict[str, dict[str, Any]] = {}
        for relative in paths:
            path = ROOT / relative
            entry: dict[str, Any] = {"path": relative, "exists": path.is_file()}
            if path.is_file():
                entry["sizeBytes"] = path.stat().st_size
                entry["sha256"] = sha256_file(path)
            else:
                entry["sizeBytes"] = None
                entry["sha256"] = ""
            entries[relative] = entry
        return entries, definition

    def capture_source_input_start(self) -> None:
        entries, definition = self.source_input_entries()
        self.source_input_start = entries
        self.source_input_definition = definition
        missing = sorted(path for path, entry in entries.items() if not entry["exists"])
        write_json(self.run_dir / SOURCE_INPUT_SNAPSHOT, {
            "schemaVersion": "1.0.0",
            "runId": self.run_id,
            "claim": "Goal build and smoke source inputs remain byte-identical throughout the run",
            "definition": definition,
            "start": {"capturedAt": utc_now(), "fileCount": len(entries), "missing": missing, "files": list(entries.values())},
            "end": None,
            "changes": [],
            "status": "running",
        })

    def finish_source_input_snapshot(self) -> tuple[bool, list[str], dict[str, Any]]:
        end_entries, end_definition = self.source_input_entries()
        paths = sorted(set(self.source_input_start).union(end_entries))
        changes: list[dict[str, Any]] = []
        for path in paths:
            before = self.source_input_start.get(path)
            after = end_entries.get(path)
            if before == after:
                continue
            if before is None:
                reason = "added_to_build_input_graph"
            elif after is None:
                reason = "removed_from_build_input_graph"
            elif before.get("exists") and not after.get("exists"):
                reason = "missing_at_finish"
            elif not before.get("exists") and after.get("exists"):
                reason = "created_during_run"
            else:
                reason = "content_changed"
            changes.append({"path": path, "reason": reason, "start": before, "end": after})

        start_missing = sorted(path for path, entry in self.source_input_start.items() if not entry["exists"])
        end_missing = sorted(path for path, entry in end_entries.items() if not entry["exists"])
        errors = [f"source input changed during run: {change['path']} ({change['reason']})" for change in changes]
        if start_missing:
            errors.append(f"source input missing at start: {start_missing}")
        if end_missing:
            errors.append(f"source input missing at finish: {end_missing}")
        status = "passed" if not errors else "failed"
        snapshot = {
            "schemaVersion": "1.0.0",
            "runId": self.run_id,
            "claim": "Goal build and smoke source inputs remain byte-identical throughout the run",
            "definition": self.source_input_definition,
            "definitionAtFinish": end_definition,
            "start": {
                "fileCount": len(self.source_input_start),
                "missing": start_missing,
                "files": list(self.source_input_start.values()),
            },
            "end": {
                "capturedAt": utc_now(),
                "fileCount": len(end_entries),
                "missing": end_missing,
                "files": list(end_entries.values()),
            },
            "changes": changes,
            "errors": errors,
            "status": status,
        }
        write_json(self.run_dir / SOURCE_INPUT_SNAPSHOT, snapshot)
        return status == "passed", errors, snapshot

    def build(self, label: str, command: list[str], cwd: Path) -> None:
        started = time.perf_counter()
        completed = subprocess.run(command, cwd=cwd, text=True, capture_output=True, check=False)
        duration_ms = round((time.perf_counter() - started) * 1000, 3)
        (self.build_dir / f"{label}.stdout.log").write_text(completed.stdout, encoding="utf-8")
        (self.build_dir / f"{label}.stderr.log").write_text(completed.stderr, encoding="utf-8")
        record = {
            "label": label,
            "command": command,
            "cwd": str(cwd),
            "durationMs": duration_ms,
            "exitCode": completed.returncode,
            "stderrSummary": summary_text(completed.stderr),
            "status": "passed" if completed.returncode == 0 else "failed",
        }
        self.builds.append(record)
        write_json(self.build_dir / f"{label}.json", record)
        if completed.returncode != 0:
            raise SmokeError(f"build {label} failed: {summary_text(completed.stderr or completed.stdout)}")

    def build_all(self) -> None:
        if platform.system() != "Darwin":
            raise SmokeError("Native Process Apple Vision smoke requires macOS")
        if self.opendesk_override:
            if not self.opendesk_override.is_file() or not os.access(self.opendesk_override, os.X_OK):
                raise SmokeError(f"OPENDESK_BINARY is not executable: {self.opendesk_override}")
            shutil.copy2(self.opendesk_override, self.opendesk)
            self.opendesk.chmod(0o755)
            self.builds.append({
                "label": "opendesk",
                "command": ["copy", str(self.opendesk_override)],
                "cwd": str(ROOT),
                "durationMs": 0,
                "exitCode": 0,
                "stderrSummary": "",
                "status": "passed",
            })
        else:
            self.build("opendesk", ["go", "build", "-o", str(self.opendesk), "./cmd/opendesk"], ROOT)

        if not (GO_EXTENSION_DIR / "main.go").is_file():
            raise SmokeError(f"Go extension source not found: {GO_EXTENSION_DIR / 'main.go'}")
        self.build("go-extension", ["go", "build", "-o", str(self.go_extension), "."], GO_EXTENSION_DIR)

        if not SWIFT_EXTENSION_SOURCE.is_file():
            raise SmokeError(f"Swift extension source not found: {SWIFT_EXTENSION_SOURCE}")
        arch = platform.machine()
        target = f"{arch}-apple-macosx12.0"
        self.build(
            "swift-extension",
            [
                "xcrun", "swiftc", "-target", target,
                str(SWIFT_EXTENSION_SOURCE),
                "-framework", "Vision",
                "-framework", "ImageIO",
                "-o", str(self.swift_extension),
            ],
            ROOT,
        )

        faulty_source = DOMAIN / "tools" / "faulty-extension" / "main.py"
        shutil.copy2(faulty_source, self.faulty_extension)
        self.faulty_extension.chmod(0o755)
        self.non_executable.write_text("intentionally not executable\n", encoding="utf-8")
        self.non_executable.chmod(0o644)
        self.bad_exec_format.write_text("intentionally executable but not a Mach-O file\n", encoding="utf-8")
        self.bad_exec_format.chmod(0o755)

        for path in (self.opendesk, self.go_extension, self.swift_extension, self.faulty_extension):
            if not path.is_file() or not os.access(path, os.X_OK):
                raise SmokeError(f"built artifact is not executable: {path}")

    def source_dependency_audit(self) -> None:
        go_mod = GO_EXTENSION_DIR / "go.mod"
        go_source = GO_EXTENSION_DIR / "main.go"
        swift_source = SWIFT_EXTENSION_SOURCE
        root_module = ""
        for line in (ROOT / "go.mod").read_text(encoding="utf-8").splitlines():
            if line.startswith("module "):
                root_module = line.split(None, 1)[1].strip()
                break

        completed = subprocess.run(
            ["go", "list", "-json", "."],
            cwd=GO_EXTENSION_DIR,
            text=True,
            capture_output=True,
            check=False,
        )
        if completed.returncode != 0:
            raise SmokeError(f"Go extension dependency audit failed: {summary_text(completed.stderr)}")
        go_list = json.loads(completed.stdout)
        go_imports = sorted(str(value) for value in go_list.get("Imports", []))
        non_stdlib_imports = sorted(value for value in go_imports if "." in value.split("/", 1)[0])
        go_mod_text = go_mod.read_text(encoding="utf-8")
        module_match = re.search(r"(?m)^module\s+(\S+)\s*$", go_mod_text)
        module_path = module_match.group(1) if module_match else ""
        has_require = bool(re.search(r"(?m)^\s*require(?:\s|\()", go_mod_text))
        imports_core = any(value == root_module or value.startswith(root_module + "/") for value in go_imports if root_module)

        swift_text = swift_source.read_text(encoding="utf-8")
        swift_imports = sorted(set(re.findall(r"(?m)^\s*import\s+([A-Za-z_][A-Za-z0-9_]*)\s*$", swift_text)))
        allowed_swift_imports = {"Foundation", "ImageIO", "Vision"}
        disallowed_swift_imports = sorted(set(swift_imports).difference(allowed_swift_imports))
        swift_mentions_core_import = bool(re.search(r"(?mi)^\s*import\s+.*opendesk", swift_text))

        status = "passed"
        errors: list[str] = []
        if not module_path:
            errors.append("Go sample module path is missing")
        if has_require:
            errors.append("Go extension go.mod contains a require directive")
        if non_stdlib_imports:
            errors.append(f"Go extension has non-standard-library imports: {non_stdlib_imports}")
        if imports_core:
            errors.append(f"Go extension imports OpenDesk core module {root_module}")
        if disallowed_swift_imports:
            errors.append(f"Swift extension has unexpected imports: {disallowed_swift_imports}")
        if swift_mentions_core_import:
            errors.append("Swift extension imports an OpenDesk module")
        if errors:
            status = "failed"

        audit = {
            "schemaVersion": "1.0.0",
            "runId": self.run_id,
            "claim": "Independent extensions compile without OpenDesk internal source packages",
            "goExtension": {
                "modulePath": module_path,
                "moduleFile": str(go_mod),
                "moduleFileSha256": sha256_file(go_mod),
                "sourceFile": str(go_source),
                "sourceFileSha256": sha256_file(go_source),
                "imports": go_imports,
                "nonStandardLibraryImports": non_stdlib_imports,
                "hasRequireDirective": has_require,
                "opendeskCoreModule": root_module,
                "importsOpenDeskCore": imports_core,
            },
            "swiftExtension": {
                "sourceFile": str(swift_source),
                "sourceFileSha256": sha256_file(swift_source),
                "imports": swift_imports,
                "allowedSystemImports": sorted(allowed_swift_imports),
                "unexpectedImports": disallowed_swift_imports,
                "importsOpenDeskModule": swift_mentions_core_import,
            },
            "errors": errors,
            "status": status,
        }
        write_json(self.run_dir / "source-dependency-audit.json", audit)
        if status != "passed":
            raise SmokeError("source dependency audit failed: " + "; ".join(errors))

    def validate_fixture(self) -> None:
        manifest = json.loads(FIXTURE_MANIFEST.read_text(encoding="utf-8"))
        image = FIXTURE_DIR / str(manifest.get("image", ""))
        if not image.is_file():
            raise SmokeError(f"OCR fixture image is missing: {image}")
        actual_sha = sha256_file(image)
        if actual_sha != manifest.get("sha256"):
            raise SmokeError(f"OCR fixture SHA mismatch: manifest={manifest.get('sha256')} actual={actual_sha}")
        expected = manifest.get("expected", {}).get("contains")
        if expected != ["OPENDESK OCR 123", "你好 456"]:
            raise SmokeError(f"OCR fixture expected text mismatch: {expected!r}")
        if manifest.get("privacy") != "synthetic-no-user-data":
            raise SmokeError("OCR fixture privacy classification is missing")
        provenance = manifest.get("provenance")
        if not isinstance(provenance, dict) or provenance.get("kind") != "project-generated" or provenance.get("externalImageAssets") is not False:
            raise SmokeError("OCR fixture provenance is incomplete")
        self.ocr_image = image.resolve()
        write_json(self.run_dir / "fixture.json", {
            "fixtureId": manifest.get("fixtureId"),
            "path": str(self.ocr_image),
            "width": manifest.get("width"),
            "height": manifest.get("height"),
            "sha256": actual_sha,
            "expected": expected,
            "privacy": manifest.get("privacy"),
            "provenance": provenance,
        })

    def binary_manifest(self) -> dict[str, Any]:
        return {
            name: {
                "path": str(path.resolve()),
                "sha256": sha256_file(path),
                "sizeBytes": path.stat().st_size,
            }
            for name, path in {
                "opendesk": self.opendesk,
                "goExtension": self.go_extension,
                "swiftExtension": self.swift_extension,
                "faultyExtension": self.faulty_extension,
            }.items()
        }

    def record_call(self, record: dict[str, Any], payload: Any) -> None:
        self.records.append(record)
        append_ndjson(self.calls_path, record)
        write_json(self.results_dir / f"{record['caseId']}.json", {"call": record, "response": payload})

    def cli_call(
        self,
        *,
        case_id: str,
        executable: Path,
        method: str,
        params: dict[str, Any],
        timeout_ms: int,
        expected_success: bool,
        expected_codes: set[str] | None = None,
        validator: Callable[[Any], tuple[bool, str]] | None = None,
        cwd: Path | None = None,
        require_stderr_diagnostic: bool = False,
    ) -> dict[str, Any]:
        request_id = f"{self.run_id}-{case_id}"
        command = [
            str(self.opendesk.resolve() if cwd is None else (cwd / "opendesk").resolve()),
            "-native-extension", str(executable.resolve()),
            "-native-method", method,
            "-native-params", json.dumps(params, ensure_ascii=False, separators=(",", ":")),
            "-native-timeout-ms", str(timeout_ms),
            "-native-request-id", request_id,
            "-log-dir", str((self.call_logs_dir / case_id).resolve()),
            "-output-format", "json",
        ]
        environment = dict(os.environ)
        environment["SKIP_FYNE_INIT"] = "1"
        started_at = utc_now()
        started = time.perf_counter()
        exit_code, stdout, stderr, outer_timeout = process_capture(
            command,
            cwd=cwd or ROOT,
            timeout_seconds=max(12.0, timeout_ms / 1000.0 + 8.0),
            env=environment,
        )
        total_duration_ms = round((time.perf_counter() - started) * 1000, 3)
        (self.stderr_dir / f"{case_id}.log").write_text(stderr, encoding="utf-8")

        payload: Any = None
        parse_error = ""
        try:
            payload = strict_json(stdout)
        except Exception as error:
            parse_error = str(error)

        actual_success = False if outer_timeout or payload is None else infer_success(payload, exit_code)
        codes = error_codes(payload)
        assertion_ok = payload is not None and not outer_timeout and actual_success == expected_success
        assertion_message = "success/error status matched"
        expected_codes = expected_codes or set()
        if assertion_ok and expected_codes:
            missing = sorted(expected_codes.difference(codes))
            if missing:
                assertion_ok = False
                assertion_message = f"missing expected error code(s): {missing}; observed={codes}"
            else:
                assertion_message = f"observed expected error code(s): {sorted(expected_codes)}"
        if assertion_ok and validator:
            assertion_ok, assertion_message = validator(payload)
        if assertion_ok and require_stderr_diagnostic:
            diagnostic_haystack = stderr + "\n" + "\n".join(strings_in(payload))
            if "diagnostic line on stderr" not in diagnostic_haystack:
                assertion_ok = False
                assertion_message = "stderr diagnostic was not captured"
            else:
                assertion_message = "stderr diagnostic captured without corrupting JSON"
        if payload is None:
            assertion_message = f"CLI stdout was not one JSON value: {parse_error}; stdout={summary_text(stdout)}"
        if outer_timeout:
            assertion_message = "outer watchdog killed OpenDesk; host timeout did not return"

        record = {
            "schemaVersion": "1.0.0",
            "runId": self.run_id,
            "caseId": case_id,
            "transport": "opendesk-native-cli",
            "extension": {
                "path": str(executable.resolve()),
                "sha256": sha256_file(executable) if executable.is_file() else "",
            },
            "method": method,
            "protocolVersion": PROTOCOL_VERSION,
            "requestId": request_id,
            "startedAt": started_at,
            "durationMs": total_duration_ms,
            "startupDurationCandidatesMs": extract_startup_durations(payload),
            "extensionDurationCandidatesMs": extract_extension_durations(payload),
            "hostExitCode": exit_code,
            "extensionExitCodeCandidates": extract_extension_exit_codes(payload),
            "callStatus": "success" if actual_success else "error",
            "expectedCallStatus": "success" if expected_success else "error",
            "errorCodes": codes,
            "stderrSummary": combined_stderr_summary(payload, stderr),
            "opendeskStderrSummary": summary_text(stderr),
            "stdoutJSON": payload is not None,
            "outerWatchdogTimeout": outer_timeout,
            "assertionStatus": "passed" if assertion_ok else "failed",
            "assertion": assertion_message,
            "privacy": {"paramsRecorded": False, "imageBytesRecorded": False},
        }
        self.record_call(record, payload if payload is not None else {"stdoutSummary": summary_text(stdout), "parseError": parse_error})
        return record

    def direct_startup_proxy(self) -> None:
        request = {
            "protocol": PROTOCOL,
            "version": PROTOCOL_VERSION,
            "id": f"{self.run_id}-direct-startup-proxy",
            "method": "hello",
            "params": {"name": "OpenDesk"},
        }
        started = time.perf_counter()
        completed = subprocess.run(
            [str(self.go_extension)],
            cwd=self.run_dir,
            input=json.dumps(request, separators=(",", ":")),
            text=True,
            capture_output=True,
            timeout=10,
            check=False,
        )
        duration_ms = round((time.perf_counter() - started) * 1000, 3)
        try:
            response = strict_json(completed.stdout)
        except Exception as error:
            raise SmokeError(f"direct Go extension startup proxy returned invalid JSON: {error}") from error
        valid, message = validate_hello(response)
        if completed.returncode != 0 or not valid:
            raise SmokeError(f"direct Go extension startup proxy failed: {message}; stderr={summary_text(completed.stderr)}")
        self.performance["processStartupLatencyProxyMs"] = duration_ms
        self.performance["processStartupLatencyDefinition"] = "direct one-shot Go process start + request decode + hello dispatch + response + exit"

    def run_functional_matrix(self) -> None:
        assert self.ocr_image is not None
        self.cli_call(
            case_id="hello", executable=self.go_extension, method="hello",
            params={"name": "OpenDesk"}, timeout_ms=3000,
            expected_success=True, validator=validate_hello,
        )
        self.cli_call(
            case_id="add", executable=self.go_extension, method="add",
            params={"a": 20, "b": 22}, timeout_ms=3000,
            expected_success=True, validator=validate_add,
        )
        self.cli_call(
            case_id="ocr", executable=self.swift_extension, method="ocr",
            params={"imagePath": str(self.ocr_image), "recognitionLevel": "accurate", "languages": ["zh-Hans", "en-US"]},
            timeout_ms=10000, expected_success=True, validator=validate_ocr,
        )
        self.cli_call(
            case_id="unknown-method", executable=self.go_extension, method="does_not_exist",
            params={}, timeout_ms=3000, expected_success=False, expected_codes={"extension_error", "unknown_method"},
        )
        self.cli_call(
            case_id="missing-a", executable=self.go_extension, method="add",
            params={"b": 22}, timeout_ms=3000, expected_success=False, expected_codes={"extension_error", "invalid_params"},
        )
        self.cli_call(
            case_id="missing-b", executable=self.go_extension, method="add",
            params={"a": 20}, timeout_ms=3000, expected_success=False, expected_codes={"extension_error", "invalid_params"},
        )
        self.cli_call(
            case_id="wrong-type", executable=self.go_extension, method="add",
            params={"a": "20", "b": 22}, timeout_ms=3000, expected_success=False, expected_codes={"extension_error", "invalid_params"},
        )
        self.cli_call(
            case_id="missing-executable", executable=self.bin_dir / "does-not-exist", method="hello",
            params={"name": "OpenDesk"}, timeout_ms=3000, expected_success=False, expected_codes={"executable_not_found"},
        )
        self.cli_call(
            case_id="non-executable", executable=self.non_executable, method="hello",
            params={"name": "OpenDesk"}, timeout_ms=3000, expected_success=False, expected_codes={"permission_denied"},
        )
        self.cli_call(
            case_id="start-failed", executable=self.bad_exec_format, method="hello",
            params={"name": "OpenDesk"}, timeout_ms=3000, expected_success=False, expected_codes={"start_failed"},
        )
        self.cli_call(
            case_id="child-crash", executable=self.faulty_extension, method="crash",
            params={}, timeout_ms=3000, expected_success=False, expected_codes={"child_exit_nonzero"},
        )
        self.cli_call(
            case_id="empty-response", executable=self.faulty_extension, method="empty",
            params={}, timeout_ms=3000, expected_success=False, expected_codes={"empty_response"},
        )
        self.cli_call(
            case_id="invalid-json", executable=self.faulty_extension, method="invalid_json",
            params={}, timeout_ms=3000, expected_success=False, expected_codes={"invalid_json"},
        )
        self.cli_call(
            case_id="protocol-mismatch", executable=self.faulty_extension, method="protocol_mismatch",
            params={}, timeout_ms=3000, expected_success=False, expected_codes={"protocol_mismatch"},
        )
        self.cli_call(
            case_id="request-id-mismatch", executable=self.faulty_extension, method="request_id_mismatch",
            params={}, timeout_ms=3000, expected_success=False, expected_codes={"request_id_mismatch"},
        )
        self.cli_call(
            case_id="timeout", executable=self.faulty_extension, method="timeout",
            params={}, timeout_ms=100, expected_success=False, expected_codes={"timeout"},
        )
        self.cli_call(
            case_id="stderr-noise", executable=self.faulty_extension, method="stderr_noise",
            params={}, timeout_ms=3000, expected_success=True, require_stderr_diagnostic=True,
        )
        self.cli_call(
            case_id="ocr-image-not-found", executable=self.swift_extension, method="ocr",
            params={"imagePath": str(self.run_dir / "missing-image.png")}, timeout_ms=10000,
            expected_success=False, expected_codes={"extension_error", "image_not_found"},
        )
        invalid_image = self.generated_dir / "invalid-image.bin"
        invalid_image.write_bytes(b"not an image\x00\x01\x02")
        self.cli_call(
            case_id="ocr-invalid-image", executable=self.swift_extension, method="ocr",
            params={"imagePath": str(invalid_image)}, timeout_ms=10000,
            expected_success=False, expected_codes={"extension_error", "invalid_image"},
        )

    def write_javascript_probe(self, destination: Path, *, ocr_image: Path) -> None:
        config = {
            "goExtensionName": self.go_extension.name,
            "swiftExtensionName": self.swift_extension.name,
            "ocrImage": str(ocr_image.resolve()),
        }
        source = DOMAIN / "smoke.js"
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_text(
            "globalThis.NATIVE_PROCESS_TEST_CONFIG = " + json.dumps(config, ensure_ascii=False) + ";\n" + source.read_text(encoding="utf-8"),
            encoding="utf-8",
        )

    def execute_javascript_probe(
        self,
        *,
        case_id: str,
        opendesk: Path,
        script: Path,
        cwd: Path,
        go_extension: Path,
        swift_extension: Path,
        ocr_image: Path,
    ) -> tuple[dict[str, Any], Any]:
        log_dir = self.call_logs_dir / case_id
        command = [
            str(opendesk.resolve()),
            "-script", str(script.resolve()),
            "-console-mode", "script",
            "-timeout", "1",
            "-experimental-unsafe-native-extension-call",
            "-log-dir", str(log_dir.resolve()),
            "-output-format", "json",
        ]
        environment = dict(os.environ)
        environment["SKIP_FYNE_INIT"] = "1"
        started_at = utc_now()
        started = time.perf_counter()
        exit_code, stdout, stderr, outer_timeout = process_capture(command, cwd=cwd, timeout_seconds=90, env=environment)
        duration_ms = round((time.perf_counter() - started) * 1000, 3)
        (self.stderr_dir / f"{case_id}.log").write_text(stderr, encoding="utf-8")
        payload: Any = None
        js_result: Any = None
        parse_error = ""
        try:
            payload = strict_json(stdout)
            prefix = "NATIVE_PROCESS_JS_RESULT "
            candidates = [value[value.index(prefix) + len(prefix):] for value in strings_in(payload) if prefix in value]
            if not candidates:
                raise ValueError("NATIVE_PROCESS_JS_RESULT log was missing")
            js_result = json.loads(candidates[-1])
        except Exception as error:
            parse_error = str(error)

        checks: list[tuple[bool, str]] = []
        if isinstance(js_result, dict):
            checks.extend([
                validate_hello(js_result.get("hello")),
                validate_add(js_result.get("add")),
                validate_ocr(js_result.get("ocr")),
            ])
            invalid_codes = error_codes(js_result.get("invalidParams"))
            checks.append(("extension_error" in invalid_codes and "invalid_params" in invalid_codes, f"JS invalid params codes={invalid_codes}"))
        else:
            checks.append((False, f"JavaScript result parse failed: {parse_error or 'result was not an object'}"))
        event_evidence_ok, event_evidence_message, event_evidence = self.validate_js_event_evidence(
            log_dir / "events.ndjson",
            js_result,
            go_extension=go_extension,
            swift_extension=swift_extension,
            ocr_image=ocr_image,
        )
        checks.append((event_evidence_ok, event_evidence_message))
        assertion_ok = exit_code == 0 and not outer_timeout and js_result is not None and all(item[0] for item in checks)
        assertion = "; ".join(item[1] for item in checks) if checks else parse_error
        record = {
            "schemaVersion": "1.0.0",
            "runId": self.run_id,
            "caseId": case_id,
            "transport": "NativeExtension.call",
            "extension": {
                "selectors": [go_extension.name, swift_extension.name],
                "paths": [str(go_extension.resolve()), str(swift_extension.resolve())],
                "sha256": [sha256_file(go_extension), sha256_file(swift_extension)],
            },
            "runtimeExecutable": str(opendesk.resolve()),
            "script": str(script.resolve()),
            "workingDirectory": str(cwd.resolve()),
            "method": "hello/add/ocr/add-invalid-params",
            "protocolVersion": PROTOCOL_VERSION,
            "requestIds": event_evidence.get("requestIds", []),
            "eventEvidence": event_evidence,
            "startedAt": started_at,
            "durationMs": duration_ms,
            "hostExitCode": exit_code,
            "callStatus": "success" if assertion_ok else "error",
            "expectedCallStatus": "success",
            "errorCodes": error_codes(js_result),
            "stderrSummary": combined_stderr_summary(js_result, stderr),
            "opendeskStderrSummary": summary_text(stderr),
            "stdoutJSON": payload is not None,
            "outerWatchdogTimeout": outer_timeout,
            "assertionStatus": "passed" if assertion_ok else "failed",
            "assertion": assertion or "JavaScript result missing",
            "privacy": {"paramsRecorded": False, "imageBytesRecorded": False},
        }
        response = payload if payload is not None else {"stdoutSummary": summary_text(stdout), "parseError": parse_error}
        return record, response

    def run_js_api(self) -> None:
        assert self.ocr_image is not None
        generated = self.generated_dir / "native-process-smoke.generated.js"
        self.write_javascript_probe(generated, ocr_image=self.ocr_image)
        record, response = self.execute_javascript_probe(
            case_id="javascript-api",
            opendesk=self.opendesk,
            script=generated,
            cwd=ROOT,
            go_extension=self.go_extension,
            swift_extension=self.swift_extension,
            ocr_image=self.ocr_image,
        )
        self.record_call(record, response)

    def validate_js_event_evidence(
        self,
        path: Path,
        js_result: Any,
        *,
        go_extension: Path,
        swift_extension: Path,
        ocr_image: Path,
    ) -> tuple[bool, str, dict[str, Any]]:
        errors: list[str] = []
        events: list[dict[str, Any]] = []
        if not path.is_file():
            errors.append(f"EventSink file is missing: {path}")
        else:
            for line_number, raw in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
                if not raw.strip():
                    continue
                try:
                    value = json.loads(raw)
                except Exception as error:
                    errors.append(f"events.ndjson line {line_number} is invalid JSON: {error}")
                    continue
                if not isinstance(value, dict):
                    errors.append(f"events.ndjson line {line_number} is not an object")
                    continue
                events.append(value)

        native_events = [event for event in events if event.get("kind") == "native_extension_call"]
        if len(native_events) != 4:
            errors.append(f"expected exactly 4 native_extension_call events, got {len(native_events)}")

        expected = [
            {
                "method": "hello", "executable": str(go_extension.resolve()),
                "status": "succeeded", "errorCode": "", "extensionErrorCode": "",
                "level": "info", "message": "native extension call succeeded",
            },
            {
                "method": "add", "executable": str(go_extension.resolve()),
                "status": "succeeded", "errorCode": "", "extensionErrorCode": "",
                "level": "info", "message": "native extension call succeeded",
            },
            {
                "method": "ocr", "executable": str(swift_extension.resolve()),
                "status": "succeeded", "errorCode": "", "extensionErrorCode": "",
                "level": "info", "message": "native extension call succeeded",
            },
            {
                "method": "add", "executable": str(go_extension.resolve()),
                "status": "failed", "errorCode": "extension_error", "extensionErrorCode": "invalid_params",
                "level": "error", "message": "native extension call failed",
            },
        ]
        required_event_keys = {
            "schemaVersion", "eventId", "executionId", "sequence", "timestamp",
            "category", "level", "source", "kind", "message", "fields",
        }
        required_evidence_keys = {
            "executable", "method", "protocol", "protocolVersion", "requestId",
            "startupDurationMs", "durationMs", "exitCode", "status", "errorCode",
            "extensionErrorCode", "stderrSummary", "stderrTruncated",
        }
        forbidden_evidence_keys = {
            "params", "result", "stdout", "rawstdout", "imagepath", "imagebytes",
            "imagecontent", "imagebase64", "account", "token",
        }
        request_ids: list[str] = []
        execution_ids: list[str] = []
        sequences: list[int] = []
        event_views: list[dict[str, Any]] = []

        for index, event in enumerate(native_events):
            missing_event = sorted(required_event_keys.difference(event.keys()))
            if missing_event:
                errors.append(f"event {index + 1} missing top-level fields: {missing_event}")
            fields = event.get("fields")
            if not isinstance(fields, dict):
                errors.append(f"event {index + 1} fields is not an object")
                fields = {}
            missing_evidence = sorted(required_evidence_keys.difference(fields.keys()))
            if missing_evidence:
                errors.append(f"event {index + 1} missing Evidence fields: {missing_evidence}")

            observed_keys: set[str] = set()
            for value in walk(fields):
                if isinstance(value, dict):
                    observed_keys.update(str(key).lower() for key in value.keys())
            leaked_keys = sorted(observed_keys.intersection(forbidden_evidence_keys))
            if leaked_keys:
                errors.append(f"event {index + 1} Evidence leaked private fields: {leaked_keys}")
            serialized_fields = json.dumps(fields, ensure_ascii=False, sort_keys=True)
            if str(ocr_image.resolve()) in serialized_fields:
                errors.append(f"event {index + 1} Evidence leaked OCR imagePath")

            request_id = fields.get("requestId")
            if not isinstance(request_id, str) or not request_id.strip():
                errors.append(f"event {index + 1} requestId is empty")
            else:
                request_ids.append(request_id)
            execution_id = event.get("executionId")
            if isinstance(execution_id, str) and execution_id:
                execution_ids.append(execution_id)
            sequence = event.get("sequence")
            if isinstance(sequence, int):
                sequences.append(sequence)

            if event.get("category") != "meta" or event.get("source") != "runtime":
                errors.append(f"event {index + 1} must be meta/runtime")
            if fields.get("protocol") != PROTOCOL or fields.get("protocolVersion") != PROTOCOL_VERSION:
                errors.append(f"event {index + 1} protocol identity mismatch")
            for duration_key in ("startupDurationMs", "durationMs"):
                duration = fields.get(duration_key)
                if not isinstance(duration, (int, float)) or isinstance(duration, bool) or duration < 0:
                    errors.append(f"event {index + 1} {duration_key} is not a non-negative number")
            if not isinstance(fields.get("exitCode"), int) or isinstance(fields.get("exitCode"), bool):
                errors.append(f"event {index + 1} exitCode is not an integer")
            if not isinstance(fields.get("stderrSummary"), str) or not fields.get("stderrSummary"):
                errors.append(f"event {index + 1} stderrSummary is empty")
            if not isinstance(fields.get("stderrTruncated"), bool):
                errors.append(f"event {index + 1} stderrTruncated is not boolean")

            if index < len(expected):
                expected_event = expected[index]
                for key in ("method", "executable", "status", "errorCode", "extensionErrorCode"):
                    if fields.get(key) != expected_event[key]:
                        errors.append(
                            f"event {index + 1} {key} mismatch: expected={expected_event[key]!r} actual={fields.get(key)!r}"
                        )
                for key in ("level", "message"):
                    if event.get(key) != expected_event[key]:
                        errors.append(
                            f"event {index + 1} {key} mismatch: expected={expected_event[key]!r} actual={event.get(key)!r}"
                        )
                if fields.get("exitCode") != 0:
                    errors.append(f"event {index + 1} expected extension exitCode=0")

            event_views.append({
                "eventId": event.get("eventId"),
                "executionId": execution_id,
                "sequence": sequence,
                "level": event.get("level"),
                "message": event.get("message"),
                "executable": fields.get("executable"),
                "method": fields.get("method"),
                "requestId": request_id,
                "status": fields.get("status"),
                "errorCode": fields.get("errorCode"),
                "extensionErrorCode": fields.get("extensionErrorCode"),
                "startupDurationMs": fields.get("startupDurationMs"),
                "durationMs": fields.get("durationMs"),
                "exitCode": fields.get("exitCode"),
                "stderrSummary": fields.get("stderrSummary"),
                "stderrTruncated": fields.get("stderrTruncated"),
            })

        if len(request_ids) != len(set(request_ids)):
            errors.append("EventSink requestIds are not unique")
        if execution_ids and len(set(execution_ids)) != 1:
            errors.append(f"native extension events have mixed executionIds: {sorted(set(execution_ids))}")
        if sequences != sorted(sequences) or len(sequences) != len(set(sequences)):
            errors.append(f"native extension event sequences are not unique/increasing: {sequences}")
        if isinstance(js_result, dict):
            invalid_params = js_result.get("invalidParams")
            invalid_evidence = invalid_params.get("evidence") if isinstance(invalid_params, dict) else None
            if not isinstance(invalid_evidence, dict):
                errors.append("JavaScript invalidParams error Evidence is missing")
            elif request_ids and invalid_evidence.get("requestId") != request_ids[-1]:
                errors.append("JavaScript error Evidence requestId does not match its EventSink event")

        evidence_summary = {
            "path": str(path),
            "sha256": sha256_file(path) if path.is_file() else "",
            "nativeExtensionCallCount": len(native_events),
            "requestIds": request_ids,
            "requestIdsNonEmpty": len(request_ids) == len(native_events),
            "requestIdsUnique": len(request_ids) == len(set(request_ids)),
            "executionIds": sorted(set(execution_ids)),
            "sequences": sequences,
            "successCount": sum(view.get("status") == "succeeded" for view in event_views),
            "failureCount": sum(view.get("status") == "failed" for view in event_views),
            "requiredEvidenceFields": sorted(required_evidence_keys),
            "forbiddenEvidenceFieldsAbsent": not any("leaked private fields" in error for error in errors),
            "ocrImagePathAbsent": not any("OCR imagePath" in error for error in errors),
            "events": event_views,
            "errors": errors,
            "status": "passed" if not errors else "failed",
        }
        message = (
            f"EventSink native_extension_call evidence passed: count={len(native_events)} "
            f"success=3 failure=1 uniqueRequestIds={len(set(request_ids))}"
            if not errors else
            "EventSink evidence failed: " + "; ".join(errors)
        )
        return not errors, message, evidence_summary

    def proof_names(self) -> list[str]:
        return sorted(path.name for path in self.proof_dir.iterdir())

    def run_isolation_proof(self) -> None:
        assert self.ocr_image is not None
        if self.proof_dir.exists():
            raise SmokeError(f"refusing to replace existing isolation proof directory: {self.proof_dir}")
        self.proof_dir.mkdir(parents=True)
        copies = {
            "opendesk": self.opendesk,
            "native-ext-go-basic": self.go_extension,
            "native-ext-macos-vision": self.swift_extension,
            "ocr-test.png": self.ocr_image,
        }
        for name, source in copies.items():
            shutil.copy2(source, self.proof_dir / name)
        for name in ("opendesk", "native-ext-go-basic", "native-ext-macos-vision"):
            (self.proof_dir / name).chmod(0o755)

        expected_names = sorted(copies)
        before = self.proof_names()
        if before != expected_names:
            raise SmokeError(f"isolation proof must contain exactly four files: {before}")

        cases = [
            self.cli_call(
                case_id="isolation-hello", executable=self.proof_dir / "native-ext-go-basic", method="hello",
                params={"name": "OpenDesk"}, timeout_ms=3000, expected_success=True,
                validator=validate_hello, cwd=self.proof_dir,
            ),
            self.cli_call(
                case_id="isolation-add", executable=self.proof_dir / "native-ext-go-basic", method="add",
                params={"a": 20, "b": 22}, timeout_ms=3000, expected_success=True,
                validator=validate_add, cwd=self.proof_dir,
            ),
            self.cli_call(
                case_id="isolation-ocr", executable=self.proof_dir / "native-ext-macos-vision", method="ocr",
                params={"imagePath": str(self.proof_dir / "ocr-test.png"), "recognitionLevel": "accurate", "languages": ["zh-Hans", "en-US"]},
                timeout_ms=10000, expected_success=True, validator=validate_ocr, cwd=self.proof_dir,
            ),
        ]
        after = self.proof_names()
        files = [
            {"name": name, "sha256": sha256_file(self.proof_dir / name), "sizeBytes": (self.proof_dir / name).stat().st_size}
            for name in after
        ]
        status = "passed" if before == expected_names and after == expected_names and all(case["assertionStatus"] == "passed" for case in cases) else "failed"
        self.isolation = {
            "path": str(self.proof_dir),
            "workingDirectory": str(self.proof_dir),
            "expectedFiles": expected_names,
            "before": before,
            "after": after,
            "files": files,
            "sourceFilesCopied": False,
            "status": status,
        }
        write_json(self.run_dir / "isolation-proof.json", self.isolation)

    def finish(self) -> int:
        end_commit = git_output(["rev-parse", "HEAD"])
        end_status = git_output(["status", "--porcelain=v1", "--untracked-files=all"])
        passed = sum(record.get("assertionStatus") == "passed" for record in self.records)
        failed = sum(record.get("assertionStatus") != "passed" for record in self.records)
        records = {record["caseId"]: record for record in self.records}
        for case_id, key in (("hello", "helloTotalMs"), ("add", "addTotalMs"), ("ocr", "ocrTotalMs")):
            if case_id in records:
                self.performance[key] = records[case_id]["durationMs"]
                candidates = records[case_id].get("extensionDurationCandidatesMs") or []
                if candidates:
                    self.performance[key.replace("Total", "ExtensionProcess")] = candidates[0]
        hello_startup = records.get("hello", {}).get("startupDurationCandidatesMs") or []
        if hello_startup:
            self.performance["processStartupLatencyMs"] = hello_startup[0]
            self.performance["processStartupLatencySource"] = "OpenDesk host Evidence.startupDurationMs for hello"

        dependency_audit_path = self.run_dir / "source-dependency-audit.json"
        dependency_audit_status = "missing"
        if dependency_audit_path.is_file():
            dependency_audit_status = json.loads(dependency_audit_path.read_text(encoding="utf-8")).get("status", "unknown")
        stability_errors: list[str] = []
        if self.start_commit != end_commit:
            stability_errors.append(f"HEAD changed during run: {self.start_commit} -> {end_commit}")
        start_status_fingerprint = sha256_text(self.start_status)
        end_status_fingerprint = sha256_text(end_status)
        if start_status_fingerprint != end_status_fingerprint:
            stability_errors.append(
                f"git status fingerprint changed during run: {start_status_fingerprint} -> {end_status_fingerprint}"
            )
        source_input_snapshot: dict[str, Any] = {}
        try:
            source_inputs_stable, source_input_errors, source_input_snapshot = self.finish_source_input_snapshot()
            stability_errors.extend(source_input_errors)
        except Exception as error:
            source_inputs_stable = False
            stability_errors.append(f"source input finish snapshot failed: {error}")
        summary_errors = [*self.errors, *stability_errors]
        status = "passed" if (
            not summary_errors
            and source_inputs_stable
            and failed == 0
            and self.isolation
            and self.isolation.get("status") == "passed"
            and dependency_audit_status == "passed"
        ) else "failed"
        summary = {
            "schemaVersion": "1.0.0",
            "prototypeStatus": "experimental",
            "runId": self.run_id,
            "startedAt": self.started_at,
            "finishedAt": utc_now(),
            "durationMs": round((time.perf_counter() - self.started_clock) * 1000, 3),
            "git": {
                "startCommit": self.start_commit,
                "endCommit": end_commit,
                "commitChangedDuringRun": self.start_commit != end_commit,
                "dirtyAtStart": bool(self.start_status),
                "dirtyAtEnd": bool(end_status),
                "statusFingerprintAtStart": start_status_fingerprint,
                "statusFingerprintAtEnd": end_status_fingerprint,
                "statusFingerprintChangedDuringRun": start_status_fingerprint != end_status_fingerprint,
            },
            "sourceInputs": {
                "path": str(self.run_dir / SOURCE_INPUT_SNAPSHOT),
                "fileCountAtStart": len(self.source_input_start),
                "fileCountAtEnd": source_input_snapshot.get("end", {}).get("fileCount") if source_input_snapshot else None,
                "sourceInputChangedDuringRun": not source_inputs_stable,
                "changeCount": len(source_input_snapshot.get("changes", [])) if source_input_snapshot else None,
                "status": source_input_snapshot.get("status", "failed") if source_input_snapshot else "failed",
            },
            "builds": self.builds,
            "binaries": self.binary_manifest() if all(path.is_file() for path in (self.opendesk, self.go_extension, self.swift_extension, self.faulty_extension)) else {},
            "protocol": {"name": PROTOCOL, "version": PROTOCOL_VERSION, "transport": "stdin/stdout UTF-8 JSON, one request/one response"},
            "calls": {"passed": passed, "failed": failed, "total": len(self.records), "records": str(self.calls_path)},
            "performance": self.performance,
            "sourceDependencyAudit": {
                "path": str(dependency_audit_path),
                "status": dependency_audit_status,
            },
            "isolation": self.isolation,
            "privacy": {"paramsRecorded": False, "imageBytesRecordedInCallEvidence": False, "fixture": "synthetic-no-user-data"},
            "errors": summary_errors,
            "status": status,
        }
        write_json(self.run_dir / "summary.json", summary)
        print(json.dumps({
            "status": status,
            "runId": self.run_id,
            "runDir": str(self.run_dir),
            "calls": summary["calls"],
            "performance": self.performance,
            "isolation": self.isolation,
            "errors": summary["errors"],
        }, ensure_ascii=False, indent=2))
        return 0 if status == "passed" else 1


def parse_arguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--run-id", default=os.environ.get("OPENDESK_NATIVE_PROCESS_RUN_ID", utc_run_id()))
    parser.add_argument("--run-dir", type=Path, default=None)
    parser.add_argument("--proof-dir", type=Path, default=None)
    parser.add_argument("--opendesk-binary", type=Path, default=None)
    return parser.parse_args()


def main() -> int:
    arguments = parse_arguments()
    run_id = arguments.run_id
    run_dir = (arguments.run_dir or ROOT / ".runtime" / "tests" / "extensions" / "native-process" / run_id).resolve()
    proof_dir = (arguments.proof_dir or Path("/tmp") / f"opendesk-native-extension-proof-{run_id}").resolve()
    override = arguments.opendesk_binary or (Path(os.environ["OPENDESK_BINARY"]) if os.environ.get("OPENDESK_BINARY") else None)
    if override:
        override = override.expanduser().resolve()

    harness = Harness(run_id, run_dir, proof_dir, override)
    try:
        harness.prepare()
        harness.validate_fixture()
        harness.build_all()
        write_json(run_dir / "binaries.json", harness.binary_manifest())
        harness.source_dependency_audit()
        harness.direct_startup_proxy()
        harness.run_functional_matrix()
        harness.run_js_api()
        harness.run_isolation_proof()
    except Exception as error:
        harness.errors.append(str(error))
        print(f"[NATIVE-PROCESS-SMOKE] {error}", file=sys.stderr)
    return harness.finish()


if __name__ == "__main__":
    raise SystemExit(main())
