'use strict';
// Schema/model integration only; no Browser UI, production storage, service or network.
// From repository root:
// OPENDESK_BROWSER_MODEL=/absolute/path/to/opendesk-browser/examples/sidebar-tools/prompt-shortcuts/trusted/model.js node --test tests/custom-ui/codex-prompt-browser-compat.test.cjs
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { webcrypto, createHash } = require('node:crypto');
const { execFileSync } = require('node:child_process');
const oraclePath = process.env.OPENDESK_BROWSER_MODEL;
const clone = value => JSON.parse(JSON.stringify(value));

function setup() {
  // Reuse the existing memory-only UI harness without registering its tests.
  // The harness evaluates the complete production main.js, replacing only main().
  const harnessPath = path.join(__dirname, 'codex-prompt-shortcuts.test.cjs');
  const support = fs.readFileSync(harnessPath, 'utf8');
  const boundary = '\nconst model = harness();';
  assert.equal(support.split(boundary).length, 2, 'shared harness boundary must remain unique');
  const local = vm.runInNewContext(support.slice(0, support.indexOf(boundary)) +
    '\n({harness, library})', { require, __dirname, URL, TextEncoder, Buffer }, { filename: harnessPath, timeout: 2000 });
  const context = { URL, TextEncoder, crypto: webcrypto };
  const source = fs.readFileSync(oraclePath, 'utf8');
  vm.runInNewContext(source, context, { filename: oraclePath, timeout: 2000 });
  const browser = context.OpenDeskPromptShortcutsModel;
  for (const method of ['draft', 'load', 'backupExport', 'backupParse', 'backupPlan'])
    assert.equal(typeof browser[method], 'function', 'formal Browser method ' + method);
  const git = args => execFileSync('git', ['-C', path.dirname(oraclePath), ...args], { encoding: 'utf8' }).trim();
  const root = git(['rev-parse', '--show-toplevel']);
  const hash = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  return { ...local, browser, provenance: {
    browserRoot: root, browserSHA: git(['rev-parse', 'HEAD']),
    browserDirty: git(['status', '--porcelain=v1']), oraclePath: path.resolve(oraclePath),
    oracleSHA256: hash(oraclePath),
    browserUISHA256: hash(path.join(root, 'examples/sidebar-tools/prompt-shortcuts/src/main.js')),
    localMainSHA256: hash(path.resolve(__dirname, '../../examples/custom-ui/codex-prompt-shortcuts/main.js')),
    node: process.version, browserUIImport: 'NOT RUN'
  } };
}

