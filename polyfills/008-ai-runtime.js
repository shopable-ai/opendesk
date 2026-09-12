// OpenDesk LLM / Agent runtime facade.
//
// LLM.generate() reuses the execution-owned HTTP client.
// Agent.run() reuses the execution-owned Command process owner. This file does
// not create a second process manager, execution, environment parser, or shell.
(function installOpenDeskAIRuntime(global) {
  'use strict';

  const MAX_PROMPT_BYTES = 1024 * 1024;
  const MAX_SCHEMA_BYTES = 256 * 1024;
  const MAX_AGENT_STDIO_BYTES = 4 * 1024 * 1024;
  const MAX_FINAL_BYTES = 1024 * 1024;
  const DEFAULT_AGENT_TIMEOUT_MS = 120000;
  const DEFAULT_LLM_TIMEOUT_MS = 30000;
  const MAX_TIMEOUT_MS = 24 * 60 * 60 * 1000;
  let callSequence = 0;

  const SUPPORTED_SCHEMA_KEYS = Object.freeze({
    type: true,
    properties: true,
    required: true,
    additionalProperties: true,
    items: true,
    enum: true,
    const: true,
    minimum: true,
    maximum: true,
    exclusiveMinimum: true,
    exclusiveMaximum: true,
    minLength: true,
    maxLength: true,
    minItems: true,
    maxItems: true
  });

  function isObject(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
  function own(object, key) { return Object.prototype.hasOwnProperty.call(object, key); }
  function assertKnownFields(object, allowed, operation, label) {
    for (const key of Object.keys(object)) if (!allowed[key]) fail(operation, 'INVALID_ARGUMENT', `${label} contains unknown field ${key}`, 'validation');
  }
  function newError(operation, code, message, phase, details) {
    const error = new Error(message);
    error.name = operation === 'Agent.run' ? 'AgentError' : 'LLMError';
    error.code = code; error.operation = operation; error.phase = phase || 'validation';
    if (details && own(details, 'backend')) error.backend = details.backend;
    if (details && own(details, 'profile')) error.profile = details.profile;
    if (details && own(details, 'causeCode')) error.causeCode = details.causeCode;
    return error;
  }
  function fail(operation, code, message, phase, details) { throw newError(operation, code, message, phase, details); }
  function env(name) {
    const snapshot = global.Execution && global.Execution.env;
    if (!snapshot || typeof snapshot !== 'object') return undefined;
    const value = snapshot[name];
    return typeof value === 'string' ? value : undefined;
  }
  function parsePositiveInteger(raw, fallback, operation, label, maximum) {
    if (raw === undefined || raw === null || raw === '') return fallback;
    const number = typeof raw === 'number' ? raw : Number(raw);
    if (!Number.isInteger(number) || number < 1 || number > maximum) fail(operation, 'INVALID_ARGUMENT', `${label} must be an integer from 1 through ${maximum}`, 'validation');
    return number;
  }
  function normalizeTimeout(raw, fallback, operation) { return parsePositiveInteger(raw, fallback, operation, 'timeoutMs', MAX_TIMEOUT_MS); }
  function nonEmptyString(value, operation, label) {
    if (typeof value !== 'string' || value.length === 0 || value.indexOf('\0') !== -1) fail(operation, 'INVALID_ARGUMENT', `${label} must be a non-empty string without NUL`, 'validation');
    return value;
  }
  function checkedPrompt(value, operation) {
    const prompt = nonEmptyString(value, operation, 'prompt');
    if (utf8Length(prompt) > MAX_PROMPT_BYTES) fail(operation, 'INPUT_TOO_LARGE', `prompt exceeds ${MAX_PROMPT_BYTES} UTF-8 bytes`, 'validation');
    return prompt;
  }
  function utf8Length(value) {
    let count = 0;
    for (let i = 0; i < value.length; i++) {
      const code = value.charCodeAt(i);
      if (code < 0x80) count += 1;
      else if (code < 0x800) count += 2;
      else if (code >= 0xd800 && code <= 0xdbff && i + 1 < value.length) {
        const next = value.charCodeAt(i + 1);
        if (next >= 0xdc00 && next <= 0xdfff) { count += 4; i += 1; } else count += 3;
      } else count += 3;
    }
    return count;
  }
  function checkCanceled(signal, operation, backend) { if (signal && signal.aborted) fail(operation, 'CANCELED', 'operation was canceled', 'cancel', { backend }); }
  function makeCallId(kind) {
    callSequence += 1;
    const execution = global.Execution || {};
    const executionId = String(execution.executionId || execution.id || 'execution').replace(/[^A-Za-z0-9._-]/g, '_');
    return `${kind}-${executionId}-${Date.now()}-${callSequence}`;
  }
  function elapsed(startedAt) { return Math.max(0, Date.now() - startedAt); }
  function remaining(deadlineAt, operation, backend) {
    const value = deadlineAt - Date.now();
    if (value <= 0) fail(operation, 'TIMEOUT', 'operation exceeded timeoutMs', 'timeout', { backend });
    return Math.max(1, Math.floor(value));
  }
  function validateSchema(schema, operation, location) {
    if (!isObject(schema)) fail(operation, 'INVALID_SCHEMA', `${location} must be an object`, 'validation');
    validateSchemaNode(schema, operation, location, 0);
    const serialized = JSON.stringify(schema);
    if (utf8Length(serialized) > MAX_SCHEMA_BYTES) fail(operation, 'INVALID_SCHEMA', `schema exceeds ${MAX_SCHEMA_BYTES} UTF-8 bytes`, 'validation');
    return serialized;
  }
  function validateSchemaNode(schema, operation, location, depth) {
    if (depth > 32) fail(operation, 'INVALID_SCHEMA', `${location} exceeds maximum schema depth`, 'validation');
    for (const key of Object.keys(schema)) if (!SUPPORTED_SCHEMA_KEYS[key]) fail(operation, 'UNSUPPORTED_SCHEMA', `${location} uses unsupported keyword ${key}`, 'validation');
    if (own(schema, 'type')) {
      const allowedTypes = ['object', 'array', 'string', 'number', 'integer', 'boolean', 'null'];
      if (typeof schema.type !== 'string' || allowedTypes.indexOf(schema.type) === -1) fail(operation, 'INVALID_SCHEMA', `${location}.type is unsupported`, 'validation');
    }
    if (own(schema, 'properties')) {
      if (!isObject(schema.properties)) fail(operation, 'INVALID_SCHEMA', `${location}.properties must be an object`, 'validation');
      for (const key of Object.keys(schema.properties)) validateSchemaNode(schema.properties[key], operation, `${location}.properties.${key}`, depth + 1);
    }
    if (own(schema, 'required')) {
      if (!Array.isArray(schema.required) || schema.required.some((item) => typeof item !== 'string')) fail(operation, 'INVALID_SCHEMA', `${location}.required must be an array of strings`, 'validation');
      const seen = Object.create(null);
      for (const key of schema.required) { if (seen[key]) fail(operation, 'INVALID_SCHEMA', `${location}.required contains duplicate ${key}`, 'validation'); seen[key] = true; }
    }
    if (own(schema, 'additionalProperties') && typeof schema.additionalProperties !== 'boolean') fail(operation, 'UNSUPPORTED_SCHEMA', `${location}.additionalProperties must be boolean in P0`, 'validation');
    if (own(schema, 'items')) validateSchemaNode(schema.items, operation, `${location}.items`, depth + 1);
    if (own(schema, 'enum') && (!Array.isArray(schema.enum) || schema.enum.length === 0)) fail(operation, 'INVALID_SCHEMA', `${location}.enum must be a non-empty array`, 'validation');
    for (const key of ['minimum', 'maximum', 'exclusiveMinimum', 'exclusiveMaximum']) if (own(schema, key) && (typeof schema[key] !== 'number' || !Number.isFinite(schema[key]))) fail(operation, 'INVALID_SCHEMA', `${location}.${key} must be a finite number`, 'validation');
    for (const key of ['minLength', 'maxLength', 'minItems', 'maxItems']) if (own(schema, key) && (!Number.isInteger(schema[key]) || schema[key] < 0)) fail(operation, 'INVALID_SCHEMA', `${location}.${key} must be a non-negative integer`, 'validation');
  }
  function jsonEqual(left, right) { return JSON.stringify(left) === JSON.stringify(right); }
  function outputTypeFail(operation, location, expected) { fail(operation, 'OUTPUT_VALIDATION_FAILED', `${location} must be ${expected}`, 'output-validation'); }
  function validateValue(value, schema, operation, location) {
    if (own(schema, 'const') && !jsonEqual(value, schema.const)) fail(operation, 'OUTPUT_VALIDATION_FAILED', `${location} does not match const`, 'output-validation');
    if (own(schema, 'enum') && !schema.enum.some((candidate) => jsonEqual(value, candidate))) fail(operation, 'OUTPUT_VALIDATION_FAILED', `${location} is not in enum`, 'output-validation');
    const type = schema.type;
    if (type === 'null' && value !== null) outputTypeFail(operation, location, 'null');
    if (type === 'boolean' && typeof value !== 'boolean') outputTypeFail(operation, location, 'boolean');
    if (type === 'string') {
      if (typeof value !== 'string') outputTypeFail(operation, location, 'string');
      if (own(schema, 'minLength') && value.length < schema.minLength) fail(operation, 'OUTPUT_VALIDATION_FAILED', `${location} is shorter than minLength`, 'output-validation');
      if (own(schema, 'maxLength') && value.length > schema.maxLength) fail(operation, 'OUTPUT_VALIDATION_FAILED', `${location} is longer than maxLength`, 'output-validation');
    }
    if (type === 'number' || type === 'integer') {
      if (typeof value !== 'number' || !Number.isFinite(value)) outputTypeFail(operation, location, type);
      if (type === 'integer' && !Number.isInteger(value)) outputTypeFail(operation, location, 'integer');
      if (own(schema, 'minimum') && value < schema.minimum) fail(operation, 'OUTPUT_VALIDATION_FAILED', `${location} is below minimum`, 'output-validation');
      if (own(schema, 'maximum') && value > schema.maximum) fail(operation, 'OUTPUT_VALIDATION_FAILED', `${location} is above maximum`, 'output-validation');
      if (own(schema, 'exclusiveMinimum') && value <= schema.exclusiveMinimum) fail(operation, 'OUTPUT_VALIDATION_FAILED', `${location} is not above exclusiveMinimum`, 'output-validation');
      if (own(schema, 'exclusiveMaximum') && value >= schema.exclusiveMaximum) fail(operation, 'OUTPUT_VALIDATION_FAILED', `${location} is not below exclusiveMaximum`, 'output-validation');
    }
    if (type === 'array') {
      if (!Array.isArray(value)) outputTypeFail(operation, location, 'array');
      if (own(schema, 'minItems') && value.length < schema.minItems) fail(operation, 'OUTPUT_VALIDATION_FAILED', `${location} has fewer than minItems`, 'output-validation');
      if (own(schema, 'maxItems') && value.length > schema.maxItems) fail(operation, 'OUTPUT_VALIDATION_FAILED', `${location} has more than maxItems`, 'output-validation');
      if (schema.items) value.forEach((item, index) => validateValue(item, schema.items, operation, `${location}[${index}]`));
    }
    if (type === 'object') {
      if (!isObject(value)) outputTypeFail(operation, location, 'object');
      const properties = schema.properties || {};
      for (const required of schema.required || []) if (!own(value, required)) fail(operation, 'OUTPUT_VALIDATION_FAILED', `${location} is missing required property ${required}`, 'output-validation');
      for (const key of Object.keys(value)) {
        if (own(properties, key)) validateValue(value[key], properties[key], operation, `${location}.${key}`);
        else if (schema.additionalProperties === false) fail(operation, 'OUTPUT_VALIDATION_FAILED', `${location} contains additional property ${key}`, 'output-validation');
      }
    }
    return value;
  }
  function normalizeOutput(raw, operation) {
    if (raw === undefined || raw === null) return Object.freeze({ type: 'text', validation: null, schema: null, schemaJSON: null, name: null });
    if (!isObject(raw)) fail(operation, 'INVALID_ARGUMENT', 'output must be an object', 'validation');
    assertKnownFields(raw, { type: true, name: true, validation: true, schema: true }, operation, 'output');
    const type = raw.type === undefined ? 'text' : raw.type;
    if (type !== 'text' && type !== 'json') fail(operation, 'INVALID_ARGUMENT', 'output.type must be text or json', 'validation');
    if (type === 'text') {
      if (own(raw, 'name') || own(raw, 'validation') || own(raw, 'schema')) fail(operation, 'INVALID_ARGUMENT', 'text output does not accept name, validation, or schema', 'validation');
      return Object.freeze({ type: 'text', validation: null, schema: null, schemaJSON: null, name: null });
    }
    const validation = raw.validation === undefined ? 'native' : raw.validation;
    if (validation !== 'native' && validation !== 'local') fail(operation, 'INVALID_ARGUMENT', 'output.validation must be native or local', 'validation');
    const name = raw.name === undefined ? 'result' : nonEmptyString(raw.name, operation, 'output.name');
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(name)) fail(operation, 'INVALID_ARGUMENT', 'output.name must match [A-Za-z0-9_-]{1,64}', 'validation');
    const schemaJSON = validateSchema(raw.schema, operation, 'output.schema');
    return Object.freeze({ type: 'json', validation, schema: raw.schema, schemaJSON, name });
  }
  function parseStructuredText(text, output, operation) {
    if (typeof text !== 'string' || text.length === 0) fail(operation, 'PROTOCOL_ERROR', 'missing final result text', 'protocol');
    let value;
    try { value = JSON.parse(text); } catch (_) { fail(operation, 'OUTPUT_PARSE_FAILED', 'final result is not a single JSON value', 'output-validation'); }
    return validateValue(value, output.schema, operation, 'result.data');
  }
  function localJSONInstruction(output) { return `\n\nReturn only one JSON value matching this JSON Schema. Do not use Markdown fences or explanatory text. Schema name: ${output.name}. Schema: ${output.schemaJSON}`; }
  function sanitizeMeta(kind, backend, adapter, callId, profile, requestedModel, model, durationMs, usage) {
    return { callId, profile: profile || null, kind, backend, adapter, requestedModel: requestedModel || null, model: typeof model === 'string' && model ? model : null, durationMs, usage: usage && typeof usage === 'object' ? usage : null };
  }
  function commandEnabled() {
    try { const caps = global.Command && typeof global.Command.getCapabilities === 'function' ? global.Command.getCapabilities() : null; return Boolean(caps && caps.enabled); } catch (_) { return false; }
  }
  function safeChildEnvironment(backend, auth) {
    const result = {};
    const common = ['HOME','USERPROFILE','HOMEDRIVE','HOMEPATH','LOCALAPPDATA','APPDATA','PATH','PATHEXT','SYSTEMROOT','WINDIR','COMSPEC','TEMP','TMP','TMPDIR','LANG','LC_ALL','LC_CTYPE','TERM','HTTP_PROXY','HTTPS_PROXY','NO_PROXY','ALL_PROXY','http_proxy','https_proxy','no_proxy','all_proxy','SSL_CERT_FILE','SSL_CERT_DIR','NODE_EXTRA_CA_CERTS'];
    const backendKeys = backend === 'codex' ? ['CODEX_HOME'] : ['CLAUDE_CONFIG_DIR'];
    for (const key of common.concat(backendKeys)) { const value = env(key); if (value !== undefined) result[key] = value; }
    if (auth && auth.mode === 'env') {
      const secret = env(auth.env);
      if (!secret) fail('Agent.run', 'AUTH_MISSING', `configured auth environment ${auth.env} is missing`, 'configuration', { backend });
      result[auth.target] = secret;
    }
    return result;
  }
  function readAgentConfig(operation) {
    const selected = env('OPENDESK_AGENT_CONFIG');
    if (!selected) return null;
    if (!commandEnabled()) fail(operation, 'DISABLED', 'Agent configuration is unavailable for this execution source', 'configuration');
    if (!global.File || !global.path || !global.Execution) fail(operation, 'CONFIG_UNAVAILABLE', 'Agent configuration requires File, path, and Execution globals', 'configuration');
    const configPath = global.path.isAbsolute(selected) ? global.path.normalize(selected) : global.path.resolve(global.Execution.workdir, selected);
    let text;
    try { text = global.File.read(configPath, 'utf8'); } catch (_) { fail(operation, 'PROFILE_CONFIG_ERROR', 'failed to read OPENDESK_AGENT_CONFIG', 'configuration'); }
    let config;
    try { config = JSON.parse(text); } catch (_) { fail(operation, 'PROFILE_CONFIG_ERROR', 'OPENDESK_AGENT_CONFIG is not valid JSON', 'configuration'); }
    if (!isObject(config)) fail(operation, 'PROFILE_CONFIG_ERROR', 'Agent config must be an object', 'configuration');
    assertKnownFields(config, { schemaVersion: true, defaultProfile: true, profiles: true }, operation, 'Agent config');
    if (config.schemaVersion !== 1) fail(operation, 'PROFILE_CONFIG_ERROR', 'Agent config schemaVersion must be 1', 'configuration');
    if (own(config, 'defaultProfile') && typeof config.defaultProfile !== 'string') fail(operation, 'PROFILE_CONFIG_ERROR', 'Agent config defaultProfile must be a string', 'configuration');
    if (!isObject(config.profiles)) fail(operation, 'PROFILE_CONFIG_ERROR', 'Agent config profiles must be an object', 'configuration');
    return config;
  }
  function builtinProfile(backend) {
    if (backend === 'codex') return { name:'codex-analysis', backend:'codex', executableEnv:'OPENDESK_CODEX_EXECUTABLE', modelEnv:'OPENDESK_CODEX_MODEL', auth:{mode:'saved'}, policy:'analysis' };
    if (backend === 'claude-code') return { name:'claude-code-analysis', backend:'claude-code', executableEnv:'OPENDESK_CLAUDE_CODE_EXECUTABLE', modelEnv:'OPENDESK_CLAUDE_CODE_MODEL', auth:{mode:'saved'}, policy:'analysis' };
    return null;
  }
  function validateProfile(raw, name, operation) {
    if (!isObject(raw)) fail(operation, 'INVALID_PROFILE', `profile ${name} must be an object`, 'configuration');
    assertKnownFields(raw, {name:true,backend:true,executable:true,executableEnv:true,model:true,modelEnv:true,auth:true,policy:true,timeoutMs:true,cwd:true,defaultArgs:true,backendOptions:true}, operation, `profile ${name}`);
    if (own(raw,'name') && raw.name !== name) fail(operation,'INVALID_PROFILE',`profile ${name}.name must match its profile key`,'configuration');
    const backend = nonEmptyString(raw.backend, operation, `profile ${name}.backend`);
    if (own(raw,'executable') && own(raw,'executableEnv')) fail(operation,'INVALID_PROFILE',`profile ${name} cannot set executable and executableEnv together`,'configuration');
    if (own(raw,'model') && own(raw,'modelEnv')) fail(operation,'INVALID_PROFILE',`profile ${name} cannot set model and modelEnv together`,'configuration');
    if (own(raw,'defaultArgs')) validateDefaultArgs(raw.defaultArgs, backend, operation, name);
    if (own(raw,'backendOptions')) validateBackendOptions(raw.backendOptions, backend, operation, `profile ${name}.backendOptions`);
    if (own(raw,'cwd') && (typeof raw.cwd !== 'string' || raw.cwd.length === 0)) fail(operation,'INVALID_PROFILE',`profile ${name}.cwd must be a non-empty string`,'configuration');
    if (own(raw,'timeoutMs')) normalizeTimeout(raw.timeoutMs, DEFAULT_AGENT_TIMEOUT_MS, operation);
    if (own(raw,'policy') && raw.policy !== 'analysis') fail(operation,'UNSUPPORTED_PERMISSION_POLICY',`profile ${name}.policy is not supported by P0`,'configuration',{backend});
    validateAuth(raw.auth, backend, operation, name);
    return Object.assign({name}, raw, {backend});
  }
  function validateAuth(raw, backend, operation, name) {
    if (raw === undefined) return;
    if (!isObject(raw)) fail(operation,'INVALID_PROFILE',`profile ${name}.auth must be an object`,'configuration');
    assertKnownFields(raw,{mode:true,env:true},operation,`profile ${name}.auth`);
    if (raw.mode === 'saved') { if (own(raw,'env')) fail(operation,'INVALID_PROFILE',`profile ${name}.auth.env is invalid for saved auth`,'configuration'); return; }
    if (raw.mode !== 'env') fail(operation,'UNSUPPORTED_AUTH_MODE',`profile ${name}.auth.mode is unsupported`,'configuration',{backend});
    nonEmptyString(raw.env, operation, `profile ${name}.auth.env`);
  }
  function reservedArg(backend, token) {
    const lower = String(token).toLowerCase();
    const codex = ['exec','e','--json','--experimental-json','--output-last-message','-o','--output-schema','--model','-m','--cd','-c','--sandbox','-s','--profile','-p','--config','--dangerously-bypass-approvals-and-sandbox','--yolo','--full-auto','--ask-for-approval','-a','--add-dir','--image','-i','--oss','--local-provider'];
    const claude = ['-p','--print','--output-format','--json-schema','--model','--permission-mode','--allowedtools','--disallowedtools','--tools','--mcp-config','--plugin-dir','--plugin-url','--fallback-model','--system-prompt','--system-prompt-file','--append-system-prompt','--append-system-prompt-file','--permission-prompt-tool'];
    const set = backend === 'codex' ? codex : claude;
    return set.some((flag) => lower === flag || lower.indexOf(flag + '=') === 0);
  }
  function validateDefaultArgs(raw, backend, operation, profileName) {
    if (!Array.isArray(raw)) fail(operation,'INVALID_PROFILE',`profile ${profileName}.defaultArgs must be an array`,'configuration');
    for (let i=0;i<raw.length;i++) {
      if (typeof raw[i] !== 'string' || raw[i].indexOf('\0') !== -1) fail(operation,'INVALID_PROFILE',`profile ${profileName}.defaultArgs[${i}] must be a string without NUL`,'configuration');
      if (reservedArg(backend,raw[i])) fail(operation,'RESERVED_BACKEND_ARGUMENT',`profile ${profileName}.defaultArgs cannot override ${raw[i]}`,'configuration',{backend});
    }
  }
  function validateBackendOptions(raw, backend, operation, label) {
    if (raw === undefined || raw === null) return {};
    if (!isObject(raw)) fail(operation,'INVALID_ARGUMENT',`${label} must be an object`,'validation',{backend});
    const keys=Object.keys(raw);
    if (keys.some((key)=>key!==backend)) fail(operation,'BACKEND_OPTIONS_CONFLICT',`${label} may contain only the selected backend namespace ${backend}`,'validation',{backend});
    const values=own(raw,backend)?raw[backend]:{};
    if (!isObject(values)) fail(operation,'INVALID_ARGUMENT',`${label}.${backend} must be an object`,'validation',{backend});
    if (backend==='codex') {
      assertKnownFields(values,{reasoningEffort:true},operation,`${label}.codex`);
      if (own(values,'reasoningEffort') && ['low','medium','high','xhigh'].indexOf(values.reasoningEffort)===-1) fail(operation,'INVALID_ARGUMENT',`${label}.codex.reasoningEffort must be low, medium, high, or xhigh`,'validation',{backend});
    } else if (backend==='claude-code') {
      assertKnownFields(values,{maxTurns:true},operation,`${label}.claude-code`);
      if (own(values,'maxTurns') && (!Number.isInteger(values.maxTurns)||values.maxTurns<1||values.maxTurns>100)) fail(operation,'INVALID_ARGUMENT',`${label}.claude-code.maxTurns must be an integer from 1 through 100`,'validation',{backend});
    } else if (keys.length>0) fail(operation,'BACKEND_NOT_IMPLEMENTED',`backend ${backend} is not implemented`,'configuration',{backend});
    return values;
  }
  function mergeKnownBackendOptions(profileOptions,callOptions,backend,operation){return Object.assign({},validateBackendOptions(profileOptions,backend,operation,'profile.backendOptions'),validateBackendOptions(callOptions,backend,operation,'backendOptions'));}
  function resolveAgentSelection(options,operation){
    const config=readAgentConfig(operation);let selectedProfileName=options.profile;let selectedBackend=options.backend;let profile;
    if(selectedProfileName!==undefined){nonEmptyString(selectedProfileName,operation,'profile');const configured=config&&config.profiles&&config.profiles[selectedProfileName];const builtin=selectedProfileName==='codex-analysis'?builtinProfile('codex'):selectedProfileName==='claude-code-analysis'?builtinProfile('claude-code'):null;if(!configured&&!builtin)fail(operation,'PROFILE_NOT_FOUND',`profile ${selectedProfileName} was not found`,'configuration');profile=configured?validateProfile(configured,selectedProfileName,operation):builtin;if(selectedBackend!==undefined&&selectedBackend!==profile.backend)fail(operation,'BACKEND_PROFILE_CONFLICT',`backend ${selectedBackend} conflicts with profile ${selectedProfileName}`,'configuration',{backend:selectedBackend,profile:selectedProfileName});selectedBackend=profile.backend;}
    else if(selectedBackend!==undefined){nonEmptyString(selectedBackend,operation,'backend');profile=builtinProfile(selectedBackend);}
    else{selectedProfileName=env('OPENDESK_AGENT_DEFAULT_PROFILE')||(config&&config.defaultProfile)||undefined;if(selectedProfileName){const configured=config&&config.profiles&&config.profiles[selectedProfileName];const builtin=selectedProfileName==='codex-analysis'?builtinProfile('codex'):selectedProfileName==='claude-code-analysis'?builtinProfile('claude-code'):null;if(!configured&&!builtin)fail(operation,'PROFILE_NOT_FOUND',`default profile ${selectedProfileName} was not found`,'configuration');profile=configured?validateProfile(configured,selectedProfileName,operation):builtin;selectedBackend=profile.backend;}else{selectedBackend=env('OPENDESK_AGENT_BACKEND')||'codex';profile=builtinProfile(selectedBackend);}}
    if(selectedBackend!=='codex'&&selectedBackend!=='claude-code'){if(selectedBackend==='gemini'||selectedBackend==='custom-json'||selectedBackend==='json-cli')fail(operation,'BACKEND_NOT_IMPLEMENTED',`backend ${selectedBackend} is reserved but not implemented`,'configuration',{backend:selectedBackend});fail(operation,'UNKNOWN_BACKEND',`unknown backend ${selectedBackend}`,'configuration',{backend:selectedBackend});}
    if(!profile)profile=builtinProfile(selectedBackend);if(!profile)fail(operation,'BACKEND_NOT_IMPLEMENTED',`backend ${selectedBackend} is not implemented`,'configuration',{backend:selectedBackend});profile=validateProfile(profile,profile.name||`${selectedBackend}-analysis`,operation);
    let executable=profile.executable;if(!executable&&profile.executableEnv)executable=env(profile.executableEnv);if(!executable)fail(operation,'PROGRAM_NOT_CONFIGURED',`no executable is configured for backend ${selectedBackend}`,'configuration',{backend:selectedBackend,profile:profile.name});nonEmptyString(executable,operation,'executable');if(!global.path||typeof global.path.isAbsolute!=='function'||!global.path.isAbsolute(executable))fail(operation,'PROGRAM_NOT_CONFIGURED',`backend ${selectedBackend} executable must be an absolute path`,'configuration',{backend:selectedBackend,profile:profile.name});
    let model=options.model;if(model!==undefined)nonEmptyString(model,operation,'model');if(!model&&profile.model)model=profile.model;if(!model&&profile.modelEnv)model=env(profile.modelEnv);
    const backendTimeoutKey=selectedBackend==='codex'?'OPENDESK_CODEX_TIMEOUT_MS':'OPENDESK_CLAUDE_CODE_TIMEOUT_MS';const genericTimeout=parsePositiveInteger(env('OPENDESK_AGENT_TIMEOUT_MS'),DEFAULT_AGENT_TIMEOUT_MS,operation,'OPENDESK_AGENT_TIMEOUT_MS',MAX_TIMEOUT_MS);const backendTimeout=parsePositiveInteger(env(backendTimeoutKey),genericTimeout,operation,backendTimeoutKey,MAX_TIMEOUT_MS);const profileTimeout=profile.timeoutMs===undefined?backendTimeout:normalizeTimeout(profile.timeoutMs,backendTimeout,operation);const timeoutMs=options.timeoutMs===undefined?profileTimeout:normalizeTimeout(options.timeoutMs,profileTimeout,operation);
    const profileCwd=profile.cwd?(global.path.isAbsolute(profile.cwd)?profile.cwd:global.path.resolve(global.Execution.workdir,profile.cwd)):null;const cwd=options.cwd?nonEmptyString(options.cwd,operation,'cwd'):profileCwd;const finalCwd=cwd?(global.path.isAbsolute(cwd)?global.path.normalize(cwd):global.path.resolve(global.Execution.workdir,cwd)):null;const backendOptions=mergeKnownBackendOptions(profile.backendOptions,options.backendOptions,selectedBackend,operation);const auth=normalizeAuth(profile.auth,selectedBackend,operation,profile.name);return{backend:selectedBackend,profile,executable,model:model||null,timeoutMs,cwd:finalCwd,backendOptions,auth};
  }
  function normalizeAuth(raw,backend,operation,profileName){if(!raw||raw.mode==='saved')return{mode:'saved'};if(raw.mode==='env'){const target=backend==='codex'?'CODEX_API_KEY':'ANTHROPIC_API_KEY';return{mode:'env',env:raw.env,target};}fail(operation,'UNSUPPORTED_AUTH_MODE',`profile ${profileName} auth mode is unsupported`,'configuration',{backend});}
  function makeInvocationDirectory(callId,operation){if(!global.File||!global.path||!global.Execution)fail(operation,'RUNTIME_UNAVAILABLE','File, path, and Execution are required','configuration');const root=global.path.resolve(global.Execution.artifactDir||global.Execution.workdir,'agent');const directory=global.path.resolve(root,callId);try{if(global.File.exists(directory))fail(operation,'INVOCATION_COLLISION','agent invocation directory already exists','preparation');global.File.ensureDir(directory);}catch(error){if(error&&error.code==='INVOCATION_COLLISION')throw error;fail(operation,'PREPARATION_FAILED','failed to create agent invocation directory','preparation');}return directory;}
  function cleanupInvocation(directory,files){if(!global.File)return;for(const file of files||[]){try{if(file&&global.File.exists(file))global.File.remove(file);}catch(_){}}try{if(directory&&global.File.exists(directory))global.File.removeDir(directory);}catch(_){}}
  function readBoundedFile(file,operation,backend){let stat;try{stat=global.File.stat(file);}catch(_){fail(operation,'RESULT_FILE_MISSING','failed to stat final result file','protocol',{backend});}if(!stat||stat.type!=='file'||typeof stat.size!=='number')fail(operation,'RESULT_FILE_MISSING','final result file is missing','protocol',{backend});if(stat.size<1||stat.size>MAX_FINAL_BYTES)fail(operation,'RESULT_FILE_LIMIT',`final result file must be 1 through ${MAX_FINAL_BYTES} bytes`,'protocol',{backend});let text;try{text=global.File.read(file,'utf8');}catch(_){fail(operation,'RESULT_FILE_READ_FAILED','failed to read final result file','protocol',{backend});}if(utf8Length(text)>MAX_FINAL_BYTES)fail(operation,'RESULT_FILE_LIMIT',`final result file exceeds ${MAX_FINAL_BYTES} bytes`,'protocol',{backend});return text;}
  function parseCodexProtocol(stdout,operation){const lines=String(stdout||'').split(/\r?\n/).filter((line)=>line.trim()!=='');if(lines.length===0)fail(operation,'PROTOCOL_ERROR','Codex emitted no JSONL events','protocol',{backend:'codex'});let terminal=null;let usage=null;for(const line of lines){let event;try{event=JSON.parse(line);}catch(_){fail(operation,'PROTOCOL_ERROR','Codex JSONL contains invalid JSON','protocol',{backend:'codex'});}if(!isObject(event)||typeof event.type!=='string')fail(operation,'PROTOCOL_ERROR','Codex JSONL contains an invalid event','protocol',{backend:'codex'});if(event.type==='turn.failed'||event.type==='error')fail(operation,'AGENT_PROTOCOL_FAILED',`Codex reported terminal event ${event.type}`,'protocol',{backend:'codex'});if(event.type==='turn.completed'){if(terminal)fail(operation,'PROTOCOL_ERROR','Codex emitted multiple turn.completed events','protocol',{backend:'codex'});terminal=event;if(isObject(event.usage))usage=event.usage;}}if(!terminal)fail(operation,'PROTOCOL_INCOMPLETE','Codex did not emit turn.completed','protocol',{backend:'codex'});return{usage};}
  function adaptPromptForLocalJSON(prompt,output){return output.type==='json'&&output.validation==='local'?prompt+localJSONInstruction(output):prompt;}
  async function runCodex(selection,options,output,callId,startedAt,deadlineAt){const operation='Agent.run';const directory=makeInvocationDirectory(callId,operation);const finalFile=global.path.resolve(directory,'final-message.txt');const schemaFile=global.path.resolve(directory,'output-schema.json');const cleanup=[finalFile];try{const args=['exec','--json','--ephemeral','--output-last-message',finalFile,'--sandbox','read-only','--skip-git-repo-check'];if(selection.model)args.push('--model',selection.model);if(output.type==='json'&&output.validation==='native'){global.File.write(schemaFile,output.schemaJSON,'utf8');cleanup.push(schemaFile);args.push('--output-schema',schemaFile);}if(selection.backendOptions.reasoningEffort)args.push('-c',`model_reasoning_effort=${JSON.stringify(selection.backendOptions.reasoningEffort)}`);if(Array.isArray(selection.profile.defaultArgs))args.push.apply(args,selection.profile.defaultArgs);const cwd=selection.cwd||directory;args.push('-');checkCanceled(options.signal,operation,'codex');const input=adaptPromptForLocalJSON(options.prompt,output);let commandResult;try{commandResult=await global.Command.run(selection.executable,args,{cwd,envMode:'replace',env:safeChildEnvironment('codex',selection.auth),timeout:remaining(deadlineAt,operation,'codex'),maxOutputBytes:MAX_AGENT_STDIO_BYTES,input,signal:options.signal});}catch(error){const code=error&&error.code==='CANCELED'?'CANCELED':error&&error.code==='TIMEOUT'?'TIMEOUT':'PROCESS_FAILED';fail(operation,code,code==='PROCESS_FAILED'?'Codex process failed':`Codex ${code.toLowerCase()}`,code==='PROCESS_FAILED'?'process':code.toLowerCase(),{backend:'codex',profile:selection.profile.name,causeCode:error&&error.code});}checkCanceled(options.signal,operation,'codex');remaining(deadlineAt,operation,'codex');const protocol=parseCodexProtocol(commandResult&&commandResult.stdout,operation);const text=readBoundedFile(finalFile,operation,'codex');remaining(deadlineAt,operation,'codex');const data=output.type==='json'?parseStructuredText(text,output,operation):text;checkCanceled(options.signal,operation,'codex');return{data,meta:sanitizeMeta('agent','codex','codex-exec',callId,selection.profile.name,selection.model,null,elapsed(startedAt),protocol.usage)};}finally{cleanupInvocation(directory,cleanup);}}
  function parseClaudeEnvelope(stdout,output,operation){let envelope;try{envelope=JSON.parse(String(stdout||''));}catch(_){fail(operation,'PROTOCOL_ERROR','Claude Code output is not a JSON result envelope','protocol',{backend:'claude-code'});}if(!isObject(envelope)||envelope.type!=='result')fail(operation,'PROTOCOL_ERROR','Claude Code output is missing a result envelope','protocol',{backend:'claude-code'});if(envelope.subtype!=='success'||envelope.is_error===true)fail(operation,'AGENT_PROTOCOL_FAILED',`Claude Code reported ${String(envelope.subtype||'failure')}`,'protocol',{backend:'claude-code'});let data;if(output.type==='json'&&output.validation==='native'){if(!own(envelope,'structured_output'))fail(operation,'PROTOCOL_INCOMPLETE','Claude Code success result is missing structured_output','protocol',{backend:'claude-code'});data=validateValue(envelope.structured_output,output.schema,operation,'result.data');}else if(output.type==='json')data=parseStructuredText(envelope.result,output,operation);else{if(typeof envelope.result!=='string')fail(operation,'PROTOCOL_INCOMPLETE','Claude Code success result is missing text result','protocol',{backend:'claude-code'});data=envelope.result;}return{data,model:typeof envelope.model==='string'?envelope.model:null,usage:isObject(envelope.usage)?envelope.usage:null};}
  async function runClaude(selection,options,output,callId,startedAt,deadlineAt){const operation='Agent.run';const directory=makeInvocationDirectory(callId,operation);try{const args=['-p','--output-format','json','--permission-mode','plan','--no-session-persistence'];if(selection.model)args.push('--model',selection.model);if(output.type==='json'&&output.validation==='native')args.push('--json-schema',output.schemaJSON);if(selection.backendOptions.maxTurns)args.push('--max-turns',String(selection.backendOptions.maxTurns));if(Array.isArray(selection.profile.defaultArgs))args.push.apply(args,selection.profile.defaultArgs);const input=adaptPromptForLocalJSON(options.prompt,output);checkCanceled(options.signal,operation,'claude-code');let commandResult;try{commandResult=await global.Command.run(selection.executable,args,{cwd:selection.cwd||directory,envMode:'replace',env:safeChildEnvironment('claude-code',selection.auth),timeout:remaining(deadlineAt,operation,'claude-code'),maxOutputBytes:MAX_AGENT_STDIO_BYTES,input,signal:options.signal});}catch(error){const code=error&&error.code==='CANCELED'?'CANCELED':error&&error.code==='TIMEOUT'?'TIMEOUT':'PROCESS_FAILED';fail(operation,code,code==='PROCESS_FAILED'?'Claude Code process failed':`Claude Code ${code.toLowerCase()}`,code==='PROCESS_FAILED'?'process':code.toLowerCase(),{backend:'claude-code',profile:selection.profile.name,causeCode:error&&error.code});}checkCanceled(options.signal,operation,'claude-code');remaining(deadlineAt,operation,'claude-code');const parsed=parseClaudeEnvelope(commandResult&&commandResult.stdout,output,operation);checkCanceled(options.signal,operation,'claude-code');return{data:parsed.data,meta:sanitizeMeta('agent','claude-code','claude-code-print',callId,selection.profile.name,selection.model,parsed.model,elapsed(startedAt),parsed.usage)};}finally{cleanupInvocation(directory,[]);}}
  const Agent=Object.freeze({
    getCapabilities(query){const operation='Agent.getCapabilities';if(query!==undefined&&query!==null){if(!isObject(query))fail(operation,'INVALID_ARGUMENT','options must be an object','validation');assertKnownFields(query,{backend:true,profile:true},operation,'options');}const requested=query||{};let selection=null;let selectionError=null;try{selection=resolveAgentSelection({backend:requested.backend,profile:requested.profile},operation);}catch(error){selectionError={code:error.code||'UNKNOWN',message:error.message};}return{schemaVersion:1,enabled:commandEnabled(),executionScoped:true,defaultBackend:'codex',supportedBackends:['codex','claude-code'],reservedBackends:['gemini','custom-json'],structuredOutput:{native:['codex','claude-code'],local:true},selection:selection?{backend:selection.backend,profile:selection.profile.name,configured:true,executable:selection.executable,requestedModel:selection.model}:null,selectionError};},
    async run(rawOptions){const operation='Agent.run';const startedAt=Date.now();if(!isObject(rawOptions))fail(operation,'INVALID_ARGUMENT','options must be an object','validation');assertKnownFields(rawOptions,{backend:true,profile:true,model:true,prompt:true,output:true,cwd:true,timeoutMs:true,signal:true,backendOptions:true},operation,'options');checkCanceled(rawOptions.signal,operation,rawOptions.backend);const prompt=checkedPrompt(rawOptions.prompt,operation);if(!commandEnabled())fail(operation,'DISABLED','Agent.run is available only when Command is enabled for this execution source','configuration');const output=normalizeOutput(rawOptions.output,operation);const selection=resolveAgentSelection(rawOptions,operation);const options=Object.assign({},rawOptions,{prompt});const deadlineAt=startedAt+selection.timeoutMs;checkCanceled(options.signal,operation,selection.backend);if(selection.backend==='codex')return runCodex(selection,options,output,makeCallId('agent'),startedAt,deadlineAt);if(selection.backend==='claude-code')return runClaude(selection,options,output,makeCallId('agent'),startedAt,deadlineAt);fail(operation,'BACKEND_NOT_IMPLEMENTED',`backend ${selection.backend} is not implemented`,'configuration',{backend:selection.backend});}
  });
  function normalizeMessages(raw,operation){if(!Array.isArray(raw)||raw.length===0)fail(operation,'INVALID_ARGUMENT','messages must be a non-empty array','validation');return raw.map((message,index)=>{if(!isObject(message))fail(operation,'INVALID_ARGUMENT',`messages[${index}] must be an object`,'validation');assertKnownFields(message,{role:true,content:true},operation,`messages[${index}]`);if(message.role!=='user'&&message.role!=='assistant')fail(operation,'INVALID_ARGUMENT',`messages[${index}].role must be user or assistant`,'validation');const content=nonEmptyString(message.content,operation,`messages[${index}].content`);if(utf8Length(content)>MAX_PROMPT_BYTES)fail(operation,'INPUT_TOO_LARGE',`messages[${index}].content is too large`,'validation');return{role:message.role,content};});}
  function normalizeGeneration(raw,operation){if(raw===undefined||raw===null)return{};if(!isObject(raw))fail(operation,'INVALID_ARGUMENT','generation must be an object','validation');assertKnownFields(raw,{maxOutputTokens:true,reasoningEffort:true},operation,'generation');const result={};if(own(raw,'maxOutputTokens'))result.maxOutputTokens=parsePositiveInteger(raw.maxOutputTokens,null,operation,'generation.maxOutputTokens',1000000);if(own(raw,'reasoningEffort')){if(['none','minimal','low','medium','high','xhigh'].indexOf(raw.reasoningEffort)===-1)fail(operation,'INVALID_ARGUMENT','generation.reasoningEffort is unsupported','validation');result.reasoningEffort=raw.reasoningEffort;}return result;}
  function joinURL(base,suffix,operation){const trimmed=nonEmptyString(base,operation,'OPENDESK_LLM_BASE_URL').replace(/\/+$/,'');if(!/^https:\/\//i.test(trimmed)&&!/^http:\/\/(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?(?:\/|$)/i.test(trimmed))fail(operation,'INSECURE_BASE_URL','LLM base URL must use HTTPS, except explicit loopback HTTP','configuration');return trimmed+suffix;}
  function llmRequestInputs(options,operation,output){const hasPrompt=own(options,'prompt')&&options.prompt!==undefined;const hasMessages=own(options,'messages')&&options.messages!==undefined;if(hasPrompt===hasMessages)fail(operation,'INVALID_ARGUMENT','exactly one of prompt or messages is required','validation');const prompt=hasPrompt?checkedPrompt(options.prompt,operation):null;const messages=hasMessages?normalizeMessages(options.messages,operation):null;let system=null;if(options.system!==undefined)system=nonEmptyString(options.system,operation,'system');if(options.profile!==undefined&&options.profile!=='default')fail(operation,'PROFILE_NOT_FOUND','P0 LLM supports only the default profile','configuration');const generation=normalizeGeneration(options.generation,operation);if(output.type==='json'&&output.validation==='local'){if(prompt!==null)return{prompt:prompt+localJSONInstruction(output),messages:null,system,generation};const copy=messages.slice();copy.push({role:'user',content:localJSONInstruction(output).trim()});return{prompt:null,messages:copy,system,generation};}return{prompt,messages,system,generation};}
  function buildResponsesRequest(inputs,output,model){const body={model,input:inputs.prompt!==null?inputs.prompt:inputs.messages};if(inputs.system)body.instructions=inputs.system;if(inputs.generation.maxOutputTokens)body.max_output_tokens=inputs.generation.maxOutputTokens;if(inputs.generation.reasoningEffort)body.reasoning={effort:inputs.generation.reasoningEffort};if(output.type==='json'&&output.validation==='native')body.text={format:{type:'json_schema',name:output.name,schema:output.schema,strict:true}};return body;}
  function buildChatRequest(inputs,output,model){const messages=[];if(inputs.system)messages.push({role:'system',content:inputs.system});if(inputs.prompt!==null)messages.push({role:'user',content:inputs.prompt});else messages.push.apply(messages,inputs.messages);const body={model,messages};if(inputs.generation.maxOutputTokens)body.max_completion_tokens=inputs.generation.maxOutputTokens;if(inputs.generation.reasoningEffort)body.reasoning_effort=inputs.generation.reasoningEffort;if(output.type==='json'&&output.validation==='native')body.response_format={type:'json_schema',json_schema:{name:output.name,schema:output.schema,strict:true}};return body;}
  function parseResponses(data,output,operation){if(!isObject(data)||data.status!=='completed')fail(operation,'PROTOCOL_INCOMPLETE',`Responses API status is ${String(data&&data.status||'missing')}`,'protocol');if(data.error)fail(operation,'PROTOCOL_ERROR','Responses API returned an error object','protocol');let text=typeof data.output_text==='string'?data.output_text:'';if(!text&&Array.isArray(data.output)){const pieces=[];for(const item of data.output){if(!item||item.type!=='message'||!Array.isArray(item.content))continue;for(const content of item.content){if(content&&content.type==='refusal')fail(operation,'MODEL_REFUSAL','model refused the request','protocol');if(content&&content.type==='output_text'&&typeof content.text==='string')pieces.push(content.text);}}text=pieces.join('');}if(!text)fail(operation,'PROTOCOL_INCOMPLETE','Responses API returned no output text','protocol');return{data:output.type==='json'?parseStructuredText(text,output,operation):text,model:data.model,usage:data.usage};}
  function parseChat(data,output,operation){if(!isObject(data)||!Array.isArray(data.choices)||data.choices.length<1)fail(operation,'PROTOCOL_INCOMPLETE','Chat Completions returned no choices','protocol');const choice=data.choices[0];if(!choice||choice.finish_reason!=='stop')fail(operation,'PROTOCOL_INCOMPLETE',`Chat Completions finish_reason is ${String(choice&&choice.finish_reason||'missing')}`,'protocol');if(!choice.message||choice.message.refusal)fail(operation,'MODEL_REFUSAL','model refused the request','protocol');const text=choice.message.content;if(typeof text!=='string'||!text)fail(operation,'PROTOCOL_INCOMPLETE','Chat Completions returned no text content','protocol');return{data:output.type==='json'?parseStructuredText(text,output,operation):text,model:data.model,usage:data.usage};}
  const LLM=Object.freeze({
    getCapabilities(){const protocol=env('OPENDESK_LLM_PROTOCOL')||'openai-responses';return{schemaVersion:1,enabled:Boolean(global.http&&typeof global.http.request==='function'),executionScoped:true,supportedProtocols:['openai-responses','openai-chat-completions'],reservedProtocols:['anthropic-messages'],configured:Boolean(env('OPENDESK_LLM_BASE_URL')&&env('OPENDESK_LLM_MODEL')&&env('OPENDESK_LLM_API_KEY')),protocol,structuredOutput:{native:protocol==='openai-responses'||protocol==='openai-chat-completions',local:true}};},
    async generate(rawOptions){const operation='LLM.generate';const startedAt=Date.now();if(!isObject(rawOptions))fail(operation,'INVALID_ARGUMENT','options must be an object','validation');assertKnownFields(rawOptions,{prompt:true,messages:true,system:true,profile:true,output:true,generation:true,timeoutMs:true,signal:true},operation,'options');checkCanceled(rawOptions.signal,operation);if(!global.http||typeof global.http.request!=='function')fail(operation,'DISABLED','HTTP client is unavailable in this execution','configuration');const output=normalizeOutput(rawOptions.output,operation);const protocol=env('OPENDESK_LLM_PROTOCOL')||'openai-responses';if(protocol!=='openai-responses'&&protocol!=='openai-chat-completions'){if(protocol==='anthropic-messages')fail(operation,'PROTOCOL_NOT_IMPLEMENTED','anthropic-messages is reserved but not implemented','configuration');fail(operation,'UNKNOWN_PROTOCOL',`unknown LLM protocol ${protocol}`,'configuration');}const baseURL=env('OPENDESK_LLM_BASE_URL');const model=env('OPENDESK_LLM_MODEL');const apiKey=env('OPENDESK_LLM_API_KEY');if(!baseURL||!model||!apiKey)fail(operation,'CONFIG_MISSING','OPENDESK_LLM_BASE_URL, OPENDESK_LLM_MODEL, and OPENDESK_LLM_API_KEY are required','configuration');const timeoutDefault=parsePositiveInteger(env('OPENDESK_LLM_TIMEOUT_MS'),DEFAULT_LLM_TIMEOUT_MS,operation,'OPENDESK_LLM_TIMEOUT_MS',MAX_TIMEOUT_MS);const timeoutMs=rawOptions.timeoutMs===undefined?timeoutDefault:normalizeTimeout(rawOptions.timeoutMs,timeoutDefault,operation);const inputs=llmRequestInputs(rawOptions,operation,output);const callId=makeCallId('llm');const deadlineAt=startedAt+timeoutMs;const suffix=protocol==='openai-responses'?'/responses':'/chat/completions';const body=protocol==='openai-responses'?buildResponsesRequest(inputs,output,model):buildChatRequest(inputs,output,model);checkCanceled(rawOptions.signal,operation);let response;try{response=await global.http.request({url:joinURL(baseURL,suffix,operation),method:'POST',headers:{Authorization:`Bearer ${apiKey}`,'Content-Type':'application/json'},data:body,timeout:remaining(deadlineAt,operation),signal:rawOptions.signal,responseType:'json'});}catch(error){const code=error&&(error.code==='CANCELED'||error.name==='AbortError')?'CANCELED':error&&error.code==='TIMEOUT'?'TIMEOUT':'HTTP_FAILED';fail(operation,code,code==='HTTP_FAILED'?'LLM HTTP request failed':`LLM ${code.toLowerCase()}`,code==='HTTP_FAILED'?'transport':code.toLowerCase(),{causeCode:error&&error.code});}checkCanceled(rawOptions.signal,operation);remaining(deadlineAt,operation);if(!response||typeof response.status!=='number'||response.status<200||response.status>=300)fail(operation,'HTTP_FAILED',`LLM HTTP status ${String(response&&response.status)}`,'transport');const parsed=protocol==='openai-responses'?parseResponses(response.data,output,operation):parseChat(response.data,output,operation);checkCanceled(rawOptions.signal,operation);return{data:parsed.data,meta:sanitizeMeta('llm',protocol,protocol,callId,rawOptions.profile||'default',model,parsed.model,elapsed(startedAt),parsed.usage)};}
  });
  global.Agent=Agent;
  global.LLM=LLM;
})(globalThis);
