#!/usr/bin/env python3
from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
import re
import shlex
import shutil
import subprocess
import sys
import time


ROOT = Path(__file__).resolve().parents[5]
DOMAIN = ROOT / "tests" / "extensions" / "native-plugin"
RUN_ID = time.strftime("%Y%m%dT%H%M%SZ", time.gmtime()) + f"-{os.getpid()}"
RUN_DIR = ROOT / ".runtime" / "tests" / "extensions" / "native-plugin" / RUN_ID
BUILD_DIR = RUN_DIR / "build"
PROOF_DIR = Path("/private/tmp") / f"opendesk-native-plugin-proof-{RUN_ID}"
EMPTY_CWD = Path("/private/tmp") / f"opendesk-native-plugin-empty-cwd-{RUN_ID}"
CONSUMER_DIR = Path("/private/tmp") / f"opendesk-native-plugin-consumer-{RUN_ID}"
PROTOCOL = "opendesk-native-extension"
COMMANDS: list[dict[str, object]] = []
AUTHOR_DIR = Path("/private/tmp") / f"opendesk-native-extension-author-{RUN_ID}"
AUTHOR_BUILD_EVIDENCE: dict[str, object] = {}
JSONSCHEMA_DIR = ROOT / ".runtime" / "tools" / "jsonschema-4.23.0"


class ProofFailure(RuntimeError):
    pass


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def go_build_inputs() -> set[Path]:
    completed = run([
        "go", "list", "-deps", "-json",
        "./cmd/opendesk", "./cmd/opendesk-ui-host",
    ])
    decoder = json.JSONDecoder()
    text = completed.stdout
    offset = 0
    inputs: set[Path] = set()
    file_fields = (
        "GoFiles", "CgoFiles", "CFiles", "CXXFiles", "MFiles", "HFiles",
        "FFiles", "SFiles", "SwigFiles", "SwigCXXFiles", "SysoFiles", "EmbedFiles",
    )
    while offset < len(text):
        while offset < len(text) and text[offset].isspace():
            offset += 1
        if offset >= len(text):
            break
        package, offset = decoder.raw_decode(text, offset)
        directory = Path(package.get("Dir", ""))
        try:
            directory.relative_to(ROOT)
        except (ValueError, OSError):
            continue
        for field in file_fields:
            for name in package.get(field, []) or []:
                path = directory / name
                if path.is_file():
                    inputs.add(path)
    return inputs


def source_snapshot() -> dict[str, dict[str, object]]:
    inputs = go_build_inputs()
    for fixed in (
        ROOT / "go.mod", ROOT / "go.sum",
        ROOT / "examples" / "native-extensions" / "go-basic" / "main.go",
        ROOT / "examples" / "native-extensions" / "go-basic" / "go.mod",
        ROOT / "examples" / "native-extensions" / "go-basic" / "extension.json",
        ROOT / "examples" / "native-extensions" / "go-basic" / "types" / "index.d.ts",
        ROOT / "examples" / "native-extensions" / "README.md",
        ROOT / "examples" / "native-extensions" / "macos-vision" / "main.swift",
        ROOT / "examples" / "native-extensions" / "macos-vision" / "extension.json",
        ROOT / "examples" / "native-extensions" / "macos-vision" / "types" / "index.d.ts",
        ROOT / "tests" / "extensions" / "native-process" / "fixtures" / "ocr" / "opendesk-ocr-123.png",
        ROOT / "tests" / "extensions" / "native-process" / "fixtures" / "ocr" / "manifest.json",
        ROOT / "examples" / "native-extensions" / "quickstart.js",
        ROOT / "scripts" / "test_native_extension_plugins.sh",
        ROOT / "scripts" / "build_macos_app.sh",
        ROOT / "schemas" / "native-extension" / "extension-manifest-v1.schema.json",
        ROOT / "types" / "NativeExtension.d.ts",
        ROOT / "docs/api" / "native-extension.md",
        ROOT / "docs/api" / "README.md",
        ROOT / "docs/api" / "index.md",
        ROOT / "docs/api" / "runtime-api.ai.json",
        ROOT / "docs" / "implementation" / "runtime" / "native-extension-plugin-discovery.md",
        ROOT / "tests" / "runtime-api" / "unit" / "native-extension.test.js",
        ROOT / "tests" / "runtime-api" / "manifest.js",
        ROOT / "scripts" / "test_runtime_apis.sh",
        ROOT / "prompts" / "runtime" / "native-extension-canonical-install-root-and-authoring-goal.md",
        ROOT / "cmd" / "opendesk" / "README.md",
        Path(__file__).resolve(),
    ):
        if fixed.is_file():
            inputs.add(fixed)
    for directory in (
        ROOT / "polyfills", ROOT / "jslibs", DOMAIN,
        ROOT / "pkg" / "nativeextension",
    ):
        for path in directory.rglob("*"):
            if path.is_file() and "__pycache__" not in path.parts:
                inputs.add(path)
    snapshot: dict[str, dict[str, object]] = {}
    for path in sorted(inputs):
        relative = str(path.relative_to(ROOT))
        snapshot[relative] = {"sha256": sha256(path), "sizeBytes": path.stat().st_size}
    return snapshot


def snapshot_changes(before: dict[str, dict[str, object]], after: dict[str, dict[str, object]]) -> list[dict[str, object]]:
    changes: list[dict[str, object]] = []
    for path in sorted(set(before) | set(after)):
        if before.get(path) != after.get(path):
            changes.append({"path": path, "before": before.get(path), "after": after.get(path)})
    return changes


def run(
    command: list[str], *, cwd: Path = ROOT, env: dict[str, str] | None = None,
    timeout: int = 180, check: bool = True, input_text: str | None = None,
) -> subprocess.CompletedProcess[str]:
    started = time.perf_counter()
    completed = subprocess.run(
        command, cwd=cwd, env=env, text=True, capture_output=True,
        timeout=timeout, input=input_text,
    )

    def sanitized(value: str) -> str:
        replacements = (
            (str(RUN_DIR), "<run-dir>"),
            (str(PROOF_DIR), "<proof-package>"),
            (str(CONSUMER_DIR), "<consumer-package>"),
            (str(EMPTY_CWD), "<unrelated-cwd>"),
            (str(AUTHOR_DIR), "<author-workspace>"),
            (str(ROOT), "<repository>"),
        )
        for private, token in replacements:
            value = value.replace(private, token)
        return value

    COMMANDS.append({
        "command": [sanitized(argument) for argument in command],
        "cwd": sanitized(str(cwd)),
        "environment": {
            key: sanitized(env[key])
            for key in (
                "GOOS", "GOARCH", "CGO_ENABLED", "DIST_DIR",
                "NATIVE_EXTENSIONS_SOURCE", "CODESIGN_IDENTITY",
                "HOME", "SKIP_FYNE_INIT",
            )
            if env is not None and key in env
        },
        "exitCode": completed.returncode,
        "durationMs": round((time.perf_counter() - started) * 1000, 3),
        "stdoutBytes": len(completed.stdout.encode("utf-8")),
        "stdoutSha256": hashlib.sha256(completed.stdout.encode("utf-8")).hexdigest(),
        "stderrBytes": len(completed.stderr.encode("utf-8")),
        "stderrSha256": hashlib.sha256(completed.stderr.encode("utf-8")).hexdigest(),
        "stdinBytes": len((input_text or "").encode("utf-8")),
        "stdinSha256": hashlib.sha256((input_text or "").encode("utf-8")).hexdigest(),
    })
    if check and completed.returncode != 0:
        raise ProofFailure(
            f"command failed ({completed.returncode}): {shlex.join(command)}\n"
            f"stdout:\n{completed.stdout}\nstderr:\n{completed.stderr}"
        )
    return completed


