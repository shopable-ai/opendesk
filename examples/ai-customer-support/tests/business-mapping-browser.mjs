// From the repository root, after the leader builds preview:
// PLAYWRIGHT_CHROMIUM_EXECUTABLE='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' node examples/ai-customer-support/tests/business-mapping-browser.mjs
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {chromium} from 'playwright';

const root=resolve(import.meta.dirname,'..'),repo=resolve(root,'../..');
const evidence=process.env.SUPPORT_TEST_EVIDENCE||join(repo,'.runtime/tests/ai-customer-support/mapping-20261030/browser');
const previewPath=join(root,'preview/index.html');
const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');
const htmlSha256Before=sha256(await readFile(previewPath));
let htmlSha256=null,htmlSha256After=null;
const executablePath=process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE;
assert.ok(executablePath,'Set PLAYWRIGHT_CHROMIUM_EXECUTABLE to the local Chrome executable; this test never builds preview.');
await mkdir(evidence,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath});
const context=await browser.newContext({viewport:{width:1280,height:900},locale:'zh-CN',acceptDownloads:true});
const page=await context.newPage();
page.setDefaultTimeout(10000);
const errors=[],network=[],dialogs=[],downloads=[],scenarios=[];
context.on('page',p=>{
  if(p!==page)errors.push('Unexpected popup: '+p.url());
});
context.on('request',r=>{if(/^(https?|wss?):/i.test(r.url()))network.push(r.url());});
page.on('pageerror',e=>errors.push(e.message));
page.on('dialog',async d=>{dialogs.push({type:d.type(),message:d.message()});await d.dismiss();});
page.on('download',d=>downloads.push(d.suggestedFilename()));
const button=name=>page.getByRole('button',{name,exact:true});
const field=name=>page.getByLabel(name,{exact:true});
const mapping=page.getByRole('region',{name:'数据处理方案',exact:true});
const review=field('业务同步预检');
const status=text=>page.getByRole('status').filter({hasText:text}).waitFor();
const shot=async(name,target=mapping)=>{await target.scrollIntoViewIfNeeded();await page.screenshot({path:join(evidence,name+'.png'),fullPage:true});};
async function openMappings(){
  const business=button('业务数据与同步');
  if(await business.getAttribute('aria-expanded')==='false')await business.click();
  const heading=button('数据处理方案');
  await heading.waitFor({state:'visible'});
  if(await heading.getAttribute('aria-expanded')==='false')await heading.click();
}
async function backup(name){
  const pending=page.waitForEvent('download');
  await button('导出业务备份').click();
  const download=await pending,path=join(evidence,name+'.json');
  await download.saveAs(path);
  return JSON.parse(await readFile(path,'utf8'));
}
async function trial(){
  await button('试跑（不写入资料）').click();
  await status('试跑通过：');
  return JSON.parse(await field('方案试跑输出').inputValue());
}
async function disabled(name,value=true){assert.equal(await button(name).isDisabled(),value,name);}
async function draft(value){assert.equal(await field('模拟聊天草稿').inputValue(),value,'mapping must preserve the current manual draft');}
const source='mapping-browser-products',customerSource='mapping-browser-customers';
const manualDraft='人工待发送草稿：请勿被方案试跑、预检或应用覆盖';
const hostile='<script>globalThis.__mappingScriptRan=true;alert("mapping-script")</script><img src="https://mapping.invalid/probe" onerror="globalThis.__mappingScriptRan=true">';
try{
  // Exactly one local preview. No server, build, injected business state, or storage fixtures.
  const response=await page.goto(pathToFileURL(previewPath).href);
  assert.ok(response,'local preview must return a main document response');
  htmlSha256=sha256(await response.body());
  assert.equal(htmlSha256,htmlSha256Before,'preview changed between initial hash and navigation');
  await field('模拟聊天草稿').fill(manualDraft);
  await button('打开设置').click();
  await openMappings();
  await shot('00-product-template',field('方案名称'));
  const baseline=await backup('before-trial');
  assert.equal(await field('处理资料模板').inputValue(),'product');
  assert.equal(await field('对应字段 name').inputValue(),'title');
  await field('方案来源').fill(source);
  await field('方案名称').fill('浏览器商品方案');
  const sample=JSON.parse(await field('方案输入 JSON').inputValue())[0];
  const product={...sample,id:'browser-mapped-mug',title:'浏览器回归马克杯',summary:hostile};
  // Renamed top-level input key, with a row-2 failure reporting the output field.
  const {title,...rest}=product;
  const renamed={...rest,product_title:title};
  await field('对应字段 name').fill('product_title');
  await field('方案输入 JSON').fill(JSON.stringify([renamed,{...renamed,id:'browser-invalid-mug',version:'bad-version'}]));
  await button('试跑（不写入资料）').click();
  await status(/试跑失败：.*第 2 行.*version/);
  await disabled('保存处理方案');await disabled('使用方案并预检');
  await shot('01-row-two-field-error');
  await field('方案输入 JSON').fill('globalThis.__mappingScriptRan=true; alert("raw-input")');
  await button('试跑（不写入资料）').click();
  await status(/试跑失败：.*JSON/);
  await disabled('保存处理方案');
  await field('对应字段 name').fill('globalThis.__mappingScriptRan=true');
  await field('方案输入 JSON').fill(JSON.stringify([renamed]));
  await button('试跑（不写入资料）').click();
  await status(/试跑失败：.*name/);
  await field('对应字段 name').fill('product_title');
  const output=await trial();
  assert.equal(output.records[0].data.name,title);
  assert.equal(output.records[0].data.summary,hostile);
  assert.deepEqual(await backup('after-trial'),baseline,'trial must not change records or cursors');
  await draft(manualDraft);
  scenarios.push('product-template-renamed-field-row-number','script-input-is-data','trial-no-write');

  await button('保存处理方案').click();await status('已保存方案，默认停用');
  await button('启用方案 '+source).waitFor();await disabled('使用方案并预检');
  await button('启用方案 '+source).click();await disabled('使用方案并预检',false);
  await button('使用方案并预检').click();await review.waitFor();
  await draft(manualDraft);await shot('02-preflight-before-cancel',review);
  await button('取消同步预检').click();await review.waitFor({state:'hidden'});
  assert.deepEqual(await backup('after-cancel'),baseline,'cancel must preserve records and applied cursor');
  await button('使用方案并预检').click();await review.waitFor();
  // Unmount the entire business section while A is pending. Reopening resets the
  // editor, so its old preview must never remain confirmable behind that reset.
  await button('业务数据与同步').click();
  assert.equal(await button('业务数据与同步').getAttribute('aria-expanded'),'false');
  await openMappings();
  assert.equal(await review.count(),0,'reopening business data must discard pending preview A');
  assert.equal(await button('确认应用同步页').count(),0,'old preview A must no longer be confirmable');
  const afterReopen=await backup('after-pending-preview-reopen');
  assert.deepEqual(afterReopen,baseline,'collapsing and reopening cannot apply A or advance its cursor');
  assert.equal(afterReopen.records.some(r=>r.storeId==='store-demo'&&r.sourceId===source&&r.id===product.id),false);
  assert.equal(afterReopen.cursors[JSON.stringify(['store-demo',source])],undefined);
  await draft(manualDraft);
  await shot('02-pending-preview-cleared-on-reopen',field('方案名称'));
  scenarios.push('business-section-unmount-cancels-pending-preview');
  // Explicitly select A again and rerun it after the editor reset.
  await button('载入方案 '+source).click();
  await field('方案输入 JSON').fill(JSON.stringify([renamed]));await trial();
  await button('使用方案并预检').click();await review.waitFor();
  await button('确认应用同步页').click();await review.waitFor({state:'hidden'});
  const applied=await backup('after-product-apply');
  assert.equal(applied.cursors[JSON.stringify(['store-demo',source])],'mapping-v1');
  assert.equal(applied.records.filter(r=>r.storeId==='store-demo'&&r.sourceId===source&&r.id===product.id).length,1);
  await draft(manualDraft);
  await button('停用方案 '+source).click();await disabled('使用方案并预检');
  assert.deepEqual(await backup('after-disable'),applied,'disable must retain applied business data');
  scenarios.push('save-disabled-enable-preview-cancel-repreview-apply','disable-retains-data','manual-draft-protected');

  // Scheme export is a textarea transfer, not a browser download.
  await mapping.getByText('方案备份与恢复',{exact:true}).click();
  const downloadCount=downloads.length;
  await button('导出方案 '+source).click();
  const exported=await field('方案备份 JSON').inputValue(),plan=JSON.parse(exported);
  assert.equal(downloads.length,downloadCount,'scheme export must not download');
  assert.deepEqual(Object.keys(plan).sort(),['schemaVersion','name','storeId','sourceId','kind','fields'].sort());
  assert.equal(plan.storeId,'store-demo');assert.equal(plan.sourceId,source);
  assert.equal(plan.fields.name,'product_title');
  assert.ok(!exported.includes(manualDraft)&&!exported.includes(hostile)&&!exported.includes(product.id));
  await button('启用方案 '+source).click();
  await field('方案备份 JSON').fill(JSON.stringify({...plan,name:'恢复后的同来源商品方案'}));
  await button('恢复方案（停用）').click();await status('已恢复方案，默认停用');
  await button('启用方案 '+source).waitFor();
  assert.equal(await button('载入方案 '+source).count(),1,'same-store/source restore replaces rather than duplicates');
  assert.match(await mapping.locator('.mapping-saved').innerText(),/恢复后的同来源商品方案 · 已停用/);
  assert.deepEqual(await backup('after-plan-restore'),applied,'restoring config cannot change business data');
  await shot('03-restored-disabled');
  scenarios.push('textarea-export-no-input-or-draft','same-store-source-restore-disabled');

  await button('← 返回').click();await page.getByRole('tab',{name:'商品',exact:true}).click();
  await button('查看商品：'+title+' · '+sample.sku).click();
  assert.equal(await page.locator('#odiv-products .product-detail-name').innerText(),title);
  assert.equal(await page.locator('#odiv-products .product-detail-desc').innerText(),hostile);
  assert.equal(await page.locator('#odiv-products .product-detail-price').innerText(),sample.price);
  await page.screenshot({path:join(evidence,'04-product-real-display.png'),fullPage:true});
  await draft(manualDraft);
  assert.equal(await page.evaluate(()=>globalThis.__mappingScriptRan),undefined);
  scenarios.push('applied-product-visible-hostile-text-inert');

  await button('打开设置').click();await openMappings();
  await field('处理资料模板').selectOption('customer');
  await field('对应字段 notes').waitFor({state:'visible'});
  assert.equal(await field('对应字段 sku').count(),0);
  await field('方案来源').fill(customerSource);
  const customer=JSON.parse(await field('方案输入 JSON').inputValue())[0];
  customer.id='browser-mapped-customer';customer.name='浏览器回归客户';customer.notes=hostile;
  await field('方案输入 JSON').fill(JSON.stringify([customer]));
  const customerOutput=await trial();assert.equal(customerOutput.records[0].kind,'customer');
  assert.equal(customerOutput.records[0].data.notes,hostile);
  assert.deepEqual(await backup('after-customer-trial'),applied);
  await button('保存处理方案').click();await button('启用方案 '+customerSource).click();
  await button('使用方案并预检').click();await review.waitFor();
  // Switching shops invalidates a pending preview and resets the editor binding.
  await field('数据店铺').selectOption('store-outlet');await openMappings();
  await review.waitFor({state:'hidden'});await disabled('保存处理方案');await disabled('使用方案并预检');
  assert.equal(await mapping.locator('.mapping-saved .business-record').count(),0);
  assert.equal(await field('模拟聊天草稿').inputValue(),'');
  await mapping.getByText('方案备份与恢复',{exact:true}).click();
  await field('方案备份 JSON').fill(exported);await button('恢复方案（停用）').click();
  await status('方案店铺不同');
  assert.equal(await mapping.locator('.mapping-saved .business-record').count(),0);
  await button('← 返回').click();await page.getByRole('tab',{name:'商品',exact:true}).click();
  assert.equal(await button('查看商品：'+title+' · '+sample.sku).count(),0);
  await field('数据店铺').selectOption('store-demo');await draft(manualDraft);
  await button('打开设置').click();await openMappings();
  assert.equal(await mapping.locator('.mapping-saved .business-record').count(),2);
  await button('载入方案 '+customerSource).click();
  // Loading a saved configuration intentionally replaces input with its fictional sample.
  await field('方案输入 JSON').fill(JSON.stringify([customer]));await trial();
  await button('使用方案并预检').click();await review.waitFor();
  await button('确认应用同步页').click();await review.waitFor({state:'hidden'});
  await field('管理资料类型').selectOption('customer');
  await button('编辑资料 '+customer.id).waitFor();
  const finalBackup=await backup('after-customer-apply');
  assert.equal(finalBackup.cursors[JSON.stringify(['store-demo',customerSource])],'mapping-v1');
  assert.equal(finalBackup.records.find(r=>r.sourceId===customerSource&&r.id===customer.id).data.notes,hostile);
  assert.deepEqual(finalBackup.records.filter(r=>r.storeId==='store-outlet'),baseline.records.filter(r=>r.storeId==='store-outlet'));
  assert.ok(!JSON.stringify(finalBackup).includes(manualDraft));await draft(manualDraft);
  scenarios.push('customer-template-apply','shop-isolation-and-pending-preview-invalidation','cross-shop-restore-rejected');

  await page.setViewportSize({width:380,height:820});await shot('05-mapping-380');
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2),'mapping settings overflow at 380px');
  await shot('05-mapping-fields-380',field('方案名称'));
  await shot('05-mapping-saved-380',button('载入方案 '+customerSource));
  await button('← 返回').click();
  const tabs=page.getByRole('tab');assert.equal(await tabs.count(),6);
  for(const name of await tabs.allTextContents()){
    await page.getByRole('tab',{name,exact:true}).click();
    assert.equal(await page.getByRole('tab',{name,exact:true}).getAttribute('aria-selected'),'true');
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2),'tab overflow at 380px: '+name);
  }
  await page.screenshot({path:join(evidence,'06-six-tabs-380.png'),fullPage:true});
  await draft(manualDraft);
  assert.equal(await page.evaluate(()=>globalThis.__mappingScriptRan),undefined);
  assert.deepEqual(dialogs,[]);assert.deepEqual(errors,[]);assert.deepEqual(network,[]);
  scenarios.push('380px-no-overflow-six-tabs','zero-network-pageerror-dialogs');
  htmlSha256After=sha256(await readFile(previewPath));
  assert.equal(htmlSha256After,htmlSha256,'preview changed during this browser run');
  await writeFile(join(evidence,'result.json'),JSON.stringify({passed:true,preview:page.url(),htmlSha256,htmlSha256Before,htmlSha256After,scenarioCount:scenarios.length,browser:'local Chrome',native:'NOT_TESTED',scenarios,errors,network,dialogs},null,2));
  console.log(`BUSINESS_MAPPING_BROWSER_PASSED=${scenarios.length}; evidence=${evidence}; native=NOT_TESTED`);
}catch(error){
  await page.screenshot({path:join(evidence,'FAIL.png'),fullPage:true}).catch(()=>{});
  const failure=JSON.stringify({passed:false,htmlSha256,htmlSha256Before,htmlSha256After,scenarioCount:scenarios.length,scenarios,error:String(error.stack||error),errors,network,dialogs},null,2);
  await writeFile(join(evidence,'failure-'+Date.now()+'.json'),failure);
  await writeFile(join(evidence,'result.json'),failure);
  throw error;
}finally{await context.close();await browser.close();}
