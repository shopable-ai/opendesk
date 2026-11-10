// Run only via approved OpenDesk -script from repository root; real Mac gate remains pending.
// Adapted from examples/workflows/codex-hook-demo/main.js, without another Hook listener.
const base = System.getEnv('OD_CWF_STATE_DIR') || './.runtime/tests/codex-workflow-companion';
const command = await File.readJSON(base + '/native-command.json');
if (!command || !/^[a-f0-9-]{36}$/.test(command.attemptId) ||
    !command.prompt.startsWith('OD-CWF/v1 run=')) throw Error('COMMAND_INVALID');
const record = base + '/native-' + command.attemptId + '.json';
// One-shot reservation BEFORE any irreversible input; do not repeat uncertain actions.
File.writeNew(record, JSON.stringify({attemptId:command.attemptId, state:'UNKNOWN_BEFORE_ACTION', at:new Date().toISOString()}));
const profile = await File.readJSON(base + '/profile.json');
const semantic = (s, role) => s && s.role === role &&
  ((typeof s.identifier === 'string' && !s.identifier.startsWith('REPLACE_')) ||
   (typeof s.name === 'string' && !s.name.startsWith('REPLACE_'))) &&
  Object.keys(s).every(k => ['role','identifier','name'].includes(k));
if (profile?.confirmed !== true || profile.app?.bundleId !== 'com.openai.codex' ||
    !semantic(profile.composer,'textField') || !semantic(profile.submit,'button') ||
    !(semantic(profile.newThreadIndicator,'staticText') || semantic(profile.newThreadIndicator,'heading'))) throw Error('PROFILE_NOT_CONFIRMED');
if (!App.isRunning({bundleId:'com.openai.codex'})) throw Error('CODEX_NOT_RUNNING');
const win = await window.get({app:{bundleId:'com.openai.codex'}});
const focused = await window.getActiveWindow();
if (win.id!==focused.id || win.pid!==focused.pid)throw Error('CODEX_NOT_FOREGROUND');
const previous = UI.within(win);
if (await previous.locator(profile.composer).getValue({timeout:3000})!=='')throw Error('PREVIOUS_COMPOSER_NOT_EMPTY');
if (await previous.locator(profile.newThreadIndicator).find({timeout:3000})!==null)throw Error('NEW_THREAD_ALREADY_PRESENT');
await keyboard.combination('Meta','N');
const fresh = await window.current(win);
if (fresh.id!==win.id || fresh.pid!==win.pid || !fresh.isForeground)throw Error('CODEX_WINDOW_CHANGED');
const scoped = UI.within(fresh);
await scoped.locator(profile.newThreadIndicator).waitFor({state:'exists',timeout:5000});
const composer = scoped.locator(profile.composer);
if (await composer.getValue({timeout:3000})!=='')throw Error('COMPOSER_NOT_EMPTY');
const written = await composer.setValue(command.prompt,{timeout:3000});
if (written.verified!==true || await composer.getValue({timeout:3000})!==command.prompt)throw Error('COMPOSER_NOT_VERIFIED');
const submit = scoped.locator(profile.submit);
if (await submit.find({timeout:3000})===null || (await window.current(fresh)).isForeground!==true)throw Error('SUBMIT_NOT_READY');
if (await composer.getValue({timeout:3000})!==command.prompt)throw Error('COMPOSER_CHANGED');
// No repeated tapping even when this rejects; Hook receipt is independent evidence.
await submit.tap({timeout:3000});
console.log('CWF_NATIVE_ACTION_RETURNED_NOT_SUBMISSION_PROOF=' + command.attemptId);
