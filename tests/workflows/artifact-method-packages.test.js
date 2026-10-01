'use strict';
// Navigation/specification regression only. These checks do not execute a Skill,
// grant a business handoff, verify a model, or qualify a desktop Recipe.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { fixture, REPO } = require('./tools/artifact-fixture.js');
const names = ['automation-plan', 'application-engineer', 'task-demonstrate', 'trace-distill',
  'procedure-synthesize', 'recipe-build', 'code-rebuild', 'recipe-qualify'];
const base = path.join(REPO, 'workflows/agent-to-recipe');
const read = file => fs.readFileSync(file, 'utf8');
// These are selected by the methods, not inferred from whichever files survive.
// Missing split specifications must fail rather than fall back to the old io page.
const combinedMethods = new Set(['automation-plan', 'code-rebuild']);
const splitSpecs = ['input-spec.md', 'output-spec.md', 'validation.md', 'failure-handling.md'];
const checker = 'workflows/agent-to-recipe/scripts/check-artifact-chain.js';

function relativeLinks(file, content) {
  return [...content.matchAll(/\]\(([^)]+)\)/g)].flatMap(match => {
    const target = match[1].split('#')[0];
    if (!target || /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(target)) return [];
    return [{ target, file: path.resolve(path.dirname(file), target) }];
  });
}

function methodPackage(name) {
  const directory = path.join(base, 'skills', name);
  const method = path.join(directory, 'SKILL.md');
  const specNames = combinedMethods.has(name) ? ['io-spec.md'] : splitSpecs;
  const specs = specNames.map(suffix => ({
    file: path.join(directory, 'references', suffix),
    content: read(path.join(directory, 'references', suffix)),
  }));
  const entry = { file: method, content: read(method) };
  const compatibility = {
    file: path.join(directory, 'references/io-spec.md'),
    content: read(path.join(directory, 'references/io-spec.md')),
  };
  // Follow local method documentation, including templates and review guidance.
  // Example links are checked for existence; their answers are never loaded.
  const documents = new Map([entry, ...specs, compatibility].map(doc => [doc.file, doc]));
  for (const doc of documents.values()) for (const link of relativeLinks(doc.file, doc.content)) {
    assert.ok(fs.existsSync(link.file), doc.file + ' -> ' + link.target);
    const local = path.relative(directory, link.file);
    if (local.startsWith('..') || path.isAbsolute(local) || !local.endsWith('.md') ||
        local.split(path.sep).includes('examples') || documents.has(link.file)) continue;
    documents.set(link.file, { file: link.file, content: read(link.file) });
  }
  return { entry, specs, compatibility, documents: [...documents.values()] };
}

function assertLinked(doc, target) {
  assert.ok(relativeLinks(doc.file, doc.content).some(link => link.file === target),
    doc.file + ' must link to ' + target);
}

