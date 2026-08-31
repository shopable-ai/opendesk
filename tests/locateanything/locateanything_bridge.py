#!/usr/bin/env python3
"""
Experimental HTTP bridge for LocateAnything profile routing.

Verified path:
- mock backend on the inspected mac4g host

Intended real path:
- mlx backend on an Apple Silicon host with local model directories
"""

import argparse
import base64
import json
import os
import platform
import re
import subprocess
import sys
import tempfile
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from PIL import Image


REPO_ROOT = Path(__file__).resolve().parents[2]
MODEL_PATHS = {
    "8bit": REPO_ROOT / "models" / "LocateAnything-3B-8bit",
    "bf16": REPO_ROOT / "models" / "LocateAnything-3B-bf16",
}

PROFILE_PRESETS = {
    "daily": {
        "model_key": "8bit",
        "generation_mode": "fast",
        "max_tokens": 256,
    },
    "quality": {
        "model_key": "bf16",
        "generation_mode": "hybrid",
        "max_tokens": 8192,
    },
    "verify": {
        "model_key": "bf16",
        "generation_mode": "slow",
        "max_tokens": 8192,
    },
}

TASK_PRESETS = {
    "detect": {
        "output_type": "box",
        "auto_chain": ["quality", "verify"],
        "prompt": "Locate all the instances that matches the following description: {phrase}.",
    },
    "ground_single": {
        "output_type": "box",
        "auto_chain": ["daily", "quality"],
        "prompt": "Locate a single instance that matches the following description: {phrase}.",
    },
    "ground_multi": {
        "output_type": "box",
        "auto_chain": ["quality", "verify"],
        "prompt": "Locate all the instances that match the following description: {phrase}.",
    },
    "text": {
        "output_type": "box",
        "auto_chain": ["quality", "verify"],
        "prompt": "Please locate the text referred as {phrase}.",
    },
    "gui_box": {
        "output_type": "box",
        "auto_chain": ["daily", "quality"],
        "prompt": "Locate the region that matches the following description: {phrase}.",
    },
    "gui_point": {
        "output_type": "point",
        "auto_chain": ["daily", "quality"],
        "prompt": "Point to: {phrase}.",
    },
    "point": {
        "output_type": "point",
        "auto_chain": ["daily", "quality"],
        "prompt": "Point to: {phrase}.",
    },
}

BOX_RE = re.compile(r"<box><(\d+)><(\d+)><(\d+)><(\d+)></box>")
POINT_RE = re.compile(r"<box><(\d+)><(\d+)></box>")


def to_quantized(value):
    value = max(0.0, min(1.0, value))
    return int(round(value * 1000))


def box_answer(label, box):
    x1, y1, x2, y2 = box
    return (
        f"<ref>{label}</ref><box>"
        f"<{to_quantized(x1)}><{to_quantized(y1)}>"
        f"<{to_quantized(x2)}><{to_quantized(y2)}>"
        f"</box>"
    )


def point_answer(point):
    x, y = point
    return f"<box><{to_quantized(x)}><{to_quantized(y)}></box>"


def parse_boxes(answer, image_width, image_height):
    boxes = []
    for match in BOX_RE.finditer(answer or ""):
        x1, y1, x2, y2 = [int(value) for value in match.groups()]
        left = round(x1 / 1000 * image_width)
        top = round(y1 / 1000 * image_height)
        right = round(x2 / 1000 * image_width)
        bottom = round(y2 / 1000 * image_height)
        boxes.append(
            {
                "x": left,
                "y": top,
                "width": max(0, right - left),
                "height": max(0, bottom - top),
                "normalized": {
                    "x1": x1 / 1000,
                    "y1": y1 / 1000,
                    "x2": x2 / 1000,
                    "y2": y2 / 1000,
                },
            }
        )
    return boxes


def parse_points(answer, image_width, image_height):
    points = []
    for match in POINT_RE.finditer(answer or ""):
        x, y = [int(value) for value in match.groups()]
        points.append(
            {
                "x": round(x / 1000 * image_width),
                "y": round(y / 1000 * image_height),
                "normalized": {
                    "x": x / 1000,
                    "y": y / 1000,
                },
            }
        )
    return points


def is_apple_silicon():
    return platform.system() == "Darwin" and platform.machine() == "arm64"


def load_image_size(image_path):
    with Image.open(image_path) as img:
        return img.size


def decode_image_base64(value):
    raw = str(value or "").strip()
    if not raw:
        raise ValueError("imageBase64 is empty")
    if raw.startswith("data:"):
        parts = raw.split(",", 1)
        if len(parts) != 2:
            raise ValueError("invalid imageBase64 data URL")
        raw = parts[1]
    return base64.b64decode(raw)


def infer_image_suffix(payload):
    image_name = str(payload.get("imageName") or payload.get("image_name") or "").strip()
    suffix = Path(image_name).suffix.lower()
    if suffix in {".png", ".jpg", ".jpeg", ".webp", ".bmp"}:
        return suffix
    image_base64 = str(payload.get("imageBase64") or payload.get("image_base64") or "")
    if image_base64.startswith("data:image/"):
        mime = image_base64.split(";", 1)[0].split("/", 1)[1].lower()
        if mime == "jpeg":
            return ".jpg"
        if mime in {"png", "jpg", "webp", "bmp"}:
            return f".{mime}"
    return ".png"


