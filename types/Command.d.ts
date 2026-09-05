export {};

declare global {
  interface OpenDeskCommandOptions {
    /** Working directory; defaults to the OpenDesk process working directory. */
    cwd?: string;
    /** String environment entries merged over the host environment. */
    env?: Record<string, string>;
    /** Complete UTF-8 stdin payload. */
    input?: string;
    /** Per-command deadline in milliseconds; 0 or omitted uses the enclosing execution deadline. */
    timeout?: number;
    /** Combined stdout/stderr byte bound; defaults to 4 MiB and cannot exceed 64 MiB. */
    maxOutputBytes?: number;
  }

  interface OpenDeskCommandResult {
    exitCode: number;
    stdout: string;
    stderr: string;
  }

  interface OpenDeskCommandError extends Error {
    name: "CommandError";
    code: string;
    readonly exitCode: number | null;
    readonly stdout: string;
    readonly stderr: string;
  }

  interface OpenDeskCommandCapabilities {
    schemaVersion: 1;
    enabled: boolean;
    supported: boolean;
    executionScoped: true;
  }

  var Command: {
    getCapabilities(): OpenDeskCommandCapabilities;
    run(command: string, args?: string[], options?: OpenDeskCommandOptions): Promise<OpenDeskCommandResult>;
    run(command: string, options?: OpenDeskCommandOptions): Promise<OpenDeskCommandResult>;
  };
}