def build_artifacts() -> tuple[Path, Path, Path]:
    global AUTHOR_BUILD_EVIDENCE
    BUILD_DIR.mkdir(parents=True, mode=0o700)
    if AUTHOR_DIR.exists():
        shutil.rmtree(AUTHOR_DIR)
    go_author = AUTHOR_DIR / "go-basic"
    swift_author = AUTHOR_DIR / "macos-vision"
    go_author.mkdir(parents=True, mode=0o700)
    swift_author.mkdir(parents=True, mode=0o700)
    for name in ("go.mod", "main.go"):
        shutil.copy2(ROOT / "examples" / "native-extensions" / "go-basic" / name, go_author / name)
    for name in ("main.swift",):
        shutil.copy2(ROOT / "examples" / "native-extensions" / "macos-vision" / name, swift_author / name)

    opendesk = BUILD_DIR / "opendesk"
    go_extension = BUILD_DIR / "native-ext-go-basic"
    vision_extension = BUILD_DIR / "native-ext-macos-vision"
    run(["go", "build", "-o", str(opendesk), "./cmd/opendesk"])
    run(["go", "build", "-trimpath", "-buildvcs=false", "-o", str(go_extension), "."], cwd=go_author)
    arch = run(["uname", "-m"]).stdout.strip()
    sdk = run(["xcrun", "--sdk", "macosx", "--show-sdk-path"]).stdout.strip()
    run([
        "xcrun", "swiftc", "-O", "-target", f"{arch}-apple-macosx12.0", "-sdk", sdk,
        str(swift_author / "main.swift"), "-framework", "Vision", "-framework", "ImageIO",
        "-o", str(vision_extension),
    ])
    AUTHOR_BUILD_EVIDENCE = {
        "status": "passed",
        "workspace": str(AUTHOR_DIR),
        "outsideRepository": True,
        "opendeskCoreSourceRequired": False,
        "go": {
            "tool": "go build -trimpath",
            "sha256": sha256(go_extension),
            "sizeBytes": go_extension.stat().st_size,
        },
        "swift": {
            "tool": "xcrun swiftc -O",
            "sha256": sha256(vision_extension),
            "sizeBytes": vision_extension.stat().st_size,
        },
    }
    return opendesk, go_extension, vision_extension


def assert_author_wire_test(go_extension: Path) -> dict[str, object]:
    request = {
        "protocol": PROTOCOL,
        "version": 1,
        "id": "author-wire-1",
        "method": "hello",
        "params": {"name": "OpenDesk"},
    }
    completed = run(
        [str(go_extension)],
        input_text=json.dumps(request, separators=(",", ":")) + "\n",
    )
    lines = [line for line in completed.stdout.splitlines() if line.strip()]
    if len(lines) != 1:
        raise ProofFailure(f"wire test stdout line count = {len(lines)}, want 1")
    response = json.loads(lines[0])
    expected = {
        "protocol": PROTOCOL,
        "version": 1,
        "id": "author-wire-1",
        "ok": True,
        "result": {"message": "Hello OpenDesk"},
    }
    if response != expected:
        raise ProofFailure(f"wire response mismatch: {response}")
    return {
        "status": "passed",
        "requestCount": 1,
        "stdoutResponseCount": 1,
        "stderrOnlyDiagnostics": True,
        "result": response["result"],
        "stdoutSha256": hashlib.sha256(completed.stdout.encode("utf-8")).hexdigest(),
        "stderrBytes": len(completed.stderr.encode("utf-8")),
        "stderrSha256": hashlib.sha256(completed.stderr.encode("utf-8")).hexdigest(),
    }


def validate_manifest_schema(manifests: list[Path]) -> dict[str, object]:
    if not (JSONSCHEMA_DIR / "jsonschema").is_dir():
        raise ProofFailure(
            "pinned jsonschema 4.23.0 is unavailable under .runtime/tools; "
            "install it before running the proof"
        )
    schema = ROOT / "schemas" / "native-extension" / "extension-manifest-v1.schema.json"
    validator_program = """
import json, pathlib, sys
from importlib.metadata import version
from jsonschema.validators import validator_for
schema = json.loads(pathlib.Path(sys.argv[1]).read_text(encoding='utf-8'))
validator = validator_for(schema)
validator.check_schema(schema)
for raw in sys.argv[2:]:
    validator(schema).validate(json.loads(pathlib.Path(raw).read_text(encoding='utf-8')))
print(json.dumps({'validator':'jsonschema','version':version('jsonschema'),'instances':len(sys.argv)-2}))
""".strip()
    environment = dict(os.environ)
    environment["PYTHONPATH"] = str(JSONSCHEMA_DIR)
    completed = run(
        [sys.executable, "-c", validator_program, str(schema), *[str(path) for path in manifests]],
        env=environment,
    )
    result = json.loads(completed.stdout)
    return {
        "status": "passed",
        "draft": "2020-12",
        "validator": result["validator"],
        "validatorVersion": result["version"],
        "schemaSha256": sha256(schema),
        "instanceCount": result["instances"],
        "instances": [
            {"path": str(path.relative_to(ROOT)) if path.is_relative_to(ROOT) else path.name, "sha256": sha256(path)}
            for path in manifests
        ],
    }


