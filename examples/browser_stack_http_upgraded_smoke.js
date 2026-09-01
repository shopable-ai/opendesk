console.log('http upgraded smoke request payload');
console.log(JSON.stringify({
  method: 'POST',
  path: '/executions',
  body: {
    script: "console.log('http upgraded smoke start'); console.log(page === pageUpgraded); console.log(typeof page.locator === 'function');",
    stack: 'upgraded',
    timeout: 1,
    consoleMode: 'summary'
  }
}, null, 2));
