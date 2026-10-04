export {};
declare global {
interface BrowserDOMScope {
  tab: number;
  frame: number;
  document?: string;
}
interface BrowserDOMResponse {
  requestId?: string;
  result?: Record<string, any>;
  error?: { code: string; outcome: string };
  outcome: string;
  executionId?: string;
  actionId?: string;
  source?: 'agent' | 'recipe';
  surface?: 'browser';
  evidence?: { tracePath: string; responsePath: string; coreTracePath: string };
  browserExecution?: Record<string, any>;
}
interface BrowserDOMCondition {
  kind: 'equals' | 'nonEmpty';
  field: 'text' | 'value';
  expected?: string;
}
var BrowserDOM: {
  status(): BrowserDOMResponse;
  tabs(): BrowserDOMResponse;
  observe(args: { scope: BrowserDOMScope; timeoutMs?: number }): BrowserDOMResponse;
  locate(args: { scope: BrowserDOMScope; query: Record<string, any>; timeoutMs?: number }): BrowserDOMResponse;
  read(args: { target: Record<string, any>; field: 'text' | 'value'; timeoutMs?: number }): BrowserDOMResponse;
  act(args: { operation: 'fill' | 'click'; target: Record<string, any>; value?: string; sourceReadRequestId?: string; timeoutMs?: number }): BrowserDOMResponse;
  wait(args: { target: Record<string, any>; condition: BrowserDOMCondition; timeoutMs?: number }): BrowserDOMResponse;
  verify(args: { target: Record<string, any>; condition: BrowserDOMCondition; timeoutMs?: number }): BrowserDOMResponse;
  close(): void;
};
}
