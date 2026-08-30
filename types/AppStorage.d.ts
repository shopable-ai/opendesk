export {};

declare global {
  interface ClawdeskAppStorage {
    getItem(key: string): string;
    setItem(key: string, value: unknown): void;
    removeItem(key: string): void;
    clear(): void;
    getLength(): number;
    key(index: number): string;
  }

  var AppStorage: ClawdeskAppStorage;
}
