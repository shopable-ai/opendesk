// OpenDesk LLM / Agent runtime facade.
//
// LLM.generate() reuses the execution-owned HTTP client. Agent.run() reuses
// the execution-owned Command process owner. This facade owns only validated
// configuration, protocol adaptation, and the shared business-result contract.
(function installOpenDeskAIRuntime(global) {
  'use strict';

  const MAX_PROMPT_BYTES = 1024 * 1024;
  const MAX_SCHEMA_BYTES = 256 * 1024;
  const MAX_AGENT_STDIO_BYTES = 4 * 1024 * 1024;
  const MAX_FINAL_BYTES = 1024 * 1024;
  const MAX_TIMEOUT_MS = 24 * 60 * 60 * 1000;
  const DEFAULT_AGENT_TIMEOUT_MS = 120000;
  const DEFAULT_LLM_TIMEOUT_MS = 30000;
  const DEFAULT_LLM_MAX_RETRIES = 2;
  const SUPPORTED_LLM_PROTOCOLS = Object.freeze([
    'openai-responses',
    'openai-chat-completions',
  ]);
  const SUPPORTED_AGENT_BACKENDS = Object.freeze(['codex', 'claude-code']);
  const RESERVED_LLM_PROTOCOLS = Object.freeze(['anthropic-messages']);
  const RESERVED_AGENT_BACKENDS = Object.freeze(['gemini', 'custom-json']);
  const CODEX_DISABLED_FEATURES = Object.freeze([
    'shell_tool',
    'unified_exec',
    'computer_use',
    'browser_use',
    'browser_use_external',
    'in_app_browser',
    'in_app_local_automation',
    'apps',
    'multi_agent',
  ]);
  const ENVIRONMENT_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;
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
    maxItems: true,
  });

  let callSequence = 0;

  // Command owns platform PATH/PATHEXT and executable permission semantics.
  // Capture its private bootstrap bridge, then remove that bridge before user
  // JavaScript starts so executable discovery does not become a public Command
  // method or an arbitrary command-resolution surface.
  const resolveCommandExecutable = global.Command
    && typeof global.Command.__resolveExecutable === 'function'
    ? global.Command.__resolveExecutable
    : null;
  if (global.Command && Object.prototype.hasOwnProperty.call(global.Command, '__resolveExecutable')) {
    try { delete global.Command.__resolveExecutable; } catch (_) { /* fail closed when Agent resolves */ }
  }

  function isObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
  }

  function own(object, key) {
    return Object.prototype.hasOwnProperty.call(object, key);
  }

  function newError(operation, code, message, phase, details) {
    const error = new Error(message);
    error.name = 'ModelCallError';
    error.code = code;
    error.operation = operation;
    error.phase = phase || 'validation';
    if (details && own(details, 'backend')) error.backend = details.backend;
    if (details && own(details, 'profile')) error.profile = details.profile;
    if (details && own(details, 'protocol')) error.protocol = details.protocol;
    if (details && own(details, 'causeCode')) error.causeCode = details.causeCode;
    if (details && own(details, 'status')) error.status = details.status;
    return error;
  }

  function fail(operation, code, message, phase, details) {
    throw newError(operation, code, message, phase, details);
  }

  function assertKnownFields(object, allowed, operation, label) {
    for (const key of Object.keys(object)) {
      if (!allowed[key]) {
        fail(operation, 'INVALID_ARGUMENT', `${label} contains unknown field ${key}`, 'validation');
      }
    }
  }

  function env(name) {
    const snapshot = global.Execution && global.Execution.env;
    if (!snapshot || typeof snapshot !== 'object') return undefined;
    const value = snapshot[name];
    return typeof value === 'string' ? value : undefined;
  }

  function nonEmptyString(value, operation, label) {
    if (typeof value !== 'string' || value.length === 0 || value.indexOf('\0') !== -1) {
      fail(operation, 'INVALID_ARGUMENT', `${label} must be a non-empty string without NUL`, 'validation');
    }
    return value;
  }

  function environmentName(value, operation, label, code) {
    const name = nonEmptyString(value, operation, label);
    if (!ENVIRONMENT_NAME.test(name)) {
      fail(operation, code || 'INVALID_ARGUMENT', `${label} is not a valid environment name`, 'configuration');
    }
    return name;
  }

  function utf8Length(value) {
    let count = 0;
    for (let index = 0; index < value.length; index += 1) {
      const code = value.charCodeAt(index);
      if (code < 0x80) count += 1;
      else if (code < 0x800) count += 2;
      else if (code >= 0xd800 && code <= 0xdbff && index + 1 < value.length) {
        const next = value.charCodeAt(index + 1);
        if (next >= 0xdc00 && next <= 0xdfff) {
          count += 4;
          index += 1;
        } else {
          count += 3;
        }
      } else count += 3;
    }
    return count;
  }

  function checkedPrompt(value, operation) {
    const prompt = nonEmptyString(value, operation, 'prompt');
    if (utf8Length(prompt) > MAX_PROMPT_BYTES) {
      fail(operation, 'INPUT_TOO_LARGE', `prompt exceeds ${MAX_PROMPT_BYTES} UTF-8 bytes`, 'validation');
    }
    return prompt;
  }

  function parsePositiveInteger(raw, fallback, operation, label, maximum) {
    if (raw === undefined || raw === null || raw === '') return fallback;
    const number = typeof raw === 'number' ? raw : Number(raw);
    if (!Number.isInteger(number) || number < 1 || number > maximum) {
      fail(operation, 'INVALID_ARGUMENT', `${label} must be an integer from 1 through ${maximum}`, 'validation');
    }
    return number;
  }

  function parseNonNegativeInteger(raw, fallback, operation, label, maximum) {
    if (raw === undefined || raw === null || raw === '') return fallback;
    const number = typeof raw === 'number' ? raw : Number(raw);
    if (!Number.isInteger(number) || number < 0 || number > maximum) {
      fail(operation, 'INVALID_ARGUMENT', `${label} must be an integer from 0 through ${maximum}`, 'validation');
    }
    return number;
  }

  function normalizeTimeout(raw, fallback, operation, label) {
    return parsePositiveInteger(raw, fallback, operation, label || 'timeoutMs', MAX_TIMEOUT_MS);
  }

  function normalizePublicTimeout(raw, fallback, operation) {
    if (raw === undefined) return fallback;
    if (typeof raw !== 'number') {
      fail(operation, 'INVALID_ARGUMENT', 'timeoutMs must be a number', 'validation');
    }
    return normalizeTimeout(raw, fallback, operation);
  }

  function normalizeSignal(raw, operation) {
    if (raw === undefined || raw === null) return null;
    if (!isObject(raw) || typeof raw.aborted !== 'boolean' || typeof raw.addEventListener !== 'function') {
      fail(operation, 'INVALID_ARGUMENT', 'signal must be an AbortSignal', 'validation');
    }
    return raw;
  }

  function elapsed(startedAt) {
    return Math.max(0, Date.now() - startedAt);
  }

  function remaining(deadlineAt, operation, backend) {
    const value = deadlineAt - Date.now();
    if (value <= 0) {
      fail(operation, 'TIMEOUT', 'operation exceeded timeoutMs', 'timeout', { backend });
    }
    return Math.max(1, Math.floor(value));
  }

  function createCallScope(signal, deadlineAt, operation, backend) {
    const wait = remaining(deadlineAt, operation, backend);
    const controller = typeof global.AbortController === 'function'
      ? new global.AbortController()
      : null;
    let reason = signal && signal.aborted ? 'cancel' : null;
    const onExternalAbort = () => {
      if (!reason) reason = 'cancel';
      if (controller && !controller.signal.aborted) controller.abort();
    };
    if (signal && !signal.aborted) signal.addEventListener('abort', onExternalAbort, { once: true });
    if (reason && controller && !controller.signal.aborted) controller.abort();
    const timer = global.setTimeout(() => {
      if (!reason) reason = 'timeout';
      if (controller && !controller.signal.aborted) controller.abort();
    }, wait);
    return {
      signal: controller ? controller.signal : signal,
      originalSignal: signal,
      deadlineAt,
      backend,
      reason() {
        return reason;
      },
      check() {
        if (reason === 'timeout' || Date.now() >= deadlineAt) {
          fail(operation, 'TIMEOUT', 'operation exceeded timeoutMs', 'timeout', { backend });
        }
        if (reason === 'cancel' || (signal && signal.aborted)) {
          fail(operation, 'CANCELED', 'operation was canceled', 'cancel', { backend });
        }
      },
      cleanup() {
        global.clearTimeout(timer);
        if (signal && typeof signal.removeEventListener === 'function') {
          signal.removeEventListener('abort', onExternalAbort);
        }
      },
    };
  }

  function classifyOwnedFailure(error, scope, fallbackCode) {
    if (scope && scope.reason() === 'timeout') return 'TIMEOUT';
    if (scope && scope.reason() === 'cancel') return 'CANCELED';
    if (error && error.code === 'TIMEOUT') return 'TIMEOUT';
    if (scope
        && error
        && (error.code === 'CANCELED' || error.name === 'AbortError')
        && !(scope.originalSignal && scope.originalSignal.aborted)
        && Date.now() >= scope.deadlineAt - 5) {
      return 'TIMEOUT';
    }
    if (error && (error.code === 'CANCELED' || error.name === 'AbortError')) return 'CANCELED';
    const message = String(error && error.message ? error.message : error || '').toLowerCase();
    if (message.indexOf('timed out') !== -1 || message.indexOf('deadline exceeded') !== -1) return 'TIMEOUT';
    if (message.indexOf('canceled') !== -1 || message.indexOf('cancelled') !== -1) return 'CANCELED';
    return fallbackCode;
  }

  function makeCallId(kind) {
    callSequence += 1;
    const execution = global.Execution || {};
    const executionId = String(execution.executionId || execution.id || 'execution')
      .replace(/[^A-Za-z0-9._-]/g, '_');
    return `${kind}-${executionId}-${Date.now()}-${callSequence}`;
  }

  function sanitizeMeta(kind, backend, adapter, callId, profile, requestedModel, model, durationMs, usage) {
    return {
      callId,
      profile: profile || null,
      kind,
      backend,
      adapter,
      requestedModel: requestedModel || null,
      model: typeof model === 'string' && model.length > 0 ? model : null,
      durationMs,
      usage: isObject(usage) ? usage : null,
    };
  }

  // Shared JSON Schema subset and value validator. Both public objects call
  // this exact implementation; it never coerces or repairs model output.
  function validateSchema(schema, operation, location) {
    if (!isObject(schema)) fail(operation, 'INVALID_SCHEMA', `${location} must be an object`, 'validation');
    validateSchemaNode(schema, operation, location, 0);
    const serialized = JSON.stringify(schema);
    if (utf8Length(serialized) > MAX_SCHEMA_BYTES) {
      fail(operation, 'INVALID_SCHEMA', `schema exceeds ${MAX_SCHEMA_BYTES} UTF-8 bytes`, 'validation');
    }
    return serialized;
  }

  function validateSchemaNode(schema, operation, location, depth) {
    if (!isObject(schema)) fail(operation, 'INVALID_SCHEMA', `${location} must be an object`, 'validation');
    if (depth > 32) fail(operation, 'INVALID_SCHEMA', `${location} exceeds maximum schema depth`, 'validation');
    for (const key of Object.keys(schema)) {
      if (!SUPPORTED_SCHEMA_KEYS[key]) {
        fail(operation, 'UNSUPPORTED_SCHEMA', `${location} uses unsupported keyword ${key}`, 'validation');
      }
    }
    const allowedTypes = ['object', 'array', 'string', 'number', 'integer', 'boolean', 'null'];
    if (typeof schema.type !== 'string' || allowedTypes.indexOf(schema.type) === -1) {
      fail(operation, 'INVALID_SCHEMA', `${location}.type is required and must be a supported type`, 'validation');
    }
    if (own(schema, 'properties')) {
      if (schema.type !== 'object' || !isObject(schema.properties)) {
        fail(operation, 'INVALID_SCHEMA', `${location}.properties requires object type and an object value`, 'validation');
      }
      for (const key of Object.keys(schema.properties)) {
        validateSchemaNode(schema.properties[key], operation, `${location}.properties.${key}`, depth + 1);
      }
    }
    if (own(schema, 'required')) {
      if (schema.type !== 'object' || !Array.isArray(schema.required) || schema.required.some((item) => typeof item !== 'string')) {
        fail(operation, 'INVALID_SCHEMA', `${location}.required requires object type and an array of strings`, 'validation');
      }
      const seen = Object.create(null);
      const properties = schema.properties || {};
      for (const key of schema.required) {
        if (seen[key]) fail(operation, 'INVALID_SCHEMA', `${location}.required contains duplicate ${key}`, 'validation');
        if (!own(properties, key)) fail(operation, 'INVALID_SCHEMA', `${location}.required references unknown property ${key}`, 'validation');
        seen[key] = true;
      }
    }
    if (own(schema, 'additionalProperties')) {
      if (schema.type !== 'object' || typeof schema.additionalProperties !== 'boolean') {
        fail(operation, 'UNSUPPORTED_SCHEMA', `${location}.additionalProperties must be boolean on an object schema`, 'validation');
      }
    }
    if (own(schema, 'items')) {
      if (schema.type !== 'array') fail(operation, 'INVALID_SCHEMA', `${location}.items requires array type`, 'validation');
      validateSchemaNode(schema.items, operation, `${location}.items`, depth + 1);
    }
    if (own(schema, 'enum') && (!Array.isArray(schema.enum) || schema.enum.length === 0)) {
      fail(operation, 'INVALID_SCHEMA', `${location}.enum must be a non-empty array`, 'validation');
    }
    for (const key of ['minimum', 'maximum', 'exclusiveMinimum', 'exclusiveMaximum']) {
      if (!own(schema, key)) continue;
      if ((schema.type !== 'number' && schema.type !== 'integer') || typeof schema[key] !== 'number' || !Number.isFinite(schema[key])) {
        fail(operation, 'INVALID_SCHEMA', `${location}.${key} requires a numeric schema and finite number`, 'validation');
      }
    }
    if (own(schema, 'minimum') && own(schema, 'maximum') && schema.minimum > schema.maximum) {
      fail(operation, 'INVALID_SCHEMA', `${location}.minimum must not exceed maximum`, 'validation');
    }
    for (const key of ['minLength', 'maxLength']) {
      if (!own(schema, key)) continue;
      if (schema.type !== 'string' || !Number.isInteger(schema[key]) || schema[key] < 0) {
        fail(operation, 'INVALID_SCHEMA', `${location}.${key} requires string type and a non-negative integer`, 'validation');
      }
    }
    for (const key of ['minItems', 'maxItems']) {
      if (!own(schema, key)) continue;
      if (schema.type !== 'array' || !Number.isInteger(schema[key]) || schema[key] < 0) {
        fail(operation, 'INVALID_SCHEMA', `${location}.${key} requires array type and a non-negative integer`, 'validation');
      }
    }
  }

  function jsonEqual(left, right) {
    return JSON.stringify(left) === JSON.stringify(right);
  }

  function outputTypeFail(operation, location, expected) {
    fail(operation, 'OUTPUT_VALIDATION_FAILED', `${location} must be ${expected}`, 'output-validation');
  }

  function validateValue(value, schema, operation, location) {
    if (own(schema, 'const') && !jsonEqual(value, schema.const)) {
      fail(operation, 'OUTPUT_VALIDATION_FAILED', `${location} does not match const`, 'output-validation');
    }
    if (own(schema, 'enum') && !schema.enum.some((candidate) => jsonEqual(value, candidate))) {
      fail(operation, 'OUTPUT_VALIDATION_FAILED', `${location} is not in enum`, 'output-validation');
    }
    const type = schema.type;
    if (type === 'null' && value !== null) outputTypeFail(operation, location, 'null');
    if (type === 'boolean' && typeof value !== 'boolean') outputTypeFail(operation, location, 'boolean');
    if (type === 'string') {
      if (typeof value !== 'string') outputTypeFail(operation, location, 'string');
      if (own(schema, 'minLength') && value.length < schema.minLength) {
        fail(operation, 'OUTPUT_VALIDATION_FAILED', `${location} is shorter than minLength`, 'output-validation');
      }
      if (own(schema, 'maxLength') && value.length > schema.maxLength) {
        fail(operation, 'OUTPUT_VALIDATION_FAILED', `${location} is longer than maxLength`, 'output-validation');
      }
    }
    if (type === 'number' || type === 'integer') {
      if (typeof value !== 'number' || !Number.isFinite(value)) outputTypeFail(operation, location, type);
      if (type === 'integer' && !Number.isSafeInteger(value)) outputTypeFail(operation, location, 'safe integer');
      if (own(schema, 'minimum') && value < schema.minimum) {
        fail(operation, 'OUTPUT_VALIDATION_FAILED', `${location} is below minimum`, 'output-validation');
      }
      if (own(schema, 'maximum') && value > schema.maximum) {
        fail(operation, 'OUTPUT_VALIDATION_FAILED', `${location} is above maximum`, 'output-validation');
      }
      if (own(schema, 'exclusiveMinimum') && value <= schema.exclusiveMinimum) {
        fail(operation, 'OUTPUT_VALIDATION_FAILED', `${location} is not above exclusiveMinimum`, 'output-validation');
      }
      if (own(schema, 'exclusiveMaximum') && value >= schema.exclusiveMaximum) {
        fail(operation, 'OUTPUT_VALIDATION_FAILED', `${location} is not below exclusiveMaximum`, 'output-validation');
      }
    }
    if (type === 'array') {
      if (!Array.isArray(value)) outputTypeFail(operation, location, 'array');
      if (own(schema, 'minItems') && value.length < schema.minItems) {
        fail(operation, 'OUTPUT_VALIDATION_FAILED', `${location} has fewer than minItems`, 'output-validation');
      }
      if (own(schema, 'maxItems') && value.length > schema.maxItems) {
        fail(operation, 'OUTPUT_VALIDATION_FAILED', `${location} has more than maxItems`, 'output-validation');
      }
      if (schema.items) {
        value.forEach((item, index) => validateValue(item, schema.items, operation, `${location}[${index}]`));
      }
    }
    if (type === 'object') {
      if (!isObject(value)) outputTypeFail(operation, location, 'object');
      const properties = schema.properties || {};
      for (const required of schema.required || []) {
        if (!own(value, required)) {
          fail(operation, 'OUTPUT_VALIDATION_FAILED', `${location} is missing required property ${required}`, 'output-validation');
        }
      }
      for (const key of Object.keys(value)) {
        if (own(properties, key)) validateValue(value[key], properties[key], operation, `${location}.${key}`);
        else if (schema.additionalProperties === false) {
          fail(operation, 'OUTPUT_VALIDATION_FAILED', `${location} contains additional property ${key}`, 'output-validation');
        }
      }
    }
    return value;
  }

  function normalizeOutput(raw, operation) {
    if (raw === undefined || raw === null) {
      return Object.freeze({ type: 'text', validation: null, schema: null, schemaJSON: null, name: null });
    }
    if (!isObject(raw)) fail(operation, 'INVALID_ARGUMENT', 'output must be an object', 'validation');
    assertKnownFields(raw, { type: true, name: true, validation: true, schema: true }, operation, 'output');
    const type = raw.type === undefined ? 'text' : raw.type;
    if (type !== 'text' && type !== 'json') {
      fail(operation, 'INVALID_ARGUMENT', 'output.type must be text or json', 'validation');
    }
    if (type === 'text') {
      if (own(raw, 'name') || own(raw, 'validation') || own(raw, 'schema')) {
        fail(operation, 'INVALID_ARGUMENT', 'text output does not accept name, validation, or schema', 'validation');
      }
      return Object.freeze({ type: 'text', validation: null, schema: null, schemaJSON: null, name: null });
    }
    const validation = raw.validation === undefined ? 'native' : raw.validation;
    if (validation !== 'native' && validation !== 'local') {
      fail(operation, 'INVALID_ARGUMENT', 'output.validation must be native or local', 'validation');
    }
    const name = raw.name === undefined ? 'result' : nonEmptyString(raw.name, operation, 'output.name');
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(name)) {
      fail(operation, 'INVALID_ARGUMENT', 'output.name must match [A-Za-z0-9_-]{1,64}', 'validation');
    }
    const schemaJSON = validateSchema(raw.schema, operation, 'output.schema');
    return Object.freeze({ type: 'json', validation, schema: raw.schema, schemaJSON, name });
  }

  function parseStructuredText(text, output, operation) {
    if (typeof text !== 'string' || text.trim().length === 0) {
      fail(operation, 'PROTOCOL_INCOMPLETE', 'missing final result text', 'protocol');
    }
    let value;
    try {
      value = JSON.parse(text);
    } catch (_) {
      fail(operation, 'OUTPUT_PARSE_FAILED', 'final result is not a single JSON value', 'output-validation');
    }
    return validateValue(value, output.schema, operation, 'result.data');
  }

  function localJSONInstruction(output) {
    return `\n\nReturn only one JSON value matching this JSON Schema. Do not use Markdown fences or explanatory text. Schema name: ${output.name}. Schema: ${output.schemaJSON}`;
  }

  function readJSONConfig(environmentKey, domain, operation) {
    const selected = env(environmentKey);
    if (!selected) return null;
    if (!global.File || !global.path || !global.Execution) {
      fail(operation, 'CONFIG_UNAVAILABLE', `${domain} configuration requires File, path, and Execution globals`, 'configuration');
    }
    const configPath = global.path.isAbsolute(selected)
      ? global.path.normalize(selected)
      : global.path.resolve(global.Execution.workdir, selected);
    let text;
    try {
      text = global.File.read(configPath, 'utf8');
    } catch (_) {
      fail(operation, 'PROFILE_CONFIG_ERROR', `failed to read ${environmentKey}`, 'configuration');
    }
    let config;
    try {
      config = JSON.parse(text);
    } catch (_) {
      fail(operation, 'PROFILE_CONFIG_ERROR', `${environmentKey} is not valid JSON`, 'configuration');
    }
    if (!isObject(config)) fail(operation, 'PROFILE_CONFIG_ERROR', `${domain} config must be an object`, 'configuration');
    assertKnownFields(config, { schemaVersion: true, defaultProfile: true, profiles: true }, operation, `${domain} config`);
    if (config.schemaVersion !== 1) {
      fail(operation, 'PROFILE_CONFIG_ERROR', `${domain} config schemaVersion must be 1`, 'configuration');
    }
    if (own(config, 'defaultProfile')) {
      nonEmptyString(config.defaultProfile, operation, `${domain} config defaultProfile`);
    }
    if (!isObject(config.profiles)) {
      fail(operation, 'PROFILE_CONFIG_ERROR', `${domain} config profiles must be an object`, 'configuration');
    }
    return config;
  }

  function commandEnabled() {
    try {
      const capabilities = global.Command && typeof global.Command.getCapabilities === 'function'
        ? global.Command.getCapabilities()
        : null;
      return Boolean(capabilities && capabilities.enabled);
    } catch (_) {
      return false;
    }
  }

  function normalizeGeneration(raw, operation, label) {
    if (raw === undefined || raw === null) return {};
    const location = label || 'generation';
    if (!isObject(raw)) fail(operation, 'INVALID_ARGUMENT', `${location} must be an object`, 'validation');
    assertKnownFields(raw, { maxOutputTokens: true, reasoningEffort: true }, operation, location);
    const result = {};
    if (own(raw, 'maxOutputTokens')) {
      if (typeof raw.maxOutputTokens !== 'number') {
        fail(operation, 'INVALID_ARGUMENT', `${location}.maxOutputTokens must be a number`, 'validation');
      }
      result.maxOutputTokens = parsePositiveInteger(
        raw.maxOutputTokens,
        null,
        operation,
        `${location}.maxOutputTokens`,
        1000000,
      );
    }
    if (own(raw, 'reasoningEffort')) {
      if (['none', 'minimal', 'low', 'medium', 'high', 'xhigh'].indexOf(raw.reasoningEffort) === -1) {
        fail(operation, 'INVALID_ARGUMENT', `${location}.reasoningEffort is unsupported`, 'validation');
      }
      result.reasoningEffort = raw.reasoningEffort;
    }
    return result;
  }

  function normalizeMessages(raw, operation) {
    if (!Array.isArray(raw) || raw.length === 0) {
      fail(operation, 'INVALID_ARGUMENT', 'messages must be a non-empty array', 'validation');
    }
    let totalBytes = 0;
    return raw.map((message, index) => {
      if (!isObject(message)) fail(operation, 'INVALID_ARGUMENT', `messages[${index}] must be an object`, 'validation');
      assertKnownFields(message, { role: true, content: true }, operation, `messages[${index}]`);
      if (message.role !== 'user' && message.role !== 'assistant') {
        fail(operation, 'INVALID_ARGUMENT', `messages[${index}].role must be user or assistant`, 'validation');
      }
      const content = nonEmptyString(message.content, operation, `messages[${index}].content`);
      totalBytes += utf8Length(content);
      if (totalBytes > MAX_PROMPT_BYTES) {
        fail(operation, 'INPUT_TOO_LARGE', `messages exceed ${MAX_PROMPT_BYTES} UTF-8 bytes in total`, 'validation');
      }
      return { role: message.role, content };
    });
  }

  function validateLLMProtocol(protocol, operation, profile) {
    nonEmptyString(protocol, operation, 'protocol');
    if (SUPPORTED_LLM_PROTOCOLS.indexOf(protocol) !== -1) return protocol;
    if (RESERVED_LLM_PROTOCOLS.indexOf(protocol) !== -1) {
      fail(operation, 'PROTOCOL_NOT_IMPLEMENTED', `protocol ${protocol} is reserved but not implemented`, 'configuration', { protocol, profile });
    }
    fail(operation, 'UNKNOWN_PROTOCOL', `unknown LLM protocol ${protocol}`, 'configuration', { protocol, profile });
  }

  function builtinLLMProfile(operation) {
    const timeoutMs = normalizeTimeout(
      env('OPENDESK_LLM_TIMEOUT_MS'),
      DEFAULT_LLM_TIMEOUT_MS,
      operation,
      'OPENDESK_LLM_TIMEOUT_MS',
    );
    const maxRetries = parseNonNegativeInteger(
      env('OPENDESK_LLM_MAX_RETRIES'),
      DEFAULT_LLM_MAX_RETRIES,
      operation,
      'OPENDESK_LLM_MAX_RETRIES',
      5,
    );
    return {
      name: 'default',
      protocol: env('OPENDESK_LLM_PROTOCOL') || 'openai-responses',
      baseURL: env('OPENDESK_LLM_BASE_URL'),
      model: env('OPENDESK_LLM_MODEL'),
      credentialEnv: 'OPENDESK_LLM_API_KEY',
      timeoutMs,
      maxRetries,
      generation: {},
      allowInsecureLocalhost: env('OPENDESK_LLM_ALLOW_INSECURE_LOCALHOST') === 'true',
    };
  }

  function validateLLMProfile(raw, name, operation) {
    if (!isObject(raw)) fail(operation, 'INVALID_PROFILE', `profile ${name} must be an object`, 'configuration');
    assertKnownFields(raw, {
      name: true,
      protocol: true,
      baseURL: true,
      baseURLEnv: true,
      model: true,
      modelEnv: true,
      credentialEnv: true,
      timeoutMs: true,
      maxRetries: true,
      generation: true,
      allowInsecureLocalhost: true,
    }, operation, `profile ${name}`);
    if (own(raw, 'name') && raw.name !== name) {
      fail(operation, 'INVALID_PROFILE', `profile ${name}.name must match its profile key`, 'configuration');
    }
    if (own(raw, 'baseURL') && own(raw, 'baseURLEnv')) {
      fail(operation, 'INVALID_PROFILE', `profile ${name} cannot set baseURL and baseURLEnv together`, 'configuration');
    }
    if (own(raw, 'model') && own(raw, 'modelEnv')) {
      fail(operation, 'INVALID_PROFILE', `profile ${name} cannot set model and modelEnv together`, 'configuration');
    }
    const protocol = validateLLMProtocol(raw.protocol, operation, name);
    if (own(raw, 'baseURL')) nonEmptyString(raw.baseURL, operation, `profile ${name}.baseURL`);
    if (own(raw, 'baseURLEnv')) environmentName(raw.baseURLEnv, operation, `profile ${name}.baseURLEnv`, 'INVALID_PROFILE');
    if (own(raw, 'model')) nonEmptyString(raw.model, operation, `profile ${name}.model`);
    if (own(raw, 'modelEnv')) environmentName(raw.modelEnv, operation, `profile ${name}.modelEnv`, 'INVALID_PROFILE');
    environmentName(raw.credentialEnv, operation, `profile ${name}.credentialEnv`, 'INVALID_PROFILE');
    if (own(raw, 'timeoutMs')) {
      if (typeof raw.timeoutMs !== 'number') fail(operation, 'INVALID_PROFILE', `profile ${name}.timeoutMs must be a number`, 'configuration');
      normalizeTimeout(raw.timeoutMs, DEFAULT_LLM_TIMEOUT_MS, operation, `profile ${name}.timeoutMs`);
    }
    if (own(raw, 'maxRetries')) {
      if (typeof raw.maxRetries !== 'number') fail(operation, 'INVALID_PROFILE', `profile ${name}.maxRetries must be a number`, 'configuration');
      parseNonNegativeInteger(raw.maxRetries, 0, operation, `profile ${name}.maxRetries`, 5);
    }
    const generation = normalizeGeneration(raw.generation, operation, `profile ${name}.generation`);
    if (own(raw, 'allowInsecureLocalhost') && typeof raw.allowInsecureLocalhost !== 'boolean') {
      fail(operation, 'INVALID_PROFILE', `profile ${name}.allowInsecureLocalhost must be boolean`, 'configuration');
    }
    return Object.assign({ name }, raw, { protocol, generation });
  }

  function resolveLLMSelection(options, operation) {
    const config = readJSONConfig('OPENDESK_LLM_CONFIG', 'LLM', operation);
    let profileName = options.profile;
    let profile;
    if (profileName !== undefined) nonEmptyString(profileName, operation, 'profile');
    else profileName = env('OPENDESK_LLM_DEFAULT_PROFILE') || (config && config.defaultProfile) || 'default';
    if (profileName === 'default') profile = builtinLLMProfile(operation);
    else {
      const configured = config && config.profiles && config.profiles[profileName];
      if (!configured) fail(operation, 'PROFILE_NOT_FOUND', `profile ${profileName} was not found`, 'configuration', { profile: profileName });
      profile = validateLLMProfile(configured, profileName, operation);
    }
    const protocol = validateLLMProtocol(profile.protocol, operation, profileName);
    const baseURL = profile.baseURL || (profile.baseURLEnv ? env(profile.baseURLEnv) : undefined);
    const model = profile.model || (profile.modelEnv ? env(profile.modelEnv) : undefined);
    const credentialEnv = environmentName(profile.credentialEnv, operation, `profile ${profileName}.credentialEnv`, 'INVALID_PROFILE');
    const credential = env(credentialEnv);
    if (!baseURL || !model || !credential) {
      const missing = [];
      if (!baseURL) {
        const source = profile.baseURLEnv
          || (profileName === 'default' ? 'OPENDESK_LLM_BASE_URL' : `profile ${profileName}.baseURL or baseURLEnv`);
        missing.push(`base URL (${source})`);
      }
      if (!model) {
        const source = profile.modelEnv
          || (profileName === 'default' ? 'OPENDESK_LLM_MODEL' : `profile ${profileName}.model or modelEnv`);
        missing.push(`model (${source})`);
      }
      if (!credential) missing.push(`credential environment value (${credentialEnv})`);
      fail(
        operation,
        'CONFIG_MISSING',
        `LLM profile ${profileName} is not configured; missing ${missing.join(', ')}. Set environment values through .env, .opendesk.env, or -env-file; keep named Profile fields in OPENDESK_LLM_CONFIG`,
        'configuration',
        { protocol, profile: profileName },
      );
    }
    nonEmptyString(baseURL, operation, `profile ${profileName} base URL`);
    nonEmptyString(model, operation, `profile ${profileName} model`);
    const timeoutDefault = profile.timeoutMs === undefined ? DEFAULT_LLM_TIMEOUT_MS : profile.timeoutMs;
    const timeoutMs = normalizePublicTimeout(options.timeoutMs, timeoutDefault, operation);
    const maxRetries = profile.maxRetries === undefined ? 0 : profile.maxRetries;
    const generation = Object.assign(
      {},
      normalizeGeneration(profile.generation, operation, `profile ${profileName}.generation`),
      normalizeGeneration(options.generation, operation),
    );
    return {
      profileName,
      protocol,
      baseURL,
      model,
      credential,
      timeoutMs,
      maxRetries,
      generation,
      allowInsecureLocalhost: profile.allowInsecureLocalhost === true,
    };
  }

  function joinLLMURL(selection, suffix, operation) {
    const trimmed = selection.baseURL.replace(/\/+$/, '');
    let parsed;
    try {
      parsed = new global.URL(trimmed);
    } catch (_) {
      fail(operation, 'INVALID_BASE_URL', 'LLM base URL must be an absolute HTTP(S) URL', 'configuration', {
        protocol: selection.protocol,
        profile: selection.profileName,
      });
    }
    if (parsed.username || parsed.password || parsed.search || parsed.hash) {
      fail(operation, 'INVALID_BASE_URL', 'LLM base URL cannot contain credentials, query, or fragment', 'configuration', {
        protocol: selection.protocol,
        profile: selection.profileName,
      });
    }
    if (parsed.protocol === 'https:') return trimmed + suffix;
    const loopback = /^http:\/\/(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?(?:\/|$)/i.test(trimmed);
    if (loopback && selection.allowInsecureLocalhost) return trimmed + suffix;
    fail(operation, 'INSECURE_BASE_URL', 'LLM base URL must use HTTPS; loopback HTTP requires allowInsecureLocalhost: true', 'configuration', {
      protocol: selection.protocol,
      profile: selection.profileName,
    });
  }

  function normalizeLLMInputs(options, output, generation, operation) {
    const hasPrompt = own(options, 'prompt') && options.prompt !== undefined;
    const hasMessages = own(options, 'messages') && options.messages !== undefined;
    if (hasPrompt === hasMessages) {
      fail(operation, 'INVALID_ARGUMENT', 'exactly one of prompt or messages is required', 'validation');
    }
    const prompt = hasPrompt ? checkedPrompt(options.prompt, operation) : null;
    const messages = hasMessages ? normalizeMessages(options.messages, operation) : null;
    const system = options.system === undefined ? null : nonEmptyString(options.system, operation, 'system');
    if (system && utf8Length(system) > MAX_PROMPT_BYTES) {
      fail(operation, 'INPUT_TOO_LARGE', `system exceeds ${MAX_PROMPT_BYTES} UTF-8 bytes`, 'validation');
    }
    if (output.type === 'json' && output.validation === 'local') {
      if (prompt !== null) {
        return { prompt: prompt + localJSONInstruction(output), messages: null, system, generation };
      }
      const copy = messages.slice();
      copy.push({ role: 'user', content: localJSONInstruction(output).trim() });
      return { prompt: null, messages: copy, system, generation };
    }
    return { prompt, messages, system, generation };
  }

  function buildResponsesRequest(inputs, output, model) {
    const body = {
      model,
      input: inputs.prompt !== null ? inputs.prompt : inputs.messages,
    };
    if (inputs.system) body.instructions = inputs.system;
    if (inputs.generation.maxOutputTokens) body.max_output_tokens = inputs.generation.maxOutputTokens;
    if (inputs.generation.reasoningEffort) body.reasoning = { effort: inputs.generation.reasoningEffort };
    if (output.type === 'json' && output.validation === 'native') {
      body.text = {
        format: {
          type: 'json_schema',
          name: output.name,
          schema: output.schema,
          strict: true,
        },
      };
    }
    return body;
  }

  function buildChatRequest(inputs, output, model) {
    const messages = [];
    if (inputs.system) messages.push({ role: 'system', content: inputs.system });
    if (inputs.prompt !== null) messages.push({ role: 'user', content: inputs.prompt });
    else messages.push.apply(messages, inputs.messages);
    const body = { model, messages };
    if (inputs.generation.maxOutputTokens) body.max_completion_tokens = inputs.generation.maxOutputTokens;
    if (inputs.generation.reasoningEffort) body.reasoning_effort = inputs.generation.reasoningEffort;
    if (output.type === 'json' && output.validation === 'native') {
      body.response_format = {
        type: 'json_schema',
        json_schema: {
          name: output.name,
          schema: output.schema,
          strict: true,
        },
      };
    }
    return body;
  }

  function parseResponses(data, output, operation) {
    if (!isObject(data)) fail(operation, 'PROTOCOL_ERROR', 'Responses API returned an invalid envelope', 'protocol');
    if (data.error) fail(operation, 'PROTOCOL_ERROR', 'Responses API returned an error object', 'protocol');
    if (data.status !== 'completed') {
      fail(operation, 'PROTOCOL_INCOMPLETE', `Responses API status is ${String(data.status || 'missing')}`, 'protocol');
    }
    const pieces = [];
    if (Array.isArray(data.output)) {
      for (const item of data.output) {
        if (!isObject(item)) fail(operation, 'PROTOCOL_ERROR', 'Responses API output contains an invalid item', 'protocol');
        if (item.status && item.status !== 'completed') {
          fail(operation, 'PROTOCOL_INCOMPLETE', `Responses API output item status is ${item.status}`, 'protocol');
        }
        if (item.type === 'reasoning') continue;
        if (item.type !== 'message') {
          fail(operation, 'PROTOCOL_ERROR', `Responses API returned unexpected output item ${String(item.type || 'missing')}`, 'protocol');
        }
        if (!Array.isArray(item.content)) {
          fail(operation, 'PROTOCOL_ERROR', 'Responses API message content is invalid', 'protocol');
        }
        for (const content of item.content) {
          if (!isObject(content)) fail(operation, 'PROTOCOL_ERROR', 'Responses API content is invalid', 'protocol');
          if (content.type === 'refusal') fail(operation, 'MODEL_REFUSAL', 'model refused the request', 'protocol');
          if (content.type === 'output_text' && typeof content.text === 'string') pieces.push(content.text);
        }
      }
    }
    const text = pieces.length > 0
      ? pieces.join('')
      : (typeof data.output_text === 'string' ? data.output_text : '');
    if (text.trim().length === 0) {
      fail(operation, 'PROTOCOL_INCOMPLETE', 'Responses API returned no output text', 'protocol');
    }
    return {
      data: output.type === 'json' ? parseStructuredText(text, output, operation) : text,
      model: data.model,
      usage: data.usage,
    };
  }

  function parseChatCompletions(data, output, operation) {
    if (!isObject(data)) {
      fail(operation, 'PROTOCOL_ERROR', 'Chat Completions returned an invalid envelope', 'protocol');
    }
    if (!Array.isArray(data.choices) || data.choices.length !== 1) {
      fail(operation, 'PROTOCOL_INCOMPLETE', 'Chat Completions must return exactly one choice', 'protocol');
    }
    const choice = data.choices[0];
    if (!isObject(choice) || choice.finish_reason !== 'stop') {
      fail(operation, 'PROTOCOL_INCOMPLETE', `Chat Completions finish_reason is ${String(choice && choice.finish_reason || 'missing')}`, 'protocol');
    }
    if (!isObject(choice.message)) {
      fail(operation, 'PROTOCOL_ERROR', 'Chat Completions returned an invalid message', 'protocol');
    }
    if (choice.message.refusal) fail(operation, 'MODEL_REFUSAL', 'model refused the request', 'protocol');
    if (choice.message.tool_calls || choice.message.function_call) {
      fail(operation, 'PROTOCOL_ERROR', 'Chat Completions returned a tool call instead of business data', 'protocol');
    }
    const text = choice.message.content;
    if (typeof text !== 'string' || text.trim().length === 0) {
      fail(operation, 'PROTOCOL_INCOMPLETE', 'Chat Completions returned no text content', 'protocol');
    }
    return {
      data: output.type === 'json' ? parseStructuredText(text, output, operation) : text,
      model: data.model,
      usage: data.usage,
    };
  }

  function retriableHTTPStatus(status) {
    return [408, 409, 429, 500, 502, 503, 504].indexOf(status) !== -1;
  }

  function waitForRetry(milliseconds, scope, operation) {
    const wait = Math.min(milliseconds, remaining(scope.deadlineAt, operation, scope.backend));
    return new Promise((resolve, reject) => {
      let timer = null;
      const onAbort = () => {
        if (timer !== null) global.clearTimeout(timer);
        try {
          scope.check();
        } catch (error) {
          reject(error);
        }
      };
      if (scope.signal && scope.signal.aborted) {
        onAbort();
        return;
      }
      if (scope.signal) scope.signal.addEventListener('abort', onAbort, { once: true });
      timer = global.setTimeout(() => {
        if (scope.signal && typeof scope.signal.removeEventListener === 'function') {
          scope.signal.removeEventListener('abort', onAbort);
        }
        resolve();
      }, wait);
    });
  }

  async function requestLLM(selection, request, scope, operation) {
    let attempt = 0;
    while (true) {
      scope.check();
      let response;
      let transportError = null;
      try {
        response = await global.http.request({
          url: request.url,
          method: 'POST',
          headers: {
            Authorization: `Bearer ${selection.credential}`,
            'Content-Type': 'application/json',
          },
          data: request.body,
          timeout: remaining(scope.deadlineAt, operation),
          signal: scope.signal,
          responseType: 'json',
        });
      } catch (error) {
        transportError = error;
      }
      if (transportError) {
        const failureCode = classifyOwnedFailure(transportError, scope, 'HTTP_FAILED');
        if (failureCode !== 'HTTP_FAILED') {
          fail(operation, failureCode, failureCode === 'TIMEOUT' ? 'LLM operation timed out' : 'LLM operation was canceled', failureCode === 'TIMEOUT' ? 'timeout' : 'cancel', {
            protocol: selection.protocol,
            profile: selection.profileName,
            causeCode: transportError && transportError.code,
          });
        }
        if (attempt >= selection.maxRetries) {
          fail(operation, 'HTTP_FAILED', 'LLM HTTP request failed', 'transport', {
            protocol: selection.protocol,
            profile: selection.profileName,
            causeCode: transportError && transportError.code,
          });
        }
      } else {
        if (!response || typeof response.status !== 'number') {
          fail(operation, 'PROTOCOL_ERROR', 'LLM HTTP bridge returned an invalid response', 'transport', {
            protocol: selection.protocol,
            profile: selection.profileName,
          });
        }
        if (response.status >= 200 && response.status < 300) return response;
        if (!retriableHTTPStatus(response.status) || attempt >= selection.maxRetries) {
          fail(operation, 'HTTP_FAILED', `LLM HTTP status ${response.status}`, 'transport', {
            protocol: selection.protocol,
            profile: selection.profileName,
            status: response.status,
          });
        }
      }
      attempt += 1;
      await waitForRetry(Math.min(1000, 100 * (2 ** (attempt - 1))), scope, operation);
    }
  }

  function llmCapabilitySelection(query, operation) {
    try {
      const selection = resolveLLMSelection(query, operation);
      return { selection, error: null };
    } catch (error) {
      return {
        selection: null,
        error: {
          code: error && error.code ? error.code : 'UNKNOWN',
          message: error && error.message ? error.message : String(error),
          protocol: error && error.protocol ? error.protocol : null,
          profile: error && error.profile ? error.profile : (query.profile || null),
        },
      };
    }
  }

  const LLM = Object.freeze({
    getCapabilities(rawQuery) {
      const operation = 'LLM.getCapabilities';
      const query = rawQuery === undefined || rawQuery === null ? {} : rawQuery;
      if (!isObject(query)) fail(operation, 'INVALID_ARGUMENT', 'options must be an object', 'validation');
      assertKnownFields(query, { profile: true }, operation, 'options');
      const resolved = llmCapabilitySelection(query, operation);
      const protocol = resolved.selection
        ? resolved.selection.protocol
        : (resolved.error && resolved.error.protocol) || env('OPENDESK_LLM_PROTOCOL') || 'openai-responses';
      const supported = SUPPORTED_LLM_PROTOCOLS.indexOf(protocol) !== -1;
      const configured = Boolean(resolved.selection);
      return {
        schemaVersion: 1,
        kind: 'llm',
        enabled: Boolean(global.http && typeof global.http.request === 'function'),
        executionScoped: true,
        supported,
        configured,
        executableFound: null,
        checked: false,
        authenticated: configured ? 'unknown' : false,
        available: null,
        profile: resolved.selection ? resolved.selection.profileName : (query.profile || null),
        protocol,
        supportedProtocols: SUPPORTED_LLM_PROTOCOLS.slice(),
        reservedProtocols: RESERVED_LLM_PROTOCOLS.slice(),
        structuredOutput: { native: supported, local: true },
        selectionError: resolved.error,
      };
    },

    async generate(rawOptions) {
      const operation = 'LLM.generate';
      const startedAt = Date.now();
      if (!isObject(rawOptions)) fail(operation, 'INVALID_ARGUMENT', 'options must be an object', 'validation');
      assertKnownFields(rawOptions, {
        prompt: true,
        messages: true,
        system: true,
        profile: true,
        output: true,
        generation: true,
        timeoutMs: true,
        signal: true,
      }, operation, 'options');
      const signal = normalizeSignal(rawOptions.signal, operation);
      if (signal && signal.aborted) fail(operation, 'CANCELED', 'operation was canceled', 'cancel');
      if (!global.http || typeof global.http.request !== 'function') {
        fail(operation, 'DISABLED', 'HTTP client is unavailable in this execution', 'configuration');
      }
      const output = normalizeOutput(rawOptions.output, operation);
      const selection = resolveLLMSelection(rawOptions, operation);
      const deadlineAt = startedAt + selection.timeoutMs;
      const scope = createCallScope(signal, deadlineAt, operation, 'openai');
      try {
        const inputs = normalizeLLMInputs(rawOptions, output, selection.generation, operation);
        const suffix = selection.protocol === 'openai-responses' ? '/responses' : '/chat/completions';
        const body = selection.protocol === 'openai-responses'
          ? buildResponsesRequest(inputs, output, selection.model)
          : buildChatRequest(inputs, output, selection.model);
        const callId = makeCallId('llm');
        const response = await requestLLM(selection, {
          url: joinLLMURL(selection, suffix, operation),
          body,
        }, scope, operation);
        scope.check();
        const parsed = selection.protocol === 'openai-responses'
          ? parseResponses(response.data, output, operation)
          : parseChatCompletions(response.data, output, operation);
        scope.check();
        return {
          data: parsed.data,
          meta: sanitizeMeta(
            'llm',
            'openai',
            selection.protocol,
            callId,
            selection.profileName,
            selection.model,
            parsed.model,
            elapsed(startedAt),
            parsed.usage,
          ),
        };
      } finally {
        scope.cleanup();
      }
    },
  });

  function builtinAgentProfile(backend) {
    const executionWorkdir = global.Execution && global.Execution.workdir;
    if (backend === 'codex') {
      return {
        name: 'codex-analysis',
        backend: 'codex',
        executableEnv: 'OPENDESK_CODEX_EXECUTABLE',
        modelEnv: 'OPENDESK_CODEX_MODEL',
        auth: { mode: 'saved' },
        policy: 'analysis',
        allowedCwd: executionWorkdir,
      };
    }
    if (backend === 'claude-code') {
      return {
        name: 'claude-code-analysis',
        backend: 'claude-code',
        executableEnv: 'OPENDESK_CLAUDE_CODE_EXECUTABLE',
        modelEnv: 'OPENDESK_CLAUDE_CODE_MODEL',
        auth: { mode: 'saved' },
        policy: 'analysis',
        allowedCwd: executionWorkdir,
      };
    }
    return null;
  }

  function builtinAgentExecutable(backend) {
    if (backend === 'codex') return 'codex';
    if (backend === 'claude-code') return 'claude';
    return null;
  }

  function validateAgentBackend(backend, operation, profile) {
    nonEmptyString(backend, operation, 'backend');
    if (SUPPORTED_AGENT_BACKENDS.indexOf(backend) !== -1) return backend;
    if (RESERVED_AGENT_BACKENDS.indexOf(backend) !== -1 || backend === 'json-cli') {
      fail(operation, 'BACKEND_NOT_IMPLEMENTED', `backend ${backend} is reserved but not implemented`, 'configuration', { backend, profile });
    }
    fail(operation, 'UNKNOWN_BACKEND', `unknown backend ${backend}`, 'configuration', { backend, profile });
  }

  function validateAgentAuth(raw, backend, operation, profileName) {
    if (raw === undefined) return { mode: 'saved' };
    if (!isObject(raw)) fail(operation, 'INVALID_PROFILE', `profile ${profileName}.auth must be an object`, 'configuration');
    assertKnownFields(raw, { mode: true, env: true }, operation, `profile ${profileName}.auth`);
    if (raw.mode === 'saved') {
      if (own(raw, 'env')) fail(operation, 'INVALID_PROFILE', `profile ${profileName}.auth.env is invalid for saved auth`, 'configuration');
      return { mode: 'saved' };
    }
    if (raw.mode !== 'env') {
      fail(operation, 'UNSUPPORTED_AUTH_MODE', `profile ${profileName}.auth.mode is unsupported`, 'configuration', { backend, profile: profileName });
    }
    return {
      mode: 'env',
      env: environmentName(raw.env, operation, `profile ${profileName}.auth.env`, 'INVALID_PROFILE'),
      target: backend === 'codex' ? 'CODEX_API_KEY' : 'ANTHROPIC_API_KEY',
    };
  }

  function validateBackendOptions(raw, backend, operation, label) {
    if (raw === undefined || raw === null) return {};
    if (!isObject(raw)) fail(operation, 'INVALID_ARGUMENT', `${label} must be an object`, 'validation', { backend });
    const keys = Object.keys(raw);
    if (keys.some((key) => key !== backend)) {
      fail(operation, 'BACKEND_OPTIONS_CONFLICT', `${label} may contain only the selected backend namespace ${backend}`, 'validation', { backend });
    }
    const values = own(raw, backend) ? raw[backend] : {};
    if (!isObject(values)) fail(operation, 'INVALID_ARGUMENT', `${label}.${backend} must be an object`, 'validation', { backend });
    if (backend === 'codex') {
      assertKnownFields(values, { reasoningEffort: true }, operation, `${label}.codex`);
      if (own(values, 'reasoningEffort') && ['low', 'medium', 'high', 'xhigh'].indexOf(values.reasoningEffort) === -1) {
        fail(operation, 'INVALID_ARGUMENT', `${label}.codex.reasoningEffort must be low, medium, high, or xhigh`, 'validation', { backend });
      }
    } else if (backend === 'claude-code') {
      assertKnownFields(values, { maxBudgetUsd: true }, operation, `${label}.claude-code`);
      if (own(values, 'maxBudgetUsd') && (typeof values.maxBudgetUsd !== 'number' || !Number.isFinite(values.maxBudgetUsd) || values.maxBudgetUsd <= 0)) {
        fail(operation, 'INVALID_ARGUMENT', `${label}.claude-code.maxBudgetUsd must be a positive finite number`, 'validation', { backend });
      }
    }
    return values;
  }

  function validateAgentProfile(raw, name, operation) {
    if (!isObject(raw)) fail(operation, 'INVALID_PROFILE', `profile ${name} must be an object`, 'configuration');
    assertKnownFields(raw, {
      name: true,
      backend: true,
      executable: true,
      executableEnv: true,
      model: true,
      modelEnv: true,
      auth: true,
      policy: true,
      timeoutMs: true,
      cwd: true,
      allowedCwd: true,
      backendOptions: true,
    }, operation, `profile ${name}`);
    if (own(raw, 'name') && raw.name !== name) {
      fail(operation, 'INVALID_PROFILE', `profile ${name}.name must match its profile key`, 'configuration');
    }
    const backend = validateAgentBackend(raw.backend, operation, name);
    if (own(raw, 'executable') && own(raw, 'executableEnv')) {
      fail(operation, 'INVALID_PROFILE', `profile ${name} cannot set executable and executableEnv together`, 'configuration');
    }
    if (own(raw, 'model') && own(raw, 'modelEnv')) {
      fail(operation, 'INVALID_PROFILE', `profile ${name} cannot set model and modelEnv together`, 'configuration');
    }
    if (own(raw, 'executable')) nonEmptyString(raw.executable, operation, `profile ${name}.executable`);
    if (own(raw, 'executableEnv')) environmentName(raw.executableEnv, operation, `profile ${name}.executableEnv`, 'INVALID_PROFILE');
    if (own(raw, 'model')) nonEmptyString(raw.model, operation, `profile ${name}.model`);
    if (own(raw, 'modelEnv')) environmentName(raw.modelEnv, operation, `profile ${name}.modelEnv`, 'INVALID_PROFILE');
    if (own(raw, 'cwd')) nonEmptyString(raw.cwd, operation, `profile ${name}.cwd`);
    if (own(raw, 'allowedCwd')) nonEmptyString(raw.allowedCwd, operation, `profile ${name}.allowedCwd`);
    if (own(raw, 'timeoutMs')) {
      if (typeof raw.timeoutMs !== 'number') fail(operation, 'INVALID_PROFILE', `profile ${name}.timeoutMs must be a number`, 'configuration');
      normalizeTimeout(raw.timeoutMs, DEFAULT_AGENT_TIMEOUT_MS, operation, `profile ${name}.timeoutMs`);
    }
    if (own(raw, 'policy') && raw.policy !== 'analysis') {
      fail(operation, 'UNSUPPORTED_PERMISSION_POLICY', `profile ${name}.policy is not supported by P0`, 'configuration', { backend, profile: name });
    }
    const auth = validateAgentAuth(raw.auth, backend, operation, name);
    const backendOptions = validateBackendOptions(raw.backendOptions, backend, operation, `profile ${name}.backendOptions`);
    return Object.assign({ name }, raw, { backend, auth, backendOptions });
  }

  function resolvePath(value, operation, label) {
    if (!global.path || !global.Execution) {
      fail(operation, 'RUNTIME_UNAVAILABLE', 'path and Execution are required', 'configuration');
    }
    const selected = nonEmptyString(value, operation, label);
    return global.path.isAbsolute(selected)
      ? global.path.normalize(selected)
      : global.path.resolve(global.Execution.workdir, selected);
  }

  function pathWithin(candidate, root) {
    const normalizedCandidate = global.path.normalize(candidate);
    const normalizedRoot = global.path.normalize(root);
    if (normalizedCandidate === normalizedRoot) return true;
    const separator = normalizedRoot.indexOf('\\') !== -1 ? '\\' : '/';
    const prefix = normalizedRoot.endsWith(separator) ? normalizedRoot : normalizedRoot + separator;
    if (separator === '\\') return normalizedCandidate.toLowerCase().indexOf(prefix.toLowerCase()) === 0;
    return normalizedCandidate.indexOf(prefix) === 0;
  }

  function resolveAgentSelection(options, operation) {
    const config = readJSONConfig('OPENDESK_AGENT_CONFIG', 'Agent', operation);
    let profileName = options.profile;
    let backend = options.backend;
    let profile;
    let profileValidated = false;
    let discoveryExecutable = null;
    if (profileName !== undefined) {
      nonEmptyString(profileName, operation, 'profile');
      const configured = config && config.profiles && config.profiles[profileName];
      const builtin = profileName === 'codex-analysis'
        ? builtinAgentProfile('codex')
        : (profileName === 'claude-code-analysis' ? builtinAgentProfile('claude-code') : null);
      if (!configured && !builtin) {
        fail(operation, 'PROFILE_NOT_FOUND', `profile ${profileName} was not found`, 'configuration', { profile: profileName });
      }
      profile = configured ? validateAgentProfile(configured, profileName, operation) : validateAgentProfile(builtin, profileName, operation);
      profileValidated = true;
      if (!configured && builtin) discoveryExecutable = builtinAgentExecutable(profile.backend);
      if (backend !== undefined && backend !== profile.backend) {
        fail(operation, 'BACKEND_PROFILE_CONFLICT', `backend ${backend} conflicts with profile ${profileName}`, 'configuration', { backend, profile: profileName });
      }
      backend = profile.backend;
    } else if (backend !== undefined) {
      backend = validateAgentBackend(backend, operation);
      profile = builtinAgentProfile(backend);
      discoveryExecutable = builtinAgentExecutable(backend);
    } else {
      profileName = env('OPENDESK_AGENT_DEFAULT_PROFILE') || (config && config.defaultProfile) || undefined;
      if (profileName) {
        const configured = config && config.profiles && config.profiles[profileName];
        const builtin = profileName === 'codex-analysis'
          ? builtinAgentProfile('codex')
          : (profileName === 'claude-code-analysis' ? builtinAgentProfile('claude-code') : null);
        if (!configured && !builtin) {
          fail(operation, 'PROFILE_NOT_FOUND', `default profile ${profileName} was not found`, 'configuration', { profile: profileName });
        }
        profile = configured ? validateAgentProfile(configured, profileName, operation) : validateAgentProfile(builtin, profileName, operation);
        profileValidated = true;
        backend = profile.backend;
        if (!configured && builtin) discoveryExecutable = builtinAgentExecutable(backend);
      } else {
        backend = validateAgentBackend(env('OPENDESK_AGENT_BACKEND') || 'codex', operation);
        profile = builtinAgentProfile(backend);
        discoveryExecutable = builtinAgentExecutable(backend);
      }
    }
    backend = validateAgentBackend(backend, operation, profileName);
    if (!profile) profile = builtinAgentProfile(backend);
    if (!profileValidated) {
      profile = validateAgentProfile(profile, profile.name || `${backend}-analysis`, operation);
    }

    let executableCandidate;
    let executableSource = null;
    if (own(profile, 'executable')) {
      executableCandidate = profile.executable;
      executableSource = 'profile';
    } else if (profile.executableEnv) {
      const configuredExecutable = env(profile.executableEnv);
      if (configuredExecutable !== undefined) {
        executableCandidate = configuredExecutable;
        executableSource = 'environment';
      }
    }
    if (executableSource) {
      nonEmptyString(executableCandidate, operation, 'executable');
      if (!global.path || !global.path.isAbsolute(executableCandidate)) {
        const source = executableSource === 'environment'
          ? `environment value ${profile.executableEnv}`
          : `profile ${profile.name}.executable`;
        fail(
          operation,
          'PROGRAM_NOT_CONFIGURED',
          `Agent backend ${backend} executable from ${source} must be an absolute path; installation and login remain separate prerequisites`,
          'configuration',
          { backend, profile: profile.name },
        );
      }
      executableCandidate = global.path.normalize(executableCandidate);
    } else if (discoveryExecutable) {
      executableCandidate = discoveryExecutable;
      executableSource = 'path';
    } else {
      fail(operation, 'PROGRAM_NOT_CONFIGURED', `no executable is configured for backend ${backend}`, 'configuration', { backend, profile: profile.name });
    }
    const executableResolution = resolveOwnedExecutable(executableCandidate, backend, profile.name, operation);
    const executable = executableResolution.status === 'ok' ? executableResolution.path : null;

    let model = options.model;
    if (model !== undefined) nonEmptyString(model, operation, 'model');
    if (!model && profile.model) model = profile.model;
    if (!model && profile.modelEnv) model = env(profile.modelEnv);

    const genericTimeout = normalizeTimeout(
      env('OPENDESK_AGENT_TIMEOUT_MS'),
      DEFAULT_AGENT_TIMEOUT_MS,
      operation,
      'OPENDESK_AGENT_TIMEOUT_MS',
    );
    const backendTimeoutKey = backend === 'codex'
      ? 'OPENDESK_CODEX_TIMEOUT_MS'
      : 'OPENDESK_CLAUDE_CODE_TIMEOUT_MS';
    const backendTimeout = normalizeTimeout(env(backendTimeoutKey), genericTimeout, operation, backendTimeoutKey);
    const profileTimeout = profile.timeoutMs === undefined ? backendTimeout : profile.timeoutMs;
    const timeoutMs = normalizePublicTimeout(options.timeoutMs, profileTimeout, operation);

    const allowedCwd = resolvePath(profile.allowedCwd || global.Execution.workdir, operation, `profile ${profile.name}.allowedCwd`);
    const profileCwd = profile.cwd ? resolvePath(profile.cwd, operation, `profile ${profile.name}.cwd`) : null;
    const requestedCwd = options.cwd ? resolvePath(options.cwd, operation, 'cwd') : profileCwd;
    if (requestedCwd && !pathWithin(requestedCwd, allowedCwd)) {
      fail(operation, 'CWD_OUTSIDE_ALLOWED_SCOPE', 'cwd is outside the selected profile allowedCwd', 'configuration', { backend, profile: profile.name });
    }
    const backendOptions = Object.assign(
      {},
      profile.backendOptions,
      validateBackendOptions(options.backendOptions, backend, operation, 'backendOptions'),
    );
    return {
      backend,
      profile,
      executable,
      executableSource,
      executableStatus: executableResolution.status,
      model: model || null,
      timeoutMs,
      cwd: requestedCwd,
      allowedCwd,
      backendOptions,
      auth: profile.auth,
    };
  }

  function resolveOwnedExecutable(candidate, backend, profile, operation) {
    if (typeof resolveCommandExecutable !== 'function') {
      fail(operation, 'RUNTIME_UNAVAILABLE', 'Command executable resolver is unavailable', 'configuration', {backend, profile});
    }
    let resolved;
    try {
      resolved = resolveCommandExecutable(candidate);
    } catch (error) {
      fail(operation, 'PROGRAM_RESOLUTION_FAILED', `could not inspect ${backend} executable`, 'configuration', {
        backend,
        profile,
        causeCode: error && error.code,
      });
    }
    if (!isObject(resolved)
        || ['ok', 'invalid', 'not-found', 'not-executable'].indexOf(resolved.status) === -1) {
      fail(operation, 'RUNTIME_UNAVAILABLE', 'Command executable resolver returned an invalid result', 'configuration', {backend, profile});
    }
    if (resolved.status === 'ok') {
      if (typeof resolved.path !== 'string' || !global.path || !global.path.isAbsolute(resolved.path)) {
        fail(operation, 'RUNTIME_UNAVAILABLE', 'Command executable resolver did not return an absolute path', 'configuration', {backend, profile});
      }
      return {path: global.path.normalize(resolved.path), status: 'ok'};
    }
    return {path: null, status: resolved.status};
  }

  function assertExecutable(selection, operation) {
    if (selection.executableStatus === 'ok') return;
    const code = selection.executableStatus === 'not-executable'
      ? 'PROGRAM_NOT_EXECUTABLE'
      : 'PROGRAM_NOT_FOUND';
    fail(operation, code, selection.executableStatus === 'not-executable'
      ? `selected ${selection.backend} executable is not an executable file; set ${selection.backend === 'codex' ? 'OPENDESK_CODEX_EXECUTABLE' : 'OPENDESK_CLAUDE_CODE_EXECUTABLE'} to an absolute executable path`
      : `selected ${selection.backend} executable was not found on the controlled PATH; install it or set ${selection.backend === 'codex' ? 'OPENDESK_CODEX_EXECUTABLE' : 'OPENDESK_CLAUDE_CODE_EXECUTABLE'} to an absolute path, then authenticate the CLI separately`, 'configuration', {
        backend: selection.backend,
        profile: selection.profile.name,
      });
  }

  function safeChildEnvironment(selection, operation) {
    const result = {};
    const common = [
      'HOME', 'USERPROFILE', 'HOMEDRIVE', 'HOMEPATH', 'LOCALAPPDATA', 'APPDATA',
      'PATH', 'PATHEXT', 'SYSTEMROOT', 'WINDIR', 'COMSPEC', 'TEMP', 'TMP', 'TMPDIR',
      'LANG', 'LC_ALL', 'LC_CTYPE', 'TERM', 'HTTP_PROXY', 'HTTPS_PROXY', 'NO_PROXY',
      'ALL_PROXY', 'http_proxy', 'https_proxy', 'no_proxy', 'all_proxy',
      'SSL_CERT_FILE', 'SSL_CERT_DIR', 'NODE_EXTRA_CA_CERTS',
    ];
    const backendKeys = selection.backend === 'codex' ? ['CODEX_HOME'] : ['CLAUDE_CONFIG_DIR'];
    for (const key of common.concat(backendKeys)) {
      const value = env(key);
      if (value !== undefined) result[key] = value;
    }
    if (selection.auth.mode === 'env') {
      const secret = env(selection.auth.env);
      if (!secret) {
        fail(operation, 'AUTH_MISSING', `configured auth environment ${selection.auth.env} is missing`, 'configuration', {
          backend: selection.backend,
          profile: selection.profile.name,
        });
      }
      result[selection.auth.target] = secret;
    }
    return result;
  }

  function makeInvocationDirectory(callId, operation) {
    if (!global.File || !global.path || !global.Execution) {
      fail(operation, 'RUNTIME_UNAVAILABLE', 'File, path, and Execution are required', 'configuration');
    }
    const root = global.path.resolve(global.Execution.artifactDir || global.Execution.workdir, 'agent');
    const directory = global.path.resolve(root, callId);
    try {
      if (global.File.exists(directory)) {
        fail(operation, 'INVOCATION_COLLISION', 'agent invocation directory already exists', 'preparation');
      }
      global.File.ensureDir(directory);
    } catch (error) {
      if (error && error.code === 'INVOCATION_COLLISION') throw error;
      fail(operation, 'PREPARATION_FAILED', 'failed to create agent invocation directory', 'preparation');
    }
    return directory;
  }

  function cleanupInvocation(directory, files) {
    if (!global.File) return;
    for (const file of files || []) {
      try {
        if (file && global.File.exists(file)) global.File.remove(file);
      } catch (_) {
        // Artifacts remain execution-owned if best-effort cleanup cannot remove them.
      }
    }
    try {
      if (directory && global.File.exists(directory)) global.File.removeDir(directory);
    } catch (_) {
      // Never recursively remove a directory that an external CLI populated.
    }
  }

  function readBoundedFile(file, operation, backend) {
    let stat;
    try {
      stat = global.File.stat(file);
    } catch (_) {
      fail(operation, 'RESULT_FILE_MISSING', 'failed to stat final result file', 'protocol', { backend });
    }
    if (!stat || stat.type !== 'file' || typeof stat.size !== 'number') {
      fail(operation, 'RESULT_FILE_MISSING', 'final result file is missing', 'protocol', { backend });
    }
    if (stat.size < 1 || stat.size > MAX_FINAL_BYTES) {
      fail(operation, 'RESULT_FILE_LIMIT', `final result file must be 1 through ${MAX_FINAL_BYTES} bytes`, 'protocol', { backend });
    }
    let text;
    try {
      text = global.File.read(file, 'utf8');
    } catch (_) {
      fail(operation, 'RESULT_FILE_READ_FAILED', 'failed to read final result file', 'protocol', { backend });
    }
    if (utf8Length(text) > MAX_FINAL_BYTES) {
      fail(operation, 'RESULT_FILE_LIMIT', `final result file exceeds ${MAX_FINAL_BYTES} bytes`, 'protocol', { backend });
    }
    return text;
  }

  function parseCodexProtocol(stdout, operation) {
    const lines = String(stdout || '').split(/\r?\n/).filter((line) => line.trim() !== '');
    if (lines.length === 0) fail(operation, 'PROTOCOL_ERROR', 'Codex emitted no JSONL events', 'protocol', { backend: 'codex' });
    let sawThread = false;
    let sawTurn = false;
    let terminal = null;
    let usage = null;
    for (const line of lines) {
      let event;
      try {
        event = JSON.parse(line);
      } catch (_) {
        fail(operation, 'PROTOCOL_ERROR', 'Codex JSONL contains invalid JSON', 'protocol', { backend: 'codex' });
      }
      if (!isObject(event) || typeof event.type !== 'string') {
        fail(operation, 'PROTOCOL_ERROR', 'Codex JSONL contains an invalid event', 'protocol', { backend: 'codex' });
      }
      if (terminal) {
        fail(operation, 'PROTOCOL_ERROR', 'Codex emitted events after its terminal event', 'protocol', { backend: 'codex' });
      }
      if (event.type === 'thread.started') sawThread = true;
      if (event.type === 'turn.started') sawTurn = true;
      if (event.type === 'turn.failed' || event.type === 'error') {
        fail(operation, 'AGENT_PROTOCOL_FAILED', `Codex reported terminal event ${event.type}`, 'protocol', { backend: 'codex' });
      }
      if (event.type === 'turn.completed') {
        terminal = event;
        if (isObject(event.usage)) usage = event.usage;
      }
    }
    if (!sawThread || !sawTurn || !terminal) {
      fail(operation, 'PROTOCOL_INCOMPLETE', 'Codex event stream did not complete a started thread and turn', 'protocol', { backend: 'codex' });
    }
    return { usage };
  }

  function adaptAgentPrompt(prompt, output) {
    return output.type === 'json' && output.validation === 'local'
      ? prompt + localJSONInstruction(output)
      : prompt;
  }

  async function runOwnedCommand(selection, args, input, cwd, scope, operation) {
    try {
      return await global.Command.run(selection.executable, args, {
        cwd,
        envMode: 'replace',
        env: safeChildEnvironment(selection, operation),
        timeout: remaining(scope.deadlineAt, operation, selection.backend),
        maxOutputBytes: MAX_AGENT_STDIO_BYTES,
        emitOutput: false,
        input,
        signal: scope.signal,
      });
    } catch (error) {
      const code = classifyOwnedFailure(error, scope, 'PROCESS_FAILED');
      fail(
        operation,
        code,
        code === 'PROCESS_FAILED' ? `${selection.backend} process failed` : `${selection.backend} ${code.toLowerCase()}`,
        code === 'PROCESS_FAILED' ? 'process' : code.toLowerCase(),
        {
          backend: selection.backend,
          profile: selection.profile.name,
          causeCode: error && error.code,
        },
      );
    }
  }

  async function runCodex(selection, options, output, callId, startedAt, scope) {
    const operation = 'Agent.run';
    const directory = makeInvocationDirectory(callId, operation);
    const finalFile = global.path.resolve(directory, 'final-message.txt');
    const schemaFile = global.path.resolve(directory, 'output-schema.json');
    const cleanup = [finalFile];
    try {
      const args = [
        'exec',
        '--json',
        '--ephemeral',
        '--ignore-user-config',
        '--output-last-message', finalFile,
        '--sandbox', 'read-only',
        '--skip-git-repo-check',
      ];
      for (const feature of CODEX_DISABLED_FEATURES) {
        args.push('--disable', feature);
      }
      if (selection.model) args.push('--model', selection.model);
      if (output.type === 'json' && output.validation === 'native') {
        global.File.write(schemaFile, output.schemaJSON, 'utf8');
        cleanup.push(schemaFile);
        args.push('--output-schema', schemaFile);
      }
      if (selection.backendOptions.reasoningEffort) {
        args.push('-c', `model_reasoning_effort=${JSON.stringify(selection.backendOptions.reasoningEffort)}`);
      }
      args.push('-');
      scope.check();
      const result = await runOwnedCommand(
        selection,
        args,
        adaptAgentPrompt(options.prompt, output),
        selection.cwd || directory,
        scope,
        operation,
      );
      scope.check();
      const protocol = parseCodexProtocol(result && result.stdout, operation);
      const text = readBoundedFile(finalFile, operation, 'codex');
      remaining(scope.deadlineAt, operation, 'codex');
      const data = output.type === 'json' ? parseStructuredText(text, output, operation) : text;
      scope.check();
      return {
        data,
        meta: sanitizeMeta(
          'agent',
          'codex',
          'codex-exec',
          callId,
          selection.profile.name,
          selection.model,
          null,
          elapsed(startedAt),
          protocol.usage,
        ),
      };
    } finally {
      cleanupInvocation(directory, cleanup);
    }
  }

  function parseClaudeEnvelope(stdout, output, operation) {
    let envelope;
    try {
      envelope = JSON.parse(String(stdout || ''));
    } catch (_) {
      fail(operation, 'PROTOCOL_ERROR', 'Claude Code output is not a JSON result envelope', 'protocol', { backend: 'claude-code' });
    }
    if (!isObject(envelope) || envelope.type !== 'result') {
      fail(operation, 'PROTOCOL_ERROR', 'Claude Code output is missing a result envelope', 'protocol', { backend: 'claude-code' });
    }
    if (envelope.subtype !== 'success' || envelope.is_error === true) {
      fail(operation, 'AGENT_PROTOCOL_FAILED', `Claude Code reported ${String(envelope.subtype || 'failure')}`, 'protocol', { backend: 'claude-code' });
    }
    let data;
    if (output.type === 'json' && output.validation === 'native') {
      if (!own(envelope, 'structured_output')) {
        fail(operation, 'PROTOCOL_INCOMPLETE', 'Claude Code success result is missing structured_output', 'protocol', { backend: 'claude-code' });
      }
      data = validateValue(envelope.structured_output, output.schema, operation, 'result.data');
    } else if (output.type === 'json') {
      data = parseStructuredText(envelope.result, output, operation);
    } else {
      if (typeof envelope.result !== 'string' || envelope.result.trim().length === 0) {
        fail(operation, 'PROTOCOL_INCOMPLETE', 'Claude Code success result is missing text result', 'protocol', { backend: 'claude-code' });
      }
      data = envelope.result;
    }
    let model = typeof envelope.model === 'string' && envelope.model.length > 0 ? envelope.model : null;
    if (!model && isObject(envelope.modelUsage)) {
      const models = Object.keys(envelope.modelUsage);
      if (models.length === 1) model = models[0];
    }
    return {
      data,
      model,
      usage: isObject(envelope.usage) ? envelope.usage : null,
    };
  }

  async function runClaudeCode(selection, options, output, callId, startedAt, scope) {
    const operation = 'Agent.run';
    const directory = makeInvocationDirectory(callId, operation);
    try {
      const args = [
        '-p',
        '--output-format', 'json',
        '--permission-mode', 'plan',
        '--no-session-persistence',
        '--strict-mcp-config',
        '--tools', '',
      ];
      if (selection.model) args.push('--model', selection.model);
      if (output.type === 'json' && output.validation === 'native') {
        args.push('--json-schema', output.schemaJSON);
      }
      if (selection.backendOptions.maxBudgetUsd) {
        args.push('--max-budget-usd', String(selection.backendOptions.maxBudgetUsd));
      }
      scope.check();
      const result = await runOwnedCommand(
        selection,
        args,
        adaptAgentPrompt(options.prompt, output),
        selection.cwd || directory,
        scope,
        operation,
      );
      scope.check();
      const parsed = parseClaudeEnvelope(result && result.stdout, output, operation);
      scope.check();
      return {
        data: parsed.data,
        meta: sanitizeMeta(
          'agent',
          'claude-code',
          'claude-code-print',
          callId,
          selection.profile.name,
          selection.model,
          parsed.model,
          elapsed(startedAt),
          parsed.usage,
        ),
      };
    } finally {
      cleanupInvocation(directory, []);
    }
  }

  function agentCapabilitySelection(query, operation) {
    try {
      const selection = resolveAgentSelection(query, operation);
      return { selection, error: null };
    } catch (error) {
      return {
        selection: null,
        error: {
          code: error && error.code ? error.code : 'UNKNOWN',
          message: error && error.message ? error.message : String(error),
          backend: error && error.backend ? error.backend : (query.backend || null),
          profile: error && error.profile ? error.profile : (query.profile || null),
        },
      };
    }
  }

  const Agent = Object.freeze({
    getCapabilities(rawQuery) {
      const operation = 'Agent.getCapabilities';
      const query = rawQuery === undefined || rawQuery === null ? {} : rawQuery;
      if (!isObject(query)) fail(operation, 'INVALID_ARGUMENT', 'options must be an object', 'validation');
      assertKnownFields(query, { backend: true, profile: true }, operation, 'options');
      const resolved = agentCapabilitySelection(query, operation);
      const backend = resolved.selection
        ? resolved.selection.backend
        : (resolved.error && resolved.error.backend) || query.backend || env('OPENDESK_AGENT_BACKEND') || 'codex';
      const supported = SUPPORTED_AGENT_BACKENDS.indexOf(backend) !== -1;
      const configured = Boolean(resolved.selection);
      const found = resolved.selection ? resolved.selection.executableStatus === 'ok' : null;
      let authenticated = false;
      if (resolved.selection) {
        authenticated = resolved.selection.auth.mode === 'env'
          ? Boolean(env(resolved.selection.auth.env))
          : 'unknown';
      }
      return {
        schemaVersion: 1,
        kind: 'agent',
        enabled: commandEnabled(),
        executionScoped: true,
        defaultBackend: 'codex',
        supported,
        configured,
        executableFound: found,
        checked: false,
        authenticated,
        available: null,
        backend,
        profile: resolved.selection ? resolved.selection.profile.name : (query.profile || null),
        requestedModel: resolved.selection ? resolved.selection.model : null,
        supportedBackends: SUPPORTED_AGENT_BACKENDS.slice(),
        reservedBackends: RESERVED_AGENT_BACKENDS.slice(),
        structuredOutput: { native: supported, local: true },
        selectionError: resolved.error,
      };
    },

    async run(rawOptions) {
      const operation = 'Agent.run';
      const startedAt = Date.now();
      if (!isObject(rawOptions)) fail(operation, 'INVALID_ARGUMENT', 'options must be an object', 'validation');
      assertKnownFields(rawOptions, {
        backend: true,
        profile: true,
        prompt: true,
        model: true,
        output: true,
        cwd: true,
        timeoutMs: true,
        signal: true,
        backendOptions: true,
      }, operation, 'options');
      const signal = normalizeSignal(rawOptions.signal, operation);
      if (signal && signal.aborted) {
        fail(operation, 'CANCELED', 'operation was canceled', 'cancel', { backend: rawOptions.backend });
      }
      const prompt = checkedPrompt(rawOptions.prompt, operation);
      if (!commandEnabled()) {
        fail(operation, 'DISABLED', 'Agent.run is available only when Command is enabled for this execution source', 'configuration');
      }
      const output = normalizeOutput(rawOptions.output, operation);
      const selection = resolveAgentSelection(rawOptions, operation);
      assertExecutable(selection, operation);
      const scope = createCallScope(signal, startedAt + selection.timeoutMs, operation, selection.backend);
      const options = Object.assign({}, rawOptions, { prompt });
      try {
        const callId = makeCallId('agent');
        if (selection.backend === 'codex') {
          return await runCodex(selection, options, output, callId, startedAt, scope);
        }
        if (selection.backend === 'claude-code') {
          return await runClaudeCode(selection, options, output, callId, startedAt, scope);
        }
        fail(operation, 'BACKEND_NOT_IMPLEMENTED', `backend ${selection.backend} is not implemented`, 'configuration', { backend: selection.backend });
      } finally {
        scope.cleanup();
      }
    },
  });

  global.LLM = LLM;
  global.Agent = Agent;
})(globalThis);