def cross_compile_artifacts() -> dict[str, object]:
    output = RUN_DIR / "cross-compile"
    output.mkdir(mode=0o700)
    targets = [
        ("linux", "amd64", output / "nativeextension-linux-amd64.test", "test"),
        ("windows", "amd64", output / "nativeextension-windows-amd64.test.exe", "test"),
        ("linux", "amd64", output / "go-basic-linux-amd64", "example"),
        ("windows", "amd64", output / "go-basic-windows-amd64.exe", "example"),
    ]
    records: list[dict[str, object]] = []
    compiled: dict[tuple[str, str], Path] = {}
    for goos, goarch, destination, kind in targets:
        environment = dict(os.environ)
        environment.update({"GOOS": goos, "GOARCH": goarch, "CGO_ENABLED": "0"})
        if kind == "test":
            command = ["go", "test", "-c", "-o", str(destination), "./pkg/nativeextension"]
        else:
            command = [
                "go", "-C", str(ROOT / "examples" / "native-extensions" / "go-basic"),
                "build", "-o", str(destination), ".",
            ]
        run(command, env=environment)
        compiled[(goos, kind)] = destination
        records.append({
            "goos": goos, "goarch": goarch, "kind": kind,
            "path": str(destination), "sizeBytes": destination.stat().st_size,
            "sha256": sha256(destination),
        })

    source_manifest = json.loads(
        (ROOT / "examples" / "native-extensions" / "go-basic" / "extension.json").read_text(encoding="utf-8")
    )
    packages: list[dict[str, object]] = []
    target_manifests: list[Path] = []
    package_root = output / "packages"
    for goos, goarch in (("linux", "amd64"), ("windows", "amd64")):
        target_root = package_root / f"{goos}-{goarch}"
        bundle = target_root / source_manifest["id"]
        executable_name = "native-ext-go-basic.exe" if goos == "windows" else "native-ext-go-basic"
        executable_relative = Path("bin") / executable_name
        executable = bundle / executable_relative
        executable.parent.mkdir(parents=True, mode=0o700)
        shutil.copy2(compiled[(goos, "example")], executable)
        if goos != "windows":
            executable.chmod(0o700)
        types_dir = bundle / "types"
        types_dir.mkdir(mode=0o700)
        shutil.copy2(
            ROOT / "examples" / "native-extensions" / "go-basic" / "types" / "index.d.ts",
            types_dir / "index.d.ts",
        )
        manifest = json.loads(json.dumps(source_manifest))
        manifest["executable"] = executable_relative.as_posix()
        manifest["executableSha256"] = sha256(executable)
        (bundle / "extension.json").write_text(
            json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
        )
        target_manifests.append(bundle / "extension.json")
        forbidden_source = [
            str(path.relative_to(bundle))
            for path in bundle.rglob("*")
            if path.is_file() and path.suffix.lower() in {".go", ".swift", ".rs", ".c", ".cc", ".cpp", ".h"}
        ]
        if forbidden_source:
            raise ProofFailure(f"target bundle contains implementation source: {forbidden_source}")
        archive_base = package_root / (
            f"{source_manifest['id']}_{source_manifest['version']}_{goos}-{goarch}"
        )
        archive_format = "zip" if goos == "windows" else "gztar"
        archive = Path(shutil.make_archive(
            str(archive_base), archive_format, root_dir=target_root, base_dir=source_manifest["id"]
        ))
        packages.append({
            "goos": goos,
            "goarch": goarch,
            "archive": str(archive),
            "archiveSha256": sha256(archive),
            "archiveSizeBytes": archive.stat().st_size,
            "manifestExecutable": manifest["executable"],
            "executableSha256": manifest["executableSha256"],
            "sourceIncluded": False,
            "runtimeVerified": False,
            "inventory": [str(path.relative_to(bundle)) for path in sorted(bundle.rglob("*")) if path.is_file()],
        })
    return {
        "status": "passed",
        "artifacts": records,
        "packages": packages,
        "schemaValidation": validate_manifest_schema(target_manifests),
        "targetPackagesAreCompileOnlyEvidence": True,
    }


def install_bundle(
    destination_root: Path,
    *,
    source_manifest: Path,
    real_executable: Path,
    marker: Path | None,
    facade_marker: Path | None = None,
    id_override: str | None = None,
    namespace_override: str | None = None,
) -> Path:
    manifest = json.loads(source_manifest.read_text(encoding="utf-8"))
    if id_override:
        manifest["id"] = id_override
    if namespace_override:
        manifest["javascript"]["namespace"] = namespace_override
    bundle = destination_root / manifest["id"]
    executable = bundle / Path(manifest["executable"])
    executable.parent.mkdir(parents=True, mode=0o700)
    if marker is None:
        # A consumer release must bind the manifest directly to the author's
        # precompiled executable. Instrumented wrappers are reserved for the
        # separate portable-root process-lifecycle cases below.
        shutil.copy2(real_executable, executable)
        executable.chmod(0o700)
    else:
        real_copy = executable.with_name(executable.name + ".real")
        shutil.copy2(real_executable, real_copy)
        real_copy.chmod(0o700)
        wrapper = (
            "#!/bin/sh\n"
            f"printf '%s\\n' {shlex.quote(manifest['id'])} >> {shlex.quote(str(marker))}\n"
            'extension_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd -P)\n'
            f'exec "$extension_dir"/{shlex.quote(real_copy.name)}\n'
        )
        executable.write_text(wrapper, encoding="utf-8")
        executable.chmod(0o700)
    manifest["executableSha256"] = sha256(executable)
    (bundle / "extension.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    (bundle / "extension.json").chmod(0o600)
    source_types = source_manifest.parent / "types" / "index.d.ts"
    if source_types.is_file():
        types_dir = bundle / "types"
        types_dir.mkdir(mode=0o700)
        shutil.copy2(source_types, types_dir / "index.d.ts")
        (types_dir / "index.d.ts").chmod(0o600)
    if facade_marker is not None:
        (bundle / "facade.js").write_text(
            f'File.write({json.dumps(str(facade_marker))}, "executed");\n', encoding="utf-8"
        )
        (bundle / "facade.js").chmod(0o600)
    return bundle


def prepare_proof(opendesk: Path, go_extension: Path, vision_extension: Path) -> dict[str, Path]:
    if PROOF_DIR.exists() or EMPTY_CWD.exists() or CONSUMER_DIR.exists():
        raise ProofFailure("refusing to replace an existing proof directory")
    PROOF_DIR.mkdir(mode=0o700)
    EMPTY_CWD.mkdir(mode=0o700)
    shutil.copy2(opendesk, PROOF_DIR / "opendesk")
    (PROOF_DIR / "opendesk").chmod(0o700)
    shutil.copytree(ROOT / "polyfills", PROOF_DIR / "polyfills")
    shutil.copytree(ROOT / "jslibs", PROOF_DIR / "jslibs")
    (PROOF_DIR / "native-extensions").mkdir(mode=0o700)
    (PROOF_DIR / "scripts").mkdir(mode=0o700)
    (PROOF_DIR / "fixtures").mkdir(mode=0o700)
    for script in (
        "disabled.js", "list-only.js", "smoke.js", "user-root.js", "hello-again.js",
        "error-privacy.js", "app-call.js",
    ):
        shutil.copy2(DOMAIN / script, PROOF_DIR / "scripts" / script)
    shutil.copy2(ROOT / "examples" / "native-extensions" / "quickstart.js", PROOF_DIR / "scripts" / "quickstart.js")
    fixture = ROOT / "tests" / "extensions" / "native-process" / "fixtures" / "ocr" / "opendesk-ocr-123.png"
    shutil.copy2(fixture, PROOF_DIR / "fixtures" / "ocr-test.png")
    go_marker = RUN_DIR / "children-go.ndjson"
    vision_marker = RUN_DIR / "children-vision.ndjson"
    facade_marker = RUN_DIR / "facade-executed"
    go_bundle = install_bundle(
        PROOF_DIR / "native-extensions",
        source_manifest=ROOT / "examples" / "native-extensions" / "go-basic" / "extension.json",
        real_executable=go_extension, marker=go_marker, facade_marker=facade_marker,
    )
    vision_bundle = install_bundle(
        PROOF_DIR / "native-extensions",
        source_manifest=ROOT / "examples" / "native-extensions" / "macos-vision" / "extension.json",
        real_executable=vision_extension, marker=vision_marker,
    )
    return {
        "goMarker": go_marker,
        "visionMarker": vision_marker,
        "facadeMarker": facade_marker,
        "goBundle": go_bundle,
        "visionBundle": vision_bundle,
        "fixture": PROOF_DIR / "fixtures" / "ocr-test.png",
    }


def prepare_consumer_package(opendesk: Path) -> None:
    CONSUMER_DIR.mkdir(mode=0o700)
    shutil.copy2(opendesk, CONSUMER_DIR / "opendesk")
    (CONSUMER_DIR / "opendesk").chmod(0o700)
    shutil.copytree(ROOT / "polyfills", CONSUMER_DIR / "polyfills")
    shutil.copytree(ROOT / "jslibs", CONSUMER_DIR / "jslibs")
    scripts = CONSUMER_DIR / "scripts"
    scripts.mkdir(mode=0o700)
    shutil.copy2(ROOT / "examples" / "native-extensions" / "quickstart.js", scripts / "quickstart.js")
    shutil.copy2(DOMAIN / "canonical-diagnostics.js", scripts / "canonical-diagnostics.js")


def controlled_env(home: Path) -> dict[str, str]:
    home.mkdir(parents=True, exist_ok=True, mode=0o700)
    environment = dict(os.environ)
    environment["HOME"] = str(home)
    environment["SKIP_FYNE_INIT"] = "1"
    return environment


def execute_case(
    name: str, binary: Path, script: Path, *, gate: bool, env: dict[str, str],
    expect_success: bool = True,
) -> dict[str, object]:
    log_dir = RUN_DIR / "cases" / name
    command = [
        str(binary), "-script", str(script), "-console-mode", "script",
        "-timeout", "2", "-log-dir", str(log_dir),
    ]
    if gate:
        command.insert(1, "-experimental-native-extension")
    started = time.perf_counter()
    completed = run(command, cwd=EMPTY_CWD, env=env, timeout=120, check=expect_success)
    if not expect_success and completed.returncode == 0:
        raise ProofFailure(f"{name} unexpectedly succeeded")
    duration_ms = round((time.perf_counter() - started) * 1000, 3)
    return {
        "name": name,
        "command": command,
        "cwd": str(EMPTY_CWD),
        "durationMs": duration_ms,
        "stdout": completed.stdout,
        "stderr": completed.stderr,
        "exitCode": completed.returncode,
        "logDir": log_dir,
    }


def marker_payload(case: dict[str, object], marker: str) -> dict[str, object]:
    match = re.search(re.escape(marker) + r" (\{.*\})", str(case["stdout"]))
    if not match:
        raise ProofFailure(f"{case['name']} did not emit {marker}:\n{case['stdout']}")
    return json.loads(match.group(1))


def child_count(path: Path) -> int:
    if not path.exists():
        return 0
    return len([line for line in path.read_text(encoding="utf-8").splitlines() if line.strip()])


def read_events(case: dict[str, object]) -> list[dict[str, object]]:
    path = Path(case["logDir"]) / "events.ndjson"
    if not path.is_file():
        raise ProofFailure(f"missing EventSink log: {path}")
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]


