'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const crypto = require('node:crypto');
const reader = require('../../scripts/api-docs');
const config = require('../../scripts/api-docs-map');
const root = path.resolve(__dirname, '../..');
const out = path.join(root, '.runtime/tests/api-docs');
fs.mkdirSync(out, {recursive: true});
const digest = s => crypto.createHash('sha256').update(s).digest('hex');
const read = (d, m, types = false) => reader.readContract(root, d, m, types);

test('headings ignore fenced examples and preserve duplicate anchors/ranges', () => {
  const d = reader.parseMarkdown('# A\n```md\n## false\n```\n## 值\nx\n### 细节\ny\n## 值\nz');
  assert.deepEqual(d.headings.map(h => h.anchor), ['a', '值', '细节', '值-1']);
  assert.equal(d.headings[1].end, 8);
});
test('reject unknown paths, methods and sections rather than guessed contract', () => {
  for (const [d, m] of [['../file','File.read'], ['file','File.notAnAPI'], ['file','#missing'], ['page','page.ensureMacPermissions']]) assert.throws(() => read(d, m));
});
test('readJSON includes shared errors/cancellation without all File methods', () => {
  const p = read('file', 'File.readJSON');
  for (const s of ['FileJSONError', 'JSON_PARSE_FAILED', 'committed', 'defaultValue', 'Execution.workdir']) assert.ok(p.output.includes(s), s);
  assert.ok(!p.output.includes('## File.removeDir'));
  assert.ok(p.report.returned.bytes < fs.statSync(path.join(root,'docs/api/file.md')).size);
});
test('anchor selection does not bypass JSON dependencies', () => {
  const d = reader.doc(root, 'file');
  const anchor = d.headings.find(h => h.title.startsWith('File.readJSON(')).anchor;
  assert.ok(read('file', `#${anchor}`).output.includes('JSON_PARSE_FAILED'));
});
test('selected UI text read keeps options, scope, failures but not menus', () => {
  const p = read('desktop-ui','UI.readText');
  for (const s of ['## UI.readText', '### 文本选项', '### Scope：within', '## 错误', '## 平台与能力']) assert.ok(p.output.includes(s), s);
  assert.ok(!p.output.includes('## UI.tapMenuItem'));
  assert.ok(!p.output.includes('## UI Scope locator'));
});
test('aliases and scoped methods retrieve canonical owner', () => {
  assert.ok(read('ui','ui.notify').output.includes('## ui.toast('));
  assert.ok(read('desktop-ui','scope.tapTexts').output.includes('## UI.tapTexts('));
  assert.ok(read('http','http.get').output.includes('## http.request('));
});
test('global queueMicrotask does not load URL/streams/crypto contracts', () => {
  const p = read('global-apis','queueMicrotask');
  assert.ok(!p.output.includes('## ReadableStream'));
  assert.ok(!p.output.includes('## crypto.randomUUID'));
});
test('public type closure is opt-in and returns only referenced declarations', () => {
  const p = read('file','File.readJSON',true);
  assert.ok(p.output.includes('interface OpenDeskFileJSONReadOptions'));
  assert.ok(!p.output.includes('interface OpenDeskWindowTarget'));
  assert.ok(!read('file','File.readJSON').report.programReads.some(r=>r.path.startsWith('types/')));
});
test('program reads, returned source ranges and model-load claims are separated', () => {
  const p = read('desktop-ui','UI.tapTexts');
  assert.equal(p.report.tokenUsage, null); assert.equal(p.report.modelLoaded, false); assert.equal(p.report.desktopExecuted,false);
  assert.ok(!p.report.programReads.some(r => r.path.endsWith('runtime-api.ai.json')));
  assert.deepEqual(p.report.returned,reader.size(p.output));
  for (const r of p.report.returnedRanges) {
    const src = fs.readFileSync(path.join(root,r.path),'utf8');
    assert.equal(r.sourceSha256, digest(src));
    const text = src.split('\n').slice(r.startLine-1,r.endLine).join('\n');
    assert.equal(r.bytes,Buffer.byteLength(text));
    assert.ok(p.output.includes(text));
  }
  assert.ok(p.output.trimEnd().endsWith('<!-- END_API_READING_PACKET: only a packet with this marker is complete -->'));
});
test('missing required shared section fails rather than returns partial packet', () => {
  const temp = fs.mkdtempSync(path.join(out, 'missing-'));
  fs.mkdirSync(path.join(temp,'docs/api'),{recursive:true});
  const source = fs.readFileSync(path.join(root,'docs/api/file.md'),'utf8').replace('### 错误','### 被删除错误');
  fs.writeFileSync(path.join(temp,'docs/api/file.md'),source);
  assert.throws(()=>reader.readContract(temp,'file','File.readJSON'),/SECTION_NOT_UNIQUE/);
  fs.rmSync(temp,{recursive:true});
});
test('symlink escaping permitted repository and invalid UTF-8 are rejected', () => {
  const temp = fs.mkdtempSync(path.join(out,'paths-'));
  fs.mkdirSync(path.join(temp,'docs/api'),{recursive:true});
  fs.symlinkSync(path.join(root,'docs/api/file.md'),path.join(temp,'docs/api/file.md'));
  assert.throws(()=>reader.readContract(temp,'file','File.readJSON'),/READ_OUTSIDE_ROOT/);
  fs.unlinkSync(path.join(temp,'docs/api/file.md'));
  fs.writeFileSync(path.join(temp,'docs/api/file.md'),Buffer.from([0xff]));
  assert.throws(()=>reader.readContract(temp,'file','File.readJSON'));
  fs.rmSync(temp,{recursive:true});
});
test('plan CLI produces actual range ledger without returning Reference bodies', () => {
  const data=cp.execFileSync(process.execPath,['scripts/api-docs.js','plan','file','File.readJSON'],{cwd:root,encoding:'utf8'});
  const plan=JSON.parse(data);assert.ok(plan.returnedRanges.length);assert.equal(plan.modelLoaded,false);
  assert.ok(!data.includes('```js'));
});
test('generated catalogs, local links, globals and keyMethods remain covered', () => {
  const report = reader.check(root);
  fs.writeFileSync(path.join(out,'coverage.json'),JSON.stringify(report,null,2)+'\n');
  assert.deepEqual(report.errors, []); assert.equal(report.groups,10); assert.ok(report.machineGlobals >= 41);
  assert.ok(report.sourceContractGaps.some(x=>x.name==='page.ensureMacPermissions'));
});
test('all catalogs are deterministic and expose method input/output plus effects', () => {
  for (const group of config.groups) {
    const a=reader.catalog(root,group.id);assert.equal(a,reader.catalog(root,group.id));
    if(group.id!=='entrypoints'){assert.ok(a.includes('输入 → 输出'));assert.ok(a.includes('副作用'));}
  }
});
test('catalog drift and source drift cannot silently pass', () => {
  const temp = fs.mkdtempSync(path.join(out,'drift-'));
  fs.cpSync(path.join(root,'docs/api'),path.join(temp,'docs/api'),{recursive:true});
  fs.cpSync(path.join(root,'types'),path.join(temp,'types'),{recursive:true});
  fs.appendFileSync(path.join(temp,'docs/api/agent/data.md'),'drift\n');
  assert.ok(reader.check(temp).errors.some(e=>e==='CATALOG_DRIFT docs/api/agent/data.md'));
  fs.writeFileSync(path.join(temp,'docs/api/agent/data.md'),reader.catalog(temp,'data'));
  fs.appendFileSync(path.join(temp,'docs/api/file.md'),'\nsource revision\n');
  assert.ok(reader.check(temp).errors.some(e=>e==='CATALOG_DRIFT docs/api/agent/data.md'));
  fs.rmSync(temp,{recursive:true});
});
test('catalog/source mismatch is detected', () => {
  assert.deepEqual(reader.checkLinks(root,'docs/api/agent/README.md','[x](../file.md#not-existing)'),['ANCHOR_MISSING docs/api/agent/README.md -> ../file.md#not-existing']);
});

