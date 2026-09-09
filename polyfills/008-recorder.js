// Recorder capture, storage, actions, and generation share one native owner.
// This facade publishes user-facing argument defaults without creating a
// second global object or owning listeners/files itself.
(function installRecorderFacade(global) {
  'use strict';

  const recorder = global.Recorder;
  if (!recorder || typeof recorder !== 'object') {
    throw new Error('Recorder native owner is unavailable');
  }

  const nativeBuildActions = recorder.buildActions.bind(recorder);
  const nativeGenerateScript = recorder.generateScript.bind(recorder);

  recorder.buildActions = function buildActions(recordingDir) {
    if (arguments.length !== 1 || typeof recordingDir !== 'string' || recordingDir.trim() === '') {
      return Promise.reject(Object.assign(new Error('recordingDir must be a non-empty path string'), {
        name: 'RecorderError', code: 'INVALID_ARGUMENT', operation: 'Recorder.buildActions',
      }));
    }
    return nativeBuildActions(recordingDir);
  };

  recorder.generateScript = function generateScript(actionsFile, options) {
    if (typeof actionsFile !== 'string' || actionsFile.trim() === '') {
      return Promise.reject(Object.assign(new Error('actionsFile must be a non-empty path string'), {
        name: 'RecorderError', code: 'INVALID_ARGUMENT', operation: 'Recorder.generateScript',
      }));
    }
    const normalized = options === undefined ? { mode: 'basic' } : options;
    return nativeGenerateScript(actionsFile, normalized);
  };

  Object.freeze(recorder);
})(globalThis);
