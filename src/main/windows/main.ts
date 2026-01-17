import {
  BrowserWindow,
  shell,
  nativeTheme,
  ipcMain,
  app,
  clipboard,
  session,
  Menu,
} from "electron"
import { join } from "path"
import { readFileSync, existsSync } from "fs"
import { createIPCHandler } from "trpc-electron/main"
import { createAppRouter } from "../lib/trpc/routers"
import { getAuthManager, handleAuthCode, getBaseUrl } from "../index"

// Register IPC handlers for window operations (only once)
let ipcHandlersRegistered = false

function registerIpcHandlers(getWindow: () => BrowserWindow | null): void {
  if (ipcHandlersRegistered) return
  ipcHandlersRegistered = true

  // App info
  ipcMain.handle("app:version", () => app.getVersion())
  
  // Window frame preference
  ipcMain.handle("window:set-frame-preference", (_event, useNativeFrame: boolean) => {
    try {
      const { writeFileSync, mkdirSync } = require("fs")
      const settingsPath = join(app.getPath("userData"), "window-settings.json")
      const settingsDir = app.getPath("userData")
      // Ensure directory exists
      mkdirSync(settingsDir, { recursive: true })
      // Write preference
      writeFileSync(settingsPath, JSON.stringify({ useNativeFrame }, null, 2))
      console.log("[Main] Window frame preference saved:", useNativeFrame)
      return true
    } catch (error) {
      console.error("[Main] Failed to save frame preference:", error)
      return false
    }
  })
  
  // Get current window frame state (for renderer to check)
  // This reads the actual preference that was used when the window was created
  ipcMain.handle("window:get-frame-state", () => {
    if (process.platform !== "win32") return false
    // Read from settings file to see what frame type was used at window creation
    try {
      const settingsPath = join(app.getPath("userData"), "window-settings.json")
      if (existsSync(settingsPath)) {
        const settings = JSON.parse(readFileSync(settingsPath, "utf-8"))
        return settings.useNativeFrame === true
      }
      return false // Default: frameless
    } catch (error) {
      console.warn("[Main] Failed to read frame state:", error)
      return false // Default: frameless
    }
  })
  // Note: Update checking is now handled by auto-updater module (lib/auto-updater.ts)
  ipcMain.handle("app:set-badge", (_event, count: number | null) => {
    if (process.platform === "darwin") {
      app.dock.setBadge(count ? String(count) : "")
    }
  })
  ipcMain.handle(
    "app:show-notification",
    (_event, options: { title: string; body: string }) => {
      const { Notification } = require("electron")
      new Notification(options).show()
    },
  )

  // API base URL for fetch requests
  ipcMain.handle("app:get-api-base-url", () => getBaseUrl())

  // Window controls
  ipcMain.handle("window:minimize", () => getWindow()?.minimize())
  ipcMain.handle("window:maximize", () => {
    const win = getWindow()
    if (win?.isMaximized()) {
      win.unmaximize()
    } else {
      win?.maximize()
    }
  })
  ipcMain.handle("window:close", () => getWindow()?.close())
  ipcMain.handle(
    "window:is-maximized",
    () => getWindow()?.isMaximized() ?? false,
  )
  ipcMain.handle("window:toggle-fullscreen", () => {
    const win = getWindow()
    if (win) {
      win.setFullScreen(!win.isFullScreen())
    }
  })
  ipcMain.handle(
    "window:is-fullscreen",
    () => getWindow()?.isFullScreen() ?? false,
  )
  // Window theme handler removed - using frameless window on Windows with custom title bar

  // Traffic light visibility control (for hybrid native/custom approach)
  ipcMain.handle(
    "window:set-traffic-light-visibility",
    (_event, visible: boolean) => {
      const win = getWindow()
      if (win && process.platform === "darwin") {
        // In fullscreen, always show native traffic lights (don't let React hide them)
        if (win.isFullScreen()) {
          win.setWindowButtonVisibility(true)
        } else {
          win.setWindowButtonVisibility(visible)
        }
      }
    },
  )

  // Zoom controls
  ipcMain.handle("window:zoom-in", () => {
    const win = getWindow()
    if (win) {
      const zoom = win.webContents.getZoomFactor()
      win.webContents.setZoomFactor(Math.min(zoom + 0.1, 3))
    }
  })
  ipcMain.handle("window:zoom-out", () => {
    const win = getWindow()
    if (win) {
      const zoom = win.webContents.getZoomFactor()
      win.webContents.setZoomFactor(Math.max(zoom - 0.1, 0.5))
    }
  })
  ipcMain.handle("window:zoom-reset", () => {
    getWindow()?.webContents.setZoomFactor(1)
  })
  ipcMain.handle(
    "window:get-zoom",
    () => getWindow()?.webContents.getZoomFactor() ?? 1,
  )

  // DevTools
  ipcMain.handle("window:toggle-devtools", () => {
    const win = getWindow()
    if (win) {
      win.webContents.toggleDevTools()
    }
  })

  // Analytics
  ipcMain.handle("analytics:set-opt-out", async (_event, optedOut: boolean) => {
    const { setOptOut } = await import("../lib/analytics")
    setOptOut(optedOut)
  })

  // Shell
  ipcMain.handle("shell:open-external", (_event, url: string) =>
    shell.openExternal(url),
  )

  // Clipboard
  ipcMain.handle("clipboard:write", (_event, text: string) =>
    clipboard.writeText(text),
  )
  ipcMain.handle("clipboard:read", () => clipboard.readText())

  // Auth IPC handlers
  const validateSender = (event: Electron.IpcMainInvokeEvent): boolean => {
    const senderUrl = event.sender.getURL()
    try {
      const parsed = new URL(senderUrl)
      if (parsed.protocol === "file:") return true
      const hostname = parsed.hostname.toLowerCase()
      const trusted = ["21st.dev", "localhost", "127.0.0.1"]
      return trusted.some((h) => hostname === h || hostname.endsWith(`.${h}`))
    } catch {
      return false
    }
  }

  ipcMain.handle("auth:get-user", (event) => {
    if (!validateSender(event)) return null
    return getAuthManager().getUser()
  })

  ipcMain.handle("auth:is-authenticated", (event) => {
    if (!validateSender(event)) return false
    return getAuthManager().isAuthenticated()
  })

  ipcMain.handle("auth:logout", async (event) => {
    if (!validateSender(event)) return
    getAuthManager().logout()
    // Clear cookie from persist:main partition
    const ses = session.fromPartition("persist:main")
    try {
      await ses.cookies.remove(getBaseUrl(), "x-desktop-token")
      console.log("[Auth] Cookie cleared on logout")
    } catch (err) {
      console.error("[Auth] Failed to clear cookie:", err)
    }
    showLoginPage()
  })

  ipcMain.handle("auth:start-flow", (event) => {
    if (!validateSender(event)) return
    getAuthManager().startAuthFlow(getWindow())
  })

  ipcMain.handle("auth:submit-code", async (event, code: string) => {
    if (!validateSender(event)) return
    if (!code || typeof code !== "string") {
      getWindow()?.webContents.send("auth:error", "Invalid authorization code")
      return
    }
    await handleAuthCode(code)
  })

  ipcMain.handle("auth:update-user", async (event, updates: { name?: string }) => {
    if (!validateSender(event)) return null
    try {
      return await getAuthManager().updateUser(updates)
    } catch (error) {
      console.error("[Auth] Failed to update user:", error)
      throw error
    }
  })
}

