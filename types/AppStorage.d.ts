export {};

declare global {
  interface OpenDeskAppStorage {
    getItem(key: string): string;
    setItem(key: string, value: unknown): void;
    removeItem(key: string): void;
    clear(): void;
    getLength(): number;
    key(index: number): string;
  }

  var AppStorage: OpenDeskAppStorage;
}
