import { add, base } from "./math.mjs";

export async function main() {
  const result = await add(base, 2);
  if (result !== 42) {
    throw new Error(`ESM import result mismatch: ${result}`);
  }
  if (!Execution.scriptPath || !String(Execution.scriptPath).endsWith("main.mjs")) {
    throw new Error(`Execution.scriptPath did not preserve the module entry: ${Execution.scriptPath}`);
  }
  console.log(`ESM_IMPORT_OK ${result}`);
}
