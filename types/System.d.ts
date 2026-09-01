export {};

declare global {
  interface OpenDeskSystemInfo {
    hostname?: string;
    os?: string;
    platform?: string;
    platformVersion?: string;
    kernelVersion?: string;
    uptime?: number;
    cpuModel?: string;
    cpuCores?: number;
    cpuMHz?: number;
    totalMemory?: number;
    freeMemory?: number;
    usedMemory?: number;
    memoryUsage?: number;
  }

  interface OpenDeskProcessInfo {
    pid: number;
    name: string;
    cmdline: string;
    username: string;
    cpuPercent: number;
    memPercent: number;
  }

  interface OpenDeskNetworkInterfaceInfo {
    name: string;
    bytesSent: number;
    bytesRecv: number;
    packetsSent: number;
    packetsRecv: number;
    errors: number;
    drops: number;
  }

  interface OpenDeskNetworkConnectionInfo {
    fd: number;
    family: number;
    type: number;
    localAddr: string;
    remAddr: string;
    status: string;
    pid: number;
  }

  interface OpenDeskPlatformInfo {
    os: "darwin" | "linux" | "windows" | string;
    arch: string;
    processId: number;
    runtimeVersion: string;
  }

  interface OpenDeskSystemSessionOperationCapability {
    supported: boolean;
    /** Repository evidence is not promoted into a per-host attestation. */
    verified: boolean;
    destructive: boolean;
    requiresConfirmation: boolean;
    notes?: string;
  }

  interface OpenDeskSystemSessionCapabilities {
    schemaVersion: 1;
    platform: string;
    backend: string;
    state: OpenDeskSystemSessionOperationCapability;
    lock: OpenDeskSystemSessionOperationCapability;
    logout: OpenDeskSystemSessionOperationCapability;
    startScreenSaver: OpenDeskSystemSessionOperationCapability;
    wake: OpenDeskSystemSessionOperationCapability;
    switchUser: OpenDeskSystemSessionOperationCapability;
  }

  interface OpenDeskSystemSessionState {
    schemaVersion: 1;
    platform: string;
    backend: string;
    state: "active" | "background" | "starting" | "closing" | "online" | "unknown" | string;
    userId: number | string | null;
    sessionId: number | string | null;
    active: boolean | null;
    onConsole: boolean | null;
    loginDone: boolean | null;
    remote: boolean | null;
    /** null means the backend cannot determine current lock state reliably. */
    locked: boolean | null;
    observedAt: string;
  }

  interface OpenDeskSystemSessionActionResult {
    initiated: true;
    /** false because request acceptance is not a lock/logout postcondition. */
    verified: false;
    operation: "System.lock" | "System.logout" | "System.startScreenSaver";
    platform: string;
    backend: string;
  }

  interface OpenDeskSystem {
    /** Non-blocking workflow delay. This does not suspend the host operating system. */
    delay(milliseconds?: number): Promise<void>;
    getPlatformInfo(): OpenDeskPlatformInfo;
    getSessionCapabilities(): OpenDeskSystemSessionCapabilities;
    getSessionState(): OpenDeskSystemSessionState;
    /** Experimental. Always requires explicit confirmation and may end desktop automation. */
    lock(options: { confirm: true }): OpenDeskSystemSessionActionResult;
    /** Experimental and destructive. force=true may discard unsaved work. */
    logout(options: { confirm: true; force?: boolean }): OpenDeskSystemSessionActionResult;
    /** Experimental. Host policy may immediately require a password to resume. */
    startScreenSaver(options: { confirm: true }): OpenDeskSystemSessionActionResult;
    getSystemInfo(): OpenDeskSystemInfo;
    getProcessList(): OpenDeskProcessInfo[];
    killProcess(pid: number): void;
    getNetworkInterfaces(): OpenDeskNetworkInterfaceInfo[];
    getNetworkConnections(): OpenDeskNetworkConnectionInfo[];
    getPowerInfo(): Record<string, unknown>;
    shutdown(delay: number): void;
    restart(delay: number): void;
    /** Suspends the host operating system; use delay() to pause only the script. */
    sleep(): void;
    getDirectoryContents(path: string): Array<Record<string, unknown>>;
    getExecutablePath(): string;
    getWorkingDirectory(): string;
    getUserInfo(): Record<string, unknown>;
    isAdministrator(): boolean;
    getSystemMetrics(): Record<string, number>;
    getFingerprint(): string;
    toJSON(data: unknown): string;
  }

  var System: OpenDeskSystem;
}
