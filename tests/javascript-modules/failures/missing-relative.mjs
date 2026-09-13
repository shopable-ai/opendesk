import { missing } from "./dependency-does-not-exist.mjs";

export function main() {
  console.log("RELATIVE_DEPENDENCY_SHOULD_NOT_RUN", missing);
}
