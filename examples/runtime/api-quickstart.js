// Run from the repository root:
// ./opendesk -script examples/runtime/api-quickstart.js -console-mode script

async function main() {
  console.log("OpenDesk Runtime is ready.");
  await page.waitFor(50);
  console.log("Start with page, window, mouse, keyboard, Vision, or File as needed.");
}

main().catch((error) => {
  console.error(error);
  throw error;
});
