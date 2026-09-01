export {};

declare global {
  interface OpenDeskGlobalShortcut {
    /**
     * Permission guidance belongs to `page.requestPermissions`; registering a
     * shortcut never opens macOS privacy prompts or settings pages.
     */
    /**
     * Registers one system-wide accelerator for this JavaScript Runtime.
     * Registration throws a structured Error on invalid, duplicate, occupied,
     * unsupported, or permission-denied accelerators.
     */
    register(accelerator: string, callback: () => unknown | Promise<unknown>): void;
    unregister(accelerator: string): void;
    isRegistered(accelerator: string): boolean;
    unregisterAll(): void;
  }

  var globalShortcut: OpenDeskGlobalShortcut;
}