test('formal Browser bidirectional migration (external oracle)', { skip: !oraclePath }, async t => {
  const { harness, library, browser: b, provenance } = setup();
  t.diagnostic(JSON.stringify(provenance));
  const document = rows => b.load({ schema: 1, settings: { webButtons: true, imageSize: 'compact' },
    items: rows.map((row, order) => ({ ...b.draft(row), order })) });
  const exportRows = rows => b.backupExport(document(rows), '2026-10-27T00:00:00.000Z');
  async function append(h, value) {
    await h.api.openManager();
    const file = '/virtual/browser-backup.json';
    h.files.set(file, JSON.stringify(value));
    await h.panel().control('backup').emit('input', { value: file });
    h.env.answers.push(true);
    await h.panel().control('import').emit('click');
  }

  for (const version of [1, 2]) await t.test('formal rows in v' + version + ' survive both directions', async () => {
    const h = await harness();
    const input = JSON.parse(exportRows([
      { body: '  保留\r\n正文 e\u0301👩‍💻  ', label: 'e\u0301👩‍💻', name: '手动名称', shape: 'round', enabled: false },
      { body: '自动标签\n第二行' }
    ]));
    if (version === 1) {
      // Current formal exporter emits v2. This is a legacy v1 wire fixture,
      // validated by the formal parser, not a claim of a current v1 exporter.
      input.version = 1; delete input.imageSize;
      for (const row of input.items) { delete row.appearance; delete row.imageUrl; }
    }
    const formal = b.backupParse(JSON.stringify(input));
    const before = clone(input);
    const imported = h.api.importBackup(input);
    assert.deepEqual(clone(input), before);
    assert.deepEqual(Array.from(imported.prompts, p => p.body), Array.from(formal, p => p.body));
    const local = h.api.empty(); local.prompts = imported.prompts;
    const back = b.backupParse(h.api.exportBackup(local));
    const plan = b.backupPlan(b.defaults(), back, 'replace');
    assert.equal(plan.added, 2); assert.equal(plan.skipped, 0); assert.equal(plan.overLimit, false);
    for (let i = 0; i < formal.length; i++) {
      for (const key of ['body', 'label', 'name', 'labelAuto', 'nameAuto', 'enabled'])
        assert.equal(back[i][key], formal[i][key], key);
      assert.notEqual(imported.prompts[i].id, formal[i].id);
      assert.notEqual(back[i].id, imported.prompts[i].id);
      assert.equal(back[i].shape, 'square', 'desktop only exports square text buttons');
      assert.equal(back[i].appearance, 'text');
    }
    await append(h, input);
    assert.equal(h.disk().prompts.length, 3, 'actual local import handler appended both rows');
  });

  await t.test('trim duplicate preview and commit agree with Browser append plan', async () => {
    const h = await harness();
    const input = JSON.parse(exportRows([{ body: '  你好\n' }, { body: '新正文' }, { body: '\t新正文 ' }]));
    const saved = document([{ body: library().prompts[0].body }]);
    const plan = b.backupPlan(saved, b.backupParse(JSON.stringify(input)), 'append');
    assert.equal(plan.added, 1); assert.equal(plan.skipped, 2);
    await append(h, input);
    assert.equal(h.disk().prompts.length, 2);
    assert.equal(h.disk().prompts[1].body, '新正文');
    assert.match(h.calls.confirms.at(-1).message, /预计追加1条/);
  });

  await t.test('HTTPS image downgrade is disclosed by the real local handler', async () => {
    const h = await harness();
    const input = JSON.parse(exportRows([{ body: '图片正文', appearance: 'image',
      imageUrl: 'https://example.invalid/image.png' }]));
    assert.equal(b.backupParse(JSON.stringify(input))[0].appearance, 'image');
    assert.deepEqual(Array.from(h.api.importBackup(input).images), [1]);
    await append(h, input);
    assert.match(h.calls.confirms.at(-1).message, /第1条是图片按钮：只保留文字正文/);
    const back = b.backupParse(h.api.exportBackup(h.disk()));
    assert.equal(back[1].body, '图片正文'); assert.equal(back[1].appearance, 'text');
    assert.equal(back[1].imageUrl, '');
    assert.equal(b.backupPlan(b.defaults(), back, 'replace').overLimit, false);
  });

  await t.test('invalid and oversized wire data is rejected by formal and local validators', async () => {
    const h = await harness();
    const base = JSON.parse(exportRows([{ body: '正文' }]));
    const mutate = fn => { const value = clone(base); fn(value); return value; };
    const invalid = [
      mutate(v => { v.version = 99; }), mutate(v => { v.items = []; }),
      mutate(v => { v.items[0].unexpected = true; }),
      mutate(v => { v.items[0].body += '\0'; }),
      mutate(v => { v.items[0].enabled = 'false'; }),
      mutate(v => { v.items[0].name = '名'.repeat(61); }),
      mutate(v => { v.items.push({ ...v.items[0] }); }),
      mutate(v => { v.items = Array.from({ length: 81 }, (_, order) => ({ body: '正文', order })); }),
      mutate(v => { v.items[0].body = '字'.repeat(90000); }),
      ...['http://example.invalid/a.png', 'https://u:p@example.invalid/a.png', 'https://example.invalid/a.svg']
        .map(imageUrl => mutate(v => { Object.assign(v.items[0], { appearance: 'image', imageUrl }); }))
    ];
    for (const value of invalid) {
      assert.throws(() => b.backupParse(JSON.stringify(value)), { code: 'E_PROMPT_DATA' });
      assert.throws(() => h.api.importBackup(value));
    }
    assert.throws(() => b.backupParse('{broken'), { code: 'E_PROMPT_DATA' });
    assert.equal(h.calls.writes.length, 0);
  });

  await t.test('schema acceptance does not bypass formal Browser 8 KiB storage gate', async () => {
    const h = await harness(); const doc = library(); doc.prompts[0].body = '字'.repeat(3000);
    const text = h.api.exportBackup(doc);
    assert.ok(Buffer.byteLength(text) < b.BACKUP_MAX_BYTES);
    const parsed = b.backupParse(text);
    const plan = b.backupPlan(b.defaults(), parsed, 'replace');
    assert.equal(plan.added, 1); assert.ok(plan.bytes > 8192); assert.equal(plan.overLimit, true);
    t.diagnostic('Schema accepted; formal Browser import blocked by overLimit=true (8 KiB).');
  });

  await t.test('canonical duplicate preview and commit match formal Browser without altering body bytes', async () => {
    const h = await harness();
    const value = JSON.parse(exportRows([{ body: 'a'.repeat(8193) }]));
    assert.equal(b.backupParse(JSON.stringify(value)).length, 1);
    assert.throws(() => h.api.importBackup(value), { code: 'INVALID_BACKUP' });
    const variants = JSON.parse(exportRows([{ body: 'e\u0301\r\n正文' }, { body: 'é\n正文' }]));
    const plan = b.backupPlan(b.defaults(), b.backupParse(JSON.stringify(variants)), 'replace');
    assert.equal(plan.added, 1); assert.equal(plan.skipped, 1);
    await append(h, variants);
    assert.equal(h.disk().prompts.length, 2);
    assert.equal(h.disk().prompts[1].body, 'e\u0301\r\n正文');
    assert.match(h.calls.confirms.at(-1).message, /预计追加1条/);
    t.diagnostic('Local body support remains capped at 8192 UTF-16 code units; NFC/CRLF duplicate keys match Browser.');
  });
});
