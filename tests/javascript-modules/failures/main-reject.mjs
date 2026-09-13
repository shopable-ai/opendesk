export async function main() {
  await new Promise((resolve) => setTimeout(resolve, 5));
  throw new Error("ESM_MAIN_REJECT_EXPECTED");
}
