export async function add(left, right) {
  await new Promise((resolve) => setTimeout(resolve, 5));
  return left + right;
}

export const base = 40;
