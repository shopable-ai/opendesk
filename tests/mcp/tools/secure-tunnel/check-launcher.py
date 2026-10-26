"""Synthetic-only launcher regression; never opens a real credential or client."""
import ast,hashlib,fcntl,contextlib,getpass,io,json,os,queue,re,signal,stat,subprocess,sys,tempfile,threading,time,warnings
from pathlib import Path
from unittest.mock import Mock,patch
p=Path(__file__).resolve().with_name('start-online.py'); tree=ast.parse(p.read_text())
read=next(n for n in tree.body if isinstance(n,ast.Try) and 'getpass.getpass' in ast.unparse(n))
def compile_nodes(nodes):
    return compile(ast.fix_missing_locations(ast.Module(body=nodes,type_ignores=[])),str(p),'exec')
code=compile_nodes([read]); ns={'getpass':getpass,'warnings':warnings,'sys':sys,'stored_key':None}
with patch.object(getpass.termios,'tcgetattr',side_effect=getpass.termios.error('simulated echo-control failure')),patch.object(getpass,'_raw_input') as raw:
    try: exec(code,ns)
    except SystemExit as e: assert 'nothing was read or started' in str(e)
    else: raise AssertionError('must abort')
    raw.assert_not_called()
assert 'key' not in ns
fake='sk-SYNTHETIC_launcher_test_only_123456789'
with patch.object(getpass,'getpass',return_value=fake): exec(code,ns)
assert ns.pop('key')==fake
functions=compile_nodes([n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name in ('stop','run_client','reap_cancelled','group_alive','redact','load_saved_key','operator_output','open_log')])
checks=[]
base={'fcntl':fcntl,'os':os,'signal':signal,'subprocess':subprocess,'sys':sys,'time':time,'queue':queue,'threading':threading,'Path':Path,'stat':stat,'re':re,'key':fake}
for where in ('before-entry','starting-state','during-popen'):
    prior=Mock(poll=lambda:0); fresh=Mock(pid=123456,poll=Mock(return_value=None))
    scope={**base,'child':prior,'stop_requested':False,'CLIENT':Path('/dummy-official-client'),'env':{},'REPO':p.parent}
    exec(functions,scope)
    reaper=Mock();scope['reap_cancelled']=reaper
    def state(**fields):
        if where=='starting-state' and fields.get('status')=='starting': scope['stop'](signal.SIGINT,None)
    def spawn(*args,**kwargs):
        if where=='during-popen': scope['stop'](signal.SIGINT,None)
        return fresh
    scope['state']=state
    with patch.object(subprocess,'Popen',side_effect=spawn) as launch:
        if where=='before-entry': scope['stop'](signal.SIGINT,None)
        assert scope['run_client']('online',[],1800)==130
        if where=='during-popen': launch.assert_called_once();reaper.assert_called_once_with(fresh)
        else: launch.assert_not_called();reaper.assert_not_called()
    checks.append(where)
