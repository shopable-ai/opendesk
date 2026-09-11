// Run from the repository root after setting OPENDESK_RECORDER_ACTIONS_FILE to
// a saved actions.json/actions.rNNN.json path. This does not start capture or
// replay the generated file.
'use strict';

const actionsFile = Execution.env.OPENDESK_RECORDER_ACTIONS_FILE;
if (typeof actionsFile !== 'string' || actionsFile.trim() === '') {
  throw new Error('Set OPENDESK_RECORDER_ACTIONS_FILE to a saved Recorder actions file');
}
const generated = await Recorder.generateScript(actionsFile, {mode: 'basic'});
console.log('[Recorder] generated candidate (not run):', JSON.stringify(generated));
