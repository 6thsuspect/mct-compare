export interface MctDesktopApi {
  openFile: () => Promise<{ name: string; path: string; text: string } | null>;
  saveFile: (
    defaultPath: string,
    content: string,
  ) => Promise<{ path: string } | null>;
  appVersion: () => Promise<string>;
}

declare global {
  interface Window {
    mctDesktop?: MctDesktopApi;
  }
}

export {};
