"use client"

import { useEffect, useRef, useCallback } from "react"
import { useAtom, useAtomValue } from "jotai"
import { isDesktopApp } from "../../../lib/utils/platform"
import { desktopNotificationsEnabledAtom } from "../../../lib/atoms"
import { agentsUnseenChangesAtom } from "../../features/agents/atoms"

// Track window focus state
let isWindowFocused = true

/**
 * Generate a badge icon image for Windows taskbar overlay
 * Creates a 32x32 canvas with a red circle and white number
 */
function generateBadgeIcon(count: number): string {
  const size = 32
  const canvas = document.createElement("canvas")
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext("2d")
  
  if (!ctx) return ""
  
  // Draw red circle background
  ctx.fillStyle = "#FF4444" // Red badge color
  ctx.beginPath()
  ctx.arc(size / 2, size / 2, size / 2 - 2, 0, Math.PI * 2)
  ctx.fill()
  
  // Draw white border
  ctx.strokeStyle = "#FFFFFF"
  ctx.lineWidth = 2
  ctx.stroke()
  
  // Draw white number text
  ctx.fillStyle = "#FFFFFF"
  ctx.font = "bold 18px Arial"
  ctx.textAlign = "center"
  ctx.textBaseline = "middle"
  
  // Format count (show "9+" if > 9)
  const displayText = count > 9 ? "9+" : String(count)
  ctx.fillText(displayText, size / 2, size / 2)
  
  // Convert to data URL
  return canvas.toDataURL("image/png")
}

/**
 * Hook to manage desktop notifications and badge count
 * - Shows Windows desktop notifications when agent completes work
 * - Updates taskbar badge with number of chats (agents) that finished and need attention
 * - Badge count is based on agentsUnseenChangesAtom (chats with unseen changes)
 * - Badge automatically updates when user views chats (they're removed from unseen set)
 */
export function useDesktopNotifications() {
  const [desktopNotificationsEnabled] = useAtom(desktopNotificationsEnabledAtom)
  const unseenChanges = useAtomValue(agentsUnseenChangesAtom)
  const isInitialized = useRef(false)
  
  // Calculate badge count from unseen changes (chats that finished and need attention)
  const badgeCount = unseenChanges.size

  // Subscribe to window focus changes
  useEffect(() => {
    if (!isDesktopApp() || typeof window === "undefined") return

    // Initialize focus state
    isWindowFocused = document.hasFocus()

    const handleFocus = () => {
      isWindowFocused = true
      // Note: We don't clear badge on focus anymore - it shows actual count of chats needing attention
      // Badge will be cleared when user actually views those chats
    }

    const handleBlur = () => {
      isWindowFocused = false
    }

    // Use both window events and Electron API
    window.addEventListener("focus", handleFocus)
    window.addEventListener("blur", handleBlur)

    // Also subscribe to Electron focus events
    const unsubscribe = window.desktopApi?.onFocusChange?.((focused) => {
      if (focused) {
        handleFocus()
      } else {
        handleBlur()
      }
    })

    isInitialized.current = true

    return () => {
      window.removeEventListener("focus", handleFocus)
      window.removeEventListener("blur", handleBlur)
      unsubscribe?.()
    }
  }, [])

  // Generate badge icon for Windows and update badge
  useEffect(() => {
    if (!isDesktopApp() || typeof window === "undefined") return

    if (badgeCount > 0) {
      window.desktopApi?.setBadge(badgeCount)
      
      // For Windows: Generate overlay icon with number badge
      if (window.desktopApi?.platform === "win32" && window.desktopApi?.setBadgeIcon) {
        const badgeImage = generateBadgeIcon(badgeCount)
        window.desktopApi.setBadgeIcon(badgeImage)
      }
    } else {
      window.desktopApi?.setBadge(null)
      // Clear overlay icon on Windows
      if (window.desktopApi?.platform === "win32" && window.desktopApi?.setBadgeIcon) {
        window.desktopApi.setBadgeIcon(null)
      }
    }
  }, [badgeCount])

  /**
   * Show a notification for agent completion
   * Shows Windows desktop notification if enabled (always, not just when window not focused)
   * Badge count is automatically updated from agentsUnseenChangesAtom
   */
  const notifyAgentComplete = useCallback(
    (agentName: string) => {
      if (!isDesktopApp() || typeof window === "undefined") return

      // Check if desktop notifications are enabled
      if (!desktopNotificationsEnabled) return

      // Show Windows desktop notification (always, if enabled)
      // Uses standard Windows Notification API through Electron
      // Badge will be updated automatically via agentsUnseenChangesAtom effect above
      window.desktopApi?.showNotification({
        title: "Agent finished",
        body: `${agentName} completed the task`,
      })
    },
    [desktopNotificationsEnabled],
  )

  /**
   * Check if window is currently focused
   */
  const isAppFocused = useCallback(() => {
    return isWindowFocused
  }, [])

  return {
    notifyAgentComplete,
    isAppFocused,
    pendingCount: badgeCount, // For backwards compatibility
    clearBadge: () => {
      // Note: Badge is now managed by agentsUnseenChangesAtom
      // It will clear automatically when user views the chats
      window.desktopApi?.setBadge(null)
    },
  }
}

/**
 * Standalone function to show notification (for use outside React components)
 * Shows Windows desktop notification if enabled
 */
export function showAgentNotification(agentName: string) {
  if (!isDesktopApp() || typeof window === "undefined") return

  // Show Windows desktop notification (always, uses standard Windows Notification API)
  window.desktopApi?.showNotification({
    title: "Agent finished",
    body: `${agentName} completed the task`,
  })
}