output_root=p.parents[4]/'.runtime/tests/mcp-chatgpt-web/launcher-regression'
output_root.mkdir(parents=True,exist_ok=True)
output_dir=Path(tempfile.mkdtemp(prefix='run-',dir=output_root))
with tempfile.TemporaryDirectory(prefix='synthetic-',dir=output_dir) as tmp:
    root=Path(tmp);root.chmod(0o700);secret=root/'synthetic.key';secret.write_text(fake+'\n');secret.chmod(0o600)
    scope={**base};exec(functions,scope)
    assert scope['load_saved_key'](secret)==(secret,fake)
    rejected=[]
    def reject(name,path):
        try: scope['load_saved_key'](path)
        except SystemExit: rejected.append(name)
        else: raise AssertionError(name+' must reject')
    secret.chmod(0o644);reject('file-mode',secret);secret.chmod(0o600)
    root.chmod(0o755);reject('directory-mode',secret);root.chmod(0o700)
    link=root/'link.key';link.symlink_to(secret);reject('symlink-file',link);link.unlink()
    directory_link=root/'linked';directory_link.symlink_to(root,target_is_directory=True);reject('symlink-parent',directory_link/'synthetic.key');directory_link.unlink()
    secret.write_text('sk-'+'x'*4100);reject('oversize',secret)
    for label,value in [('newline-padding',fake+'\n'*5000+'suffix'),('double-newline',fake+'\n\n'),('terminal-crlf',fake+'\r\n'),('oversize-with-newline','sk-'+'x'*4094+'\n'),('unread-suffix','sk-'+'x'*4093+'\n'+'suffix')]:
        secret.write_text(value);reject(label,secret)
    secret.write_text('sk-'+'x'*4093+'\n');assert scope['load_saved_key'](secret)[1]=='sk-'+'x'*4093
    secret.write_text('not-a-runtime-key');reject('invalid-format',secret);secret.write_text(fake+'\n')
    original_open=os.open
    def altered_open(path,*args,**kwargs):
        secret.chmod(0o644)
        return original_open(path,*args,**kwargs)
    with patch.object(os,'open',side_effect=altered_open): reject('opened-descriptor-mode',secret)
    secret.chmod(0o600)
    with contextlib.redirect_stdout(io.StringIO()) as captured:
        scope['operator_output']('synthetic output\n')
        assert captured.getvalue()=='synthetic output\n'
    assert fake not in scope['redact']('key='+fake)
    assert 'sk-ANOTHER_synthetic_123456789' not in scope['redact']('sk-ANOTHER_synthetic_123456789')
    assert 'abc123' not in scope['redact']('Authorization: Bearer abc123')
    assert scope['redact']('opendesk-web-file')=='opendesk-web-file'
    profile_node=next(n for n in tree.body if isinstance(n,ast.With) and 'TemporaryDirectory' in ast.unparse(n))
    (root/'profiles').mkdir();(root/'tmp').mkdir();(root/'profiles/opendesk-web-file.yaml').write_text('config_version: 1\ncontrol_plane:\n  api_key: "file:/previous/reference"\n')
    profile_checks=[]
    for stored,expected in [(fake,'file:/synthetic/key'),(None,'env:CONTROL_PLANE_API_KEY')]:
        def inspect_profile(stage,args,timeout):
            active=Path(args[args.index('--profile-dir')+1]);text=(active/'opendesk-web-file.yaml').read_text()
            assert expected in text and fake not in text
            profile_checks.append(expected.split(':')[0]);return 0
        profile_scope={'tempfile':tempfile,'RUN':root,'stored_key':stored,'secret_path':Path('/synthetic/key'),'Path':Path,'re':re,'json':json,'sys':sys,'run_client':inspect_profile,'stop_requested':True}
        exec(compile_nodes([profile_node]),profile_scope)
        assert not list((root/'tmp').iterdir())
    preflight_nodes=compile_nodes([n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name in ('checked_path','acquire_run_lock','check_fresh_run','preflight','consume_run')])
    prepared=root/'prepared';prepared.mkdir()
    for name in ('profiles','tmp','isolated-config','fixture','canonical'):(prepared/name).mkdir()
    source=prepared/'canonical/start-online.py';source.write_text('synthetic launcher')
    relay=source.with_name('stdio-audit.py');relay.write_text('synthetic relay')
    prepare=source.with_name('prepare-run.py');prepare.write_text('synthetic preparation')
    client=prepared/'synthetic-client';client.write_text('synthetic client');client.chmod(0o700)
    binary=prepared/'opendesk-mcp';binary.write_text('synthetic binary');binary.chmod(0o700)
    profile=prepared/'profiles/opendesk-web-file.yaml';profile.write_text('control_plane:\n  api_key: env:SYNTHETIC\n')
    manifest=prepared/'online-artifacts.json'
    document={'client':str(client),'organizationId':'org-SYNTHETIC','proofDirectory':str(prepared/'fixture'),
              'sha256':{str(path):hashlib.sha256(path.read_bytes()).hexdigest() for path in (source,relay,prepare,binary,client,profile)}}
    def save_manifest():manifest.write_text(json.dumps(document))
    save_manifest()
    prepared_scope={**base,'hashlib':hashlib,'fcntl':fcntl,'json':json,'SOURCE':source}
    exec(preflight_nodes,prepared_scope)
    preflight=prepared_scope['preflight']
    assert preflight(prepared)==(client,'org-SYNTHETIC')
    preflight_checks=[]
    def reject_preflight(label):
        try:preflight(prepared)
        except SystemExit:preflight_checks.append(label)
        else:raise AssertionError(label+' must reject')
    original=dict(document['sha256'])
    for artifact in tuple(original):
        document['sha256'].pop(artifact);save_manifest();reject_preflight('missing-hash:'+Path(artifact).name)
        document['sha256']=dict(original)
    document['sha256'][str(client)]='0'*64;save_manifest();reject_preflight('changed-hash')
    document['sha256']=dict(original)
    for field,value in [('client','relative-client'),('organizationId','bad org'),('proofDirectory',str(root))]:
        previous=document[field];document[field]=value;save_manifest();reject_preflight(field);document[field]=previous
    save_manifest()
    for target in (manifest,profile,binary,prepared/'fixture',prepared/'tmp',prepared/'isolated-config',prepared/'profiles'):
        saved=target.with_name(target.name+'.original');target.rename(saved)
        target.symlink_to(saved,target_is_directory=saved.is_dir());reject_preflight('symlink:'+target.name)
        target.unlink();saved.rename(target)
    link=prepared.with_name('linked-prepared');link.symlink_to(prepared,target_is_directory=True)
    try:preflight(link)
    except SystemExit:preflight_checks.append('symlink-run')
    else:raise AssertionError('symlink run must reject')
    link.unlink()
    for name in ('rpc-audit.jsonl','fixture/web-proof.txt','.online-used','online.redacted.log','online-health.url','official-client.pid'):
        target=prepared/name;target.touch();reject_preflight('used:'+name);target.unlink()
    (prepared/'launcher-state.json').write_text('{bad json');reject_preflight('unknown-state')
    (prepared/'launcher-state.json').write_text(json.dumps({'stage':'doctor','status':'running'}));reject_preflight('interrupted-doctor')
    (prepared/'launcher-state.json').write_text(json.dumps({'stage':'doctor','status':'stopped'}))
    assert preflight(prepared)==(client,'org-SYNTHETIC')
    lock=prepared_scope['acquire_run_lock'](prepared)
    try:
        try:prepared_scope['acquire_run_lock'](prepared)
        except SystemExit as error:assert 'already locked' in str(error)
        else:raise AssertionError('concurrent doctor/online launcher must reject')
    finally:os.close(lock)
    lock=prepared_scope['acquire_run_lock'](prepared);os.close(lock)
    assert not (prepared/'rpc-audit.jsonl').exists() and not (prepared/'fixture/web-proof.txt').exists()
    prepared_scope['consume_run'](prepared);reject_preflight('consumed-before-spawn')
    try:prepared_scope['consume_run'](prepared)
    except SystemExit:pass
    else:raise AssertionError('consumed run must not restart')
    # Exercise the actual entry sequence against synthetic paths. Invalid manifest
    # must abort before key-file loading, hidden input, or any child process.
    (prepared/'.online-used').unlink();manifest.write_text('{}')
    entry_scope={'__file__':str(p),'__name__':'__main__'}
    entry_nodes=[]
    for node in tree.body:
        if isinstance(node,ast.Assign) and any(isinstance(t,ast.Name) and t.id=='SOURCE' for t in node.targets):
            node=ast.parse('SOURCE = Path('+repr(str(source))+')').body[0]
        if isinstance(node,ast.Assign) and any(isinstance(t,ast.Name) and t.id=='REPO' for t in node.targets):
            node=ast.parse('REPO = Path('+repr(str(root))+')').body[0]
        entry_nodes.append(node)
    original_cwd=Path.cwd();original_umask=os.umask(0o077);os.umask(original_umask)
    try:
        with patch.object(sys,'argv',[str(p),'--run-dir',str(prepared),'--key-file',str(root/'must-not-read.key')]),patch.object(getpass,'getpass') as prompt,patch.object(subprocess,'Popen') as spawn,patch('atexit.register'):
            try:exec(compile_nodes(entry_nodes),entry_scope)
            except SystemExit as error:assert 'manifest/artifact validation failed' in str(error)
            else:raise AssertionError('invalid manifest must abort before credential access')
            prompt.assert_not_called();spawn.assert_not_called()
    finally:
        os.chdir(original_cwd);os.umask(original_umask)
        if 'lock_fd' in entry_scope:os.close(entry_scope['lock_fd'])
    save_manifest()
    mode_checks=[]
    for doctor_only in (True,False):
        def staged_client(stage,args,timeout):
            assert timeout==(30 if stage=='doctor' else 1800)
            assert not (prepared/'rpc-audit.jsonl').exists()
            assert not (prepared/'fixture/web-proof.txt').exists()
            if stage=='doctor':assert not (prepared/'.online-used').exists()
            else:
                assert (prepared/'.online-used').is_file()
                assert args[args.index('--control-plane.organization-id')+1]=='org-SYNTHETIC'
            mode_checks.append(stage);return 0
        mode_scope={'tempfile':tempfile,'RUN':prepared,'stored_key':fake,'secret_path':secret,'Path':Path,'re':re,'json':json,'sys':sys,
                    'run_client':staged_client,'stop_requested':False,'options':__import__('types').SimpleNamespace(doctor_only=doctor_only),
                    'operator_output':lambda text:None,'ORGANIZATION':'org-SYNTHETIC','consume_run':prepared_scope['consume_run']}
        with contextlib.redirect_stdout(io.StringIO()):exec(compile_nodes([profile_node]),mode_scope)
        assert not list((prepared/'tmp').iterdir())
        if doctor_only:assert not (prepared/'.online-used').exists()
        else:(prepared/'.online-used').unlink()
    assert mode_checks==['doctor','doctor','online']
    (output_dir/'preflight-regression.json').write_text(json.dumps({'manifestPreflightRejections':preflight_checks,'preflightBeforeKeyRead':True,
        'exclusiveRunLock':'PASS','oneUseMarker':'PASS','doctorOnlineStages':mode_checks,'realKeyUsed':False,'realClientStarted':False},indent=2)+'\n')
    setup_failures=[]
    for failure in ('running-state-write','reader-thread-start'):
        run_scope={**base,'child':None,'stop_requested':False,'CLIENT':Path(sys.executable),'env':{},'REPO':root,'RUN':root,'state':lambda **kw:None}
        exec(functions,run_scope);original_reaper=run_scope['reap_cancelled']
        run_scope['reap_cancelled']=lambda process,fn=original_reaper:fn(process,grace=(0.3,0.3,2))
        def failed_state(**fields):
            if fields.get('status')=='running':raise OSError('synthetic state-write failure')
        if failure=='running-state-write': run_scope['state']=failed_state
        patcher=patch.object(threading.Thread,'start',side_effect=RuntimeError('synthetic reader-start failure')) if failure=='reader-thread-start' else contextlib.nullcontext()
        with patcher:
            try:run_scope['run_client']('setup-failure',['-c','import time; time.sleep(60)'],1)
            except (OSError,RuntimeError):pass
            else:raise AssertionError('setup failure must propagate')
        assert not run_scope['group_alive'](run_scope['child'])
        setup_failures.append(failure)
    lifecycle=[]
    programs={
      'silent-ignore-interrupt':"import signal,time; signal.signal(signal.SIGINT,signal.SIG_IGN); print('ready',flush=True); time.sleep(60)",
      'partial-line-ignore-interrupt':"import signal,time,sys; signal.signal(signal.SIGINT,signal.SIG_IGN); sys.stdout.write('partial'); sys.stdout.flush(); time.sleep(60)",
      'descendant-after-leader-exit':"import subprocess,sys; subprocess.Popen([sys.executable,'-c',\"import signal,time; signal.signal(signal.SIGINT,signal.SIG_IGN); signal.signal(signal.SIGTERM,signal.SIG_IGN); time.sleep(60)\"]); print('leader-exiting',flush=True)"
    }
    for label,program in programs.items():
        run_scope={**base,'child':None,'stop_requested':False,'CLIENT':Path(sys.executable),'env':{'PATH':os.environ.get('PATH','/usr/bin:/bin')},'REPO':root,'RUN':root,'state':lambda **kw:None}
        exec(functions,run_scope);original_reaper=run_scope['reap_cancelled']
        run_scope['reap_cancelled']=lambda process,fn=original_reaper:fn(process,grace=(0.3,0.3,2))
        started=time.monotonic()
        with contextlib.redirect_stdout(io.StringIO()): result=run_scope['run_client']('test',['-c',program],0.4)
        assert time.monotonic()-started<5
        assert not run_scope['group_alive'](run_scope['child'])
        assert result==(0 if label=='descendant-after-leader-exit' else 130)
        lifecycle.append(label)
    run_scope={**base,'child':None,'stop_requested':False,'CLIENT':Path(sys.executable),'env':{},'REPO':root,'RUN':root,'state':lambda **kw:None}
    exec(functions,run_scope);original_reaper=run_scope['reap_cancelled'];run_scope['reap_cancelled']=lambda process:original_reaper(process,grace=(0.3,0.3,2))
    with contextlib.redirect_stdout(io.StringIO()):
        try:run_scope['run_client']('oversize',['-c',"import sys,time;sys.stdout.write('x'*20000);sys.stdout.flush();time.sleep(60)"],2)
        except RuntimeError as ex:assert 'safety limit' in str(ex)
        else:raise AssertionError('oversized output must abort')
    assert not run_scope['group_alive'](run_scope['child'])
    assert (root/'oversize.redacted.log').read_text()==''
    peak=[]
    class TrackingQueue(queue.Queue):
        def put(self,*args,**kwargs):
            super().put(*args,**kwargs);peak.append(self.qsize())
    from types import SimpleNamespace
    run_scope.update(child=None,stop_requested=False,queue=SimpleNamespace(Queue=TrackingQueue,Empty=queue.Empty,Full=queue.Full))
    plain_redact=run_scope['redact']
    def slow_redact(line):time.sleep(0.005);return plain_redact(line)
    run_scope['redact']=slow_redact
    with contextlib.redirect_stdout(io.StringIO()):
        result=run_scope['run_client']('queue-pressure',['-c',"import sys;[print('x'*1000,flush=True) for _ in range(10000)]"],0.3)
    assert result==130 and max(peak)==128
    assert not run_scope['group_alive'](run_scope['child'])
    # Late log creation after a successful freshness check must never append or
    # follow a symlink. Only synthetic paths are modified by the injection.
    log_races=[]
    log_scope={**base,'RUN':prepared};exec(functions,log_scope)
    for kind in ('file','symlink'):
        target=prepared/'online.redacted.log';victim=prepared/'log-victim'
        victim.write_text('preserve victim')
        prepared_scope['check_fresh_run'](prepared)
        def racing_open(path,*args,**kwargs):
            if Path(path)==target:
                if kind=='file':target.write_text('preserve late file')
                else:target.symlink_to(victim)
            return original_open(path,*args,**kwargs)
        with patch.object(os,'open',side_effect=racing_open):
            try:log_scope['open_log']('online')
            except FileExistsError:pass
            else:raise AssertionError('late '+kind+' must reject')
        assert victim.read_text()=='preserve victim'
        if kind=='file':assert target.read_text()=='preserve late file'
        target.unlink();victim.unlink();log_races.append(kind)
    with log_scope['open_log']('doctor') as log:log.write('first\n')
    with log_scope['open_log']('doctor') as log:log.write('second\n')
    assert (prepared/'doctor.redacted.log').read_text()=='first\nsecond\n'
    (prepared/'doctor.redacted.log').chmod(0o644)
    try:log_scope['open_log']('doctor')
    except RuntimeError:pass
    else:raise AssertionError('doctor nonprivate file must reject')
    (prepared/'doctor.redacted.log').unlink()
    victim=prepared/'log-victim';victim.write_text('preserve victim')
    (prepared/'doctor.redacted.log').symlink_to(victim)
    try:log_scope['open_log']('doctor')
    except OSError:pass
    else:raise AssertionError('doctor symlink must reject')
    assert victim.read_text()=='preserve victim'
    (prepared/'doctor.redacted.log').unlink();victim.unlink()
    os.mkfifo(prepared/'doctor.redacted.log',0o600)
    try:log_scope['open_log']('doctor')
    except OSError:pass
    else:raise AssertionError('doctor FIFO must reject without blocking')
    (prepared/'doctor.redacted.log').unlink()

    # Permission denial must not leave the launcher in a blocking buffered read
    # or report stopped. The fixture owner alone cleans the exact owned group.
    denied_states=[]
    denied_scope={**base,'child':None,'stop_requested':False,'CLIENT':Path(sys.executable),
                  'env':{},'REPO':root,'RUN':root,'state':lambda **fields:denied_states.append(fields)}
    exec(functions,denied_scope)
    real_killpg=os.killpg;denied_calls=[]
    def deny_owned(pgid,sig):
        assert pgid==denied_scope['child'].pid
        denied_calls.append((pgid,int(sig)))
        raise PermissionError('synthetic killpg denial')
    started=time.monotonic()
    try:
        with patch.object(os,'killpg',side_effect=deny_owned),contextlib.redirect_stdout(io.StringIO()):
            try:denied_scope['run_client']('denied',['-c',"import sys,time;sys.stdout.write('partial');sys.stdout.flush();time.sleep(60)"],0.25)
            except RuntimeError as error:assert 'permission denied' in str(error)
            else:raise AssertionError('denied cleanup must explicitly fail')
        assert time.monotonic()-started<3
        assert denied_scope['child'].poll() is None
        assert denied_states[-1]['status']=='cleanup_failed'
        assert denied_states[-1]['client_pgid']==denied_scope['child'].pid
        assert not any(entry['status']=='stopped' for entry in denied_states)
        assert denied_calls and len(denied_calls)<=3
    finally:
        owned=denied_scope['child']
        if owned is not None:
            try:real_killpg(owned.pid,signal.SIGKILL)
            except ProcessLookupError:pass
            owned.wait(timeout=3)
    assert not denied_scope['group_alive'](owned)

    # External supervisor intentionally never reads the launcher's stdout until
    # after SIGINT and exit: this exercises an actual saturated OS pipe.
    external=root/'saturated-launcher.py'
    external.write_text("import ast,fcntl,json,os,queue,re,signal,stat,subprocess,sys,threading,time\nfrom pathlib import Path\n"+
        "tree=ast.parse(Path("+repr(str(p))+ ").read_text())\n"+
        "names="+repr(['stop','run_client','reap_cancelled','group_alive','redact','operator_output','open_log'])+"\n"+
        "exec(compile(ast.Module(body=[n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name in names],type_ignores=[]),'<launcher-functions>','exec'))\n"+
        "RUN=REPO=Path("+repr(str(root))+ ")\nCLIENT=Path(sys.executable)\nenv={}\nkey='synthetic'\nchild=None\nstop_requested=False\n"+
        "def state(**fields):\n (RUN/'external-state.json').write_text(json.dumps(fields))\n"+
        "signal.signal(signal.SIGINT,stop)\n"+
        "original_reaper=reap_cancelled\ndef reap_cancelled(process):return original_reaper(process,grace=(0.3,0.3,2))\n"+
        "result=run_client('saturated',['-c',\"import sys,time;[print('x'*1000,flush=True) for _ in range(100000)];time.sleep(60)\"],20)\n"+
        "sys.exit(result)\n")
    external_child=subprocess.Popen([sys.executable,str(external)],stdout=subprocess.PIPE,stderr=subprocess.PIPE,start_new_session=True)
    owned_pid=None
    try:
        wait_until=time.monotonic()+5
        saturated=root/'saturated.redacted.log'
        while time.monotonic()<wait_until:
            if saturated.exists() and saturated.stat().st_size>1024*1024:break
            if external_child.poll() is not None:raise AssertionError('external launcher exited early: '+repr(external_child.stderr.read()))
            time.sleep(0.02)
        else:raise AssertionError('synthetic output did not exceed pipe capacity')
        fields=json.loads((root/'external-state.json').read_text());owned_pid=fields['client_pid']
        started=time.monotonic();external_child.send_signal(signal.SIGINT)
        assert external_child.wait(timeout=5)==130
        assert time.monotonic()-started<5
        fields=json.loads((root/'external-state.json').read_text())
        assert fields['status']=='stopped' and fields['cancelled']
        assert not external_child.stderr.read()
        try:os.killpg(owned_pid,0)
        except ProcessLookupError:pass
        else:raise AssertionError('saturated-output client group survived')
    finally:
        if external_child.poll() is None:
            external_child.kill();external_child.wait(timeout=3)
        if owned_pid is None and (root/'external-state.json').exists():
            owned_pid=json.loads((root/'external-state.json').read_text()).get('client_pid')
        if owned_pid is not None:
            try:os.killpg(owned_pid,signal.SIGKILL)
            except ProcessLookupError:pass
        external_child.stdout.close();external_child.stderr.close()
result={'externalStdoutSaturationCancellation':'PASS','lateOnlineLogCreationRejected':log_races,'doctorSafeAppend':'PASS','deniedKillpgCleanup':'EXPLICIT_CLEANUP_FAILED_WITHOUT_HANG','echoControlFailure':'ABORTED_BEFORE_RAW_INPUT','fallbackReadCalls':0,'realKeyUsed':False,'realClientStarted':False,'cancelWindowsCovered':checks,'savedKeyRejections':rejected,'profileModes':profile_checks,'redaction':'PASS','realSyntheticProcessLifecycle':lifecycle,'setupFailuresCleaned':setup_failures,'oversizedOutput':'ABORTED_WITHOUT_LOGGING_CONTENT','queuePressureMaximum':max(peak),'ownedSyntheticGroupsAbsent':True,'manifestPreflightRejections':preflight_checks,'preflightBeforeKeyRead':True,'exclusiveRunLock':'PASS','oneUseMarker':'PASS','doctorOnlineStages':mode_checks}
(output_dir/'launcher-input-regression.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps({**result,'evidenceDirectory':str(output_dir)}))