// Current window reference
let currentWindow: BrowserWindow | null = null

/**
 * Show login page
 */
export function showLoginPage(): void {
  if (!currentWindow) return
  console.log("[Main] Showing login page")

  // In dev mode, login.html is in src/renderer, not out/renderer
  if (process.env.ELECTRON_RENDERER_URL) {
    // Dev mode: load from source directory
    const loginPath = join(app.getAppPath(), "src/renderer/login.html")
    console.log("[Main] Loading login from:", loginPath)
    currentWindow.loadFile(loginPath)
  } else {
    // Production: load from built output
    currentWindow.loadFile(join(__dirname, "../renderer/login.html"))
  }
}

// Singleton IPC handler (prevents duplicate handlers on macOS window recreation)
let ipcHandler: ReturnType<typeof createIPCHandler> | null = null

/**
 * Get the current window reference
 * Used by tRPC procedures that need window access
 */
export function getWindow(): BrowserWindow | null {
  return currentWindow
}

/**
 * Read window frame preference from settings file
 * Returns true if native frame should be used, false for frameless
 */
function getUseNativeFramePreference(): boolean {
  if (process.platform !== "win32") return false
  
  try {
    // Read preference from a simple JSON file in userData
    const settingsPath = join(app.getPath("userData"), "window-settings.json")
    console.log("[Main] Checking frame preference at:", settingsPath)
    
    if (existsSync(settingsPath)) {
      const fileContent = readFileSync(settingsPath, "utf-8")
      console.log("[Main] Settings file content:", fileContent)
      const settings = JSON.parse(fileContent)
      const useNative = settings.useNativeFrame === true
      console.log("[Main] Frame preference from file:", useNative, "parsed settings:", settings)
      return useNative
    }
    
    // Default: frameless (dark title bar)
    // Note: If user has set preference in UI but file doesn't exist yet,
    // it will be synced on next app launch after renderer loads
    console.log("[Main] No settings file found, using default: frameless")
    return false
  } catch (error) {
    console.error("[Main] Failed to read frame preference:", error)
    return false // Default: frameless
  }
}

