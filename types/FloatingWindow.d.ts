export {};

declare global {
  interface ClawdeskFloatingWindow {
    addButton(id: string, label: string, iconName: string): void;
    removeButton(id: string): void;
    show(): void;
    hide(): void;
    setPosition(x: number, y: number): void;
    onButtonClick(buttonID: string, callback: () => void): void;
    setAlwaysOnTop(alwaysOnTop: boolean): void;
    run(): void;
  }

  var FloatingWindow: ClawdeskFloatingWindow | undefined;
}
