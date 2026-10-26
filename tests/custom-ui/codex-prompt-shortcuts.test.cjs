'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

// Pure model/geometry tests only. Never start OpenDesk, access UI, or change OS state.
const mainPath=path.resolve(__dirname,'../../examples/custom-ui/codex-prompt-shortcuts/main.js');
const script=fs.readFileSync(mainPath,'utf8');
const boundary='File.ensureDir(DIR);';
assert.ok(script.includes(boundary),'source model boundary');
const pure=script.slice(0,script.indexOf(boundary));
const ctx={File:{cwd:()=>'/virtual',join:(...parts)=>parts.join('/')}};
vm.runInNewContext(pure+'\nthis.Model={empty,verified,importBackup,frame,html};',ctx);
const {empty,verified,importBackup,frame,html}=ctx.Model;
const prompt={id:'ps_12345678',body:'你好',label:'你好',name:'测试',enabled:true};
test('empty schema accepted',()=>assert.equal(verified(empty()).revision,0));
test('invalid schema rejected',()=>assert.throws(()=>verified({...empty(),schemaVersion:99})));
test('duplicate local IDs rejected',()=>assert.throws(()=>verified({...empty(),prompts:[prompt,prompt]})));
test('invalid local body rejected',()=>assert.throws(()=>verified({...empty(),prompts:[{...prompt,body:' '}]})));
test('browser v1 text imported',()=>{
  const result=importBackup({format:'opendesk.prompt-shortcuts',version:1,items:[{body:'你好'}]});
  assert.equal(result.prompts.length,1);
  assert.equal(result.images.length,0);
});
test('browser v2 image downgraded only with explicit notice metadata',()=>{
  const result=importBackup({format:'opendesk.prompt-shortcuts',version:2,
    items:[{body:'你好',appearance:'image',imageUrl:'https://example.com/image.png'}]});
  assert.equal(result.prompts.length,1);
  assert.deepEqual(Array.from(result.images),[1]);
});
test('browser duplicate order rejected',()=>assert.throws(()=>importBackup({
  format:'opendesk.prompt-shortcuts',version:1,items:[{body:'a',order:0},{body:'b',order:0}]
})));
test('browser unknown format rejected',()=>assert.throws(()=>importBackup({
  format:'different',version:2,items:[{body:'abc'}]
})));
test('negative display coordinates retained and clipped',()=>{
  const b=frame({x:-1600,y:-100,width:1100,height:900},200,
    {offsetX:0,offsetY:0},[{x:-1920,y:-120,width:1920,height:1080}]);
  assert.ok(b.x<0);
  assert.ok(b.y>=-112);
});
test('HTML tooltip escaped',()=>assert.equal(html('<b title="x">'),'&lt;b title=&quot;x&quot;&gt;'));
