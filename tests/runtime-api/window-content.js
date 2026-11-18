// Repository root (pre-created, explicitly authorized macOS fixture windows only):
// ./dist/opendesk -script tests/runtime-api/window-content.js -console-mode script
// OPENDESK_WINDOW_CONTENT_CASES is a JSON object supplied in the execution env:
// {"windows":[{"title":"fixture A","text":"body-A","forbidden":["body-B","secret"]},
//             {"title":"fixture B","text":"body-B","forbidden":["body-A","secret"]}],
//  "errors":[{"title":"over-limit fixture","code":"BACKEND_FAILED"},
//            {"title":"duplicate fixture title","code":"AMBIGUOUS_TARGET"},
//            {"title":"known absent fixture","code":"NOT_FOUND"}]}
// Prefer same-process sibling windows with protected fields; require ordinary
// body text and forbid the secure value/label/subtree text. Positive text must
// differ from the title. Permission-denied is a separate process-permission run.
// An additional leaf-only empty fixture can use text:"" to require exactly "".
// Harness owns fixture setup/teardown and separate permission-denied/timeout runs.
// This test only reads exact supplied window titles. It never creates windows,
// opens services, activates applications, sends input, or reads Accessibility globals.
'use strict';
function check(ok, message) { if (!ok) throw new Error(message); }
const config = JSON.parse(Execution.env.OPENDESK_WINDOW_CONTENT_CASES || 'null');
check(config && Array.isArray(config.windows) && config.windows.length >= 2,
  'Provide at least two authorized fixture windows');
check(Array.isArray(config.errors) && config.errors.length > 0,
  'Provide explicit negative fixture cases');
let passed = 0;
for (let i = 0; i < config.windows.length; i++) {
  const c = config.windows[i];
  check(typeof c.title === 'string' && c.title && typeof c.text === 'string' &&
    (c.text === '' || !c.title.includes(c.text)), 'Invalid positive fixture oracle ' + i);
  check(Array.isArray(c.forbidden) && c.forbidden.length > 0 &&
    c.forbidden.every(s => typeof s === 'string' && s.length > 0), 'Missing isolation oracle ' + i);
  // Repeat read verifies the path is reusable after native resources are closed.
  for (let repeat = 0; repeat < 2; repeat++) {
    const value = window.getContent(c.title);
    check(typeof value === 'string', 'Content is not a string ' + i);
    check(c.text === '' ? value === '' : value !== c.title && value.includes(c.text),
      'Real body text missing or title fallback returned ' + i);
    check(c.forbidden.every(s => !value.includes(s)), 'Out-of-scope/protected text exposed ' + i);
    // Percent-encoded UTF-8 has one byte per %XX or literal ASCII character.
    const bytes = encodeURIComponent(value).replace(/%[0-9A-F]{2}/g, 'x').length;
    check(bytes <= 65536, 'Returned byte limit exceeded ' + i);
  }
  passed++;
}
for (let i = 0; i < config.errors.length; i++) {
  const c = config.errors[i];
  check(typeof c.title === 'string' && c.title && typeof c.code === 'string', 'Invalid error fixture ' + i);
  let failure;
  try { window.getContent(c.title); } catch (e) { failure = e; }
  check(failure && failure.code === c.code, 'Expected rejection code missing ' + i);
  check(failure.operation === 'window.getContent' && failure.platform === 'darwin',
    'Structured window error missing ' + i);
  passed++;
}
console.log('WINDOW_CONTENT_PASS ' + JSON.stringify({ passed, live: true, readOnly: true }));