def materialize_inline_image(payload):
    image_base64 = payload.get("imageBase64") or payload.get("image_base64")
    if not image_base64:
        return None, None, "path"
    suffix = infer_image_suffix(payload)
    fd, path = tempfile.mkstemp(prefix="locateanything_", suffix=suffix)
    try:
        with os.fdopen(fd, "wb") as handle:
            handle.write(decode_image_base64(image_base64))
    except Exception:
        try:
            os.unlink(path)
        except OSError:
            pass
        raise
    return path, path, "inline_base64"


def build_prompt(task, phrase):
    preset = TASK_PRESETS.get(task)
    if not preset:
        raise ValueError(f"unsupported task: {task}")
    return preset["prompt"].format(phrase=phrase.strip())


def build_attempt_chain(task, profile):
    if profile == "auto":
        return list(TASK_PRESETS[task]["auto_chain"])
    if profile not in PROFILE_PRESETS:
        raise ValueError(f"unsupported profile: {profile}")
    return [profile]


def looks_good(output_type, boxes, points, image_width, image_height):
    if output_type == "point":
        return len(points) == 1
    if not boxes:
        return False
    image_area = max(1, image_width * image_height)
    largest = max(box["width"] * box["height"] for box in boxes)
    return largest / image_area < 0.96


def mock_answer(task, phrase, profile_name):
    text = phrase.lower()

    if "badge" in text or "tiny" in text:
        if profile_name == "daily":
            return "<box>none</box>"
        return point_answer((0.09, 0.17))

    if task in {"gui_point", "point"}:
        if "send" in text:
            return point_answer((0.94, 0.94))
        if "search" in text:
            return point_answer((0.18, 0.07))
        if "input" in text:
            return point_answer((0.55, 0.91))
        return point_answer((0.50, 0.50))

    if "conversation" in text or "chat list" in text:
        return box_answer(phrase, (0.07, 0.08, 0.28, 0.90))
    if "input" in text or "composer" in text:
        return box_answer(phrase, (0.29, 0.85, 0.97, 0.98))
    if "search" in text:
        return box_answer(phrase, (0.08, 0.02, 0.28, 0.10))

    if task == "ground_multi":
        if profile_name == "quality":
            return (
                box_answer(phrase, (0.08, 0.15, 0.14, 0.22))
                + box_answer(phrase, (0.08, 0.30, 0.14, 0.37))
            )
        return "<box>none</box>"

    return box_answer(phrase, (0.35, 0.35, 0.65, 0.65))


def run_mlx_generate(model_path, image_path, prompt, preset):
    if not is_apple_silicon():
        raise RuntimeError("mlx backend requires an Apple Silicon host")
    if not model_path.exists():
        raise RuntimeError(f"model path does not exist: {model_path}")

    python_bin = os.environ.get("LOCATEANYTHING_MLX_PYTHON", "python3")
    base_cmd = [
        python_bin,
        "-m",
        "mlx_vlm.generate",
        "--model",
        str(model_path),
        "--image",
        str(image_path),
        "--prompt",
        prompt,
        "--max-tokens",
        str(preset["max_tokens"]),
        "--temperature",
        "0.0",
    ]

    def run_cmd(cmd):
        return subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=180,
            check=False,
        )

    cmd = base_cmd + ["--generation-mode", preset["generation_mode"]]
    completed = run_cmd(cmd)
    stderr = (completed.stderr or "").strip()
    if completed.returncode != 0 and "--generation-mode" in stderr and "unrecognized arguments" in stderr:
        completed = run_cmd(base_cmd)

    if completed.returncode != 0:
        stderr = (completed.stderr or "").strip()
        stdout = (completed.stdout or "").strip()
        detail = stderr or stdout or f"mlx_vlm.generate exited with {completed.returncode}"
        raise RuntimeError(detail)

    stdout = (completed.stdout or "").strip()
    if not stdout:
        raise RuntimeError("mlx_vlm.generate returned empty stdout")
    lines = [line.strip() for line in stdout.splitlines() if line.strip()]
    for line in reversed(lines):
        if "<box>" in line or "<ref>" in line:
            return line
    for line in reversed(lines):
        if line.startswith(("Prompt:", "Generation:", "Peak memory:", "Files:", "==========")):
            continue
        return line
    return lines[-1]


