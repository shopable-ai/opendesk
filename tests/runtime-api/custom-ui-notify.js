// From repository root, with matching Runtime and native host:
// ./dist/opendesk -ui -script tests/runtime-api/custom-ui-notify.js -console-mode script
'use strict';
const assert = (ok, message) => { if (!ok) throw new Error(message); };
const expect = async (fn, code) => { let error; try { await fn(); } catch (e) { error = e; } assert(error && error.code === code, 'expected ' + code + ', got ' + String(error)); };
assert(typeof ui.notify === 'function', 'notify is not registered');
assert(ui.getCapabilities().enabled && ui.getCapabilities().available, 'matching enabled native host required');
for (const options of [null, {}, {message:''}, {message:'x',timeoutMs:-1}, {message:'x',timeoutMs:0.5}, {message:'x',progress:{value:2}}, {message:'x',unknown:true}, {message:'x',position:{mode:'absolute',x:1}}, {message:'x',position:{mode:'auto',x:1}}]) {
  await expect(() => ui.notify(options), 'INVALID_SPEC');
}
let hint;
try {
  hint = await ui.notify({message:'初始步骤',timeoutMs:0});
  const first = await hint.getState();
  assert(first.visible && first.nativeWindowId > 0 && first.notification.message === '初始步骤' && first.notification.closable, 'persistent native creation/readback');
  if (System.getPlatformInfo().os === 'darwin') assert(first.bounds.width === 280, 'short notification did not use the minimum native width');
  assert(first.bounds.height >= 52 && first.bounds.height <= 124, 'persistent height is outside the bounded layout');
  const expanded = await hint.update({
    message:'这是一条足够长的通知内容，用于确认同一个原生提示句柄会按平台字体扩展宽度，并且不会超过受控的最大宽度。'.repeat(2),
    caption:'长 caption 同样参与宽度测量，但视觉显示仍限制为两行。'.repeat(2),
  });
  assert(expanded.applied && expanded.state.nativeWindowId === first.nativeWindowId && expanded.state.bounds.width > first.bounds.width, 'long content did not expand in place');
  if (System.getPlatformInfo().os === 'darwin') assert(expanded.state.bounds.width === 480, 'long notification did not stop at the maximum native width');
  const result = await hint.update({message:'第 2 步',caption:'',progress:{min:0,max:5,value:1}});
  assert(result.applied && result.state.notification.progress.value === 1 && result.state.nativeWindowId === first.nativeWindowId, 'in-place update');
  assert(result.state.bounds.width < expanded.state.bounds.width, 'short update did not shrink in place');
  if (System.getPlatformInfo().os === 'darwin') assert(result.state.bounds.width === 280, 'short update did not return to the minimum native width');
  assert(result.state.bounds.height >= first.bounds.height && result.state.bounds.height <= 124, 'progress layout did not remain bounded');
  await expect(() => hint.update({progress:{min:0,max:1,value:2}}), 'INVALID_SPEC');
  assert((await hint.getState()).notification.progress.value === 1, 'failed patch mutated state');
  await hint.update({timeoutMs:300,timeoutProgress:true});
  const closed = await hint.waitUntilClosed();
  assert(closed.status === 'closed', 'timeout did not close');
  assert(!(await hint.update({message:'late'})).applied, 'closed hint resurrected');
  await hint.close();
  for (let i=0;i<20;i++){const transient=await ui.notify({message:'cleanup '+i,timeoutMs:0});await transient.close();}
  console.log('CUSTOM_UI_NOTIFY_PASS');
} finally { if (hint) await hint.close(); }
