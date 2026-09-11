(function installOpenDeskExampleLaunchSpec(global) {
  'use strict';

  const KINDS = new Set(['script', 'ai-run']);
  const CONSOLE_MODES = new Set(['normal', 'full', 'script', 'meta', 'summary', 'quiet', 'agent']);

  function normalizePlatform(value) {
    return String(value || '').trim().toLowerCase();
  }

  function displayExecutable(platform) {
    return platform === 'windows' ? '.\\dist\\opendesk.exe' : './dist/opendesk';
  }

  function displayPath(value, platform) {
    const normalized = String(value || '').replace(/\\/g, '/');
    return platform === 'windows' ? normalized.replace(/\//g, '\\') : normalized;
  }

  function shellQuote(value, platform) {
    const text = String(value == null ? '' : value);
    const safe = platform === 'windows'
      ? /^[A-Za-z0-9_./\\-]+$/.test(text) || /^<[A-Za-z0-9_.-]+>$/.test(text)
      : /^[A-Za-z0-9_./-]+$/.test(text) || /^<[A-Za-z0-9_.-]+>$/.test(text);
    if (safe) return text;
    if (platform === 'windows') return '"' + text.replace(/"/g, '\\"') + '"';
    return "'" + text.replace(/'/g, "'\\''") + "'";
  }

  function relativeScriptPath(entry, options) {
    const pathApi = options.pathApi || global.path;
    if (pathApi && typeof pathApi.relative === 'function') {
      const relative = pathApi.relative(options.workdir || '.', entry.absolutePath);
      if (relative) return String(relative).replace(/\\/g, '/');
    }
    return String(entry.relativePath || '').replace(/\\/g, '/');
  }

  function createSpec(entry, options) {
    options = options || {};
    if (!entry || typeof entry !== 'object') throw new Error('ExampleLaunchSpec requires an entry');
    const launch = entry.launch;
    if (!launch || typeof launch !== 'object') throw new Error('ExampleLaunchSpec requires entry.launch');
    const kind = String(launch.kind || '');
    if (!KINDS.has(kind)) throw new Error('unsupported launch kind: ' + kind);
    const ui = launch.ui === true;
    if (kind === 'ai-run' && ui) throw new Error('ai-run examples cannot request -ui; use the script entrypoint');

    const platform = normalizePlatform(options.platform);
    const scriptPath = relativeScriptPath(entry, options);
    if (!scriptPath || scriptPath.startsWith('../') || scriptPath === '..') {
      throw new Error('example path must remain below the execution workdir: ' + entry.relativePath);
    }
    const platformSupported = !platform || !Array.isArray(entry.platforms) || entry.platforms.includes(platform);
    const runPolicy = String(entry.runPolicy || 'manual');
    const runnable = runPolicy === 'safe' && platformSupported;
    const requiredInput = launch.input === 'required';

    function buildArgs(buildOptions = {}) {
      if (requiredInput && !buildOptions.inputFile && !buildOptions.input) {
        throw new Error('this ai-run example requires an input file or JSON input');
      }
      if (kind === 'ai-run') {
        const args = ['ai', 'run', entry.absolutePath];
        if (buildOptions.inputFile) args.push('--input-file', String(buildOptions.inputFile));
        else if (buildOptions.input) args.push('--input', String(buildOptions.input));
        return args;
      }
      const args = [];
      if (ui) args.push('-ui');
      args.push('-script', entry.absolutePath);
      const consoleMode = String(launch.consoleMode || 'script');
      args.push('-console-mode', consoleMode);
      return args;
    }

    function buildDisplayCommand() {
      const displayPlatform = platform || 'darwin';
      const displayScript = displayPath(scriptPath, displayPlatform);
      const args = kind === 'ai-run'
        ? ['ai', 'run', displayScript]
        : (ui ? ['-ui', '-script', displayScript, '-console-mode', String(launch.consoleMode || 'script')]
          : ['-script', displayScript, '-console-mode', String(launch.consoleMode || 'script')]);
      if (requiredInput) args.push('--input-file', '<path-to-input.json>');
      return [displayExecutable(displayPlatform)].concat(args)
        .map(value => shellQuote(value, displayPlatform)).join(' ');
    }

    return Object.freeze({
      kind,
      ui,
      consoleMode: kind === 'script' ? String(launch.consoleMode || 'script') : null,
      platform,
      platformSupported,
      runPolicy,
      runnable,
      scriptPath,
      requiredEnv: Array.isArray(entry.requiredEnv) ? entry.requiredEnv.slice() : [],
      requiredInput,
      buildArgs,
      buildDisplayCommand,
    });
  }

  global.OpenDeskExampleLaunchSpec = Object.freeze({
    KINDS: Object.freeze(Array.from(KINDS)),
    CONSOLE_MODES: Object.freeze(Array.from(CONSOLE_MODES)),
    create: createSpec,
  });
})(globalThis);
