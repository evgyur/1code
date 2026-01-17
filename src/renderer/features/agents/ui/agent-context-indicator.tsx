"use client"

import { memo, useMemo } from "react"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "../../../components/ui/tooltip"
import { cn } from "../../../lib/utils"
import type { AgentMessageMetadata } from "./agent-message-usage"

// Claude model context windows
const CONTEXT_WINDOWS = {
  opus: 200_000,
  sonnet: 200_000,
  haiku: 200_000,
} as const

type ModelId = keyof typeof CONTEXT_WINDOWS

interface AgentContextIndicatorProps {
  messages: Array<{ metadata?: AgentMessageMetadata }>
  chat?: any // Chat instance to access original messages with metadata
  subChatId?: string // Sub-chat ID to look up original messages from database
  modelId?: ModelId
  className?: string
  onCompact?: () => void
  isCompacting?: boolean
  disabled?: boolean
}

function formatTokens(tokens: number): string {
  if (tokens >= 1_000_000) {
    return `${(tokens / 1_000_000).toFixed(1)}M`
  }
  if (tokens >= 1000) {
    return `${(tokens / 1000).toFixed(1)}K`
  }
  return tokens.toString()
}

// Circular progress component
function CircularProgress({
  percent,
  size = 18,
  strokeWidth = 2,
  className,
}: {
  percent: number
  size?: number
  strokeWidth?: number
  className?: string
}) {
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (percent / 100) * circumference

  return (
    <svg
      width={size}
      height={size}
      className={cn("transform -rotate-90", className)}
    >
      {/* Background circle */}
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        className="text-muted-foreground/20"
      />
      {/* Progress circle */}
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
        className="transition-all duration-300 text-muted-foreground/60"
      />
    </svg>
  )
}

