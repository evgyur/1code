import { useAtom } from "jotai"
import { useState, useEffect } from "react"
import {
  extendedThinkingEnabledAtom,
  soundNotificationsEnabledAtom,
  analyticsOptOutAtom,
  ctrlTabTargetAtom,
  useNativeFrameAtom,
  type CtrlTabTarget,
} from "../../../lib/atoms"
import { Switch } from "../../ui/switch"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "../../ui/select"
import { Kbd } from "../../ui/kbd"

// Hook to detect narrow screen
function useIsNarrowScreen(): boolean {
  const [isNarrow, setIsNarrow] = useState(false)

  useEffect(() => {
    const checkWidth = () => {
      setIsNarrow(window.innerWidth <= 768)
    }

    checkWidth()
    window.addEventListener("resize", checkWidth)
    return () => window.removeEventListener("resize", checkWidth)
  }, [])

  return isNarrow
}

export function AgentsPreferencesTab() {
  const [thinkingEnabled, setThinkingEnabled] = useAtom(
    extendedThinkingEnabledAtom,
  )
  const [soundEnabled, setSoundEnabled] = useAtom(soundNotificationsEnabledAtom)
  const [analyticsOptOut, setAnalyticsOptOut] = useAtom(analyticsOptOutAtom)
  const [ctrlTabTarget, setCtrlTabTarget] = useAtom(ctrlTabTargetAtom)
  const [useNativeFrame, setUseNativeFrame] = useAtom(useNativeFrameAtom)
  const isNarrowScreen = useIsNarrowScreen()
  
  // Check if we're on Windows
  const isWindows = typeof window !== "undefined" && window.desktopApi?.platform === "win32"

  // Sync opt-out status to main process
  const handleAnalyticsToggle = async (optedOut: boolean) => {
    setAnalyticsOptOut(optedOut)
    // Notify main process
    try {
      await window.desktopApi?.setAnalyticsOptOut(optedOut)
    } catch (error) {
      console.error("Failed to sync analytics opt-out to main process:", error)
    }
  }

  // Handle window frame toggle
  const handleFrameToggle = (enabled: boolean) => {
    try {
      // Update atom first (synchronous, updates localStorage)
      setUseNativeFrame(enabled)
      
      // Save preference to main process (non-blocking, fire and forget)
      // Don't await - just fire and forget to avoid blocking
      if (window.desktopApi?.setWindowFramePreference) {
        window.desktopApi.setWindowFramePreference(enabled).catch((error) => {
          console.error("Failed to save frame preference:", error)
        })
      }
    } catch (error) {
      console.error("Error in handleFrameToggle:", error)
    }
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header - hidden on narrow screens since it's in the navigation bar */}
      {!isNarrowScreen && (
        <div className="flex flex-col space-y-1.5 text-center sm:text-left">
          <h3 className="text-sm font-semibold text-foreground">Preferences</h3>
          <p className="text-xs text-muted-foreground">
            Configure Claude's behavior and features
          </p>
        </div>
      )}

      {/* Features Section */}
      <div className="bg-background rounded-lg border border-border overflow-hidden">
        <div className="p-4 space-y-6">
          {/* Extended Thinking Toggle */}
          <div className="flex items-start justify-between">
            <div className="flex flex-col space-y-1">
              <span className="text-sm font-medium text-foreground">
                Extended Thinking
              </span>
              <span className="text-xs text-muted-foreground">
                Enable deeper reasoning with more thinking tokens (uses more
                credits).{" "}
                <span className="text-foreground/70">Disables response streaming.</span>
              </span>
            </div>
            <Switch
              checked={thinkingEnabled}
              onCheckedChange={setThinkingEnabled}
            />
          </div>

          {/* Sound Notifications Toggle */}
          <div className="flex items-start justify-between">
            <div className="flex flex-col space-y-1">
              <span className="text-sm font-medium text-foreground">
                Sound Notifications
              </span>
              <span className="text-xs text-muted-foreground">
                Play a sound when agent completes work while you're away
              </span>
            </div>
            <Switch checked={soundEnabled} onCheckedChange={setSoundEnabled} />
          </div>
        </div>
      </div>

      {/* Keyboard Shortcuts Section */}
      <div className="bg-background rounded-lg border border-border overflow-hidden">
        <div className="flex items-start justify-between p-4">
          <div className="flex flex-col space-y-1">
            <span className="text-sm font-medium text-foreground">
              Quick Switch
            </span>
            <span className="text-xs text-muted-foreground">
              What <Kbd>⌃Tab</Kbd> switches between
            </span>
          </div>

          <Select
            value={ctrlTabTarget}
            onValueChange={(value: CtrlTabTarget) => setCtrlTabTarget(value)}
          >
            <SelectTrigger className="w-auto px-2">
              <span className="text-xs">
                {ctrlTabTarget === "workspaces" ? "Workspaces" : "Agents"}
              </span>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="workspaces">Workspaces</SelectItem>
              <SelectItem value="agents">Agents</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Windows Window Frame Section - Only show on Windows */}
      {isWindows && (
        <div className="bg-background rounded-lg border border-border overflow-hidden">
          <div className="p-4 space-y-4">
            {/* Warning Banner */}
            <div className="bg-amber-500/10 border border-amber-500/20 rounded-md p-3">
              <div className="flex items-start gap-2">
                <span className="text-amber-500 text-sm font-medium">⚠️ Restart Required</span>
              </div>
              <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                Changing this setting requires restarting the app to take effect.
              </p>
            </div>
            
            {/* Native Frame Toggle */}
            <div className="flex items-start justify-between">
              <div className="flex flex-col space-y-1">
                <span className="text-sm font-medium text-foreground">
                  Native Window Frame
                </span>
                <span className="text-xs text-muted-foreground">
                  {useNativeFrame
                    ? "Uses native Windows title bar. Menu bar accessible with ALT key."
                    : "Uses custom dark title bar. Menu shortcuts still work (Ctrl+N, etc.)."}
                </span>
              </div>
              <Switch
                checked={useNativeFrame}
                onCheckedChange={handleFrameToggle}
              />
            </div>
          </div>
        </div>
      )}

      {/* Privacy Section */}
      <div className="space-y-2">
        <div className="pb-2">
          <h4 className="text-sm font-medium text-foreground">Privacy</h4>
          <p className="text-xs text-muted-foreground mt-1">
            Control what data you share with us
          </p>
        </div>

        <div className="bg-background rounded-lg border border-border overflow-hidden">
          <div className="p-4">
            {/* Share Usage Analytics */}
            <div className="flex items-start justify-between">
              <div className="flex flex-col space-y-1">
                <span className="text-sm font-medium text-foreground">
                  Share Usage Analytics
                </span>
                <span className="text-xs text-muted-foreground">
                  Help us improve Agents by sharing anonymous usage data. We only track feature usage and app performance–never your code, prompts, or messages. No AI training on your data.
                </span>
              </div>
              <Switch
                checked={!analyticsOptOut}
                onCheckedChange={(enabled) => handleAnalyticsToggle(!enabled)}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
