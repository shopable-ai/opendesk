(function installSystemProductIdentity() {
  'use strict';

  // AutoMapObject is exported by Goja as a host map. Host-map properties
  // cannot be redefined with stricter descriptors, so retain every native
  // method on an ordinary JavaScript facade before adding immutable identity.
  const nativeSystem = globalThis.System;
  const systemFacade = {};
  for (const name of Object.keys(nativeSystem)) {
    systemFacade[name] = nativeSystem[name];
  }
  const System = systemFacade;
  const product = Object.freeze({
    id: 'com.opendesk.desktop',
    name: 'OpenDesk',
    website: 'https://github.com/shopable-ai/opendesk',
  });

  Object.defineProperty(System, 'product', {
    value: product,
    writable: false,
    configurable: false,
    enumerable: true,
  });
  globalThis.System = System;
})();

function notify(options) {
  if (typeof options === 'string') {
    options = {
      title: options,
      message: '',
      sound: true,
    };
  } else if (options === null || typeof options !== 'object' || Array.isArray(options)) {
    throw new TypeError('notify expects a string or an options object');
  }

  if (options.title !== undefined && typeof options.title !== 'string') {
    throw new TypeError('notify title must be a string');
  }
  if (options.message !== undefined && typeof options.message !== 'string') {
    throw new TypeError('notify message must be a string');
  }
  if (options.sound !== undefined && typeof options.sound !== 'boolean') {
    throw new TypeError('notify sound must be a boolean');
  }
  if (options.timeout !== undefined &&
      (typeof options.timeout !== 'number' || !Number.isFinite(options.timeout))) {
    throw new TypeError('notify timeout must be a finite number');
  }

  return notify____Inject(options);
}
