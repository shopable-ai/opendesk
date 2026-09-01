// Run from the repository root:
// go run ./cmd/opendesk ai run examples/ai-cli/write-to-focused-app.js --input '{"text":"Hello"}'
//
// Focus a known safe target first. This recipe intentionally has no hidden
// window lookup or visual reasoning: discovery belongs in `opendesk ai`.
async function main() {
  const { text } = Execution.input;
  if (typeof text !== 'string' || text.length === 0) {
    throw new Error('Execution.input.text must be a non-empty string');
  }
  await keyboard.type(text);
}

main();
