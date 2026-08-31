export {};

declare global {
  interface OpenDeskBrowserContext {
    browser(): OpenDeskBrowser;
    newPage(): OpenDeskPage;
    adoptPage(page: OpenDeskPage): void;
    pages(): OpenDeskPage[];
    lastPage(): OpenDeskPage | null;
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

  interface OpenDeskBrowser {
    newPage(): OpenDeskPage;
    newContext(): OpenDeskBrowserContext;
    defaultContext(): OpenDeskBrowserContext;
    contexts(): OpenDeskBrowserContext[];
    pages(): OpenDeskPage[];
    lastPage(): OpenDeskPage | null;
    close(): void;
    isClosed(): boolean;
  }

  var browser: OpenDeskBrowser;
  var context: OpenDeskBrowserContext;
}