test('three document-only discovery demonstrations record actual ranges and costs', () => {
  const cases = [
    {id:'desktop-value', input:'确认指定应用当前显示的订单号，只观察，不输入，不猜值。', groups:['targets','elements'], selected:[['window','window.get'],['desktop-ui','UI.readText']], rationale:'由应用身份进入窗口目录；由显示文字取值进入桌面目标目录。若要求原生输入框 value，应另比较 getValue；不把 OCR 或 accessible name 当原生 value。'},
    {id:'json-save-as', input:'读取一份配置数据，校验字段后另存结果，不覆盖原文件或任何已有输出。', groups:['data'], selected:[['file','File.readJSON'],['file','File.writeNew']], rationale:'比较 File.read/readJSON 和 File.write/writeJSON/writeNew。readJSON 负责解析而不负责业务 schema；字段校验与 JSON.stringify 使用普通 JavaScript。writeJSON 会替换已有目标，因此本输入选同步独占创建的 writeNew，输出位于获准且已存在的目录；不使用 exists 加 write 的竞态方案。这里只读合同，不生成结果文件。'},
    {id:'repair-retry', input:'已有 Recipe 取消后仍会重复输入，只修这个局部，不改变业务。', fixture:'try { await UI.tapTexts(keys, options); } catch (_) { await UI.tapTexts(keys, options); }', groups:['elements'], selected:[['desktop-ui','UI.tapTexts'],['runtime','#异步完成与取消']], rationale:'输入没有指定 API；只读示例源码识别实际调用，再查 completed/actionState/取消边界。对未知已提交输入不重试；不执行此示例，不用历史 Calculator 决定当前合同。'},
  ];
  const comparisons = [
    ['window.get：精确唯一身份', 'window.list：仅列候选，不选首个', 'window.content：活动窗文本，不等于指定窗', 'UI.readText：当前显示文字', 'UI.getValue：严格 native textField value，并非所有显示文字'],
    ['File.read：文本需自行解析', 'File.readJSON：JSON 错误与缺文件可区分', 'File.writeJSON：替换已有目标，不符合禁止覆盖', 'File.writeNew：独占创建，不覆盖已有文件'],
    ['UI.tapTexts：现有失败步骤的真实调用', 'UI.tapTargets：原生 selector 需另有证据，不能盲切', 'Runtime 取消：取消不等于已提交动作回滚'],
  ];
  const stops = [
    '已明确指定窗口身份、读值来源、作用域和错误；没有 native value 要求就不读其完整合同，不读取输入/菜单方法。',
    '已明确解析/schema 分界、输入输出不同路径、独占创建和失败边界；不需要 SQL、网络、桌面或写入替换合同全文。',
    '已定位 catch 中无条件重放与 completed/actionState/取消边界；只移除不安全重试，不改其余业务，也不触发桌面验证。',
  ];
  cases.forEach((c, i) => { c.comparisons = comparisons[i]; c.stop = stops[i]; });
  const entry=fs.readFileSync(path.join(root,'docs/api/agent/README.md'),'utf8');
  for(const c of cases){
    c.entry={path:'docs/api/agent/README.md',range:`1-${entry.split('\n').length}`,sha256:digest(entry),...reader.size(entry)};
    c.catalogs=c.groups.map(id=>{const rel=`docs/api/agent/${id}.md`,text=fs.readFileSync(path.join(root,rel),'utf8');return {path:rel,range:`1-${text.split('\n').length}`,sha256:digest(text),...reader.size(text)}});
    c.packets=c.selected.map(([d,m])=>{const p=read(d,m);fs.writeFileSync(path.join(out,`${c.id}-${d}-${m.replace(/[^a-zA-Z0-9_-]/g,'_')}.md`),p.output);return {doc:d,method:m,...p.report}});
    c.totalReturnedBytes=c.entry.bytes+c.catalogs.reduce((n,r)=>n+r.bytes,0)+c.packets.reduce((n,r)=>n+r.returned.bytes,0);
    c.totalReturnedCharacters=c.entry.characters+c.catalogs.reduce((n,r)=>n+r.characters,0)+c.packets.reduce((n,r)=>n+r.returned.characters,0);
    c.programReadBytes=c.packets.reduce((n,p)=>n+p.programReads.reduce((k,r)=>k+r.bytes,0),0);
    c.excluded=['runtime-api.ai.json全文','全部类型声明','未选择的能力组','框架历史与业务案例','真实桌面/客户业务执行'];
    c.validation='offline-scripted-reading; not a hosted Agent session';c.tokenUsage=null;
  }
  fs.writeFileSync(path.join(out,'reading-demos.json'),JSON.stringify(cases,null,2)+'\n');
  assert.equal(cases.length,3);
  assert.deepEqual(cases[1].selected, [['file','File.readJSON'],['file','File.writeNew']]);
  assert.ok(cases[1].packets[1].returnedRanges.some(r => r.reason.includes('selected-method')));
  for(const c of cases) assert.ok(c.comparisons.length >= 3 && c.stop && c.totalReturnedCharacters > 0);
});


