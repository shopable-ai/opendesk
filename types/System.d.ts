declare class AppSystem {
    // System info related
    getSystemInfo: () => {
        hostname: string;
        os: string;
        platform: string;
        platformVersion: string;
        kernelVersion: string;
        uptime: number;
        cpuModel?: string;
        cpuCores?: number;
        cpuMHz?: number;
        totalMemory?: number;
        freeMemory?: number;
        usedMemory?: number;
        memoryUsage?: number;
    };

    // Process related
    getProcessList: () => {
        pid: number;
        name: string;
        cmdline: string;
        username: string;
        cpuPercent: number;
        memPercent: number;
    }[];

    killProcess: (pid: number) => boolean;

    // Network related
    getNetworkInterfaces: () => {
        name: string;
        bytesSent: number;
        bytesRecv: number;
        packetsSent: number;
        packetsRecv: number;
        errors: number;
        drops: number;
    }[];

    getNetworkConnections: () => {
        fd: number;
        family: string;
        type: string;
        localAddr: string;
        remAddr: string;
        status: string;
        pid: number;
    }[];

    // System metrics
    getSystemMetrics: () => {
        cpuUsage: number;
        memoryUsage: number;
        availableMemory: number;
        diskUsage: number;
        availableDisk: number;
    };

    // File system
    getDirectoryContents: (path: string) => {
        name: string;
        size: number;
        mode: string;
        modTime: string;
        isDir: boolean;
    }[];

    // User info
    getUserInfo: () => {
        username: string;
        userDomain?: string;
        userProfile?: string;
        homePath?: string;
        hostname?: string;
    };

    // Other utilities
    getFingerprint: () => string;
    isAdministrator: () => boolean;
    toJSON: (data: any) => string;
}

declare global {
    // @ts-ignore
    var System: AppSystem;
}

export {};