def native_call_events(case: dict[str, object]) -> list[dict[str, object]]:
    return [event for event in read_events(case) if event.get("kind") == "native_extension_call"]


def assert_inert_cases(paths: dict[str, Path], environment: dict[str, str]) -> tuple[dict[str, object], dict[str, object]]:
    disabled = execute_case("disabled-default", PROOF_DIR / "opendesk", PROOF_DIR / "scripts" / "disabled.js", gate=False, env=environment)
    payload = marker_payload(disabled, "PLUGIN_DISABLED_RESULT")
    if payload != {"globalsAbsent": True}:
        raise ProofFailure(f"unexpected disabled result: {payload}")
    if child_count(paths["goMarker"]) or child_count(paths["visionMarker"]):
        raise ProofFailure("default CLI without registry gate started an extension child")

    list_only = execute_case("list-only", PROOF_DIR / "opendesk", PROOF_DIR / "scripts" / "list-only.js", gate=True, env=environment)
    listed = marker_payload(list_only, "PLUGIN_LIST_RESULT")
    if not listed.get("immutable"):
        raise ProofFailure(f"list-only binding was not immutable: {listed}")
    if child_count(paths["goMarker"]) or child_count(paths["visionMarker"]):
        raise ProofFailure("discovery/list/get/diagnostics started an extension child")
    if paths["facadeMarker"].exists():
        raise ProofFailure("discovery executed third-party facade.js")
    return disabled, list_only


def assert_smoke(paths: dict[str, Path], environment: dict[str, str]) -> tuple[dict[str, object], dict[str, object], dict[str, object]]:
    generated = PROOF_DIR / "scripts" / "plugin-smoke.js"
    generated.write_text(
        "globalThis.PLUGIN_PROOF_CONFIG = " + json.dumps({"ocrImage": str(paths["fixture"])}) + ";\n" +
        (PROOF_DIR / "scripts" / "smoke.js").read_text(encoding="utf-8"),
        encoding="utf-8",
    )
    smoke = execute_case("smoke", PROOF_DIR / "opendesk", generated, gate=True, env=environment)
    result = marker_payload(smoke, "PLUGIN_PROOF_RESULT")
    if result.get("hello") != {"message": "Hello OpenDesk"}:
        raise ProofFailure(f"hello result mismatch: {result}")
    if result.get("add") != {"value": 42}:
        raise ProofFailure(f"add result mismatch: {result}")
    expected_fixture = json.loads((ROOT / "tests" / "extensions" / "native-process" / "fixtures" / "ocr" / "manifest.json").read_text(encoding="utf-8"))
    ocr = result.get("ocr")
    if not isinstance(ocr, dict) or ocr.get("text") != expected_fixture["expected"]["text"]:
        raise ProofFailure(f"real Apple Vision OCR result mismatch: {ocr}")
    if child_count(paths["goMarker"]) != 2 or child_count(paths["visionMarker"]) != 1:
        raise ProofFailure("first smoke did not start exactly one fresh child per method call")

    again = execute_case("hello-again", PROOF_DIR / "opendesk", PROOF_DIR / "scripts" / "hello-again.js", gate=True, env=environment)
    again_result = marker_payload(again, "PLUGIN_HELLO_AGAIN_RESULT")
    if again_result.get("hello") != {"message": "Hello Again"} or child_count(paths["goMarker"]) != 3:
        raise ProofFailure("later invocation did not start exactly one fresh one-shot child")
    if paths["facadeMarker"].exists():
        raise ProofFailure("invocation executed third-party facade.js")
    return smoke, again, result


def assert_packaged_quickstart(paths: dict[str, Path], environment: dict[str, str]) -> dict[str, object]:
    case = execute_case(
        "packaged-quickstart", PROOF_DIR / "opendesk", PROOF_DIR / "scripts" / "quickstart.js",
        gate=True, env=environment,
    )
    output = str(case["stdout"])
    if '{"hello":{"message":"Hello OpenDesk"},"sum":{"value":42}}' not in output:
        raise ProofFailure(f"documented packaged quickstart result mismatch: {output}")
    if child_count(paths["goMarker"]) != 5:
        raise ProofFailure("documented quickstart did not start exactly one child per hello/add call")
    return case


