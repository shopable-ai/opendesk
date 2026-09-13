throw new Error("ESM_MODULE_RUNTIME_ERROR_EXPECTED");

export function main() {
  console.log("RUNTIME_ERROR_MAIN_SHOULD_NOT_RUN");
}
