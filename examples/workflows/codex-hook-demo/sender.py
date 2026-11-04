#!/usr/bin/env python3
"""OD-CODEX-HOOK-DEMO Codex UserPromptSubmit/Stop hook -> OpenDesk localhost Webhook.

Hook never controls the desktop, waits for B, or changes Codex execution behavior.
"""
import hashlib
import http.client
import json
import os
from pathlib import Path
import re
import stat
import sys
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parents[3]
ENDPOINT = ROOT / '.runtime/tests/codex-hook-demo/endpoint.json'
SOURCE = 'codex-hook-demo'
PROTOCOL = 'od.codex-hook-demo.v1'
TAG = 'OD-CODEX-HOOK-DEMO'
RUN = r'([0-9a-f]{32})'
PROMPT_RE = re.compile(
    rf'^{TAG} ([AB]) {RUN}\n请只输出以下一行，不要调用工具、不要添加其他字符：\n'
    rf'{TAG} DONE \1 \2$'
)
DONE_RE = re.compile(rf'^{TAG} DONE ([AB]) {RUN}$')


def parse_hook(raw):
    if not isinstance(raw, dict):
        return None
    hook_name = raw.get('hook_event_name')
    session_id, turn_id = raw.get('session_id'), raw.get('turn_id')
    cwd = raw.get('cwd')
    if (not isinstance(session_id, str) or not 0 < len(session_id) <= 200 or
            not isinstance(turn_id, str) or not 0 < len(turn_id) <= 200 or
            not isinstance(cwd, str) or not cwd):
        return None
    try:
        if os.path.commonpath([str(ROOT), str(Path(cwd).resolve())]) != str(ROOT):
            return None
    except (ValueError, OSError):
        return None
    if hook_name == 'UserPromptSubmit':
        m = PROMPT_RE.fullmatch(raw.get('prompt', '') if isinstance(raw.get('prompt'), str) else '')
        if not m:
            return None
        role, run_id = m.groups()
        return dict(protocol=PROTOCOL, kind='prompt', role=role, runId=run_id,
                    sessionId=session_id, turnId=turn_id)
    if hook_name == 'Stop':
        if raw.get('stop_hook_active') is not False:
            return None
        message = raw.get('last_assistant_message')
        m = DONE_RE.fullmatch(message.strip()) if isinstance(message, str) else None
        if not m:
            return None
        role, run_id = m.groups()
        return dict(protocol=PROTOCOL, kind='stop', role=role, runId=run_id,
                    sessionId=session_id, turnId=turn_id, stopHookActive=False, completed=True)
    return None


def read_endpoint(path=ENDPOINT):
    if path.is_symlink():
        raise ValueError('ENDPOINT_SYMLINK')
    st = path.stat()
    if not stat.S_ISREG(st.st_mode) or st.st_mode & 0o077:
        raise ValueError('ENDPOINT_PERMISSIONS')
    config = json.loads(path.read_text(encoding='utf-8'))
    parts = urlsplit(config['url'])
    if (config.get('protocol') != PROTOCOL or parts.scheme != 'http' or
            parts.hostname != '127.0.0.1' or not parts.port or
            not re.fullmatch(r'/v1/webhook/[A-Za-z0-9_-]+', parts.path) or
            parts.username or parts.password or parts.query or parts.fragment):
        raise ValueError('ENDPOINT_INVALID')
    auth = config.get('headers', {}).get('Authorization')
    if not isinstance(auth, str) or not auth.startswith('Bearer ') or len(auth) > 512:
        raise ValueError('ENDPOINT_AUTH_INVALID')
    return config, parts


def send_event(event, config, parts):
    # http.client does not follow redirects; credentials cannot leak to another host.
    payload = json.dumps(event, ensure_ascii=False, separators=(',', ':')).encode('utf-8')
    delivery = hashlib.sha256(payload).hexdigest()[:40]
    conn = http.client.HTTPConnection('127.0.0.1', parts.port, timeout=0.8)
    try:
        conn.request('POST', parts.path, body=payload, headers={
            'Authorization': config['headers']['Authorization'],
            'Content-Type': 'application/json',
            'X-OpenDesk-Source': SOURCE,
            'X-OpenDesk-Delivery-Id': delivery,
        })
        res = conn.getresponse()
        res.read(4096)
        if res.status not in (200, 202):
            raise RuntimeError('RECEIVER_HTTP_' + str(res.status))
    finally:
        conn.close()


def main():
    try:
        raw_data = sys.stdin.buffer.read(65537)
        if len(raw_data) > 65536:
            raise ValueError('INPUT_TOO_LARGE')
        event = parse_hook(json.loads(raw_data))
        if event is not None:
            config, parts = read_endpoint()
            if config.get('runId') == event['runId']:
                send_event(event, config, parts)
    except Exception as exc:
        # Never print credentials, the raw transcript or the prompt.
        print('OD_CODEX_DEMO_HOOK_FAILED=' + type(exc).__name__, file=sys.stderr)
    # Always advisory: Stop must not block/continue the official Codex agent.
    print('{"continue":true}')


if __name__ == '__main__':
    main()
