console.log('trigger automation only start');

const result = await page.requestMacAutomationPermission('System Events');
console.log('automation trigger result:', JSON.stringify(result, null, 2));

console.log('Keep alive 15s for macOS popup handling...');
await page.waitFor(15000);

console.log('trigger automation only done');
