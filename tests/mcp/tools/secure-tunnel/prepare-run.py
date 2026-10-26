#!/usr/bin/env python3
"""Prepare a fresh, pinned nonce-only tunnel run using existing local artifacts."""
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


def prepare(index, binary=None, client=None, provenance=None):
    config = json.loads(regular(index).read_text())
    binary = regular(binary or config['binary'])
    client = regular(client or config['client'])
    provenance = regular(provenance or config['binaryProvenance'])
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
    ROOT.mkdir(parents=True, exist_ok=True)
    if ROOT != ROOT.resolve():
        raise ValueError('Runtime root must not contain symbolic links')
    launcher = regular(TOOLS / 'start-online.py')
    relay = regular(TOOLS / 'stdio-audit.py')
    prefix = datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ-')
    run = Path(tempfile.mkdtemp(prefix=prefix, dir=ROOT))
    for directory in ('fixture', 'profiles', 'tmp', 'isolated-config'):
        (run / directory).mkdir(mode=0o700)
    target = run / 'opendesk-mcp'
    shutil.copyfile(binary, target)
    target.chmod(0o700)
    if digest(target) != previous['sha256'][str(binary)]:
        raise ValueError('Binary changed while copying; prepared run must not be used')
    command = shlex.join(['/usr/bin/env', '-i', 'PATH=/usr/bin:/bin:/usr/sbin:/sbin',
                          sys.executable, str(relay), str(target), str(run / 'fixture'),
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
            path: digest(REPO / path) == expected for path, expected in previous.get('sources', {}).items()},
        'preparationHead': subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=REPO, text=True).strip(),
        'python': {'executable': sys.executable, 'version': sys.version},
        'credential': 'Supplied only at launch via file: or hidden input; never stored here',
        'webAcceptance': 'NOT_TESTED', 'onlineStarted': False,
    }
    (run / 'online-artifacts.json').write_text(json.dumps(manifest, indent=2) + '\n')
    return run, config


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--index', type=Path, default=Path.home() / '.opendesk/tunnels/opendesk-web-file.json')
    parser.add_argument('--binary', type=Path)
    parser.add_argument('--client', type=Path)
    parser.add_argument('--provenance', type=Path)
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument('--doctor-only', action='store_true', help='Prepare and run local configuration diagnostics only')
    mode.add_argument('--online', action='store_true', help='Prepare and start one foreground online session, up to 30 minutes')
    options = parser.parse_args()
    os.umask(0o077)
    try:
        run, config = prepare(options.index, options.binary, options.client, options.provenance)
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
