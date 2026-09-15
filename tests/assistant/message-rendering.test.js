import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {fileURLToPath} from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const controller = readFileSync(
  path.resolve(here, '../../apps/opendesk/assistant/controller.js'),
  'utf8',
);

test('assistant message rows use supported text controls and render atomically', () => {
  assert.match(controller, /<p id="messageRow\$\{index\}" class="message-row is-hidden"><\/p>/);
  assert.doesNotMatch(controller, /<div id="messageRow\$\{index\}"/);
  assert.match(controller, /<p id="messageEmpty" class="message-empty">/);
  assert.doesNotMatch(controller, /<div id="messageEmpty"/);
  assert.match(controller, /<p id="messageTranscript" class="message-transcript is-hidden"><\/p>/);

  assert.doesNotMatch(controller, /id="messageMeta\$\{index\}"/);
  assert.doesNotMatch(controller, /id="messageBody\$\{index\}"/);
  assert.doesNotMatch(controller, /id="messageState\$\{index\}"/);
  assert.match(
    controller,
    /await update\(record, `messageRow\$\{index\}`, \{\s*visible,\s*text: message \? messageDisplayText\(message\) : '',\s*classes: rowClasses,\s*\}\);/s,
  );
  assert.match(
    controller,
    /await update\(record, 'messageTranscript', \{\s*visible: messages\.length > 0,\s*text: messages\.length > 0 \? buildMessageOverflow\(messages\) : '',/s,
  );
});

test('assistant surfaces the stage of a swallowed Custom UI render failure', () => {
  assert.match(controller, /lastError = Object\.freeze\(\{\.\.\.details, stage: String\(stage \|\| 'unknown'\)\}\)/);
  assert.match(controller, /界面错误：\$\{lastError\.stage\}: \$\{lastError\.message\}/);
});