export const AgentContextIndicator = memo(function AgentContextIndicator({
  messages,
  chat,
  subChatId,
  modelId = "sonnet",
  className,
  onCompact,
  isCompacting,
  disabled,
}: AgentContextIndicatorProps) {
  // Calculate session totals from all message metadata
  // Only assistant messages have metadata (token usage from AI responses)
  const sessionTotals = useMemo(() => {
    let totalInputTokens = 0
    let totalOutputTokens = 0
    let totalCostUsd = 0

    // Try to get original messages from Chat instance if available (they might have metadata)
    // The AI SDK's useChat might strip metadata, so we check the Chat instance directly
    let messagesToCheck = messages
    if (chat) {
      // Try different ways to access messages from Chat instance
      if (typeof chat.getMessages === 'function') {
        try {
          const originalMessages = chat.getMessages()
          if (originalMessages && originalMessages.length > 0) {
            messagesToCheck = originalMessages
          }
        } catch (e) {
          // Fall back to messages from useChat
        }
      } else if ((chat as any).messages && Array.isArray((chat as any).messages)) {
        // Chat instance might have messages property directly
        messagesToCheck = (chat as any).messages
      }
    }

    // Filter to only assistant messages (they're the ones with token usage metadata)
    const assistantMessages = messagesToCheck.filter((m: any) => m.role === "assistant")

    for (const msg of assistantMessages) {
      // Check both msg.metadata and (msg as any).experimental_providerMetadata
      // AI SDK might store metadata in different places
      const metadata = msg.metadata || (msg as any).experimental_providerMetadata
      
      if (metadata) {
        // Handle both number and string values (in case they're stored as strings)
        // Also check for undefined/null explicitly
        const inputTokens = typeof metadata.inputTokens === 'number' && !isNaN(metadata.inputTokens) 
          ? metadata.inputTokens 
          : typeof metadata.inputTokens === 'string' 
            ? parseInt(metadata.inputTokens, 10) || 0 
            : 0
        const outputTokens = typeof metadata.outputTokens === 'number' && !isNaN(metadata.outputTokens)
          ? metadata.outputTokens
          : typeof metadata.outputTokens === 'string'
            ? parseInt(metadata.outputTokens, 10) || 0
            : 0
        const costUsd = typeof metadata.totalCostUsd === 'number' && !isNaN(metadata.totalCostUsd)
          ? metadata.totalCostUsd
          : typeof metadata.totalCostUsd === 'string'
            ? parseFloat(metadata.totalCostUsd) || 0
            : 0
        
        totalInputTokens += inputTokens
        totalOutputTokens += outputTokens
        totalCostUsd += costUsd
      }
    }

    const totalTokens = totalInputTokens + totalOutputTokens

    // Always log debug info when we have messages (helps diagnose metadata issues)
    if (messages.length > 0) {
      const messagesWithMetadata = assistantMessages.filter(
        (m: any) => m.metadata || (m as any).experimental_providerMetadata
      )
      
      // Log basic info about messages and metadata
      if (assistantMessages.length > 0) {
        const sampleMsg = assistantMessages[0]
        const sampleMeta = sampleMsg?.metadata || (sampleMsg as any)?.experimental_providerMetadata
        console.log("[AgentContextIndicator] Messages analysis:")
        console.log("  Total messages:", messages.length)
        console.log("  Assistant messages:", assistantMessages.length)
        console.log("  Messages with metadata:", messagesWithMetadata.length)
        console.log("  Total tokens:", totalTokens)
        console.log("  Sample assistant message keys:", sampleMsg ? Object.keys(sampleMsg) : null)
        console.log("  Sample metadata:", JSON.stringify(sampleMeta, null, 2))
        console.log("  Sample metadata keys:", sampleMeta ? Object.keys(sampleMeta) : null)
      }
      
      if (assistantMessages.length > 0 && messagesWithMetadata.length === 0) {
        console.warn("[AgentContextIndicator] ⚠️ No metadata found on assistant messages!")
      } else if (messagesWithMetadata.length > 0 && totalTokens === 0) {
        // Metadata exists but tokens are 0 - might be a data issue
        const sampleMetadata = messagesWithMetadata[0]?.metadata || (messagesWithMetadata[0] as any)?.experimental_providerMetadata
        console.warn("[AgentContextIndicator] ⚠️ Metadata found but tokens are 0:")
        console.warn("  Sample metadata (full):", sampleMetadata)
        console.warn("  Sample metadata keys:", sampleMetadata ? Object.keys(sampleMetadata) : null)
        // Log first 3 messages with their metadata to see the pattern
        messagesWithMetadata.slice(0, 3).forEach((m: any, idx: number) => {
          const meta = m.metadata || (m as any).experimental_providerMetadata
          console.warn(`  Message ${idx + 1}:`, {
            id: m.id?.slice(0, 8),
            role: m.role,
            hasMetadata: !!m.metadata,
            hasExperimentalMetadata: !!(m as any).experimental_providerMetadata,
            inputTokens: meta?.inputTokens,
            outputTokens: meta?.outputTokens,
            totalTokens: meta?.totalTokens,
            metadataKeys: meta ? Object.keys(meta) : [],
            // Show actual values to see if they're 0, null, or undefined
            metadataValues: meta ? {
              inputTokens: meta.inputTokens,
              outputTokens: meta.outputTokens,
              totalTokens: meta.totalTokens,
              sessionId: meta.sessionId,
              totalCostUsd: meta.totalCostUsd,
            } : null,
          })
        })
      }
    }

    return {
      inputTokens: totalInputTokens,
      outputTokens: totalOutputTokens,
      totalTokens,
      totalCostUsd,
    }
  }, [messages, chat, subChatId])

  const contextWindow = CONTEXT_WINDOWS[modelId]
  const percentUsed = Math.min(
    100,
    (sessionTotals.totalTokens / contextWindow) * 100,
  )

  const isEmpty = sessionTotals.totalTokens === 0

  const isClickable = onCompact && !disabled && !isCompacting

  // Note: Debug logging is now in sessionTotals useMemo above

  return (
    <Tooltip delayDuration={300}>
      <TooltipTrigger asChild>
        <div
          onClick={isClickable ? onCompact : undefined}
          className={cn(
            "h-4 w-4 flex items-center justify-center",
            isClickable
              ? "cursor-pointer hover:opacity-70 transition-opacity"
              : "cursor-default",
            disabled && "opacity-50",
            className,
          )}
        >
          <CircularProgress
            percent={percentUsed}
            size={14}
            strokeWidth={2.5}
            className={isCompacting ? "animate-pulse" : undefined}
          />
        </div>
      </TooltipTrigger>
      <TooltipContent side="top" sideOffset={8}>
        <p className="text-xs">
          {isEmpty ? (
            <span className="text-muted-foreground">
              Context: 0 / {formatTokens(contextWindow)}
            </span>
          ) : (
            <>
              <span className="font-mono font-medium text-foreground">
                {percentUsed.toFixed(1)}%
              </span>
              <span className="text-muted-foreground mx-1">·</span>
              <span className="text-muted-foreground">
                {formatTokens(sessionTotals.totalTokens)} /{" "}
                {formatTokens(contextWindow)} context
              </span>
            </>
          )}
        </p>
      </TooltipContent>
    </Tooltip>
  )
})
