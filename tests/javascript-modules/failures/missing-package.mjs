import { missing } from "@opendesk/definitely-missing-package";

export function main() {
  console.log("MISSING_PACKAGE_SHOULD_NOT_RUN", missing);
}
