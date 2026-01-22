"use client"

import { useEffect, useState } from "react"
import { Minimize2, Maximize2, X } from "lucide-react"
import { Button } from "./ui/button"

/**
 * Windows title bar component for frameless windows
 * Provides window controls (minimize, maximize, close) and drag region
 *
 * NOTE: This component is only used when frame: false (frameless window).
 * With native frame, the menu bar works with ALT key, so this component is hidden.
 *
 * IMPORTANT: This component checks the actual window frame state, not the preference.
 * The preference only applies after restart, so we check the real window state.
 */
export function WindowsTitleBar() {
  const [isMaximized, setIsMaximized] = useState(false)
  const [hasNativeFrame, setHasNativeFrame] = useState(false)

  // Check if we're on Windows desktop
  const isWindows = typeof window !== "undefined" && window.desktopApi?.platform === "win32"

  // Check actual window frame state (not preference - preference only applies after restart)
  useEffect(() => {
    if (!isWindows || !window.desktopApi?.getWindowFrameState) return

    const checkFrameState = async () => {
      try {
        const hasFrame = await window.desktopApi.getWindowFrameState()
        setHasNativeFrame(hasFrame)
      } catch (error) {
        console.warn("[WindowsTitleBar] Failed to check frame state:", error)
        // Default to showing title bar if we can't check
        setHasNativeFrame(false)
      }
    }

    checkFrameState()
  }, [isWindows])

  // Check window state on mount and when it changes
  // NOTE: This must be called before any early returns to follow React hooks rules
  useEffect(() => {
    if (!isWindows || !window.desktopApi?.windowIsMaximized) return

    const checkMaximized = async () => {
      const maximized = await window.desktopApi.windowIsMaximized()
      setIsMaximized(maximized)
    }

    checkMaximized()

    // Listen for window state changes (if available)
    // Note: Electron doesn't have a direct event for this, so we check on focus
    const handleFocus = () => {
      checkMaximized()
    }

    window.addEventListener("focus", handleFocus)
    return () => window.removeEventListener("focus", handleFocus)
  }, [isWindows])

  // Early returns after all hooks are called
  if (!isWindows) return null
  if (hasNativeFrame) return null // Native frame has its own title bar

  const handleMinimize = async () => {
    await window.desktopApi?.windowMinimize()
  }

  const handleMaximize = async () => {
    await window.desktopApi?.windowMaximize()
    // Update state after a short delay
    setTimeout(async () => {
      const maximized = await window.desktopApi?.windowIsMaximized()
      setIsMaximized(maximized ?? false)
    }, 100)
  }

  const handleClose = async () => {
    await window.desktopApi?.windowClose()
  }

  return (
    <div
      className="h-8 flex-shrink-0 flex items-center justify-between bg-background border-b border-border/50"
      style={{
        // @ts-expect-error - WebKit-specific property for Electron window dragging
        WebkitAppRegion: "drag",
      }}
    >
      {/* Left side - App title/icon (draggable) */}
      <div className="flex items-center gap-2 px-3 h-full">
        <span className="text-xs font-medium text-foreground/70">1Code</span>
      </div>

      {/* Right side - Window controls (non-draggable) */}
      <div
        className="flex items-center h-full"
        style={{
          // @ts-expect-error - WebKit-specific property
          WebkitAppRegion: "no-drag",
        }}
      >
        <Button
          variant="ghost"
          size="icon"
          onClick={handleMinimize}
          className="h-full w-10 rounded-none hover:bg-foreground/10"
          aria-label="Minimize"
        >
          <Minimize2 className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={handleMaximize}
          className="h-full w-10 rounded-none hover:bg-foreground/10"
          aria-label={isMaximized ? "Restore" : "Maximize"}
        >
          <Maximize2 className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={handleClose}
          className="h-full w-10 rounded-none hover:bg-red-500/20 hover:text-red-500"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}
