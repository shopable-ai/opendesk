import type { HistoryByCustomer } from '../src/domain/history';
// Build-only compatibility for history.ts: validated history is a JSON tree of
// arrays, objects and strings. Goja has no structuredClone global. This does not
// claim to implement structuredClone for dates, cycles, transfers or host objects.
export const structuredClone = (history: HistoryByCustomer): HistoryByCustomer =>
  JSON.parse(JSON.stringify(history));
