// Screen-coordinate geometry helpers for Desktop Automation recipes.
// This file intentionally owns only pure JavaScript composition. Native window,
// display, screenshot, and mouse implementations remain their existing owners.
(function (global) {
  'use strict';

  function fail(code, operation, message, details) {
    const error = new Error(message);
    error.code = code;
    error.operation = operation;
    if (details && typeof details === 'object') {
      for (const key of Object.keys(details)) error[key] = details[key];
    }
    throw error;
  }

  function isFiniteNumber(value) {
    return typeof value === 'number' && Number.isFinite(value);
  }

  function requireFinite(value, name, operation) {
    if (!isFiniteNumber(value)) {
      fail('INVALID_ARGUMENT', operation, name + ' must be a finite number');
    }
    return value;
  }

  function requirePositive(value, name, operation) {
    requireFinite(value, name, operation);
    if (value <= 0) {
      fail('INVALID_ARGUMENT', operation, name + ' must be greater than 0');
    }
    return value;
  }

  function requireObject(value, name, operation) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      fail('INVALID_ARGUMENT', operation, name + ' must be an object');
    }
    return value;
  }

  function screenRegion(x, y, width, height, operation) {
    requireFinite(x, 'x', operation);
    requireFinite(y, 'y', operation);
    requirePositive(width, 'width', operation);
    requirePositive(height, 'height', operation);
    return { x: x, y: y, width: width, height: height, coordinateSpace: 'screen' };
  }

  function screenPoint(x, y, operation) {
    requireFinite(x, 'x', operation);
    requireFinite(y, 'y', operation);
    return { x: x, y: y, coordinateSpace: 'screen' };
  }

  function isScreenRegion(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value) &&
      value.coordinateSpace === 'screen' &&
      isFiniteNumber(value.x) && isFiniteNumber(value.y) &&
      isFiniteNumber(value.width) && value.width > 0 &&
      isFiniteNumber(value.height) && value.height > 0;
  }

  function isWindowInfo(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value) &&
      typeof value.id === 'string' && typeof value.title === 'string' &&
      (isFiniteNumber(value.pid) || isFiniteNumber(value.processId) || isFiniteNumber(value.processID)) &&
      isFiniteNumber(value.x) && isFiniteNumber(value.y) &&
      isFiniteNumber(value.width) && value.width > 0 &&
      isFiniteNumber(value.height) && value.height > 0;
  }

  function isDisplayInfo(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value) &&
      typeof value.id === 'string' && isFiniteNumber(value.index) &&
      isFiniteNumber(value.pixelWidth) && value.pixelWidth > 0 &&
      isFiniteNumber(value.pixelHeight) && value.pixelHeight > 0 &&
      isFiniteNumber(value.x) && isFiniteNumber(value.y) &&
      isFiniteNumber(value.width) && value.width > 0 &&
      isFiniteNumber(value.height) && value.height > 0;
  }

  function rectFromTarget(target, operation) {
    if (isScreenRegion(target)) {
      return screenRegion(target.x, target.y, target.width, target.height, operation);
    }
    if (isWindowInfo(target) || isDisplayInfo(target)) {
      return screenRegion(target.x, target.y, target.width, target.height, operation);
    }
    fail(
      'INVALID_ARGUMENT',
      operation,
      'target must be an OpenDeskWindowInfo, OpenDeskDisplayInfo, or Geometry screen region',
    );
  }

  function pointBounds(rect, operation) {
    const minX = Math.ceil(rect.x);
    const minY = Math.ceil(rect.y);
    const maxX = Math.ceil(rect.x + rect.width) - 1;
    const maxY = Math.ceil(rect.y + rect.height) - 1;
    if (maxX < minX || maxY < minY) {
      fail('INVALID_ARGUMENT', operation, 'target must contain an addressable screen point');
    }
    return { minX: minX, minY: minY, maxX: maxX, maxY: maxY };
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function requirePercent(value, name, operation) {
    requireFinite(value, name, operation);
    if (value < 0 || value > 100) {
      fail('INVALID_ARGUMENT', operation, name + ' must be between 0 and 100');
    }
    return value;
  }

  function regionArguments(value, operation, percent) {
    const region = requireObject(value, 'region', operation);
    const left = percent ? requirePercent(region.left, 'region.left', operation) : requireFinite(region.left, 'region.left', operation);
    const top = percent ? requirePercent(region.top, 'region.top', operation) : requireFinite(region.top, 'region.top', operation);
    const width = percent ? requirePercent(region.width, 'region.width', operation) : requirePositive(region.width, 'region.width', operation);
    const height = percent ? requirePercent(region.height, 'region.height', operation) : requirePositive(region.height, 'region.height', operation);
    if (percent && (left + width > 100 || top + height > 100)) {
      fail('INVALID_ARGUMENT', operation, 'percent region must remain within 0 to 100');
    }
    if (percent && (width <= 0 || height <= 0)) {
      fail('INVALID_ARGUMENT', operation, 'region.width and region.height must be greater than 0');
    }
    return { left: left, top: top, width: width, height: height };
  }

  const Geometry = {
    rect: function (target) {
      return rectFromTarget(target, 'Geometry.rect');
    },

    center: function (target) {
      const operation = 'Geometry.center';
      const rect = rectFromTarget(target, operation);
      const bounds = pointBounds(rect, operation);
      return screenPoint(
        clamp(Math.floor(rect.x + rect.width / 2), bounds.minX, bounds.maxX),
        clamp(Math.floor(rect.y + rect.height / 2), bounds.minY, bounds.maxY),
        operation,
      );
    },

    pointOffset: function (target, x, y) {
      const operation = 'Geometry.pointOffset';
      const rect = rectFromTarget(target, operation);
      return screenPoint(rect.x + requireFinite(x, 'x', operation), rect.y + requireFinite(y, 'y', operation), operation);
    },

    pointPercent: function (target, xPercent, yPercent) {
      const operation = 'Geometry.pointPercent';
      const rect = rectFromTarget(target, operation);
      const x = requirePercent(xPercent, 'xPercent', operation);
      const y = requirePercent(yPercent, 'yPercent', operation);
      const bounds = pointBounds(rect, operation);
      return screenPoint(
        clamp(Math.floor(rect.x + rect.width * x / 100), bounds.minX, bounds.maxX),
        clamp(Math.floor(rect.y + rect.height * y / 100), bounds.minY, bounds.maxY),
        operation,
      );
    },

    regionOffset: function (target, value) {
      const operation = 'Geometry.regionOffset';
      const rect = rectFromTarget(target, operation);
      const region = regionArguments(value, operation, false);
      return screenRegion(rect.x + region.left, rect.y + region.top, region.width, region.height, operation);
    },

    regionPercent: function (target, value) {
      const operation = 'Geometry.regionPercent';
      const rect = rectFromTarget(target, operation);
      const region = regionArguments(value, operation, true);
      const left = Math.floor(rect.x + rect.width * region.left / 100);
      const top = Math.floor(rect.y + rect.height * region.top / 100);
      const right = Math.ceil(rect.x + rect.width * (region.left + region.width) / 100);
      const bottom = Math.ceil(rect.y + rect.height * (region.top + region.height) / 100);
      return screenRegion(left, top, right - left, bottom - top, operation);
    },

    contains: function (region, point) {
      const operation = 'Geometry.contains';
      const rect = rectFromTarget(region, operation);
      requireObject(point, 'point', operation);
      if (point.coordinateSpace !== 'screen') {
        fail('INVALID_ARGUMENT', operation, 'point.coordinateSpace must be "screen"');
      }
      const x = requireFinite(point.x, 'point.x', operation);
      const y = requireFinite(point.y, 'point.y', operation);
      return x >= rect.x && x < rect.x + rect.width && y >= rect.y && y < rect.y + rect.height;
    },

    intersect: function (regionA, regionB) {
      const operation = 'Geometry.intersect';
      const a = rectFromTarget(regionA, operation);
      const b = rectFromTarget(regionB, operation);
      const left = Math.max(a.x, b.x);
      const top = Math.max(a.y, b.y);
      const right = Math.min(a.x + a.width, b.x + b.width);
      const bottom = Math.min(a.y + a.height, b.y + b.height);
      if (right <= left || bottom <= top) return null;
      return screenRegion(left, top, right - left, bottom - top, operation);
    },
  };

  global.Geometry = Geometry;

  // A tagged point removes the common image-pixel/OCR-bbox-to-mouse mistake
  // while preserving the existing mouse.click(x, y, options) contract.
  if (!global.mouse || typeof global.mouse.click !== 'function') {
    fail('INVALID_ARGUMENT', 'mouse.clickPoint', 'mouse.click must be available before mouse.clickPoint is installed');
  }
  global.mouse.clickPoint = function (point, options) {
    const operation = 'mouse.clickPoint';
    requireObject(point, 'point', operation);
    if (point.coordinateSpace !== 'screen') {
      fail('INVALID_ARGUMENT', operation, 'point.coordinateSpace must be "screen"');
    }
    const x = requireFinite(point.x, 'point.x', operation);
    const y = requireFinite(point.y, 'point.y', operation);
    return global.mouse.click(x, y, options);
  };
})(globalThis);