for (const name of names) test('formal method package is reachable and paired: ' + name, () => {
  const pkg = methodPackage(name);
  const workflow = path.join(base, 'WORKFLOW.md');
  const navigation = { file: workflow, content: read(workflow) };
  assert.match(pkg.entry.content, new RegExp('^name: ' + name + '$', 'm'));
  assert.match(pkg.entry.content, /^description: \S.+$/m);
  assertLinked(navigation, pkg.entry.file);
  for (const link of relativeLinks(workflow, navigation.content)) {
    assert.ok(fs.existsSync(link.file), workflow + ' -> ' + link.target);
  }
  assertLinked(pkg.entry, pkg.compatibility.file);
  for (const spec of pkg.specs) assertLinked(pkg.entry, spec.file);

  const contract = path.resolve(REPO, 'docs/frameworks/agent-to-recipe-skill-contract.md');
  const validationPlan = path.join(base, 'design/validation-plan.md');
  // Assert the selected normative documents, not keywords in a compatibility index.
  const formal = [pkg.entry, ...pkg.specs];
  assert.ok(formal.some(doc => relativeLinks(doc.file, doc.content).some(link => link.file === contract)),
    name + ': selected method must point to the shared contract');
  assert.ok(formal.some(doc => relativeLinks(doc.file, doc.content).some(link => link.file === validationPlan)),
    name + ': selected method must point to the validation plan');
  if (combinedMethods.has(name)) {
    assert.ok(pkg.specs[0].content.includes('拒绝') && pkg.specs[0].content.includes('复用'));
  } else {
    const requiredReading = pkg.entry.content.split(/\n\s*\n/).filter(paragraph => paragraph.includes('必读'));
    assert.ok(requiredReading.length, name + ': entry must declare mandatory reading');
    for (const spec of pkg.specs) {
      assertLinked({ file: pkg.entry.file, content: requiredReading.join('\n\n') }, spec.file);
    }
    for (const spec of pkg.specs) assertLinked(pkg.compatibility, spec.file);
    assertLinked(pkg.compatibility, pkg.entry.file);
    const [input, output, validation, failure] = pkg.specs.map(doc => doc.content);
    assert.match(input, /^# .*输入规格$/m);
    assert.match(input, /必需|进入条件/);
    assert.match(output, /^# .*输出规格$/m);
    assert.match(output, /主产物/);
    assert.match(validation, /^# .*正确性检查$/m);
    assert.match(validation, /典型错误|反例/);
    assert.match(failure, /^# .*失败处理/m);
    assert.match(failure, /返回|责任路由|路由/);
    assert.match(failure, /复用/);
    assert.match(failure, /unknown/);
    assert.match(failure, /保留|保存/);
  }
});

test('documented through parameters match the actual checker, without a procedure alias', () => {
  const help = spawnSync(process.execPath, [checker, '--help'],
    { cwd: REPO, encoding: 'utf8' });
  assert.equal(help.status, 0, help.stdout + help.stderr);
  const through = help.stdout.match(/--through ([a-z|\-]+)/);
  assert.ok(through, 'checker help must document its through values');
  const allowed = through[1].split('|');
  for (const name of names) for (const doc of methodPackage(name).documents) {
    for (const item of doc.content.matchAll(/--through ([a-z-]+)/g)) {
      assert.ok(allowed.includes(item[1]), doc.file + ': ' + item[1]);
    }
  }
  assert.ok(!allowed.includes('procedure'));
});

for (const [name, through] of [['trace-distill', 'trace-distill'], ['procedure-synthesize', 'procedure-synthesize'],
  ['code-rebuild', 'candidate']]) test('documented command executes at its own boundary: ' + name, t => {
  const pkg = methodPackage(name);
  const commands = new Map();
  for (const doc of pkg.documents) for (const line of doc.content.split('\n')) {
    if (line.trim().startsWith('node ' + checker + ' ')) commands.set(line.trim(), doc.file);
  }
  assert.ok(commands.size, name + ': selected method documents must include a checker command');
  for (const [command, document] of commands) {
    const f = fixture(t);
    const placeholders = {
      '<dossier.json>': f.options.dossier, '<actions.json>': f.options.actions,
      '<distilled-steps.json>': f.options.distilled, '<procedure.json>': f.options.procedure,
      '<candidate.json>': f.options.candidate, '<id=directory>': 'fixture=' + f.root,
    };
    const args = command.split(/\s+/).slice(1).map(arg => placeholders[arg] || arg);
    assert.equal(args[args.indexOf('--through') + 1], through, document + ': wrong method boundary');
    assert.ok(args.every(arg => !/[<>]/.test(arg)), document + ': unresolved command placeholder');
    // Physically absent future artifacts must not become prerequisites.
    fs.unlinkSync(f.options.qualification);
    if (through !== 'candidate') fs.unlinkSync(f.options.candidate);
    if (through === 'trace-distill') fs.unlinkSync(f.options.procedure);
    const result = spawnSync(process.execPath, args, { cwd: REPO, encoding: 'utf8' });
    assert.equal(result.status, 0, document + '\n' + result.stdout + result.stderr);
    const report = JSON.parse(result.stdout);
    assert.equal(report.verdict, 'pass');
    assert.equal(report.stageComplete, false);
    assert.equal(report.liveQualificationGranted, false);

    // The same documented command must reject its own missing required output.
    // A tolerant boundary must not become a command that always reports PASS.
    const required = { 'trace-distill': 'distilled', 'procedure-synthesize': 'procedure', candidate: 'candidate' }[through];
    fs.unlinkSync(f.options[required]);
    const missing = spawnSync(process.execPath, args, { cwd: REPO, encoding: 'utf8' });
    assert.equal(missing.status, 1, document + '\n' + missing.stdout + missing.stderr);
    const rejection = JSON.parse(missing.stdout);
    assert.equal(rejection.verdict, 'fail');
    assert.ok(rejection.errors.length, document + ': missing boundary artifact must report an error');
    assert.equal(rejection.stageComplete, false);
    assert.equal(rejection.liveQualificationGranted, false);
  }
});
