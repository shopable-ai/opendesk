export {};

declare global {
  type OpenDeskExecutionActivationSource = 'disabled' | 'cli' | 'projectConfig' | 'httpRequest';

  interface OpenDeskExecutionContext {
    /** Short alias for executionId. This is a correlation ID, not a credential. */
    readonly id: string;
    /** Correlation ID shared by runtime events, summaries, and artifacts. */
    readonly executionId: string;
    /** JSON-compatible input. Defaults to an empty object when no input was supplied. */
    readonly input: unknown;
    /** Working directory selected by the execution caller. */
    readonly workdir: string;
    /** Read-only local project + inherited OS snapshot. Remote callers get an empty object; Windows keys are uppercase. */
    readonly env: Readonly<Record<string, string>>;
    /** Runtime compatibility label. New scripts omit -stack. */
    readonly stack: string;
    /** Root directory for artifacts produced by this execution. */
    readonly artifactDir: string;
    /** Runtime source label such as file:..., inline, stdin, or a transport label. */
    readonly source: string;
    /** Source extension, normally .js. */
    readonly ext: string;
    /** Lowercase hexadecimal SHA-256 of the executed source bytes. */
    readonly scriptHash: string;
    /** Normalized absolute source path for a trusted file execution; otherwise null. */
    readonly scriptPath: string | null;
    /** dirname(scriptPath) for a trusted file execution; otherwise null. */
    readonly scriptDir: string | null;
    /** Custom UI authorization source; use ui/Dialog capabilities to test availability. */
    readonly activationSource: OpenDeskExecutionActivationSource;
  }

  var Execution: OpenDeskExecutionContext;
}
