// macOS TextEdit Agent-to-Recipe desktop automation.
// Run from the repository root: ./dist/opendesk ai run examples/ai-cli/macos-textedit-recipe.js --input '{...}'

const BUNDLE = 'com.apple.TextEdit';
const OUTPUT_ROOT = ['.runtime', 'desktop-automation', 'textedit', 'output'];
const STANDARD = { width: 586, height: 476, tolerance: 3 };
const POINTS = { document: [30, 28], bold: [59.6, 8.8], center: [73.2, 8.8], save: [83, 87] };
let result;

const message = error => String(error && error.message ? error.message : error);
const textFor = i => `${i.title}\n\nCustomer: ${i.customer}\nAmount: ${i.amount}\nStatus: ${i.initialStatus}`;
const finalTextFor = i => `${i.title}\n\nCustomer: ${i.customer}\nAmount: ${i.amount}\nStatus: ${i.finalStatus}`;
function write() { if (result) File.write(File.join(Execution.artifactDir, 'textedit-result.json'), JSON.stringify(result, null, 2) + '\n'); }
function requireInput(i) {
  if (!i || typeof i !== 'object' || Array.isArray(i)) throw new Error('Execution.input must be an object');
  for (const key of ['title', 'customer', 'amount', 'initialStatus', 'finalStatus', 'fileName']) {
    if (typeof i[key] !== 'string' || !i[key].trim()) throw new Error(`Execution.input.${key} must be a non-empty string`);
    if (/[\r\n]/.test(i[key])) throw new Error(`Execution.input.${key} must be one line`);
  }
  if (i.initialStatus === i.finalStatus) throw new Error('initialStatus and finalStatus must differ');
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,80}\.rtf$/.test(i.fileName) || i.fileName.includes('..')) throw new Error('fileName must be a safe simple .rtf file name');
  return i;
}
function bounds(w) { return { x:Number(w.x), y:Number(w.y), width:Number(w.width), height:Number(w.height) }; }
function near(a,b) { return Math.abs(Number(a)-Number(b)) <= STANDARD.tolerance; }
function point(w, pair) { const p=Geometry.pointPercent(w,pair[0],pair[1]); if (!Geometry.contains(Geometry.rect(w),p)) throw new Error('relative click is outside current TextEdit window'); return p; }
async function sleep(ms) { await page.waitForTimeout(ms); }
async function combo(...keys) { await keyboard.combination(...keys); await sleep(80); }
async function snapshot(name, target) { return page.screenshot({ clip: Geometry.rect(target), path: File.join(Execution.artifactDir,name), returnType:'object' }); }
async function resolveDocument(knownPids, expectedID) {
  const active=await window.getActiveWindow();
  if (!active || !knownPids.has(Number(active.pid)) || active.exeName !== 'TextEdit') throw new Error('TextEdit PID/window is not the active target');
  if (expectedID && String(active.id)!==String(expectedID)) throw new Error('TextEdit window lifecycle identity changed');
  const b=bounds(active); if (!(b.width>0 && b.height>0)) throw new Error('TextEdit bounds are invalid');
  return active;
}
async function rereadDocument(knownPids, expected) {
  const rows=await window.list();
  const candidates=rows.filter(w=>knownPids.has(Number(w.pid)));
  // TextEdit can replace a CoreGraphics window number when attaching its Save
  // sheet.  Preserve document identity through the app PID, the unique title
  // assigned to the newly-created copy, and its last verified bounds.
  const matches=candidates.filter(w=>String(w.title).includes(String(expected.title))&&Number(w.width)>400&&Number(w.height)>300&&near(w.width,expected.width)&&near(w.height,expected.height));
  result.modalParentProbe={ expected:{id:String(expected.id),title:String(expected.title),bounds:bounds(expected)}, candidates:candidates.map(w=>({id:String(w.id),title:String(w.title||''),x:Number(w.x),y:Number(w.y),width:Number(w.width),height:Number(w.height),handle:Number(w.handle)})), matchCount:matches.length };
  if (matches.length!==1) throw new Error('TextEdit document identity is unavailable while a modal surface is active');
  return matches[0];
}
async function normalize(target, pids) {
  let current=await resolveDocument(pids,target.id); let b=bounds(current);
  result.geometry={ initialBounds:b, recovery:[] };
  if (!near(b.width,STANDARD.width)||!near(b.height,STANDARD.height)) {
    await window.setWindowBounds(current.title,b.x,b.y,STANDARD.width,STANDARD.height); await sleep(250);
    result.geometry.recovery.push('restore-standard-textedit-size'); current=await resolveDocument(pids,target.id); b=bounds(current);
  }
  if (!near(b.width,STANDARD.width)||!near(b.height,STANDARD.height)) throw new Error('TextEdit toolbar geometry is not verified; fail closed');
  result.geometry.finalBounds=b; return current;
}
async function selectAndCopyAll() { await combo('cmd','a'); await combo('cmd','c'); return clipboard.paste(); }
async function documentRows(knownPids) { return (await window.list()).filter(w=>knownPids.has(Number(w.pid))&&Number(w.width)>400&&Number(w.height)>300); }
async function savePanel(knownPids) {
  const panels=(await window.list()).filter(w=>knownPids.has(Number(w.pid))&&Number(w.width)>=250&&Number(w.width)<=900&&Number(w.height)>=150&&Number(w.height)<=500);
  if (panels.length!==1) throw new Error('TextEdit Save dialog surface is not uniquely identifiable');
  return panels[0];
}
async function closeFindBar(target) {
  const done=point(target,[86,21]); await mouse.clickPoint(done); await sleep(120); return 'validated-find-done-geometry';
}
async function main() {
  const input=Execution.input;
  result={ executionId:Execution.id, application:{bundleId:BUNDLE,pid:0,windowId:''}, input, initialText:false,statusChanged:false,formatChanged:false,saveDialogObserved:false,saveButtonPressed:false,fileExists:false,fileContentVerified:false,outputFile:null,passed:false };
  try {
    requireInput(input);
    await page.ensurePermissions({capabilities:['screenCapture','accessibility'],openSettings:false});
    const before=await App.get({bundleId:BUNDLE});
    const app=await App.launch({bundleId:BUNDLE},{waitUntilReady:'window',timeout:15000});
    const pids=new Set(app.pids.map(Number));
    // Create a document even when TextEdit already had user documents. Its new active window is the sole target.
    await combo('cmd','n'); await sleep(250);
    let target=await resolveDocument(pids);
    const oldIDs=new Set(((before&&before.pids)||[]).map(Number)); // retained only as provenance, never touched.
    result.application={bundleId:BUNDLE,pid:Number(target.pid),windowId:String(target.id),windowTitle:String(target.title||''),preexistingPids:[...oldIDs]};
    target=await normalize(target,pids);
    result.initialScreenshot=(await snapshot('textedit-initial-window.png',target)).path;
    const docPoint=point(target,POINTS.document); await mouse.clickPoint(docPoint); await sleep(100); await resolveDocument(pids,target.id);
    clipboard.copy(textFor(input)); await combo('cmd','v'); await sleep(180);
    const copied=await selectAndCopyAll(); if (copied!==textFor(input)) throw new Error('clipboard full-text verification failed after document input');
    result.initialText=true; result.inputScreenshot=(await snapshot('textedit-after-input.png',await resolveDocument(pids,target.id))).path;
    // Select exactly the title and demonstrate a real toolbar click, not a formatting shortcut.
    await combo('cmd','up'); await keyboard.down('Shift'); try { for(let n=0;n<input.title.length;n+=1) await keyboard.press('ArrowRight'); } finally { await keyboard.up('Shift'); }
    await combo('cmd','c'); if (clipboard.paste()!==input.title) throw new Error('title selection proof failed');
    target=await resolveDocument(pids,target.id); const centerPoint=point(target,POINTS.center); await mouse.clickPoint(centerPoint); await sleep(160);
    // The title remains the selected paragraph.  Apply bold with a second real
    // toolbar click, then retain a target-window screenshot as visual proof.
    await combo('cmd','up'); await keyboard.down('Shift'); try { for(let n=0;n<input.title.length;n+=1) await keyboard.press('ArrowRight'); } finally { await keyboard.up('Shift'); }
    target=await resolveDocument(pids,target.id); const boldPoint=point(target,POINTS.bold); await mouse.clickPoint(boldPoint); await sleep(180);
    result.titleSelected=true; result.toolbarClicked=[{control:'Center Alignment',point:centerPoint},{control:'Bold',point:boldPoint}]; result.boldParagraph=input.title; result.formattedScreenshot=(await snapshot('textedit-after-center-bold-click.png',await resolveDocument(pids,target.id))).path;
    // Native Find locates the exact old status in the new document and leaves that match selected.
    await combo('cmd','f'); clipboard.copy(input.initialStatus); await combo('cmd','v'); await combo('cmd','g'); result.findDoneLabel=await closeFindBar(await resolveDocument(pids)); target=await resolveDocument(pids);
    await combo('cmd','c'); result.statusSelection=clipboard.paste(); if (result.statusSelection!==input.initialStatus) throw new Error('status selection is not exact');
    clipboard.copy(input.finalStatus); await combo('cmd','v'); await sleep(150);
    const finalClipboard=await selectAndCopyAll(); if (finalClipboard!==finalTextFor(input) || finalClipboard.includes(input.initialStatus)) throw new Error('clipboard status-change verification failed');
    result.statusChanged=true; result.formatChanged=true; result.finalClipboardVerified=true;
    const outputDir=File.join(Execution.workdir,...OUTPUT_ROOT); File.ensureDir(outputDir); const outputFile=File.join(outputDir,input.fileName); if (File.exists(outputFile)) File.remove(outputFile); result.outputFile=outputFile;
    // On macOS 12 TextEdit, Cmd+Shift+S is Duplicate.  Observe the actual new
    // document by list-diff rather than trusting a transient active AX window,
    // then keep its identity for the subsequent real Save As panel.
    const beforeSaveDocs=await documentRows(pids); const beforeSaveIDs=new Set(beforeSaveDocs.map(w=>String(w.id)));
    await combo('cmd','shift','s'); await sleep(220);
    const createdDocs=(await documentRows(pids)).filter(w=>!beforeSaveIDs.has(String(w.id)));
    if (createdDocs.length!==1) throw new Error('Cmd+Shift+S did not create one identifiable TextEdit duplicate');
    target=createdDocs[0]; result.cmdShiftS={observed:'duplicate',createdNewWindow:true,document:{id:String(target.id),title:String(target.title),bounds:bounds(target)}};
    await combo('cmd','shift','alt','s'); await sleep(350);
    // Expand the independent Save panel through its Location disclosure, then
    // use its Go to Folder surface to select the declared output root.  Enter
    // confirms only that directory chooser; saving below remains a real click.
    let panel=await savePanel(pids); const locationDisclosure=point(panel,[91,40]); await mouse.clickPoint(locationDisclosure); await sleep(220);
    await combo('cmd','shift','g'); await sleep(350);
    clipboard.copy(outputDir); await combo('cmd','v'); await keyboard.press('Enter'); await sleep(350); result.goToFolderConfirmed=outputDir;
    result.saveDialogObserved=true;
    clipboard.copy(input.fileName); await combo('cmd','v');
    target=await rereadDocument(pids,target); panel=await savePanel(pids); result.savePanel={id:String(panel.id),bounds:bounds(panel),title:String(panel.title||'')}; result.saveDialogScreenshot=(await snapshot('textedit-save-as-panel.png',panel)).path;
    const savePoint=point(panel,Number(panel.width)>400?[93,93]:POINTS.save); await mouse.clickPoint(savePoint); result.saveButtonPressed=true; await sleep(700);
    result.fileExists=File.exists(outputFile); if (!result.fileExists) throw new Error('Save button did not create the expected TextEdit RTF file in the output root');
    const content=File.read(outputFile); if (!content.includes(input.title)||!content.includes(input.customer)||!content.includes(input.amount)||!content.includes(input.finalStatus)) throw new Error('RTF file content verification failed');
    result.fileContentVerified=true;
    await page.openURLInApp('TextEdit',outputFile); await sleep(450); const reopened=await resolveDocument(pids); result.reopenScreenshot=(await snapshot('textedit-reopened-file.png',reopened)).path; result.reopened=true;
    result.passed=true; write(); console.log(JSON.stringify({executionId:Execution.id,artifactDir:Execution.artifactDir,outputFile,passed:true}));
  } catch(error) { result.error=message(error); result.passed=false; write(); throw error; }
}
main();
