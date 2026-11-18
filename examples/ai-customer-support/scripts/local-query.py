#!/usr/bin/env python3
"""Private, foreground deployment of an explicitly selected upstream Query checkout.

Only this process is adapted; inputs and Codex configuration remain read-only.
The bootstrap and check command use Python's standard library. The selected
upstream server separately needs its existing environment (including PyYAML and
jsonschema); optional config.python selects that interpreter without installing
packages. Both absolute paths and paths relative to the config are supported.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import signal
import socket
import sys
import threading
import time
import uuid
from urllib.parse import urlsplit
from urllib.request import urlopen

REPO = Path(__file__).resolve().parents[3]
RUNTIME = REPO / '.runtime'
HEALTH_LISTS = ('available_project_slugs', 'preloaded_project_slugs',
                'query_context_snapshot_project_slugs')


def write_json(path, value):
    temporary = path.with_suffix(path.suffix + '.tmp')
    temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n')
    temporary.replace(path)


def runtime_path(value):
    path = Path(value).expanduser().resolve()
    if not path.is_relative_to(RUNTIME.resolve()) or path == RUNTIME.resolve():
        raise ValueError('run-dir must be an exclusive directory below repository .runtime')
    return path


def load_config(path):
    path = Path(path).expanduser().resolve()
    if not path.is_relative_to(RUNTIME.resolve()):
        raise ValueError('config must be a local JSON file below repository .runtime')
    config = json.loads(path.read_text())
    if not isinstance(config, dict) or set(config) - {'source', 'projectsRoot', 'projectId', 'port', 'profile', 'credentialSource', 'python', 'plannerTimeoutSeconds'}:
        raise ValueError('unknown config fields or invalid config object')
    for key in ('source', 'projectsRoot', 'projectId', 'port'):
        if key not in config:
            raise ValueError('missing config field: ' + key)
    for key in ('source', 'projectsRoot'):
        if not isinstance(config[key], str) or not config[key]:
            raise ValueError('invalid path field: ' + key)
        config[key] = (path.parent / Path(config[key]).expanduser()).resolve()
        if not config[key].is_dir():
            raise ValueError('missing input directory: ' + key)
    if not isinstance(config['projectId'], str) or not re.fullmatch(r'[a-z0-9][a-z0-9_-]{0,63}', config['projectId']):
        raise ValueError('invalid projectId')
    if type(config['port']) is not int or not 0 <= config['port'] <= 65535:
        raise ValueError('port must be an integer from 0 to 65535')
    if config.get('credentialSource', 'environment') not in ('environment', 'existing-codex'):
        raise ValueError('unsupported credentialSource')
    if 'plannerTimeoutSeconds' in config and (type(config['plannerTimeoutSeconds']) is not int or not 1 <= config['plannerTimeoutSeconds'] <= 20):
        raise ValueError('plannerTimeoutSeconds must be an integer from 1 to 20')
    if 'python' in config:
        selected = config['python']
        if not isinstance(selected, str) or not selected.strip():
            raise ValueError('python must be an explicit executable path')
        # Do not resolve symlinks: venv/bin/python commonly links to system Python,
        # but invoking the venv path selects a different sys.prefix/site-packages.
        selected = os.path.abspath(path.parent / Path(selected).expanduser())
        if not Path(selected).is_file() or not os.access(selected, os.X_OK):
            raise ValueError('configured python is not an executable file')
        config['python'] = selected
    return config


def select_interpreter(config):
    selected = config.get('python')
    # Canonicalize only parent directories (including macOS case aliases),
    # preserving the executable symlink that identifies a virtual environment.
    current = Path(sys.executable)
    if selected and not (current.name == Path(selected).name and
                         current.parent.samefile(Path(selected).parent)):
        os.execv(selected, [selected, str(Path(__file__).resolve()), *sys.argv[1:]])


def configure_credentials(config):
    prefix = 'QUERY_API_HTTP_LLM_'
    if config.get('credentialSource') == 'existing-codex':
        import tomllib
        home = Path.home() / '.codex'
        settings = tomllib.loads((home / 'config.toml').read_text())
        auth = json.loads((home / 'auth.json').read_text())
        provider = settings.get('model_providers', {}).get(settings.get('model_provider'), {})
        values = {'BASE_URL': provider.get('base_url') or (settings.get('openai_base_url') if not settings.get('model_provider') else None), 'MODEL': settings.get('model'),
                  'API_KEY': auth.get('OPENAI_API_KEY') or (auth.get('tokens') or {}).get('access_token'),
                  'API_STYLE': 'chat_completions'}
        for key, value in values.items():
            if not isinstance(value, str) or not value.strip():
                raise ValueError('existing-codex lacks required HTTP credentials/configuration')
            os.environ[prefix + key] = value
    for key in ('BASE_URL', 'MODEL', 'API_KEY'):
        if not os.environ.get(prefix + key, '').strip():
            raise ValueError('missing inherited ' + prefix + key)
    url = urlsplit(os.environ[prefix + 'BASE_URL'])
    if url.scheme not in ('http', 'https') or not url.hostname or url.username or url.password or url.query or url.fragment:
        raise ValueError('invalid HTTP provider URL')
    os.environ.setdefault(prefix + 'API_STYLE', 'chat_completions')
    os.environ['QUERY_API_LLM_MODE'] = 'http'
    os.environ.pop('QUERY_CONTEXT_RUNTIME_ROOT', None)


def hashes(root):
    result = {}
    for path in sorted(root.rglob('*')):
        if path.is_symlink():
            raise ValueError('input symlinks are not supported')
        if path.is_file() and '__pycache__' not in path.parts and '.git' not in path.parts:
            result[str(path.relative_to(root))] = hashlib.sha256(path.read_bytes()).hexdigest()
    return result


def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True).encode()).hexdigest()


def install_standard_tier_compat(llm_class):
    """Translate upstream's tier label at this process's HTTP wire boundary."""
    original_request, original_stream = llm_class._request, llm_class._request_stream

    def compatible(payload):
        return {**payload, 'service_tier': 'default'} if isinstance(payload, dict) and payload.get('service_tier') == 'standard' else payload

    def request(self, method, path, payload=None, **kwargs):
        return original_request(self, method, path, compatible(payload), **kwargs)

    def stream(self, path, payload, **kwargs):
        return original_stream(self, path, compatible(payload), **kwargs)

    llm_class._request, llm_class._request_stream = request, stream


def install_provider_audit(llm_class, request_context, audit):
    """Observe existing transports only; never persist bodies or exception text."""
    original_request = llm_class._request
    original_stream = llm_class._request_stream

    def begin(self, payload, transport, method):
        return {'requestId': getattr(request_context, 'request_id', None),
                'publicRequestId': getattr(request_context, 'public_request_id', None),
                'started': time.time(), 'transport': transport, 'method': method,
                'requestedModel': payload.get('model', self.model_name) if isinstance(payload, dict) else self.model_name,
                'serviceTier': payload.get('service_tier') if isinstance(payload, dict) and payload.get('service_tier') in ('standard', 'default', 'priority', 'flex', 'auto') else None,
                'requestSha256': digest(payload), 'responseId': None, 'responseModel': None}

    def failed(entry, self, error):
        entry['status'] = 'error'
        status = getattr(self, 'last_provider_http_status', None)
        entry['httpStatus'] = status if type(status) is int and 100 <= status <= 599 else None
        # Record a bounded compatibility clue, never the upstream error body.
        entry['serviceTierRejected'] = entry['httpStatus'] == 400 and 'service_tier' in str(error) and 'standard' in str(error)

    def observe(entry, value):
        if isinstance(value, dict):
            # Responses streaming puts identity on the nested response envelope.
            metadata = value.get('response')
            metadata = metadata if isinstance(metadata, dict) else value
            for source, target in (('id', 'responseId'), ('model', 'responseModel')):
                if isinstance(metadata.get(source), str) and metadata[source]:
                    entry[target] = metadata[source]

    def finish(entry):
        entry['metadataStatus'] = 'observed' if entry['responseId'] and entry['responseModel'] else 'unknown'
        entry['ended'] = time.time()
        audit('provider-wire-audit.jsonl', entry)
        entries = getattr(request_context, 'provider_entries', None)
        if entries is not None:
            entries.append(entry)

    def request(self, method, path, payload=None, **kwargs):
        entry = begin(self, payload, 'non_stream', method)
        try:
            result = original_request(self, method, path, payload, **kwargs)
            observe(entry, result)
            entry.update(responseSha256=digest(result), status='ok')
            return result
        except BaseException as error:
            failed(entry, self, error)
            raise
        finally:
            finish(entry)

    def stream(self, path, payload, **kwargs):
        # Like upstream, nothing runs until first consumption. yield-from forwards
        # send/throw/close and preserves the original generator's return value.
        entry = begin(self, payload, 'stream', 'POST')
        event_hash = hashlib.sha256()
        entry.update(eventCount=0, consumptionComplete=False)

        class ObservedIterator:
            def __init__(self, iterator):
                self.iterator = iterator

            def __iter__(self):
                return self

            def record(self, event):
                event_hash.update(bytes.fromhex(digest(event)))
                entry['eventCount'] += 1
                observe(entry, event)
                return event

            def __next__(self):
                return self.record(next(self.iterator))

            def send(self, value):
                if value is None:
                    return next(self)
                return self.record(self.iterator.send(value))

            def throw(self, *args):
                return self.record(self.iterator.throw(*args))

            def close(self):
                return self.iterator.close()

        try:
            result = yield from ObservedIterator(original_stream(self, path, payload, **kwargs))
            entry.update(status='ok', consumptionComplete=True)
            return result
        except GeneratorExit:
            entry['status'] = 'cancelled'
            raise
        except BaseException as error:
            failed(entry, self, error)
            raise
        finally:
            entry['eventsSha256'] = event_hash.hexdigest()
            finish(entry)

    llm_class._request = request
    llm_class._request_stream = stream


def provider_coverage(metadata, entries):
    counts = metadata.get('model_call_counts')
    declared = counts.get('total_provider_requests') if isinstance(counts, dict) else None
    known = type(declared) is int and declared >= 0
    status = 'unknown'
    if known:
        if declared != len(entries):
            status = 'mismatch'
        elif any(e['status'] != 'ok' for e in entries):
            status = 'incomplete'
        elif any(e['metadataStatus'] != 'observed' for e in entries):
            status = 'unknown'
        else:
            status = 'matched'
    return {'status': status, 'declaredProviderRequests': declared if known else None,
            'observedProviderRequests': len(entries)}


def validate_health(payload, ready):
    if not isinstance(payload, dict) or payload.get('code') != 0 or not isinstance(payload.get('data'), dict):
        raise ValueError('health envelope is not successful')
    data = payload['data']
    if data.get('local_query_instance') != ready['instanceId'] or data.get('local_query_pid') != ready['pid']:
        raise ValueError('health server identity mismatch')
    for key in HEALTH_LISTS:
        if not isinstance(data.get(key), list) or ready['projectId'] not in data[key]:
            raise ValueError('health project/context missing: ' + key)
    return data


def check(run):
    ready = json.loads((run / 'ready.json').read_text())
    if ready.get('host') != '127.0.0.1' or type(ready.get('port')) is not int or not 1 <= ready['port'] <= 65535:
        raise ValueError('invalid readiness address')
    with urlopen(f"http://127.0.0.1:{ready['port']}/api/health", timeout=3) as response:
        validate_health(json.loads(response.read(1024 * 1024)), ready)
    return ready


def serve(args):
    config = load_config(args.config)
    select_interpreter(config)
    configure_credentials(config)
    run = runtime_path(args.run_dir)
    source, seed = config['source'], config['projectsRoot'] / config['projectId']
    if run.is_relative_to(source) or run.is_relative_to(config['projectsRoot']):
        raise ValueError('run-dir overlaps read-only input')
    # mkdir is the ownership claim: never reuse or clean another run directory.
    run.mkdir(parents=True, exist_ok=False)
    project_id = config['projectId']
    yaml = (seed / 'project.yaml').read_text()
    match = re.search(r'^query_context_profile:\s*[\'\"]?([A-Za-z0-9_-]+)[\'\"]?\s*$', yaml, re.M)
    if not match:
        raise ValueError('project.yaml must select a shared query_context_profile')
    profile = match.group(1)
    if config.get('profile', profile) != profile:
        raise ValueError('profile does not match project.yaml')
    profile_source = source / 'projects/.shared/query_context_profiles' / profile
    provenance = {'source': str(source), 'projectsRoot': str(config['projectsRoot']),
                  'projectId': project_id, 'profile': profile, 'sourceFiles': hashes(source),
                  'projectFiles': hashes(seed), 'profileFiles': hashes(profile_source),
                  'bootstrapSha256': hashlib.sha256(Path(__file__).read_bytes()).hexdigest()}
    if not provenance['projectFiles'] or not provenance['profileFiles']:
        raise ValueError('project or selected shared profile is empty')
    provenance['inputSha256'] = digest(provenance)
    write_json(run / 'provenance.json', provenance)
    projects = run / 'projects'
    shutil.copytree(seed, projects / project_id, ignore=shutil.ignore_patterns('__pycache__', 'retrieval_api_contract'))
    shutil.copytree(profile_source, projects / '.shared/query_context_profiles' / profile)
    kb = projects / project_id / 'knowledge-base'
    (kb / 'retrieval_api_contract').mkdir(exist_ok=True)
    sys.dont_write_bytecode = True
    sys.path[:0] = [str(source / 'apps/query-api'), str(source)]
    from libs.project_knowledge.common import CONTEXT_MD_CUSTOMER_SUPPORT_REASONING_PROFILE
    CONTEXT_MD_CUSTOMER_SUPPORT_REASONING_PROFILE.update(service_tier='default', reasoning_effort='low')
    import server
    from libs.project_knowledge import adapters
    if 'plannerTimeoutSeconds' in config:
        adapters.GROUNDING_PLANNER_PROFILE = {**adapters.GROUNDING_PLANNER_PROFILE,
            'request_timeout_seconds': config['plannerTimeoutSeconds']}
    from libs.project_knowledge.project_context_workspace import publish_project_context_workspace, ProjectContextSnapshotRegistry
    published = publish_project_context_workspace(project_id, runtime_root=run / 'context', projects_root=projects)
    write_json(run / 'snapshot-manifest.json', {'projectId': published.project_id,
               'manifestSha256': published.manifest_sha256, 'workspaceDir': str(published.workspace_dir),
               'inputSha256': provenance['inputSha256']})
    runtime = server.QueryServiceRuntime(default_product_slug=project_id, projects_root=projects,
                                         preload_projects=[project_id], runtime_env='dev')
    runtime.context_snapshot_registry = ProjectContextSnapshotRegistry.load(run / 'context', [project_id])
    identity = uuid.uuid4().hex
    ready = {'pid': os.getpid(), 'host': '127.0.0.1', 'projectId': project_id, 'instanceId': identity,
             'testResponseHoldMs': args.test_response_hold_ms, 'inputSha256': provenance['inputSha256'],
             'plannerTimeoutSeconds': adapters.GROUNDING_PLANNER_PROFILE['request_timeout_seconds']}
    original_health = runtime.build_health_payload
    def health():
        payload = original_health()
        payload.update(local_query_instance=identity, local_query_pid=os.getpid())
        return payload
    runtime.build_health_payload = health
    def no_cli(*args, **kwargs):
        raise ValueError('Codex CLI disabled in local HTTP deployment')
    server.get_codex_context_answer_provider = no_cli
    original_llm = adapters.get_llm_for_mode
    def http_only(mode, allow_fallback=False, **kwargs):
        if mode != 'http':
            raise ValueError('local deployment requires llm_mode=http')
        return original_llm('http', allow_fallback=False, **kwargs)
    adapters.get_llm_for_mode = server.get_llm_for_mode = http_only
    if hasattr(server, 'normalize_request'):
        original_normalize = server.normalize_request
        def normalize(*a, **kw):
            request = original_normalize(*a, **kw)
            if request.get('context_answer_mode', 'http') != 'http' or request.get('llm_mode', 'http') != 'http':
                raise ValueError('only HTTP generation is enabled')
            if request.get('delivery_mode', 'draft') != 'draft':
                raise ValueError('only draft delivery is enabled')
            return request
        server.normalize_request = normalize
    audit_lock = threading.Lock()
    request_context = threading.local()
    def audit(name, entry):
        with audit_lock, (run / name).open('a') as handle:
            handle.write(json.dumps(entry, ensure_ascii=False) + '\n')
    install_provider_audit(adapters.OpenAICompatibleLLM, request_context, audit)
    # Outer wrapper means the audit hashes the actual adapted wire payload.
    # No retry, model/provider switch, policy change, or upstream file mutation.
    install_standard_tier_compat(adapters.OpenAICompatibleLLM)
    # Enforce the selected project and HTTP mode before upstream dispatch.
    def scoped_parser(original, with_raw=False):
        def parse(*a, **kw):
            result = original(*a, **kw)
            payload = result[0] if with_raw else result
            if payload.get('llm_mode', 'http') != 'http':
                raise ValueError('local deployment requires llm_mode=http')
            if payload.get('delivery_mode', 'draft') != 'draft':
                raise ValueError('local deployment requires delivery_mode=draft')
            if payload.get('answer_strategy') in ('codex_cli', 'context_codex_cli'):
                raise ValueError('CLI answer strategies are disabled')
            if payload.get('context_answer_mode', 'http') != 'http':
                raise ValueError('local deployment requires context_answer_mode=http')
            for key in ('project_slug', 'product_slug'):
                if key in payload and payload[key] != project_id:
                    raise ValueError('project is outside local deployment scope')
            payload['llm_mode'] = 'http'
            request_context.public_request_id = payload.get('request_id')
            return result
        return parse
    for name in ('parse_json_body', 'parse_json_body_with_raw'):
        if hasattr(server, name):
            setattr(server, name, scoped_parser(getattr(server, name), name.endswith('_with_raw')))
    original_factory = server.make_handler
    def factory(*a, **kw):
        cls = original_factory(*a, **kw)
        original_post, original_write = cls.do_POST, cls._write_json
        def post(self):
            request_context.request_id = uuid.uuid4().hex
            request_context.started_at = time.monotonic()
            request_context.public_request_id = None
            request_context.provider_entries = []
            try:
                # This private service exposes only the ordinary synchronous query API.
                if urlsplit(self.path).path != '/api/query':
                    self._write_json({'error': 'local_query_endpoint_only'}, 403)
                    return
                return original_post(self)
            finally:
                request_context.request_id = None
                request_context.public_request_id = None
                request_context.provider_entries = None
                request_context.started_at = None
        def write(self, payload, status=200):
            if urlsplit(self.path).path == '/api/query':
                metadata = payload.get('data', payload)
                metadata = metadata if isinstance(metadata, dict) else {}
                # Test-only minimum latency creates an in-flight window without
                # adding a second delay to an already slow real model request.
                started_at = getattr(request_context, 'started_at', None)
                hold_seconds = max(0, args.test_response_hold_ms / 1000 -
                                   (time.monotonic() - started_at)) if started_at is not None else 0
                audit('query-wire-audit.jsonl', {'requestId': getattr(request_context, 'request_id', None),
                      'publicRequestId': getattr(request_context, 'public_request_id', None),
                      'at': time.time(), 'status': int(status), 'responseSha256': digest(payload),
                      'testResponseHoldMs': args.test_response_hold_ms,
                      'appliedResponseHoldMs': round(hold_seconds * 1000),
                      'responseRequestId': metadata.get('request_id'),
                      'strategy': metadata.get('selected_answer_strategy') or metadata.get('answer_strategy') or metadata.get('strategy'),
                      'modelProvider': metadata.get('model_provider'), 'modelName': metadata.get('model_name'),
                      'modelCallCounts': metadata.get('model_call_counts'),
                      'strategyReason': metadata.get('strategy_reason_code'),
                      'plannerStatus': metadata.get('grounding_planner_status'),
                      'coverageStatus': metadata.get('coverage_status'),
                      'providerCoverage': provider_coverage(metadata, request_context.provider_entries or [])})
                if hold_seconds:
                    time.sleep(hold_seconds)
            return original_write(self, payload, status)
        cls.do_POST, cls._write_json = post, write
        return cls
    server.make_handler = factory
    original_server = server.ThreadingHTTPServer
    bound = []
    class BoundServer(original_server):
        def __init__(self, *a, **kw):
            super().__init__(*a, **kw)
            bound.append(self)
            ready.update(port=self.server_address[1], baseUrl=f'http://127.0.0.1:{self.server_address[1]}')
            validate_health({'code': 0, 'data': health()}, ready)
            write_json(run / 'ready.json', ready)
    server.ThreadingHTTPServer = BoundServer
    def stop(signum, frame):
        if bound:
            threading.Thread(target=bound[0].shutdown, daemon=True).start()
        else:
            raise KeyboardInterrupt
    signal.signal(signal.SIGTERM, stop)
    signal.signal(signal.SIGINT, stop)
    try:
        return server.serve(runtime, '127.0.0.1', config['port'], runtime_root=kb / 'retrieval_api_contract/r30b')
    finally:
        runtime.close()
        released = False
        if bound:
            bound[0].server_close()
            with socket.socket() as probe:
                released = probe.connect_ex(('127.0.0.1', ready['port'])) != 0
        write_json(run / 'cleanup.json', {'pid': os.getpid(), 'port': ready.get('port'), 'portReleased': released})


def main():
    os.umask(0o077)
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest='command', required=True)
    start = sub.add_parser('serve')
    start.add_argument('--config', required=True)
    start.add_argument('--run-dir', required=True)
    start.add_argument('--test-response-hold-ms', type=int, default=0)
    probe = sub.add_parser('check')
    probe.add_argument('--run-dir', required=True)
    args = parser.parse_args()
    try:
        if args.command == 'check':
            print(json.dumps(check(runtime_path(args.run_dir))))
            return 0
        if not 0 <= args.test_response_hold_ms <= 60000:
            raise ValueError('test-response-hold-ms must be between 0 and 60000')
        return serve(args)
    except KeyboardInterrupt:
        return 0
    except ModuleNotFoundError as error:
        # Import names are actionable; arbitrary exception text may contain secrets.
        name = error.name if isinstance(error.name, str) and re.fullmatch(
            r'[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*', error.name
        ) else 'unknown'
        print('local-query failed (ModuleNotFoundError): missing module ' + name +
              '; set config.python to the existing upstream Python environment', file=sys.stderr)
        return 1
    except Exception as error:
        # Exception messages from upstream/provider code may contain credentials.
        print('local-query failed (' + type(error).__name__ + '); check local inputs, credentials, and port', file=sys.stderr)
        return 1


if __name__ == '__main__':
    raise SystemExit(main())
