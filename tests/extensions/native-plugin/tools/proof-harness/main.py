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


def sha256_text(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def worktree_snapshot() -> dict[str, object]:
    """Record every version-controlled delta and untracked file without writing it."""
    branch = run(["git", "branch", "--show-current"]).stdout.strip()
    head = run(["git", "rev-parse", "HEAD"]).stdout.strip()
    index_tree = run(["git", "write-tree"]).stdout.strip()
    status = run(["git", "status", "--porcelain=v1", "--untracked-files=all"]).stdout
    unstaged = run(["git", "diff", "--no-ext-diff", "--binary"]).stdout
    staged = run(["git", "diff", "--cached", "--no-ext-diff", "--binary"]).stdout
    untracked_paths = [
        value for value in run(["git", "ls-files", "--others", "--exclude-standard", "-z"]).stdout.split("\0")
        if value
    ]
    untracked: dict[str, dict[str, object]] = {}
    for relative in sorted(untracked_paths):
        path = ROOT / relative
        if path.is_symlink():
            untracked[relative] = {
                "type": "symlink", "target": os.readlink(path), "mode": oct(path.lstat().st_mode & 0o777),
            }
        elif path.is_file():
            untracked[relative] = {
                "type": "file", "sha256": sha256(path), "sizeBytes": path.stat().st_size,
                "mode": oct(path.stat().st_mode & 0o777),
            }
        else:
            untracked[relative] = {"type": "other"}
    return {
        "branch": branch,
        "head": head,
        "indexTree": index_tree,
        "statusSha256": sha256_text(status),
        "unstagedDiffSha256": sha256_text(unstaged),
        "stagedDiffSha256": sha256_text(staged),
        "untracked": untracked,
    }


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
        ROOT / "examples" / "README.md",
        ROOT / "examples" / "native-extensions" / "macos-vision" / "main.swift",
        ROOT / "examples" / "native-extensions" / "macos-vision" / "extension.json",
        ROOT / "examples" / "native-extensions" / "macos-vision" / "types" / "index.d.ts",
        ROOT / "tests" / "extensions" / "native-process" / "fixtures" / "ocr" / "opendesk-ocr-123.png",
        ROOT / "tests" / "extensions" / "native-process" / "fixtures" / "ocr" / "manifest.json",
        ROOT / "examples" / "native-extensions" / "quickstart.js",
        ROOT / "examples" / "native-extensions" / "ocr-quickstart.js",
        ROOT / "tests" / "extensions" / "native-plugin" / "tools" / "proof-harness" / "main.py",
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
        ROOT / "prompts" / "runtime" / "native-extension-current-macos-revalidation-goal.md",
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
    # Match the documented plugin-author invocation, including the isolated
    # plugin working directory and reproducible build flags.
    run(["go", "-C", str(go_author), "build", "-trimpath", "-buildvcs=false", "-o", str(go_extension), "."])
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


def run_macos_security_gates() -> dict[str, object]:
    packages = [
        "./pkg/nativeextension", "./automation", "./pkg/http",
        "./pkg/mcpserver", "./pkg/execution", "./cmd/opendesk",
    ]
    completed = run(["go", "test", *packages, "-count=1"], timeout=300)
    return {
        "status": "passed",
        "packages": packages,
        "stdoutSha256": hashlib.sha256(completed.stdout.encode("utf-8")).hexdigest(),
        "stderrSha256": hashlib.sha256(completed.stderr.encode("utf-8")).hexdigest(),
    }


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
        "resultMatched": True,
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
    shutil.copy2(ROOT / "examples" / "native-extensions" / "quickstart.js", CONSUMER_DIR / "quickstart.js")
    shutil.copy2(ROOT / "examples" / "native-extensions" / "ocr-quickstart.js", CONSUMER_DIR / "ocr-quickstart.js")
    shutil.copy2(
        ROOT / "tests" / "extensions" / "native-process" / "fixtures" / "ocr" / "opendesk-ocr-123.png",
        CONSUMER_DIR / "ocr-test.png",
    )
    shutil.copy2(DOMAIN / "canonical-diagnostics.js", scripts / "canonical-diagnostics.js")


def controlled_env(home: Path) -> dict[str, str]:
    home.mkdir(parents=True, exist_ok=True, mode=0o700)
    environment = dict(os.environ)
    environment["HOME"] = str(home)
    environment["SKIP_FYNE_INIT"] = "1"
    return environment


def execute_case(
    name: str, binary: Path, script: Path, *, gate: bool, env: dict[str, str],
    expect_success: bool = True, cwd: Path | None = None, public_program_command: bool = False,
) -> dict[str, object]:
    log_dir = RUN_DIR / "cases" / name
    run_cwd = cwd or EMPTY_CWD
    if public_program_command:
        if binary != run_cwd / "opendesk" or script.parent != run_cwd or script.name not in {"quickstart.js", "ocr-quickstart.js"}:
            raise ProofFailure("public program command must use ./opendesk and a documented script in the program directory")
        command = ["./opendesk", "-script", f"./{script.name}", "-console-mode", "script", "-timeout", "2", "-log-dir", str(log_dir)]
    else:
        command = [
            str(binary), "-script", str(script), "-console-mode", "script",
            "-timeout", "2", "-log-dir", str(log_dir),
        ]
    # Local CLI discovery is the default product path. The argument is retained
    # only to keep older proof call sites mechanically readable; it has no
    # capability effect and is never added to a user-facing command.
    started = time.perf_counter()
    completed = run(command, cwd=run_cwd, env=env, timeout=120, check=expect_success)
    if not expect_success and completed.returncode == 0:
        raise ProofFailure(f"{name} unexpectedly succeeded")
    duration_ms = round((time.perf_counter() - started) * 1000, 3)
    return {
        "name": name,
        "command": command,
        "cwd": str(run_cwd),
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
    disabled = execute_case("default-discovery", PROOF_DIR / "opendesk", PROOF_DIR / "scripts" / "disabled.js", gate=False, env=environment)
    payload = marker_payload(disabled, "PLUGIN_DEFAULT_RESULT")
    if payload.get("globalPresent") is not True or sorted(payload.get("plugins", [])) != ["com.example.go-basic", "com.example.macos-vision"]:
        raise ProofFailure(f"unexpected default discovery result: {payload}")
    if child_count(paths["goMarker"]) or child_count(paths["visionMarker"]):
        raise ProofFailure("default CLI discovery started an extension child")

    list_only = execute_case("list-only", PROOF_DIR / "opendesk", PROOF_DIR / "scripts" / "list-only.js", gate=False, env=environment)
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


def assert_current_user_root(
    opendesk: Path, go_extension: Path, vision_extension: Path, environment_home: Path, author_wire: dict[str, object],
) -> dict[str, object]:
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
    author_digest = run(["shasum", "-a", "256", str(release_executable)]).stdout.split()[0]
    if author_digest != release_manifest.get("executableSha256"):
        raise ProofFailure("documented author digest does not match the staged manifest")
    archive_dir = RUN_DIR / "publisher-archives"
    archive_dir.mkdir(mode=0o700)
    target_arch = run(["uname", "-m"]).stdout.strip()
    if not re.fullmatch(r"[A-Za-z0-9_.-]+", target_arch):
        raise ProofFailure(f"unexpected Darwin architecture name: {target_arch!r}")
    archive = archive_dir / f"com.example.go-basic_0.1.0_darwin-{target_arch}.tar.gz"
    run(["tar", "-czf", str(archive), "-C", str(release_root), release_bundle.name])
    checksum_file = archive_dir / "checksums.txt"
    run(
        ["sh", "-c", "shasum -a 256 \"$1\" > checksums.txt", "sh", archive.name],
        cwd=archive_dir,
    )
    checksum_validation = run(["shasum", "-a", "256", "-c", checksum_file.name], cwd=archive_dir)
    if f"{archive.name}: OK" not in checksum_validation.stdout:
        raise ProofFailure(f"publisher checksum verification did not report success: {checksum_validation.stdout}")
    checksum = checksum_file.read_text(encoding="utf-8").split()[0]
    if checksum != sha256(archive):
        raise ProofFailure("publisher archive checksum command disagreed with proof hash")

    unpack_root = RUN_DIR / "consumer-unpacked"
    unpack_root.mkdir(mode=0o700)
    run(["tar", "-xzf", str(archive), "-C", str(unpack_root)])
    unpacked_bundle = unpack_root / release_bundle.name
    program_root = CONSUMER_DIR / "native-extensions"
    installed_bundle = program_root / release_bundle.name
    if installed_bundle.exists():
        raise ProofFailure("program-relative install target unexpectedly exists")
    # Execute the documented program-relative installation primitives, rather
    # than using an in-process copy that could drift from the public quickstart.
    run(["install", "-d", "-m", "700", str(program_root)])
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
        "program-relative-diagnostics",
        CONSUMER_DIR / "opendesk",
        CONSUMER_DIR / "scripts" / "canonical-diagnostics.js",
        gate=False,
        env=environment,
    )
    diagnostics = marker_payload(diagnostics_case, "PLUGIN_CANONICAL_DIAGNOSTICS")
    if native_call_events(diagnostics_case):
        raise ProofFailure("program-relative list/get/diagnostics started a child")
    current_plugins = [
        item for item in diagnostics.get("plugins", [])
        if item.get("id") == "com.example.go-basic"
    ]
    if len(current_plugins) != 1 or current_plugins[0].get("rootKind") != "portable":
        raise ProofFailure(f"program-relative root kind mismatch: {current_plugins}")

    case = execute_case(
        "program-relative-quickstart",
        CONSUMER_DIR / "opendesk",
        CONSUMER_DIR / "quickstart.js",
        gate=False,
        env=environment,
        cwd=CONSUMER_DIR,
        public_program_command=True,
    )
    expected = {"hello": {"message": "Hello OpenDesk"}, "sum": {"value": 42}}
    expected_json = json.dumps(expected, separators=(",", ":"), ensure_ascii=False)
    calls = native_call_events(case)
    call_fields = [event.get("fields", {}) for event in calls]
    if expected_json not in str(case["stdout"]) or [fields.get("method") for fields in call_fields] != ["hello", "add"]:
        raise ProofFailure(f"program-relative quickstart failed: {case['stdout']}")
    expected_executable_sha = sha256(go_extension)
    if any(
        fields.get("status") != "succeeded" or
        fields.get("rootKind") != "portable" or
        fields.get("pluginId") != "com.example.go-basic" or
        fields.get("executableSha256") != expected_executable_sha
        for fields in call_fields
    ):
        raise ProofFailure(f"program-relative quickstart call evidence is not bound to the direct release executable: {call_fields}")

    # The OCR fixture is caller input, not bundle content. Install the second
    # manifest-bound executable beside the ordinary Go bundle, then run the
    # exact public OCR command from the documented program directory.
    vision_bundle = install_bundle(
        program_root,
        source_manifest=ROOT / "examples" / "native-extensions" / "macos-vision" / "extension.json",
        real_executable=vision_extension,
        marker=None,
    )
    run(["chmod", "-R", "go-w", str(vision_bundle)])
    vision_manifest = json.loads((vision_bundle / "extension.json").read_text(encoding="utf-8"))
    vision_executable = vision_bundle / vision_manifest["executable"]
    if vision_manifest.get("executableSha256") != sha256(vision_extension):
        raise ProofFailure("OCR manifest digest does not bind the author-built executable")
    if sha256(vision_executable) != sha256(vision_extension):
        raise ProofFailure("program-relative OCR executable differs from the author-built executable")
    ocr_case = execute_case(
        "program-relative-ocr-quickstart",
        CONSUMER_DIR / "opendesk",
        CONSUMER_DIR / "ocr-quickstart.js",
        gate=False,
        env=environment,
        cwd=CONSUMER_DIR,
        public_program_command=True,
    )
    expected_ocr = {"text": "OPENDESK OCR 123\n你好 456"}
    ocr_fields = [event.get("fields", {}) for event in native_call_events(ocr_case)]
    ocr_agent_summary = json.loads((Path(ocr_case["logDir"]) / "agent_summary.json").read_text(encoding="utf-8"))
    ocr_console_messages = [entry.get("message") for entry in ocr_agent_summary.get("scriptLogs", [])]
    if json.dumps(expected_ocr, separators=(",", ":"), ensure_ascii=False) not in ocr_console_messages or [fields.get("method") for fields in ocr_fields] != ["ocr"]:
        raise ProofFailure(f"program-relative OCR quickstart failed: {ocr_case['stdout']}")
    if any(
        fields.get("status") != "succeeded" or
        fields.get("rootKind") != "portable" or
        fields.get("pluginId") != "com.example.macos-vision" or
        fields.get("executableSha256") != sha256(vision_extension)
        for fields in ocr_fields
    ):
        raise ProofFailure(f"program-relative OCR quickstart evidence is not manifest-bound: {ocr_fields}")

    forbidden = [str(environment_home), str(installed_executable), str(vision_executable), str(CONSUMER_DIR / "ocr-test.png")]
    privacy_artifacts: list[dict[str, object]] = []
    for checked_case in (diagnostics_case, case, ocr_case):
        combined = (str(checked_case["stdout"]) + str(checked_case["stderr"])).encode("utf-8")
        for value in forbidden:
            if value.encode("utf-8") in combined:
                raise ProofFailure(f"program-relative Runtime output leaked private path {value!r}")
        for artifact in sorted(Path(checked_case["logDir"]).rglob("*")):
            if not artifact.is_file():
                continue
            content = artifact.read_bytes()
            for value in forbidden:
                if value.encode("utf-8") in content:
                    raise ProofFailure(f"program-relative persistent Runtime Evidence leaked private path in {artifact}")
            privacy_artifacts.append({"name": artifact.name, "sha256": hashlib.sha256(content).hexdigest()})

    forbidden_sources = [
        str(path.relative_to(bundle))
        for bundle in (installed_bundle, vision_bundle)
        for path in bundle.rglob("*")
        if path.is_file() and path.suffix.lower() in {
            ".go", ".swift", ".rs", ".c", ".cc", ".cpp", ".h", ".py",
            ".sh", ".command", ".bat", ".cmd", ".ps1",
        }
    ]
    if forbidden_sources:
        raise ProofFailure(f"program-relative installed archive contains source: {forbidden_sources}")
    return {
        "status": "passed",
        "canonicalFormula": "<program-directory>/native-extensions/",
        "rootKind": "portable",
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
        "authorWorkflow": {
            "goReleaseBuild": AUTHOR_BUILD_EVIDENCE["go"],
            "wireTest": author_wire,
            "manifestDigest": {"status": "passed", "sha256": author_digest},
            "schemaValidation": release_schema,
            "archiveChecksum": {
                "status": "passed", "file": checksum_file.name,
                "sha256": checksum, "verifiedBy": "shasum -a 256 -c checksums.txt",
            },
            "installedSmoke": {"status": "passed", "workingDirectory": "program-directory"},
        },
        "diagnosticsChildCount": 0,
        "callChildCount": len(calls),
        "callCountEvidence": "Runtime EventSink native_extension_call records",
        "resultMatched": True,
        "documentedOCR": {
            "status": "passed", "fixture": "ocr-test.png", "resultMatched": True,
            "fixtureSha256": sha256(CONSUMER_DIR / "ocr-test.png"),
            "executableSha256": sha256(vision_executable),
        },
        "diagnosticsDurationMs": diagnostics_case["durationMs"],
        "quickstartDurationMs": case["durationMs"],
        "ocrQuickstartDurationMs": ocr_case["durationMs"],
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
    user_boundary = re.search(
        r"^## (?:NativeExtensions：)?日常 JavaScript API\s*$", user_doc, re.MULTILINE
    )
    if user_boundary is None:
        raise ProofFailure("user documentation is missing the daily JavaScript API section boundary")
    examples_boundary = re.search(
        r"^## Example bundles and responsibilities\s*$", examples_doc, re.MULTILINE
    )
    if examples_boundary is None:
        raise ProofFailure("examples documentation is missing the responsibility section boundary")
    user_first = user_doc[:user_boundary.start()]
    examples_first = examples_doc[:examples_boundary.start()]
    requirements = {
        "user": [
            "插件作者", "程序相对目录", "extension.json",
            "function main()", "./opendesk -script ./quickstart.js",
            '{"hello":{"message":"Hello OpenDesk"},"sum":{"value":42}}',
            "NativeExtensions.diagnostics()",
        ],
        "examples": [
            "plugin author", "extension.json", "program-relative",
            "quickstart.js", "./opendesk -script ./quickstart.js",
            '{"hello":{"message":"Hello OpenDesk"},"sum":{"value":42}}',
            "NativeExtensions.diagnostics()",
        ],
    }
    for label, first in (("user", user_first), ("examples", examples_first)):
        positions = [first.find(token) for token in requirements[label]]
        if any(position < 0 for position in positions) or positions != sorted(positions):
            raise ProofFailure(f"{label} consumer workflow is incomplete or out of order: {positions}")
        if re.search(r"(^|\s)-experimental-native-extension(?:\s|$)", first):
            raise ProofFailure(f"{label} default CLI workflow still requires the experimental flag")

    combined = "\n".join((user_doc, examples_doc, implementation_doc))
    for stale in (
        "$HOME/Library/Application Support/OpenDesk/NativeExtensions",
        "${XDG_DATA_HOME:-$HOME/.local/share}/OpenDesk/NativeExtensions",
        "%LOCALAPPDATA%\\OpenDesk\\NativeExtensions",
    ):
        if stale in combined:
            raise ProofFailure(f"documentation retains stale config-root contract: {stale}")
    required_contracts = (
        "<program-directory>/native-extensions/",
        "OpenDesk.app/Contents/Resources/NativeExtensions/",
        "HTTP, MCP",
        "也不会自动迁移、复制、合并或删除",
        "go build -trimpath -buildvcs=false",
        "cargo build --release",
        "cmake --build",
        "validator_for",
        "Not Evaluated",
        "Not Published / Not Verified",
        "examples/native-extensions/go-basic/main.go",
        "examples/native-extensions/go-basic/go.mod",
        "examples/native-extensions/quickstart.js",
        "examples/native-extensions/ocr-quickstart.js",
        "opendesk-ocr-123.png",
    )
    missing = [token for token in required_contracts if token not in combined]
    if missing:
        raise ProofFailure(f"documentation contract is incomplete: {missing}")
    required_links = {
        ROOT / "docs/api" / "native-extension.md": (
            "../../examples/native-extensions/README.md",
            "../../examples/native-extensions/quickstart.js",
            "../../examples/native-extensions/ocr-quickstart.js",
            "../../tests/extensions/native-process/fixtures/ocr/opendesk-ocr-123.png",
        ),
        ROOT / "docs/api" / "index.md": (
            "../../examples/native-extensions/README.md",
            "../../examples/native-extensions/quickstart.js",
        ),
        ROOT / "docs/api" / "README.md": (
            "../../examples/native-extensions/README.md",
            "../../examples/native-extensions/quickstart.js",
        ),
        ROOT / "examples" / "README.md": (
            "native-extensions/README.md",
            "native-extensions/quickstart.js",
        ),
    }
    for path, links in required_links.items():
        content = path.read_text(encoding="utf-8")
        missing_links = [link for link in links if link not in content]
        if missing_links:
            raise ProofFailure(f"required Native Extension example links are missing from {path}: {missing_links}")
    quickstart = (ROOT / "examples" / "native-extensions" / "quickstart.js").read_text(encoding="utf-8")
    for token in (
        "function main()", "NativeExtensions.goBasic.hello", "NativeExtensions.goBasic.add",
        "JSON.stringify({ hello, sum })", "main();",
    ):
        if token not in quickstart:
            raise ProofFailure(f"maintained quickstart is missing {token!r}")
    ocr_quickstart = (ROOT / "examples" / "native-extensions" / "ocr-quickstart.js").read_text(encoding="utf-8")
    for token in (
        "function copyOCRImageIfNeeded()", "function resolveOCRImagePath()",
        "function main()", "NativeExtensions.macosVision.ocr", "File.path(destinationName)",
        "File.copy(source, destination)",
        "./ocr-test.jpg", "./ocr-test.png", "./dist/ocr-test.jpg", "./dist/ocr-test.png",
        "./examples/native-extensions/ocr-test.jpg",
        "File.exists(candidate)",
        "JSON.stringify({ text: ocr.text })", "main();",
    ):
        if token not in ocr_quickstart:
            raise ProofFailure(f"maintained OCR quickstart is missing {token!r}")
    return {
        "status": "passed",
        "consumerFirst": False,
        "pluginAuthorFirst": True,
        "pathContractsMatch": True,
        "defaultRoot": "program_relative_only",
        "migrationIsExplicitAndNonDestructive": True,
        "authorConsumerMaintainerSeparated": True,
        "checkedFiles": {
            "docs/api/native-extension.md": sha256(ROOT / "docs/api" / "native-extension.md"),
            "docs/api/index.md": sha256(ROOT / "docs/api" / "index.md"),
            "docs/api/README.md": sha256(ROOT / "docs/api" / "README.md"),
            "examples/README.md": sha256(ROOT / "examples" / "README.md"),
            "examples/native-extensions/README.md": sha256(ROOT / "examples" / "native-extensions" / "README.md"),
            "examples/native-extensions/quickstart.js": sha256(ROOT / "examples" / "native-extensions" / "quickstart.js"),
            "examples/native-extensions/ocr-quickstart.js": sha256(ROOT / "examples" / "native-extensions" / "ocr-quickstart.js"),
            "docs/implementation/runtime/native-extension-plugin-discovery.md": sha256(
                ROOT / "docs" / "implementation" / "runtime" / "native-extension-plugin-discovery.md"
            ),
        },
    }


def main() -> int:
    arguments = sys.argv[1:]
    if arguments not in ([], ["--host-only"]):
        raise ProofFailure("usage: python3 tests/extensions/native-plugin/tools/proof-harness/main.py [--host-only]")
    host_only = arguments == ["--host-only"]
    RUN_DIR.mkdir(parents=True, mode=0o700)
    branch_before = run(["git", "branch", "--show-current"]).stdout.strip()
    head_before = run(["git", "rev-parse", "HEAD"]).stdout.strip()
    worktree_before = worktree_snapshot()
    source_before = source_snapshot()
    security_go_tests = run_macos_security_gates()
    opendesk, go_extension, vision_extension = build_artifacts()
    documentation = validate_documentation()
    source_schema = validate_manifest_schema([
        ROOT / "examples" / "native-extensions" / "go-basic" / "extension.json",
        ROOT / "examples" / "native-extensions" / "macos-vision" / "extension.json",
    ])
    author_wire = assert_author_wire_test(go_extension)
    # The macOS revalidation entry point must not build, package, or score
    # other operating systems. Keep the broader cross-target audit available
    # only to an explicitly non-host-only invocation.
    cross_compile = None if host_only else cross_compile_artifacts()
    paths = prepare_proof(opendesk, go_extension, vision_extension)
    empty_home = RUN_DIR / "home-empty"
    environment = controlled_env(empty_home)
    disabled, list_only = assert_inert_cases(paths, environment)
    smoke, again, result = assert_smoke(paths, environment)
    packaged_quickstart = assert_packaged_quickstart(paths, environment)
    current_user = assert_current_user_root(opendesk, go_extension, vision_extension, RUN_DIR / "home-user", author_wire)
    error_privacy = assert_error_privacy(paths, environment)
    app_bundled = assert_app_bundled_root(paths, environment)
    evidence = validate_evidence(smoke, paths, empty_home)
    package_inventory = inventory()
    source_after = source_snapshot()
    branch_after = run(["git", "branch", "--show-current"]).stdout.strip()
    head_after = run(["git", "rev-parse", "HEAD"]).stdout.strip()
    worktree_after = worktree_snapshot()
    changes = snapshot_changes(source_before, source_after)
    source_record = {
        "branchBefore": branch_before, "branchAfter": branch_after,
        "headBefore": head_before, "headAfter": head_after,
        "inputCount": len(source_before), "changes": changes,
        "before": source_before, "after": source_after,
    }
    source_snapshot_path = RUN_DIR / "source-input-snapshot.json"
    source_snapshot_path.write_text(
        json.dumps(source_record, indent=2, ensure_ascii=False, sort_keys=True) + "\n", encoding="utf-8"
    )
    source_snapshot_digest = sha256(source_snapshot_path)
    worktree_record = {
        "before": worktree_before,
        "after": worktree_after,
        "changed": worktree_before != worktree_after,
    }
    worktree_snapshot_path = RUN_DIR / "working-tree-snapshot.json"
    worktree_snapshot_path.write_text(
        json.dumps(worktree_record, indent=2, ensure_ascii=False, sort_keys=True) + "\n", encoding="utf-8"
    )
    worktree_snapshot_digest = sha256(worktree_snapshot_path)
    if branch_before != branch_after or head_before != head_after or changes or worktree_record["changed"]:
        raise ProofFailure(
            "source or working-tree inputs changed during proof: " +
            json.dumps({"branchBefore": branch_before, "branchAfter": branch_after,
                        "headBefore": head_before, "headAfter": head_after,
                        "sourceChanges": changes, "workingTreeChanged": worktree_record["changed"]}, ensure_ascii=False)
        )
    git_dirty = bool(worktree_after["statusSha256"] != sha256_text(""))
    commands_path = RUN_DIR / "commands.ndjson"
    commands_path.write_text(
        "".join(json.dumps(command, ensure_ascii=False) + "\n" for command in COMMANDS), encoding="utf-8"
    )
    run_text_privacy = assert_run_text_privacy()
    run_text_privacy["finalSummaryCheckedBeforeWrite"] = True
    private_path_privacy = assert_persistent_private_path_absence([
        str(CONSUMER_DIR / "native-extensions" / "com.example.go-basic" / "bin" / "native-ext-go-basic"),
        str(CONSUMER_DIR / "native-extensions" / "com.example.macos-vision" / "bin" / "native-ext-macos-vision"),
        str(CONSUMER_DIR / "ocr-test.png"),
    ])
    platform_verification = {
        "darwin": {
            "runtimeVerified": True, "packageVerified": True,
            "assetSource": "local acceptance archive", "checksumVerification": "passed",
            "signatureVerification": "Not Provided",
            "evidenceBinding": {"head": head_after, "sourceInputSnapshotSha256": source_snapshot_digest, "workingTreeSnapshotSha256": worktree_snapshot_digest, "buildPackageRunId": RUN_ID},
        },
    }
    out_of_scope_platforms = {}
    if not host_only:
        platform_verification.update({
            "linux": {
                "runtimeVerified": False, "packageVerified": True, "status": "compile/package only",
                "assetSource": "local acceptance archive", "checksumVerification": "passed", "signatureVerification": "Not Provided",
                "evidenceBinding": {"head": head_after, "sourceInputSnapshotSha256": source_snapshot_digest, "workingTreeSnapshotSha256": worktree_snapshot_digest, "buildPackageRunId": RUN_ID},
            },
            "windows": {
                "runtimeVerified": False, "packageVerified": True, "status": "compile/package only",
                "assetSource": "local acceptance archive", "checksumVerification": "passed", "signatureVerification": "Not Provided",
                "evidenceBinding": {"head": head_after, "sourceInputSnapshotSha256": source_snapshot_digest, "workingTreeSnapshotSha256": worktree_snapshot_digest, "buildPackageRunId": RUN_ID},
            },
        })
    missing_platforms = [
        platform for platform, verification in platform_verification.items()
        if not verification["runtimeVerified"]
    ]
    summary = {
        "schemaVersion": "1.0.1",
        "status": "passed",
        "runId": RUN_ID,
        "runDir": str(RUN_DIR),
        "branch": branch_after,
        "head": head_after,
        "gitDirty": git_dirty,
        "hostProof": {
            "status": "passed", "platform": "darwin", "mode": "host-only" if host_only else "full-goal-gate",
        },
        "goalAcceptance": {
            "status": "accepted_macos_runtime_with_cross_compile_package" if not host_only else "accepted_macos_runtime_only",
            "requiredPlatforms": ["darwin"],
            "missingPlatforms": missing_platforms,
            "exitCode": 0,
            "reason": "macOS Runtime verified; Linux/Windows are compile/package only and Not Evaluated for target Runtime",
            "outOfScopeNotEvaluated": out_of_scope_platforms,
        },
        "evidenceBinding": {
            "head": head_after,
            "sourceInputSnapshotSha256": source_snapshot_digest,
            "workingTreeSnapshotSha256": worktree_snapshot_digest,
            "buildPackageRunId": RUN_ID,
        },
        "distribution": {
            "repositorySource": {"status": "maintained source; not a precompiled asset"},
            "localAcceptanceArchive": {"status": "local only; checksum verified during proof"},
            "publicPublisherAsset": {"status": "Not Published / Not Verified"},
        },
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
            "programRelativeBundle": current_user,
            "excludedDefaultRoots": ["HOME", "machine-wide", "cwd", "PATH", "source ancestors", "script path"],
            "legacyMigration": {
                "linuxConfigScanned": False,
                "windowsRoamingScanned": False,
                "automaticMoveCopyMergeDelete": False,
            },
        },
        "inert": {
            "defaultGlobalPresent": True, "defaultChildCount": 0,
            "listGetDiagnosticsChildCount": 0, "thirdPartyFacadeExecuted": False,
            "disabledDurationMs": disabled["durationMs"], "listDurationMs": list_only["durationMs"],
        },
        "resultAssertions": {
            "helloMatched": result.get("hello") == {"message": "Hello OpenDesk"},
            "addMatched": result.get("add") == {"value": 42},
            "ocrMatched": True,
            "rawBusinessResultPersistedInSummary": False,
        },
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
        "crossCompile": cross_compile if cross_compile is not None else {"status": "not_run", "reason": "macOS-only host proof"},
        "authorBuild": AUTHOR_BUILD_EVIDENCE,
        "macOSSecurityGoTests": security_go_tests,
        "authorWireTest": author_wire,
        "schemaValidation": source_schema,
        "documentationAcceptance": documentation,
        "platformVerification": platform_verification,
        "performance": {
            "smokeTotalMs": smoke["durationMs"], "laterHelloTotalMs": again["durationMs"],
            "packagedQuickstartMs": packaged_quickstart["durationMs"],
            "programRelativeDiagnosticsMs": current_user["diagnosticsDurationMs"],
            "programRelativeQuickstartMs": current_user["quickstartDurationMs"],
            "programRelativeOCRQuickstartMs": current_user["ocrQuickstartDurationMs"],
            "appBundledCallMs": app_bundled["durationMs"],
            "callEvidence": evidence["calls"], "discoveryDurationMs": evidence["discoveryDurationMs"],
        },
        "evidence": evidence,
        "sourceInputSnapshot": {
            "path": str(source_snapshot_path), "sha256": source_snapshot_digest,
            "inputCount": len(source_before), "changes": [], "status": "passed",
        },
        "workingTreeSnapshot": {
            "path": str(worktree_snapshot_path), "sha256": worktree_snapshot_digest,
            "status": "passed", "changed": False,
            "branch": worktree_after["branch"], "head": worktree_after["head"],
            "indexTree": worktree_after["indexTree"],
        },
        "commandTranscript": {"path": str(commands_path), "count": len(COMMANDS)},
    }
    summary_path = RUN_DIR / "summary.json"
    summary_text = json.dumps(summary, indent=2, ensure_ascii=False) + "\n"
    for forbidden_result in ("a and b are required", "Hello OpenDesk", "OPENDESK OCR 123"):
        if forbidden_result in summary_text:
            raise ProofFailure("extension-controlled result text leaked into final proof summary")
    for forbidden in (
        str(CONSUMER_DIR / "native-extensions" / "com.example.go-basic" / "bin" / "native-ext-go-basic"),
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
