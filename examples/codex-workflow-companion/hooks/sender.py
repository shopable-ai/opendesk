#!/usr/bin/env python3
"""Narrow Codex Hook sender for the companion. Reuses proven A->B HTTP transport.

The Hook is advisory and never starts a next task, approves work, or blocks Codex.
"""
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import stat
import sys
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parents[3]
RUN_DIR = Path(os.environ.get('OD_CWF_STATE_DIR', ROOT / '.runtime/tests/codex-workflow-companion')).resolve()
ENDPOINT = RUN_DIR / 'endpoint.json'
SOURCE = 'codex-workflow-companion'
PROTOCOL = 'od.codex-workflow.v1'
UUID = r'[a-f0-9-]{36}'
MARKER = re.compile(rf'^OD-CWF/v1 run=({UUID}) task=([ABC]) attempt=({UUID}) claim=({UUID})\n')

# Reuse the previously tested transport; do not fork a second HTTP sender.
spec = importlib.util.spec_from_file_location('od_codex_hook_transport', ROOT / 'examples/workflows/codex-hook-demo/sender.py')
transport = importlib.util.module_from_spec(spec)
spec.loader.exec_module(transport)
transport.SOURCE = SOURCE  # Same tested sender function, companion-specific trusted source header.


def load_endpoint():
    if ENDPOINT.is_symlink():
        raise ValueError('ENDPOINT_SYMLINK')
    st = ENDPOINT.stat()
    if not stat.S_ISREG(st.st_mode) or st.st_mode & 0o077:
        raise ValueError('ENDPOINT_PERMISSIONS')
    cfg = json.loads(ENDPOINT.read_text('utf-8'))
    u = urlsplit(cfg.get('url', ''))
    auth = cfg.get('headers', {}).get('Authorization')
    if (cfg.get('protocol') != PROTOCOL or u.scheme != 'http' or u.hostname != '127.0.0.1' or
        not u.port or u.path not in ('','/') or u.query or u.fragment or u.username or u.password or
        not isinstance(auth, str) or not re.fullmatch(r'Bearer [a-f0-9]{64}', auth)):
        raise ValueError('ENDPOINT_INVALID')
    return {**cfg, 'url': cfg['url'].rstrip('/') + '/api/hook'}, urlsplit(cfg['url'].rstrip('/') + '/api/hook')


def identity(raw):
    if not isinstance(raw, dict):
        return None
    session, turn, cwd = raw.get('session_id'), raw.get('turn_id'), raw.get('cwd')
    if not isinstance(session, str) or not 0 < len(session) <= 200 or not isinstance(turn, str) or not 0 < len(turn) <= 200 or not isinstance(cwd, str):
        return None
    try:
        if os.path.commonpath([str(ROOT), str(Path(cwd).resolve())]) != str(ROOT):
            return None
    except (OSError, ValueError):
        return None
    return session, turn


def binding_path(session, turn):
    digest = hashlib.sha256((session + '\0' + turn).encode()).hexdigest()
    return RUN_DIR / ('hook-binding-' + digest + '.json')


def parse_event(raw):
    ids = identity(raw)
    if not ids:
        return None
    session, turn = ids
    if raw.get('hook_event_name') == 'UserPromptSubmit':
        match = MARKER.match(raw.get('prompt', '') if isinstance(raw.get('prompt'), str) else '')
        if not match:
            return None
        run, task, attempt, nonce = match.groups()
        return ({'protocol': PROTOCOL, 'kind':'prompt', 'workflowId':run, 'taskId':task,
                 'attemptId':attempt,'nonce':nonce,'sessionId':session,'turnId':turn}, True)
    if raw.get('hook_event_name') == 'Stop' and raw.get('stop_hook_active') is False:
        file = binding_path(session, turn)
        if not file.is_file() or file.is_symlink() or file.stat().st_mode & 0o077:
            return None
        bound = json.loads(file.read_text('utf-8'))
        if bound.get('sessionId') != session or bound.get('turnId') != turn:
            return None
        return ({'protocol':PROTOCOL,'kind':'stop','workflowId':bound['workflowId'],
                 'taskId':bound['taskId'],'attemptId':bound['attemptId'],
                 'sessionId':session,'turnId':turn,'stopHookActive':False}, False)
    return None


def main():
    try:
        data = sys.stdin.buffer.read(65537)
        if len(data) > 65536:
            raise ValueError('INPUT_TOO_LARGE')
        event = parse_event(json.loads(data))
        if event:
            payload, is_prompt = event
            config, parts = load_endpoint()
            # Reuses bounded authenticated loopback sender, deterministic delivery ID.
            transport.send_event(payload, config, parts)
            if is_prompt:
                p = binding_path(payload['sessionId'],payload['turnId'])
                try:
                    with p.open('x', encoding='utf-8') as f:
                        os.chmod(p, 0o600)
                        json.dump(payload, f)
                except FileExistsError:
                    if json.loads(p.read_text('utf-8')) != payload:
                        raise ValueError('HOOK_BINDING_CONFLICT')
    except Exception as exc:
        print('OD_CWF_HOOK_ERROR=' + type(exc).__name__, file=sys.stderr)
    print('{"continue":true}')

if __name__ == '__main__':
    main()
