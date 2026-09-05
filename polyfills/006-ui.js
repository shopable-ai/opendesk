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

  function hasOwn(value, key) {
    return Object.prototype.hasOwnProperty.call(value, key);
  }

  function rejectUnknownFields(value, allowed, name, operation) {
    const unknown = Object.keys(value).filter(function (key) { return allowed.indexOf(key) < 0; });
    if (unknown.length > 0) {
      fail('INVALID_ARGUMENT', operation, name + ' contains unknown field' + (unknown.length === 1 ? '' : 's') + ': ' + unknown.join(', '));
    }
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

  function taggedScreenRegion(raw, name, operation) {
    requireObject(raw, name, operation);
    rejectUnknownFields(raw, ['x', 'y', 'width', 'height', 'coordinateSpace'], name, operation);
    if (raw.coordinateSpace !== 'screen') {
      fail('INVALID_ARGUMENT', operation, name + '.coordinateSpace must be "screen"');
    }
    const x = requireFinite(raw.x, name + '.x', operation);
    const y = requireFinite(raw.y, name + '.y', operation);
    const width = requirePositive(raw.width, name + '.width', operation);
    const height = requirePositive(raw.height, name + '.height', operation);
    if (!isFiniteNumber(x + width) || !isFiniteNumber(y + height)) {
      fail('INVALID_ARGUMENT', operation, name + ' boundaries must be finite');
    }
    return {
      x: x,
      y: y,
      width: width,
      height: height,
      coordinateSpace: 'screen',
    };
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

  function validateRelativeTo(raw, operation) {
    const relative = requireObject(raw, 'relativeTo', operation);
    rejectUnknownFields(relative, ['text', 'direction', 'maxGap', 'minOverlap', 'region'], 'relativeTo', operation);
    if (typeof relative.text !== 'string' || normalizeWhitespace(relative.text).length === 0) {
      fail('INVALID_ARGUMENT', operation, 'relativeTo.text must be a non-empty string');
    }

    const hasDirection = hasOwn(relative, 'direction');
    const hasRegion = hasOwn(relative, 'region');
    if (hasDirection === hasRegion) {
      fail('INVALID_ARGUMENT', operation, 'relativeTo must provide exactly one of direction or region');
    }

    if (hasDirection) {
      if (['right', 'left', 'above', 'below'].indexOf(relative.direction) < 0) {
        fail('INVALID_ARGUMENT', operation, 'relativeTo.direction must be "right", "left", "above", or "below"');
      }
      if (!hasOwn(relative, 'maxGap')) {
        fail('INVALID_ARGUMENT', operation, 'relativeTo.maxGap is required in direction mode');
      }
      const maxGap = requireFinite(relative.maxGap, 'relativeTo.maxGap', operation);
      if (maxGap < 0) {
        fail('INVALID_ARGUMENT', operation, 'relativeTo.maxGap must be greater than or equal to 0');
      }
      const minOverlap = relative.minOverlap === undefined
        ? 0.5
        : requireFinite(relative.minOverlap, 'relativeTo.minOverlap', operation);
      if (minOverlap <= 0 || minOverlap > 1) {
        fail('INVALID_ARGUMENT', operation, 'relativeTo.minOverlap must be greater than 0 and at most 1');
      }
      return {
        text: relative.text,
        mode: 'direction',
        direction: relative.direction,
        maxGap: maxGap,
        minOverlap: minOverlap,
      };
    }

    if (hasOwn(relative, 'maxGap') || hasOwn(relative, 'minOverlap')) {
      fail('INVALID_ARGUMENT', operation, 'relativeTo.maxGap and relativeTo.minOverlap are not allowed in region mode');
    }
    if (typeof relative.region !== 'function') {
      fail('INVALID_ARGUMENT', operation, 'relativeTo.region must be a synchronous function');
    }
    return { text: relative.text, mode: 'region', region: relative.region };
  }

  function hasReliableWindowIdentity(win) {
    return isWindowInfo(win) && win.id.length > 0 && !/:unresolved$/.test(win.id);
  }

  function validatePositioningOptions(raw, options, operation, supported) {
    const hasRegion = hasOwn(raw, 'region');
    const hasRelativeTo = hasOwn(raw, 'relativeTo');
    if (!hasRegion && !hasRelativeTo) return;
    if (!supported) {
      fail('INVALID_ARGUMENT', operation, operation + ' does not support region or relativeTo');
    }
    if (!isWindowInfo(raw.within)) {
      fail('INVALID_ARGUMENT', operation, 'region and relativeTo require an explicit within WindowInfo');
    }
    if (!hasReliableWindowIdentity(raw.within)) {
      fail('STALE_TARGET', operation, 'within must have a resolved window identity for region or relativeTo');
    }

    let region = null;
    let regionMode = 'window';
    if (hasRegion) {
      if (typeof raw.region === 'function') {
        region = raw.region;
        regionMode = 'dynamic';
      } else {
        region = taggedScreenRegion(raw.region, 'region', operation);
        regionMode = 'static';
      }
    }

    options.positioning = {
      expectedWindow: identitySnapshot(raw.within),
      region: region,
      regionMode: regionMode,
      relativeTo: hasRelativeTo ? validateRelativeTo(raw.relativeTo, operation) : null,
    };
  }

  function validateOptions(rawOptions, operation, kind, positioningSupported) {
    const raw = rawOptions === undefined ? {} : requireObject(rawOptions, 'options', operation);
    if ((hasOwn(raw, 'region') || hasOwn(raw, 'relativeTo')) && positioningSupported !== true) {
      fail('INVALID_ARGUMENT', operation, operation + ' does not support region or relativeTo');
    }
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
    validatePositioningOptions(raw, options, operation, positioningSupported === true);
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

  function frozenWindowCopy(win) {
    const copy = {};
    for (const key of Object.keys(win)) {
      const value = win[key];
      if (value === null || (typeof value !== 'object' && typeof value !== 'function')) copy[key] = value;
    }
    return Object.freeze(copy);
  }

  function frozenTextTargetCopy(target) {
    return Object.freeze({
      source: target.source,
      text: target.text,
      confidence: target.confidence,
      provider: target.provider,
      imageBounds: Object.freeze(Object.assign({}, target.imageBounds)),
      bounds: Object.freeze(Object.assign({}, target.bounds)),
      center: Object.freeze(Object.assign({}, target.center)),
    });
  }

  function callbackScreenRegion(callback, argument, name, operation) {
    let result;
    try {
      result = callback(argument);
    } catch (error) {
      fail('INVALID_ARGUMENT', operation, name + ' callback failed', { cause: errorSummary(error) });
    }
    if (result && (typeof result === 'object' || typeof result === 'function') && typeof result.then === 'function') {
      fail('INVALID_ARGUMENT', operation, name + ' callback must return synchronously, not a Promise');
    }
    return taggedScreenRegion(result, name + ' result', operation);
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

  async function currentPositionedWindow(operation) {
    try {
      return await currentActiveWindow(operation);
    } catch (error) {
      if (error && error.code === 'STALE_TARGET' && error.operation === operation) throw error;
      fail('STALE_TARGET', operation, 'could not confirm the current target window', {
        cause: errorSummary(error),
      });
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

  async function resolveScope(options, operation, targetOverride, requestedOverride) {
    let target = targetOverride;
    if (target === undefined) {
      target = options.within === undefined ? await currentActiveWindow(operation) : options.within;
    }
    let requested;
    try {
      requested = global.Geometry.rect(requestedOverride === undefined ? target : requestedOverride);
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
    const searchScope = global.Geometry.intersect(requested, virtual);
    if (!searchScope) {
      fail('TARGET_SCOPE_NOT_VISIBLE', operation, 'target scope is outside the visible virtual desktop');
    }
    let logicalScope = searchScope;
    if (requestedOverride !== undefined) {
      // Native screenshot clips are integer rectangles. Positioned searches keep
      // the exact requested range separately, capture an outward-rounded clip,
      // and project OCR with the actual clip dimensions.
      const left = Math.floor(searchScope.x);
      const top = Math.floor(searchScope.y);
      const right = Math.ceil(searchScope.x + searchScope.width);
      const bottom = Math.ceil(searchScope.y + searchScope.height);
      logicalScope = global.Geometry.intersect({
        x: left,
        y: top,
        width: right - left,
        height: bottom - top,
        coordinateSpace: 'screen',
      }, virtual);
      if (!logicalScope) {
        fail('TARGET_SCOPE_NOT_VISIBLE', operation, 'target scope cannot be mapped to a visible screenshot clip');
      }
    }
    const displays = displaysForScope(logicalScope, operation);
    return {
      target: target,
      requestedScope: requested,
      searchScope: searchScope,
      logicalScope: logicalScope,
      displays: displays,
      windowSnapshot: isWindowInfo(target) ? identitySnapshot(target) : null,
    };
  }

  async function captureScope(options, operation, targetOverride, requestedOverride) {
    const scope = await resolveScope(options, operation, targetOverride, requestedOverride);
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

  function projectSpatialEdges(imageBoundsValue, capture) {
    const logical = capture.scope.logicalScope;
    return {
      left: logical.x + imageBoundsValue.x / capture.scaleX,
      top: logical.y + imageBoundsValue.y / capture.scaleY,
      right: logical.x + (imageBoundsValue.x + imageBoundsValue.width) / capture.scaleX,
      bottom: logical.y + (imageBoundsValue.y + imageBoundsValue.height) / capture.scaleY,
    };
  }

  function imageEdges(imageBoundsValue) {
    return {
      left: imageBoundsValue.x,
      top: imageBoundsValue.y,
      right: imageBoundsValue.x + imageBoundsValue.width,
      bottom: imageBoundsValue.y + imageBoundsValue.height,
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

  function textMatches(lineText, query, options, matchOverride) {
    const actual = normalizeText(lineText, options);
    const wanted = normalizeText(query, options);
    const match = matchOverride || options.match;
    return match === 'exact' ? actual === wanted : actual.indexOf(wanted) >= 0;
  }

  function sortReadingOrder(candidates) {
    return candidates.sort(function (a, b) {
      if (a.bounds.y !== b.bounds.y) return a.bounds.y - b.bounds.y;
      return a.bounds.x - b.bounds.x;
    });
  }

  function sortCandidateRows(rows) {
    return rows.sort(function (a, b) {
      if (a.candidate.bounds.y !== b.candidate.bounds.y) return a.candidate.bounds.y - b.candidate.bounds.y;
      return a.candidate.bounds.x - b.candidate.bounds.x;
    });
  }

  async function runTextObservation(options, operation, targetOverride, requestedOverride) {
    const capture = await captureScope(options, operation, targetOverride, requestedOverride);
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
    return { capture: capture, result: result };
  }

  function collectTextMatches(observation, text, options, operation) {
    const targetRows = [];
    const anchorRows = [];
    const relative = options.positioning && options.positioning.relativeTo;
    for (let lineIndex = 0; lineIndex < observation.result.lines.length; lineIndex += 1) {
      const line = observation.result.lines[lineIndex];
      if (!line || typeof line.text !== 'string' || !line.bbox) continue;
      const confidence = isFiniteNumber(line.confidence) ? line.confidence : 0;
      if (options.minConfidence !== undefined && confidence < options.minConfidence) continue;
      const targetMatch = textMatches(line.text, text, options);
      const anchorMatch = !!relative && textMatches(line.text, relative.text, options, 'exact');
      if (!targetMatch && !anchorMatch) continue;
      let rawBounds;
      let bounds;
      let spatialEdges;
      try {
        rawBounds = imageBounds(line.bbox, observation.capture, operation);
        bounds = projectImageBounds(line.bbox, observation.capture, operation);
        spatialEdges = projectSpatialEdges(rawBounds, observation.capture);
      } catch (error) {
        fail('OCR_FAILED', operation, 'OCR returned an invalid image bounding box', { cause: errorSummary(error) });
      }
      const candidate = {
        source: 'ocr',
        text: line.text,
        confidence: confidence,
        provider: typeof observation.result.provider === 'string' ? observation.result.provider : (options.provider || ''),
        imageBounds: rawBounds,
        bounds: bounds,
        center: centerOf(bounds),
      };
      if (options.positioning && !fullyContainedSpatial(spatialEdges, observation.capture.scope.searchScope)) {
        continue;
      }
      const row = {
        lineIndex: lineIndex,
        candidate: candidate,
        imageEdges: imageEdges(rawBounds),
        spatialEdges: spatialEdges,
      };
      if (targetMatch) targetRows.push(row);
      if (anchorMatch) anchorRows.push(row);
    }
    return {
      targetRows: sortCandidateRows(targetRows),
      anchorRows: sortCandidateRows(anchorRows),
    };
  }

  async function discoverTexts(text, options, operation, targetOverride, requestedOverride) {
    const observation = await runTextObservation(options, operation, targetOverride, requestedOverride);
    const matches = collectTextMatches(observation, text, options, operation);
    return {
      capture: observation.capture,
      candidates: matches.targetRows.map(function (row) { return row.candidate; }),
    };
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
    if (candidates.length === 0) {
      if (options.index !== undefined) {
        fail('TARGET_NOT_FOUND', operation, 'index is outside the matching candidate list', {
          index: options.index,
          candidateCount: 0,
        });
      }
      return null;
    }
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

  async function checkWindowScope(capture, operation, phase, positioned) {
    if (!capture.scope.windowSnapshot) return { retry: false };
    const current = positioned ? await currentPositionedWindow(operation) : await currentActiveWindow(operation);
    const currentSnapshot = identitySnapshot(current);
    if (!sameIdentity(capture.scope.windowSnapshot, currentSnapshot)) {
      fail('STALE_TARGET', operation, 'active window identity changed ' + phase, {
        expected: capture.scope.windowSnapshot,
        actual: currentSnapshot,
      });
    }
    return { retry: !sameBounds(capture.scope.windowSnapshot.bounds, currentSnapshot.bounds), current: current };
  }

  async function checkActionScope(capture, operation) {
    return checkWindowScope(capture, operation, 'before the input action');
  }

  function assertExpectedWindow(expected, current, operation) {
    const actual = identitySnapshot(current);
    if (!hasReliableWindowIdentity(current) || !sameIdentity(expected, actual)) {
      fail('STALE_TARGET', operation, 'within no longer identifies the active window', {
        expected: expected,
        actual: actual,
      });
    }
    return actual;
  }

  function positionedOuterScope(options, current, currentSnapshot, operation) {
    const positioning = options.positioning;
    if (positioning.regionMode === 'static' && !sameBounds(positioning.expectedWindow.bounds, currentSnapshot.bounds)) {
      fail('STALE_TARGET', operation, 'window bounds changed after the static region snapshot was supplied', {
        expected: positioning.expectedWindow,
        actual: currentSnapshot,
      });
    }

    const windowRegion = global.Geometry.rect(current);
    let requested = windowRegion;
    if (positioning.regionMode === 'static') {
      requested = positioning.region;
    } else if (positioning.regionMode === 'dynamic') {
      requested = callbackScreenRegion(positioning.region, frozenWindowCopy(current), 'region', operation);
    }
    const effective = global.Geometry.intersect(windowRegion, requested);
    if (!effective) {
      fail('TARGET_SCOPE_NOT_VISIBLE', operation, 'region does not intersect the current target window');
    }
    return effective;
  }

  function overlapLength(firstStart, firstEnd, secondStart, secondEnd) {
    return Math.max(0, Math.min(firstEnd, secondEnd) - Math.max(firstStart, secondStart));
  }

  function comparisonTolerance() {
    let scale = 1;
    for (let index = 0; index < arguments.length; index += 1) {
      scale = Math.max(scale, Math.abs(arguments[index]));
    }
    return 16 * 2.220446049250313e-16 * scale;
  }

  function atLeast(actual, minimum) {
    return actual + comparisonTolerance.apply(null, arguments) >= minimum;
  }

  function atMost(actual, maximum) {
    return actual <= maximum + comparisonTolerance.apply(null, arguments);
  }

  function matchesDirection(targetEdges, anchorEdges, relative, capture) {
    if (relative.direction === 'right' || relative.direction === 'left') {
      const overlap = overlapLength(targetEdges.top, targetEdges.bottom, anchorEdges.top, anchorEdges.bottom);
      const minimumOverlap = Math.min(
        targetEdges.bottom - targetEdges.top,
        anchorEdges.bottom - anchorEdges.top,
      ) * relative.minOverlap;
      if (!atLeast(
        overlap,
        minimumOverlap,
        targetEdges.top,
        targetEdges.bottom,
        anchorEdges.top,
        anchorEdges.bottom,
      )) return false;
      const maximumGap = relative.maxGap * capture.scaleX;
      if (relative.direction === 'right') {
        const gap = targetEdges.left - anchorEdges.right;
        return atLeast(gap, 0, targetEdges.left, anchorEdges.right) &&
          atMost(gap, maximumGap, targetEdges.left, anchorEdges.right);
      }
      const gap = anchorEdges.left - targetEdges.right;
      return atLeast(gap, 0, anchorEdges.left, targetEdges.right) &&
        atMost(gap, maximumGap, anchorEdges.left, targetEdges.right);
    }

    const overlap = overlapLength(targetEdges.left, targetEdges.right, anchorEdges.left, anchorEdges.right);
    const minimumOverlap = Math.min(
      targetEdges.right - targetEdges.left,
      anchorEdges.right - anchorEdges.left,
    ) * relative.minOverlap;
    if (!atLeast(
      overlap,
      minimumOverlap,
      targetEdges.left,
      targetEdges.right,
      anchorEdges.left,
      anchorEdges.right,
    )) return false;
    const maximumGap = relative.maxGap * capture.scaleY;
    if (relative.direction === 'below') {
      const gap = targetEdges.top - anchorEdges.bottom;
      return atLeast(gap, 0, targetEdges.top, anchorEdges.bottom) &&
        atMost(gap, maximumGap, targetEdges.top, anchorEdges.bottom);
    }
    const gap = anchorEdges.top - targetEdges.bottom;
    return atLeast(gap, 0, anchorEdges.top, targetEdges.bottom) &&
      atMost(gap, maximumGap, anchorEdges.top, targetEdges.bottom);
  }

  function fullyContainedSpatial(edges, region) {
    return atLeast(edges.left, region.x) && atLeast(edges.top, region.y) &&
      atMost(edges.right, region.x + region.width) &&
      atMost(edges.bottom, region.y + region.height);
  }

  function relativeTextCandidates(matches, observation, options, operation) {
    const relative = options.positioning.relativeTo;
    if (!relative || matches.anchorRows.length !== 1) {
      return [];
    }
    const anchorRow = matches.anchorRows[0];
    const targetRows = matches.targetRows.filter(function (row) { return row.lineIndex !== anchorRow.lineIndex; });
    if (relative.mode === 'direction') {
      return targetRows.filter(function (row) {
        return matchesDirection(row.imageEdges, anchorRow.imageEdges, relative, observation.capture);
      }).map(function (row) { return row.candidate; });
    }

    const relativeRegion = callbackScreenRegion(
      relative.region,
      frozenTextTargetCopy(anchorRow.candidate),
      'relativeTo.region',
      operation,
    );
    const effectiveRegion = global.Geometry.intersect(observation.capture.scope.searchScope, relativeRegion);
    if (!effectiveRegion) return [];
    return targetRows.filter(function (row) {
      return fullyContainedSpatial(row.spatialEdges, effectiveRegion);
    }).map(function (row) { return row.candidate; });
  }

  async function discoverPositionedTexts(text, options, operation, missingAnchorIsError) {
    const positioning = options.positioning;
    let retryWindow;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const current = retryWindow === undefined ? await currentPositionedWindow(operation) : retryWindow;
      retryWindow = undefined;
      const currentSnapshot = assertExpectedWindow(positioning.expectedWindow, current, operation);
      const requestedScope = positionedOuterScope(options, current, currentSnapshot, operation);
      const observation = await runTextObservation(options, operation, current, requestedScope);
      const matches = collectTextMatches(observation, text, options, operation);
      const candidates = positioning.relativeTo
        ? relativeTextCandidates(matches, observation, options, operation)
        : matches.targetRows.map(function (row) { return row.candidate; });

      const check = await checkWindowScope(observation.capture, operation, 'before returning or sending input', true);
      if (check.retry) {
        if (positioning.regionMode === 'static') {
          fail('STALE_TARGET', operation, 'window bounds changed while using a static region snapshot', {
            expected: observation.capture.scope.windowSnapshot,
            actual: identitySnapshot(check.current),
          });
        }
        if (attempt === 0) {
          retryWindow = check.current;
          continue;
        }
        fail('STALE_TARGET', operation, 'window bounds changed repeatedly while resolving the target');
      }

      if (positioning.relativeTo) {
        if (matches.anchorRows.length === 0) {
          if (missingAnchorIsError) {
            fail('TARGET_NOT_FOUND', operation, 'relative text anchor was not found in the visible scope', {
              stage: 'anchor',
            });
          }
          return { capture: observation.capture, candidates: [] };
        }
        if (matches.anchorRows.length > 1) {
          fail('AMBIGUOUS_TARGET', operation, 'multiple visible text anchors match relativeTo.text', {
            stage: 'anchor',
            candidateCount: matches.anchorRows.length,
            candidates: matches.anchorRows.map(function (row) { return row.candidate; }),
          });
        }
      }
      return { capture: observation.capture, candidates: candidates };
    }
    fail('STALE_TARGET', operation, 'window bounds changed while resolving the target');
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

  async function tapPositionedText(text, options, operation) {
    const found = await discoverPositionedTexts(text, options, operation, true);
    const target = chooseCandidate(found.candidates, options, operation);
    if (!target) {
      fail('TARGET_NOT_FOUND', operation, 'target was not found in the visible scope');
    }
    try {
      await global.mouse.clickPoint(target.center, options.click);
    } catch (error) {
      if (error && error.code) throw error;
      fail('STALE_TARGET', operation, 'mouse click could not be sent to the resolved screen point', { cause: errorSummary(error) });
    }
    return { ok: true, action: 'tapText', target: target, point: target.center };
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
      const options = validateOptions(rawOptions, operation, 'text', true);
      return (await (options.positioning
        ? discoverPositionedTexts(text, options, operation, false)
        : discoverTexts(text, options, operation))).candidates;
    },

    findText: async function (text, rawOptions) {
      const operation = 'UI.findText';
      validateText(text, operation);
      const options = validateOptions(rawOptions, operation, 'text', true);
      const found = options.positioning
        ? await discoverPositionedTexts(text, options, operation, false)
        : await discoverTexts(text, options, operation);
      return chooseCandidate(found.candidates, options, operation);
    },

    hasText: async function (text, rawOptions) {
      const operation = 'UI.hasText';
      validateText(text, operation);
      const options = validateOptions(rawOptions, operation, 'text', true);
      return (await (options.positioning
        ? discoverPositionedTexts(text, options, operation, false)
        : discoverTexts(text, options, operation))).candidates.length > 0;
    },

    tapText: async function (text, rawOptions) {
      const operation = 'UI.tapText';
      validateText(text, operation);
      const options = validateOptions(rawOptions, operation, 'text', true);
      return options.positioning
        ? tapPositionedText(text, options, operation)
        : tapWithDiscovery(discoverTexts, text, options, operation, 'tapText');
    },

    tapTexts: async function (texts, rawOptions) {
      const operation = 'UI.tapTexts';
      if (!Array.isArray(texts) || texts.length === 0 || texts.some(function (text) { return typeof text !== 'string' || text.length === 0; })) {
        fail('INVALID_ARGUMENT', operation, 'texts must be a non-empty string array');
      }
      const options = validateOptions(rawOptions, operation, 'text', true);
      const completed = [];
      for (let index = 0; index < texts.length; index += 1) {
        if (index > 0 && options.intervalMs > 0) await delay(options.intervalMs);
        try {
          completed.push(await (options.positioning
            ? tapPositionedText(texts[index], options, operation)
            : tapWithDiscovery(discoverTexts, texts[index], options, operation, 'tapText')));
        } catch (error) {
          const message = error && error.message ? error.message : 'text activation failed';
          const wrapped = new Error(message);
          wrapped.code = error && error.code ? error.code : 'INVALID_ARGUMENT';
          wrapped.operation = operation;
          wrapped.failedIndex = index;
          wrapped.failedText = texts[index];
          wrapped.completed = completed;
          wrapped.cause = error;
          if (error && error.stage) wrapped.stage = error.stage;
          if (error && Number.isInteger(error.candidateCount)) wrapped.candidateCount = error.candidateCount;
          if (error && Array.isArray(error.candidates)) wrapped.candidates = error.candidates;
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
