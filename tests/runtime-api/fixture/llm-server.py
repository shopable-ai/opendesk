#!/usr/bin/env python3
"""Deterministic loopback fixture for the two P0 LLM HTTP protocols."""

import argparse
import json
import os
import signal
import sys
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer


def find_scenario(body):
    source = body.get("input")
    if source is None:
        source = body.get("messages")
    if isinstance(source, str):
        return source.splitlines()[0]
    if isinstance(source, list):
        for item in reversed(source):
            if isinstance(item, dict) and item.get("role") == "user":
                content = item.get("content")
                if isinstance(content, str):
                    return content.splitlines()[0]
    return ""


class Handler(BaseHTTPRequestHandler):
    server_version = "OpenDeskLLMFixture/1"
    attempts = {}

    def log_message(self, _format, *_args):
        return

    def send_json(self, status, payload):
        encoded = json.dumps(payload, separators=(",", ":")).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(encoded)))
        self.end_headers()
        try:
            self.wfile.write(encoded)
        except BrokenPipeError:
            pass

    def do_POST(self):
        if self.headers.get("Authorization") not in ("Bearer fixture-secret", "Bearer fixture-profile-secret"):
            self.send_json(401, {"error": {"message": "unauthorized"}})
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
            body = json.loads(self.rfile.read(length))
        except Exception:
            self.send_json(400, {"error": {"message": "invalid request"}})
            return
        scenario = find_scenario(body)
        if scenario in ("CASE:timeout", "CASE:cancel"):
            time.sleep(2)
        if scenario == "CASE:http-error":
            self.send_json(503, {"error": {"message": "fixture unavailable", "secret": "must-not-leak"}})
            return
        if scenario == "CASE:non-retriable":
            self.send_json(400, {"error": {"message": "fixture request rejected"}})
            return
        if scenario == "CASE:retry-once":
            key = self.path + ":" + scenario
            Handler.attempts[key] = Handler.attempts.get(key, 0) + 1
            if Handler.attempts[key] == 1:
                self.send_json(503, {"error": {"message": "fixture transient failure"}})
                return
        if scenario == "CASE:invalid-http-json":
            payload = b"not-json"
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(payload)))
            self.end_headers()
            self.wfile.write(payload)
            return
        if self.path.endswith("/responses"):
            self.respond_responses(body, scenario)
            return
        if self.path.endswith("/chat/completions"):
            self.respond_chat(body, scenario)
            return
        self.send_json(404, {"error": {"message": "unknown fixture route"}})

    def respond_responses(self, body, scenario):
        base = {"id": "resp_fixture", "status": "completed", "model": "fixture-responses", "usage": {"input_tokens": 3, "output_tokens": 1}}
        if scenario in ("CASE:text-ok", "CASE:retry-once", "用一句话说明确定性自动化为什么仍应由普通 JavaScript 控制。"):
            base["output_text"] = "responses-text"
        elif scenario == "CASE:inspect":
            base["output_text"] = json.dumps({
                "hasInstructions": body.get("instructions") == "fixture-system",
                "hasMaxTokens": body.get("max_output_tokens") == 77,
                "hasReasoning": body.get("reasoning") == {"effort": "low"},
                "messageCount": len(body.get("input", [])) if isinstance(body.get("input"), list) else 0,
            }, separators=(",", ":"))
        elif scenario.startswith("给定计算器真实显示值 "):
            if not isinstance(body.get("text", {}).get("format"), dict):
                self.send_json(400, {"error": {"message": "missing native schema"}})
                return
            base["output_text"] = '{"value":12}'
        elif scenario in ("CASE:native-5", "CASE:native-10", "CASE:native-15", "CASE:native-string", "CASE:native-low", "CASE:native-high", "CASE:native-float", "CASE:native-extra", "CASE:native-missing", "CASE:native-explanation"):
            if not isinstance(body.get("text", {}).get("format"), dict):
                self.send_json(400, {"error": {"message": "missing native schema"}})
                return
            values = {
                "CASE:native-5": '{"value":5}', "CASE:native-10": '{"value":10}', "CASE:native-15": '{"value":15}',
                "CASE:native-string": '{"value":"10"}', "CASE:native-low": '{"value":4}', "CASE:native-high": '{"value":16}',
                "CASE:native-float": '{"value":8.5}', "CASE:native-extra": '{"value":10,"x":1}',
                "CASE:native-missing": '{}', "CASE:native-explanation": 'Answer: {"value":10}',
            }
            base["output_text"] = values[scenario]
        elif scenario == "CASE:local-ok":
            if "text" in body:
                self.send_json(400, {"error": {"message": "local mode sent native schema"}})
                return
            base["output_text"] = '{"value":11}'
        elif scenario == "CASE:incomplete":
            base["status"] = "in_progress"
        elif scenario == "CASE:refusal":
            base["output_text"] = "must-not-win"
            base["output"] = [{"type": "message", "content": [{"type": "refusal", "refusal": "no"}]}]
        elif scenario == "CASE:no-output":
            base["output"] = []
        elif scenario == "CASE:protocol-error":
            base["error"] = {"message": "fixture protocol error", "secret": "must-not-leak"}
        elif scenario == "CASE:protocol-specific-invalid":
            base["output"] = [{"type": "message", "status": "in_progress", "content": [{"type": "output_text", "text": "must-not-win"}]}]
        elif scenario == "CASE:protocol-tool":
            base["output_text"] = "must-not-win"
            base["output"] = [{"type": "function_call", "status": "completed", "name": "fixture_tool", "arguments": "{}"}]
        elif scenario in ("CASE:timeout", "CASE:cancel"):
            base["output_text"] = "late-result-must-not-win"
        else:
            self.send_json(400, {"error": {"message": "unknown responses case"}})
            return
        self.send_json(200, base)

    def respond_chat(self, body, scenario):
        base = {"id": "chatcmpl_fixture", "model": "fixture-chat", "usage": {"prompt_tokens": 3, "completion_tokens": 1}}
        content = ""
        finish = "stop"
        refusal = None
        if scenario in ("CASE:text-ok", "CASE:retry-once", "用一句话说明确定性自动化为什么仍应由普通 JavaScript 控制。"):
            content = "chat-text"
        elif scenario == "CASE:inspect":
            content = json.dumps({
                "hasSystem": bool(body.get("messages")) and body["messages"][0] == {"role": "system", "content": "fixture-system"},
                "hasMaxTokens": body.get("max_completion_tokens") == 77,
                "hasReasoning": body.get("reasoning_effort") == "low",
                "messageCount": len(body.get("messages", [])),
            }, separators=(",", ":"))
        elif scenario.startswith("给定计算器真实显示值 "):
            if not isinstance(body.get("response_format", {}).get("json_schema"), dict):
                self.send_json(400, {"error": {"message": "missing native schema"}})
                return
            content = '{"value":12}'
        elif scenario in ("CASE:native-5", "CASE:native-10", "CASE:native-15", "CASE:native-string", "CASE:native-low", "CASE:native-high", "CASE:native-float", "CASE:native-extra", "CASE:native-missing", "CASE:native-explanation"):
            if not isinstance(body.get("response_format", {}).get("json_schema"), dict):
                self.send_json(400, {"error": {"message": "missing native schema"}})
                return
            values = {
                "CASE:native-5": '{"value":5}', "CASE:native-10": '{"value":10}', "CASE:native-15": '{"value":15}',
                "CASE:native-string": '{"value":"10"}', "CASE:native-low": '{"value":4}', "CASE:native-high": '{"value":16}',
                "CASE:native-float": '{"value":8.5}', "CASE:native-extra": '{"value":10,"x":1}',
                "CASE:native-missing": '{}', "CASE:native-explanation": 'Answer: {"value":10}',
            }
            content = values[scenario]
        elif scenario == "CASE:local-ok":
            if "response_format" in body:
                self.send_json(400, {"error": {"message": "local mode sent native schema"}})
                return
            content = '{"value":11}'
        elif scenario == "CASE:incomplete":
            finish = "length"
            content = "partial"
        elif scenario == "CASE:refusal":
            refusal = "no"
        elif scenario == "CASE:no-output":
            self.send_json(200, {"id": "chatcmpl_fixture", "model": "fixture-chat", "choices": []})
            return
        elif scenario == "CASE:protocol-error":
            self.send_json(200, {"id": "chatcmpl_fixture", "model": "fixture-chat", "choices": [{"finish_reason": "stop"}]})
            return
        elif scenario == "CASE:protocol-specific-invalid":
            self.send_json(200, {"id": "chatcmpl_fixture", "model": "fixture-chat", "choices": [{"finish_reason": "stop", "message": {"role": "assistant", "content": "must-not-win", "tool_calls": [{"id": "tool_fixture"}]}}]})
            return
        elif scenario == "CASE:protocol-tool":
            self.send_json(200, {"id": "chatcmpl_fixture", "model": "fixture-chat", "choices": [{"finish_reason": "stop", "message": {"role": "assistant", "content": "must-not-win", "tool_calls": [{"id": "tool_fixture"}]}}]})
            return
        elif scenario in ("CASE:timeout", "CASE:cancel"):
            content = "late-result-must-not-win"
        else:
            self.send_json(400, {"error": {"message": "unknown chat case"}})
            return
        base["choices"] = [{"finish_reason": finish, "message": {"role": "assistant", "content": content, "refusal": refusal}}]
        self.send_json(200, base)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--ready", required=True)
    args = parser.parse_args()
    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    os.makedirs(os.path.dirname(os.path.abspath(args.ready)), exist_ok=True)
    with open(args.ready, "w", encoding="utf-8") as handle:
        json.dump({"pid": os.getpid(), "baseURL": "http://127.0.0.1:%d" % server.server_address[1]}, handle)
    signal.signal(signal.SIGTERM, lambda *_: sys.exit(0))
    server.serve_forever()


if __name__ == "__main__":
    main()
