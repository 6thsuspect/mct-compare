/**
 * MCT Diff Studio — Electron main process (Windows target).
 *
 * Security posture: no node integration in the renderer, context isolation on,
 * file access only through the validated IPC handlers defined here. The UI is
 * the same React app as the web build; the engine runs in the renderer's Web
 * Worker exactly as in the browser.
 */
import { app, BrowserWindow, dialog, ipcMain, shell } from "electron";
import { readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";

const MAX_FILE_BYTES = 25 * 1024 * 1024;

const MCT_FILTERS: Electron.FileFilter[] = [
  { name: "MIDAS MCT files", extensions: ["mct", "civ", "txt"] },
  { name: "All files", extensions: ["*"] },
];

function isSafePath(p: unknown): p is string {
  return typeof p === "string" && p.length > 0 && p.length < 32768 && path.isAbsolute(p);
}

async function createWindow(): Promise<void> {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 640,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });

  const devUrl = process.env.MCT_DESKTOP_URL;
  if (devUrl) {
    await win.loadURL(devUrl);
  } else {
    await win.loadFile(path.join(__dirname, "../web-dist/index.html"));
  }

  // Open external links in the system browser, never in the app window.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("https:")) void shell.openExternal(url);
    return { action: "deny" };
  });
}

ipcMain.handle("mct:openFile", async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    title: "Open MCT file",
    filters: MCT_FILTERS,
    properties: ["openFile"],
  });
  if (canceled || filePaths.length === 0) return null;
  const filePath = filePaths[0];
  if (!isSafePath(filePath)) throw new Error("Rejected unsafe path.");
  const info = await stat(filePath);
  if (info.size > MAX_FILE_BYTES) {
    throw new Error(
      `File exceeds the ${(MAX_FILE_BYTES / 1024 / 1024).toFixed(0)} MB safety limit.`,
    );
  }
  const text = await readFile(filePath, "utf8");
  return { name: path.basename(filePath), path: filePath, text };
});

ipcMain.handle("mct:saveFile", async (_event, args: unknown) => {
  const { defaultPath, content } = (args ?? {}) as {
    defaultPath?: unknown;
    content?: unknown;
  };
  if (typeof content !== "string") throw new Error("Missing file content.");
  if (content.length > MAX_FILE_BYTES) {
    throw new Error("Content exceeds the 25 MB safety limit.");
  }
  const { canceled, filePath } = await dialog.showSaveDialog({
    title: "Save file",
    defaultPath:
      typeof defaultPath === "string" && defaultPath.length < 512
        ? path.basename(defaultPath)
        : "output.mct",
    filters: MCT_FILTERS,
  });
  if (canceled || !filePath) return null;
  if (!isSafePath(filePath)) throw new Error("Rejected unsafe path.");
  await writeFile(filePath, content, "utf8");
  return { path: filePath };
});

ipcMain.handle("mct:appVersion", () => app.getVersion());

app.whenReady().then(() => {
  void createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) void createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