def assert_current_user_root(opendesk: Path, go_extension: Path, environment_home: Path) -> dict[str, object]:
    prepare_consumer_package(opendesk)
    release_root = RUN_DIR / "publisher-release"
    release_root.mkdir(mode=0o700)
    release_bundle = install_bundle(
        release_root,
        source_manifest=ROOT / "examples" / "native-extensions" / "go-basic" / "extension.json",
        real_executable=go_extension,
        marker=None,
    )
    release_manifest = json.loads((release_bundle / "extension.json").read_text(encoding="utf-8"))
    release_executable = release_bundle / release_manifest["executable"]
    release_inventory = [
        str(path.relative_to(release_bundle))
        for path in sorted(release_bundle.rglob("*"))
        if path.is_file()
    ]
    expected_inventory = ["bin/native-ext-go-basic", "extension.json", "types/index.d.ts"]
    if release_inventory != expected_inventory:
        raise ProofFailure(f"consumer release inventory is not the direct precompiled bundle: {release_inventory}")
    if sha256(release_executable) != sha256(go_extension):
        raise ProofFailure("consumer release executable differs from the author-built executable")
    if release_manifest.get("executableSha256") != sha256(go_extension):
        raise ProofFailure("consumer release manifest digest does not bind the author-built executable")
    release_schema = validate_manifest_schema([release_bundle / "extension.json"])
    archive_dir = RUN_DIR / "publisher-archives"
    archive_dir.mkdir(mode=0o700)
    target_arch = run(["uname", "-m"]).stdout.strip()
    if not re.fullmatch(r"[A-Za-z0-9_.-]+", target_arch):
        raise ProofFailure(f"unexpected Darwin architecture name: {target_arch!r}")
    archive = archive_dir / f"com.example.go-basic_0.1.0_darwin-{target_arch}.tar.gz"
    run(["tar", "-czf", str(archive), "-C", str(release_root), release_bundle.name])
    checksum = run(["shasum", "-a", "256", str(archive)]).stdout.split()[0]
    if checksum != sha256(archive):
        raise ProofFailure("publisher archive checksum command disagreed with proof hash")

    unpack_root = RUN_DIR / "consumer-unpacked"
    unpack_root.mkdir(mode=0o700)
    run(["tar", "-xzf", str(archive), "-C", str(unpack_root)])
    unpacked_bundle = unpack_root / release_bundle.name
    user_root = environment_home / "Library" / "Application Support" / "OpenDesk" / "NativeExtensions"
    installed_bundle = user_root / release_bundle.name
    if installed_bundle.exists():
        raise ProofFailure("canonical install target unexpectedly exists")
    # Execute the documented macOS/Linux installation primitives, rather than
    # using an in-process copy that could drift from the consumer quickstart.
    run(["install", "-d", "-m", "700", str(user_root)])
    run(["cp", "-R", str(unpacked_bundle), str(installed_bundle)])
    run(["chmod", "-R", "go-w", str(installed_bundle)])
    installed_manifest = json.loads((installed_bundle / "extension.json").read_text(encoding="utf-8"))
    installed_executable = installed_bundle / installed_manifest["executable"]
    run(["cmp", "-s", str(go_extension), str(installed_executable)])
    file_description = run(["file", "-b", str(installed_executable)]).stdout.strip()
    if "Mach-O" not in file_description:
        raise ProofFailure(f"canonical manifest target is not a precompiled Mach-O executable: {file_description}")
    if installed_manifest.get("executableSha256") != sha256(installed_executable):
        raise ProofFailure("installed manifest digest does not match its direct executable")
    environment = controlled_env(environment_home)
    diagnostics_case = execute_case(
        "canonical-current-user-diagnostics",
        CONSUMER_DIR / "opendesk",
        CONSUMER_DIR / "scripts" / "canonical-diagnostics.js",
        gate=True,
        env=environment,
    )
    diagnostics = marker_payload(diagnostics_case, "PLUGIN_CANONICAL_DIAGNOSTICS")
    if native_call_events(diagnostics_case):
        raise ProofFailure("canonical list/get/diagnostics started a child")
    current_plugins = [
        item for item in diagnostics.get("plugins", [])
        if item.get("id") == "com.example.go-basic"
    ]
    if len(current_plugins) != 1 or current_plugins[0].get("rootKind") != "current_user":
        raise ProofFailure(f"current-user root kind mismatch: {current_plugins}")
    if not any(
        item.get("rootKind") == "portable" and item.get("status") == "skipped" and
        item.get("errorCode") == "root_unavailable"
        for item in diagnostics.get("diagnostics", [])
    ):
        raise ProofFailure(f"missing publisher root was not harmless/diagnostic: {diagnostics}")

    case = execute_case(
        "canonical-current-user-quickstart",
        CONSUMER_DIR / "opendesk",
        CONSUMER_DIR / "scripts" / "quickstart.js",
        gate=True,
        env=environment,
    )
    expected = {"hello": {"message": "Hello OpenDesk"}, "sum": {"value": 42}}
    expected_json = json.dumps(expected, separators=(",", ":"), ensure_ascii=False)
    calls = native_call_events(case)
    call_fields = [event.get("fields", {}) for event in calls]
    if expected_json not in str(case["stdout"]) or [fields.get("method") for fields in call_fields] != ["hello", "add"]:
        raise ProofFailure(f"canonical current-user quickstart failed: {case['stdout']}")
    expected_executable_sha = sha256(go_extension)
    if any(
        fields.get("status") != "succeeded" or
        fields.get("rootKind") != "current_user" or
        fields.get("pluginId") != "com.example.go-basic" or
        fields.get("executableSha256") != expected_executable_sha
        for fields in call_fields
    ):
        raise ProofFailure(f"canonical quickstart call evidence is not bound to the direct release executable: {call_fields}")

    forbidden = [str(environment_home), str(installed_executable)]
    privacy_artifacts: list[dict[str, object]] = []
    for checked_case in (diagnostics_case, case):
        combined = (str(checked_case["stdout"]) + str(checked_case["stderr"])).encode("utf-8")
        for value in forbidden:
            if value.encode("utf-8") in combined:
                raise ProofFailure(f"canonical Runtime output leaked private path {value!r}")
        for artifact in sorted(Path(checked_case["logDir"]).rglob("*")):
            if not artifact.is_file():
                continue
            content = artifact.read_bytes()
            for value in forbidden:
                if value.encode("utf-8") in content:
                    raise ProofFailure(f"canonical persistent Runtime Evidence leaked private path in {artifact}")
            privacy_artifacts.append({"name": artifact.name, "sha256": hashlib.sha256(content).hexdigest()})

    forbidden_sources = [
        str(path.relative_to(installed_bundle))
        for path in installed_bundle.rglob("*")
        if path.is_file() and path.suffix.lower() in {
            ".go", ".swift", ".rs", ".c", ".cc", ".cpp", ".h", ".py",
            ".sh", ".command", ".bat", ".cmd", ".ps1",
        }
    ]
    if forbidden_sources:
        raise ProofFailure(f"canonical installed archive contains source: {forbidden_sources}")
    return {
        "status": "passed",
        "canonicalFormula": "$HOME/Library/Application Support/OpenDesk/NativeExtensions/",
        "rootKind": "current_user",
        "targetOS": "darwin",
        "targetArch": target_arch,
        "archiveName": archive.name,
        "archiveSha256": checksum,
        "archiveSizeBytes": archive.stat().st_size,
        "manifestSha256": sha256(installed_bundle / "extension.json"),
        "executableSha256": sha256(installed_executable),
        "authorExecutableSha256": sha256(go_extension),
        "manifestTargetsDirectPrecompiledExecutable": True,
        "instrumentedLauncherAbsent": True,
        "executableFormat": file_description,
        "inventory": release_inventory,
        "sourceIncluded": False,
        "schemaValidation": release_schema,
        "diagnosticsChildCount": 0,
        "callChildCount": len(calls),
        "callCountEvidence": "Runtime EventSink native_extension_call records",
        "result": expected,
        "diagnosticsDurationMs": diagnostics_case["durationMs"],
        "quickstartDurationMs": case["durationMs"],
        "privacy": {
            "status": "passed",
            "isolatedHomeAbsent": True,
            "absoluteExecutableAbsent": True,
            "artifactCount": len(privacy_artifacts),
            "artifacts": privacy_artifacts,
        },
    }


