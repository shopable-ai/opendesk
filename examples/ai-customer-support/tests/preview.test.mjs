import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const root=new URL('../',import.meta.url);
test('single generated offline React preview',async()=>{
  const html=await readFile(new URL('preview/index.html',root),'utf8');
  assert.match(html,/React R2\.0/);
  assert.match(html,/id="app"/);
  assert.doesNotMatch(html,/<script\s+[^>]*src=/i);
  assert.doesNotMatch(html,/<link\s+[^>]*href=/i);
  assert.match(html,/<style>/);
  assert.ok(html.length>20000);
});
