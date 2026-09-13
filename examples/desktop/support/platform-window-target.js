// Shared example-local cross-platform window target resolver. Load as a factory;
// not a standalone script and not a Runtime API.
(function createPlatformWindowTarget() {
  'use strict';

  function currentPlatform() {
    const capabilities = App.getCapabilities();
    const platform = capabilities && capabilities.platform;
    if (typeof platform !== 'string' || !platform) {
      throw new Error('App.getCapabilities().platform is unavailable');
    }
    return platform;
  }

  function select(targets) {
    if (!targets || typeof targets !== 'object' || Array.isArray(targets)) {
      throw new Error('Platform window targets must be an object keyed by App platform');
    }
    const platform = currentPlatform();
    if (!Object.prototype.hasOwnProperty.call(targets, platform)) {
      throw new Error('No verified window target configured for platform: ' + platform);
    }
    const target = targets[platform];
    if (!target || typeof target !== 'object' || Array.isArray(target)) {
      throw new Error('Window target for platform ' + platform + ' must be an explicit WindowTarget object');
    }
    return target;
  }

  async function wait(targets, options) {
    const target = select(targets);
    return window.wait(target, options || {});
  }

  return Object.freeze({ currentPlatform, select, wait });
})
