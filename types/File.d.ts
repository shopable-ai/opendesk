export {};

declare global {
  type ClawdeskByteInput = ArrayBuffer | Uint8Array | number[];

  interface ClawdeskFileSystem {
    path(relativePath: string): string;
    cwd(): string;
    create(path: string): void;
    createIfNotExists(path: string): void;
    createWithDirs(path: string): void;
    exists(path: string): boolean;
    ensureDir(path: string): void;
    read(path: string, encoding?: string): string;
    readBytes(path: string): ArrayBuffer;
    write(path: string, text: string, encoding?: string): void;
    append(path: string, text: string, encoding?: string): void;
    writeBytes(path: string, bytes: ClawdeskByteInput): void;
    appendBytes(path: string, bytes: ClawdeskByteInput): void;
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
    open(path: string, mode: "r" | "w" | "a"): unknown;
  }

  var File: ClawdeskFileSystem;
}