/**
 * Create the main application window
 */
export function createMainWindow(): BrowserWindow {
  // Register IPC handlers before creating window
  registerIpcHandlers(getWindow)

  // Read frame preference from settings file
  const useNativeFrame = getUseNativeFramePreference()

  const window = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 500, // Allow narrow mobile-like mode
    minHeight: 600,
    show: false,
    title: "1Code",
    backgroundColor: nativeTheme.shouldUseDarkColors ? "#09090b" : "#ffffff",
    // hiddenInset shows native traffic lights inset in the window
    // Start with traffic lights off-screen (custom ones shown in normal mode)
    // Native lights will be moved on-screen in fullscreen mode
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
    trafficLightPosition:
      process.platform === "darwin" ? { x: 15, y: 12 } : undefined,
    // Windows: Use native frame or frameless based on user preference
    // Preference is stored in localStorage and applied on next app launch
    ...(process.platform === "win32" && {
      frame: useNativeFrame ? true : false, // Use native frame if preference is true
      autoHideMenuBar: useNativeFrame ? true : false, // Show menu bar with ALT if native frame
    }),
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false, // Required for electron-trpc
      webSecurity: true,
      partition: "persist:main", // Use persistent session for cookies
    },
  })

  // Update current window reference
  currentWindow = window

  // Setup tRPC IPC handler (singleton pattern)
  if (ipcHandler) {
    // Check if window is already attached to avoid duplicates
    // In dev mode with hot reload, the same window might be attached multiple times
    try {
      ipcHandler.attachWindow(window)
    } catch (error) {
      // If attach fails (e.g., window already attached), recreate handler
      console.warn("[Main] Failed to attach window to existing handler, recreating:", error)
      ipcHandler = createIPCHandler({
        router: createAppRouter(getWindow),
        windows: [window],
        createContext: async () => ({
          getWindow,
        }),
      })
    }
  } else {
    // Create new handler with context
    ipcHandler = createIPCHandler({
      router: createAppRouter(getWindow),
      windows: [window],
      createContext: async () => ({
        getWindow,
      }),
    })
  }

  // Show window when ready
  window.on("ready-to-show", () => {
    console.log("[Main] Window ready to show")
    // Ensure native traffic lights are visible by default (login page, loading states)
    if (process.platform === "darwin") {
      window.setWindowButtonVisibility(true)
    }
    // Windows: frameless window, no title bar overlay needed
    window.show()
  })

  // Emit fullscreen change events and manage traffic lights
  window.on("enter-full-screen", () => {
    // Always show native traffic lights in fullscreen
    if (process.platform === "darwin") {
      window.setWindowButtonVisibility(true)
    }
    window.webContents.send("window:fullscreen-change", true)
  })
  window.on("leave-full-screen", () => {
    // Show native traffic lights when exiting fullscreen (TrafficLights component will manage after mount)
    if (process.platform === "darwin") {
      window.setWindowButtonVisibility(true)
    }
    window.webContents.send("window:fullscreen-change", false)
  })

  // Emit focus change events
  window.on("focus", () => {
    window.webContents.send("window:focus-change", true)
  })
  window.on("blur", () => {
    window.webContents.send("window:focus-change", false)
  })

  // Handle external links
  window.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: "deny" }
  })

  // Handle window navigation (reloads) - clean up subscriptions before page reloads
  window.webContents.on("will-navigate", () => {
    // In dev mode, hot reload can cause duplicate subscriptions
    // The renderer should clean up subscriptions, but we log for debugging
    console.log("[Main] Window navigating, subscriptions should be cleaned up by renderer")
  })

  // Handle window close
  window.on("closed", () => {
    currentWindow = null
    // Note: tRPC handler persists as singleton, but window reference is cleared
    // Subscriptions should be cleaned up by renderer before window closes
  })

  // Load the renderer - check auth first
  const devServerUrl = process.env.ELECTRON_RENDERER_URL
  const authManager = getAuthManager()

  console.log("[Main] ========== AUTH CHECK ==========")
  console.log("[Main] AuthManager exists:", !!authManager)
  const isAuth = authManager.isAuthenticated()
  console.log("[Main] isAuthenticated():", isAuth)
  const user = authManager.getUser()
  console.log("[Main] getUser():", user ? user.email : "null")
  console.log("[Main] ================================")

  if (isAuth) {
    console.log("[Main] ✓ User authenticated, loading app")
    if (devServerUrl) {
      window.loadURL(devServerUrl)
      window.webContents.openDevTools()
    } else {
      window.loadFile(join(__dirname, "../renderer/index.html"))
    }
  } else {
    console.log("[Main] ✗ Not authenticated, showing login page")
    // In dev mode, login.html is in src/renderer
    if (devServerUrl) {
      const loginPath = join(app.getAppPath(), "src/renderer/login.html")
      window.loadFile(loginPath)
    } else {
      window.loadFile(join(__dirname, "../renderer/login.html"))
    }
  }

  // Ensure traffic lights are visible after page load (covers reload/Cmd+R case)
  window.webContents.on("did-finish-load", () => {
    console.log("[Main] Page finished loading")
    if (process.platform === "darwin") {
      window.setWindowButtonVisibility(true)
    }
    // Windows: frameless window, custom title bar in renderer
  })

  // Windows: frameless window, custom title bar in renderer handles theme
  window.webContents.on(
    "did-fail-load",
    (_event, errorCode, errorDescription) => {
      console.error("[Main] Page failed to load:", errorCode, errorDescription)
    },
  )

  // Windows: Configure menu bar based on frame type
  if (process.platform === "win32") {
    if (useNativeFrame) {
      // Native frame: menu bar accessible with ALT key
      window.setAutoHideMenuBar(true)
    } else {
      // Frameless: menu bar won't work with ALT, but shortcuts still work
      window.setAutoHideMenuBar(true)
    }
  }

  return window
}
