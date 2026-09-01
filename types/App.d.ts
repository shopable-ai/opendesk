export {};

declare global {
  type OpenDeskAppTarget =
    | number
    | string
    | { pid: number }
    | { name: string }
    | { bundleId: string }
    | { path: string };

  interface OpenDeskAppInstance {
    pid: number;
    name: string;
    bundleId: string;
    /** Application bundle path on macOS; executable path on fallback platforms when no bundle exists. */
    path: string;
    executablePath: string;
    activationPolicy: number;
    active: boolean;
    hidden: boolean;
    terminated: boolean;
    launchedAt: string | null;
  }

  interface OpenDeskAppGroup {
    identity: { kind: "pid" | "name" | "bundleId" | "path"; value: string | number };
    name: string;
    bundleId: string;
    path: string;
    pids: number[];
    instances: OpenDeskAppInstance[];
    running: true;
  }

  interface OpenDeskAppWaitOptions {
    /** Process snapshot or at least one window owned by a matching PID. Default: process. */
    waitUntilReady?: "process" | "window";
    /** Milliseconds; default 10000, maximum 300000. */
    timeout?: number;
  }

  interface OpenDeskAppLaunchOptions extends OpenDeskAppWaitOptions {
    /** Activate the application when the platform supports it. Default: true. */
    activate?: boolean;
    /** Reserved candidate; current backend rejects instead of ignoring it. */
    args?: never;
    /** Reserved candidate; current backend rejects instead of ignoring it. */
    env?: never;
    /** Reserved candidate; current backend rejects instead of ignoring it. */
    cwd?: never;
  }

  interface OpenDeskAppTerminateOptions {
    /** false requests graceful application termination; true requests immediate force termination. */
    force?: boolean;
    timeout?: number;
  }

  interface OpenDeskAppTerminateResult {
    terminated: true;
    force: boolean;
    pids: number[];
  }

  interface OpenDeskAppCapabilities {
    schemaVersion: 1;
    platform: string;
    backend: string;
    list: Record<string, unknown>;
    launch: Record<string, unknown>;
    terminate: Record<string, unknown>;
    readiness: {
      process: boolean;
      window: boolean;
      customPredicate: false;
    };
    grouping: { multiProcess: true; stableIdentityPreferred: true };
    verified?: boolean;
  }

  interface OpenDeskApp {
    launch(target: Exclude<OpenDeskAppTarget, number | { pid: number }>, options?: OpenDeskAppLaunchOptions): Promise<OpenDeskAppGroup>;
    get(target: OpenDeskAppTarget): OpenDeskAppGroup | null;
    list(options?: Record<string, never>): OpenDeskAppInstance[];
    isRunning(target: OpenDeskAppTarget): boolean;
    waitForLaunch(target: OpenDeskAppTarget, options?: OpenDeskAppWaitOptions): Promise<OpenDeskAppGroup>;
    waitForExit(target: OpenDeskAppTarget, options?: { timeout?: number }): Promise<true>;
    terminate(target: OpenDeskAppTarget, options?: OpenDeskAppTerminateOptions): Promise<OpenDeskAppTerminateResult>;
    restart(target: OpenDeskAppTarget, options?: OpenDeskAppLaunchOptions & { force?: boolean }): Promise<OpenDeskAppGroup>;
    getCapabilities(): OpenDeskAppCapabilities;
  }

  var App: OpenDeskApp;
}
