export {};

declare global {
  type OpenDeskByteInput = ArrayBuffer | Uint8Array | number[];

  interface OpenDeskFileJSONReadOptions {
    /** Value returned only when the target file does not exist. The file is not created. */
    defaultValue?: unknown;
    /** UTF-8 JSON byte limit from 1 through 8 MiB. Defaults to 8 MiB. */
    maxBytes?: number;
    /** Further restrict this one operation; it does not replace execution cancellation. */
    signal?: AbortSignal;
  }

  interface OpenDeskFileJSONWriteOptions {
    /** JSON indentation from 0 through 10. Defaults to 2. */
    spaces?: number;
    /** Create missing parent directories. Defaults to true. */
    createDirs?: boolean;
    /** Serialized UTF-8 JSON byte limit from 1 through 8 MiB. Defaults to 8 MiB. */
    maxBytes?: number;
    /** Further restrict this one operation; it does not replace execution cancellation. */
    signal?: AbortSignal;
  }

  interface OpenDeskFileJSONError extends Error {
    code: 'INVALID_ARGUMENT' | 'FILE_NOT_FOUND' | 'PERMISSION_DENIED' | 'UNSUPPORTED_FILE_TYPE'
      | 'INVALID_ENCODING' | 'FILE_TOO_LARGE' | 'JSON_DEPTH_EXCEEDED' | 'JSON_PARSE_FAILED'
      | 'JSON_SERIALIZATION_FAILED' | 'CANCELED' | 'IO_FAILED' | 'ATOMIC_REPLACE_UNSUPPORTED';
    operation: 'File.readJSON' | 'File.writeJSON';
    /** True only when cancellation was observed after the replacement commit point. */
    committed: boolean;
  }

  interface OpenDeskFileHandle {
    /** Releases the native handle. Safe to call more than once. */
    close(): void;
    /** Reads remaining text, up to maxBytes (8 MiB by default and maximum). */
    read(maxBytes?: number): string;
    /** Reads remaining bytes, up to maxBytes (8 MiB by default and maximum). */
    readBytes(maxBytes?: number): ArrayBuffer;
    /** Writes text at the current file position. */
    write(text: string): void;
    /** Writes bytes at the current file position. */
    writeBytes(bytes: OpenDeskByteInput): void;
    /** Sets the file position and returns the resulting byte offset. */
    seek(offset: number, whence?: 'start' | 'current' | 'end'): number;
    /** Changes the file length. */
    truncate(size: number): void;
    /** Requests that the OS flush buffered file data. */
    sync(): void;
  }

  interface OpenDeskFileSystem {
    path(relativePath: string): string;
    cwd(): string;
    create(path: string): void;
    createIfNotExists(path: string): void;
    createWithDirs(path: string): void;
    exists(path: string): boolean;
    ensureDir(path: string): void;
    read(path: string, encoding?: string): string;
    readJSON(filePath: string, options?: OpenDeskFileJSONReadOptions): Promise<unknown>;
    readBytes(path: string): ArrayBuffer;
    write(path: string, text: string, encoding?: string): void;
    writeJSON(filePath: string, value: unknown, options?: OpenDeskFileJSONWriteOptions): Promise<void>;
    append(path: string, text: string, encoding?: string): void;
    writeBytes(path: string, bytes: OpenDeskByteInput): void;
    appendBytes(path: string, bytes: OpenDeskByteInput): void;
    copy(pathFrom: string, pathTo: string): void;
    renameWithoutExtension(path: string, newName: string): void;
    rename(path: string, newName: string): void;
    move(path: string, newPath: string): void;
    getExtension(fileName: string): string;
    getName(filePath: string): string;
    getNameWithoutExtension(filePath: string): string;
    remove(path: string): void;
    removeDir(path: string): void;
    listDir(path: string): string[];
    isFile(path: string): boolean;
    isDir(path: string): boolean;
    isEmptyDir(path: string): boolean;
    getHumanReadableSize(bytes: number): string;
    getSimplifiedPath(path: string): string;
    join(parent: string, ...children: string[]): string;
    open(path: string, mode: "r" | "w" | "a"): OpenDeskFileHandle;
  }

  var File: OpenDeskFileSystem;
}
