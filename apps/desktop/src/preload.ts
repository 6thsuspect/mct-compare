/**
 * Preload bridge: exposes a minimal, promise-based file API to the renderer.
 * The renderer detects `window.mctDesktop` and uses native dialogs; otherwise
 * it falls back to browser file pickers and downloads.
 */
import { contextBridge, ipcRenderer } from "electron";

export interface DesktopOpenResult {
  name: string;
  path: string;
  text: string;
}

export interface DesktopApi {
  openFile: () => Promise<DesktopOpenResult | null>;
  saveFile: (defaultPath: string, content: string) => Promise<{ path: string } | null>;
  appVersion: () => Promise<string>;
}

const api: DesktopApi = {
  openFile: () => ipcRenderer.invoke("mct:openFile"),
  saveFile: (defaultPath: string, content: string) =>
    ipcRenderer.invoke("mct:saveFile", { defaultPath, content }),
  appVersion: () => ipcRenderer.invoke("mct:appVersion"),
};

contextBridge.exposeInMainWorld("mctDesktop", api);
