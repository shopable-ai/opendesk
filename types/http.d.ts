export {};

declare global {
  interface ClawdeskHttpRequestOptions {
    url: string;
    method?: string;
    headers?: Record<string, string>;
    data?: unknown;
    [key: string]: unknown;
  }

  interface ClawdeskHttpResponse<T = unknown> {
    data: T;
    status: number;
    statusText: string;
    headers: Record<string, unknown>;
  }

  interface ClawdeskHttpClient {
    request<T = unknown>(options: ClawdeskHttpRequestOptions): ClawdeskHttpResponse<T>;
    get<T = unknown>(url: string, options?: Omit<ClawdeskHttpRequestOptions, "url" | "method">): ClawdeskHttpResponse<T>;
    post<T = unknown>(url: string, data?: unknown, options?: Omit<ClawdeskHttpRequestOptions, "url" | "method" | "data">): ClawdeskHttpResponse<T>;
  }

  var http: ClawdeskHttpClient;
}
