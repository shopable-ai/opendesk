// High-level desktop UI helpers. Each operation captures a fresh screen scope,
// maps image pixels back to desktop logical coordinates, and then reuses the
// existing mouse input primitive. It deliberately does not create a new native
// runtime, provider framework, or accessibility abstraction.
(function (global) {
  'use strict';

  const DEFAULT_TIMEOUT = 10000;
  const DEFAULT_POLLING = 200;
  const DISPLAY_SCALE_EPSILON = 0.01;

  function fail(code, operation, message, details) {
    const error = new Error(message);
    error.code = code;
    error.operation = operation;
    if (details && typeof details === 'object') {
      for (const key of Object.keys(details)) error[key] = details[key];
    }
    throw error;
  }

  function errorSummary(error) {
    if (!error) return null;
    return {
      code: error.code || 'ERROR',
      operation: error.operation || undefined,
      message: String(error.message || error),
    };
  }

  function isFiniteNumber(value) {
    return typeof value === 'number' && Number.isFinite(value);
  }

  function requireFinite(value, name, operation) {
    if (!isFiniteNumber(value)) fail('INVALID_ARGUMENT', operation, name + ' must be a finite number');
    return value;
  }

  function requirePositive(value, name, operation) {
    requireFinite(value, name, operation);
    if (value <= 0) fail('INVALID_ARGUMENT', operation, name + ' must be greater than 0');
    return value;
  }

  function requireObject(value, name, operation) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      fail('INVALID_ARGUMENT', operation, name + ' must be an object');
    }
    return value;
  }

  function screenRegion(raw, operation) {
    requireObject(raw, 'region', operation);
    const region = {
      x: requireFinite(raw.x, 'region.x', operation),
      y: requireFinite(raw.y, 'region.y', operation),
      width: requirePositive(raw.width, 'region.width', operation),
      height: requirePositive(raw.height, 'region.height', operation),
      coordinateSpace: 'screen',
    };
    return region;
  }

  function isWindowInfo(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value) &&
      typeof value.id === 'string' && typeof value.title === 'string' &&
      (isFiniteNumber(value.pid) || isFiniteNumber(value.processId) || isFiniteNumber(value.processID)) &&
      isFiniteNumber(value.x) && isFiniteNumber(value.y) &&
      isFiniteNumber(value.width) && value.width > 0 &&
      isFiniteNumber(value.height) && value.height > 0;
  }

  function normalizeWhitespace(value) {
    return String(value).trim().replace(/\s+/g, ' ');
  }

  function normalizeText(value, options) {
    let normalized = String(value == null ? '' : value);
    if (options.normalizeWhitespace) normalized = normalizeWhitespace(normalized);
    if (!options.caseSensitive) normalized = normalized.toLowerCase();
    return normalized;
  }

  function validateText(text, operation) {
    if (typeof text !== 'string' || text.length === 0) {
      fail('INVALID_ARGUMENT', operation, 'text must be a non-empty string');
    }
    return text;
  }

  function validateIndex(value, operation) {
    if (value === undefined) return undefined;
    if (!Number.isInteger(value) || value < 0) {
      fail('INVALID_ARGUMENT', operation, 'index must be a non-negative integer');
    }
    return value;
  }

  function validateOptionalBoolean(value, name, operation) {
    if (value !== undefined && typeof value !== 'boolean') {
      fail('INVALID_ARGUMENT', operation, name + ' must be a boolean');
    }
  }

  function validateOptions(rawOptions, operation, kind) {
    const raw = rawOptions === undefined ? {} : requireObject(rawOptions, 'options', operation);
    const options = {
      within: raw.within,
      index: validateIndex(raw.index, operation),
      timeout: raw.timeout === undefined ? DEFAULT_TIMEOUT : requirePositive(raw.timeout, 'timeout', operation),
      polling: raw.polling === undefined ? DEFAULT_POLLING : requirePositive(raw.polling, 'polling', operation),
      click: raw.click,
      intervalMs: raw.intervalMs === undefined ? 0 : requireFinite(raw.intervalMs, 'intervalMs', operation),
    };
    if (options.intervalMs < 0) fail('INVALID_ARGUMENT', operation, 'intervalMs must be greater than or equal to 0');

    if (kind === 'text') {
      options.match = raw.match === undefined ? 'exact' : raw.match;
      if (options.match !== 'exact' && options.match !== 'contains') {
        fail('INVALID_ARGUMENT', operation, 'match must be "exact" or "contains"');
      }
      options.caseSensitive = raw.caseSensitive === undefined ? false : raw.caseSensitive;
      options.normalizeWhitespace = raw.normalizeWhitespace === undefined ? true : raw.normalizeWhitespace;
      validateOptionalBoolean(options.caseSensitive, 'caseSensitive', operation);
      validateOptionalBoolean(options.normalizeWhitespace, 'normalizeWhitespace', operation);
      options.minConfidence = raw.minConfidence;
      if (options.minConfidence !== undefined) requireFinite(options.minConfidence, 'minConfidence', operation);
      options.provider = raw.provider;
      if (options.provider !== undefined && typeof options.provider !== 'string') {
        fail('INVALID_ARGUMENT', operation, 'provider must be a string');
      }
      options.providerChain = raw.providerChain;
      if (options.providerChain !== undefined && (!Array.isArray(options.providerChain) || options.providerChain.some(function (item) { return typeof item !== 'string'; }))) {
        fail('INVALID_ARGUMENT', operation, 'providerChain must be a string array');
      }
      options.lang = raw.lang;
      if (options.lang !== undefined && typeof options.lang !== 'string') {
        fail('INVALID_ARGUMENT', operation, 'lang must be a string');
      }
    } else {
      options.threshold = raw.threshold;
      if (options.threshold !== undefined) {
        requireFinite(options.threshold, 'threshold', operation);
        if (options.threshold < 0 || options.threshold > 1) {
          fail('INVALID_ARGUMENT', operation, 'threshold must be between 0 and 1');
        }
      }
      options.scales = raw.scales;
      if (options.scales !== undefined && (!Array.isArray(options.scales) || options.scales.length === 0)) {
        fail('INVALID_ARGUMENT', operation, 'scales must be a non-empty number array');
      }
      if (options.scales) {
        for (const scale of options.scales) requirePositive(scale, 'scales[]', operation);
      }
      options.maxResults = raw.maxResults;
      if (options.maxResults !== undefined && (!Number.isInteger(options.maxResults) || options.maxResults <= 0)) {
        fail('INVALID_ARGUMENT', operation, 'maxResults must be a positive integer');
      }
    }
    return options;
  }

  function identitySnapshot(win) {
    const pid = isFiniteNumber(win.pid) ? win.pid : (isFiniteNumber(win.processId) ? win.processId : win.processID);
    return {
      id: win.id,
      pid: pid,
      handle: isFiniteNumber(win.handle) && win.handle !== 0 ? win.handle : null,
      title: win.title,
      bounds: { x: win.x, y: win.y, width: win.width, height: win.height },
    };
  }

  function sameIdentity(before, after) {
    if (!before || !after) return false;
    if (before.id !== after.id || before.pid !== after.pid || before.title !== after.title) return false;
    return before.handle === null || after.handle === null || before.handle === after.handle;
  }

  function sameBounds(before, after) {
    return before.x === after.x && before.y === after.y && before.width === after.width && before.height === after.height;
  }

  async function currentActiveWindow(operation) {
    try {
      const win = await global.window.getActiveWindow();
      if (!isWindowInfo(win)) {
        fail('STALE_TARGET', operation, 'active window is unavailable or has invalid bounds');
      }
      return win;
    } catch (error) {
      if (error && error.code) throw error;
      fail('STALE_TARGET', operation, 'could not read the active window', { cause: errorSummary(error) });
    }
  }

  function displaysForScope(scope, operation) {
    let displays;
    try {
      displays = global.Screen.getDisplays();
    } catch (error) {
      fail('UNSUPPORTED_COORDINATE_MAPPING', operation, 'could not read display metadata', { cause: errorSummary(error) });
    }
    if (!Array.isArray(displays) || displays.length === 0) {
      fail('UNSUPPORTED_COORDINATE_MAPPING', operation, 'display metadata is unavailable');
    }
    const intersecting = [];
    for (const display of displays) {
      let displayRect;
      try {
        displayRect = global.Geometry.rect(display);
      } catch (_) {
        fail('UNSUPPORTED_COORDINATE_MAPPING', operation, 'display metadata has invalid logical bounds');
      }
      if (global.Geometry.intersect(scope, displayRect)) {
        const scale = display.scale;
        if (!isFiniteNumber(scale) || scale <= 0) {
          fail('UNSUPPORTED_COORDINATE_MAPPING', operation, 'display metadata has invalid scale');
        }
        intersecting.push(display);
      }
    }
    if (intersecting.length === 0) {
      fail('TARGET_SCOPE_NOT_VISIBLE', operation, 'target scope does not intersect a visible display');
    }
    const baseScale = intersecting[0].scale;
    if (intersecting.some(function (display) { return Math.abs(display.scale - baseScale) > DISPLAY_SCALE_EPSILON; })) {
      fail('UNSUPPORTED_MIXED_DPI_SCOPE', operation, 'scope spans displays with different effective DPI scales', {
        displayIds: intersecting.map(function (display) { return display.id; }),
      });
    }
    return intersecting;
  }

  async function resolveScope(options, operation, targetOverride) {
    let target = targetOverride;
    if (target === undefined) {
      target = options.within === undefined ? await currentActiveWindow(operation) : options.within;
    }
    let requested;
    try {
      requested = global.Geometry.rect(target);
    } catch (error) {
      fail('INVALID_ARGUMENT', operation, 'within must be a window, display, or Geometry screen region', { cause: errorSummary(error) });
    }
    let virtual;
    try {
      virtual = screenRegion(global.Screen.getVirtualBounds(), operation);
    } catch (error) {
      if (error && error.code) throw error;
      fail('UNSUPPORTED_COORDINATE_MAPPING', operation, 'could not read virtual desktop bounds', { cause: errorSummary(error) });
    }
    const logicalScope = global.Geometry.intersect(requested, virtual);
    if (!logicalScope) {
      fail('TARGET_SCOPE_NOT_VISIBLE', operation, 'target scope is outside the visible virtual desktop');
    }
    const displays = displaysForScope(logicalScope, operation);
    return {
      target: target,
      requestedScope: requested,
      logicalScope: logicalScope,
      displays: displays,
      windowSnapshot: isWindowInfo(target) ? identitySnapshot(target) : null,
    };
  }

  async function captureScope(options, operation, targetOverride) {
    const scope = await resolveScope(options, operation, targetOverride);
    let image;
    try {
      image = await global.page.screenshot({
        target: 'screen',
        clip: {
          x: scope.logicalScope.x,
          y: scope.logicalScope.y,
          width: scope.logicalScope.width,
          height: scope.logicalScope.height,
        },
        returnType: 'base64',
      });
    } catch (error) {
      fail('SCREENSHOT_FAILED', operation, 'failed to capture the target scope', { cause: errorSummary(error) });
    }
    if (typeof image !== 'string' || image.length === 0) {
      fail('SCREENSHOT_FAILED', operation, 'screenshot did not return base64 image data');
    }
    let size;
    try {
      size = global.ImageColor.getSize(image);
    } catch (error) {
      fail('SCREENSHOT_FAILED', operation, 'failed to inspect screenshot dimensions', { cause: errorSummary(error) });
    }
    if (!Array.isArray(size) || size.length < 2) {
      fail('SCREENSHOT_FAILED', operation, 'screenshot dimensions are unavailable');
    }
    if (!isFiniteNumber(size[0]) || size[0] <= 0 || !isFiniteNumber(size[1]) || size[1] <= 0) {
      fail('UNSUPPORTED_COORDINATE_MAPPING', operation, 'screenshot image dimensions must be finite positive values');
    }
    const imageWidth = size[0];
    const imageHeight = size[1];
    const scaleX = imageWidth / scope.logicalScope.width;
    const scaleY = imageHeight / scope.logicalScope.height;
    if (!isFiniteNumber(scaleX) || scaleX <= 0 || !isFiniteNumber(scaleY) || scaleY <= 0) {
      fail('UNSUPPORTED_COORDINATE_MAPPING', operation, 'capture scale is not a finite positive value');
    }
    return {
      scope: scope,
      image: image,
      imageWidth: imageWidth,
      imageHeight: imageHeight,
      scaleX: scaleX,
      scaleY: scaleY,
    };
  }

  function projectImageBounds(bbox, capture, operation) {
    requireObject(bbox, 'bbox', operation);
    const x = requireFinite(bbox.x, 'bbox.x', operation);
    const y = requireFinite(bbox.y, 'bbox.y', operation);
    const width = requirePositive(bbox.width, 'bbox.width', operation);
    const height = requirePositive(bbox.height, 'bbox.height', operation);
    const logical = capture.scope.logicalScope;
    const left = Math.floor(logical.x + x / capture.scaleX);
    const top = Math.floor(logical.y + y / capture.scaleY);
    const right = Math.max(left + 1, Math.ceil(logical.x + (x + width) / capture.scaleX));
    const bottom = Math.max(top + 1, Math.ceil(logical.y + (y + height) / capture.scaleY));
    return {
      x: left,
      y: top,
      width: right - left,
      height: bottom - top,
      coordinateSpace: 'screen',
    };
  }

  function centerOf(bounds) {
    const minX = bounds.x;
    const minY = bounds.y;
    const maxX = bounds.x + bounds.width - 1;
    const maxY = bounds.y + bounds.height - 1;
    return {
      x: Math.max(minX, Math.min(maxX, Math.floor(bounds.x + bounds.width / 2))),
      y: Math.max(minY, Math.min(maxY, Math.floor(bounds.y + bounds.height / 2))),
      coordinateSpace: 'screen',
    };
  }

  function imageBounds(bbox, capture, operation) {
    requireObject(bbox, 'bbox', operation);
    const image = {
      x: requireFinite(bbox.x, 'bbox.x', operation),
      y: requireFinite(bbox.y, 'bbox.y', operation),
      width: requirePositive(bbox.width, 'bbox.width', operation),
      height: requirePositive(bbox.height, 'bbox.height', operation),
      coordinateSpace: 'image',
    };
    if (image.x < 0 || image.y < 0 || image.x + image.width > capture.imageWidth || image.y + image.height > capture.imageHeight) {
      fail('UNSUPPORTED_COORDINATE_MAPPING', operation, 'image bounding box is outside the captured screenshot');
    }
    return image;
  }

  function textMatches(lineText, query, options) {
    const actual = normalizeText(lineText, options);
    const wanted = normalizeText(query, options);
    return options.match === 'exact' ? actual === wanted : actual.indexOf(wanted) >= 0;
  }

  function sortReadingOrder(candidates) {
    return candidates.sort(function (a, b) {
      if (a.bounds.y !== b.bounds.y) return a.bounds.y - b.bounds.y;
      return a.bounds.x - b.bounds.x;
    });
  }

  async function discoverTexts(text, options, operation, targetOverride) {
    const capture = await captureScope(options, operation, targetOverride);
    let result;
    try {
      const request = { image: capture.image };
      if (options.provider !== undefined) request.provider = options.provider;
      if (options.providerChain !== undefined) request.providerChain = options.providerChain;
      if (options.lang !== undefined) request.lang = options.lang;
      result = await global.Vision.runOCR(request);
    } catch (error) {
      fail('OCR_FAILED', operation, 'OCR failed while searching the target scope', { cause: errorSummary(error) });
    }
    if (!result || !Array.isArray(result.lines)) {
      fail('OCR_FAILED', operation, 'OCR result did not contain line candidates');
    }
    const candidates = [];
    for (const line of result.lines) {
      if (!line || typeof line.text !== 'string' || !line.bbox) continue;
      const confidence = isFiniteNumber(line.confidence) ? line.confidence : 0;
      if (options.minConfidence !== undefined && confidence < options.minConfidence) continue;
      if (!textMatches(line.text, text, options)) continue;
      let rawBounds;
      let bounds;
      try {
        rawBounds = imageBounds(line.bbox, capture, operation);
        bounds = projectImageBounds(line.bbox, capture, operation);
      } catch (error) {
        fail('OCR_FAILED', operation, 'OCR returned an invalid image bounding box', { cause: errorSummary(error) });
      }
      candidates.push({
        source: 'ocr',
        text: line.text,
        confidence: confidence,
        provider: typeof result.provider === 'string' ? result.provider : (options.provider || ''),
        imageBounds: rawBounds,
        bounds: bounds,
        center: centerOf(bounds),
      });
    }
    return { capture: capture, candidates: sortReadingOrder(candidates) };
  }

  async function discoverImages(template, options, operation, targetOverride) {
    if (typeof template !== 'string' || template.length === 0) {
      fail('INVALID_ARGUMENT', operation, 'template must be a non-empty string');
    }
    const capture = await captureScope(options, operation, targetOverride);
    let matches;
    try {
      const request = {};
      if (options.threshold !== undefined) request.threshold = options.threshold;
      if (options.scales !== undefined) request.scales = options.scales;
      if (options.maxResults !== undefined) request.maxResults = options.maxResults;
      matches = await global.ImageColor.findImages(capture.image, template, request);
    } catch (error) {
      fail('IMAGE_MATCH_FAILED', operation, 'image template matching failed', { cause: errorSummary(error) });
    }
    if (!Array.isArray(matches)) {
      fail('IMAGE_MATCH_FAILED', operation, 'image template matching did not return candidates');
    }
    const candidates = [];
    for (const match of matches) {
      if (!match || match.found === false) continue;
      let rawBounds;
      let bounds;
      try {
        rawBounds = imageBounds(match, capture, operation);
        bounds = projectImageBounds(match, capture, operation);
      } catch (error) {
        fail('IMAGE_MATCH_FAILED', operation, 'image template matching returned an invalid bounding box', { cause: errorSummary(error) });
      }
      candidates.push({
        source: 'image',
        template: template,
        confidence: isFiniteNumber(match.confidence) ? match.confidence : 0,
        scale: isFiniteNumber(match.scale) ? match.scale : undefined,
        imageBounds: rawBounds,
        bounds: bounds,
        center: centerOf(bounds),
      });
    }
    return { capture: capture, candidates: sortReadingOrder(candidates) };
  }

  function chooseCandidate(candidates, options, operation) {
    if (candidates.length === 0) return null;
    if (options.index !== undefined) {
      if (options.index >= candidates.length) {
        fail('TARGET_NOT_FOUND', operation, 'index is outside the matching candidate list', {
          index: options.index,
          candidateCount: candidates.length,
        });
      }
      return candidates[options.index];
    }
    if (candidates.length > 1) {
      fail('AMBIGUOUS_TARGET', operation, 'multiple visible targets match; narrow within or provide index', {
        candidateCount: candidates.length,
        candidates: candidates,
      });
    }
    return candidates[0];
  }

  async function delay(milliseconds) {
    if (global.page && typeof global.page.waitFor === 'function') {
      await global.page.waitFor(milliseconds);
      return;
    }
    await new Promise(function (resolve) { setTimeout(resolve, milliseconds); });
  }

  async function checkActionScope(capture, operation) {
    if (!capture.scope.windowSnapshot) return { retry: false };
    const current = await currentActiveWindow(operation);
    const currentSnapshot = identitySnapshot(current);
    if (!sameIdentity(capture.scope.windowSnapshot, currentSnapshot)) {
      fail('STALE_TARGET', operation, 'active window identity changed before the input action', {
        expected: capture.scope.windowSnapshot,
        actual: currentSnapshot,
      });
    }
    return { retry: !sameBounds(capture.scope.windowSnapshot.bounds, currentSnapshot.bounds), current: current };
  }

  async function tapWithDiscovery(discover, value, options, operation, action) {
    let override;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const found = await discover(value, options, operation, override);
      const target = chooseCandidate(found.candidates, options, operation);
      if (!target) {
        fail('TARGET_NOT_FOUND', operation, 'target was not found in the visible scope');
      }
      const check = await checkActionScope(found.capture, operation);
      if (check.retry) {
        if (attempt === 0) {
          override = check.current;
          continue;
        }
        fail('STALE_TARGET', operation, 'window bounds changed repeatedly while resolving the target');
      }
      try {
        await global.mouse.clickPoint(target.center, options.click);
      } catch (error) {
        if (error && error.code) throw error;
        fail('STALE_TARGET', operation, 'mouse click could not be sent to the resolved screen point', { cause: errorSummary(error) });
      }
      return { ok: true, action: action, target: target, point: target.center };
    }
    fail('STALE_TARGET', operation, 'window bounds changed while resolving the target');
  }

  const UI = {
    getCapabilities: function () {
      return {
        text: { find: true, tap: true, wait: true, backend: 'Vision.runOCR' },
        image: { find: true, tap: true, backend: 'ImageColor.findImages' },
        accessibility: { available: false, status: 'notImplemented' },
        coordinateMapping: { actualCaptureScale: true, mixedDPIScope: false },
      };
    },

    findTexts: async function (text, rawOptions) {
      const operation = 'UI.findTexts';
      validateText(text, operation);
      const options = validateOptions(rawOptions, operation, 'text');
      return (await discoverTexts(text, options, operation)).candidates;
    },

    findText: async function (text, rawOptions) {
      const operation = 'UI.findText';
      validateText(text, operation);
      const options = validateOptions(rawOptions, operation, 'text');
      const found = await discoverTexts(text, options, operation);
      return chooseCandidate(found.candidates, options, operation);
    },

    hasText: async function (text, rawOptions) {
      const operation = 'UI.hasText';
      validateText(text, operation);
      const options = validateOptions(rawOptions, operation, 'text');
      return (await discoverTexts(text, options, operation)).candidates.length > 0;
    },

    tapText: async function (text, rawOptions) {
      const operation = 'UI.tapText';
      validateText(text, operation);
      const options = validateOptions(rawOptions, operation, 'text');
      return tapWithDiscovery(discoverTexts, text, options, operation, 'tapText');
    },

    tapTexts: async function (texts, rawOptions) {
      const operation = 'UI.tapTexts';
      if (!Array.isArray(texts) || texts.length === 0 || texts.some(function (text) { return typeof text !== 'string' || text.length === 0; })) {
        fail('INVALID_ARGUMENT', operation, 'texts must be a non-empty string array');
      }
      const options = validateOptions(rawOptions, operation, 'text');
      const completed = [];
      for (let index = 0; index < texts.length; index += 1) {
        if (index > 0 && options.intervalMs > 0) await delay(options.intervalMs);
        try {
          completed.push(await tapWithDiscovery(discoverTexts, texts[index], options, operation, 'tapText'));
        } catch (error) {
          const message = error && error.message ? error.message : 'text activation failed';
          const wrapped = new Error(message);
          wrapped.code = error && error.code ? error.code : 'INVALID_ARGUMENT';
          wrapped.operation = operation;
          wrapped.failedIndex = index;
          wrapped.failedText = texts[index];
          wrapped.completed = completed;
          wrapped.cause = error;
          throw wrapped;
        }
      }
      return { ok: true, action: 'tapTexts', completed: completed };
    },

    waitText: async function (text, rawOptions) {
      const operation = 'UI.waitText';
      validateText(text, operation);
      const options = validateOptions(rawOptions, operation, 'text');
      const started = Date.now();
      let lastObservation = null;
      let lastError = null;
      while (Date.now() - started <= options.timeout) {
        try {
          const found = await discoverTexts(text, options, operation);
          lastObservation = { candidateCount: found.candidates.length, candidates: found.candidates };
          const candidate = chooseCandidate(found.candidates, options, operation);
          if (candidate) return candidate;
        } catch (error) {
          if (error && error.code === 'AMBIGUOUS_TARGET') throw error;
          lastError = errorSummary(error);
        }
        if (Date.now() - started >= options.timeout) break;
        await delay(options.polling);
      }
      fail('TIMEOUT', operation, 'timed out waiting for text to appear', {
        timeout: options.timeout,
        text: text,
        lastObservation: lastObservation,
        lastError: lastError,
      });
    },

    waitTextGone: async function (text, rawOptions) {
      const operation = 'UI.waitTextGone';
      validateText(text, operation);
      const options = validateOptions(rawOptions, operation, 'text');
      const started = Date.now();
      let lastObservation = null;
      let lastError = null;
      while (Date.now() - started <= options.timeout) {
        try {
          const found = await discoverTexts(text, options, operation);
          lastObservation = { candidateCount: found.candidates.length, candidates: found.candidates };
          if (found.candidates.length === 0) return true;
        } catch (error) {
          lastError = errorSummary(error);
        }
        if (Date.now() - started >= options.timeout) break;
        await delay(options.polling);
      }
      fail('TIMEOUT', operation, 'timed out waiting for text to disappear', {
        timeout: options.timeout,
        text: text,
        lastObservation: lastObservation,
        lastError: lastError,
      });
    },

    findImages: async function (template, rawOptions) {
      const operation = 'UI.findImages';
      const options = validateOptions(rawOptions, operation, 'image');
      return (await discoverImages(template, options, operation)).candidates;
    },

    findImage: async function (template, rawOptions) {
      const operation = 'UI.findImage';
      const options = validateOptions(rawOptions, operation, 'image');
      const found = await discoverImages(template, options, operation);
      return chooseCandidate(found.candidates, options, operation);
    },

    tapImage: async function (template, rawOptions) {
      const operation = 'UI.tapImage';
      const options = validateOptions(rawOptions, operation, 'image');
      return tapWithDiscovery(discoverImages, template, options, operation, 'tapImage');
    },
  };

  global.UI = UI;
})(globalThis);
