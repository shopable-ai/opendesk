'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {splitCalculator,relocateLinks}=require('../../workflows/agent-to-recipe/scripts/split-calculator-stage-docs.js');
const fixture = '# Calculator\n\n### 不依赖 S1—S12 的业务真相\n\n'
  +Array.from({length:8},(_,i)=>'| R'+(i+1)+' | 不变约束 '+(i+1)+' |').join('\n')+'\n\n---\n\n'
  +Array.from({length:12},(_,i)=>'## S'+(i+1)+'｜现有阶段\n\n### 输入和正确形态\n\n唯一正文-'+(i+1)
    +'\n\n[原产物](calculator-artifacts.md)\n\n~~~js\n// [not a link](keep.js)\n~~~\n\n').join('')
  +'## 附录 A｜现有边界\n\n附录必须保留。\n';
test('moves all twelve bodies once, preserves original anchors and independent R1–R8',()=>{
 const files=splitCalculator(fixture);const root=files['calculator.md'];
 for(let i=1;i<=12;i++){
   const name='calculator/stages/S'+String(i).padStart(2,'0')+'.md';
   assert.ok(files[name].includes('唯一正文-'+i+'\n'));
   assert.ok(root.includes('## S'+i+'｜现有阶段'));assert.ok(root.includes(name));
   assert.ok(!root.includes('唯一正文-'));assert.ok(files[name].includes('Evaluator / 维护 / 教学'));
 }
 const before=fixture.match(/^\| R[1-8] \|.*$/gm), after=files['calculator/invariants.md'].match(/^\| R[1-8] \|.*$/gm);
 assert.deepEqual(after,before);assert.ok(!root.includes('| R1 |'));assert.ok(root.includes('附录必须保留。'));
});
test('relocates relative document links but not URLs or fenced code',()=>{
 const md=relocateLinks('[a](calculator.md#s1) [web](https://example.test)\n~~~js\n[a](keep.js)\n~~~');
 assert.ok(md.includes('(../../calculator.md#s1)'));assert.ok(md.includes('(https://example.test)'));
 assert.ok(md.includes('[a](keep.js)'));
 const withHeading=fixture.replace('// [not a link](keep.js)', '## S99｜not a real heading');
 const moved=splitCalculator(withHeading);
 assert.ok(moved['calculator/stages/S01.md'].includes('## S99｜not a real heading'));
 assert.ok(!moved['calculator.md'].includes('## S99｜not a real heading'));
});
test('missing stage, duplicate stage, existing split and changed invariant shape stop migration',()=>{
 assert.throws(()=>splitCalculator(fixture.replace('## S12｜','## Stage12｜')));
 assert.throws(()=>splitCalculator(fixture.replace('## S12｜','## S11｜')));
 assert.throws(()=>splitCalculator(fixture+'\ncalculator/stages/S01.md'));
 assert.throws(()=>splitCalculator(fixture.replace('| R8 |','| R9 |')));
});
