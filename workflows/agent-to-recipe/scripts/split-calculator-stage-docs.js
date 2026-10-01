#!/usr/bin/env node
'use strict';
// File-only maintenance migration. No checker, scoring, Runtime or model calls.
// Existing stage prose is MOVED, not re-authored or copied into two owners.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const BASELINE_BLOB = '52fa727c3f0c531c42a52f682c89fb45e17ee4d5';
const SHA = '877c852acca28b4658d01fd727b37b883b4792d1';
function blob(bytes) { return crypto.createHash('sha1').update('blob ' + bytes.length + '\0').update(bytes).digest('hex'); }
const hints = {
  S1: ['原始需求与授权', '区分固定输入、runtime firstResult、验收 Expected', 'Expected 110 被写成运行时输入', '先修合同，不改 R1—R8'],
  S2: ['本次合同、当前应用观察', '规则有当前对象与适用条件依据，未知仍为未知', '未观察就预写窗口尺寸，或假定不同回执对象引用相等', '取得当前规则与现场对象之间的区分性证据'],
  S3: ['获准动作、S2 规则与当前上下文', '保存实际请求、回执和副作用；失败不能补成成功', 'Wrong display binding 后仍宣称有 firstResult', '先查归属校验及同次请求/回执；Owner 可以 UNKNOWN'],
  S4: ['同次动作与当前观察对象', 'firstResult / finalResult 来自正确结果区的本次观察', '把旧树中的660当成本次第二次结果', '核对对象、时间与来源；不要用 Expected 填 Actual'],
  S5: ['动作、观察、停止与预算条件', '在证据充分时继续；不满足条件时停止或返回', '观察失败仍进入第二次按钮输入', '保留动作与观察，修有依据的继续/停止判断'],
  S6: ['同次动作、观察、决定与实际值', '交接事实包保留 producer → firstResult → consumer', '仅汇总最终660，丢失读值或消费者', '核对源事件，不能从最终 JS 反推示范事实'],
  S7: ['合格且同版的 S6 事实包', '去噪不破坏读值、保存、清空和逐字符消费', '保留读取动作却删除 firstResult 消费者', '输入完整、输出丢失时修 S7；输入也缺失时先查 S6'],
  S8: ['S7 必要步骤及其证据', '业务含义区分状态、参数、runtime value 和 Oracle', '把 firstResult 解释成可由用户默认填110的参数', '对照来源步骤；不要把语义修改偷偷放进 S11'],
  S9: ['同版 S7/S8 成果', '过程保留跨清空生命周期、消费者和支持范围', '清空 UI 同时删除任务 firstResult', '修过程数据依赖，再验受影响下游'],
  S10: ['业务过程及应用规则', '定位、读取、清空、等待、停止有适用依据', '显示0即断言独立起算；读取失败回退Expected', '核对规则与原试验，未授权不启动桌面重验'],
  S11: ['正确过程与适用规则', '普通 JS 与 manifest 一起冻结，真实消费runtime value', 'const firstResult = 110；声明正确但源码不同', '先定位同版具体代码/声明；修候选后重新冻结，仍需既有独立验证'],
  S12: ['同一冻结候选、预声明请求与独立证据', '全部请求范围及业务数据链均被对应证据覆盖', '维护测试PASS被写成Fresh Run或缩小requested scope', '保留候选和失败证据，按实际无效边界取证，不能猜根因'],
};
function relocateLinks(markdown) {
  let fence = null;
  return markdown.split('\n').map(line => {
    const match = /^\s*(```+|~~~+)/.exec(line);
    if (match) { if (!fence) fence=match[1][0]; else if(fence===match[1][0]) fence=null; return line; }
    if (fence) return line;
    return line.replace(/\]\(([^\s)]+)([^)]*)\)/g, (_all, target, suffix) => {
      if (/^(?:[a-z][a-z0-9+.-]*:|\/)/i.test(target)) return '](' + target + suffix + ')';
      const moved = target.startsWith('#') ? '../../calculator.md' + target : '../../' + target;
      return '](' + moved + suffix + ')';
    });
  }).join('\n');
}
function splitCalculator(source) {
  if (source.includes('calculator/stages/S01.md')) throw new Error('Already split or partially migrated; inspect before continuing.');
  const headings = [];
  let offset = 0, fence = null;
  for (const line of source.split('\n')) {
    const marker = /^\s*(`{3,}|~{3,})(.*)$/.exec(line);
    if (marker) {
      if (!fence) fence = marker[1];
      else if (marker[1][0] === fence[0] && marker[1].length >= fence.length && !marker[2].trim()) fence = null;
    } else if (!fence && /^## /.test(line)) headings.push({ index: offset, line });
    offset += line.length + 1;
  }
  const sections = headings.flatMap(heading => {
    const match = /^## S(1[0-2]|[1-9])｜(.+)$/.exec(heading.line);
    if (!match) return [];
    match.index = heading.index;
    return [match];
  });
  if (sections.length !== 12 || sections.some((entry,index)=>Number(entry[1])!==index+1))
    throw new Error('Expected exactly the existing ordered S1–S12 headings; no document rewrite attempted.');
  const files = {};
  let revised = source;
  for (let index=sections.length-1; index>=0; index--) {
    const section=sections[index], stage='S'+section[1], filename='S'+section[1].padStart(2,'0');
    const bodyStart=section.index+section[0].length;
    const end=headings.find(heading=>heading.index>section.index)?.index ?? source.length;
    const original=source.slice(bodyStart,end).trim();
    const hint=hints[stage];
    files['calculator/stages/'+filename+'.md']='# '+stage+'｜'+section[2]+'\n\n'
      +'> Evaluator / 维护 / 教学专用。以下是正确成果形态，不是本次 Actual；同任务 Producer 不得作为未来答案读取。\n\n'
      +'[案例入口](../README.md) · [独立业务约束 R1—R8](../invariants.md)\n\n'
      +'## 先判断本阶段\n\n| 问题 | 判断依据 |\n| --- | --- |\n'
      +'| 输入 | '+hint[0]+' |\n| 必须成立 | '+hint[1]+' |\n| 错误形态 | '+hint[2]+' |\n| 接续 | '+hint[3]+' |\n\n'
      +'正文来源：原 calculator.md 的本阶段内容，移动而非另建第二份正文。\n\n'
      +relocateLinks(original)+'\n';
    const replacement=section[0]+'\n\n本阶段完整正文已移至 ['+stage+' 单阶段审阅](calculator/stages/'+filename+'.md)。\n\n';
    revised=revised.slice(0,section.index)+replacement+revised.slice(end);
  }
  const start=revised.indexOf('### 不依赖 S1—S12 的业务真相');
  const end=revised.indexOf('\n---\n',start);
  if(start<0||end<0) throw new Error('Could not identify the independent business invariants without changing them.');
  const invariants=revised.slice(start,end);
  if([...invariants.matchAll(/^\| R[1-8] \|/gm)].length!==8) throw new Error('R1–R8 must remain exact and independent.');
  files['calculator/invariants.md']='# Calculator 独立业务约束\n\n'
    +'本页是 R1—R8 的唯一正文位置。不得因 Workflow、评分或实现改变而改写业务真相。\n\n'+invariants+'\n';
  revised=revised.slice(0,start)+'### 不依赖 S1—S12 的业务真相\n\n'
    +'R1—R8 原文已移至 [独立业务约束](calculator/invariants.md)，内容不变。\n'+revised.slice(end);
  files['calculator.md']=revised;
  files['calculator/README.md']='# Calculator：按阶段阅读的 Golden Case\n\n'
    +'用途：维护、教学、Evaluator 和方法审阅；不是同任务 Producer 的未来答案输入，也不是新一次真实执行。\n\n'
    +'实际失败：先打开该次 checker 报告包中的 stage-review.md，再打开它指向的一个阶段。\n\n'
    +'[R1—R8](invariants.md) · [原案例入口与历史边界](../calculator.md) · [产物地图](../calculator-artifacts.md) · [求解过程](../calculator-execution-walkthrough.md) · [代表性失败](failures/README.md) · [诊断合同](../../design/stage-diagnostics.md)\n\n'
    +'| 阶段 | 单阶段入口 |\n| --- | --- |\n'+sections.map(item=>'| S'+item[1]+' '+item[2]+' | [打开](stages/S'+item[1].padStart(2,'0')+'.md) |').join('\n')+'\n\n'
    +'正确性不由文件数、分数或“已完成”声明判断；要比较固定要求与实际业务内容。旧阶段标题锚点继续保留，但正文只在单阶段页维护。\n';
  files['calculator/failures/README.md']='# 三个受控诊断失败\n\n'
    +'这里只描述版本化维护 fixture，不声称执行了新的 Calculator，也不补写历史失败的根因。\n\n'
    +'| 案例 | 无效边界 / 已知责任 | 第一处不一致 |\n| --- | --- | --- |\n'
    +'| early-display-binding | S3 / UNKNOWN | 结果区归属未通过；按钮输入0；firstResult未产出 |\n'
    +'| middle-lost-consumer | S7 / 固定输出修复责任 | 输入有firstResult消费者，提炼输出没有 |\n'
    +'| late-literal-first-result | S11 / 固定输出修复责任 | Procedure要求运行时来源，Candidate声明常量110，固定源码第2行可直接核对 |\n\n'
    +'[版本化输入与要求](../../../../../tests/workflows/fixtures/stage-review-diagnostics/cases.json)\n\n'
    +'报告生成：在仓库根使用 node tests/workflows/tools/render-stage-diagnostic-fixtures.js <新的输出目录>。该工具只读取版本化测试输入、运行唯一 checker 并写报告，不运行 Candidate 或桌面。\n\n'
    +'历史 Wrong display binding 的完整证据边界仍见 [原案例 2.1 节](../../calculator.md#21-本次-actual-的审阅边界)。文件 hash 只能固定所读版本，不能单独证明 Runtime bug。\n';
  return files;
}
function main() {
  const args=process.argv.slice(2);
  if(args.length!==2||!['--check','--write'].includes(args[0]))throw new Error('Use --check or --write <repository-root>.');
  const directory=path.resolve(args[1],'workflows/agent-to-recipe/cases');
  const file=path.join(directory,'calculator.md'), bytes=fs.readFileSync(file);
  if(blob(bytes)!==BASELINE_BLOB)throw new Error('calculator.md differs from '+SHA+'; review parallel changes instead of overwriting.');
  const files=splitCalculator(bytes.toString('utf8'));
  for(const name of Object.keys(files)) if(name!=='calculator.md'&&fs.existsSync(path.join(directory,name)))
    throw new Error('Destination already exists: '+name);
  if(args[0]==='--write') {
    // Root is switched last. A partial write never deletes the original prose.
    for(const [name,contents] of Object.entries(files).filter(([name])=>name!=='calculator.md')){
      const target=path.join(directory,name);fs.mkdirSync(path.dirname(target),{recursive:true});
      fs.writeFileSync(target,contents,{flag:'wx'});
    }
    if(blob(fs.readFileSync(file))!==BASELINE_BLOB)throw new Error('Source changed during migration; root not overwritten.');
    fs.writeFileSync(file,files['calculator.md']);
  }
  console.log(JSON.stringify({mode:args[0],files:Object.keys(files),stages:12,invariantsUnchanged:true,desktopActions:false},null,2));
}
if(require.main===module){try{main();}catch(error){console.error(error.message);process.exitCode=2;}}
module.exports={splitCalculator,relocateLinks,blob};
