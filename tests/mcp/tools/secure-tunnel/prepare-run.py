#!/usr/bin/env python3
"""Prepare a fresh pinned tunnel run; files mode must be explicitly selected."""
import argparse
import datetime
import hashlib
import json
import os
from pathlib import Path
import re
import shlex
import shutil
import stat
import subprocess
import sys
import tempfile

REPO = Path(__file__).resolve().parents[4]
TOOLS = Path(__file__).resolve().parent
ROOT = REPO / '.runtime/tests/mcp-chatgpt-web'
FILES_ROOT = REPO / '.runtime/tests/mcp-files-core'


def regular(path):
    path = Path(path).expanduser().absolute()
    if path.is_symlink() or any(parent.is_symlink() for parent in path.parents):
        raise ValueError('Artifact paths must not contain symbolic links')
    if not stat.S_ISREG(path.stat().st_mode):
        raise ValueError('Artifact must be a regular file')
    return path


def digest(path):
    with path.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def private_reference(path):
    # Metadata only: Native owns capability parsing and authentication.
    path = regular(path)
    info, parent = path.stat(), path.parent.stat()
    if (info.st_uid != os.getuid() or info.st_nlink != 1
            or stat.S_IMODE(info.st_mode) != 0o600
            or parent.st_uid != os.getuid() or stat.S_IMODE(parent.st_mode) != 0o700):
        raise ValueError('Private credential reference required')
    return path


