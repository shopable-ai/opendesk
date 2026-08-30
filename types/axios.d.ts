export {};

declare global {
  interface ClawdeskAxiosConfig {
    method?: string;
    url?: string;
    headers?: Record<string, unknown>;
    timeout?: number;
    params?: Record<string, unknown>;
    data?: unknown;
    responseType?: string;
    validateStatus?: (status: number) => boolean;
    [key: string]: unknown;
  }

  interface ClawdeskAxiosResponse<T = unknown> {
    data: T;
    status: number;
    statusText: string;
    headers: Record<string, unknown>;
  }

  interface ClawdeskAxiosInterceptorManager<T> {
    use(fulfilled: (value: T) => T | Promise<T>): number;
  }

  interface ClawdeskAxiosInstance {
    defaults: ClawdeskAxiosConfig;
    interceptors: {
      request: ClawdeskAxiosInterceptorManager<ClawdeskAxiosConfig>;
      response: ClawdeskAxiosInterceptorManager<ClawdeskAxiosResponse>;
    };
    request<T = unknown>(config: ClawdeskAxiosConfig): Promise<ClawdeskAxiosResponse<T>>;
    get<T = unknown>(url: string, config?: ClawdeskAxiosConfig): Promise<ClawdeskAxiosResponse<T>>;
    post<T = unknown>(url: string, data?: unknown, config?: ClawdeskAxiosConfig): Promise<ClawdeskAxiosResponse<T>>;
    put<T = unknown>(url: string, data?: unknown, config?: ClawdeskAxiosConfig): Promise<ClawdeskAxiosResponse<T>>;
    delete<T = unknown>(url: string, config?: ClawdeskAxiosConfig): Promise<ClawdeskAxiosResponse<T>>;
    patch<T = unknown>(url: string, data?: unknown, config?: ClawdeskAxiosConfig): Promise<ClawdeskAxiosResponse<T>>;
  }

  var axios: ClawdeskAxiosInstance;
}