def assert_error_privacy(paths: dict[str, Path], environment: dict[str, str]) -> dict[str, object]:
    case = execute_case(
        "extension-error-privacy", PROOF_DIR / "opendesk", PROOF_DIR / "scripts" / "error-privacy.js",
        gate=True, env=environment, expect_success=False,
    )
    if child_count(paths["goMarker"]) != 6:
        raise ProofFailure("extension-error privacy case did not start exactly one fresh child")
    raw_message = "a and b are required"
    artifacts: list[dict[str, object]] = []
    digest_metadata = False
    for artifact in sorted(Path(case["logDir"]).rglob("*")):
        if artifact.is_symlink():
            raise ProofFailure(f"failure evidence contains a symlink: {artifact}")
        if not artifact.is_file():
            continue
        content = artifact.read_bytes()
        if raw_message.encode("utf-8") in content:
            raise ProofFailure(f"extension-controlled error message leaked into {artifact}")
        if b'"extensionMessageBytes"' in content and b'"extensionMessageSha256"' in content:
            digest_metadata = True
        artifacts.append({
            "path": str(artifact), "sizeBytes": len(content),
            "sha256": hashlib.sha256(content).hexdigest(),
        })
    returned = (str(case["stdout"]) + "\n" + str(case["stderr"])).encode("utf-8")
    if raw_message.encode("utf-8") in returned:
        raise ProofFailure("extension-controlled error message leaked into process output")
    if not digest_metadata:
        raise ProofFailure("extension error evidence lacks privacy-preserving length/hash metadata")
    return {
        "status": "passed", "exitCode": case["exitCode"],
        "rawMessageAbsent": True, "digestMetadataPresent": True,
        "artifacts": artifacts, "durationMs": case["durationMs"],
    }


def assert_app_bundled_root(paths: dict[str, Path], environment: dict[str, str]) -> dict[str, object]:
    dist = RUN_DIR / "app-proof"
    build_environment = dict(os.environ)
    build_environment.update({
        "DIST_DIR": str(dist),
        "NATIVE_EXTENSIONS_SOURCE": str(PROOF_DIR / "native-extensions"),
        "CODESIGN_IDENTITY": "-",
    })
    build = run([str(ROOT / "scripts" / "build_macos_app.sh")], env=build_environment, timeout=300)
    app = dist / "OpenDesk.app"
    verify = run(["codesign", "--verify", "--deep", "--strict", str(app)])
    binary = app / "Contents" / "MacOS" / "opendesk"
    external_real_executables = [
        next((paths[key] / "bin").glob("*.real"))
        for key in ("goBundle", "visionBundle")
    ]
    withheld: list[tuple[Path, Path]] = []
    try:
        for executable in external_real_executables:
            unavailable = executable.with_name(executable.name + ".unavailable")
            executable.rename(unavailable)
            withheld.append((unavailable, executable))
        case = execute_case("app-bundled-call", binary, PROOF_DIR / "scripts" / "app-call.js", gate=True, env=environment)
    finally:
        for unavailable, executable in reversed(withheld):
            unavailable.rename(executable)
    verify_after = run(["codesign", "--verify", "--deep", "--strict", str(app)])
    result = marker_payload(case, "PLUGIN_APP_CALL_RESULT")
    discovered = [item for item in result.get("listed", []) if item.get("id") == "com.example.go-basic"]
    if not discovered or any(item.get("rootKind") != "app_bundled" for item in discovered):
        raise ProofFailure(f"app-bundled root was not used: {discovered}")
    if result.get("hello") != {"message": "Hello Signed App"} or child_count(paths["goMarker"]) != 7:
        raise ProofFailure(f"app-bundled manifest-bound call failed: {result}")
    case["buildStdout"] = build.stdout
    case["codesignVerified"] = verify.returncode == 0 and verify_after.returncode == 0
    case["externalProofExecutablesWithheld"] = True
    case["appPath"] = str(app)
    return case


def assert_run_text_privacy() -> dict[str, object]:
    raw_message = b"a and b are required"
    checked: list[dict[str, object]] = []
    for artifact in sorted(RUN_DIR.rglob("*")):
        if not artifact.is_file() or artifact.suffix not in {".json", ".ndjson", ".log", ".txt"}:
            continue
        content = artifact.read_bytes()
        if raw_message in content:
            raise ProofFailure(f"extension-controlled error text leaked into persistent text evidence: {artifact}")
        relative = str(artifact.relative_to(RUN_DIR))
        if relative == "home-user" or relative.startswith("home-user/"):
            relative = relative.replace("home-user", "<isolated-profile>", 1)
        checked.append({"path": relative, "sha256": hashlib.sha256(content).hexdigest()})
    return {"status": "passed", "rawMessageAbsent": True, "textArtifactCount": len(checked), "artifacts": checked}


def assert_persistent_private_path_absence(forbidden: list[str]) -> dict[str, object]:
    checked = 0
    for artifact in sorted(RUN_DIR.rglob("*")):
        if not artifact.is_file() or artifact.suffix not in {".json", ".ndjson", ".log", ".txt"}:
            continue
        content = artifact.read_bytes()
        for value in forbidden:
            if value.encode("utf-8") in content:
                raise ProofFailure(f"persistent proof artifact leaked private Runtime path in {artifact}")
        checked += 1
    return {
        "status": "passed",
        "isolatedHomeAbsent": True,
        "absoluteCanonicalExecutableAbsent": True,
        "artifactCountBeforeFinalSummary": checked,
    }


