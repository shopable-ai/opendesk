export async function main() {
  console.log("ESM_CANCEL_READY");
  await new Promise((resolve) => setTimeout(resolve, 10_000));
  console.log("ESM_CANCEL_LATE_BEHAVIOR");
}
