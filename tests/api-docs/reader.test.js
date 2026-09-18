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
    {id:'json-field', input:'读取已有 JSON 配置中的字段，格式错误必须报告，不修改原件。', groups:['data'], selected:[['file','File.readJSON']], rationale:'比较同步文本读取与 JSON 读取，选择能区分缺文件与 JSON 解析失败的正文；不需要写文件方法或桌面材料。'},
    {id:'repair-retry', input:'已有 Recipe 取消后仍会重复输入，只修这个局部，不改变业务。', fixture:'try { await UI.tapTexts(keys, options); } catch (_) { await UI.tapTexts(keys, options); }', groups:['elements'], selected:[['desktop-ui','UI.tapTexts'],['runtime','#异步完成与取消']], rationale:'输入没有指定 API；只读示例源码识别实际调用，再查 completed/actionState/取消边界。对未知已提交输入不重试；不执行此示例，不用历史 Calculator 决定当前合同。'},
  ];
  const entry=fs.readFileSync(path.join(root,'docs/api/agent/README.md'),'utf8');
  for(const c of cases){
    c.entry={path:'docs/api/agent/README.md',range:`1-${entry.split('\n').length}`,sha256:digest(entry),...reader.size(entry)};
    c.catalogs=c.groups.map(id=>{const rel=`docs/api/agent/${id}.md`,text=fs.readFileSync(path.join(root,rel),'utf8');return {path:rel,range:`1-${text.split('\n').length}`,sha256:digest(text),...reader.size(text)}});
    c.packets=c.selected.map(([d,m])=>{const p=read(d,m);fs.writeFileSync(path.join(out,`${c.id}-${d}.md`),p.output);return {doc:d,method:m,...p.report}});
    c.totalReturnedBytes=c.entry.bytes+c.catalogs.reduce((n,r)=>n+r.bytes,0)+c.packets.reduce((n,r)=>n+r.returned.bytes,0);
    c.excluded=['runtime-api.ai.json全文','全部类型声明','未选择的能力组','框架历史与业务案例','真实桌面/客户业务执行'];
    c.validation='offline-scripted-reading; not a hosted Agent session';c.tokenUsage=null;
  }
  fs.writeFileSync(path.join(out,'reading-demos.json'),JSON.stringify(cases,null,2)+'\n');
  assert.equal(cases.length,3);
});