def validate_evidence(smoke: dict[str, object], paths: dict[str, Path], home: Path) -> dict[str, object]:
    events = read_events(smoke)
    discovery = [event for event in events if event.get("kind") == "native_extension_discovery"]
    calls = [event for event in events if event.get("kind") == "native_extension_call"]
    discovered = [event for event in discovery if event.get("fields", {}).get("status") == "discovered"]
    if len(discovered) != 2:
        raise ProofFailure(f"expected two discovered portable plugins, got {len(discovered)}")
    if len(calls) != 3:
        raise ProofFailure(f"expected three manifest-bound call events, got {len(calls)}")
    if [event.get("fields", {}).get("method") for event in calls] != ["hello", "add", "ocr"]:
        raise ProofFailure(f"public method Evidence mismatch: {calls}")
    forbidden_values = [str(PROOF_DIR), str(home), str(paths["fixture"]), "Hello OpenDesk", "OPENDESK OCR 123"]
    for event in discovery + calls:
        fields = event.get("fields", {})
        encoded = json.dumps(fields, ensure_ascii=False)
        for forbidden in forbidden_values:
            if forbidden and forbidden in encoded:
                raise ProofFailure(f"privacy-minimized Native Extension Evidence leaked {forbidden!r}: {encoded}")
        for forbidden_key in ("params", "result", "stdout", "stderrSummary", "manifest", "environment"):
            if forbidden_key in fields:
                raise ProofFailure(f"Native Extension Evidence leaked field {forbidden_key}: {fields}")
    for event in calls:
        fields = event["fields"]
        if not isinstance(fields.get("stderrCapturedBytes"), int) or len(fields.get("stderrSha256", "")) != 64:
            raise ProofFailure(f"stderr privacy summary is incomplete: {fields}")
    resource_messages = [str(event.get("message", "")) for event in events if event.get("source") == "runtime"]
    expected_resources = [
        f"Using polyfills from: {PROOF_DIR / 'polyfills'}",
        f"Using jslibs from: {PROOF_DIR / 'jslibs'}",
    ]
    for expected in expected_resources:
        if expected not in resource_messages:
            raise ProofFailure(f"proof package resource provenance is missing {expected!r}")
    return {
        "eventLog": str(Path(smoke["logDir"]) / "events.ndjson"),
        "discoveryCount": len(discovery),
        "discoveredCount": len(discovered),
        "callCount": len(calls),
        "resourceProvenance": expected_resources,
        "discoveryDurationMs": [event["fields"].get("durationMs") for event in discovered],
        "calls": [event["fields"] for event in calls],
        "privacy": "passed",
    }


def inventory() -> dict[str, object]:
    result: list[dict[str, object]] = []
    forbidden_names = {".git", "automation", "pkg", "cmd"}
    forbidden_suffixes = {".c", ".cc", ".cpp", ".go", ".h", ".m", ".mm", ".py", ".rs", ".swift"}
    for path in sorted(PROOF_DIR.rglob("*")):
        relative = path.relative_to(PROOF_DIR)
        if any(part in forbidden_names for part in relative.parts):
            raise ProofFailure(f"proof contains forbidden source tree: {relative}")
        if path.is_symlink():
            raise ProofFailure(f"proof contains a symlink: {relative}")
        if path.is_file():
            if path.suffix in forbidden_suffixes:
                raise ProofFailure(f"proof contains extension/Core source: {relative}")
            result.append({"path": str(relative), "sizeBytes": path.stat().st_size, "sha256": sha256(path)})
    return {
        "status": "passed", "symlinks": [], "forbiddenImplementationSources": [],
        "fileCount": len(result), "files": result,
    }


def validate_documentation() -> dict[str, object]:
    user_doc = (ROOT / "docs/api" / "native-extension.md").read_text(encoding="utf-8")
    examples_doc = (ROOT / "examples" / "native-extensions" / "README.md").read_text(encoding="utf-8")
    implementation_doc = (
        ROOT / "docs" / "implementation" / "runtime" / "native-extension-plugin-discovery.md"
    ).read_text(encoding="utf-8")
    user_first = user_doc.split("## 日常 JavaScript API", 1)[0]
    examples_first = examples_doc.split("## Example bundles and responsibilities", 1)[0]
    requirements = {
        "user": [
            "预编译 bundle", "extension.json", "Application Support/OpenDesk/NativeExtensions",
            "function main()", "-experimental-native-extension",
            '{"hello":{"message":"Hello OpenDesk"},"sum":{"value":42}}',
            "NativeExtensions.diagnostics()",
        ],
        "examples": [
            "precompiled", "extension.json", "Application Support/OpenDesk/NativeExtensions",
            "function main()", "-experimental-native-extension",
            '{"hello":{"message":"Hello OpenDesk"},"sum":{"value":42}}',
            "NativeExtensions.diagnostics()",
        ],
    }
    for label, first in (("user", user_first), ("examples", examples_first)):
        positions = [first.find(token) for token in requirements[label]]
        if any(position < 0 for position in positions) or positions != sorted(positions):
            raise ProofFailure(f"{label} consumer workflow is incomplete or out of order: {positions}")
        for forbidden in ("go build", "swiftc -O", '"wireMethod"'):
            if forbidden in first:
                raise ProofFailure(f"{label} consumer workflow leaked author/transport step {forbidden!r}")
        if re.search(r"(^|\s)-native-extension(?:\s|$)", first):
            raise ProofFailure(f"{label} consumer workflow leaked the low-level direct Host flag")

    combined = "\n".join((user_doc, examples_doc, implementation_doc))
    for stale in (
        "os.UserConfigDir()/OpenDesk/NativeExtensions",
        "Linux/Windows 的 current-user root 以 Go `os.UserConfigDir()`",
    ):
        if stale in combined:
            raise ProofFailure(f"documentation retains stale config-root contract: {stale}")
    required_contracts = (
        "${XDG_DATA_HOME:-$HOME/.local/share}/OpenDesk/NativeExtensions/",
        "%LOCALAPPDATA%\\OpenDesk\\NativeExtensions\\",
        "Machine-wide root：Not Implemented",
        "不会被自动复制、移动、合并或删除",
        "go build -trimpath -buildvcs=false",
        "cargo build --release",
        "cmake --build",
        "validator_for",
        "unrelated cwd",
    )
    missing = [token for token in required_contracts if token not in combined]
    if missing:
        raise ProofFailure(f"documentation contract is incomplete: {missing}")
    quickstart = (ROOT / "examples" / "native-extensions" / "quickstart.js").read_text(encoding="utf-8")
    for token in (
        "function main()", "NativeExtensions.goBasic.hello", "NativeExtensions.goBasic.add",
        "JSON.stringify({ hello, sum })", "main();",
    ):
        if token not in quickstart:
            raise ProofFailure(f"maintained quickstart is missing {token!r}")
    return {
        "status": "passed",
        "consumerFirst": True,
        "pathContractsMatch": True,
        "machineWideStatus": "Not Implemented",
        "migrationIsExplicitAndNonDestructive": True,
        "authorConsumerMaintainerSeparated": True,
        "checkedFiles": {
            "docs/api/native-extension.md": sha256(ROOT / "docs/api" / "native-extension.md"),
            "examples/native-extensions/README.md": sha256(ROOT / "examples" / "native-extensions" / "README.md"),
            "examples/native-extensions/quickstart.js": sha256(ROOT / "examples" / "native-extensions" / "quickstart.js"),
            "docs/implementation/runtime/native-extension-plugin-discovery.md": sha256(
                ROOT / "docs" / "implementation" / "runtime" / "native-extension-plugin-discovery.md"
            ),
        },
    }


