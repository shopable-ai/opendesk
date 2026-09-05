export {};

declare global {
  /** A value accepted by SQLite parameter binding. */
  type OpenDeskSQLiteParameter = null | boolean | string | number | bigint | Uint8Array;

  /**
   * Positional parameters bind to `?`; named parameters bind to `:name`,
   * `@name`, or `$name` (names start with a Unicode letter and may then use
   * letters, digits, or `_`, such as `:名字`). SQL text is never interpolated
   * from these values.
   */
  type OpenDeskSQLiteParams = OpenDeskSQLiteParameter[] | Record<string, OpenDeskSQLiteParameter>;

  /** A decoded SQLite column value returned from query(). */
  type OpenDeskSQLiteValue = null | string | number | Uint8Array;

  type OpenDeskSQLiteOpenMode = "rw" | "rwc" | "ro";

  interface OpenDeskSQLiteOperationOptions {
    /** Per-operation deadline from 1 through 600000 ms; defaults to 30000 and can only further restrict the execution deadline. */
    timeoutMs?: number;
    /** Further restrict this operation; it does not replace execution cancellation. */
    signal?: AbortSignal;
  }

  interface OpenDeskSQLiteOpenOptions extends OpenDeskSQLiteOperationOptions {
    /** Absolute path, or a path resolved against the immutable Execution.workdir. `:memory:` creates an isolated in-memory database; mode `ro` rejects for this special path. Protected Scheduler paths reject with `PROTECTED_PATH`. */
    path: string;
    /** `rw` opens only an existing database (the default); `rwc` may create it; `ro` is enforced by SQLite itself. */
    mode?: OpenDeskSQLiteOpenMode;
  }

  interface OpenDeskSQLiteQueryOptions extends OpenDeskSQLiteOperationOptions {
    /** Maximum returned row count from 1 through 100000. Defaults to 10000. */
    maxRows?: number;
    /** Maximum encoded result size in bytes from 1 through 64 MiB. Defaults to 8 MiB. */
    maxBytes?: number;
  }

  interface OpenDeskSQLiteBatchStatement {
    sql: string;
    params?: OpenDeskSQLiteParams;
  }

  interface OpenDeskSQLiteExecResult {
    changes: number;
  }

  interface OpenDeskSQLiteBatchResult {
    results: OpenDeskSQLiteExecResult[];
  }

  type OpenDeskSQLiteWriteState = "not_started" | "rolled_back" | "committed" | "unknown" | "not_applicable";

  /** Structured rejection for every expected SQLite open, query, write, limit, timeout, and cancellation failure. */
  interface OpenDeskSQLiteError extends Error {
    name: "SQLiteError";
    code: "INVALID_ARGUMENT" | "CLOSED" | "CANCELED" | "TIMEOUT" | "SQL_ERROR" |
      "OPEN_FAILED" | "READ_ONLY" | "RESULT_LIMIT" | "QUEUE_FULL" |
      "MULTIPLE_STATEMENTS" | "TRANSACTION_CONTROL_FORBIDDEN" |
      "CONNECTION_CONTROL_FORBIDDEN" | "PROTECTED_PATH" | "CLOSE_FAILED" |
      "INTERNAL";
    operation: "SQLite.open" | "SQLiteDatabase.exec" | "SQLiteDatabase.query" |
      "SQLiteDatabase.batch" | "SQLiteDatabase.close";
    /**
     * Compatibility summary for write completion. `false` means no commit was
     * observed, `true` means a commit was observed, and `null` means callers
     * must use writeState and treat `unknown` as non-retryable.
     */
    committed: boolean | null;
    /** Finer-grained write outcome; meaningful for writes and cancellation. */
    writeState: OpenDeskSQLiteWriteState;
  }

  interface OpenDeskSQLiteDatabase {
    /** Executes exactly one top-level SQL statement and returns the affected-row count. */
    exec(sql: string, params?: OpenDeskSQLiteParams, options?: OpenDeskSQLiteOperationOptions): Promise<OpenDeskSQLiteExecResult>;
    /** Returns row objects for exactly one top-level SQL statement; this is not a read-only guarantee. Use mode `ro` to enforce read-only access. */
    query(sql: string, params?: OpenDeskSQLiteParams, options?: OpenDeskSQLiteQueryOptions): Promise<Record<string, OpenDeskSQLiteValue>[]>;
    /** Runs every statement on this same physical connection in one all-or-nothing transaction. */
    batch(statements: OpenDeskSQLiteBatchStatement[], options?: OpenDeskSQLiteOperationOptions): Promise<OpenDeskSQLiteBatchResult>;
    /** Releases the execution-owned handle. Safe to call more than once. */
    close(): Promise<void>;
  }

  interface OpenDeskSQLite {
    /** Opens one execution-owned SQLite connection. */
    open(options: OpenDeskSQLiteOpenOptions): Promise<OpenDeskSQLiteDatabase>;
  }

  /** First-party, execution-owned SQLite Runtime API; it is not a Native Extension. */
  var SQLite: OpenDeskSQLite;
}
