import { app, BrowserWindow, shell, protocol, net } from 'electron'
import { join, normalize } from 'path'
import { pathToFileURL } from 'url'
import { buildContextAndRegister } from './ipc/router'
import { projectDir } from './persistence/paths'

let mainWindow: BrowserWindow | null = null

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'protoloop-file',
    privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true }
  }
])

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1480,
    height: 920,
    minWidth: 1120,
    minHeight: 720,
    show: false,
    backgroundColor: '#0c0d0f',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 14, y: 16 },
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true
    }
  })

  win.on('ready-to-show', () => win.show())
  win.on('closed', () => {
    if (mainWindow === win) mainWindow = null
  })

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return win
}

/** Serve project files (thumbnails) to the sandboxed renderer via protoloop-file://<id>/<relpath>. */
function registerFileProtocol(): void {
  protocol.handle('protoloop-file', async (request) => {
    try {
      const url = new URL(request.url)
      const id = url.hostname
      const rel = decodeURIComponent(url.pathname).replace(/^\/+/, '')
      const root = normalize(projectDir(id))
      const target = normalize(join(root, rel))
      if (!target.startsWith(root)) return new Response('forbidden', { status: 403 })
      return net.fetch(pathToFileURL(target).toString())
    } catch {
      return new Response('not found', { status: 404 })
    }
  })
}

app.whenReady().then(async () => {
  registerFileProtocol()
  await buildContextAndRegister(() => mainWindow)
  mainWindow = createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) mainWindow = createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
