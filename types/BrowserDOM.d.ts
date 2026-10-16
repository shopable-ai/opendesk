export {};
declare global {
  /** Bound to the host-authorized real tab/frame; never inferred from title or URL. */
  interface BrowserDOMScope {
    tab: number;
    frame: number;
    document?: string;
  }

  /** Core's intentionally limited exact semantic selectors, not Playwright/CSS. */
  type BrowserDOMLeafQuery =
    | { kind: 'role'; role: string; name: string }
    | { kind: 'label' | 'text' | 'testId'; value: string }
    | { kind: 'attribute'; attribute: 'id' | 'name' | 'data-testid' | 'data-action' | 'data-order-role'; value: string };
  type BrowserDOMQuery = BrowserDOMLeafQuery |
    { kind: 'relation'; axis: 'descendant'; within: BrowserDOMLeafQuery; target: BrowserDOMLeafQuery };

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
  type BrowserDOMCondition =
    | { kind: 'equals'; field: 'text' | 'value'; expected: string }
    | { kind: 'nonEmpty'; field: 'text' | 'value'; expected?: never };

  var BrowserDOM: {
    status(): BrowserDOMResponse;
    tabs(): BrowserDOMResponse;
    observe(args: { scope: BrowserDOMScope; timeoutMs?: number }): BrowserDOMResponse;
    locate(args: { scope: BrowserDOMScope; query: BrowserDOMQuery; timeoutMs?: number }): BrowserDOMResponse;
    read(args: { target: Record<string, any>; field: 'text' | 'value'; timeoutMs?: number }): BrowserDOMResponse;
    act(args: { operation: 'fill' | 'click'; target: Record<string, any>; value?: string; sourceReadRequestId?: string; timeoutMs?: number }): BrowserDOMResponse;
    wait(args: { target: Record<string, any>; condition: BrowserDOMCondition; timeoutMs?: number }): BrowserDOMResponse;
    verify(args: { target: Record<string, any>; condition: BrowserDOMCondition; timeoutMs?: number }): BrowserDOMResponse;
    close(): void;
  };
}
