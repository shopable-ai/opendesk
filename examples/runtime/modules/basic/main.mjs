import { addToBase } from "./lib/math.mjs";

export async function main() {
  const result = addToBase(2);
  if (result !== 42) {
    throw new Error(`ESM relative import result mismatch: ${result}`);
  }
  console.log(`ESM_RELATIVE_IMPORT_OK ${result}`);
}
