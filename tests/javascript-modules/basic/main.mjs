import { add, base } from "./math.mjs";
import { moduleEvaluationCount, moduleExecutionID } from "./execution-identity.mjs";
import { moduleEvaluationCount as reexportedEvaluationCount } from "./execution-identity-reexport.mjs";

export async function main() {
  const result = await add(base, 2);
  if (result !== 42) {
    throw new Error(`ESM import result mismatch: ${result}`);
  }
  const expectedScriptPath = path.resolve("tests/javascript-modules/basic/main.mjs");
  if (Execution.scriptPath !== expectedScriptPath || Execution.scriptDir !== path.dirname(expectedScriptPath)) {
    throw new Error(`Execution module path mismatch: ${Execution.scriptPath}/${Execution.scriptDir}`);
  }
  if (moduleEvaluationCount !== 1 || reexportedEvaluationCount !== 1) {
    throw new Error(`ESM module graph evaluated more than once: ${moduleEvaluationCount}/${reexportedEvaluationCount}`);
  }
  if (moduleExecutionID !== Execution.id) {
    throw new Error(`ESM dependency ran in a different Execution: ${moduleExecutionID}/${Execution.id}`);
  }
  console.log(`ESM_IMPORT_OK ${result}`);
}
