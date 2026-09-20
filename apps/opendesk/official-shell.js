(function installOpenDeskOfficialShell(global) {
  'use strict';

  const CONFIG_MAGIC = 'ODCFG1';
  const CONFIG_SCHEMA_VERSION = 1;
  const CONFIG_BASENAME = 'product';
  const OBFUSCATION_KEY = 'OpenDeskOfficialShell/v1';
  const HTTPS_URL_PATTERN = /^https:\/\/[^\s/?#\\]+(?:[/?#][^\s]*)?$/;
  const HTTPS_ORIGIN_PATTERN = /^https:\/\/[^\s/?#\\]+\/?$/;
  const CORE_ACTIONS = Object.freeze(['home', 'help', 'customize', 'examples', 'apiDocs']);
  const REQUIRED_CONFIG_ACTIONS = Object.freeze(['home', 'help', 'customize', 'marketplace', 'upgrade']);
  const OPTIONAL_CONFIG_ACTIONS = Object.freeze(['examples', 'apiDocs']);
  const CONFIG_ACTIONS = Object.freeze([...REQUIRED_CONFIG_ACTIONS, ...OPTIONAL_CONFIG_ACTIONS]);
  const ACTION_DEFINITIONS = Object.freeze({
    home: Object.freeze({id: 'opendesk.home', label: '打开 OpenDesk 官网', title: 'OpenDesk 官网', placeholder: 'OpenDesk 官网暂不可用。'}),
    help: Object.freeze({id: 'opendesk.help', label: '帮助', title: '帮助与支持', placeholder: '帮助中心待开放。'}),
    examples: Object.freeze({id: 'opendesk.examples', label: '示例代码', title: '示例代码', placeholder: '示例代码暂不可用。'}),
    apiDocs: Object.freeze({id: 'opendesk.api-docs', label: 'API 文档', title: 'API 文档', placeholder: 'API 文档暂不可用。'}),
    customize: Object.freeze({id: 'opendesk.customize', label: '定制', title: '定制自动化', placeholder: '定制自动化服务待开放。'}),
    marketplace: Object.freeze({id: 'opendesk.marketplace', label: '商店', title: '自动化市场', placeholder: '自动化市场待开放。'}),
    upgrade: Object.freeze({id: 'opendesk.upgrade', label: '专业版', title: '升级专业版', placeholder: '专业版服务待开放。'}),
  });

  const FALLBACK_CONFIG = Object.freeze({
    schemaVersion: CONFIG_SCHEMA_VERSION,
    actions: Object.freeze({
      home: Object.freeze({visible: true, url: ''}),
      help: Object.freeze({visible: true, url: ''}),
      examples: Object.freeze({visible: true, url: ''}),
      apiDocs: Object.freeze({visible: true, url: ''}),
      customize: Object.freeze({visible: true, url: ''}),
      marketplace: Object.freeze({visible: false, url: ''}),
      upgrade: Object.freeze({visible: false, url: ''}),
    }),
    analytics: null,
    flowDistribution: null,
  });

  function checksum16(text) {
    let sum = 0;
    for (let index = 0; index < text.length; index++) sum = (sum + text.charCodeAt(index)) & 0xffff;
    return sum.toString(16).padStart(4, '0');
  }

  function decodeHexPayload(hex) {
    const normalized = String(hex || '').trim();
    if (!normalized || normalized.length % 2 !== 0 || !/^[0-9a-f]+$/i.test(normalized)) {
      throw new Error('official shell config payload is not valid hex');
    }
    let decoded = '';
    for (let index = 0; index < normalized.length; index += 2) {
      const byte = parseInt(normalized.slice(index, index + 2), 16);
      const keyByte = OBFUSCATION_KEY.charCodeAt((index / 2) % OBFUSCATION_KEY.length);
      decoded += String.fromCharCode(byte ^ keyByte);
    }
    return decoded;
  }

  function requireExactFields(value, expected, prefix) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${prefix} must be an object`);
    const allowed = new Set(expected);
    for (const name of Object.keys(value)) {
      if (!allowed.has(name)) throw new Error(`${prefix} contains unknown field: ${name}`);
    }
    for (const name of expected) {
      if (!(name in value)) throw new Error(`${prefix} is missing field: ${name}`);
    }
  }

  function validateAnalytics(value) {
    if (value == null) return null;
    requireExactFields(value, ['provider', 'endpoint', 'projectToken', 'environment', 'maxEventBytes', 'queue', 'network', 'session'], 'official shell analytics config');
    const provider = String(value.provider || '').trim().toLowerCase();
    const endpoint = String(value.endpoint || '').trim().replace(/\/$/, '');
    const projectToken = String(value.projectToken || '').trim();
    const environment = String(value.environment || '').trim().toLowerCase();
    if (!['posthog', 'debug', 'disabled'].includes(provider)) throw new Error('official shell analytics provider is invalid');
    if (!['production', 'development', 'test'].includes(environment)) throw new Error('official shell analytics environment is invalid');
    if (provider === 'debug' && environment === 'production') throw new Error('official shell analytics debug provider is not allowed in production');
    if (provider === 'posthog' && !HTTPS_ORIGIN_PATTERN.test(endpoint)) throw new Error('official shell analytics endpoint must be an https origin');
    if (projectToken && !/^phc_[^\s]{1,252}$/.test(projectToken)) throw new Error('official shell analytics projectToken must be a public capture token');
    if (!Number.isInteger(value.maxEventBytes) || value.maxEventBytes < 256 || value.maxEventBytes > 2048) throw new Error('official shell analytics maxEventBytes is invalid');

    requireExactFields(value.queue, ['maxEvents', 'batchSize', 'maxRequests'], 'official shell analytics queue');
    if (!Number.isInteger(value.queue.maxEvents) || value.queue.maxEvents < 1 || value.queue.maxEvents > 1000
      || !Number.isInteger(value.queue.batchSize) || value.queue.batchSize < 1 || value.queue.batchSize > 100 || value.queue.batchSize > value.queue.maxEvents
      || !Number.isInteger(value.queue.maxRequests) || value.queue.maxRequests < 1 || value.queue.maxRequests > 16) {
      throw new Error('official shell analytics queue bounds are invalid');
    }

    requireExactFields(value.network, ['requestTimeoutMs', 'flushIntervalMs', 'maxRetries', 'shutdownTimeoutMs'], 'official shell analytics network');
    if (!Number.isInteger(value.network.requestTimeoutMs) || value.network.requestTimeoutMs < 100 || value.network.requestTimeoutMs > 5000
      || !Number.isInteger(value.network.flushIntervalMs) || value.network.flushIntervalMs < 100 || value.network.flushIntervalMs > 30000
      || !Number.isInteger(value.network.maxRetries) || value.network.maxRetries < 0 || value.network.maxRetries > 3
      || !Number.isInteger(value.network.shutdownTimeoutMs) || value.network.shutdownTimeoutMs < 100 || value.network.shutdownTimeoutMs > 1000) {
      throw new Error('official shell analytics network bounds are invalid');
    }

    requireExactFields(value.session, ['idleTimeoutMinutes'], 'official shell analytics session');
    if (!Number.isInteger(value.session.idleTimeoutMinutes) || value.session.idleTimeoutMinutes < 1 || value.session.idleTimeoutMinutes > 120) {
      throw new Error('official shell analytics session idle timeout is invalid');
    }
    return Object.freeze({
      provider, endpoint, projectToken, environment, maxEventBytes: value.maxEventBytes,
      queue: Object.freeze({maxEvents: value.queue.maxEvents, batchSize: value.queue.batchSize, maxRequests: value.queue.maxRequests}),
      network: Object.freeze({
        requestTimeoutMs: value.network.requestTimeoutMs,
        flushIntervalMs: value.network.flushIntervalMs,
        maxRetries: value.network.maxRetries,
        shutdownTimeoutMs: value.network.shutdownTimeoutMs,
      }),
      session: Object.freeze({idleTimeoutMinutes: value.session.idleTimeoutMinutes}),
    });
  }

  function isPublicFlowDistributionPrefix(candidate) {
    const value = String(candidate || '').trim();
    if (!/^https:\/\/[^\s/?#\\]+(?:\/[^\s?#\\]*)?\/$/.test(value)) return false;
    const authority = value.slice('https://'.length).split('/')[0];
    let host = authority;
    if (host.startsWith('[')) {
      const end = host.indexOf(']');
      if (end < 0) return false;
      host = host.slice(1, end).toLowerCase();
      if (host === '::' || host === '::1' || /^f[cd]/i.test(host) || /^fe[89ab]/i.test(host)) return false;
      return true;
    }
    const colon = host.lastIndexOf(':');
    if (colon >= 0) host = host.slice(0, colon);
    host = host.toLowerCase().replace(/\.$/, '');
    if (!host || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')) return false;
    const parts = host.split('.');
    if (parts.length === 4 && parts.every(part => /^\d{1,3}$/.test(part) && Number(part) <= 255)) {
      const bytes = parts.map(Number);
      if (bytes[0] === 0 || bytes[0] === 10 || bytes[0] === 127 || bytes[0] >= 224) return false;
      if (bytes[0] === 100 && bytes[1] >= 64 && bytes[1] <= 127) return false;
      if (bytes[0] === 169 && bytes[1] === 254) return false;
      if (bytes[0] === 172 && bytes[1] >= 16 && bytes[1] <= 31) return false;
      if (bytes[0] === 192 && bytes[1] === 168) return false;
      return true;
    }
    return host.includes('.');
  }

  function validateFlowDistribution(value) {
    if (value == null) return null;
    requireExactFields(value, ['resolver', 'metadataBaseUrl', 'artifactBaseUrl', 'releaseRoots'], 'official shell flowDistribution config');
    const resolver = String(value.resolver || '').trim().toLowerCase();
    const metadataBaseUrl = String(value.metadataBaseUrl || '').trim();
    const artifactBaseUrl = String(value.artifactBaseUrl || '').trim();
    if (!['static', 'dynamic'].includes(resolver)) throw new Error('official shell flowDistribution resolver is invalid');
    const validPrefix = candidate => isPublicFlowDistributionPrefix(candidate)
      && !candidate.split('/').some(part => part === '.' || part === '..');
    if (!validPrefix(metadataBaseUrl)) throw new Error('official shell flowDistribution metadataBaseUrl must be an https URL prefix ending in /');
    if (artifactBaseUrl && !validPrefix(artifactBaseUrl)) throw new Error('official shell flowDistribution artifactBaseUrl must be an https URL prefix ending in /');
    if (!value.releaseRoots || typeof value.releaseRoots !== 'object' || Array.isArray(value.releaseRoots) || Object.keys(value.releaseRoots).length === 0) {
      throw new Error('official shell flowDistribution releaseRoots are required');
    }
    const releaseRoots = {};
    for (const [keyId, root] of Object.entries(value.releaseRoots)) {
      if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(keyId) || !/^[0-9a-f]{64}$/.test(String(root || ''))) {
        throw new Error('official shell flowDistribution release root is invalid');
      }
      releaseRoots[keyId] = String(root);
    }
    return Object.freeze({resolver, metadataBaseUrl, artifactBaseUrl, releaseRoots: Object.freeze(releaseRoots)});
  }

  function validateConfig(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('official shell config must be an object');
    for (const name of Object.keys(value)) {
      if (name !== 'schemaVersion' && name !== 'actions' && name !== 'analytics' && name !== 'flowDistribution') throw new Error(`official shell config contains unknown field: ${name}`);
    }
    if (value.schemaVersion !== CONFIG_SCHEMA_VERSION) throw new Error('official shell config schemaVersion is unsupported');
    if (!value.actions || typeof value.actions !== 'object' || Array.isArray(value.actions)) throw new Error('official shell config actions must be an object');
    for (const name of Object.keys(value.actions)) {
      if (!CONFIG_ACTIONS.includes(name)) throw new Error(`official shell config contains unknown action: ${name}`);
    }

    const actions = {};
    for (const name of CONFIG_ACTIONS) {
      const action = value.actions[name];
      if (!action || typeof action !== 'object' || Array.isArray(action)) {
        if (OPTIONAL_CONFIG_ACTIONS.includes(name) && action === undefined) continue;
        throw new Error(`official shell config is missing action: ${name}`);
      }
      for (const field of Object.keys(action)) {
        if (field !== 'visible' && field !== 'url') throw new Error(`official shell action contains unknown field: ${name}.${field}`);
      }
      if (typeof action.visible !== 'boolean' || typeof action.url !== 'string') throw new Error(`official shell action is invalid: ${name}`);
      const url = action.url.trim();
      if (url && !HTTPS_URL_PATTERN.test(url)) throw new Error(`official shell action only accepts https URL: ${name}`);
      if (name === 'home' && !url) throw new Error('official shell home action requires an https URL');
      if (CORE_ACTIONS.includes(name) && action.visible !== true) throw new Error(`official shell core action cannot be hidden: ${name}`);
      actions[name] = Object.freeze({visible: action.visible, url});
    }

    const normalized = {
      schemaVersion: CONFIG_SCHEMA_VERSION,
      actions: Object.freeze(actions),
    };
    if (Object.prototype.hasOwnProperty.call(value, 'analytics')) {
      normalized.analytics = validateAnalytics(value.analytics);
    }
    if (Object.prototype.hasOwnProperty.call(value, 'flowDistribution')) {
      normalized.flowDistribution = validateFlowDistribution(value.flowDistribution);
    }
    return Object.freeze(normalized);
  }

  function parseConfig(text) {
    const lines = String(text || '').trim().split(/\r?\n/);
    if (lines.length !== 2) throw new Error('official shell config must contain a header and payload');
    const header = lines[0].split(':');
    if (header.length !== 2 || header[0] !== CONFIG_MAGIC || !/^[0-9a-f]{4}$/i.test(header[1])) throw new Error('official shell config header is invalid');
    const decoded = decodeHexPayload(lines[1]);
    if (checksum16(decoded) !== header[1].toLowerCase()) throw new Error('official shell config checksum mismatch');
    return validateConfig(JSON.parse(decoded));
  }

  function parsePlaintextConfig(text) { return validateConfig(JSON.parse(String(text || ''))); }

  function create(options) {
    const settings = options || {};
    const file = settings.file || global.File;
    const command = settings.command || global.Command;
    const system = settings.system || global.System;
    const execution = settings.execution || global.Execution;
    const logger = settings.logger || global.console;
    const packageRoot = settings.packageRoot || (execution && execution.scriptDir);

    if (!file || typeof file.join !== 'function' || typeof file.read !== 'function' || typeof file.exists !== 'function') throw new Error('official shell requires File.join/read/exists');
    if (!command || typeof command.run !== 'function') throw new Error('official shell requires Command.run()');
    if (!system || typeof system.getPlatformInfo !== 'function') throw new Error('official shell requires System.getPlatformInfo()');
    if (!system.product || typeof system.product.website !== 'string') throw new Error('official shell requires System.product.website');
    if (!execution || !execution.workdir) throw new Error('official shell requires Execution.workdir');
    if (!packageRoot) throw new Error('official shell requires packageRoot');

    const productWebsite = system.product.website.trim();
    if (!HTTPS_URL_PATTERN.test(productWebsite)) throw new Error('System.product.website must be an https URL');

    const configBasePath = settings.configBasePath || file.join(packageRoot, 'assets', CONFIG_BASENAME);
    const protectedConfigPath = settings.configPath ? String(settings.configPath) : configBasePath + '.odcfg';
    const plaintextConfigPath = settings.configPath ? '' : configBasePath + '.json';
    let config = FALLBACK_CONFIG;
    let configPath = '';
    let configSource = 'fallback';
    let configFormat = 'fallback';
    let configError = '';

    function warnFallback(path, error) {
      configError = error && error.message ? String(error.message) : String(error || 'unknown config error');
      configPath = path || '';
      if (logger && typeof logger.warn === 'function') {
        logger.warn('OPENDESK_OFFICIAL_SHELL_CONFIG_FALLBACK=' + JSON.stringify({configPath, protectedConfigPath, plaintextConfigPath, error: configError}));
      }
    }

    if (file.exists(protectedConfigPath)) {
      configPath = protectedConfigPath;
      try {
        config = parseConfig(String(file.read(protectedConfigPath)));
        configSource = 'bundle';
        configFormat = CONFIG_MAGIC;
      } catch (error) {
        warnFallback(protectedConfigPath, error);
      }
    } else if (plaintextConfigPath && file.exists(plaintextConfigPath)) {
      configPath = plaintextConfigPath;
      try {
        config = parsePlaintextConfig(String(file.read(plaintextConfigPath)));
        configSource = 'plaintext';
        configFormat = 'json';
      } catch (error) {
        warnFallback(plaintextConfigPath, error);
      }
    } else {
      warnFallback(protectedConfigPath, new Error('official shell config file is missing'));
    }

    if (configSource !== 'fallback' && config.actions.home.url !== productWebsite) {
      warnFallback(configPath, new Error('official shell home URL does not match System.product.website'));
      config = FALLBACK_CONFIG;
      configSource = 'fallback';
      configFormat = 'fallback';
    }

    function resolveName(actionId) {
      const id = String(actionId || '');
      for (const name of Object.keys(ACTION_DEFINITIONS)) if (ACTION_DEFINITIONS[name].id === id) return name;
      return '';
    }

    function getAction(actionId) {
      const name = resolveName(actionId);
      if (!name) return null;
      const definition = ACTION_DEFINITIONS[name];
      const configured = config.actions[name] || FALLBACK_CONFIG.actions[name];
      return Object.freeze({id: definition.id, label: definition.label, title: definition.title, placeholder: definition.placeholder, visible: configured.visible, url: configured.url});
    }

    function listActions() { return Object.keys(ACTION_DEFINITIONS).map(name => getAction(ACTION_DEFINITIONS[name].id)); }

    async function openExternal(url) {
      const target = String(url || '').trim();
      if (!HTTPS_URL_PATTERN.test(target)) throw new Error('official shell only opens https URLs');
      const platform = system.getPlatformInfo().os;
      const options = {cwd: execution.workdir, timeout: 10000, maxOutputBytes: 256 * 1024};
      if (platform === 'windows') return command.run('explorer.exe', [target], options);
      if (platform === 'darwin') return command.run('/usr/bin/open', [target], options);
      return command.run('xdg-open', [target], options);
    }

    async function activate(actionId) {
      const action = getAction(actionId);
      if (!action) throw new Error(`unknown official action: ${actionId}`);
      if (!action.visible) return Object.freeze({status: 'unavailable', actionId: action.id, message: `${action.title}暂未开放。`});
      if (!action.url) return Object.freeze({status: 'pending', actionId: action.id, message: action.placeholder});
      await openExternal(action.url);
      return Object.freeze({status: 'opened', actionId: action.id, message: `已打开${action.title}。`});
    }

    return Object.freeze({
      activate,
      getAction,
      listActions,
      state: () => Object.freeze({configPath, protectedConfigPath, plaintextConfigPath, configSource, configFormat, configError}),
    });
  }

  global.OpenDeskOfficialShell = Object.freeze({create, parseConfig, parsePlaintextConfig, validateConfig});
})(globalThis);
