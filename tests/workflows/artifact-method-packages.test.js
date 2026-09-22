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

for (const name of names) test('formal method package is reachable and paired: ' + name, () => {
  const method = path.join(base, 'skills', name, 'SKILL.md');
  const spec = path.join(base, 'skills', name, 'references/io-spec.md');
  const body = read(method), io = read(spec), navigation = read(path.join(base, 'WORKFLOW.md'));
  assert.match(body, new RegExp('^name: ' + name + '$', 'm'));
  assert.ok(body.includes('(references/io-spec.md)'));
  assert.ok(navigation.includes('skills/' + name + '/SKILL.md'));
  assert.ok(io.includes('agent-to-recipe-skill-contract.md'));
  assert.ok(io.includes('validation-plan.md'));
  assert.ok(io.includes('拒绝') && io.includes('复用'));
  for (const [file, content] of [[method, body], [spec, io]]) {
    for (const match of content.matchAll(/\]\(([^)]+)\)/g)) {
      const target = match[1].split('#')[0];
      if (!target || /^https?:/.test(target)) continue;
      assert.ok(fs.existsSync(path.resolve(path.dirname(file), target)), file + ' -> ' + target);
    }
  }
});

test('documented through parameters match the actual checker, without a procedure alias', () => {
  const help = spawnSync(process.execPath, ['workflows/agent-to-recipe/scripts/check-artifact-chain.js', '--help'],
    { cwd: REPO, encoding: 'utf8' });
  assert.equal(help.status, 0);
  const allowed = help.stdout.match(/--through ([a-z|\-]+)/)[1].split('|');
  for (const name of names) for (const suffix of ['SKILL.md', 'references/io-spec.md']) {
    const body = read(path.join(base, 'skills', name, suffix));
    for (const item of body.matchAll(/--through ([a-z-]+)/g)) assert.ok(allowed.includes(item[1]), name + ': ' + item[1]);
  }
  assert.ok(!allowed.includes('procedure'));
});

for (const [name, through] of [['trace-distill', 'trace-distill'], ['procedure-synthesize', 'procedure-synthesize'],
  ['code-rebuild', 'candidate']]) test('documented command executes at its own boundary: ' + name, t => {
  const f = fixture(t);
  const body = read(path.join(base, 'skills', name, 'SKILL.md'));
  const command = body.split('\n').find(line => line.startsWith('node workflows/') && line.includes('--through ' + through));
  assert.ok(command);
  let resolved = command;
  for (const [placeholder, value] of Object.entries({
    '<dossier.json>': f.options.dossier, '<actions.json>': f.options.actions,
    '<distilled-steps.json>': f.options.distilled, '<procedure.json>': f.options.procedure,
    '<candidate.json>': f.options.candidate, '<id=directory>': 'fixture=' + f.root,
  })) resolved = resolved.replaceAll(placeholder, value);
  assert.ok(!resolved.includes('<'));
  // Physically absent future artifacts must not become prerequisites.
  fs.unlinkSync(f.options.qualification);
  if (through !== 'candidate') fs.unlinkSync(f.options.candidate);
  if (through === 'trace-distill') fs.unlinkSync(f.options.procedure);
  const result = spawnSync(process.execPath, resolved.split(/\s+/).slice(1), { cwd: REPO, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.verdict, 'pass');
  assert.equal(report.stageComplete, false);
  assert.equal(report.liveQualificationGranted, false);
});
