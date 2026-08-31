#!/usr/bin/env python3

import argparse
import json
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse


TITLE = "Clawdesk Runtime API Test Lab"
INDEX_PATH = Path(__file__).with_name("index.html")


class EventState:
    def __init__(self):
        self._lock = threading.Lock()
        self.reset()

    def reset(self):
        with getattr(self, "_lock", threading.Lock()):
            previous_telemetry = getattr(self, "telemetry", {})
            self.counts = {
                "load": 0,
                "pointerdown": 0,
                "pointerup": 0,
                "click": 0,
                "primary-action": 0,
                "color-action": 0,
                "counter-action": 0,
                "reset-action": 0,
                "visual-settled": 0,
                "wheel": 0,
                "keydown": 0,
                "keyup": 0,
                "input": 0,
            }
            self.events = []
            self.total_events = 0
            self.telemetry = previous_telemetry

    def record(self, event):
        event_type = str(event.get("type", ""))
        with self._lock:
            self.counts[event_type] = self.counts.get(event_type, 0) + 1
            self.events.append(event)
            self.events = self.events[-500:]
            self.total_events += 1
            detail = event.get("detail")
            if isinstance(detail, dict) and isinstance(detail.get("telemetry"), dict):
                self.telemetry = detail["telemetry"]

    def snapshot(self):
        with self._lock:
            return {
                "counts": dict(self.counts),
                "eventCount": self.total_events,
                "events": list(self.events),
                "telemetry": dict(self.telemetry),
            }


STATE = EventState()


class FixtureHandler(BaseHTTPRequestHandler):
    server_version = "ClawdeskRuntimeAPIFixture/1.0"

    def log_message(self, fmt, *args):
        return

    def send_json(self, status, value):
        payload = json.dumps(value, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(payload)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(payload)

    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path
        if path in ("/", "/index.html"):
            payload = INDEX_PATH.read_bytes()
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(payload)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(payload)
            return
        if path == "/health":
            self.send_json(200, {"ok": True, "title": TITLE})
            return
        if path == "/state":
            self.send_json(200, STATE.snapshot())
            return
        if path == "/reset":
            STATE.reset()
            self.send_json(200, STATE.snapshot())
            return
        if path == "/echo":
            self.send_json(200, {"method": "GET", "query": parsed.query, "body": ""})
            return
        self.send_json(404, {"ok": False, "error": "not_found"})

    def do_POST(self):
        path = urlparse(self.path).path
        if path == "/echo":
            self.send_echo("POST")
            return
        if path != "/event":
            self.send_json(404, {"ok": False, "error": "not_found"})
            return
        try:
            size = int(self.headers.get("Content-Length", "0"))
            event = json.loads(self.rfile.read(size).decode("utf-8"))
            if not isinstance(event, dict) or not event.get("type"):
                raise ValueError("event.type is required")
        except (ValueError, json.JSONDecodeError, UnicodeDecodeError) as error:
            self.send_json(400, {"ok": False, "error": str(error)})
            return
        STATE.record(event)
        self.send_json(200, {"ok": True})

    def send_echo(self, method):
        size = int(self.headers.get("Content-Length", "0"))
        body = self.rfile.read(size).decode("utf-8") if size else ""
        try:
            body = json.loads(body) if body else ""
        except json.JSONDecodeError:
            pass
        self.send_json(200, {"method": method, "body": body})

    def do_PUT(self):
        if urlparse(self.path).path == "/echo":
            self.send_echo("PUT")
        else:
            self.send_json(404, {"ok": False, "error": "not_found"})

    def do_PATCH(self):
        if urlparse(self.path).path == "/echo":
            self.send_echo("PATCH")
        else:
            self.send_json(404, {"ok": False, "error": "not_found"})

    def do_DELETE(self):
        if urlparse(self.path).path == "/echo":
            self.send_echo("DELETE")
        else:
            self.send_json(404, {"ok": False, "error": "not_found"})


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--ready", required=True, type=Path)
    parser.add_argument("--browser-app", default="Safari")
    args = parser.parse_args()

    server = ThreadingHTTPServer(("127.0.0.1", 0), FixtureHandler)
    host, port = server.server_address
    base_url = f"http://{host}:{port}"
    args.ready.parent.mkdir(parents=True, exist_ok=True)
    args.ready.write_text(
        json.dumps(
            {"baseURL": base_url, "title": TITLE, "browserApp": args.browser_app},
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )
    server.serve_forever(poll_interval=0.1)


if __name__ == "__main__":
    main()