def main() -> int:
    RUN_DIR.mkdir(parents=True, mode=0o700)
    branch_before = run(["git", "branch", "--show-current"]).stdout.strip()
    head_before = run(["git", "rev-parse", "HEAD"]).stdout.strip()
    source_before = source_snapshot()
    opendesk, go_extension, vision_extension = build_artifacts()
    documentation = validate_documentation()
    source_schema = validate_manifest_schema([
        ROOT / "examples" / "native-extensions" / "go-basic" / "extension.json",
        ROOT / "examples" / "native-extensions" / "macos-vision" / "extension.json",
    ])
    author_wire = assert_author_wire_test(go_extension)
    cross_compile = cross_compile_artifacts()
    paths = prepare_proof(opendesk, go_extension, vision_extension)
    empty_home = RUN_DIR / "home-empty"
    environment = controlled_env(empty_home)
    disabled, list_only = assert_inert_cases(paths, environment)
    smoke, again, result = assert_smoke(paths, environment)
    packaged_quickstart = assert_packaged_quickstart(paths, environment)
    current_user = assert_current_user_root(opendesk, go_extension, RUN_DIR / "home-user")
    error_privacy = assert_error_privacy(paths, environment)
    app_bundled = assert_app_bundled_root(paths, environment)
    evidence = validate_evidence(smoke, paths, empty_home)
    package_inventory = inventory()
    source_after = source_snapshot()
    branch_after = run(["git", "branch", "--show-current"]).stdout.strip()
    head_after = run(["git", "rev-parse", "HEAD"]).stdout.strip()
    changes = snapshot_changes(source_before, source_after)
    source_record = {
        "branchBefore": branch_before, "branchAfter": branch_after,
        "headBefore": head_before, "headAfter": head_after,
        "inputCount": len(source_before), "changes": changes,
        "before": source_before, "after": source_after,
    }
    (RUN_DIR / "source-input-snapshot.json").write_text(
        json.dumps(source_record, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )
    if branch_before != branch_after or head_before != head_after or changes:
        raise ProofFailure(
            "source inputs changed during proof: " +
            json.dumps({"branchBefore": branch_before, "branchAfter": branch_after,
                        "headBefore": head_before, "headAfter": head_after,
                        "changes": changes}, ensure_ascii=False)
        )
    git_dirty = bool(run(["git", "status", "--porcelain"]).stdout.strip())
    commands_path = RUN_DIR / "commands.ndjson"
    commands_path.write_text(
        "".join(json.dumps(command, ensure_ascii=False) + "\n" for command in COMMANDS), encoding="utf-8"
    )
    run_text_privacy = assert_run_text_privacy()
    run_text_privacy["finalSummaryCheckedBeforeWrite"] = True
    private_path_privacy = assert_persistent_private_path_absence([
        str(RUN_DIR / "home-user"),
        str(
            RUN_DIR / "home-user" / "Library" / "Application Support" / "OpenDesk" /
            "NativeExtensions" / "com.example.go-basic" / "bin" / "native-ext-go-basic"
        ),
    ])
    summary = {
        "schemaVersion": "1.0.1",
        "status": "passed",
        "runId": RUN_ID,
        "runDir": str(RUN_DIR),
        "branch": branch_after,
        "head": head_after,
        "gitDirty": git_dirty,
        "proof": {
            "path": str(PROOF_DIR), "workingDirectory": str(EMPTY_CWD),
            "runtimeSourceAudit": package_inventory,
            "opendeskSha256": sha256(PROOF_DIR / "opendesk"),
            "resolvedBundles": [
                {
                    "pluginId": json.loads((bundle / "extension.json").read_text(encoding="utf-8"))["id"],
                    "bundle": str(bundle.relative_to(PROOF_DIR)),
                    "executable": json.loads((bundle / "extension.json").read_text(encoding="utf-8"))["executable"],
                }
                for bundle in (paths["goBundle"], paths["visionBundle"])
            ],
        },
        "roots": {
            "publisherPortable": "passed",
            "publisherAppBundled": "passed",
            "canonicalCurrentUser": current_user,
            "machineWide": {
                "status": "Not Implemented",
                "reason": "Unix admin-only policy and Windows owner/DACL/reparse trust gates are incomplete",
            },
            "legacyMigration": {
                "linuxConfigScanned": False,
                "windowsRoamingScanned": False,
                "automaticMoveCopyMergeDelete": False,
            },
        },
        "inert": {
            "defaultGlobalAbsent": True, "defaultChildCount": 0,
            "listGetDiagnosticsChildCount": 0, "thirdPartyFacadeExecuted": False,
            "disabledDurationMs": disabled["durationMs"], "listDurationMs": list_only["durationMs"],
        },
        "results": result,
        "children": {
            "goTotal": child_count(paths["goMarker"]),
            "goExpectedBreakdown": {"smoke": 2, "laterHello": 1, "packagedQuickstart": 2, "privacyFailure": 1, "appBundledHello": 1},
            "visionAfterOCR": child_count(paths["visionMarker"]),
        },
        "failurePrivacy": error_privacy,
        "persistentTextPrivacy": run_text_privacy,
        "persistentPathPrivacy": private_path_privacy,
        "signedApp": {
            "path": app_bundled["appPath"], "codesignVerified": app_bundled["codesignVerified"],
            "binarySha256": sha256(Path(app_bundled["appPath"]) / "Contents" / "MacOS" / "opendesk"),
            "buildOutput": app_bundled["buildStdout"], "manifestBoundCall": "passed",
            "externalProofExecutablesWithheld": app_bundled["externalProofExecutablesWithheld"],
        },
        "crossCompile": cross_compile,
        "authorBuild": AUTHOR_BUILD_EVIDENCE,
        "authorWireTest": author_wire,
        "schemaValidation": source_schema,
        "documentationAcceptance": documentation,
        "platformVerification": {
            "darwin": {"runtimeVerified": True, "packageVerified": True},
            "linux": {"runtimeVerified": False, "packageVerified": True, "status": "compile/package only"},
            "windows": {"runtimeVerified": False, "packageVerified": True, "status": "compile/package only"},
        },
        "performance": {
            "smokeTotalMs": smoke["durationMs"], "laterHelloTotalMs": again["durationMs"],
            "packagedQuickstartMs": packaged_quickstart["durationMs"],
            "currentUserDiagnosticsMs": current_user["diagnosticsDurationMs"],
            "currentUserQuickstartMs": current_user["quickstartDurationMs"],
            "appBundledCallMs": app_bundled["durationMs"],
            "callEvidence": evidence["calls"], "discoveryDurationMs": evidence["discoveryDurationMs"],
        },
        "evidence": evidence,
        "sourceInputSnapshot": {
            "path": str(RUN_DIR / "source-input-snapshot.json"),
            "inputCount": len(source_before), "changes": [], "status": "passed",
        },
        "commandTranscript": {"path": str(commands_path), "count": len(COMMANDS)},
    }
    summary_path = RUN_DIR / "summary.json"
    summary_text = json.dumps(summary, indent=2, ensure_ascii=False) + "\n"
    if "a and b are required" in summary_text:
        raise ProofFailure("extension-controlled error text leaked into final proof summary")
    for forbidden in (
        str(RUN_DIR / "home-user"),
        str(
            RUN_DIR / "home-user" / "Library" / "Application Support" / "OpenDesk" /
            "NativeExtensions" / "com.example.go-basic" / "bin" / "native-ext-go-basic"
        ),
    ):
        if forbidden in summary_text:
            raise ProofFailure("final proof summary leaked a private Runtime path")
    summary_path.write_text(summary_text, encoding="utf-8")
    print(json.dumps(summary, indent=2, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (ProofFailure, subprocess.TimeoutExpired) as error:
        failure = {"status": "failed", "runId": RUN_ID, "runDir": str(RUN_DIR), "error": str(error)}
        RUN_DIR.mkdir(parents=True, exist_ok=True)
        (RUN_DIR / "failure.json").write_text(json.dumps(failure, indent=2) + "\n", encoding="utf-8")
        print(json.dumps(failure, indent=2), file=sys.stderr)
        raise SystemExit(1)
