'use strict';

console.log('=== page wait 示例 ===');

await page.waitFor(25);
console.log('page.waitFor(number) completed');

let attempts = 0;
const value = await page.waitFor(() => {
  attempts += 1;
  return attempts === 3 ? 'ready' : false;
}, {timeout: 1000, polling: 5});
console.log('condition result:', value, 'attempts:', attempts);

const controller = new AbortController();
const pending = page.waitForTimeout(30000, {signal: controller.signal});
controller.abort('example cancellation');
try {
  await pending;
} catch (error) {
  console.log('canceled wait:', error.name, error.code);
}

const all = await page.waitForAll([
  page.waitForTimeout(2).then(() => 'first'),
  'second',
], {timeout: 1000});
console.log('page.waitForAll:', all);
