export {};

declare global {
  interface ClawdeskSystemInfo {
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

  interface ClawdeskProcessInfo {
    pid: number;
    name: string;
    cmdline: string;
    username: string;
    cpuPercent: number;
    memPercent: number;
  }

  interface ClawdeskNetworkInterfaceInfo {
    name: string;
    bytesSent: number;
    bytesRecv: number;
    packetsSent: number;
    packetsRecv: number;
    errors: number;
    drops: number;
  }

  interface ClawdeskNetworkConnectionInfo {
    fd: number;
    family: number;
    type: number;
    localAddr: string;
    remAddr: string;
    status: string;
    pid: number;
  }

  interface ClawdeskSystem {
    getSystemInfo(): ClawdeskSystemInfo;
    getProcessList(): ClawdeskProcessInfo[];
    killProcess(pid: number): void;
    getNetworkInterfaces(): ClawdeskNetworkInterfaceInfo[];
    getNetworkConnections(): ClawdeskNetworkConnectionInfo[];
    getPowerInfo(): Record<string, unknown>;
    shutdown(delay: number): void;
    restart(delay: number): void;
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

  var System: ClawdeskSystem;
}
