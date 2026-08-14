/**
 * Electron entry for the DeepSeek Harness desktop app.
 * @module @deepseek-ai/dsh-desktop/main
 */

import { app, BrowserWindow, Menu, dialog, shell } from 'electron'
import { fileURLToPath } from 'node:url'
import {
  startHarnessWebServer,
  stopHarnessWebServer,
  type HarnessStartupProgress,
  type HarnessWebServer,
} from './launcher.ts'

const APP_TITLE = 'DeepSeek Harness'
const DEFAULT_WINDOW_WIDTH = 1280
const DEFAULT_WINDOW_HEIGHT = 860
const SPLASH_MINIMUM_MS = 1_100
const SPLASH_FADE_MS = 360

let server: HarnessWebServer | undefined
let mainWindow: BrowserWindow | undefined
let splashWindow: BrowserWindow | undefined
let latestSplashProgress = 0

const assetPath = (name: string): string => fileURLToPath(new URL(`../assets/${name}`, import.meta.url))
const delay = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms))

function createSplashWindow(): BrowserWindow {
  const win = new BrowserWindow({
    show: false,
    frame: false,
    fullscreen: true,
    resizable: false,
    movable: true,
    backgroundColor: '#fbfdff',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })
  void win.loadFile(assetPath('splash.html'))
  win.webContents.once('did-finish-load', () => {
    void applySplashProgress(win)
  })
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

function clampProgress(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)))
}

async function applySplashProgress(win: BrowserWindow | undefined = splashWindow): Promise<void> {
  if (win === undefined || win.isDestroyed()) return
  await win.webContents.executeJavaScript(
    `window.setDeepSeekSplashProgress?.(${JSON.stringify(latestSplashProgress)});`,
  ).then(() => undefined, () => undefined)
}

function updateSplashProgress(progress: HarnessStartupProgress): void {
  latestSplashProgress = clampProgress(Math.max(latestSplashProgress, progress.percent))
  void applySplashProgress()
}

async function showSplashError(): Promise<void> {
  if (splashWindow === undefined || splashWindow.isDestroyed()) return
  await splashWindow.webContents.executeJavaScript(
    'document.body.dataset.state = "error";',
  ).then(() => undefined, () => undefined)
}

async function dismissSplashWindow(): Promise<void> {
  const win = splashWindow
  if (win === undefined || win.isDestroyed()) return
  await win.webContents.executeJavaScript(
    'document.body.dataset.state = "closing";',
  ).then(() => undefined, () => undefined)
  await delay(SPLASH_FADE_MS)
  if (!win.isDestroyed()) win.close()
  if (splashWindow === win) splashWindow = undefined
}

async function bootDesktop(): Promise<void> {
  Menu.setApplicationMenu(null)
  splashWindow = createSplashWindow()
  const splashMinimum = delay(SPLASH_MINIMUM_MS)
  try {
    server = await startHarnessWebServer({ onProgress: updateSplashProgress })
    mainWindow = createMainWindow(server.url)
    await mainWindow.loadURL(server.url)
    await splashMinimum
    if (!mainWindow.isDestroyed()) mainWindow.show()
    latestSplashProgress = 100
    await applySplashProgress()
    await dismissSplashWindow()
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await showSplashError()
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
