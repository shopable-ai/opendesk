#!/usr/bin/env python3
from __future__ import annotations

import base64
import importlib
import json
import os
import platform
import shutil
import socket
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[3]
LOCATE_ROOT = REPO_ROOT / "test" / "locateanything"
OUTPUT_ROOT = REPO_ROOT / ".runtime" / "test" / "locateanything" / "output" / "stage_01_env"
REPORT_PATH = REPO_ROOT / ".runtime" / "test" / "locateanything" / "reports" / "STAGE_01_ENV_REPORT.md"
SUMMARY_PATH = OUTPUT_ROOT / "summary.json"
BRIDGE_PATH = LOCATE_ROOT / "locateanything_bridge.py"
VENV_PYTHON = Path("~/Documents/workspace/local-ai-rag/.venv/bin/python").expanduser()
CONFIG_PATHS = [
    LOCATE_ROOT / "config" / "default.config.json",
    LOCATE_ROOT / "config" / "local.override.json",
    REPO_ROOT / ".runtime" / "temp" / "locateanything.config.json",
]


def merge_dict(base: dict, override: dict) -> dict:
    result = dict(base)
    for key, value in (override or {}).items():
        if isinstance(result.get(key), dict) and isinstance(value, dict):
            result[key] = merge_dict(result[key], value)
        else:
            result[key] = value
    return result


def load_config() -> dict:
    config: dict = {}
    for path in CONFIG_PATHS:
        if not path.exists():
            continue
        config = merge_dict(config, json.loads(path.read_text()))
    config["serviceUrl"] = str(config.get("serviceUrl", "http://127.0.0.1:18777")).rstrip("/")
    config["localMockServiceUrl"] = str(config.get("localMockServiceUrl", "http://127.0.0.1:18777")).rstrip("/")
    config["localMockPortFallbacks"] = config.get("localMockPortFallbacks", [18777, 18778, 18877])
    return config


def run(cmd: list[str] | str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        cmd,
        shell=isinstance(cmd, str),
        cwd=REPO_ROOT,
        capture_output=True,
        text=True,
        check=False,
    )


def get_local_ipv4() -> str:
    out = run(r"ifconfig | rg 'inet 192\.168\.|inet 10\.|inet 172\.(1[6-9]|2[0-9]|3[0-1])\.'")
    for line in out.stdout.splitlines():
        line = line.strip()
        if line.startswith("inet "):
            return line.split()[1]
    return ""


def python_imports(python_bin: Path | None) -> dict:
    modules = ["torch", "transformers", "mlx", "mlx_vlm", "PIL"]
    results = {}
    if not python_bin or not python_bin.exists():
        return {name: {"ok": False, "error": f"python missing: {python_bin}"} for name in modules}
    script = (
        "import importlib, json\n"
        "mods=%r\n"
        "out={}\n"
        "for name in mods:\n"
        "    try:\n"
        "        mod=importlib.import_module(name)\n"
        "        out[name]={'ok': True, 'version': getattr(mod, '__version__', 'no_version')}\n"
        "    except Exception as exc:\n"
        "        out[name]={'ok': False, 'error': f'{exc.__class__.__name__}: {exc}'}\n"
        "print(json.dumps(out))\n"
    ) % modules
    completed = subprocess.run(
        [str(python_bin), "-c", script],
        cwd=REPO_ROOT,
        capture_output=True,
        text=True,
        check=False,
    )
    if completed.returncode != 0:
        return {name: {"ok": False, "error": completed.stderr.strip() or completed.stdout.strip()} for name in modules}
    return json.loads(completed.stdout.strip() or "{}")


def healthcheck(url: str, timeout: float = 5.0) -> dict:
    try:
        with urllib.request.urlopen(f"{url}/health", timeout=timeout) as resp:
            body = resp.read().decode("utf-8")
            return {"ok": True, "status": resp.status, "data": json.loads(body)}
    except Exception as exc:
        return {"ok": False, "error": f"{exc.__class__.__name__}: {exc}"}


