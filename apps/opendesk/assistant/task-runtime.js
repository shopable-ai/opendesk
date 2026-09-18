(function installOpenDeskAssistantTaskRuntime(global) {
  'use strict';

  class AssistantTaskRuntimeError extends Error {
    constructor(code, message, details) {
      super(message);
      this.name = 'AssistantTaskRuntimeError';
      this.code = code;
      if (details && typeof details === 'object') Object.assign(this, details);
    }
  }

  function fail(code, message, details) {
    throw new AssistantTaskRuntimeError(code, message, details);
  }

  function clone(value) {
    return value == null ? value : JSON.parse(JSON.stringify(value));
  }

  function deepFreeze(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    for (const item of Object.values(value)) deepFreeze(item);
    return Object.freeze(value);
  }

  function sha256(text) {
    const input = new TextEncoder().encode(String(text));
    const bitLength = input.length * 8;
    const total = ((input.length + 9 + 63) >> 6) << 6;
    const data = new Uint8Array(total);
    data.set(input);
    data[input.length] = 0x80;
    const view = new DataView(data.buffer);
    const high = Math.floor(bitLength / 0x100000000);
    const low = bitLength >>> 0;
    view.setUint32(total - 8, high);
    view.setUint32(total - 4, low);
    const k = [
      0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
      0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
      0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
      0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
      0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
      0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
      0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
      0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2
    ];
    let h0=0x6a09e667,h1=0xbb67ae85,h2=0x3c6ef372,h3=0xa54ff53a,h4=0x510e527f,h5=0x9b05688c,h6=0x1f83d9ab,h7=0x5be0cd19;
    const w = new Uint32Array(64);
    const rotr = (v,n) => (v >>> n) | (v << (32-n));
    for (let offset=0; offset<total; offset+=64) {
      for (let i=0;i<16;i++) w[i]=view.getUint32(offset+i*4);
      for (let i=16;i<64;i++) {
        const s0=(rotr(w[i-15],7)^rotr(w[i-15],18)^(w[i-15]>>>3))>>>0;
        const s1=(rotr(w[i-2],17)^rotr(w[i-2],19)^(w[i-2]>>>10))>>>0;
        w[i]=(w[i-16]+s0+w[i-7]+s1)>>>0;
      }
      let a=h0,b=h1,c=h2,d=h3,e=h4,f=h5,g=h6,h=h7;
      for (let i=0;i<64;i++) {
        const s1=(rotr(e,6)^rotr(e,11)^rotr(e,25))>>>0;
        const ch=((e&f)^((~e)&g))>>>0;
        const t1=(h+s1+ch+k[i]+w[i])>>>0;
        const s0=(rotr(a,2)^rotr(a,13)^rotr(a,22))>>>0;
        const maj=((a&b)^(a&c)^(b&c))>>>0;
        const t2=(s0+maj)>>>0;
        h=g;g=f;f=e;e=(d+t1)>>>0;d=c;c=b;b=a;a=(t1+t2)>>>0;
      }
      h0=(h0+a)>>>0;h1=(h1+b)>>>0;h2=(h2+c)>>>0;h3=(h3+d)>>>0;
      h4=(h4+e)>>>0;h5=(h5+f)>>>0;h6=(h6+g)>>>0;h7=(h7+h)>>>0;
    }
    return [h0,h1,h2,h3,h4,h5,h6,h7].map(v => v.toString(16).padStart(8,'0')).join('');
  }

  function create(options) {
    const settings = options || {};
    const Contract = settings.Contract || global.OpenDeskAssistantTaskContract;
    const file = settings.file || global.File;
    const modelChannel = settings.modelChannel;
    const recipeBridge = settings.recipeBridge || global.__opendeskRecipeExecution || null;
    const flowBridge = settings.flowBridge || global.__opendeskFlowExecution || null;
    const rootDir = settings.rootDir;
    const defaultBusinessCwd = settings.defaultBusinessCwd || (global.Execution && global.Execution.workdir) || '';
    const randomUUID = settings.randomUUID || (global.crypto && typeof global.crypto.randomUUID === 'function' ? () => global.crypto.randomUUID() : null);
    const clock = settings.clock || (() => new Date());
    if (!Contract || typeof Contract.createStore !== 'function') fail('TASK_CONTRACT_UNAVAILABLE', 'task contract module is not loaded');
    if (!file || typeof file.join !== 'function' || typeof file.ensureDir !== 'function' || typeof file.readJSON !== 'function'
      || typeof file.writeNew !== 'function' || typeof file.exists !== 'function' || typeof file.listDir !== 'function') {
      fail('TASK_IO_UNAVAILABLE', 'task runtime requires safe File persistence operations');
    }
    if (!rootDir || !randomUUID) fail('TASK_RUNTIME_UNAVAILABLE', 'task runtime requires a root directory and random UUID source');

    const taskStore = Contract.createStore({file, rootDir, clock});
    const protectedRoots = Array.isArray(settings.protectedRoots) ? settings.protectedRoots : [];
    const candidateService = Contract.createCandidateService({file, digest: sha256, protectedRoots});
    const flowUse = flowBridge ? Contract.createFlowUseService({
      gateway: {
        inspect(installId, context) {
          return flowBridge.inspect({installId, signal: context && context.signal || null});
        },
        async run(input) {
          const workdir = input.workdir || defaultBusinessCwd || rootDir;
          const logDir = file.join(rootDir, 'runs', input.taskId || 'flow-' + randomUUID());
          let executionId = '';
          if (typeof flowBridge.reserve === 'function') {
            executionId = String(await flowBridge.reserve({installId: input.installId}) || '');
            if (executionId && typeof input.onReserved === 'function') await input.onReserved(executionId);
          }
          const result = await flowBridge.run({
            installId: input.installId,
            executionId,
            workdir,
            logDir,
            inputJSON: JSON.stringify(input.input || {}),
            expectedArchiveDigest: input.expectedArchiveDigest,
            expectedManifestDigest: input.expectedManifestDigest,
            signal: input.signal || null,
          });
          return Object.assign({}, result, {businessVerified: false, verification: null});
        },
      },
      randomUUID,
      clock,
    }) : null;
    const scriptConfirmations = new Map();

    function candidateDir(taskId, candidateId) {
      return file.join(taskStore.rootDir, Contract.normalizePath('/' + taskId).slice(1), 'candidates', Contract.normalizePath('/' + candidateId).slice(1));
    }

    function candidateVersions(taskId, candidateId) {
      const dir = candidateDir(taskId, candidateId);
      if (!file.exists(dir)) return [];
      return file.listDir(dir).map(String).filter(name => /^\d{8}\.json$/.test(name)).sort();
    }

    async function loadCandidate(taskId, candidateId) {
      const names = candidateVersions(taskId, candidateId);
      if (!names.length) return null;
      return deepFreeze(await file.readJSON(file.join(candidateDir(taskId, candidateId), names[names.length - 1]), {maxBytes: 2 * 1024 * 1024}));
    }

    async function persistCandidate(item) {
      const dir = candidateDir(item.taskId, item.candidateId);
      file.ensureDir(dir);
      const names = candidateVersions(item.taskId, item.candidateId);
      const revision = names.length + 1;
      const target = file.join(dir, String(revision).padStart(8, '0') + '.json');
      file.writeNew(target, JSON.stringify(item) + '\n');
      return deepFreeze(clone(item));
    }

    async function latestForConversation(conversationId) {
      const id = String(conversationId || '');
      const tasks = await taskStore.list();
      const matches = tasks.filter(item => item.conversationId === id).sort((a,b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
      const task = matches[0] || null;
      if (!task) return null;
      let candidate = null;
      for (const ref of task.outputRefs || []) {
        if (!String(ref).startsWith('candidate:')) continue;
        candidate = await loadCandidate(task.taskId, String(ref).slice('candidate:'.length));
      }
      return deepFreeze({task, candidate});
    }

    async function startTask(input) {
      const requested = Contract.create(Object.assign({}, input, {revision: 0, status: input && input.status || 'queued'}));
      return taskStore.save(requested, {expectedRevision: 0});
    }

    async function updateTask(task, patch) {
      const next = Contract.create(Object.assign({}, task, patch || {}, {revision: task.revision}));
      return taskStore.save(next, {expectedRevision: task.revision});
    }

    async function explain(taskId, context) {
      let task = await taskStore.load(taskId);
      if (!task) fail('TASK_NOT_FOUND', 'task was not found');
      if (task.intent !== 'explain') fail('INVALID_TASK_INTENT', 'task is not an explain task');
      if (task.asset.kind === 'installed-flow') {
        if (!flowBridge || typeof flowBridge.inspect !== 'function') fail('FLOW_GATEWAY_UNAVAILABLE', 'installed Flow inspection is unavailable');
        const inspected = await flowBridge.inspect({installId: task.asset.installId, signal: context && context.signal || null});
        const safe = {
          installId: inspected.installId,
          flowId: inspected.flowId,
          name: inspected.name,
          version: inspected.version,
          publisherId: inspected.publisherId,
          state: inspected.state,
          runnable: inspected.runnable === true,
          protected: inspected.protected === true,
        };
        task = await updateTask(task, {status: 'explained', evidence: (task.evidence || []).concat([{type:'flow-metadata-inspection', at:clock().toISOString(), metadata:safe}])});
        return deepFreeze({task, text: '已根据安装 Flow 的公开元信息完成说明；未读取受保护源码。\n' + JSON.stringify(safe, null, 2)});
      }
      if (task.asset.kind === 'js-file' || task.asset.kind === 'automation-directory') {
        fail('AUTHOR_SOURCE_READ_BLOCKED', '当前安全门不允许助手为解释而读取关联源码；资产关联本身不授权读取或外发');
      }
      if (!modelChannel || typeof modelChannel.send !== 'function') fail('MODEL_UNAVAILABLE', 'model channel is unavailable');
      const reply = await modelChannel.send({messages:[{role:'user',content:task.userGoal}], signal:context && context.signal || null, requestId:task.requestId});
      task = await updateTask(task, {status:'explained'});
      return deepFreeze({task, text:reply.text});
    }

    async function generateCandidate(taskId, context) {
      let task = await taskStore.load(taskId);
      if (!task) fail('TASK_NOT_FOUND', 'task was not found');
      if (task.intent !== 'make' && task.intent !== 'improve') fail('INVALID_TASK_INTENT', 'task is not a make/improve task');
      if (task.intent === 'improve' || task.asset.kind !== 'none') {
        fail('AUTHOR_SOURCE_READ_BLOCKED', '源码型改进仍被任务级真实文件授权安全门阻塞；不会把关联路径升级为作者读取权限');
      }
      if (!modelChannel || typeof modelChannel.draftCandidate !== 'function') fail('MODEL_UNAVAILABLE', 'safe candidate drafting channel is unavailable');
      const drafted = await modelChannel.draftCandidate({goal:task.userGoal, signal:context && context.signal || null, requestId:task.requestId});
      const candidate = candidateService.create({
        contract: Contract.create(Object.assign({}, task, {authorizations:{readSource:false,shareSourceWithModel:false}})),
        candidateId: 'cand-' + randomUUID(),
        content: drafted.text,
      });
      await persistCandidate(candidate);
      const outputRefs = [...new Set([...(task.outputRefs || []), 'candidate:' + candidate.candidateId])];
      task = await updateTask(task, {status:'candidate-review', outputRefs});
      return deepFreeze({task, candidate});
    }

    async function saveCandidateAs(taskId, candidateId, destination) {
      let task = await taskStore.load(taskId);
      if (!task) fail('TASK_NOT_FOUND', 'task was not found');
      const candidate = await loadCandidate(taskId, candidateId);
      if (!candidate) fail('CANDIDATE_NOT_FOUND', 'candidate was not found');
      const saved = candidateService.saveAs({candidate, destination, authorized:true});
      await persistCandidate(saved);
      task = await updateTask(task, {status:'candidate-saved'});
      return deepFreeze({task, candidate:saved});
    }

    async function recordCandidateVerification(taskId, candidateId, evidence) {
      let task = await taskStore.load(taskId);
      if (!task) fail('TASK_NOT_FOUND', 'task was not found');
      const candidate = await loadCandidate(taskId, candidateId);
      if (!candidate) fail('CANDIDATE_NOT_FOUND', 'candidate was not found');
      const verified = candidateService.markVerified(candidate, evidence);
      await persistCandidate(verified);
      task = await updateTask(task, {status:'candidate-verified', evidence:(task.evidence || []).concat([{type:'candidate-verification',candidateId,verification:verified.verificationEvidence}])});
      return deepFreeze({task, candidate:verified});
    }

    function scriptAssetEntry(task) {
      if (task.asset.kind === 'js-file') return {entry:task.asset.ref, scopeRoot:''};
      if (task.asset.kind === 'automation-directory') {
        if (!task.asset.boundaryResolved || !task.asset.entryRef) {
          return {clarify:'自动化目录尚未确定唯一入口或边界；任务已保存，但不会猜测入口或执行探测脚本。'};
        }
        return {entry:task.asset.entryRef, scopeRoot:task.asset.ref};
      }
      return null;
    }

    async function prepareUse(taskId, input, context) {
      let task = await taskStore.load(taskId);
      if (!task) fail('TASK_NOT_FOUND', 'task was not found');
      if (task.intent !== 'use') fail('INVALID_TASK_INTENT', 'task is not a use task');
      if (task.asset.kind === 'none') {
        task = await updateTask(task, {status:'clarification-needed'});
        return deepFreeze({kind:'clarify', task, message:'尚未选择要使用的 JS、自动化目录或已安装 Flow。'});
      }
      if (task.asset.kind === 'installed-flow') {
        if (!flowUse) fail('FLOW_GATEWAY_UNAVAILABLE', 'installed Flow gateway is unavailable');
        task = await updateTask(task, {status:'awaiting-confirmation'});
        const prepared = await flowUse.prepare(task, input || {}, context || {});
        return deepFreeze({kind:'prepared', task, prepared, preview:'将运行已安装 Flow：' + prepared.preview.name + (prepared.preview.version ? ' ' + prepared.preview.version : '') + '\n实际输入：' + JSON.stringify(prepared.preview.input)});
      }
      const selected = scriptAssetEntry(task);
      if (selected && selected.clarify) {
        task = await updateTask(task, {status:'clarification-needed'});
        return deepFreeze({kind:'clarify', task, message:selected.clarify});
      }
      if (!recipeBridge || typeof recipeBridge.inspect !== 'function' || typeof recipeBridge.run !== 'function') {
        fail('SCRIPT_HOST_INSPECT_UNAVAILABLE', 'host script inspection/run seam is unavailable');
      }
      task = await updateTask(task, {status:'awaiting-confirmation'});
      const inspected = await recipeBridge.inspect({scriptPath:selected.entry, scopeRoot:selected.scopeRoot, signal:context && context.signal || null});
      if (!inspected || !inspected.scriptHash) fail('SCRIPT_INSPECTION_FAILED', 'host did not return a script hash');
      const token = randomUUID();
      const canonical = {
        taskId:task.taskId, taskRevision:task.revision, requestId:task.requestId,
        scriptPath:selected.entry, scopeRoot:selected.scopeRoot, scriptHash:String(inspected.scriptHash),
        input:clone(input && typeof input === 'object' ? input : {}),
      };
      scriptConfirmations.set(token, canonical);
      return deepFreeze({
        kind:'prepared',
        task,
        prepared:{taskId:task.taskId,taskRevision:task.revision,confirmationToken:token,scriptHash:canonical.scriptHash},
        preview:'将运行已关联的 ' + (task.asset.kind === 'js-file' ? '单个 JS' : '自动化目录入口') + '：' + selected.entry + '\n内容摘要：' + canonical.scriptHash + '\n实际输入：' + JSON.stringify(canonical.input),
      });
    }

    async function confirmUse(taskId, prepared, confirmationToken, context) {
      let task = await taskStore.load(taskId);
      if (!task) fail('TASK_NOT_FOUND', 'task was not found');
      if (task.intent !== 'use') fail('INVALID_TASK_INTENT', 'task is not a use task');
      let reservedExecutionId = '';

      async function recordReserved(executionId) {
        const id = String(executionId || '');
        if (!id) return;
        reservedExecutionId = id;
        task = await updateTask(task, {
          status: 'execution-reserved',
          evidence: (task.evidence || []).concat([{
            type: 'execution-reserved',
            executionId: id,
            at: clock().toISOString(),
          }]),
        });
        if (context && typeof context.onReserved === 'function') await context.onReserved(id);
      }

      async function recordRunFailure(error) {
        const executionId = String(error && error.executionId || reservedExecutionId || '');
        const runtimeStatus = String(error && error.status || '').toLowerCase();
        const terminal = runtimeStatus === 'failed' || runtimeStatus === 'canceled';
        const nextStatus = terminal
          ? (runtimeStatus === 'canceled' ? 'canceled' : 'failed')
          : 'execution-effect-unknown';
        task = await updateTask(task, {
          status: nextStatus,
          evidence: (task.evidence || []).concat([{
            type: terminal ? 'execution-terminal' : 'execution-unknown',
            executionId,
            status: runtimeStatus || 'unknown',
            businessVerified: false,
            at: clock().toISOString(),
          }]),
        });
      }

      if (task.asset.kind === 'installed-flow') {
        try {
          const run = await flowUse.confirmAndRun(task, prepared, confirmationToken, Object.assign({}, context || {}, {
            onReserved: recordReserved,
          }));
          const finalStatus = run.businessVerified ? 'business-complete' : 'execution-finished-unverified';
          task = await updateTask(task, {
            status: finalStatus,
            evidence: (task.evidence || []).concat([{
              type: 'execution-terminal',
              executionId: run.executionId,
              status: run.status,
              businessVerified: run.businessVerified,
              at: clock().toISOString(),
            }]),
          });
          return deepFreeze({task, run});
        } catch (error) {
          if (reservedExecutionId || (error && error.executionId)) {
            try { await recordRunFailure(error); } catch (_) {}
          }
          throw error;
        }
      }

      const token = String(confirmationToken || '');
      const canonical = scriptConfirmations.get(token);
      if (!canonical) fail('STALE_CONFIRMATION', 'confirmation is unknown or already consumed');
      scriptConfirmations.delete(token);
      if (!prepared || prepared.confirmationToken !== token
        || canonical.taskId !== task.taskId || canonical.taskRevision !== task.revision) {
        fail('STALE_CONFIRMATION', 'confirmation belongs to a different task revision');
      }

      const inspected = await recipeBridge.inspect({
        scriptPath: canonical.scriptPath,
        scopeRoot: canonical.scopeRoot,
        signal: context && context.signal || null,
      });
      if (!inspected || String(inspected.scriptHash || '') !== canonical.scriptHash) {
        fail('SCRIPT_CHANGED_AFTER_PREVIEW', 'script content changed after preview');
      }

      let executionId = '';
      if (typeof recipeBridge.reserve === 'function') {
        executionId = String(await recipeBridge.reserve({kind: 'recipe'}) || '');
        if (executionId) await recordReserved(executionId);
      }

      const businessCwd = task.businessCwd || defaultBusinessCwd || rootDir;
      const logDir = file.join(rootDir, 'runs', task.taskId, randomUUID());
      try {
        const result = await recipeBridge.run({
          scriptPath: canonical.scriptPath,
          scopeRoot: canonical.scopeRoot,
          expectedScriptHash: canonical.scriptHash,
          executionId,
          workdir: businessCwd,
          logDir,
          inputJSON: JSON.stringify(canonical.input || {}),
          signal: context && context.signal || null,
        });
        const actualExecutionId = String(result && result.executionId || executionId || '');
        if (!actualExecutionId) fail('EXECUTION_ID_MISSING', 'host did not return the real Execution identity');
        task = await updateTask(task, {
          status: 'execution-finished-unverified',
          evidence: (task.evidence || []).concat([{
            type: 'execution-terminal',
            executionId: actualExecutionId,
            status: String(result.status || 'unknown'),
            businessVerified: false,
            at: clock().toISOString(),
          }]),
        });
        return deepFreeze({
          task,
          run: {
            executionId: actualExecutionId,
            status: String(result.status || 'unknown'),
            businessVerified: false,
            verification: null,
          },
        });
      } catch (error) {
        if (reservedExecutionId || (error && error.executionId)) {
          try { await recordRunFailure(error); } catch (_) {}
        }
        throw error;
      }
    }

    async function resume(taskId) {
      const task = await taskStore.load(taskId);
      if (!task) return null;
      let candidate = null;
      for (const ref of task.outputRefs || []) if (String(ref).startsWith('candidate:')) candidate = await loadCandidate(task.taskId, String(ref).slice(10));
      const requiresRecheck = ['awaiting-confirmation','running','stopping'].includes(task.status);
      return deepFreeze({task, candidate, requiresRecheck, message:requiresRecheck ? '任务可接续，但旧预览、确认和运行授权不会恢复；需要重新核验。' : ''});
    }

    return Object.freeze({
      startTask,
      loadTask: taskStore.load,
      latestForConversation,
      resume,
      explain,
      generateCandidate,
      loadCandidate,
      saveCandidateAs,
      recordCandidateVerification,
      prepareUse,
      confirmUse,
      sha256,
    });
  }

  global.OpenDeskAssistantTaskRuntime = Object.freeze({create, AssistantTaskRuntimeError, sha256});
})(globalThis);
