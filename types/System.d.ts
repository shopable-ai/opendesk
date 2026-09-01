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

  interface OpenDeskSystem {
    /** Non-blocking workflow delay. This does not suspend the host operating system. */
    delay(milliseconds?: number): Promise<void>;
    getPlatformInfo(): OpenDeskPlatformInfo;
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
