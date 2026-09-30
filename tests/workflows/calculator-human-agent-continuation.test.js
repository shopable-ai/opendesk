'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const repo = path.resolve(__dirname, '..', '..');
const read = relative => fs.readFileSync(path.join(repo, relative), 'utf8');

test('partial Human to Agent authoring contract stays wired to Recorder and Calculator', () => {
  const controller = read('apps/opendesk/recorder/controller-core.js');
  const mirror = read('internal/recorderbundle/assets/controller-core.js');
  const pipeline = read('docs/frameworks/demonstration-to-automation-pipeline.md');
  const skill = read('workflows/human-to-recipe/skills/human-to-recipe/SKILL.md');
  const golden = read('workflows/agent-to-recipe/cases/calculator-human-agent-continuation.md');

  assert.equal(mirror, controller, 'Recorder runtime mirror must equal canonical controller bytes');

  assert.match(controller, /saved: state\.saved/);
  assert.match(controller, /actions: state\.actions/);
  assert.match(controller, /Known/);
  assert.match(controller, /Unknown/);
  assert.match(controller, /Fresh Run \/ Qualification/);
  assert.match(controller, /Human 原始录制与事实只读保留/);

  assert.doesNotMatch(pipeline, /13 阶段|12 个阶段/);
  assert.doesNotMatch(pipeline, /^### 阶段 \d+/m);
  assert.match(pipeline, /目标[\s\S]*事实[\s\S]*数据关系[\s\S]*缺口补证[\s\S]*Candidate[\s\S]*Qualification/);

  assert.match(skill, /部分人工录制 → Agent 接续/);
  assert.match(skill, /不得因为录制不完整而默认重做整个任务/);

  assert.match(golden, /actions ready/);
  assert.match(golden, /firstResult/);
  assert.match(golden, /producer/);
  assert.match(golden, /source = hybrid/);
  assert.match(golden, /Fresh Qualification/);
  assert.match(golden, /not-run/);
});
