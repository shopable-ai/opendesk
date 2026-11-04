"""Only component tests; no official Codex or OpenDesk desktop is involved."""
import http.server
import importlib.util
import json
from pathlib import Path
import tempfile
import threading
import unittest

SENDER = Path(__file__).resolve().parents[2] / 'examples/workflows/codex-hook-demo/sender.py'
spec = importlib.util.spec_from_file_location('codex_demo_sender', SENDER)
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)
ID = '12345678123412341234123456781234'


def prompt(role):
    return f'OD-CODEX-HOOK-DEMO {role} {ID}\n请只输出以下一行，不要调用工具、不要添加其他字符：\nOD-CODEX-HOOK-DEMO DONE {role} {ID}'


def hook(name, **kwargs):
    return {'hook_event_name': name, 'session_id':'session-1', 'turn_id':'turn-1',
            'cwd':str(mod.ROOT), **kwargs}


class SenderTests(unittest.TestCase):
    def test_prompt_and_stop_are_narrow(self):
        p = mod.parse_hook(hook('UserPromptSubmit', prompt=prompt('A')))
        self.assertEqual((p['role'],p['kind'],p['runId']),('A','prompt',ID))
        s = mod.parse_hook(hook('Stop',last_assistant_message=f'OD-CODEX-HOOK-DEMO DONE A {ID}',stop_hook_active=False))
        self.assertEqual((s['role'],s['kind'],s['completed']),('A','stop',True))
        self.assertIsNone(mod.parse_hook(hook('Stop',last_assistant_message=f'OD-CODEX-HOOK-DEMO DONE A {ID}',stop_hook_active=True)))
        self.assertIsNone(mod.parse_hook(hook('UserPromptSubmit',prompt=prompt('A')+' extra')))
        self.assertIsNone(mod.parse_hook(hook('Stop',last_assistant_message='just stopped',stop_hook_active=False)))
        self.assertIsNone(mod.parse_hook(hook('PostToolUse',prompt=prompt('A'))))
        self.assertIsNone(mod.parse_hook({**hook('Stop',last_assistant_message=f'OD-CODEX-HOOK-DEMO DONE A {ID}',stop_hook_active=False),'cwd':'/tmp/another-project'}))

    def test_wrong_root_or_stale_payload_is_ignored(self):
        self.assertIsNone(mod.parse_hook(hook('UserPromptSubmit', prompt=prompt('B')+'\n')))
        self.assertIsNone(mod.parse_hook(hook('Stop', last_assistant_message='BAD', stop_hook_active=False)))
        self.assertIsNone(mod.parse_hook(hook('Interrupt', last_assistant_message='hello')))
        self.assertIsNone(mod.parse_hook({**hook('UserPromptSubmit', prompt=prompt('A')), 'session_id': None}))

    def test_private_endpoint_and_local_transport(self):
        observed = []
        class Handler(http.server.BaseHTTPRequestHandler):
            def do_POST(self):
                size=int(self.headers['Content-Length'])
                observed.append((self.path, dict(self.headers), json.loads(self.rfile.read(size))))
                self.send_response(202); self.end_headers(); self.wfile.write(b'{"ok":true}')
            def log_message(self, *args): pass
        server=http.server.HTTPServer(('127.0.0.1', 0),Handler)
        t=threading.Thread(target=server.serve_forever,daemon=True);t.start()
        try:
            with tempfile.TemporaryDirectory() as d:
                path=Path(d)/'endpoint.json'
                config={'protocol':mod.PROTOCOL,'runId':ID,
                        'url':f'http://127.0.0.1:{server.server_port}/v1/webhook/test',
                        'headers':{'Authorization':'Bearer test-token'}}
                path.write_text(json.dumps(config)); path.chmod(0o600)
                loaded,parts=mod.read_endpoint(path)
                msg=mod.parse_hook(hook('UserPromptSubmit',prompt=prompt('A')))
                mod.send_event(msg,loaded,parts)
                self.assertEqual(len(observed),1)
                url,headers,body=observed[0]
                self.assertEqual(url,'/v1/webhook/test')
                self.assertEqual(headers['Authorization'],'Bearer test-token')
                self.assertEqual(body['turnId'],'turn-1')
                path.chmod(0o644)
                with self.assertRaisesRegex(ValueError, 'ENDPOINT_PERMISSIONS'):
                    mod.read_endpoint(path)
                path.chmod(0o600)
                config['url'] = 'http://localhost:1234/v1/webhook/x'
                path.write_text(json.dumps(config))
                with self.assertRaisesRegex(ValueError, 'ENDPOINT_INVALID'):
                    mod.read_endpoint(path)
                link=Path(d)/'link.json';link.symlink_to(path)
                with self.assertRaisesRegex(ValueError, 'ENDPOINT_SYMLINK'):
                    mod.read_endpoint(link)
        finally:
            server.shutdown();t.join();server.server_close()

if __name__ == '__main__':
    unittest.main()
