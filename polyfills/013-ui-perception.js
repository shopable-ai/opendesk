// Unified, Runtime-owned observation resolver for high-level UI text APIs.
// It deliberately owns no credentials, provider choice, or model input action.
(function (g) {
  'use strict';

  const UI = g.UI;
  if (!UI || UI.__perceptionResolverInstalled === true) return;

  const base = {
    getCapabilities: typeof UI.getCapabilities === 'function' ? UI.getCapabilities.bind(UI) : function () { return {}; },
    findTexts: UI.findTexts.bind(UI),
    findText: UI.findText.bind(UI),
    hasText: UI.hasText.bind(UI),
    tapText: UI.tapText.bind(UI),
    tapTexts: UI.tapTexts.bind(UI),
    waitText: UI.waitText.bind(UI),
    waitTextGone: UI.waitTextGone.bind(UI),
    findTextMatches: UI.findTextMatches.bind(UI),
    tapTargets: UI.tapTargets.bind(UI),
  };
  const DEFAULT_TIMEOUT = 10000;
  const DEFAULT_POLLING = 200;
  const MAX_VLM_AGE_MS = 15000;
  const own = function (value, key) { return Object.prototype.hasOwnProperty.call(value, key); };

  function error(code, operation, message, extra) {
    const result = new Error(message || code);
    result.code = code;
    result.operation = operation;
    result.phase = 'observation';
    result.actionState = 'not_started';
    if (extra) Object.assign(result, extra);
    return result;
  }

  function fail(code, operation, message, extra) { throw error(code, operation, message, extra); }
  function plain(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value) &&
      (Object.getPrototypeOf(value) === null || Object.prototype.toString.call(value) === '[object Object]');
  }
  function finite(value) { return typeof value === 'number' && Number.isFinite(value); }
  function copy(value) { return Object.assign({}, value || {}); }
  function signal(raw, operation) {
    if (raw == null) return null;
    if (typeof raw.aborted !== 'boolean' || typeof raw.addEventListener !== 'function' ||
        typeof raw.removeEventListener !== 'function') {
      fail('INVALID_ARGUMENT', operation, 'signal must be an AbortSignal', { phase: 'arguments' });
    }
    return raw;
  }
  function checkCanceled(value, operation) {
    if (value && value.aborted) fail('CANCELED', operation, 'operation was canceled');
  }
  function timeout(raw, operation) {
    const value = raw.timeout === undefined ? DEFAULT_TIMEOUT : raw.timeout;
    if (!Number.isInteger(value) || value < 1 || value > 300000) {
      fail('INVALID_ARGUMENT', operation, 'timeout must be an integer from 1 to 300000', { phase: 'arguments' });
    }
    return value;
  }
  function polling(raw, operation) {
    const value = raw.polling === undefined ? DEFAULT_POLLING : raw.polling;
    if (!Number.isInteger(value) || value < 1 || value > 10000) {
      fail('INVALID_ARGUMENT', operation, 'polling must be an integer from 1 to 10000', { phase: 'arguments' });
    }
    return value;
  }
  function assertOptions(raw, operation, allowed) {
    if (raw === undefined) return {};
    if (!plain(raw) || Object.getOwnPropertySymbols(raw).length) {
      fail('INVALID_ARGUMENT', operation, 'options must be a plain object without symbol fields', { phase: 'arguments' });
    }
    const unknown = Object.keys(raw).filter(function (key) { return allowed.indexOf(key) < 0; });
    if (unknown.length) {
      fail('INVALID_ARGUMENT', operation, 'unknown option(s): ' + unknown.join(', '), { phase: 'arguments' });
    }
    const result = {};
    Object.keys(raw).forEach(function (key) { result[key] = raw[key]; });
    return result;
  }
  function textOptions(raw, operation, sequence) {
    const allowed = [
      'within', 'index', 'timeout', 'polling', 'click', 'intervalMs', 'match',
      'caseSensitive', 'normalizeWhitespace', 'minConfidence', 'provider',
      'providerChain', 'lang', 'region', 'relativeTo', 'signal',
    ];
    if (sequence) allowed.push('waitForEach');
    const result = assertOptions(raw, operation, allowed);
    result.timeout = timeout(result, operation);
    result.polling = polling(result, operation);
    signal(result.signal, operation);
    if (result.waitForEach !== undefined && typeof result.waitForEach !== 'boolean') {
      fail('INVALID_ARGUMENT', operation, 'waitForEach must be a boolean', { phase: 'arguments' });
    }
    return result;
  }
  function readOptions(raw, operation) {
    const result = assertOptions(raw, operation, ['within', 'timeout', 'maxDepth', 'maxNodes', 'region', 'signal']);
    result.timeout = timeout(result, operation);
    signal(result.signal, operation);
    if (result.maxDepth !== undefined && (!Number.isInteger(result.maxDepth) || result.maxDepth < 1 || result.maxDepth > 32)) {
      fail('INVALID_ARGUMENT', operation, 'maxDepth must be an integer from 1 to 32', { phase: 'arguments' });
    }
    if (result.maxNodes !== undefined && (!Number.isInteger(result.maxNodes) || result.maxNodes < 1 || result.maxNodes > 5000)) {
      fail('INVALID_ARGUMENT', operation, 'maxNodes must be an integer from 1 to 5000', { phase: 'arguments' });
    }
    return result;
  }
  function normalized(value, options) {
    let out = String(value == null ? '' : value);
    if (options.normalizeWhitespace !== false) out = out.replace(/\s+/g, ' ').trim();
    if (options.caseSensitive !== true) out = out.toLocaleLowerCase();
    return out;
  }
  function matches(query, value, options) {
    if (query instanceof RegExp) {
      query.lastIndex = 0;
      return query.test(String(value == null ? '' : value));
    }
    const expected = normalized(query, options);
    const actual = normalized(value, options);
    const mode = options.match || 'exact';
    if (mode === 'exact') return actual === expected;
    if (mode === 'contains') return actual.indexOf(expected) >= 0;
    if (mode === 'startsWith') return actual.indexOf(expected) === 0;
    return actual.endsWith(expected);
  }
  function identity(win) {
    return {
      id: win && win.id,
      pid: win && (win.pid === undefined ? win.processId : win.pid),
      handle: win && win.handle,
      title: win && win.title,
      x: win && win.x,
      y: win && win.y,
      width: win && win.width,
      height: win && win.height,
      exeName: win && win.exeName,
    };
  }
  function validWindow(win) {
    return !!win && typeof win.id === 'string' && win.id.length > 0 &&
      finite(win.x) && finite(win.y) && finite(win.width) && finite(win.height) &&
      win.width > 0 && win.height > 0;
  }
  function sameWindow(left, right, requireBounds) {
    if (!left || !right || left.id !== right.id || left.pid !== right.pid || left.title !== right.title) return false;
    if (left.handle && right.handle && left.handle !== right.handle) return false;
    return !requireBounds || (left.x === right.x && left.y === right.y && left.width === right.width && left.height === right.height);
  }
  async function activeWindow(operation) {
    if (!g.window || typeof g.window.getActiveWindow !== 'function') {
      fail('NOT_SUPPORTED', operation, 'active window observation is unavailable', { phase: 'capability' });
    }
    let value;
    try { value = await g.window.getActiveWindow(); }
    catch (caught) { throw caught && caught.code ? caught : error('STALE_TARGET', operation, 'could not read active window'); }
    if (!validWindow(value)) fail('STALE_TARGET', operation, 'active window has no resolved identity');
    return value;
  }
  async function currentWindow(expected, operation, requireBounds) {
    const current = await activeWindow(operation);
    if (!sameWindow(identity(expected), identity(current), requireBounds)) {
      fail('STALE_TARGET', operation, 'target window changed while resolving the candidate');
    }
    return current;
  }
  function bounds(value) {
    if (!value || !finite(value.x) || !finite(value.y) || !finite(value.width) || !finite(value.height) ||
        value.width <= 0 || value.height <= 0) return null;
    return { x: value.x, y: value.y, width: value.width, height: value.height, coordinateSpace: 'screen' };
  }
  function center(value) {
    return {
      x: Math.floor(value.x + value.width / 2),
      y: Math.floor(value.y + value.height / 2),
      coordinateSpace: 'screen',
    };
  }
  function contains(outer, inner) {
    return !!outer && !!inner && inner.x >= outer.x && inner.y >= outer.y &&
      inner.x + inner.width <= outer.x + outer.width && inner.y + inner.height <= outer.y + outer.height;
  }
  function pointInside(point, value) {
    return !!point && !!value && finite(point.x) && finite(point.y) &&
      point.x >= value.x && point.x <= value.x + value.width &&
      point.y >= value.y && point.y <= value.y + value.height;
  }
  function candidate(source, text, value, win, extra) {
    const rect = bounds(value);
    if (!rect || !contains({ x: win.x, y: win.y, width: win.width, height: win.height }, rect)) return null;
    const result = {
      source: source,
      text: String(text),
      normalizedText: String(text).replace(/\s+/g, ' ').trim(),
      bounds: rect,
      center: center(rect),
      window: identity(win),
      observedAt: Date.now(),
      actionable: false,
    };
    if (extra) Object.keys(extra).forEach(function (key) { if (extra[key] !== undefined) result[key] = extra[key]; });
    return result;
  }
  function sourceRank(value) {
    if (value.source === 'accessibility') return 0;
    if (value.source === 'ocr') return 1;
    return 2;
  }
  function iou(left, right) {
    const x = Math.max(left.x, right.x), y = Math.max(left.y, right.y);
    const farX = Math.min(left.x + left.width, right.x + right.width);
    const farY = Math.min(left.y + left.height, right.y + right.height);
    if (farX <= x || farY <= y) return 0;
    const shared = (farX - x) * (farY - y);
    return shared / (left.width * left.height + right.width * right.height - shared);
  }
  function compatible(left, right) {
    if (left.source === right.source) return false;
    if (left.normalizedText !== right.normalizedText || !sameWindow(left.window, right.window, false)) return false;
    const dx = Math.abs(left.center.x - right.center.x), dy = Math.abs(left.center.y - right.center.y);
    return iou(left.bounds, right.bounds) >= 0.15 ||
      (dx <= Math.max(12, Math.min(left.bounds.width, right.bounds.width)) &&
       dy <= Math.max(12, Math.min(left.bounds.height, right.bounds.height)));
  }
  function fuse(rows) {
    const groups = [];
    rows.forEach(function (row) {
      let target = null;
      for (let index = 0; index < groups.length; index += 1) {
        if (groups[index].some(function (member) { return compatible(member, row); })) { target = groups[index]; break; }
      }
      if (target) target.push(row); else groups.push([row]);
    });
    return groups.map(function (group) {
      const sorted = group.slice().sort(function (left, right) { return sourceRank(left) - sourceRank(right); });
      const primary = copy(sorted[0]);
      primary.sources = sorted.map(function (item) { return item.source; });
      primary.actionable = sorted.some(function (item) { return item.actionable === true; });
      for (let index = 0; index < sorted.length; index += 1) {
        if (sorted[index].selector) primary.selector = sorted[index].selector;
        if (sorted[index].provenance) primary.provenance = sorted[index].provenance;
      }
      return primary;
    });
  }
  function unique(rows, operation) {
    if (rows.length === 0) return null;
    if (rows.length !== 1) {
      fail('AMBIGUOUS_TARGET', operation, 'multiple distinct perception candidates match the target', {
        candidateCount: rows.length,
        candidates: rows.map(function (item) { return { source: item.source, text: item.text, bounds: item.bounds }; }),
      });
    }
    return rows[0];
  }
  function availability() {
    const A = g.Accessibility;
    if (!A || typeof A.snapshot !== 'function') return false;
    if (typeof A.getCapabilities !== 'function') return true;
    try {
      const caps = A.getCapabilities();
      return !caps || caps.available === undefined || caps.available === true ||
        (caps.hostAuthorization && caps.hostAuthorization.enabled === true &&
          caps.implementation && caps.implementation.available === true &&
          caps.permission && caps.permission.granted === true);
    } catch (_) { return false; }
  }
  function accessibilityBounds(node, win) {
    const direct = bounds(node && node.bounds);
    if (direct && contains({ x: win.x, y: win.y, width: win.width, height: win.height }, direct)) return direct;
    // Accessibility publishes nativeBounds only when a platform conversion is
    // unavailable. macOS explicitly labels this particular global, top-left
    // coordinate space; it is the same logical screen space used by WindowInfo
    // and has no scale/axis conversion to guess. Other native coordinate spaces
    // remain unusable for pointer geometry until their native owner exposes a
    // reliable screen `bounds` conversion.
    const native = node && node.nativeBounds;
    if (native && native.coordinateSpace === 'macos-global-display-points-top-left') {
      const converted = bounds(native);
      if (!converted) return null;
      const scope = { x: win.x, y: win.y, width: win.width, height: win.height };
      if (contains(scope, converted)) return converted;
      // WindowInfo and AX frames can differ by one rounded display point at a
      // native window edge. Accept only that bounded representation mismatch,
      // intersect it with the current scope, and reject every larger/outside
      // frame. This never projects a native coordinate across displays.
      const left = Math.max(scope.x, converted.x), top = Math.max(scope.y, converted.y);
      const right = Math.min(scope.x + scope.width, converted.x + converted.width);
      const bottom = Math.min(scope.y + scope.height, converted.y + converted.height);
      const drift = Math.max(left - converted.x, top - converted.y,
        converted.x + converted.width - right, converted.y + converted.height - bottom);
      if (drift <= 2 && right > left && bottom > top) {
        return { x: left, y: top, width: right - left, height: bottom - top, coordinateSpace: 'screen' };
      }
    }
    return null;
  }
  function walk(root, fn) {
    const pending = root ? [root] : [];
    let count = 0;
    while (pending.length) {
      const node = pending.pop();
      if (!node || typeof node !== 'object' || ++count > 5000) break;
      fn(node);
      if (Array.isArray(node.children)) for (let index = 0; index < node.children.length; index += 1) pending.push(node.children[index]);
    }
  }
  async function observeAccessibility(query, options, win, operation) {
    if (!availability()) return { status: 'unavailable', candidates: [] };
    const request = {
      within: win,
      timeout: Math.min(30000, options.timeout),
      maxDepth: options.maxDepth === undefined ? 32 : options.maxDepth,
      maxNodes: options.maxNodes === undefined ? 5000 : options.maxNodes,
      properties: ['role', 'name', 'identifier', 'enabled', 'actions', 'bounds', 'nativeBounds', 'value'],
    };
    try {
      const snapshot = await g.Accessibility.snapshot(request);
      if (!snapshot || snapshot.complete !== true || snapshot.truncated === true) {
        return { status: 'failed', candidates: [], failure: error('SEARCH_INCOMPLETE', operation,
          'Accessibility observation did not prove a complete search') };
      }
      const rows = [];
      walk(snapshot.root, function (node) {
        const text = typeof node.name === 'string' && node.name.length ? node.name : node.value;
        if ((typeof text !== 'string' && typeof text !== 'number') || !matches(query, text, options)) return;
        const rect = accessibilityBounds(node, win);
        if (!rect) return;
        const selector = {};
        if (typeof node.role === 'string' && node.role) selector.role = node.role;
        if (typeof node.name === 'string' && node.name) selector.name = node.name;
        if (typeof node.identifier === 'string' && node.identifier) selector.identifier = node.identifier;
        const actions = Array.isArray(node.actions) ? node.actions : [];
        const row = candidate('accessibility', text, rect, win, {
          role: node.role, name: node.name, identifier: node.identifier,
          selector: Object.keys(selector).length ? selector : undefined,
          actionable: node.enabled !== false && actions.indexOf('invoke') >= 0 && Object.keys(selector).length > 0,
          backend: snapshot.backend,
        });
        if (row) rows.push(row);
      });
      return { status: 'ok', candidates: rows };
    } catch (caught) {
      if (caught && caught.code === 'CANCELED') throw caught;
      return { status: 'failed', candidates: [], failure: caught && caught.code ? caught :
        error('BACKEND_FAILED', operation, 'Accessibility observation failed') };
    }
  }
  function isVLMEnabled(options) {
    if (options.region !== undefined || options.relativeTo !== undefined) return false;
    const bridge = g.DesktopVision;
    if (!bridge || typeof bridge.observe !== 'function' || typeof bridge.getCapabilities !== 'function') return false;
    try {
      const caps = bridge.getCapabilities();
      return !!caps && caps.policyAllowed === true && caps.configured === true && caps.sharedMultimodal === true;
    } catch (_) { return false; }
  }
  async function observeVLM(query, options, win, operation) {
    const bridge = g.DesktopVision;
    if (!g.page || typeof g.page.screenshot !== 'function') {
      throw error('NOT_SUPPORTED', operation, 'screen capture is unavailable for approved VLM observation', { phase: 'capability' });
    }
    const capturedAt = Date.now();
    let image;
    try {
      image = await g.page.screenshot({ target: 'screen', clip: {
        x: win.x, y: win.y, width: win.width, height: win.height,
      }, returnType: 'base64' });
    } catch (_) {
      throw error('SCREENSHOT_FAILED', operation, 'could not capture the approved window for VLM observation');
    }
    if (typeof image !== 'string' || !image.length) {
      throw error('SCREENSHOT_FAILED', operation, 'approved VLM capture returned no image');
    }
    let result;
    try {
      result = await bridge.observe({
        image: image,
        app: typeof win.exeName === 'string' ? win.exeName : '',
        targetText: typeof query === 'string' ? query : '',
        purpose: 'ui-perception-resolver',
        capturedAtMs: capturedAt,
        timeoutMs: Math.min(options.timeout, 30000),
      });
    } catch (caught) {
      if (caught && caught.code === 'TIMEOUT') throw caught;
      throw error('VLM_FAILED', operation, 'approved VLM observation failed', { cause: caught && caught.message ? caught.message : '' });
    }
    if (Date.now() - capturedAt > MAX_VLM_AGE_MS) {
      throw error('STALE_TARGET', operation, 'VLM observation exceeded the screenshot freshness limit');
    }
    await currentWindow(win, operation, true);
    const perception = result && result.perception;
    if (!perception || !Array.isArray(perception.elements) || !perception.image ||
        !Array.isArray(perception.window && perception.window.bounds_screen)) {
      throw error('VLM_INVALID_RESPONSE', operation, 'VLM response has no valid perception schema');
    }
    const rows = [];
    for (let index = 0; index < perception.elements.length; index += 1) {
      const element = perception.elements[index];
      if (!element || typeof element.text !== 'string' || !matches(query, element.text, options)) continue;
      const box = element.bbox_norm;
      if (!Array.isArray(box) || box.length !== 4 || !box.every(finite) ||
          box.some(function (value) { return value < 0 || value > 1; }) || box[2] <= box[0] || box[3] <= box[1]) {
        throw error('VLM_INVALID_RESPONSE', operation, 'VLM returned an invalid normalized bounding box');
      }
      const rect = {
        x: win.x + box[0] * win.width,
        y: win.y + box[1] * win.height,
        width: (box[2] - box[0]) * win.width,
        height: (box[3] - box[1]) * win.height,
        coordinateSpace: 'screen',
      };
      let point = center(rect);
      if (Array.isArray(element.center_window) && element.center_window.length === 2 && element.center_window.every(finite)) {
        point = { x: win.x + element.center_window[0], y: win.y + element.center_window[1], coordinateSpace: 'screen' };
      }
      if (!pointInside(point, rect) || !contains({ x: win.x, y: win.y, width: win.width, height: win.height }, rect)) {
        throw error('VLM_INVALID_RESPONSE', operation, 'VLM target center or bounds are outside the approved window');
      }
      const row = candidate('vlm', element.text, rect, win, {
        role: typeof element.role === 'string' ? element.role : undefined,
        actionable: element.actionable === true,
        center: point,
        provenance: { capturedAt: capturedAt, imageHash: perception.image.hash || '', transport: result.transport || 'desktopvision' },
      });
      if (row) { row.center = point; rows.push(row); }
    }
    return rows;
  }
  function localOptions(options, win) {
    const result = {};
    ['index', 'timeout', 'polling', 'click', 'intervalMs', 'match', 'caseSensitive',
      'normalizeWhitespace', 'minConfidence', 'provider', 'providerChain', 'lang', 'region', 'relativeTo'].forEach(function (key) {
      if (options[key] !== undefined) result[key] = options[key];
    });
    result.within = win;
    return result;
  }
  function normalizedOCR(rows, win) {
    return (rows || []).map(function (row) {
      if (!row || typeof row.text !== 'string') return null;
      return candidate('ocr', row.text, row.bounds, win, {
        confidence: row.confidence, provider: row.provider, imageBounds: row.imageBounds,
      });
    }).filter(function (row) { return row !== null; });
  }
  function advanced(options) {
    return options.region !== undefined || options.relativeTo !== undefined || options.index !== undefined;
  }
  function nonWindowScope(options) {
    return options.within !== undefined && !validWindow(options.within);
  }
  async function observeText(query, rawOptions, operation) {
    const options = textOptions(rawOptions, operation, false);
    checkCanceled(signal(options.signal, operation), operation);
    // Positioned/relative contracts already have a same-frame anchor protocol
    // in 006-ui.js. Preserve that stronger contract until a shared multi-source
    // region provenance contract is available.
    if (advanced(options) || nonWindowScope(options)) {
      if (nonWindowScope(options)) {
        const direct = await base.findTexts(query, localOptions(options, options.within));
        return { options: options, window: null, candidates: direct, failures: [] };
      }
      const win = options.within || await activeWindow(operation);
      const direct = await base.findTexts(query, localOptions(options, win));
      return { options: options, window: win, candidates: direct, failures: [] };
    }
    const win = options.within === undefined ? await activeWindow(operation) : options.within;
    if (!validWindow(win)) fail('STALE_TARGET', operation, 'within must be a resolved window');
    const local = localOptions(options, win);
    const failures = [];
    let ocr = [];
    try { ocr = normalizedOCR(await base.findTexts(query, local), win); }
    catch (caught) { failures.push(caught && caught.code ? caught : error('OCR_FAILED', operation, 'native OCR observation failed')); }
    checkCanceled(signal(options.signal, operation), operation);
    const ax = await observeAccessibility(query, options, win, operation);
    if (ax.failure) failures.push(ax.failure);
    const fused = fuse([].concat(ocr || [], ax.candidates || []));
    if (fused.length) return { options: options, window: win, candidates: fused, failures: failures };
    if (isVLMEnabled(options) && typeof query === 'string') {
      const vlm = await observeVLM(query, options, win, operation);
      const resolved = fuse(vlm);
      if (resolved.length) return { options: options, window: win, candidates: resolved, failures: failures };
    }
    if (failures.length) throw failures[0];
    return { options: options, window: win, candidates: [], failures: [] };
  }
  async function resolveText(query, rawOptions, operation) {
    const observed = await observeText(query, rawOptions, operation);
    const result = unique(observed.candidates, operation);
    if (!result) fail('TARGET_NOT_FOUND', operation, 'target was not found in the visible scope');
    return { candidate: result, observed: observed };
  }
  async function sendInput(resolution, rawOptions, operation) {
    const observed = resolution.observed;
    const candidateValue = resolution.candidate;
    const win = await currentWindow(observed.window, operation, candidateValue.source === 'vlm');
    checkCanceled(signal(observed.options.signal, operation), operation);
    if (candidateValue.selector && candidateValue.actionable === true) {
      // Accessibility remains the native input owner. Its own actionState is
      // terminal: failures never fall through to mouse/VLM/OCR replay.
      const result = await base.tapTargets([candidateValue.selector], {
        within: win, timeout: Math.min(observed.options.timeout, 30000), polling: Math.min(observed.options.polling, 10000), intervalMs: 0,
      });
      const completed = result && Array.isArray(result.completed) ? result.completed[0] : null;
      return {
        ok: true, action: 'tapText', target: candidateValue,
        backend: 'accessibility', point: candidateValue.center,
        actionState: completed && completed.actionState ? completed.actionState : 'acknowledged',
      };
    }
    await currentWindow(observed.window, operation, candidateValue.source === 'vlm');
    try {
      await g.mouse.clickPoint(candidateValue.center, observed.options.click);
    } catch (caught) {
      const result = caught && caught.code ? caught : error('BACKEND_FAILED', operation, 'mouse input could not be sent');
      result.operation = operation;
      if (!result.actionState || result.actionState === 'not_started') result.actionState = 'unknown';
      throw result;
    }
    return { ok: true, action: 'tapText', target: candidateValue, point: candidateValue.center };
  }
  async function wait(milliseconds, operation, value) {
    if (milliseconds <= 0) return;
    checkCanceled(value, operation);
    if (g.page && typeof g.page.waitForTimeout === 'function') {
      await g.page.waitForTimeout(milliseconds, value ? { signal: value } : undefined);
      checkCanceled(value, operation);
      return;
    }
    await new Promise(function (resolve) { g.setTimeout(resolve, milliseconds); });
    checkCanceled(value, operation);
  }
  function tapSequenceError(caught, operation, index, text, phase, completed) {
    const result = new Error(caught && caught.message ? caught.message : 'text activation failed');
    result.code = caught && caught.code ? caught.code : 'BACKEND_FAILED';
    result.operation = operation;
    result.failedIndex = index;
    result.failedText = text;
    result.failedPhase = phase;
    result.completed = completed.slice();
    result.cause = caught;
    result.actionState = caught && caught.actionState ? caught.actionState : (phase === 'input' ? 'unknown' : 'not_started');
    return result;
  }
  async function tapTexts(texts, rawOptions) {
    const operation = 'UI.tapTexts';
    const sequence = Array.isArray(texts) ? Array.from(texts) : null;
    if (!sequence || !sequence.length || sequence.some(function (value) { return typeof value !== 'string' || !value.length; })) {
      fail('INVALID_ARGUMENT', operation, 'texts must be a non-empty string array', { phase: 'arguments' });
    }
    const options = textOptions(rawOptions, operation, true);
    const each = options.waitForEach === undefined ? true : options.waitForEach;
    const interval = options.intervalMs === undefined ? 300 : options.intervalMs;
    if (!Number.isInteger(interval) || interval < 0 || interval > 86400000) {
      fail('INVALID_ARGUMENT', operation, 'intervalMs must be an integer from 0 to 86400000', { phase: 'arguments' });
    }
    const completed = [];
    let pinned = options.within;
    for (let index = 0; index < sequence.length; index += 1) {
      let phase = 'interval';
      try {
        if (index > 0) await wait(interval, operation, signal(options.signal, operation));
        const deadline = Date.now() + options.timeout;
        let resolution = null;
        phase = 'locate';
        while (!resolution) {
          checkCanceled(signal(options.signal, operation), operation);
          const stepOptions = copy(options);
          stepOptions.within = pinned === undefined ? undefined : pinned;
          try {
            resolution = await resolveText(sequence[index], stepOptions, operation);
            if (pinned === undefined) pinned = resolution.observed.window;
            else if (!sameWindow(identity(pinned), identity(resolution.observed.window), false)) {
              fail('STALE_TARGET', operation, 'sequence window identity changed');
            }
          } catch (caught) {
            if (!each || !caught || caught.code !== 'TARGET_NOT_FOUND') throw caught;
            if (Date.now() >= deadline) fail('TIMEOUT', operation, 'timed out waiting for the next text target', { timeout: options.timeout });
            await wait(Math.min(options.polling, Math.max(1, deadline - Date.now())), operation, signal(options.signal, operation));
          }
        }
        phase = 'input';
        const sent = await sendInput(resolution, options, operation);
        completed.push(sent);
      } catch (caught) {
        throw tapSequenceError(caught, operation, index, sequence[index], phase, completed);
      }
    }
    return { ok: true, action: 'tapTexts', completed: completed };
  }
  function readRegion(options, win, operation) {
    if (options.region === undefined) return { x: win.x, y: win.y, width: win.width, height: win.height, coordinateSpace: 'screen' };
    const region = bounds(options.region);
    if (!region || !contains({ x: win.x, y: win.y, width: win.width, height: win.height }, region)) {
      fail('INVALID_ARGUMENT', operation, 'region must be a non-empty screen region within the resolved window', { phase: 'arguments' });
    }
    return region;
  }
  async function readText(rawOptions) {
    const operation = 'UI.readText';
    const options = readOptions(rawOptions, operation);
    checkCanceled(signal(options.signal, operation), operation);
    const win = options.within === undefined ? await activeWindow(operation) : options.within;
    if (!validWindow(win)) fail('STALE_TARGET', operation, 'within must be a resolved window');
    const region = readRegion(options, win, operation);
    let nativeFailure = null;
    if (availability()) {
      try {
        const snapshot = await g.Accessibility.snapshot({
          within: win, timeout: Math.min(options.timeout, 30000),
          maxDepth: options.maxDepth === undefined ? 32 : options.maxDepth,
          maxNodes: options.maxNodes === undefined ? 5000 : options.maxNodes,
          properties: ['name', 'value', 'bounds', 'nativeBounds'],
        });
        if (!snapshot || snapshot.complete !== true || snapshot.truncated === true) {
          nativeFailure = error('SEARCH_INCOMPLETE', operation, 'Accessibility read did not prove a complete observation');
        } else {
          const values = [];
          walk(snapshot.root, function (node) {
            if (node && (typeof node.value === 'string' || typeof node.value === 'number') && String(node.value).trim()) {
              const rect = accessibilityBounds(node, win);
              if (rect && contains(region, rect)) values.push(String(node.value));
            }
          });
          const uniqueValues = values.filter(function (value, index) { return values.indexOf(value) === index; });
          if (uniqueValues.length === 1) return uniqueValues[0];
          if (uniqueValues.length > 1) {
            fail('AMBIGUOUS_TARGET', operation, 'multiple readable native values are inside the requested scope', { candidateCount: uniqueValues.length });
          }
        }
      } catch (caught) {
        if (caught && caught.code === 'AMBIGUOUS_TARGET') throw caught;
        nativeFailure = caught && caught.code ? caught : error('BACKEND_FAILED', operation, 'Accessibility read failed');
      }
    }
    if (!g.page || typeof g.page.screenshot !== 'function' || !g.Vision || typeof g.Vision.runOCR !== 'function') {
      if (nativeFailure) throw nativeFailure;
      fail('NOT_SUPPORTED', operation, 'no local text observation source is available', { phase: 'capability' });
    }
    let image;
    try { image = await g.page.screenshot({ target: 'screen', clip: region, returnType: 'base64' }); }
    catch (_) { fail('SCREENSHOT_FAILED', operation, 'could not capture the requested read scope'); }
    let result;
    try { result = await g.Vision.runOCR({ image: image, timeoutMs: Math.min(options.timeout, 30000) }); }
    catch (caught) { throw caught && caught.code ? caught : error('OCR_FAILED', operation, 'local OCR read failed'); }
    await currentWindow(win, operation, false);
    const lines = result && Array.isArray(result.lines) ? result.lines.filter(function (line) {
      return line && typeof line.text === 'string' && line.text.trim();
    }) : [];
    if (!lines.length) {
      if (nativeFailure) throw nativeFailure;
      fail('TARGET_NOT_FOUND', operation, 'no readable text exists in the requested scope');
    }
    lines.sort(function (left, right) {
      const ly = left.bbox && finite(left.bbox.y) ? left.bbox.y : 0;
      const ry = right.bbox && finite(right.bbox.y) ? right.bbox.y : 0;
      if (ly !== ry) return ly - ry;
      const lx = left.bbox && finite(left.bbox.x) ? left.bbox.x : 0;
      const rx = right.bbox && finite(right.bbox.x) ? right.bbox.x : 0;
      return lx - rx;
    });
    return lines.map(function (line) { return line.text; }).join('\n');
  }

  UI.getCapabilities = function () {
    const result = base.getCapabilities() || {};
    let cloud = { available: false, policyAllowed: false, configured: false };
    if (g.DesktopVision && typeof g.DesktopVision.getCapabilities === 'function') {
      try { cloud = g.DesktopVision.getCapabilities() || cloud; } catch (_) { /* capability diagnostics stay non-throwing */ }
    }
    result.perception = {
      resolver: true,
      sources: { accessibility: availability(), ocr: true, image: true,
        vlm: cloud.configured === true && cloud.sharedMultimodal === true },
      cloudVisual: { policyAllowed: cloud.policyAllowed === true, configured: cloud.configured === true,
        sharedMultimodal: cloud.sharedMultimodal === true, defaultEnabled: false,
        automaticFallback: cloud.sharedMultimodal === true ? 'policy-gated' : 'not-enabled-until-shared-multimodal-transport' },
    };
    return result;
  };
  UI.findTexts = async function (query, options) {
    const checked = textOptions(options, 'UI.findTexts', false);
    if (advanced(checked) || nonWindowScope(checked)) return base.findTexts(query, options);
    return (await observeText(query, checked, 'UI.findTexts')).candidates;
  };
  UI.findText = async function (query, options) {
    const checked = textOptions(options, 'UI.findText', false);
    if (advanced(checked) || nonWindowScope(checked)) return base.findText(query, options);
    // Keep the established observation contract: a successful search with no
    // local candidate is null. Provider failures and ambiguity remain errors;
    // only an action converts a no-match into TARGET_NOT_FOUND.
    return unique((await observeText(query, checked, 'UI.findText')).candidates, 'UI.findText');
  };
  UI.hasText = async function (query, options) {
    const checked = textOptions(options, 'UI.hasText', false);
    if (advanced(checked) || nonWindowScope(checked)) return base.hasText(query, options);
    return (await observeText(query, checked, 'UI.hasText')).candidates.length > 0;
  };
  UI.tapText = async function (query, options) {
    const checked = textOptions(options, 'UI.tapText', false);
    if (advanced(checked) || nonWindowScope(checked)) return base.tapText(query, options);
    const resolution = await resolveText(query, checked, 'UI.tapText');
    return sendInput(resolution, checked, 'UI.tapText');
  };
  UI.tapTexts = async function (texts, options) {
    const checked = textOptions(options, 'UI.tapTexts', true);
    if (advanced(checked) || nonWindowScope(checked)) return base.tapTexts(texts, options);
    return tapTexts(texts, checked);
  };
  UI.tapTargets = async function (targets, options) {
    // Strings are ordinary text intentions and therefore use the same resolver.
    // Flat semantic selectors retain Accessibility as their sole safe native owner.
    if (Array.isArray(targets) && targets.length && targets.every(function (target) {
      return typeof target === 'string' || (plain(target) && Object.keys(target).length === 1 && typeof target.text === 'string');
    })) {
      return tapTexts(targets.map(function (target) { return typeof target === 'string' ? target : target.text; }), options);
    }
    return base.tapTargets(targets, options);
  };
  UI.waitText = async function (query, rawOptions) {
    const operation = 'UI.waitText';
    const options = textOptions(rawOptions, operation, false);
    if (advanced(options) || nonWindowScope(options)) return base.waitText(query, rawOptions);
    const deadline = Date.now() + options.timeout;
    while (true) {
      checkCanceled(signal(options.signal, operation), operation);
      try { return (await resolveText(query, options, operation)).candidate; }
      catch (caught) {
        if (!caught || caught.code !== 'TARGET_NOT_FOUND') throw caught;
        if (Date.now() >= deadline) fail('TIMEOUT', operation, 'timed out waiting for text to appear', { timeout: options.timeout });
      }
      await wait(Math.min(options.polling, Math.max(1, deadline - Date.now())), operation, signal(options.signal, operation));
    }
  };
  UI.waitTextGone = async function (query, rawOptions) {
    const operation = 'UI.waitTextGone';
    const options = textOptions(rawOptions, operation, false);
    if (advanced(options) || nonWindowScope(options)) return base.waitTextGone(query, rawOptions);
    const deadline = Date.now() + options.timeout;
    while (true) {
      checkCanceled(signal(options.signal, operation), operation);
      try {
        const observed = await observeText(query, options, operation);
        if (!observed.candidates.length) return true;
      } catch (caught) {
        if (!caught || caught.code !== 'TARGET_NOT_FOUND') throw caught;
        return true;
      }
      if (Date.now() >= deadline) fail('TIMEOUT', operation, 'timed out waiting for text to disappear', { timeout: options.timeout });
      await wait(Math.min(options.polling, Math.max(1, deadline - Date.now())), operation, signal(options.signal, operation));
    }
  };
  UI.readText = readText;
  Object.defineProperty(UI, '__perceptionResolverInstalled', { value: true, enumerable: false });
})(globalThis);
