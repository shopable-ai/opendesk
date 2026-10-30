import assert from 'node:assert/strict';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {chromium} from 'playwright';
import {build} from 'esbuild';
const root=resolve(import.meta.dirname,'..'),repo=resolve(root,'../..');
const evidence=process.env.SUPPORT_TEST_EVIDENCE||join(repo,'.runtime/tests/ai-customer-support/workspace-20261030/browser-workspace');
await mkdir(evidence,{recursive:true});
const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE}:{})});
const context=await browser.newContext({viewport:{width:1280,height:900}}),page=await context.newPage();
const errors=[];page.on('pageerror',e=>errors.push(e.message));
const url=pathToFileURL(join(root,'preview/index.html')).href;
const settings=()=>page.getByRole('button',{name:'打开设置',exact:true}).click();
const button=name=>page.getByRole('button',{name,exact:true});
const status=page.locator('.workspace-status');
const rows=()=>page.evaluate(()=>new Promise((resolve,reject)=>{const r=indexedDB.open('opendesk-support-business-v1',1);r.onerror=()=>reject(Error('open'));r.onsuccess=()=>{const db=r.result,q=db.transaction('versions').objectStore('versions').getAll();q.onsuccess=()=>{db.close();resolve(q.result);};};}));
try{
 await page.goto(url);await settings();
 assert.equal(await page.getByRole('checkbox',{name:'启用自动保存'}).isChecked(),false);
 await page.waitForTimeout(1200);
 assert.equal(await page.evaluate(async()=> (await indexedDB.databases()).some(d=>d.name==='opendesk-support-business-v1')),false);
 await button('新增店铺').click();
 await page.getByLabel('新增店铺 ID',{exact:true}).fill('saved-shop');await page.getByLabel('新增店铺名称',{exact:true}).fill('持久化测试店');await button('保存店铺').click();
 await button('保存工作区').click();await status.filter({hasText:'工作区已保存'}).waitFor();
 let saved=await rows();assert.equal(saved.length,1);
 const backup=JSON.parse(saved[0].text);assert.ok(backup.stores.some(s=>s.id==='saved-shop'));
 assert.deepEqual(Object.keys(backup).sort(),['schemaVersion','format','revision','stores','records','overrides','cursors'].sort());
 await page.reload();await settings();assert.equal(await page.getByRole('checkbox',{name:'启用自动保存'}).isChecked(),false);
 assert.equal(await page.getByRole('combobox',{name:'数据店铺',exact:true}).locator('option[value="saved-shop"]').count(),0);
 await button('刷新工作区版本').click();await status.filter({hasText:'已刷新'}).waitFor();
 page.once('dialog',d=>d.dismiss());await button('恢复工作区版本 1').click();await status.filter({hasText:'已取消恢复'}).waitFor();
 assert.equal(await page.getByRole('combobox',{name:'数据店铺',exact:true}).locator('option[value="saved-shop"]').count(),0);
 page.once('dialog',d=>d.accept());await button('恢复工作区版本 1').click();await status.filter({hasText:'工作区已恢复'}).waitFor();
 assert.equal(await page.getByRole('combobox',{name:'数据店铺',exact:true}).locator('option[value="saved-shop"]').count(),1);
 for(let i=0;i<4;i++){await button('保存工作区').click();await status.filter({hasText:'工作区已保存'}).waitFor();}
 saved=await rows();assert.equal(saved.length,3);assert.equal(Math.max(...saved.map(r=>r.generation)),5);
 // Corrupt only the latest saved payload; prior versions must remain restorable.
 await page.evaluate(()=>new Promise(resolve=>{const r=indexedDB.open('opendesk-support-business-v1',1);r.onsuccess=()=>{const db=r.result,tx=db.transaction('versions','readwrite'),s=tx.objectStore('versions'),q=s.getAll();q.onsuccess=()=>{const last=q.result.sort((a,b)=>b.generation-a.generation)[0];s.put({...last,text:'{"schemaVersion":99}'});};tx.oncomplete=()=>{db.close();resolve();};};}));
 await button('刷新工作区版本').click();await status.filter({hasText:'已刷新'}).waitFor();
 assert.equal(await page.getByRole('button',{name:'恢复工作区版本 5'}).isDisabled(),true);
 page.once('dialog',d=>d.accept());await button('恢复工作区版本 4').click();await status.filter({hasText:'工作区已恢复'}).waitFor();
 // Real IndexedDB contract: two concurrent writers and a rotated selection.
 const bundle=await build({entryPoints:[join(root,'src/browser-workspace.ts')],bundle:true,write:false,platform:'browser',format:'iife',globalName:'WorkspaceTest'});
 await page.addScriptTag({content:bundle.outputFiles[0].text});
 const concurrency=await page.evaluate(async text=>{const w=WorkspaceTest,before=await w.listBrowserWorkspace();
  const selected=before.versions.find(v=>v.valid);
  const outcomes=await Promise.allSettled([w.saveBrowserWorkspace(text,before.token),w.saveBrowserWorkspace(text,before.token)]);
  for(let i=0;i<3;i++){const index=await w.listBrowserWorkspace();await w.saveBrowserWorkspace(text,index.token);}
  let stale=false;try{await w.readBrowserWorkspace(selected.id,selected.generation);}catch{stale=true;}
  return {fulfilled:outcomes.filter(r=>r.status==='fulfilled').length,stale};
 },saved.find(r=>r.generation===4).text);
 assert.deepEqual(concurrency,{fulfilled:1,stale:true});
 await button('刷新工作区版本').click();await status.filter({hasText:'已刷新'}).waitFor();
 page.once('dialog',d=>d.accept());await page.getByRole('checkbox',{name:'启用自动保存'}).check();
 await status.filter({hasText:'工作区已保存'}).waitFor();
 const beforeAuto=await rows();
 await button('新增店铺').click();
 await page.getByLabel('新增店铺 ID',{exact:true}).fill('auto-shop');await page.getByLabel('新增店铺名称',{exact:true}).fill('自动保存测试店');await button('保存店铺').click();
 await status.filter({hasText:'工作区已保存'}).waitFor();
 await page.waitForFunction(async previous=>{const db=await new Promise(resolve=>{const r=indexedDB.open('opendesk-support-business-v1');r.onsuccess=()=>resolve(r.result);});const rs=await new Promise(resolve=>{const q=db.transaction('versions').objectStore('versions').getAll();q.onsuccess=()=>resolve(q.result);});db.close();return Math.max(...rs.map(r=>r.generation))>previous;},Math.max(...beforeAuto.map(r=>r.generation)));
 await page.getByRole('checkbox',{name:'启用自动保存'}).uncheck();
 // Real IDB contention drives both sides of the asynchronous save boundary.
 const hold=mode=>page.evaluate(mode=>new Promise((resolve,reject)=>{
  const r=indexedDB.open('opendesk-support-business-v1');r.onerror=()=>reject(r.error);
  r.onsuccess=()=>{const db=r.result,tx=db.transaction('versions',mode),store=tx.objectStore('versions');
   window.__releaseWorkspace=false;window.__workspaceReleased=false;window.__saveWriteAttempted=false;
   const original=IDBDatabase.prototype.transaction;
   IDBDatabase.prototype.transaction=function(...args){if(args[1]==='readwrite')window.__saveWriteAttempted=true;return original.apply(this,args);};
   window.__restoreWorkspaceTransaction=()=>{IDBDatabase.prototype.transaction=original;};
   let ready=false;
   const pump=()=>{const q=store.get(0);q.onsuccess=()=>{if(!window.__releaseWorkspace)pump();if(!ready){ready=true;resolve();}};q.onerror=()=>reject(q.error);};
   tx.oncomplete=()=>{db.close();window.__workspaceReleased=true;};tx.onabort=()=>reject(tx.error);pump();
  };
 }),mode);
 const release=async()=>{await page.evaluate(()=>{window.__releaseWorkspace=true;window.__restoreWorkspaceTransaction();});await page.waitForFunction(()=>window.__workspaceReleased);};
 const addStore=async(id,name)=>{await page.getByLabel('新增店铺 ID',{exact:true}).fill(id);await page.getByLabel('新增店铺名称',{exact:true}).fill(name);await button('保存店铺').click();};
 let beforeDelayed=await rows();
 await hold('readwrite');await button('保存工作区').click();await status.filter({hasText:'正在保存'}).waitFor();
 await addStore('late-before','读取期间新增店');await release();await status.filter({hasText:'本次保存取消'}).waitFor();
 assert.deepEqual(await rows(),beforeDelayed,'Preparation race must not publish stale data');
 await button('保存工作区').click();await status.filter({hasText:'工作区已保存'}).waitFor();
 await hold('readonly');await button('保存工作区').click();await page.waitForFunction(()=>window.__saveWriteAttempted);
 await addStore('late-after','发布期间新增店');await release();await status.filter({hasText:'当前修改尚未保存'}).waitFor();
 let delayed=await rows();let latest=delayed.sort((a,b)=>b.generation-a.generation)[0];
 assert.equal(JSON.parse(latest.text).stores.some(s=>s.id==='late-after'),false);
 assert.equal(await page.getByRole('combobox',{name:'数据店铺',exact:true}).locator('option[value="late-after"]').count(),1);
 await button('保存工作区').click();await status.filter({hasText:'工作区已保存'}).waitFor();
 latest=(await rows()).sort((a,b)=>b.generation-a.generation)[0];assert.ok(JSON.parse(latest.text).stores.some(s=>s.id==='late-after'));
 // Controlled quota fault in a real transaction: no prior slot may be changed.
 const beforeFailure=await rows();
 await page.evaluate(()=>{const original=IDBObjectStore.prototype.put;IDBObjectStore.prototype.put=function(...args){if(this.name==='versions')throw new DOMException('test quota','QuotaExceededError');return original.apply(this,args);};window.__restoreWorkspacePut=()=>{IDBObjectStore.prototype.put=original;};});
 await addStore('quota-shop','故障后仍在页面');
 page.once('dialog',d=>d.accept());await page.getByRole('checkbox',{name:'启用自动保存'}).check();
 await status.filter({hasText:'保存失败或结果未知'}).waitFor();
 assert.equal(await page.getByRole('checkbox',{name:'启用自动保存'}).isChecked(),false);
 assert.deepEqual(await rows(),beforeFailure,'Quota abort must retain the prior committed versions');
 assert.equal(await page.getByRole('combobox',{name:'数据店铺',exact:true}).locator('option[value="quota-shop"]').count(),1);
 await page.evaluate(()=>window.__restoreWorkspacePut());
 await page.setViewportSize({width:380,height:820});await page.locator('.business-workspace').scrollIntoViewIfNeeded();await page.screenshot({path:join(evidence,'workspace-380.png')});
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2));
 assert.deepEqual(errors,[]);
 await writeFile(join(evidence,'result.json'),JSON.stringify({passed:true,scenarios:['default-no-write','explicit-save','reload-explicit-restore','cancel-no-side-effect','three-versions','corrupt-latest-fallback','real-indexeddb-CAS','restore-generation-binding','opt-in-autosave','save-preparation-race-no-publish','save-publication-race-stays-dirty','quota-fault-rollback-and-auto-stop','380-no-overflow'],errors},null,2));
 console.log('WORKSPACE_BROWSER_SMOKE_PASSED=13; real IndexedDB; native=NOT_TESTED');
}catch(error){await page.screenshot({path:join(evidence,'FAIL.png')});throw error;}finally{await context.close();await browser.close();}
