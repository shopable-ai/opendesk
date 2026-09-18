#!/usr/bin/env node
'use strict';

// Node 只读文档工具，不加载 OpenDesk、不 eval 示例、不发网络请求。
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const cp = require('node:child_process');
const config = require('./api-docs-map');
const ROOT = path.resolve(__dirname, '..');
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const size = value => ({bytes: Buffer.byteLength(value), characters: [...value].length});
const esc = value => String(value).replace(/\|/g, '\\|').replace(/\r?\n/g, ' ').replace(/\s+/g, ' ').trim();
const reEscape = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const slug = value => value.toLowerCase().replace(/<[^>]*>/g, '').replace(/[^\p{L}\p{N}\p{M}\s_-]/gu, '').replace(/\s/g, '-');

function readFile(root, rel, ledger = []) {
  if (!/^(docs\/api\/|types\/)/.test(rel) || rel.includes('..') || rel.includes('\\')) throw new Error(`READ_PATH_REJECTED ${rel}`);
  const base = fs.realpathSync(root);
  const absolute = fs.realpathSync(path.join(base, rel));
  if (!absolute.startsWith(base + path.sep)) throw new Error(`READ_OUTSIDE_ROOT ${rel}`);
  const stat = fs.statSync(absolute);
  if (!stat.isFile() || stat.size > 2 * 1024 * 1024) throw new Error(`READ_SIZE_OR_TYPE ${rel}`);
  const bytes = fs.readFileSync(absolute);
  const text = new TextDecoder('utf-8', {fatal: true, ignoreBOM: true}).decode(bytes);
  ledger.push({path: rel, sha256: hash(bytes), ...size(text)});
  return text;
}
function parseMarkdown(text) {
  const lines = text.split('\n');
  const headings = [];
  const seen = new Map();
  let fence = null;
  for (let i = 0; i < lines.length; i++) {
    const f = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(lines[i]);
    if (f) {
      if (!fence) fence = {char: f[1][0], length: f[1].length};
      else if (f[1][0] === fence.char && f[1].length >= fence.length && !f[2].trim()) fence = null;
      continue;
    }
    if (fence) continue;
    const m = /^ {0,3}(#{1,6})\s+(.+?)\s*#*\s*$/.exec(lines[i]);
    if (!m) continue;
    const title = m[2];
    const base = slug(title);
    const n = seen.get(base) || 0;
    seen.set(base, n + 1);
    headings.push({title, level: m[1].length, start: i, end: lines.length, anchor: base + (n ? `-${n}` : '')});
  }
  for (let i = 0; i < headings.length; i++) {
    const next = headings.slice(i + 1).find(h => h.level <= headings[i].level);
    if (next) headings[i].end = next.start;
  }
  return {text, lines, headings};
}
function doc(root, id, ledger = []) {
  id = id.replace(/\.md$/, '');
  if (!/^[a-z][a-z0-9-]*$/.test(id)) throw new Error(`UNKNOWN_DOC ${id}`);
  const rel = `docs/api/${id}.md`;
  return {...parseMarkdown(readFile(root, rel, ledger)), id, rel};
}
function section(d, heading) {
  const found = d.headings.filter(h => h.anchor === heading || h.title === heading);
  if (found.length !== 1) throw new Error(`SECTION_NOT_UNIQUE ${d.rel}#${heading}`);
  return found[0];
}
function sectionText(d, s) { return d.lines.slice(s.start, s.end).join('\n'); }
function isMethodHeading(id, h) {
  if (id === 'desktop-ui' && h.title === 'UI Scope locator(target)') return true;
  const tail = id === 'global-apis' ? '(?:\\.|\\(|$|\\s*[/：])' : '(?:\\.|\\(|$)';
  return (config.surfaces[id] || []).some(n => new RegExp(`(?:^|[\\s：/])${reEscape(n)}${tail}`).test(h.title));
}
function directMethod(d, name) {
  const r = new RegExp(`(?:^|[\\s：/])${reEscape(name)}(?:\\s*\\(|$|\\s*[：/])`);
  const matches = d.headings.filter(h => h.level >= 2 && r.test(h.title));
  if (!matches.length && name === 'scope.locator') return d.headings.find(h => h.title === 'UI Scope locator(target)');
  return matches.sort((a, b) => b.level - a.level || a.title.length - b.title.length)[0];
}
function ownerSection(d, name) {
  let match = directMethod(d, name);
  if (match) return {section: match, mode: 'section'};
  // 实例接收者由创建方法给出；不得误认为新的全局对象。
  const receiver = name.split('.')[0], short = name.slice(receiver.length + 1);
  const parents = {FileHandle: 'File.open', scope: 'UI.within', db: 'SQLite.open', playback: 'Sound.start'};
  if (parents[receiver] && d.text.includes(short)) {
    const parent = directMethod(d, parents[receiver]);
    if (parent) return {section: parent, mode: 'shared-section'};
  }
  // 表格列名不是行为合同。仅正文(包括例子)真实提及方法才允许保守整页兜底。
  const body = d.lines.filter(line => !/^\s*\|/.test(line)).join('\n');
  if (new RegExp(`\\b${reEscape(name)}(?:\\s*\\(|\\b)`).test(body)) return {section: null, mode: 'shared-page'};
  return {section: null, mode: 'missing-contract'};
}
// 从已发布类型声明提取接收者的精确签名；不是 TypeScript 编译器或行为契约解析器。
function maskTS(text) {
  return text.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`/g, m => m.replace(/[^\n]/g, ' '));
}
function closeAt(mask, start, open = '{', close = '}') {
  let depth = 0;
  for (let i = start; i < mask.length; i++) {
    if (mask[i] === open) depth++;
    if (mask[i] === close && --depth === 0) return i;
  }
  throw new Error('UNBALANCED_TYPE_DECLARATION');
}
function declarations(text) {
  const masked = maskTS(text);
  const defs = new Map();
  const rx = /\b(interface|class)\s+(\w+)([^{};]*?)\{/g;
  for (const m of masked.matchAll(rx)) {
    const start = m.index + m[0].length - 1;
    const end = closeAt(masked, start);
    const members = [];
    let begin = start + 1, depth = 0;
    for (let i = begin; i < end; i++) {
      if ('{(['.includes(masked[i])) depth++;
      if ('})]'.includes(masked[i])) depth--;
      if (masked[i] !== ';' || depth !== 0) continue;
      const raw = text.slice(begin, i + 1).replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '').trim();
      const member = /^(?:(?:readonly|static)\s+)?([\w$]+)\s*(?:<[^;{}]+>)?\s*(\??\s*[:(])/.exec(raw);
      if (member && member[1] !== 'new') members.push({name: member[1], signature: raw, line: text.slice(0, begin).split('\n').length});
      begin = i + 1;
    }
    const inherited = /\bextends\s+([^{}]+)/.exec(m[3]);
    defs.set(m[2], {members, parents: inherited ? inherited[1].split(',').map(x => x.trim().replace(/<.*$/, '')) : []});
  }
  // var Command: { ... } 等内联公开对象也使用相同提取器。
  for (const m of masked.matchAll(/\b(?:var|const|let)\s+(\w+)\s*:\s*\{/g)) {
    const start = m.index + m[0].length - 1, end = closeAt(masked, start);
    const synthetic = `interface ${m[1]} ${text.slice(start, end + 1)}`;
    defs.set(m[1], declarations(synthetic).defs.get(m[1]));
  }
  const vars = new Map([...masked.matchAll(/\b(?:var|const|let)\s+(\w+)\s*:\s*(\w+)/g)].map(m => [m[1], m[2]]));
  for (const m of masked.matchAll(/\b(?:var|const|let)\s+(\w+)\s*:\s*\{/g)) vars.set(m[1], m[1]);
  return {defs, vars};
}
function typeMethods(root, id, ledger = []) {
  const out = new Map();
  for (const file of config.types[id] || []) {
    const rel = `types/${file}.d.ts`;
    const text = readFile(root, rel, ledger);
    const {defs, vars} = declarations(text);
    for (const n of config.surfaces[id] || []) {
      for (const m of text.matchAll(new RegExp(`\\bfunction\\s+${reEscape(n)}\\s*\\([^;]*?\\)\\s*:[^;]+;`, 'g'))) {
        const old = out.get(n) || [];
        old.push({name: n, signature: m[0].replace(/^function\s+/, ''), raw: m[0], rel, line: text.slice(0, m.index).split('\n').length});
        out.set(n, old);
      }
    }
    const members = (name, seen = new Set()) => {
      if (seen.has(name) || !defs.has(name)) return [];
      seen.add(name);
      const d = defs.get(name);
      return [...d.members, ...d.parents.flatMap(p => members(p, seen))];
    };
    for (const namespace of config.surfaces[id] || []) {
      const target = config.instances[namespace] || vars.get(namespace);
      for (const item of members(target)) {
        const name = `${namespace}.${item.name}`;
        const old = out.get(name) || [];
        old.push({...item, raw: item.signature, rel, signature: `${namespace}.${item.signature.replace(/^readonly\s+/, '')}`});
        out.set(name, old);
      }
    }
  }
  return out;
}
// 只在 --types 时读取命名公共类型闭包；全部 d.ts 可被程序扫描，但只返回必要声明。
function publicTypes(root, seeds, ledger) {
  const candidates = new Map();
  for (const filename of fs.readdirSync(path.join(root, 'types')).filter(n => n.endsWith('.d.ts')).sort()) {
    const rel = `types/${filename}`, text = readFile(root, rel, ledger), masked = maskTS(text);
    for (const m of masked.matchAll(/\b(interface|type|class)\s+((?:OpenDesk|Clawdesk)\w*)\b/g)) {
      let end = m.index + m[0].length;
      if (m[1] === 'type') {
        let level = 0;
        while (end < masked.length) {
          if ('{(['.includes(masked[end])) level++;
          if ('})]'.includes(masked[end])) level--;
          if (masked[end++] === ';' && level === 0) break;
        }
      } else {
        const start = masked.indexOf('{', end);
        if (start < 0) throw new Error(`MALFORMED_PUBLIC_TYPE ${m[2]}`);
        end = closeAt(masked, start) + 1;
      }
      const raw = text.slice(m.index, end);
      const existing = candidates.get(m[2]);
      if (existing && existing.raw.replace(/\s+/g, '') !== raw.replace(/\s+/g, '')) existing.conflict = true;
      if (!existing) candidates.set(m[2], {raw, path: rel, startLine: text.slice(0, m.index).split('\n').length, endLine: text.slice(0, end).split('\n').length, sourceSha256: hash(text)});
    }
  }
  const todo = [...seeds.join(' ').matchAll(/\b(?:OpenDesk|Clawdesk)\w+\b/g)].map(m => m[0]), seen = new Set(), output = [];
  while (todo.length) {
    const name = todo.shift();
    if (seen.has(name)) continue;
    seen.add(name);
    const t = candidates.get(name);
    if (!t) throw new Error(`MISSING_PUBLIC_TYPE ${name}`);
    if (t.conflict) throw new Error(`CONFLICTING_PUBLIC_TYPE ${name}; compare its declarations before use`);
    if (seen.size > 96) throw new Error('PUBLIC_TYPE_LIMIT: no partial closure returned');
    output.push({...t, reason: `public-type:${name}`, text: '```ts\n' + t.raw + '\n```', typeExcerpt: true});
    todo.push(...[...maskTS(t.raw).matchAll(/\b(?:OpenDesk|Clawdesk)\w+\b/g)].map(m => m[0]));
  }
  return output;
}
function overview(d) {
  const out = new Map();
  for (const line of d.lines) {
    if (!/^\s*\|/.test(line)) continue;
    const cells = line.split(/(?<!\\)\|/).slice(1, -1).map(x => x.trim());
    if (cells.length < 2) continue;
    for (const n of config.surfaces[d.id] || []) {
      const re = new RegExp(`\\b${reEscape(n)}\\.([\\w$]+)`, 'g');
      for (const m of cells[0].matchAll(re)) {
        const name = `${n}.${m[1]}`;
        if (!out.has(name)) out.set(name, {purpose: cells[cells.length - 1], state: cells.length > 2 ? cells[1] : ''});
      }
    }
  }
  return out;
}
function prose(text) {
  let fence = false;
  return text.split('\n').filter(line => {
    if (/^\s*(```|~~~)/.test(line)) {fence = !fence; return false;}
    return !fence && line.trim() && !/^\s*(#|\||<!--|\*\*)/.test(line);
  }).join(' ').replace(/\s+/g, ' ').trim();
}
const first = (s, n = 95) => s.length > n ? `${s.slice(0, n)}…（摘要）` : s;
function effects(name) {
  if (/^(Geometry|path)\.|^File\.(cwd|path|join|getExtension|getName|getNameWithoutExtension|getHumanReadableSize|getSimplifiedPath)$/.test(name)) return '纯计算/路径；不提交外部输入';
  if (/^Execution\.|^Flow\./.test(name)) return '读取当前执行/资源上下文';
  if (/\.(waitForFunction|waitForAll|on|once|register|listen)$/.test(name)) return '等待/订阅；回调副作用由调用方决定，须清理';
  if (/\.(tap|tapText|tapTexts|tapTargets|tapImage|tapMenuItem|setValue|perform|click|clickPoint|clickForPID|type|press|down|up|combination|wheel|activate|focus|launch|terminate|restart|kill|lock|logout|startScreenSaver)/.test(name)) return '有：输入/应用或系统状态改变';
  if (/^(http|axios)\.|^(LLM|Agent)\.((?!getCapabilities).)*$/.test(name)) return '有：网络/子进程，可能传出数据或产生费用';
  if (/^File\.(write|append|create|ensure|remove|move|copy|rename)|^AppStorage\.(set|remove|clear)|^db\.(exec|batch)/.test(name)) return '有：持久化写入/删除，受路径或 SQL 约束';
  if (/^File\.open$|^SQLite\.open$/.test(name)) return '依模式：可能创建/截断；返回需关闭的句柄';
  if (/\.(screenshot|captureScreen|startRecording|save|annotateRegions|clip|resize)$/.test(name)) return '依选项：采集/生成文件或资源';
  if (/^(ui|ToastHandle|WindowHandle|ControlHandle|FloatingWindow|Dialog|Sound|playback)\.|^(notify|alert|confirm|prompt)$/.test(name)) return '依方法：呈现/交互/资源；不得视为纯查询';
  if (/\.(get|find|read|list|has|is|current|stat|exists|wait|extract|detect|analyze|status|query|content|title|url|cwd|key)/i.test(name)) return '观察/查询；可能读取敏感数据，不等于业务完成';
  return '需核对正文；不能假定无副作用';
}
const conditions = {
  app: '身份唯一；平台支持、启动/终止权限与结果分开判断。',
  window: 'WindowTarget 与 WindowInfo 不混用；唯一性/新鲜度/坐标按公共约定。',
  page: '当前 execution、可见范围与截图/应用权限；等待不证明业务结果。',
  geometry: '使用真实逻辑坐标与当前父区域；纯换算不证明目标仍有效。',
  'desktop-ui': '方法状态逐项确认；目标唯一、窗口新鲜；unknown 后停止重复输入。',
  accessibility: 'Experimental/可信本地授权；AX/UIA、ref 生命周期与坐标映射限制。',
  file: '相对路径基于 Execution.workdir；JSON、句柄和普通同步方法语义不同。',
  sqlite: '可信本地 execution；有界 SQL/队列/取消，句柄必须关闭。',
  ui: '小写 ui 不是外部 UI；平台/host/授权和句柄生命周期按正文。',
  'automation-app': '仅当前 App Mode execution；不是外部应用 App。',
  'native-extension': '真实已安装插件及 manifest 决定能力；不把示例插件当作内置 API。',
};
function methodEntries(root, d, ledger = []) {
  const listed = d.id === 'libs' ? new Map() : overview(d), typed = typeMethods(root, d.id, ledger);
  if (d.id === 'window') typed.delete('window.js_beautify');
  const names = new Set([...listed.keys(), ...typed.keys()]);
  for (const h of d.headings) {
    for (const n of config.surfaces[d.id] || []) {
      for (const m of h.title.matchAll(new RegExp(`\\b${reEscape(n)}\\.([\\w$]+)`, 'g'))) names.add(`${n}.${m[1]}`);
      if (h.title.startsWith(`${n}(`) || h.title.startsWith(`new ${n}(`)) names.add(n);
    }
  }
  if (d.id === 'desktop-ui') names.add('scope.locator');
  if (d.id === 'libs') { names.clear(); for (const n of config.surfaces.libs) names.add(n); }
  if (d.id === 'global-apis') {
    for (const n of ['setTimeout','clearTimeout','setInterval','clearInterval','requestAnimationFrame','cancelAnimationFrame','queueMicrotask','delay','sleep','sleepSeconds','copyToClipboard','getClipboard','AbortController','AbortSignal','URL','URLSearchParams','TextEncoder','TextDecoder','ReadableStream','WritableStream','TransformStream']) names.add(n);
  }
  return [...names].sort().map(name => {
    const owner = ownerSection(d, name);
    const text = owner.section ? sectionText(d, owner.section) : d.text;
    const ts = /```(?:ts|typescript)\s*\n([\s\S]*?)```/.exec(text);
    const exact = typed.get(name) || [];
    const signature = exact[0]?.signature || (owner.section && ts ? ts[1].trim() : owner.section?.title || name);
    const purpose = listed.get(name)?.purpose || first(prose(owner.section ? text : '').replace(/^-\s*/, '')) || `${name}；所属能力：${conditions[d.id] || d.headings.find(h => h.level === 1)?.title || d.id}`;
    return {name, ...owner, signature, overloads: exact.length, typeSources: exact, purpose, state: listed.get(name)?.state || '', effect: effects(name)};
  });
}
function catalog(root, groupId, ledger = []) {
  const group = config.groups.find(x => x.id === groupId);
  if (!group) throw new Error(`UNKNOWN_GROUP ${groupId}`);
  const out = [`---\ndocType: index\n---\n\n# ${group.title}`, group.purpose,
    '从 [Agent 短入口](README.md) 按任务进入本组；不顺序通读其他组。下表由唯一 Reference/类型确定性生成，不是另一份行为合同。',
    '`node scripts/api-docs.js read <文档名> <方法名>` 返回正文及必要共享段；只读文档，不调用方法。类型中的公开声明不等于当前宿主已授权/已实现。摘要中的省略不用于执行决策。'];
  for (const id of group.docs) {
    const d = doc(root, id, ledger);
    out.push(`\n## ${d.headings.find(h => h.level === 1)?.title || id}\n\n${conditions[id] || '状态、前置权限、平台、错误/等待/取消与副作用按选中正文核对。'}\n\n来源：[${id}.md](../${id}.md)。`);
    if (groupId === 'entrypoints') {
      out.push('| 命令/协议章节 | 完整正文 |\n| --- | --- |');
      for (const h of d.headings.filter(h => h.level === 2)) out.push(`| ${esc(h.title)} | [读取](../${id}.md#${h.anchor})；\`read ${id} "#${h.anchor}"\` |`);
      continue;
    }
    out.push('| 精确方法；主要输入 → 输出（签名） | 解决的问题 | 副作用；适用限制 | 契约获取 |\n| --- | --- | --- | --- |');
    for (const e of methodEntries(root, d, ledger)) {
      const signature = e.signature.length > 260 ? `${e.signature.slice(0, 260)}…〔长签名需 read --types〕` : e.signature;
      const target = e.section ? `#${e.section.anchor}` : '';
      const note = e.mode === 'missing-contract' ? ' **正文缺口：禁止据类型直接生成调用**' : (e.mode === 'shared-page' || config.wholePages.has(id)) ? ' 共享整页兜底' : '';
      out.push(`| \`${esc(signature)}\`${e.overloads > 1 ? `（${e.overloads} 个声明；--types 核对）` : ''} | ${esc(first(e.purpose.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1'), 85))} | ${esc(e.effect)}；${esc((e.state || '继承本节限制').replace(/\[([^\]]*)\]\([^)]*\)/g, '$1'))} | [${e.name}](../${id}.md${target})；\`read ${id} ${e.name}\`${note} |`);
    }
  }
  const sources = [...new Map(ledger.map(x => [x.path, x])).values()];
  out.push('\n## 生成依据\n\n维护命令：`node scripts/api-docs.js generate`；校验：`node scripts/api-docs.js check`。不能手工改本表；修改 canonical 正文/类型后重生成。下面是内容版本，不把旧行号当成当前定位。\n');
  for (const s of sources) out.push(`- \`${s.path}\` SHA-256 \`${s.sha256}\``);
  return out.join('\n\n').replace(/(?<=\|)\n\n(?=\|)/g, '\n') + '\n';
}
function readContract(root, id, name, withTypes = false) {
  const programReads = [], blocks = [], typeSeeds = [], visited = new Set();
  const cache = new Map();
  const load = id => { id = id.replace(/\.md$/, ''); if (!cache.has(id)) cache.set(id, doc(root, id, programReads)); return cache.get(id); };
  const add = (d, s, reason) => {
    if (s.end <= s.start) return;
    blocks.push({path: d.rel, startLine: s.start + 1, endLine: s.end, sourceSha256: hash(d.text), reason, text: sectionText(d, s)});
  };
  const shared = (d, method) => {
    const firstH2 = d.headings.find(h => h.level === 2)?.start ?? d.lines.length;
    add(d, {start: 0, end: firstH2}, 'page-preconditions');
    if (d.id === 'runtime') return;
    for (const h of d.headings.filter(h => h.level === 2)) {
      if (d.id === 'desktop-ui' && h.title === '公共约定') {
        for (const title of config.uiShared) add(d, section(d, title), 'UI-common');
      } else if (!config.navigation.test(h.title) && !isMethodHeading(d.id, h)) add(d, h, 'page-shared-contract');
      if (/API 一览|方法总表|全局接口一览/.test(h.title)) {
        // 概览表之后可能有权限/业务成功边界：保留非表格尾部，不加载所有候选方法。
        let lastRow = h.start;
        for (let i = h.start; i < h.end; i++) if (/^\s*\|/.test(d.lines[i])) lastRow = i;
        if (lastRow > h.start) add(d, {start: lastRow + 1, end: h.end}, 'overview-safety-tail');
      }
    }
  };
  const visit = (id, name) => {
    const key = `${id}:${name}`;
    if (visited.has(key)) return;
    visited.add(key);
    if (visited.size > 48) throw new Error('DEPENDENCY_LIMIT: no truncated contract returned');
    const d = load(id);
    if (name.startsWith('#')) {
      const selected = section(d, name.slice(1));
      const owners = methodEntries(root, d, programReads).filter(e => e.section?.anchor === selected.anchor);
      if (owners.length) { for (const e of owners) visit(id, e.name); }
      else { add(d, selected, 'explicit-section'); shared(d, name); }
      return;
    }
    const found = ownerSection(d, name);
    if (found.mode === 'missing-contract') throw new Error(`MISSING_CANONICAL_CONTRACT ${d.rel} ${name}`);
    if (config.wholePages.has(d.id) || found.mode === 'shared-page') add(d, {start: 0, end: d.lines.length}, 'legacy-shared-page-fallback');
    else {add(d, found.section, 'selected-method'); shared(d, name);}
    for (const dep of config.dependencies.filter(x => x.doc === d.id && x.method.test(name))) {
      for (const target of dep.sections || []) {
        const [targetId, heading] = target.split('#');
        const other = load(targetId);
        add(other, section(other, heading), `required-by:${name}`);
      }
      if (dep.delegate) visit(d.id, dep.delegate(name));
      for (const [targetId, targetMethod] of dep.contracts || []) visit(targetId, targetMethod);
    }
    if (/getCapabilities$/.test(name)) add(load('capabilities'), {start: 0, end: load('capabilities').lines.length}, 'capability-field-semantics');
    if (withTypes) {
      const declarations = typeMethods(root, d.id, programReads).get(name) || [];
      typeSeeds.push(...declarations.map(t => t.raw));
      for (const t of declarations) blocks.push({path: t.rel, startLine: null, endLine: null, sourceSha256: programReads.find(r => r.path === t.rel).sha256, reason: 'exact-type-member-not-behavior', text: '声明：`' + name + '`\n\n```ts\n' + (t.raw.startsWith('function ') ? t.raw : 'interface SelectedMember { ' + t.raw + ' }') + '\n```'});
    }
  };
  visit(id, name);
  if (withTypes && typeSeeds.length) blocks.push(...publicTypes(root, typeSeeds, programReads));
  // 对重叠源范围做并集，去重而不删减正文；不同来源不串成伪造连续章节。
  const merged = [];
  for (const rel of [...new Set(blocks.map(b => b.path))]) {
    const ranges = blocks.filter(b => b.path === rel && b.startLine !== null && !b.typeExcerpt).sort((a, b) => a.startLine - b.startLine);
    for (const b of ranges) {
      const prev = merged[merged.length - 1];
      if (prev && prev.path === rel && b.startLine <= prev.endLine + 1) {
        prev.endLine = Math.max(prev.endLine, b.endLine);
        prev.reason += `,${b.reason}`;
        prev.text = load(rel.split('/').pop().replace(/\.md$/, '')).lines.slice(prev.startLine - 1, prev.endLine).join('\n');
      } else merged.push({...b});
    }
    merged.push(...blocks.filter(b => b.path === rel && (b.startLine === null || b.typeExcerpt)));
  }
  const snapshot = [...new Map(programReads.map(r => [r.path, r])).values()];
  // 当前文件在准备输出期间发生变化时失败，不混用两版资料。
  for (const s of snapshot) if (hash(fs.readFileSync(path.join(root, s.path))) !== s.sha256) throw new Error(`SOURCE_CHANGED ${s.path}`);
  let revision = 'unavailable (source hashes above identify content)';
  try { revision = cp.execFileSync('git', ['rev-parse','HEAD'], {cwd: root, stdio: ['ignore','pipe','ignore']}).toString().trim(); } catch {}
  const output = [`# API 阅读包：${name}`, `Revision: ${revision}`, '这是选中 Reference 的原文与声明依赖，不是执行结果或宿主能力证明。未说明的行为必须补证；不得从类型/示例猜测授权、错误或成功。',
    ...merged.map(b => `<!-- source: ${b.path}:${b.startLine ?? 'member'}-${b.endLine ?? 'member'} sha256=${b.sourceSha256} reason=${b.reason} -->\n\n${b.text}`),
    '<!-- END_API_READING_PACKET: only a packet with this marker is complete -->'].join('\n\n') + '\n';
  return {output, report: {selection: {doc: id, selector: name, withTypes}, packetSha256: hash(output), revision, programReads: snapshot, returnedRanges: merged.map(({text, ...b}) => ({...b, ...size(text)})), returned: size(output), tokenUsage: null, modelLoaded: false, desktopExecuted: false}};
}
function checkLinks(root, rel, text) {
  const errors = [];
  for (const m of text.matchAll(/\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) {
    if (/^(?:https?:|mailto:)/.test(m[1])) continue;
    const [dest, anchor] = m[1].split('#');
    const file = dest ? path.posix.normalize(path.posix.join(path.posix.dirname(rel), decodeURIComponent(dest))) : rel;
    if (file.startsWith('../') || !fs.existsSync(path.join(root, file))) {errors.push(`LINK_MISSING ${rel} -> ${m[1]}`); continue;}
    if (anchor && file.endsWith('.md')) {
      const d = parseMarkdown(fs.readFileSync(path.join(root, file), 'utf8'));
      if (!d.headings.some(h => h.anchor === decodeURIComponent(anchor))) errors.push(`ANCHOR_MISSING ${rel} -> ${m[1]}`);
    }
  }
  return errors;
}
// 清单覆盖不以旧机器索引或既有生成目录证明自己；发现未路由的新公开对象/Reference 即失败。
function inventory(root) {
  const docs = new Set(config.groups.flatMap(g => g.docs));
  const roots = new Set(Object.values(config.surfaces).flat().map(n => n.split('.')[0]));
  const globals = new Set(), errors = [];
  const declaredReferences = [];
  for (const file of fs.readdirSync(path.join(root, 'docs/api')).filter(f => f.endsWith('.md')).sort()) {
    const text = readFile(root, `docs/api/${file}`);
    const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text)?.[1] || '';
    if (!/^docType:\s*reference\s*$/m.test(frontmatter)) continue;
    declaredReferences.push(file);
    if (!docs.has(file.slice(0, -3))) errors.push(`UNROUTED_REFERENCE docs/api/${file}`);
  }
  for (const file of fs.readdirSync(path.join(root, 'types')).filter(f => f.endsWith('.d.ts')).sort()) {
    const text = maskTS(readFile(root, `types/${file}`));
    for (const block of text.matchAll(/\bdeclare\s+global\s*\{/g)) {
      const start = block.index + block[0].length - 1, end = closeAt(text, start);
      const body = text.slice(start + 1, end);
      for (const m of body.matchAll(/\b(?:var|const|let|function|class)\s+([\w$]+)/g)) {
        globals.add(m[1]);
        if (!roots.has(m[1])) errors.push(`UNROUTED_TYPE_GLOBAL types/${file} ${m[1]}`);
      }
    }
  }
  return {declaredReferences, declaredGlobals: [...globals].sort(), errors};
}
// 验证已接收的完整输出，不以 END 标记代替内容完整性；同版本来源才能通过。
function verifyPacket(root, output, report) {
  if (!report?.selection || typeof report.selection.doc !== 'string' || typeof report.selection.selector !== 'string' || typeof report.selection.withTypes !== 'boolean') throw new Error('INVALID_PACKET_PLAN');
  if (typeof output !== 'string' || hash(output) !== report.packetSha256 || size(output).bytes !== report.returned?.bytes || size(output).characters !== report.returned?.characters) throw new Error('PACKET_INCOMPLETE_OR_CHANGED');
  const current = readContract(root, report.selection.doc, report.selection.selector, report.selection.withTypes);
  if (current.output !== output || JSON.stringify(current.report.returnedRanges) !== JSON.stringify(report.returnedRanges)) throw new Error('PACKET_SOURCE_OR_PLAN_CHANGED');
  return {ok: true, packetSha256: report.packetSha256, returned: size(output), modelLoaded: false};
}
function boundedOutput(result, limit) {
  if (limit !== undefined && (!Number.isSafeInteger(limit) || limit < 1)) throw new Error('INVALID_MAX_BYTES');
  if (limit !== undefined && result.report.returned.bytes > limit) throw new Error(`PACKET_TOO_LARGE ${result.report.returned.bytes} > ${limit}; use plan and read every pinned range; no partial packet returned`);
  return result.output;
}
function check(root) {
  const errors = [], counts = {}, gaps = [], seenDocs = new Set();
  for (const group of config.groups) {
    const generated = catalog(root, group.id);
    const rel = `docs/api/agent/${group.id}.md`;
    if (!fs.existsSync(path.join(root, rel)) || fs.readFileSync(path.join(root, rel), 'utf8') !== generated) errors.push(`CATALOG_DRIFT ${rel}`);
    let methods = 0;
    for (const id of group.docs) {
      if (seenDocs.has(id)) errors.push(`DUPLICATE_DOC ${id}`);
      seenDocs.add(id);
      const d = doc(root, id);
      if (group.id !== 'entrypoints') {
        const entries = methodEntries(root, d);
        methods += entries.length;
        for (const e of entries) {
          if (e.mode === 'missing-contract') { gaps.push({doc: id, name: e.name, status: 'blocked-missing-canonical-contract'}); continue; } // 可发现的源契约缺口，不伪造为已发布方法。
          try {readContract(root, id, e.name);} catch (err) { errors.push(err.message); }
        }
      }
    }
    counts[group.id] = methods;
  }
  for (const file of ['README', ...config.groups.map(g => g.id)]) {
    const rel = `docs/api/agent/${file}.md`;
    if (fs.existsSync(path.join(root, rel))) errors.push(...checkLinks(root, rel, fs.readFileSync(path.join(root, rel), 'utf8')));
    else errors.push(`MISSING_ENTRY ${rel}`);
  }
  const coverageInventory = inventory(root);
  errors.push(...coverageInventory.errors);
  const report = {ok: errors.length === 0, inventory: coverageInventory, scope: 'navigation-and-extraction; not semantic certification', contractReadiness: gaps.length ? 'existing-source-gaps-blocked' : 'no-detected-gaps', groups: config.groups.length, documents: seenDocs.size, methodEntries: counts, declaredReferenceDocs: coverageInventory.declaredReferences.length, declaredTypeGlobals: coverageInventory.declaredGlobals.length, sourceContractGaps: gaps, errors, tokenUsage: null, modelLoaded: false, desktopExecuted: false};
  return report;
}
function main(args) {
  const [command, id, selector, ...rest] = args;
  if (command === 'generate') {
    if (args.length !== 1) throw new Error('GENERATE_TAKES_NO_ARGUMENTS');
    fs.mkdirSync(path.join(ROOT, 'docs/api/agent'), {recursive: true});
    for (const group of config.groups) fs.writeFileSync(path.join(ROOT, `docs/api/agent/${group.id}.md`), catalog(ROOT, group.id));
    console.log('API_DOC_CATALOG_GENERATED'); return;
  }
  if (command === 'check') {
    const result = check(ROOT); console.log(JSON.stringify(result, null, 2)); process.exitCode = result.ok ? 0 : 1; return;
  }
  if (command === 'catalog' && id) { process.stdout.write(catalog(ROOT, id)); return; }
  if (command === 'outline' && id) {
    const d = doc(ROOT, id);
    console.log(`# ${d.rel}\n\nSHA-256: ${hash(d.text)}\n\n| 章节 | 范围（1-based） |\n| --- | --- |`);
    for (const h of d.headings) console.log(`| ${esc(h.title)} | ${h.start + 1}–${h.end}; #${h.anchor} |`);
    return;
  }
  if (command === 'plan' && id && selector) {
    if (rest.some(x => x !== '--types')) throw new Error('UNKNOWN_PLAN_OPTION');
    const result = readContract(ROOT, id, selector, rest.includes('--types'));
    console.log(JSON.stringify(result.report, null, 2)); return;
  }
  if (command === 'read' && id && selector) {
    let limit;
    const flags = [];
    for (let i = 0; i < rest.length; i++) {
      if (rest[i] === '--max-bytes') {
        const raw = rest[++i];
        if (!/^[1-9]\d*$/.test(raw || '') || limit !== undefined) throw new Error('INVALID_MAX_BYTES');
        limit = Number(raw);
      } else if (['--types', '--report'].includes(rest[i])) flags.push(rest[i]);
      else throw new Error('UNKNOWN_READ_OPTION');
    }
    const result = readContract(ROOT, id, selector, flags.includes('--types'));
    const output = boundedOutput(result, limit);
    if (flags.includes('--report')) console.error(JSON.stringify(result.report, null, 2));
    process.stdout.write(output); return;
  }
  if (command === 'verify' && id && selector && rest.length === 0) {
    const packet = fs.readFileSync(id, 'utf8');
    const plan = JSON.parse(fs.readFileSync(selector, 'utf8'));
    console.log(JSON.stringify(verifyPacket(ROOT, packet, plan), null, 2)); return;
  }
  throw new Error('Usage: node scripts/api-docs.js catalog <group> | outline <doc> | plan <doc> <method-or-#anchor> | read <doc> <method-or-#anchor> [--types] [--report] [--max-bytes N] | verify <packet.md> <plan.json> | generate | check');
}
module.exports = {parseMarkdown, slug, declarations, typeMethods, methodEntries, catalog, readContract, check, doc, size, checkLinks, inventory, verifyPacket, boundedOutput};
if (require.main === module) { try {main(process.argv.slice(2));} catch (error) {console.error(`API_DOC_READ_ERROR ${error.message}`); process.exitCode = 2;} }
