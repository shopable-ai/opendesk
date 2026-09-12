(function installOpenDeskOfficialShell(global) {
  'use strict';

  const CONFIG_MAGIC = 'ODCFG1';
  const CONFIG_SCHEMA_VERSION = 1;
  const OBFUSCATION_KEY = 'OpenDeskOfficialShell/v1';
  const HTTPS_URL_PATTERN = /^https:\/\/[^\s/?#\\]+(?:[/?#][^\s]*)?$/;
  const CORE_ACTIONS = Object.freeze(['home', 'help', 'customize']);
  const ACTION_DEFINITIONS = Object.freeze({
    home: Object.freeze({
      id: 'opendesk.home',
      label: '打开 OpenDesk 官网',
      title: 'OpenDesk 官网',
      placeholder: 'OpenDesk 官网暂不可用。',
    }),
    help: Object.freeze({
      id: 'opendesk.help',
      label: '帮助',
      title: '帮助与支持',
      placeholder: '帮助中心待开放。',
    }),
    customize: Object.freeze({
      id: 'opendesk.customize',
      label: '定制',
      title: '定制自动化',
      placeholder: '定制自动化服务待开放。',
    }),
    marketplace: Object.freeze({
      id: 'opendesk.marketplace',
      label: '商店',
      title: '自动化市场',
      placeholder: '自动化市场待开放。',
    }),
    upgrade: Object.freeze({
      id: 'opendesk.upgrade',
      label: '专业版',
      title: '升级专业版',
      placeholder: '专业版服务待开放。',
    }),
  });

  const FALLBACK_CONFIG = Object.freeze({
    schemaVersion: CONFIG_SCHEMA_VERSION,
    actions: Object.freeze({
      home: Object.freeze({visible: true, url: 'https://github.com/shopable-ai/opendesk'}),
      help: Object.freeze({visible: true, url: ''}),
      customize: Object.freeze({visible: true, url: ''}),
      marketplace: Object.freeze({visible: false, url: ''}),
      upgrade: Object.freeze({visible: false, url: ''}),
    }),
  });

  function checksum16(text) {
    let sum = 0;
    for (let index = 0; index < text.length; index++) {
      sum = (sum + text.charCodeAt(index)) & 0xffff;
    }
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

  function validateConfig(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error('official shell config must be an object');
    }
    if (value.schemaVersion !== CONFIG_SCHEMA_VERSION) {
      throw new Error('official shell config schemaVersion is unsupported');
    }
    if (!value.actions || typeof value.actions !== 'object' || Array.isArray(value.actions)) {
      throw new Error('official shell config actions must be an object');
    }

    const actions = {};
    for (const name of Object.keys(ACTION_DEFINITIONS)) {
      const action = value.actions[name];
      if (!action || typeof action !== 'object' || Array.isArray(action)) {
        throw new Error(`official shell config is missing action: ${name}`);
      }
      if (typeof action.visible !== 'boolean' || typeof action.url !== 'string') {
        throw new Error(`official shell action is invalid: ${name}`);
      }
      const url = action.url.trim();
      if (url && !HTTPS_URL_PATTERN.test(url)) {
        throw new Error(`official shell action only accepts https URL: ${name}`);
      }
      if (CORE_ACTIONS.includes(name) && action.visible !== true) {
        throw new Error(`official shell core action cannot be hidden: ${name}`);
      }
      actions[name] = Object.freeze({visible: action.visible, url});
    }

    return Object.freeze({
      schemaVersion: CONFIG_SCHEMA_VERSION,
      actions: Object.freeze(actions),
    });
  }

  function parseConfig(text) {
    const lines = String(text || '').trim().split(/\r?\n/);
    if (lines.length !== 2) throw new Error('official shell config must contain a header and payload');
    const header = lines[0].split(':');
    if (header.length !== 2 || header[0] !== CONFIG_MAGIC || !/^[0-9a-f]{4}$/i.test(header[1])) {
      throw new Error('official shell config header is invalid');
    }
    const decoded = decodeHexPayload(lines[1]);
    if (checksum16(decoded) !== header[1].toLowerCase()) {
      throw new Error('official shell config checksum mismatch');
    }
    return validateConfig(JSON.parse(decoded));
  }

  function create(options) {
    const settings = options || {};
    const file = settings.file || global.File;
    const command = settings.command || global.Command;
    const system = settings.system || global.System;
    const execution = settings.execution || global.Execution;
    const logger = settings.logger || global.console;
    const packageRoot = settings.packageRoot || (execution && execution.scriptDir);

    if (!file || typeof file.join !== 'function' || typeof file.read !== 'function' || typeof file.stat !== 'function') {
      throw new Error('official shell requires File.join/read/stat');
    }
    if (!command || typeof command.run !== 'function') throw new Error('official shell requires Command.run()');
    if (!system || typeof system.getPlatformInfo !== 'function') throw new Error('official shell requires System.getPlatformInfo()');
    if (!execution || !execution.workdir) throw new Error('official shell requires Execution.workdir');
    if (!packageRoot) throw new Error('official shell requires packageRoot');

    const configPath = file.join(packageRoot, 'assets', 'official-shell.odcfg');
    let config = FALLBACK_CONFIG;
    let configSource = 'fallback';
    let configError = '';

    try {
      const info = file.stat(configPath);
      if (!info || info.type !== 'file') throw new Error('official shell config file is missing');
      config = parseConfig(String(file.read(configPath)));
      configSource = 'bundle';
    } catch (error) {
      configError = error && error.message ? String(error.message) : String(error || 'unknown config error');
      if (logger && typeof logger.warn === 'function') {
        logger.warn('OPENDESK_OFFICIAL_SHELL_CONFIG_FALLBACK=' + JSON.stringify({configPath, error: configError}));
      }
    }

    function resolveName(actionId) {
      const id = String(actionId || '');
      for (const name of Object.keys(ACTION_DEFINITIONS)) {
        if (ACTION_DEFINITIONS[name].id === id) return name;
      }
      return '';
    }

    function getAction(actionId) {
      const name = resolveName(actionId);
      if (!name) return null;
      const definition = ACTION_DEFINITIONS[name];
      const configured = config.actions[name];
      return Object.freeze({
        id: definition.id,
        label: definition.label,
        title: definition.title,
        placeholder: definition.placeholder,
        visible: configured.visible,
        url: configured.url,
      });
    }

    function listActions() {
      return Object.keys(ACTION_DEFINITIONS).map(name => getAction(ACTION_DEFINITIONS[name].id));
    }

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
      if (!action.visible) {
        return Object.freeze({status: 'unavailable', actionId: action.id, message: `${action.title}暂未开放。`});
      }
      if (!action.url) {
        return Object.freeze({status: 'pending', actionId: action.id, message: action.placeholder});
      }
      await openExternal(action.url);
      return Object.freeze({status: 'opened', actionId: action.id, message: `已打开${action.title}。`});
    }

    return Object.freeze({
      activate,
      getAction,
      listActions,
      state: () => Object.freeze({configPath, configSource, configError}),
    });
  }

  global.OpenDeskOfficialShell = Object.freeze({
    create,
    parseConfig,
    validateConfig,
  });
})(globalThis);
