export {};

declare global {
  interface ClawdeskBrowserContext {
    browser(): ClawdeskBrowser;
    newPage(): ClawdeskPage;
    adoptPage(page: ClawdeskPage): void;
    pages(): ClawdeskPage[];
    lastPage(): ClawdeskPage | null;
    close(): void;
    isClosed(): boolean;
    cookies(): Array<Record<string, unknown>>;
    setCookies(cookies: Array<Record<string, unknown>>): void;
    clearCookies(): void;
    storage(): Record<string, unknown>;
    setStorage(key: string, value: unknown): void;
    getStorage(key: string): unknown;
    clearStorage(): void;
    session(): Record<string, unknown>;
    setSessionValue(key: string, value: unknown): void;
    getSessionValue(key: string): unknown;
    clearSession(): void;
  }

  interface ClawdeskBrowser {
    newPage(): ClawdeskPage;
    newContext(): ClawdeskBrowserContext;
    defaultContext(): ClawdeskBrowserContext;
    contexts(): ClawdeskBrowserContext[];
    pages(): ClawdeskPage[];
    lastPage(): ClawdeskPage | null;
    close(): void;
    isClosed(): boolean;
  }

  var browser: ClawdeskBrowser;
  var context: ClawdeskBrowserContext;
}
