// Edge-constrained regions, insets, and anchor points for Geometry.
// This extends the existing pure-JavaScript Geometry object; it does not own
// window lifecycle, UI discovery, screenshot mapping, or mouse input.
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

  const Geometry = global.Geometry;
  if (!Geometry || typeof Geometry.rect !== 'function' || typeof Geometry.pointPercent !== 'function') {
    fail('INVALID_ARGUMENT', 'Geometry.layout', 'base Geometry must be loaded before Geometry layout helpers');
  }

  function isFiniteNumber(value) {
    return typeof value === 'number' && Number.isFinite(value);
  }

  function requireObject(value, name, operation) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      fail('INVALID_ARGUMENT', operation, name + ' must be an object');
    }
    return value;
  }

  function requireNonNegative(value, name, operation) {
    if (!isFiniteNumber(value)) {
      fail('INVALID_ARGUMENT', operation, name + ' must be a finite number');
    }
    if (value < 0) {
      fail('INVALID_ARGUMENT', operation, name + ' must be greater than or equal to 0');
    }
    return value;
  }

  function requirePositive(value, name, operation) {
    if (!isFiniteNumber(value)) {
      fail('INVALID_ARGUMENT', operation, name + ' must be a finite number');
    }
    if (value <= 0) {
      fail('INVALID_ARGUMENT', operation, name + ' must be greater than 0');
    }
    return value;
  }

  function isProvided(value) {
    return value !== undefined;
  }

  function rectFromTarget(target, operation) {
    try {
      return Geometry.rect(target);
    } catch (error) {
      fail('INVALID_ARGUMENT', operation, error && error.message ? String(error.message) : 'invalid Geometry target', {
        cause: error,
      });
    }
  }

  function solveAxis(options, axis, parentSize, operation) {
    const startProvided = isProvided(options[axis.start]);
    const endProvided = isProvided(options[axis.end]);
    const sizeProvided = isProvided(options[axis.size]);
    const count = Number(startProvided) + Number(endProvided) + Number(sizeProvided);

    if (count < 2) {
      fail(
        'INVALID_ARGUMENT',
        operation,
        'cannot determine region ' + axis.dimension + ': provide two of ' + axis.start + ', ' + axis.end + ', and ' + axis.size,
      );
    }
    if (count > 2) {
      fail(
        'INVALID_ARGUMENT',
        operation,
        axis.orientation + ' constraints are over-specified: provide exactly two of ' + axis.start + ', ' + axis.end + ', and ' + axis.size,
      );
    }

    const start = startProvided ? requireNonNegative(options[axis.start], 'options.' + axis.start, operation) : undefined;
    const end = endProvided ? requireNonNegative(options[axis.end], 'options.' + axis.end, operation) : undefined;
    const size = sizeProvided ? requirePositive(options[axis.size], 'options.' + axis.size, operation) : undefined;

    if (startProvided && sizeProvided) {
      if (start > parentSize || size > parentSize - start) {
        fail(
          'INVALID_ARGUMENT',
          operation,
          'region cannot fit within parent: ' + axis.start + ' ' + start + ' and ' + axis.size + ' ' + size +
            ' exceed available ' + axis.dimension + ' ' + parentSize,
        );
      }
      return { mode: 'start-size', start: start, size: size };
    }

    if (endProvided && sizeProvided) {
      if (end > parentSize || size > parentSize - end) {
        fail(
          'INVALID_ARGUMENT',
          operation,
          'region cannot fit within parent: ' + axis.end + ' ' + end + ' and ' + axis.size + ' ' + size +
            ' exceed available ' + axis.dimension + ' ' + parentSize,
        );
      }
      return { mode: 'end-size', end: end, size: size };
    }

    if (start >= parentSize || end >= parentSize - start) {
      fail(
        'INVALID_ARGUMENT',
        operation,
        'region cannot fit within parent: ' + axis.start + ' ' + start + ' and ' + axis.end + ' ' + end +
          ' leave no positive ' + axis.dimension + ' within available ' + axis.dimension + ' ' + parentSize,
      );
    }
    return { mode: 'stretch', start: start, end: end, size: parentSize - start - end };
  }

  function regionWithin(parent, x, y, width, height, operation) {
    if (![x, y, width, height].every(isFiniteNumber)) {
      fail('INVALID_ARGUMENT', operation, 'calculated region coordinates and dimensions must be finite');
    }
    if (width <= 0 || height <= 0) {
      fail('INVALID_ARGUMENT', operation, 'calculated region width and height must be greater than 0');
    }

    const parentRight = parent.x + parent.width;
    const parentBottom = parent.y + parent.height;
    const right = x + width;
    const bottom = y + height;
    if (![parentRight, parentBottom, right, bottom].every(isFiniteNumber)) {
      fail('INVALID_ARGUMENT', operation, 'calculated region boundaries must be finite');
    }
    if (x < parent.x || y < parent.y || right > parentRight || bottom > parentBottom) {
      fail('INVALID_ARGUMENT', operation, 'calculated region must fit entirely within the parent region');
    }

    return Geometry.rect({
      x: x,
      y: y,
      width: width,
      height: height,
      coordinateSpace: 'screen',
    });
  }

  function normalizeInsets(value, name, operation) {
    if (typeof value === 'number') {
      const margin = requireNonNegative(value, name, operation);
      return { top: margin, right: margin, bottom: margin, left: margin };
    }

    const raw = requireObject(value, name, operation);
    return {
      top: raw.top === undefined ? 0 : requireNonNegative(raw.top, name + '.top', operation),
      right: raw.right === undefined ? 0 : requireNonNegative(raw.right, name + '.right', operation),
      bottom: raw.bottom === undefined ? 0 : requireNonNegative(raw.bottom, name + '.bottom', operation),
      left: raw.left === undefined ? 0 : requireNonNegative(raw.left, name + '.left', operation),
    };
  }

  function insetRegion(target, margins, operation, name) {
    const parent = rectFromTarget(target, operation);
    const inset = normalizeInsets(margins, name, operation);
    if (inset.left >= parent.width || inset.right >= parent.width - inset.left) {
      fail(
        'INVALID_ARGUMENT',
        operation,
        'inset cannot fit within parent: left ' + inset.left + ' and right ' + inset.right +
          ' leave no positive width within available width ' + parent.width,
      );
    }
    if (inset.top >= parent.height || inset.bottom >= parent.height - inset.top) {
      fail(
        'INVALID_ARGUMENT',
        operation,
        'inset cannot fit within parent: top ' + inset.top + ' and bottom ' + inset.bottom +
          ' leave no positive height within available height ' + parent.height,
      );
    }
    return regionWithin(
      parent,
      parent.x + inset.left,
      parent.y + inset.top,
      parent.width - inset.left - inset.right,
      parent.height - inset.top - inset.bottom,
      operation,
    );
  }

  function regionByEdges(target, value) {
    const operation = 'Geometry.regionByEdges';
    const parent = rectFromTarget(target, operation);
    const options = requireObject(value, 'options', operation);
    const horizontal = solveAxis(options, {
      orientation: 'horizontal', start: 'left', end: 'right', size: 'width', dimension: 'width',
    }, parent.width, operation);
    const vertical = solveAxis(options, {
      orientation: 'vertical', start: 'top', end: 'bottom', size: 'height', dimension: 'height',
    }, parent.height, operation);

    const x = horizontal.mode === 'end-size'
      ? parent.x + parent.width - horizontal.end - horizontal.size
      : parent.x + horizontal.start;
    const y = vertical.mode === 'end-size'
      ? parent.y + parent.height - vertical.end - vertical.size
      : parent.y + vertical.start;
    return regionWithin(parent, x, y, horizontal.size, vertical.size, operation);
  }

  function inset(target, margins) {
    return insetRegion(target, margins, 'Geometry.inset', 'margins');
  }

  const anchorPercent = {
    'top-left': [0, 0],
    'top-center': [50, 0],
    'top-right': [100, 0],
    'center-left': [0, 50],
    center: [50, 50],
    'center-right': [100, 50],
    'bottom-left': [0, 100],
    'bottom-center': [50, 100],
    'bottom-right': [100, 100],
  };

  function anchorPoint(target, position, rawOptions) {
    const operation = 'Geometry.anchorPoint';
    if (typeof position !== 'string' || !Object.prototype.hasOwnProperty.call(anchorPercent, position)) {
      fail('INVALID_ARGUMENT', operation, 'position must be one of ' + Object.keys(anchorPercent).join(', '));
    }
    const options = rawOptions === undefined ? {} : requireObject(rawOptions, 'options', operation);
    const inner = insetRegion(
      target,
      options.inset === undefined ? 0 : options.inset,
      operation,
      'options.inset',
    );
    const percent = anchorPercent[position];
    let point;
    try {
      point = Geometry.pointPercent(inner, percent[0], percent[1]);
    } catch (error) {
      fail('INVALID_ARGUMENT', operation, 'inset region must contain an addressable screen point', {
        cause: error && error.message ? String(error.message) : String(error),
      });
    }
    if (!Geometry.contains(inner, point)) {
      fail('INVALID_ARGUMENT', operation, 'calculated anchor point must remain inside the inset region');
    }
    return point;
  }

  function install(name, implementation) {
    if (Geometry[name] === undefined) {
      Geometry[name] = implementation;
      return;
    }
    if (typeof Geometry[name] !== 'function') {
      fail('INVALID_ARGUMENT', 'Geometry.' + name, 'Geometry.' + name + ' already exists and is not callable');
    }
  }

  install('regionByEdges', regionByEdges);
  install('inset', inset);
  install('anchorPoint', anchorPoint);
})(globalThis);
