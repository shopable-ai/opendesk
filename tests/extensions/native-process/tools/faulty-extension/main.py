#!/usr/bin/env python3
"""Protocol V0 fault injector used by the Native Process smoke test."""

from __future__ import annotations

import json
import sys
import time


PROTOCOL = "opendesk-native-extension"
VERSION = 1


def write_json(value: object) -> None:
    sys.stdout.write(json.dumps(value, ensure_ascii=False, separators=(",", ":")))
    sys.stdout.write("\n")
    sys.stdout.flush()


def main() -> int:
    raw = sys.stdin.buffer.read()
    try:
        request = json.loads(raw.decode("utf-8"))
    except Exception as error:  # pragma: no cover - host always sends valid JSON
        sys.stderr.write(f"faulty-extension could not parse request: {error}\n")
        return 22

    method = request.get("method")
    request_id = request.get("id")

    if method == "crash":
        sys.stderr.write("intentional child crash for diagnostic coverage\n")
        return 23
    if method == "empty":
        sys.stderr.write("intentional empty stdout response\n")
        return 0
    if method == "invalid_json":
        sys.stderr.write("intentional invalid JSON response\n")
        sys.stdout.write("this is not json\n")
        return 0
    if method == "timeout":
        sys.stderr.write("intentional timeout; waiting for host termination\n")
        sys.stderr.flush()
        time.sleep(30)
        return 0

    response = {
        "protocol": PROTOCOL,
        "version": VERSION,
        "id": request_id,
        "ok": True,
        "result": {"message": "fault injector response"},
    }
    if method == "protocol_mismatch":
        response["protocol"] = "not-opendesk-native-extension"
    elif method == "request_id_mismatch":
        response["id"] = "wrong-request-id"
    elif method == "stderr_noise":
        sys.stderr.write("diagnostic line on stderr; stdout remains protocol-only\n")
    else:
        response["ok"] = False
        response.pop("result", None)
        response["error"] = {
            "code": "unknown_method",
            "message": f"unknown fault injection method: {method}",
        }
    write_json(response)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
