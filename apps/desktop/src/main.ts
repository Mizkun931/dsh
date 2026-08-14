/**
 * Electron entry for the DeepSeek Harness desktop app.
 * @module @deepseek-ai/dsh-desktop/main
 */

import { app, BrowserWindow, Menu, dialog, shell } from 'electron'
import { fileURLToPath } from 'node:url'
import { startHarnessWebServer, stopHarnessWebServer, type HarnessWebServer } from './launcher.ts'

const APP_TITLE = 'DeepSeek Harness'
const DEFAULT_WINDOW_WIDTH = 1280
const DEFAULT_WINDOW_HEIGHT = 860

let server: HarnessWebServer | undefined
let mainWindow: BrowserWindow | undefined
let splashWindow: BrowserWindow | undefined

const assetPath = (name: string): string => fileURLToPath(new URL(`../assets/${name}`, import.meta.url))

function createSplashWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 380,
    height: 320,
    show: false,
    frame: false,
    resizable: false,
    movable: true,
    backgroundColor: '#f8fafc',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })
  void win.loadFile(assetPath('splash.html'))
  win.once('ready-to-show', () => { win.show() })
  return win
}

function createMainWindow(url: string): BrowserWindow {
  const win = new BrowserWindow({
    width: DEFAULT_WINDOW_WIDTH,
    height: DEFAULT_WINDOW_HEIGHT,
    minWidth: 960,
    minHeight: 640,
    show: false,
    title: APP_TITLE,
    backgroundColor: '#f8fafc',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  const origin = new URL(url).origin
  win.webContents.setWindowOpenHandler(({ url: target }) => {
    if (sameOrigin(target, origin)) return { action: 'allow' }
    void shell.openExternal(target)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (event, target) => {
    if (sameOrigin(target, origin)) return
    event.preventDefault()
    void shell.openExternal(target)
  })
  return win
}

function sameOrigin(target: string, origin: string): boolean {
  try {
    return new URL(target).origin === origin
  } catch {
    return false
  }
}

async function showSplashError(message: string): Promise<void> {
  if (splashWindow === undefined || splashWindow.isDestroyed()) return
  await splashWindow.webContents.executeJavaScript(
    `document.body.dataset.state = "error"; document.querySelector("[data-status]").textContent = ${JSON.stringify(message)};`,
  )
}

async function bootDesktop(): Promise<void> {
  Menu.setApplicationMenu(null)
  splashWindow = createSplashWindow()
  try {
    server = await startHarnessWebServer()
    mainWindow = createMainWindow(server.url)
    await mainWindow.loadURL(server.url)
    if (!mainWindow.isDestroyed()) mainWindow.show()
    splashWindow?.close()
    splashWindow = undefined
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await showSplashError(message)
    dialog.showErrorBox(APP_TITLE, message)
    app.quit()
  }
}

app.whenReady().then(() => {
  void bootDesktop()
}, (error: unknown) => {
  dialog.showErrorBox(APP_TITLE, error instanceof Error ? error.message : String(error))
  app.quit()
})

app.on('before-quit', () => {
  stopHarnessWebServer(server)
})

app.on('window-all-closed', () => {
  app.quit()
})
