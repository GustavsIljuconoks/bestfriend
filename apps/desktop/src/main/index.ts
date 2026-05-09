import {
  app,
  BrowserWindow,
  ipcMain,
  Menu,
  nativeTheme,
  shell,
  type MenuItemConstructorOptions,
} from 'electron'
import { join } from 'path'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { initDb, closeDb } from './db/index.js'
import { registerSettingsHandlers } from './ipc/settings.js'
import { registerLibraryHandlers } from './ipc/library.js'
import { registerChatHandlers } from './ipc/chat.js'
import { initJobQueue } from './jobs/JobQueue.js'

interface WindowBounds {
  x?: number
  y?: number
  width: number
  height: number
}

function stateFile(): string {
  return join(app.getPath('userData'), 'window-state.json')
}

function loadWindowState(): WindowBounds {
  try {
    const file = stateFile()
    if (existsSync(file)) {
      return JSON.parse(readFileSync(file, 'utf8')) as WindowBounds
    }
  } catch {
    // fall through to default
  }
  return { width: 1280, height: 820 }
}

function saveWindowState(win: BrowserWindow): void {
  const bounds = win.getBounds()
  try {
    writeFileSync(stateFile(), JSON.stringify(bounds))
  } catch {
    // non-fatal
  }
}

function buildMenu(win: BrowserWindow): void {
  const isMac = process.platform === 'darwin'

  const template: MenuItemConstructorOptions[] = [
    ...(isMac
      ? ([
          {
            label: app.name,
            submenu: [
              { role: 'about' },
              { type: 'separator' },
              {
                label: 'Settings…',
                accelerator: 'CmdOrCtrl+,',
                click: () => win.webContents.send('menu:navigate', '/settings'),
              },
              { type: 'separator' },
              { role: 'services' },
              { type: 'separator' },
              { role: 'hide' },
              { role: 'hideOthers' },
              { role: 'unhide' },
              { type: 'separator' },
              { role: 'quit' },
            ],
          },
        ] as MenuItemConstructorOptions[])
      : []),
    {
      label: 'File',
      submenu: [
        {
          label: 'New Chat',
          accelerator: 'CmdOrCtrl+N',
          click: () => win.webContents.send('menu:navigate', '/chat'),
        },
        { type: 'separator' },
        isMac ? { role: 'close' } : { role: 'quit' },
      ],
    },
    { role: 'editMenu' },
    {
      label: 'View',
      submenu: [
        {
          label: 'Inbox',
          accelerator: 'CmdOrCtrl+1',
          click: () => win.webContents.send('menu:navigate', '/inbox'),
        },
        {
          label: 'Library',
          accelerator: 'CmdOrCtrl+2',
          click: () => win.webContents.send('menu:navigate', '/library'),
        },
        {
          label: 'Chat',
          accelerator: 'CmdOrCtrl+3',
          click: () => win.webContents.send('menu:navigate', '/chat'),
        },
        {
          label: 'Feed',
          accelerator: 'CmdOrCtrl+4',
          click: () => win.webContents.send('menu:navigate', '/feed'),
        },
        { type: 'separator' },
        {
          label: 'Toggle Sidebar',
          accelerator: 'CmdOrCtrl+\\',
          click: () => win.webContents.send('menu:toggle-sidebar'),
        },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
        { role: 'toggleDevTools' },
      ],
    },
    { role: 'windowMenu' },
    {
      role: 'help',
      submenu: [
        {
          label: 'Bestfriend Help',
          click: () => shell.openExternal('https://bestfriend.app/help'),
        },
      ],
    },
  ]

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

function createWindow(): BrowserWindow {
  const state = loadWindowState()

  const win = new BrowserWindow({
    x: state.x,
    y: state.y,
    width: state.width,
    height: state.height,
    minWidth: 980,
    minHeight: 640,
    titleBarStyle: 'hiddenInset',
    vibrancy: 'sidebar',
    backgroundColor: '#00000000',
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  win.once('ready-to-show', () => {
    win.show()
    win.focus()
  })

  win.on('close', () => saveWindowState(win))

  if (process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return win
}

function registerIpcHandlers(win: BrowserWindow): void {
  ipcMain.handle('ping', () => 'pong')
  registerSettingsHandlers()
  registerLibraryHandlers()
  registerChatHandlers(win)
  initJobQueue(() => win.webContents)
}

function sendTheme(win: BrowserWindow): void {
  win.webContents.send('theme:update', nativeTheme.shouldUseDarkColors ? 'dark' : 'light')
}

app.on('quit', () => closeDb())

app.whenReady().then(() => {
  initDb()
  const win = createWindow()

  buildMenu(win)
  registerIpcHandlers(win)

  nativeTheme.on('updated', () => sendTheme(win))

  win.webContents.once('did-finish-load', () => sendTheme(win))

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    } else {
      win.show()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