class Bridge:
    def __init__(self, backend):
        self.backend = backend

    def infer_once(self, image_path, task, phrase, profile_name, image_width, image_height):
        preset = PROFILE_PRESETS[profile_name]
        prompt = build_prompt(task, phrase)
        model_path = MODEL_PATHS[preset["model_key"]]

        if self.backend == "mock":
            answer = mock_answer(task, phrase, profile_name)
        elif self.backend == "mlx":
            answer = run_mlx_generate(model_path, image_path, prompt, preset)
        else:
            raise RuntimeError(f"unsupported backend: {self.backend}")

        boxes = parse_boxes(answer, image_width, image_height)
        points = parse_points(answer, image_width, image_height)
        return {
            "profile": profile_name,
            "model_key": preset["model_key"],
            "model_path": str(model_path),
            "generation_mode": preset["generation_mode"],
            "max_tokens": preset["max_tokens"],
            "prompt": prompt,
            "answer": answer,
            "boxes": boxes,
            "points": points,
        }

    def ground(self, payload):
        temp_image_path = None
        image_path, temp_image_path, image_source = materialize_inline_image(payload)
        if not image_path:
            image_path = payload.get("imagePath") or payload.get("image_path")
            image_source = "path"
        if not image_path:
            raise ValueError("imagePath or imageBase64 is required")
        task = payload.get("task", "gui_point")
        phrase = (payload.get("phrase") or payload.get("query") or "").strip()
        if not phrase:
            raise ValueError("phrase is required")
        if task not in TASK_PRESETS:
            raise ValueError(f"unsupported task: {task}")

        profile = payload.get("profile", "auto")
        client_image_path = payload.get("imagePath") or payload.get("image_path") or ""
        try:
            image_width, image_height = load_image_size(image_path)
            output_type = TASK_PRESETS[task]["output_type"]
            attempts = []

            for profile_name in build_attempt_chain(task, profile):
                result = self.infer_once(
                    image_path=image_path,
                    task=task,
                    phrase=phrase,
                    profile_name=profile_name,
                    image_width=image_width,
                    image_height=image_height,
                )
                result["accepted"] = looks_good(
                    output_type,
                    result["boxes"],
                    result["points"],
                    image_width,
                    image_height,
                )
                attempts.append(result)
                if result["accepted"]:
                    break

            final = attempts[-1]
            return {
                "ok": True,
                "backend": self.backend,
                "task": task,
                "phrase": phrase,
                "profile_requested": profile,
                "profile_used": final["profile"],
                "output_type": output_type,
                "image": {
                    "path": image_path,
                    "client_path": client_image_path,
                    "source": image_source,
                    "width": image_width,
                    "height": image_height,
                },
                "answer": final["answer"],
                "boxes": final["boxes"],
                "points": final["points"],
                "attempts": [
                    {
                        "profile": item["profile"],
                        "model_key": item["model_key"],
                        "model_path": item["model_path"],
                        "generation_mode": item["generation_mode"],
                        "accepted": item["accepted"],
                        "answer": item["answer"],
                        "box_count": len(item["boxes"]),
                        "point_count": len(item["points"]),
                    }
                    for item in attempts
                ],
            }
        finally:
            if temp_image_path:
                try:
                    os.unlink(temp_image_path)
                except OSError:
                    pass

    def health(self):
        return {
            "ok": True,
            "backend": self.backend,
            "repo_root": str(REPO_ROOT),
            "platform": {
                "system": platform.system(),
                "machine": platform.machine(),
                "python": sys.version.split()[0],
                "platform_supported_for_mlx": is_apple_silicon(),
            },
            "models": {
                key: {
                    "path": str(path),
                    "exists": path.exists(),
                }
                for key, path in MODEL_PATHS.items()
            },
            "profiles": PROFILE_PRESETS,
            "tasks": {
                key: {
                    "output_type": value["output_type"],
                    "auto_chain": value["auto_chain"],
                }
                for key, value in TASK_PRESETS.items()
            },
            "transport": {
                "accepts": {
                    "imagePath": True,
                    "imageBase64": True,
                }
            },
        }


def make_handler(bridge):
    class Handler(BaseHTTPRequestHandler):
        def _send(self, status, payload):
            data = json.dumps(payload, ensure_ascii=False, indent=2).encode("utf-8")
            self.send_response(status)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)

        def do_GET(self):
            if self.path == "/health":
                self._send(200, bridge.health())
                return
            self._send(404, {"ok": False, "error": "not found"})

        def do_POST(self):
            if self.path != "/v1/ground":
                self._send(404, {"ok": False, "error": "not found"})
                return

            length = int(self.headers.get("Content-Length", "0"))
            body = self.rfile.read(length) if length > 0 else b"{}"
            try:
                payload = json.loads(body.decode("utf-8"))
            except Exception as exc:
                self._send(400, {"ok": False, "error": f"invalid json: {exc}"})
                return

            try:
                result = bridge.ground(payload)
            except Exception as exc:
                self._send(400, {"ok": False, "error": str(exc)})
                return

            self._send(200, result)

        def log_message(self, fmt, *args):
            return

    return Handler


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--backend", default="mock", choices=["mock", "mlx"])
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=18777)
    args = parser.parse_args()

    bridge = Bridge(args.backend)
    server = ThreadingHTTPServer((args.host, args.port), make_handler(bridge))
    print(
        json.dumps(
            {
                "ok": True,
                "backend": args.backend,
                "listen": f"http://{args.host}:{args.port}",
                "health": f"http://{args.host}:{args.port}/health",
            },
            indent=2,
        ),
        flush=True,
    )
    server.serve_forever()


if __name__ == "__main__":
    main()