test('Locator value and tap contracts include their actual action owners', () => {
  for (const name of ['getValue','setValue']) {
    const packet=read('desktop-ui',`Locator.${name}`);
    assert.ok(packet.output.includes(`## UI.${name}(`));
    assert.ok(packet.report.returnedRanges.some(r=>r.path==='docs/api/accessibility.md'));
  }
  const tap=read('desktop-ui','Locator.tap').output;
  for(const name of ['tapTargets','tapText','tapImage']) assert.ok(tap.includes(`## UI.${name}(`));
});
test('Locator text discovery actually contains common text/scope constraints', () => {
  for(const name of ['find','waitFor','tap']) {
    const output=read('desktop-ui',`Locator.${name}`).output;
    for(const marker of ['### 文本选项','### Scope：within','### region','### relativeTo']) assert.ok(output.includes(marker), `${name}: ${marker}`);
  }
});
test('global aliases traverse the canonical page, including its shared contract', () => {
  for(const [alias,doc,method] of [['notify','notify','notify'],['copyToClipboard','clipboard','clipboard.copy'],['getClipboard','clipboard','clipboard.paste'],['alert','dialog','Dialog.alert'],['confirm','dialog','Dialog.confirm'],['prompt','dialog','Dialog.prompt']]) {
    const p=read('global-apis',alias);
    assert.ok(p.output.includes(`## ${method}(`),alias);
    assert.ok(p.report.returnedRanges.some(r=>r.path===`docs/api/${doc}.md`));
  }
});
test('window wait/activation preserve explicitly reused method semantics', () => {
  assert.ok(read('window','window.wait').output.includes('## window.get('));
  assert.ok(read('window','window.activate').output.includes('## window.current('));
});
test('packet verification detects missing middle even with a retained end marker', () => {
  const p=read('file','File.readJSON');
  assert.equal(reader.verifyPacket(root,p.output,p.report).ok,true);
  assert.throws(()=>reader.verifyPacket(root,p.output.slice(400),p.report),/PACKET_INCOMPLETE/);
  assert.throws(()=>reader.verifyPacket(root,p.output.replace('JSON_PARSE_FAILED','JSON_PARSE_FAILEX'),p.report),/PACKET_INCOMPLETE/);
  const truncated=p.output.slice(0,300)+p.output.slice(700);
  assert.ok(truncated.includes('END_API_READING_PACKET'));
  assert.throws(()=>reader.verifyPacket(root,truncated,p.report),/PACKET_INCOMPLETE/);
  const forged={...p.report,packetSha256:digest(truncated),returned:reader.size(truncated)};
  assert.throws(()=>reader.verifyPacket(root,truncated,forged),/PACKET_SOURCE_OR_PLAN_CHANGED/);
});
test('packet verification rejects stale source and omitted dependencies', () => {
  const p=read('file','File.readJSON');
  assert.throws(()=>reader.verifyPacket(root,p.output,{...p.report,returnedRanges:p.report.returnedRanges.slice(1)}),/PACKET_SOURCE_OR_PLAN_CHANGED/);
  const temp=fs.mkdtempSync(path.join(out,'verify-'));
  try {
    fs.mkdirSync(path.join(temp,'docs/api'),{recursive:true});
    fs.copyFileSync(path.join(root,'docs/api/file.md'),path.join(temp,'docs/api/file.md'));
    const before=reader.readContract(temp,'file','File.readJSON');
    fs.appendFileSync(path.join(temp,'docs/api/file.md'),'\nsource drift\n');
    assert.throws(()=>reader.verifyPacket(temp,before.output,before.report),/PACKET_SOURCE_OR_PLAN_CHANGED/);
  } finally {fs.rmSync(temp,{recursive:true});}
});
test('output limit refuses the entire packet, never a success-shaped prefix', () => {
  const p=read('file','File.readJSON');
  assert.equal(reader.boundedOutput(p,p.report.returned.bytes),p.output);
  assert.throws(()=>reader.boundedOutput(p,p.report.returned.bytes-1),/PACKET_TOO_LARGE/);
  const run=cp.spawnSync(process.execPath,['scripts/api-docs.js','read','file','File.readJSON','--max-bytes','10'],{cwd:root,encoding:'utf8'});
  assert.equal(run.status,2);assert.equal(run.stdout,'');assert.match(run.stderr,/PACKET_TOO_LARGE/);
});
test('new public declarations and Reference pages cannot escape the coverage inventory', () => {
  const temp=fs.mkdtempSync(path.join(out,'inventory-'));
  try {
    fs.mkdirSync(path.join(temp,'docs/api'),{recursive:true});fs.mkdirSync(path.join(temp,'types'));
    fs.writeFileSync(path.join(temp,'docs/api/new-public.md'),'---\ndocType: reference\n---\n# NewPublic\n'.replace(/\\n/g,'\n'));
    fs.writeFileSync(path.join(temp,'types/NewPublic.d.ts'),'export {}; declare global { var NewPublic: {}; function newGlobalHelper(): void; }');
    const actual=reader.inventory(temp);
    assert.ok(actual.errors.includes('UNROUTED_REFERENCE docs/api/new-public.md'));
    assert.ok(actual.errors.includes('UNROUTED_TYPE_GLOBAL types/NewPublic.d.ts NewPublic'));
    assert.ok(actual.errors.includes('UNROUTED_TYPE_GLOBAL types/NewPublic.d.ts newGlobalHelper'));
    assert.deepEqual(reader.inventory(root).errors,[]);
  } finally {fs.rmSync(temp,{recursive:true});}
});
test('plan and read --types describe the same payload and verify through CLI', () => {
  const args=['scripts/api-docs.js'];
  const plan=cp.execFileSync(process.execPath,[...args,'plan','file','File.readJSON','--types'],{cwd:root,encoding:'utf8'});
  const packet=cp.execFileSync(process.execPath,[...args,'read','file','File.readJSON','--types'],{cwd:root,encoding:'utf8'});
  const report=JSON.parse(plan);assert.equal(digest(packet),report.packetSha256);
  const a=path.join(out,'verify-packet.md'),b=path.join(out,'verify-plan.json');
  fs.writeFileSync(a,packet);fs.writeFileSync(b,plan);
  const verified=JSON.parse(cp.execFileSync(process.execPath,[...args,'verify',a,b],{cwd:root,encoding:'utf8'}));
  assert.equal(verified.ok,true);assert.equal(verified.modelLoaded,false);
});
