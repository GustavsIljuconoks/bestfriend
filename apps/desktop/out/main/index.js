"use strict";
const electron = require("electron");
const path = require("path");
const fs = require("fs");
function stateFile() {
  return path.join(electron.app.getPath("userData"), "window-state.json");
}
function loadWindowState() {
  try {
    const file = stateFile();
    if (fs.existsSync(file)) {
      return JSON.parse(fs.readFileSync(file, "utf8"));
    }
  } catch {
  }
  return { width: 1280, height: 820 };
}
function saveWindowState(win) {
  const bounds = win.getBounds();
  try {
    fs.writeFileSync(stateFile(), JSON.stringify(bounds));
  } catch {
  }
}
function buildMenu(win) {
  const isMac = process.platform === "darwin";
  const template = [
    ...isMac ? [
      {
        label: electron.app.name,
        submenu: [
          { role: "about" },
          { type: "separator" },
          {
            label: "Settings…",
            accelerator: "CmdOrCtrl+,",
            click: () => win.webContents.send("menu:navigate", "/settings")
          },
          { type: "separator" },
          { role: "services" },
          { type: "separator" },
          { role: "hide" },
          { role: "hideOthers" },
          { role: "unhide" },
          { type: "separator" },
          { role: "quit" }
        ]
      }
    ] : [],
    {
      label: "File",
      submenu: [
        {
          label: "New Chat",
          accelerator: "CmdOrCtrl+N",
          click: () => win.webContents.send("menu:navigate", "/chat")
        },
        { type: "separator" },
        isMac ? { role: "close" } : { role: "quit" }
      ]
    },
    { role: "editMenu" },
    {
      label: "View",
      submenu: [
        {
          label: "Inbox",
          accelerator: "CmdOrCtrl+1",
          click: () => win.webContents.send("menu:navigate", "/inbox")
        },
        {
          label: "Library",
          accelerator: "CmdOrCtrl+2",
          click: () => win.webContents.send("menu:navigate", "/library")
        },
        {
          label: "Chat",
          accelerator: "CmdOrCtrl+3",
          click: () => win.webContents.send("menu:navigate", "/chat")
        },
        {
          label: "Feed",
          accelerator: "CmdOrCtrl+4",
          click: () => win.webContents.send("menu:navigate", "/feed")
        },
        { type: "separator" },
        {
          label: "Toggle Sidebar",
          accelerator: "CmdOrCtrl+\\",
          click: () => win.webContents.send("menu:toggle-sidebar")
        },
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" },
        { role: "toggleDevTools" }
      ]
    },
    { role: "windowMenu" },
    {
      role: "help",
      submenu: [
        {
          label: "Bestfriend Help",
          click: () => electron.shell.openExternal("https://bestfriend.app/help")
        }
      ]
    }
  ];
  electron.Menu.setApplicationMenu(electron.Menu.buildFromTemplate(template));
}
function createWindow() {
  const state = loadWindowState();
  const win = new electron.BrowserWindow({
    x: state.x,
    y: state.y,
    width: state.width,
    height: state.height,
    minWidth: 980,
    minHeight: 640,
    titleBarStyle: "hiddenInset",
    vibrancy: "sidebar",
    backgroundColor: "#00000000",
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.js"),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  win.once("ready-to-show", () => {
    win.show();
    win.focus();
  });
  win.on("close", () => saveWindowState(win));
  if (process.env["ELECTRON_RENDERER_URL"]) {
    win.loadURL(process.env["ELECTRON_RENDERER_URL"]);
  } else {
    win.loadFile(path.join(__dirname, "../renderer/index.html"));
  }
  return win;
}
function registerIpcHandlers() {
  electron.ipcMain.handle("ping", () => "pong");
}
function sendTheme(win) {
  win.webContents.send("theme:update", electron.nativeTheme.shouldUseDarkColors ? "dark" : "light");
}
electron.app.whenReady().then(() => {
  const win = createWindow();
  buildMenu(win);
  registerIpcHandlers();
  electron.nativeTheme.on("updated", () => sendTheme(win));
  win.webContents.once("did-finish-load", () => sendTheme(win));
  electron.app.on("activate", () => {
    if (electron.BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    } else {
      win.show();
    }
  });
});
electron.app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    electron.app.quit();
  }
});
