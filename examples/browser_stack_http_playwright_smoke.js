console.log('http playwright smoke request payload');
console.log(JSON.stringify({
  method: 'POST',
  path: '/executions',
  body: {
    script: "console.log('http playwright smoke start'); console.log(page === pageUpgraded && browser === browserUpgraded && context === contextUpgraded); console.log(typeof playwright.chromium.launch === 'function');",
    stack: 'playwright',
    timeout: 1,
    consoleMode: 'summary'
  }
}, null, 2));
