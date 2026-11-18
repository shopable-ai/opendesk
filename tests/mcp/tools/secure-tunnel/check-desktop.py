#!/usr/bin/env python3
"""Bounded, local checks for desktop-tunnel.py; never starts cloud polling."""
import argparse
import contextlib
import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import shlex
import socket
import subprocess
import sys
import tempfile
from unittest import mock

SOURCE = Path(__file__).with_name('desktop-tunnel.py').resolve()
REPO = SOURCE.parents[4]


def stop_checks(run, passed):
    # All identity, port and signal operations are mocked: never inspect or
    # signal the leader's client, nor start a local stand-in service.
    sys.dont_write_bytecode = True
    spec = importlib.util.spec_from_file_location('desktop_tunnel_checks', SOURCE)
    helper = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(helper)
    pid = 424242
    manifest = {'client': '/fixture/tunnel-client', 'profile': str(run / 'desktop.yaml'), 'port': 43210}
    argv = (manifest['client'], 'run', '--config', manifest['profile'],
            '--control-plane.http-proxy', 'http://127.0.0.1:7897',
            '--pid.file', str(run / 'client.pid'), '--log.file', str(run / 'client.log'),
            '--tracing.enabled', '--tracing.file', str(run / 'metadata-trace-1.jsonl'))
    identity = (os.getuid(), 'fixture-start', manifest['client'], argv)
    owner = {(pid, '127.0.0.1:43210')}
    pidfile = run / 'client.pid'
    pidfile.write_text(str(pid))
    pidfile.chmod(0o644)

    def rejected(call):
        try:
            call()
        except (helper.OperatorError, OSError):
            return
        raise AssertionError('Unsafe operation was accepted')

    assert helper.read_pid(run) == pid
    assert pidfile.stat().st_mode & 0o777 == 0o644
    for mode in (0o640, 0o664, 0o666):
        pidfile.chmod(mode)
        rejected(lambda: helper.read_pid(run))
        assert pidfile.stat().st_mode & 0o777 == mode
    pidfile.chmod(0o644)
    run.chmod(0o755)
    try:
        rejected(lambda: helper.read_pid(run))
    finally:
        run.chmod(0o700)
    original_stat = Path.stat

    def foreign_owner(path, *args, **kwargs):
        info = original_stat(path, *args, **kwargs)
        if path in (pidfile, run):
            values = list(info)
            values[4] = os.getuid() + 1
            return os.stat_result(values)
        return info

    with mock.patch.object(Path, 'stat', foreign_owner):
        rejected(lambda: helper.read_pid(run))
    passed('official 0644 PID accepted only in private owned directory; unsafe metadata rejected without chmod')

    with mock.patch.object(helper.os, 'kill') as kill, \
            mock.patch.object(helper, 'process_identity', return_value=identity) as process, \
            mock.patch.object(helper, 'port_owners', return_value=owner) as owners:
        assert helper.owned_identity(pid, manifest) == identity
        for changed in ((os.getuid() + 1, *identity[1:]),
                        (*identity[:2], '/fixture/other', argv),
                        (*identity[:3], (*argv[:3], '/other/profile', *argv[4:])),
                        (*identity[:3], (*argv, '--config', '/other/profile')),
                        (*identity[:3], (argv[0], 'doctor', *argv[2:])), None):
            process.return_value = changed
            rejected(lambda: helper.stop_run(run, manifest))
        process.return_value = identity
        for changed in (set(), {(pid + 1, '127.0.0.1:43210')},
                        {(pid, '*:43210')}, owner | {(pid + 1, '127.0.0.1:43210')}):
            owners.return_value = changed
            rejected(lambda: helper.stop_run(run, manifest))
        owners.return_value = owner
        for invalid in ('', '1', '-1', '12 trailing', '99999999999'):
            pidfile.write_text(invalid)
            rejected(lambda: helper.stop_run(run, manifest))
        pidfile.unlink()
        rejected(lambda: helper.stop_run(run, manifest))
        kill.assert_not_called()
    passed('stop fails closed for absent/invalid PID, UID, executable, argv and listener conflicts')

    pidfile.write_text(str(pid))
    pidfile.chmod(0o600)
    with mock.patch.object(helper.os, 'kill') as kill, \
            mock.patch.object(helper, 'process_identity', side_effect=[identity, identity, None]), \
            mock.patch.object(helper, 'port_owners', side_effect=[owner, owner, set()]), \
            contextlib.redirect_stdout(io.StringIO()) as output:
        helper.stop_run(run, manifest)
        kill.assert_called_once_with(pid, helper.signal.SIGTERM)
        assert json.loads(output.getvalue())['clientExited'] is True
        assert json.loads(output.getvalue())['portReleased'] is True
    passed('stop accepts extra proxy/log/PID/tracing flags and reports graceful exit/port release')

    for live, listening in ((identity, owner), (None, owner), (identity, set())):
        with mock.patch.object(helper.os, 'kill') as kill, \
                mock.patch.object(helper, 'process_identity', side_effect=[identity, identity, live]), \
                mock.patch.object(helper, 'port_owners', side_effect=[owner, owner, listening]), \
                mock.patch.object(helper.time, 'monotonic', side_effect=[0, 11]), \
                contextlib.redirect_stdout(io.StringIO()) as output:
            rejected(lambda: helper.stop_run(run, manifest))
            kill.assert_called_once_with(pid, helper.signal.SIGTERM)
            observed = json.loads(output.getvalue())
            assert observed['clientExited'] == (live is None)
            assert observed['portReleased'] == (not listening)
    passed('bounded stop reports independent exit/release failures without escalation')

    with mock.patch.object(helper.os, 'kill') as kill, \
            mock.patch.object(helper, 'process_identity', side_effect=[identity, (*identity[:1], 'new-start', *identity[2:])]), \
            mock.patch.object(helper, 'port_owners', return_value=owner):
        rejected(lambda: helper.stop_run(run, manifest))
        kill.assert_not_called()
    passed('process identity is rechecked immediately before the only signal')

    with mock.patch.object(helper.os, 'kill') as kill, \
            mock.patch.object(helper, 'process_identity', side_effect=[identity, identity, (*identity[:1], 'new-start', *identity[2:])]), \
            mock.patch.object(helper, 'port_owners', return_value=owner):
        rejected(lambda: helper.stop_run(run, manifest))
        kill.assert_called_once_with(pid, helper.signal.SIGTERM)
    passed('PID identity changes after SIGTERM never receive another signal')

    # Exercise the kernel snapshot decoder with synthetic macOS records.
    raw = (len(argv).to_bytes(4, sys.byteorder) + manifest['client'].encode() + b'\0\0'
           + b'\0'.join(arg.encode() for arg in argv) + b'\0ENV=ignored\0')

    def pidpath(_pid, buffer, _length):
        buffer.value = manifest['client'].encode()
        return len(buffer.value)

    def procargs(_mib, _count, buffer, size, _new, _newsize):
        buffer.raw = raw
        size._obj.value = len(raw)
        return 0

    library = mock.Mock()
    library.proc_pidpath.side_effect = pidpath
    library.sysctl.side_effect = procargs
    record = subprocess.CompletedProcess([], 0, f'{os.getuid()} fixture-start\n'.encode(), b'')
    with mock.patch.object(helper.sys, 'platform', 'darwin'), \
            mock.patch.object(helper, 'local_command', return_value=record), \
            mock.patch.object(helper.ctypes, 'CDLL', return_value=library):
        assert helper.process_identity(pid) == identity
    with mock.patch.object(helper, 'local_command', return_value=subprocess.CompletedProcess(
            [], 0, f'p{pid}\nf7\nn127.0.0.1:43210\n'.encode(), b'')):
        assert helper.port_owners(43210) == owner
    passed('macOS kernel argv/executable and lsof owner parsing use synthetic fixtures')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--client', type=Path, help='Optional official client for a stdio-only doctor check.')
    options = parser.parse_args()
    evidence = REPO / '.runtime/tests/mcp-tunnel/desktop-helper-checks'
    evidence.mkdir(parents=True, exist_ok=True)
    results = []
    with tempfile.TemporaryDirectory(dir=evidence) as temporary:
        root = Path(temporary).resolve()
        private = root / 'private'
        private.mkdir(mode=0o700)
        key = private / 'runtime.key'
        key.write_text('sk-desktop-local-fixture-only\n')
        key.chmod(0o600)
        binary = root / 'mcp'
        binary.write_text('#!/usr/bin/python3\nimport json,os\nprint(json.dumps({"envNames":sorted(os.environ)}))\n')
        binary.chmod(0o700)
        client = root / 'client'
        client.write_text('''#!/usr/bin/python3
import json,os,sys
result = {"action":sys.argv[1],"argv":sys.argv[1:],"envNames":sorted(os.environ)}
if sys.argv[1] == 'run':
    path = sys.argv[sys.argv.index('--pid.file') + 1]
    result['pidModeBefore'] = os.stat(path).st_mode & 0o777
    result['pidInodeBefore'] = os.stat(path).st_ino
    # Mock the usual create-or-truncate writer with a 0644 creation mode.
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o644)
    os.write(fd, b'424242\\n')
    os.close(fd)
    result['pidModeAfter'] = os.stat(path).st_mode & 0o777
    result['pidInodeAfter'] = os.stat(path).st_ino
print(json.dumps(result))
''')
        client.chmod(0o700)
        dirty_env = dict(os.environ, CONTROL_PLANE_API_KEY='DO_NOT_INHERIT_RUNTIME_KEY',
                         OPENAI_API_KEY='DO_NOT_INHERIT_API_KEY', MCP_COMMAND='DO_NOT_INHERIT_COMMAND',
                         HEALTH_LISTEN_ADDR='0.0.0.0:3000', HTTP_PROXY='DO_NOT_INHERIT_PROXY',
                         HTTPS_PROXY='DO_NOT_INHERIT_PROXY', ALL_PROXY='DO_NOT_INHERIT_PROXY',
                         http_proxy='DO_NOT_INHERIT_PROXY', https_proxy='DO_NOT_INHERIT_PROXY',
                         CONTROL_PLANE_HTTP_PROXY='DO_NOT_INHERIT_PROXY')

        def invoke(action, run, *extra):
            return subprocess.run([sys.executable, str(SOURCE), action, '--run-dir', str(run), *map(str, extra)],
                                  capture_output=True, text=True, env=dirty_env, timeout=15)

        def prepare(run, selected_client=client, selected_key=key, port=3001, extra=()):
            return invoke('prepare', run, '--client', selected_client, '--binary', binary,
                          '--key-file', selected_key, '--tunnel-id', 'tunnel_00000000000000000000000000000000',
                          '--organization-id', 'org-local-configuration-fixture', '--port', port, *extra)

        def passed(name):
            results.append({'name': name, 'status': 'PASS'})

        run = root / 'main'
        result = prepare(run)
        assert result.returncode == 0
        profile = (run / 'desktop.yaml').read_text()
        assert key.read_text().strip() not in profile
        assert 'file:' + str(key) in profile and '127.0.0.1:3001' in profile
        assert '/usr/bin/env -i ' in profile and 'http_raw_unsafe: false' in profile
        assert 'DO_NOT_INHERIT' not in profile
        command = json.loads(next(line.split('command: ', 1)[1] for line in profile.splitlines()
                                  if line.startswith('      command: ')))
        child = subprocess.run(shlex.split(command), env=dirty_env, capture_output=True, text=True, timeout=10)
        assert child.returncode == 0
        assert not {'CONTROL_PLANE_API_KEY', 'OPENAI_API_KEY', 'MCP_COMMAND', 'HTTP_PROXY',
                    'HEALTH_LISTEN_ADDR'} & set(json.loads(child.stdout)['envNames'])
        checked = invoke('doctor', run)
        assert checked.returncode == 0
        observed = json.loads(checked.stdout)
        assert observed['action'] == 'doctor'
        assert not {'CONTROL_PLANE_API_KEY', 'OPENAI_API_KEY', 'MCP_COMMAND', 'HTTP_PROXY',
                    'HEALTH_LISTEN_ADDR'} & set(observed['envNames'])
        passed('file reference and clean official-client/MCP environment')

        proxy_run = root / 'proxy'
        assert prepare(proxy_run, extra=('--control-plane-proxy', 'HTTP://LOCALHOST:080')).returncode == 0
        assert '  http_proxy: "http://localhost"' in (proxy_run / 'desktop.yaml').read_text()
        assert 'http_proxy:' not in profile
        for invalid in ('https://localhost:7897', 'env:HTTP_PROXY', 'http://u:p@localhost',
                        'http://localhost/', 'http://localhost/path', 'http://localhost?',
                        'http://localhost#', ' http://localhost', 'http://localhost:0',
                        'http://localhost:65536', 'http://localhost:', 'http://local%host',
                        'http://localhost\\path', ''):
            assert prepare(root / 'bad-proxy', extra=('--control-plane-proxy', invalid)).returncode != 0
            assert not (root / 'bad-proxy').exists()
            assert invoke('doctor', run, '--control-plane-proxy', invalid).returncode != 0
        proxy_checked = invoke('doctor', run, '--control-plane-proxy', 'http://127.0.0.1:7897')
        assert proxy_checked.returncode == 0
        assert json.loads(proxy_checked.stdout)['argv'][-2:] == ['--control-plane.http-proxy', 'http://127.0.0.1:7897']
        assert 'http_proxy:' not in (run / 'desktop.yaml').read_text()
        passed('explicit normalized proxy config/doctor override; unsafe URLs rejected without profile changes')

        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as available:
            available.bind(('127.0.0.1', 0))
            free_port = available.getsockname()[1]
        mock_run = root / 'mock-run'
        assert prepare(mock_run, port=free_port).returncode == 0
        started = invoke('run', mock_run, '--control-plane-proxy', 'http://127.0.0.1:7897')
        assert started.returncode == 0
        observed = json.loads(started.stdout)
        assert observed['argv'] == ['run', '--config', str(mock_run / 'desktop.yaml'),
                                    '--control-plane.http-proxy', 'http://127.0.0.1:7897',
                                    '--pid.file', str(mock_run / 'client.pid'),
                                    '--log.file', str(mock_run / 'client.log')]
        assert (mock_run / 'client.log').stat().st_mode & 0o777 == 0o600
        assert observed['pidModeBefore'] == observed['pidModeAfter'] == 0o600
        assert observed['pidInodeBefore'] == observed['pidInodeAfter']
        assert (mock_run / 'client.pid').read_text() == '424242\n'
        assert not {'HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'CONTROL_PLANE_HTTP_PROXY'} & set(observed['envNames'])
        passed('foreground mock run receives official PID/log/proxy flags with private log and clean environment')
        pid_before = (mock_run / 'client.pid').read_bytes()
        assert invoke('run', mock_run).returncode != 0
        assert (mock_run / 'client.pid').read_bytes() == pid_before
        passed('0600 PID precreation survives mock truncate writer; existing PID blocks restart without changes')

        assert invoke('status', mock_run).returncode != 0
        (mock_run / 'client.pid').write_text('424242\n')
        (mock_run / 'client.pid').chmod(0o644)
        (mock_run / 'health.url').write_text(f'http://127.0.0.1:{free_port}\n')
        (mock_run / 'health.url').chmod(0o600)
        health = invoke('status', mock_run)
        assert health.returncode == 0
        assert (mock_run / 'client.pid').stat().st_mode & 0o777 == 0o644
        assert json.loads(health.stdout)['argv'] == ['health', '--url-file', str(mock_run / 'health.url'),
                                                   '--pid-file', str(mock_run / 'client.pid'),
                                                   '--require-control-plane-poll', '--json']
        assert invoke('run', mock_run).returncode != 0
        (mock_run / 'health.url').write_text('https://example.invalid')
        assert invoke('status', mock_run).returncode != 0
        passed('status delegates to official health with poll readiness; absent PID/foreign URL and restart rejected')
        stop_checks(mock_run, passed)

        (mock_run / 'client.pid').unlink()
        target = root / 'untouched-pid'
        target.write_text('424242')
        target.chmod(0o600)
        (mock_run / 'client.pid').symlink_to(target)
        assert invoke('stop', mock_run).returncode != 0
        assert invoke('status', mock_run).returncode != 0
        assert invoke('run', mock_run).returncode != 0
        (mock_run / 'client.pid').unlink()
        os.link(target, mock_run / 'client.pid')
        assert invoke('stop', mock_run).returncode != 0
        assert invoke('status', mock_run).returncode != 0
        (mock_run / 'client.pid').unlink()
        (mock_run / 'client.log').unlink()
        (mock_run / 'client.log').symlink_to(target)
        assert invoke('run', mock_run).returncode != 0
        assert target.read_text() == '424242'
        passed('runtime PID/log symlinks and hardlinked PID are rejected without touching targets')

        before = hashlib.sha256((run / 'desktop.yaml').read_bytes()).hexdigest()
        assert prepare(run).returncode != 0
        assert hashlib.sha256((run / 'desktop.yaml').read_bytes()).hexdigest() == before
        passed('existing prepared configuration is not overwritten')

        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as listener:
            listener.bind(('127.0.0.1', 0))
            listener.listen()
            occupied = root / 'occupied'
            assert prepare(occupied, port=listener.getsockname()[1]).returncode == 0
            refused = invoke('run', occupied)
            assert refused.returncode != 0 and 'port is occupied' in refused.stderr
            assert listener.getsockname()[1] > 0
        passed('conflicting loopback listener is preserved; client not executed')

        key.chmod(0o640)
        assert invoke('doctor', run).returncode != 0
        assert prepare(root / 'bad-permissions').returncode != 0
        key.chmod(0o600)
        passed('unsafe key permissions rejected before preparation or execution')

        link = private / 'link.key'
        link.symlink_to(key)
        assert prepare(root / 'bad-symlink', selected_key=link).returncode != 0
        passed('symlink credential reference rejected')

        binary.write_text('#!/bin/sh\nexit 1\n')
        assert invoke('doctor', run).returncode != 0
        passed('changed MCP artifact rejected before official-client execution')

        if options.client:
            # Official v0.0.18 stdio doctor checks configuration/executable
            # availability only; it neither polls OpenAI nor starts this MCP.
            official = root / 'official'
            assert prepare(official, selected_client=options.client.resolve()).returncode == 0
            checked = invoke('doctor', official)
            # This run contains only synthetic credentials and a mock MCP;
            # keep its diagnostic so an invalid profile cannot hide behind a test.
            (evidence / 'official-doctor.json').write_text(json.dumps({
                'code': checked.returncode,
                'output': (checked.stdout + checked.stderr).replace(key.read_text().strip(), '[fixture-key]'),
                'onlinePollingStarted': False}, indent=2) + '\n')
            assert checked.returncode == 0, 'Official stdio configuration doctor did not pass.'
            passed('official client accepts the generated stdio profile (no online proof)')
    print(json.dumps({'checks': results, 'onlinePollingStarted': False}, indent=2))


if __name__ == '__main__':
    main()