def prepare(index, binary=None, client=None, provenance=None, *, mode='nonce', core_run=None, credential=None,
            drop_write_response_for_request_id=None):
    if mode not in ('nonce', 'files'):
        raise ValueError('Unknown mode')
    if drop_write_response_for_request_id is not None:
        if (mode != 'files' or not isinstance(drop_write_response_for_request_id, str)
                or not re.fullmatch(r'[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}', drop_write_response_for_request_id)):
            raise ValueError('Fault injection requires files mode and canonical UUID')
    if mode == 'files':
        if binary is None or provenance is None or core_run is None or credential is None:
            raise ValueError('Files mode requires explicit candidate, provenance, core run and credential reference')
        credential = private_reference(credential)
        core_run = Path(core_run).expanduser().absolute()
        if (core_run.parent != FILES_ROOT or not core_run.is_dir()
                or core_run != core_run.resolve()):
            raise ValueError('Existing unique core run required')
    elif core_run is not None or credential is not None:
        raise ValueError('Files options require files mode')
    index = regular(index)
    if mode == 'files' and index.samefile(credential):
        raise ValueError('Credential cannot be an artifact')
    config = json.loads(index.read_text())
    binary = regular(binary or config['binary'])
    client = regular(client or config['client'])
    provenance = regular(provenance or config['binaryProvenance'])
    if mode == 'files' and any(path.samefile(credential) for path in (binary, client, provenance)):
        raise ValueError('Credential cannot be an artifact')
    provenance_bytes = provenance.read_bytes()
    previous = json.loads(provenance_bytes)
    provenance_hash = hashlib.sha256(provenance_bytes).hexdigest()
    for path in (binary, client):
        if previous['sha256'].get(str(path)) != digest(path):
            raise ValueError('Selected binary/client does not match the recorded provenance')
        if not os.access(path, os.X_OK):
            raise ValueError('Selected binary/client must be executable')
    if not re.fullmatch(r'tunnel_[a-zA-Z0-9]+', config['tunnelId']):
        raise ValueError('Invalid tunnel ID')
    if not re.fullmatch(r'org-[a-zA-Z0-9]+', config['organizationId']):
        raise ValueError('Invalid organization ID')
    root = core_run / 'tunnel' if mode == 'files' else ROOT
    root.mkdir(mode=0o700, parents=True, exist_ok=True)
    if root != root.resolve():
        raise ValueError('Runtime root must not contain symbolic links')
    launcher = regular(TOOLS / 'start-online.py')
    relay = regular(TOOLS / 'stdio-audit.py')
    prefix = datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ-')
    run = Path(tempfile.mkdtemp(prefix=prefix, dir=root))
    for directory in ('fixture', 'profiles', 'tmp', 'isolated-config'):
        (run / directory).mkdir(mode=0o700)
    target = run / 'opendesk-mcp'
    shutil.copyfile(binary, target)
    target.chmod(0o700)
    if digest(target) != previous['sha256'][str(binary)]:
        raise ValueError('Binary changed while copying; prepared run must not be used')
    relay_options = (['--mode', 'files', '--files-bridge-credential-file', str(credential),
                      '--binary-sha256', previous['sha256'][str(binary)]]
                     if mode == 'files' else [])
    fault = None
    if drop_write_response_for_request_id is not None:
        fault = {'flag': '--drop-write-response-for-request-id',
                 'requestId': drop_write_response_for_request_id,
                 'marker': str(run / ('.drop-write-response-' + drop_write_response_for_request_id + '.used'))}
        relay_options.extend([fault['flag'], fault['requestId'], '--drop-write-response-marker', fault['marker']])
    command = shlex.join(['/usr/bin/env', '-i', 'PATH=/usr/bin:/bin:/usr/sbin:/sbin',
                          sys.executable, str(relay), *relay_options, str(target), str(run / 'fixture'),
                          str(run / 'rpc-audit.jsonl')])
    # JSON strings are valid YAML scalars. Never copy the credential into this profile.
    profile = run / 'profiles/opendesk-web-file.yaml'
    profile.write_text('config_version: 1\ncontrol_plane:\n'
                       '  base_url: "https://api.openai.com"\n'
                       f'  tunnel_id: {json.dumps(config["tunnelId"])}\n'
                       '  api_key: "env:CONTROL_PLANE_API_KEY"\n'
                       'health:\n  listen_addr: "127.0.0.1:0"\n'
                       'admin_ui:\n  open_browser: false\n'
                       'log:\n  level: info\n  format: json\n'
                       'mcp:\n  commands:\n    - channel: main\n'
                       f'      command: {json.dumps(command)}\n')
    tracked = (launcher, relay, regular(Path(__file__)), target, client, profile)
    pinned = {str(path): digest(path) for path in tracked}
    if (pinned[str(client)] != previous['sha256'][str(client)]
            or pinned[str(target)] != previous['sha256'][str(binary)]
            or digest(provenance) != provenance_hash):
        raise ValueError('Recorded artifacts changed during preparation; this run must not be used')
    if mode == 'files':
        pinned[str(provenance)] = provenance_hash
    manifest = {
        'schemaVersion': 1, 'preparedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
        'client': str(client), 'organizationId': config['organizationId'],
        'tunnelId': config['tunnelId'], 'proofDirectory': str(run / 'fixture'),
        'sha256': pinned,
        'binaryProvenance': {'record': str(provenance), 'sha256': provenance_hash,
                             'originalBinary': str(binary), 'baseHead': previous.get('baseHead'),
                             'buildInfo': previous.get('buildInfo'),
                             'builtFromDirtyWorkspace': previous.get('builtFromDirtyWorkspace', 'UNKNOWN')},
        'sourceMatchesPriorRecord': {
            path: digest(REPO / path) == expected for path, expected in previous.get('sources', {}).items()} if mode == 'nonce' else {},
        'preparationHead': subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=REPO, text=True).strip(),
        'python': {'executable': sys.executable, 'version': sys.version},
        'credential': 'Supplied only at launch via file: or hidden input; never stored here',
        'webAcceptance': 'NOT_TESTED', 'onlineStarted': False,
    }
    if mode == 'files':
        manifest.update(mode='files', coreRun=str(core_run), filesBridgeCredentialFile=str(credential))
    if fault is not None:
        manifest['faultInjection'] = fault
    (run / 'online-artifacts.json').write_text(json.dumps(manifest, indent=2) + '\n')
    return run, config


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--index', type=Path, default=Path.home() / '.opendesk/tunnels/opendesk-web-file.json')
    parser.add_argument('--binary', type=Path)
    parser.add_argument('--client', type=Path)
    parser.add_argument('--provenance', type=Path)
    parser.add_argument('--mode', choices=('nonce', 'files'), default='nonce')
    parser.add_argument('--core-run', type=Path, help='Existing unique mcp-files-core run; never overwritten')
    parser.add_argument('--files-bridge-credential-file', type=Path, help='Private path reference only; never opened here')
    parser.add_argument('--drop-write-response-for-request-id', help='LOCAL TEST ONLY: suppress one matching write response; files mode only')
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument('--doctor-only', action='store_true', help='Prepare and run local configuration diagnostics only')
    mode.add_argument('--online', action='store_true', help='Prepare and start one foreground online session, up to 30 minutes')
    options = parser.parse_args()
    os.umask(0o077)
    try:
        run, config = prepare(options.index, options.binary, options.client, options.provenance,
                              mode=options.mode, core_run=options.core_run,
                              credential=options.files_bridge_credential_file,
                              drop_write_response_for_request_id=options.drop_write_response_for_request_id)
    except (OSError, KeyError, ValueError):
        sys.exit('Preparation failed: check local artifact paths, provenance hashes and resource IDs. No client was started.')
    print(json.dumps({'preparedRun': str(run), 'webAcceptance': 'NOT_TESTED'}), flush=True)
    if options.doctor_only or options.online:
        command = [sys.executable, str(TOOLS / 'start-online.py'), '--run-dir', str(run),
                   '--key-file', config['keyFile']]
        if options.doctor_only:
            command.append('--doctor-only')
        os.execv(sys.executable, command)
    print('Prepared only. Use start-online.py --run-dir with this run; existing proof runs cannot be reused.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
