#!/usr/bin/env python3

import argparse
import gzip
import hashlib
import json
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse


TITLE = "OpenDesk Runtime API Test Lab"
INDEX_PATH = Path(__file__).with_name("index.html")
BINARY_PAYLOAD = b"\x00\xff\x80OpenDesk\n"
EMPTY_PAYLOAD = b""
JSON_LOOKING_TEXT = b'plain text that looks like json: {"not":"parsed"}'
CHUNKED_PAYLOAD = b"chunked\x00\xffpayload"
GZIP_PAYLOAD = b"gzip decoded bytes \x00\xff\x80"
LARGE_PAYLOAD = bytes(index % 251 for index in range(12 * 1024 * 1024))


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
            self.download_requests = 0

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
                "downloadRequests": self.download_requests,
            }


STATE = EventState()


class FixtureHandler(BaseHTTPRequestHandler):
    server_version = "OpenDeskRuntimeAPIFixture/1.0"
    protocol_version = "HTTP/1.1"

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

    def send_bytes(self, status, payload, content_type="application/octet-stream", headers=None):
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(payload)))
        self.send_header("Cache-Control", "no-store")
        for key, value in (headers or {}).items():
            self.send_header(key, value)
        self.end_headers()
        self.wfile.write(payload)

    def record_download(self):
        with STATE._lock:
            STATE.download_requests += 1

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
        if path == "/slow":
            # Kept intentionally simple: the client side must cancel this
            # request before its response is available.
            time.sleep(2)
            try:
                self.send_json(200, {"late": True})
            except (BrokenPipeError, ConnectionResetError):
                pass
            return
        if path == "/download/binary":
            self.record_download()
            self.send_bytes(200, BINARY_PAYLOAD)
            return
        if path == "/download/empty":
            self.record_download()
            self.send_bytes(200, EMPTY_PAYLOAD)
            return
        if path == "/download/json-looking-text":
            self.record_download()
            self.send_bytes(200, JSON_LOOKING_TEXT, "text/plain; charset=utf-8")
            return
        if path == "/download/request-echo":
            self.record_download()
            self.send_json(200, {
                "query": parsed.query,
                "header": self.headers.get("X-HTTP-Download-Test", ""),
            })
            return
        if path == "/download/large":
            self.record_download()
            self.send_bytes(200, LARGE_PAYLOAD)
            return
        if path == "/download/chunked":
            self.record_download()
            self.send_response(200)
            self.send_header("Content-Type", "application/octet-stream")
            self.send_header("Transfer-Encoding", "chunked")
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            for start in range(0, len(CHUNKED_PAYLOAD), 3):
                chunk = CHUNKED_PAYLOAD[start:start + 3]
                self.wfile.write(f"{len(chunk):X}\r\n".encode("ascii"))
                self.wfile.write(chunk + b"\r\n")
            self.wfile.write(b"0\r\n\r\n")
            return
        if path == "/download/gzip":
            self.record_download()
            self.send_bytes(200, gzip.compress(GZIP_PAYLOAD), headers={"Content-Encoding": "gzip"})
            return
        if path == "/download/unknown-encoding":
            self.record_download()
            self.send_bytes(200, BINARY_PAYLOAD, headers={"Content-Encoding": "br"})
            return
        if path == "/download/slow":
            self.record_download()
            self.send_response(200)
            self.send_header("Content-Type", "application/octet-stream")
            self.send_header("Content-Length", str(256 * 1024))
            self.end_headers()
            try:
                for _ in range(256):
                    self.wfile.write(bytes([_ % 251]) * 1024)
                    self.wfile.flush()
                    time.sleep(0.01)
            except (BrokenPipeError, ConnectionResetError):
                pass
            return
        if path == "/download/truncated":
            self.record_download()
            self.send_response(200)
            self.send_header("Content-Type", "application/octet-stream")
            self.send_header("Content-Length", "4096")
            self.end_headers()
            self.wfile.write(b"short-body")
            self.wfile.flush()
            self.close_connection = True
            return
        if path == "/download/status-500":
            self.record_download()
            self.send_bytes(500, b"not a download")
            return
        if path == "/download/status-206":
            self.record_download()
            self.send_bytes(206, BINARY_PAYLOAD, headers={"Content-Range": "bytes 0-11/12"})
            return
        if path == "/download/status-304":
            self.record_download()
            self.send_response(304)
            self.end_headers()
            return
        if path == "/download/redirect/same":
            self.record_download()
            self.send_response(302)
            self.send_header("Location", "/download/binary")
            self.end_headers()
            return
        if path == "/download/redirect/loop-a":
            self.record_download()
            self.send_response(302)
            self.send_header("Location", "/download/redirect/loop-b")
            self.end_headers()
            return
        if path == "/download/redirect/loop-b":
            self.record_download()
            self.send_response(302)
            self.send_header("Location", "/download/redirect/loop-a")
            self.end_headers()
            return
        if path == "/download/redirect/cross":
            self.record_download()
            self.send_response(302)
            self.send_header("Location", f"http://localhost:{self.server.server_port}/download/header-echo")
            self.end_headers()
            return
        if path == "/download/header-echo":
            self.record_download()
            value = json.dumps({"secret": self.headers.get("X-Download-Secret", "")}, sort_keys=True).encode("utf-8")
            self.send_bytes(200, value, "application/json; charset=utf-8")
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
