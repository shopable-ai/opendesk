// S12 scenario setup: prepare an independently observable zero before Candidate.
// Counts inside the scenario's bounded Calculator native action allowance.
'use strict';
const resolved = await window.get({app:{bundleId:'com.apple.calculator'}});
if (resolved.title !== 'Calculator' || resolved.width !== 232 || resolved.height !== 321
    || !resolved.id || resolved.id.endsWith(':unresolved')
    || resolved.pid <= 0 || resolved.handle <= 0) {
  throw new Error('Unsupported Calculator preparation target');
}
const win = await window.activate(resolved,{timeout:1000});
function flatten(node) { return [node].concat(...(node.children || []).map(flatten)); }
function identity(current) {
  if (current.id !== win.id || current.pid !== win.pid || current.handle !== win.handle
      || current.title !== 'Calculator' || current.width !== 232 || current.height !== 321
      || current.x !== win.x || current.y !== win.y
      || !current.isForeground || !current.hasFocus) {
    throw new Error('Calculator preparation window changed');
  }
}
identity(await window.current(win));
console.log(JSON.stringify({phase:'preparation-focus',window:win}));
const receipts=[];
let allClear=false;
for(let press=0;press<2;press+=1) {
  identity(await window.current(win));
  const snapshot=await Accessibility.snapshot({within:win,maxDepth:16,maxNodes:300,
    properties:['role','name','enabled','actions','value']});
  if(!snapshot.complete||snapshot.truncated) throw new Error('Incomplete preparation snapshot');
  const matches=flatten(snapshot.root).filter(n=>n.role==='button'
    && ['清除','全部清除'].includes(n.name));
  if(matches.length!==1||matches[0].enabled!==true
      || !matches[0].actions.includes('invoke')) throw new Error('Clear target ambiguous');
  const name=matches[0].name;
  const receipt=await UI.tapTargets([{role:'button',name}],{within:win});
  console.log(JSON.stringify({phase:'preparation-receipt',name,receipt}));
  const item=receipt && receipt.completed && receipt.completed[0];
  if(!receipt.ok||receipt.completed.length!==1||item.actionState!=='acknowledged'
      ||item.backend!=='macos-ax'||item.target.locator.name!==name||!item.requestId) {
    throw new Error('Unconfirmed preparation input; observe before any further action');
  }
  receipts.push(receipt);
  if(name==='全部清除'){allClear=true;break;}
}
if(!allClear) throw new Error('Bounded preparation C→AC did not complete');
identity(await window.current(win));
const first=await UI.readText({within:win});
const second=await UI.readText({within:win});
if(first!=='0'||second!=='0') throw new Error('Preparation did not yield stable zero');
console.log(JSON.stringify({phase:'preparation-clean',actual:second,receipts}));
