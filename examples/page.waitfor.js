
// Example 1: waitFor with a synchronous function
console.log("\nExample 1: waitFor with a synchronous function");

await page.waitFor(1000);  // Waits for 1 second

let counter = 0;
await page.waitFor(function() {
    counter++;
    console.log(`Checking sync condition... (attempt ${counter})`);
    return counter >= 3;  // Resolves after 3 attempts
}, { polling: 300 });
console.log("Sync function condition met!\n");

// Example 2: waitFor with an async function
console.log("Example 2: waitFor with an async function");
let asyncCounter = 0;
await page.waitFor(async function() {
    // Simulate async operation
    await new Promise(resolve => setTimeout(resolve, 100));
    asyncCounter++;
    console.log(`Checking async condition... (attempt ${asyncCounter})`);
    return asyncCounter >= 3;  // Resolves after 3 attempts
}, { polling: 200 });
console.log("Async function condition met!\n");

// Example 3: explicitly using waitForFunction
console.log("Example 3: Using waitForFunction directly");
let dataReady = false;

// Simulate data becoming ready after 1 second
setTimeout(() => {
    console.log("Data is now ready!");
    dataReady = true;
}, 1000);

await page.waitForFunction(() => {
    console.log("Checking if data is ready...");
    return dataReady;
}, { timeout: 5000, polling: 200 });
console.log("Successfully detected data ready state!\n");

// Example 4: waitForFunction with async data fetching simulation
console.log("Example 4: waitForFunction with async data fetching");
