export {};

declare global {
  interface OpenDeskPath {
    readonly sep: string;
    readonly delimiter: string;
    join(...paths: string[]): string;
    resolve(...paths: string[]): string;
    normalize(path: string): string;
    dirname(path: string): string;
    basename(path: string, suffix?: string): string;
    extname(path: string): string;
    relative(from: string, to: string): string;
    isAbsolute(path: string): boolean;
  }

  var path: OpenDeskPath;
}
