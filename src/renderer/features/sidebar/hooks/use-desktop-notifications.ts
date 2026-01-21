"use client"

import { useEffect, useRef, useCallback } from "react"
import { useAtom, useAtomValue } from "jotai"
import { isDesktopApp } from "../../../lib/utils/platform"
import { desktopNotificationsEnabledAtom } from "../../../lib/atoms"
import { agentsUnseenChangesAtom, pendingUserQuestionsAtom } from "../../agents/atoms"

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
 * - Badge count includes:
 *   1. Chats with unseen changes (agentsUnseenChangesAtom)
 *   2. Chats awaiting user input (pendingUserQuestionsAtom)
 * - Badge automatically updates when user views chats or answers questions
 */
export function useDesktopNotifications() {
  const [desktopNotificationsEnabled] = useAtom(desktopNotificationsEnabledAtom)
  const unseenChanges = useAtomValue(agentsUnseenChangesAtom)
  const pendingQuestions = useAtomValue(pendingUserQuestionsAtom)
  const isInitialized = useRef(false)
  
  // Calculate badge count:
  // - Unseen changes (chats that finished and need attention)
  // - Plus 1 if there's a pending user question (chat awaiting input)
  const badgeCount = unseenChanges.size + (pendingQuestions ? 1 : 0)

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
    if (!isDesktopApp() || typeof window === "undefined") {
      console.log("[Notifications] Not desktop app or window undefined")
      return
    }

    console.log("[Notifications] Badge count:", badgeCount, "unseenChanges:", unseenChanges.size, "pendingQuestions:", pendingQuestions ? "yes" : "no")
    console.log("[Notifications] desktopNotificationsEnabled:", desktopNotificationsEnabled)
    console.log("[Notifications] desktopApi available:", !!window.desktopApi)
    console.log("[Notifications] setBadge available:", !!window.desktopApi?.setBadge)
    console.log("[Notifications] setBadgeIcon available:", !!window.desktopApi?.setBadgeIcon)
    console.log("[Notifications] platform:", window.desktopApi?.platform)

    if (badgeCount > 0) {
      console.log("[Notifications] Setting badge to:", badgeCount)
      window.desktopApi?.setBadge(badgeCount)
      
      // For Windows: Generate overlay icon with number badge
      if (window.desktopApi?.platform === "win32" && window.desktopApi?.setBadgeIcon) {
        const badgeImage = generateBadgeIcon(badgeCount)
        console.log("[Notifications] Setting badge icon, image length:", badgeImage.length)
        window.desktopApi.setBadgeIcon(badgeImage)
      }
    } else {
      console.log("[Notifications] Clearing badge")
      window.desktopApi?.setBadge(null)
      // Clear overlay icon on Windows
      if (window.desktopApi?.platform === "win32" && window.desktopApi?.setBadgeIcon) {
        window.desktopApi.setBadgeIcon(null)
      }
    }
  }, [badgeCount, unseenChanges.size, pendingQuestions])

  /**
   * Show a notification for agent completion
   * Shows Windows desktop notification if enabled (always, not just when window not focused)
   * Badge count is automatically updated from agentsUnseenChangesAtom
   */
  const notifyAgentComplete = useCallback(
    (agentName: string) => {
      console.log("[Notifications] notifyAgentComplete called for:", agentName)
      console.log("[Notifications] desktopNotificationsEnabled:", desktopNotificationsEnabled)
      
      if (!isDesktopApp() || typeof window === "undefined") {
        console.log("[Notifications] notifyAgentComplete: Not desktop app or window undefined")
        return
      }

      // Check if desktop notifications are enabled
      if (!desktopNotificationsEnabled) {
        console.log("[Notifications] notifyAgentComplete: Notifications disabled, skipping")
        return
      }

      console.log("[Notifications] Showing notification for agent completion:", agentName)
      console.log("[Notifications] showNotification available:", !!window.desktopApi?.showNotification)
      
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
   * Show a notification when agent asks a question
   * Shows Windows desktop notification if enabled
   */
  const notifyQuestionAsked = useCallback(
    (agentName?: string) => {
      if (!isDesktopApp() || typeof window === "undefined") return

      // Check if desktop notifications are enabled
      if (!desktopNotificationsEnabled) return

      // Show Windows desktop notification
      window.desktopApi?.showNotification({
        title: "Question from agent",
        body: agentName ? `${agentName} is waiting for your answer` : "Agent is waiting for your answer",
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

  // Track which question we've already notified about (to avoid duplicate notifications)
  const notifiedQuestionRef = useRef<string | null>(null)

  // Show notification when a question is asked
  useEffect(() => {
    if (!isDesktopApp() || typeof window === "undefined") {
      console.log("[Notifications] Question notification: Not desktop app")
      return
    }
    if (!desktopNotificationsEnabled) {
      console.log("[Notifications] Question notification: Notifications disabled")
      return
    }
    if (!pendingQuestions) {
      // Clear notification tracking when question is answered
      notifiedQuestionRef.current = null
      return
    }

    // Only show notification once per question (track by toolUseId)
    if (notifiedQuestionRef.current === pendingQuestions.toolUseId) {
      console.log("[Notifications] Question notification: Already notified for this question")
      return // Already notified for this question
    }

    console.log("[Notifications] Showing question notification, toolUseId:", pendingQuestions.toolUseId)
    console.log("[Notifications] showNotification available:", !!window.desktopApi?.showNotification)
    
    // Show notification when question is asked
    // Show even if window is focused - user might be in another app or tab
    window.desktopApi?.showNotification({
      title: "Question from agent",
      body: "Agent is waiting for your answer",
    })
    
    // Mark this question as notified
    notifiedQuestionRef.current = pendingQuestions.toolUseId
  }, [pendingQuestions, desktopNotificationsEnabled])

  return {
    notifyAgentComplete,
    notifyQuestionAsked,
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