def ground_call(url: str, payload: dict, timeout: float = 10.0) -> dict:
    req = urllib.request.Request(
        f"{url}/v1/ground",
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return {"ok": True, "status": resp.status, "data": json.loads(resp.read().decode("utf-8"))}
    except Exception as exc:
        return {"ok": False, "error": f"{exc.__class__.__name__}: {exc}"}


def load_image_base64(path: Path) -> str:
    return base64.b64encode(path.read_bytes()).decode("ascii")


def port_status(host: str, port: int) -> dict:
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock.settimeout(1.5)
    try:
        status = sock.connect_ex((host, port))
        return {"open": status == 0}
    finally:
        sock.close()


def find_available_port(host: str, candidates: list[int]) -> int:
    for port in candidates:
        if not port_status(host, port).get("open"):
            return int(port)
    return int(candidates[-1]) + 1


def start_mock_bridge(config: dict) -> tuple[dict, subprocess.Popen[str] | None]:
    local_url = urllib.parse.urlparse(config["localMockServiceUrl"])
    host = local_url.hostname or "127.0.0.1"
    preferred_port = local_url.port or 18777
    current = healthcheck(config["localMockServiceUrl"])
    if current.get("ok"):
        return {
            "started": False,
            "serviceUrl": config["localMockServiceUrl"],
            "mode": "reused",
            "health": current,
        }, None

    python_bin = VENV_PYTHON if VENV_PYTHON.exists() else Path(sys.executable)
    launch_port = find_available_port(host, [preferred_port] + [int(p) for p in config["localMockPortFallbacks"] if int(p) != preferred_port])
    launch_url = f"http://{host}:{launch_port}"
    proc = subprocess.Popen(
        [str(python_bin), str(BRIDGE_PATH), "--backend", "mock", "--host", host, "--port", str(launch_port)],
        cwd=REPO_ROOT,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
    )
    deadline = time.time() + 8.0
    probe = {"ok": False, "error": "timeout"}
    while time.time() < deadline:
      probe = healthcheck(launch_url)
      if probe.get("ok"):
          break
      time.sleep(0.35)
    return {
        "started": probe.get("ok", False),
        "serviceUrl": launch_url,
        "mode": "spawned",
        "health": probe,
        "pid": proc.pid,
    }, proc


def main() -> int:
    OUTPUT_ROOT.mkdir(parents=True, exist_ok=True)
    config = load_config()
    service_url = config["serviceUrl"]
    service_parsed = urllib.parse.urlparse(service_url)
    service_host = service_parsed.hostname or "127.0.0.1"
    service_port = service_parsed.port or 80
    configured_ground_timeout = max(30.0, float(config.get("requestTimeoutMs", 20000)) / 1000.0 + 10.0)
    default_image_path = REPO_ROOT / str(config.get("defaultImagePath", "tests/locateanything/fixtures/wechat/mock_wechat.png"))
    inline_payload = {
        "imagePath": str(default_image_path),
        "imageBase64": load_image_base64(default_image_path),
        "imageName": default_image_path.name,
        "task": "gui_point",
        "phrase": "the send button",
        "profile": "auto",
    }

    local_mock_runtime, proc = start_mock_bridge(config)
    try:
        local_mock_ground = ground_call(
            local_mock_runtime["serviceUrl"],
            inline_payload,
        )
        configured_service_ground = (
            ground_call(service_url, inline_payload, timeout=configured_ground_timeout)
            if healthcheck(service_url).get("ok")
            else {"ok": False, "error": "configured service health failed"}
        )

        summary = {
            "generatedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "controller": {
                "hostname": platform.node(),
                "localIpv4": get_local_ipv4(),
                "cwd": str(REPO_ROOT),
                "machine": platform.machine(),
                "system": platform.system(),
                "python": sys.version.split()[0],
            },
            "config": config,
            "artifacts": {
                "distOpenDesk": {
                    "path": str(REPO_ROOT / "dist" / "opendesk"),
                    "exists": (REPO_ROOT / "dist" / "opendesk").exists(),
                    "executable": os.access(REPO_ROOT / "dist" / "opendesk", os.X_OK),
                },
                "models": {
                    "8bit": {
                        "path": str(REPO_ROOT / "models" / "LocateAnything-3B-8bit"),
                        "exists": (REPO_ROOT / "models" / "LocateAnything-3B-8bit").exists(),
                    },
                    "bf16": {
                        "path": str(REPO_ROOT / "models" / "LocateAnything-3B-bf16"),
                        "exists": (REPO_ROOT / "models" / "LocateAnything-3B-bf16").exists(),
                    },
                },
            },
            "venv": {
                "path": str(VENV_PYTHON),
                "exists": VENV_PYTHON.exists(),
                "imports": python_imports(VENV_PYTHON if VENV_PYTHON.exists() else None),
            },
            "bridge": {
                "configuredService": {
                    "url": service_url,
                    "health": healthcheck(service_url),
                    "ground": configured_service_ground,
                    "port": service_port,
                    "portOpen": port_status(service_host, service_port),
                },
                "localMock": {
                    **local_mock_runtime,
                    "ground": local_mock_ground,
                },
            },
            "mlxReady": bool(
                platform.system() == "Darwin"
                and platform.machine() == "arm64"
                and (REPO_ROOT / "models" / "LocateAnything-3B-8bit").exists()
                and (REPO_ROOT / "models" / "LocateAnything-3B-bf16").exists()
                and python_imports(VENV_PYTHON if VENV_PYTHON.exists() else None).get("mlx", {}).get("ok")
                and python_imports(VENV_PYTHON if VENV_PYTHON.exists() else None).get("mlx_vlm", {}).get("ok")
            ),
        }
        SUMMARY_PATH.write_text(json.dumps(summary, indent=2, ensure_ascii=False))

        lines = [
            "# Stage 01 Env Report",
            "",
            f"- Generated at: {summary['generatedAt']}",
            f"- Controller host: `{summary['controller']['hostname']}`",
            f"- Controller IP: `{summary['controller']['localIpv4']}`",
            f"- Architecture: `{summary['controller']['machine']}`",
            f"- Python: `{summary['controller']['python']}`",
            "",
            "## Current Controller Reality",
            "",
            f"- `dist/opendesk`: {'ok' if summary['artifacts']['distOpenDesk']['exists'] and summary['artifacts']['distOpenDesk']['executable'] else 'missing'}",
            f"- `models/LocateAnything-3B-8bit`: {'present' if summary['artifacts']['models']['8bit']['exists'] else 'missing'}",
            f"- `models/LocateAnything-3B-bf16`: {'present' if summary['artifacts']['models']['bf16']['exists'] else 'missing'}",
            f"- `mlx`: {'ok' if summary['venv']['imports']['mlx']['ok'] else 'missing'}",
            f"- `mlx_vlm`: {'ok' if summary['venv']['imports']['mlx_vlm']['ok'] else 'missing'}",
            f"- Real MLX model ready on this controller: `{summary['mlxReady']}`",
            "",
            "## Bridge Checks",
            "",
            f"- Configured service URL: `{service_url}`",
            f"- Configured service health: `{'ok' if summary['bridge']['configuredService']['health']['ok'] else 'failed'}`",
            f"- Configured service `/v1/ground`: `{'ok' if summary['bridge']['configuredService']['ground']['ok'] else 'failed'}`",
            f"- Configured service backend: `{summary['bridge']['configuredService']['health'].get('data', {}).get('backend', 'unknown') if summary['bridge']['configuredService']['health']['ok'] else 'unreachable'}`",
            f"- Local mock URL: `{summary['bridge']['localMock']['serviceUrl']}`",
            f"- Local mock `/health`: `{'ok' if summary['bridge']['localMock']['health']['ok'] else 'failed'}`",
            f"- Local mock `/v1/ground`: `{'ok' if summary['bridge']['localMock']['ground']['ok'] else 'failed'}`",
            "",
            "## Blocking Facts",
            "",
        ]
        if not summary["mlxReady"]:
            lines.extend(
                [
                    "- Current controller cannot host the real MLX LocateAnything path because at least one of these is missing:",
                    "  - Apple Silicon (`arm64`)",
                    "  - local `models/LocateAnything-3B-8bit`",
                    "  - local `models/LocateAnything-3B-bf16`",
                    "  - `mlx`",
                    "  - `mlx_vlm`",
                    "",
                ]
            )
        lines.extend(
            [
                "## Replay Commands",
                "",
                "```bash",
                "cd /Users/mac/Documents/workspace/opendesk",
                "python3 tests/locateanything/scripts/run_stage_01_env.py",
                "```",
                "",
                "```bash",
                "cd /Users/mac/Documents/workspace/opendesk",
                "./dist/opendesk -script tests/locateanything/scripts/run_stage_02_model_only.js -timeout 5",
                "```",
            ]
        )
        REPORT_PATH.write_text("\n".join(lines), encoding="utf-8")
        print(json.dumps(summary, ensure_ascii=False, indent=2))
        return 0
    finally:
        if proc is not None:
            proc.terminate()
            try:
                proc.wait(timeout=2.0)
            except subprocess.TimeoutExpired:
                proc.kill()


if __name__ == "__main__":
    raise SystemExit(main())
