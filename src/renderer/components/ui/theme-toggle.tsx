"use client"

import { useEffect, useState } from "react"
import { Moon, Sun } from "lucide-react"
import { useTheme } from "next-themes"
import { motion, AnimatePresence } from "motion/react"
import { useAtom } from "jotai"
import { cn } from "../../lib/utils"
import { Button } from "./button"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "./tooltip"
import { useVSCodeTheme } from "../../lib/themes/theme-provider"
import { selectedFullThemeIdAtom } from "../../lib/atoms"

/**
 * Dark Mode Toggle Component
 * 
 * Beautiful animated toggle switch that switches between light and dark themes.
 * When dark mode is enabled, automatically applies the Cursor Dark theme.
 * When light mode is enabled, applies the Cursor Light theme.
 */
export function ThemeToggle() {
  const { theme, setTheme, resolvedTheme } = useTheme()
  const { setThemeById } = useVSCodeTheme()
  const [selectedThemeId, setSelectedThemeId] = useAtom(selectedFullThemeIdAtom)
  const [mounted, setMounted] = useState(false)
  const [isAnimating, setIsAnimating] = useState(false)

  // Prevent hydration mismatch
  useEffect(() => {
    setMounted(true)
  }, [])

  // Sync VS Code theme with next-themes when theme changes
  useEffect(() => {
    if (!mounted) return

    const currentTheme = resolvedTheme || theme
    
    // Only auto-apply Cursor themes if:
    // 1. No theme is manually selected (selectedThemeId is null), OR
    // 2. The currently selected theme is already a Cursor theme
    const isCursorTheme = selectedThemeId === "cursor-dark" || selectedThemeId === "cursor-light"
    const shouldAutoApply = selectedThemeId === null || isCursorTheme

    if (shouldAutoApply) {
      // Auto-apply Cursor themes based on light/dark mode
      if (currentTheme === "dark") {
        setThemeById("cursor-dark")
        setSelectedThemeId("cursor-dark")
      } else if (currentTheme === "light") {
        setThemeById("cursor-light")
        setSelectedThemeId("cursor-light")
      }
    }
  }, [theme, resolvedTheme, mounted, selectedThemeId, setThemeById, setSelectedThemeId])

  const handleToggle = () => {
    setIsAnimating(true)
    const currentTheme = resolvedTheme || theme
    const newTheme = currentTheme === "dark" ? "light" : "dark"
    setTheme(newTheme)
    
    // Reset animation state after transition completes
    setTimeout(() => setIsAnimating(false), 400)
  }

  if (!mounted) {
    // Return a placeholder with same dimensions to prevent layout shift
    return (
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7 p-0"
        aria-label="Toggle theme"
        disabled
      >
        <div className="h-4 w-4" />
      </Button>
    )
  }

  const isDark = resolvedTheme === "dark"

  return (
    <Tooltip delayDuration={500}>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          onClick={handleToggle}
          className={cn(
            "h-7 w-7 p-0 relative",
            "hover:bg-foreground/10",
            "transition-all duration-200 ease-out",
            "active:scale-[0.95]",
            "rounded-md",
            "text-foreground",
            "flex-shrink-0",
            // Cursor Dark theme styling
            isDark && [
              "hover:bg-[#E4E4E411]", // list.hoverBackground from Cursor Dark
              "border border-[#E4E4E413]/50", // sideBar.border from Cursor Dark
            ],
            !isDark && "hover:bg-foreground/10",
            // Subtle glow effect when animating
            isAnimating && isDark && "ring-1 ring-[#88C0D0]/30", // Cursor Dark accent
            isAnimating && !isDark && "ring-1 ring-foreground/20",
          )}
          aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
        >
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={isDark ? "moon" : "sun"}
              initial={{ 
                opacity: 0, 
                rotate: isDark ? -180 : 180,
                scale: 0.5 
              }}
              animate={{ 
                opacity: 1, 
                rotate: 0,
                scale: 1 
              }}
              exit={{ 
                opacity: 0, 
                rotate: isDark ? 180 : -180,
                scale: 0.5 
              }}
              transition={{ 
                duration: 0.3,
                ease: [0.4, 0, 0.2, 1] // Custom easing for smooth animation
              }}
              className="absolute inset-0 flex items-center justify-center"
            >
              {isDark ? (
                <Moon 
                  className={cn(
                    "h-4 w-4",
                    "text-[#E4E4E4EB]", // Cursor Dark foreground
                    isAnimating && "drop-shadow-[0_0_8px_rgba(136,192,208,0.6)]" // Cursor Dark accent glow
                  )}
                />
              ) : (
                <Sun 
                  className={cn(
                    "h-4 w-4",
                    "text-foreground",
                    isAnimating && "drop-shadow-[0_0_8px_rgba(255,215,0,0.6)]"
                  )}
                />
              )}
            </motion.div>
          </AnimatePresence>
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        {isDark ? "Switch to light mode" : "Switch to dark mode"}
      </TooltipContent>
    </Tooltip>
  )
}
