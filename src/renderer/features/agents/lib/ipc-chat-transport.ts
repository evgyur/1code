import * as Sentry from "@sentry/electron/renderer"
import type { ChatTransport, UIMessage } from "ai"
import { toast } from "sonner"
import {
  agentsLoginModalOpenAtom,
  customClaudeConfigAtom,
  extendedThinkingEnabledAtom,
  historyEnabledAtom,
  modelMaxOutputTokensAtom,
  sessionInfoAtom,
  type CustomClaudeConfig,
  normalizeCustomClaudeConfig,
} from "../../../lib/atoms"
import { appStore } from "../../../lib/jotai-store"
import { trpcClient } from "../../../lib/trpc"
import {
  askUserQuestionResultsAtom,
  compactingSubChatsAtom,
  lastSelectedModelIdAtom,
  MODEL_ID_MAP,
  pendingAuthRetryMessageAtom,
  pendingUserQuestionsAtom,
} from "../atoms"
import { useAgentSubChatStore } from "../stores/sub-chat-store"

// Error categories and their user-friendly messages
const ERROR_TOAST_CONFIG: Record<
  string,
  {
    title: string
    description: string
    action?: { label: string; onClick: () => void }
  }
> = {
  AUTH_FAILED_SDK: {
    title: "Not logged in",
    description: "Run 'claude login' in your terminal to authenticate",
    action: {
      label: "Copy command",
      onClick: () => navigator.clipboard.writeText("claude login"),
    },
  },
  INVALID_API_KEY_SDK: {
    title: "Invalid API key",
    description:
      "Your Claude API key is invalid. Check your CLI configuration.",
  },
  INVALID_API_KEY: {
    title: "Invalid API key",
    description:
      "Your Claude API key is invalid. Check your CLI configuration.",
  },
  RATE_LIMIT_SDK: {
    title: "Session limit reached",
    description: "You've hit the Claude Code usage limit.",
    action: {
      label: "View usage",
      onClick: () =>
        trpcClient.external.openExternal.mutate(
          "https://claude.ai/settings/usage",
        ),
    },
  },
  RATE_LIMIT: {
    title: "Session limit reached",
    description: "You've hit the Claude Code usage limit.",
    action: {
      label: "View usage",
      onClick: () =>
        trpcClient.external.openExternal.mutate(
          "https://claude.ai/settings/usage",
        ),
    },
  },
  OVERLOADED_SDK: {
    title: "Claude is busy",
    description:
      "The service is overloaded. Please try again in a few moments.",
  },
  PROCESS_CRASH: {
    title: "Claude crashed",
    description:
      "The Claude process exited unexpectedly. Try sending your message again or rollback.",
  },
  EXECUTABLE_NOT_FOUND: {
    title: "Claude CLI not found",
    description:
      "Install Claude Code CLI: npm install -g @anthropic-ai/claude-code",
    action: {
      label: "Copy command",
      onClick: () =>
        navigator.clipboard.writeText(
          "npm install -g @anthropic-ai/claude-code",
        ),
    },
  },
  NETWORK_ERROR: {
    title: "Network error",
    description: "Check your internet connection and try again.",
  },
  AUTH_FAILURE: {
    title: "Authentication failed",
    description: "Your session may have expired. Try logging in again.",
  },
  SDK_ERROR: {
    title: "Claude SDK error",
    description: "An unexpected error occurred in the Claude SDK. Try sending your message again.",
  },
}

type UIMessageChunk = any // Inferred from subscription

type IPCChatTransportConfig = {
  chatId: string
  subChatId: string
  cwd: string
  projectPath?: string // Original project path for MCP config lookup (when using worktrees)
  mode: "plan" | "agent"
  model?: string
}

// Image attachment type matching the tRPC schema
type ImageAttachment = {
  base64Data: string
  mediaType: string
  filename?: string
}

export class IPCChatTransport implements ChatTransport<UIMessage> {
  constructor(private config: IPCChatTransportConfig) {}

  async sendMessages(options: {
    messages: UIMessage[]
    abortSignal?: AbortSignal
  }): Promise<ReadableStream<UIMessageChunk>> {
    // Extract prompt and images from last user message
    const lastUser = [...options.messages]
      .reverse()
      .find((m) => m.role === "user")
    const prompt = this.extractText(lastUser)
    const images = this.extractImages(lastUser)

    // Get sessionId for resume
    const lastAssistant = [...options.messages]
      .reverse()
      .find((m) => m.role === "assistant")
    const sessionId = (lastAssistant as any)?.metadata?.sessionId

    // Read extended thinking setting dynamically (so toggle applies to existing chats)
    const thinkingEnabled = appStore.get(extendedThinkingEnabledAtom)
    const historyEnabled = appStore.get(historyEnabledAtom)

    // Read model selection dynamically (so model changes apply to existing chats)
    const selectedModelId = appStore.get(lastSelectedModelIdAtom)
    const modelString = MODEL_ID_MAP[selectedModelId]

    const storedCustomConfig = appStore.get(
      customClaudeConfigAtom,
    ) as CustomClaudeConfig
    const customConfig = normalizeCustomClaudeConfig(storedCustomConfig)

    // Read extended thinking setting dynamically (so toggle applies to existing chats)
    // Clamp to model-specific limits discovered at runtime.
    const resolvedModel = (customConfig?.model ?? modelString ?? "").toLowerCase()
    const modelMaxOutputTokens = appStore.get(modelMaxOutputTokensAtom)
    const derivedModelLimit =
      resolvedModel.includes("opus-4-5") || resolvedModel === "opus"
        ? 64_000
        : undefined
    const resolvedModelLimit =
      resolvedModel && modelMaxOutputTokens[resolvedModel]
        ? modelMaxOutputTokens[resolvedModel]
        : resolvedModel
          ? Object.entries(modelMaxOutputTokens).find(([key]) =>
              key.includes(resolvedModel),
            )?.[1] ?? derivedModelLimit
          : derivedModelLimit
    const defaultThinkingTokens = 128_000
    const maxThinkingTokens =
      thinkingEnabled && resolvedModelLimit
        ? Math.max(1, Math.min(defaultThinkingTokens, resolvedModelLimit - 1))
        : thinkingEnabled
          ? defaultThinkingTokens
          : undefined

    const currentMode =
      useAgentSubChatStore
        .getState()
        .allSubChats.find((subChat) => subChat.id === this.config.subChatId)
        ?.mode || this.config.mode

    // Stream debug logging
    const subId = this.config.subChatId.slice(-8)
    let chunkCount = 0
    let lastChunkType = ""
    console.log(`[SD] R:START sub=${subId} cwd=${this.config.cwd} projectPath=${this.config.projectPath || "(not set)"} customConfig=${customConfig ? "set" : "not set"}`)

    return new ReadableStream({
      start: (controller) => {
        // Track if stream was closed to prevent enqueue after close
        let isStreamClosed = false
        let isStreamErrored = false // Track if stream was closed with error
        
        const sub = trpcClient.claude.chat.subscribe(
          {
            subChatId: this.config.subChatId,
            chatId: this.config.chatId,
            prompt,
            cwd: this.config.cwd,
            projectPath: this.config.projectPath, // Original project path for MCP config lookup
            mode: currentMode,
            sessionId,
            ...(maxThinkingTokens && { maxThinkingTokens }),
            ...(modelString && { model: modelString }),
            ...(customConfig && { customConfig }),
            historyEnabled,
            ...(images.length > 0 && { images }),
          },
          {
            onData: (chunk: UIMessageChunk) => {
              chunkCount++
              lastChunkType = chunk.type

              // Handle AskUserQuestion - show question UI
              if (chunk.type === "ask-user-question") {
                appStore.set(pendingUserQuestionsAtom, {
                  subChatId: this.config.subChatId,
                  toolUseId: chunk.toolUseId,
                  questions: chunk.questions,
                })
              }

              // Handle AskUserQuestion timeout - clear pending question immediately
              if (chunk.type === "ask-user-question-timeout") {
                const pending = appStore.get(pendingUserQuestionsAtom)
                if (pending && pending.toolUseId === chunk.toolUseId) {
                  appStore.set(pendingUserQuestionsAtom, null)
                }
              }

              // Handle AskUserQuestion result - store for real-time updates
              if (chunk.type === "ask-user-question-result") {
                const currentResults = appStore.get(askUserQuestionResultsAtom)
                const newResults = new Map(currentResults)
                newResults.set(chunk.toolUseId, chunk.result)
                appStore.set(askUserQuestionResultsAtom, newResults)
              }

              // Handle compacting status - track in atom for UI display
              if (chunk.type === "system-Compact") {
                const compacting = appStore.get(compactingSubChatsAtom)
                const newCompacting = new Set(compacting)
                if (chunk.state === "input-streaming") {
                  // Compacting started
                  newCompacting.add(this.config.subChatId)
                } else {
                  // Compacting finished (output-available)
                  newCompacting.delete(this.config.subChatId)
                }
                appStore.set(compactingSubChatsAtom, newCompacting)
              }

              // Handle session init - store MCP servers, plugins, tools info
              if (chunk.type === "session-init") {
                console.log("[MCP] Received session-init:", {
                  tools: chunk.tools?.length,
                  mcpServers: chunk.mcpServers,
                  plugins: chunk.plugins,
                  skills: chunk.skills?.length,
                  // Debug: show all tools to check for MCP tools (format: mcp__servername__toolname)
                  allTools: chunk.tools,
                })
                appStore.set(sessionInfoAtom, {
                  tools: chunk.tools,
                  mcpServers: chunk.mcpServers,
                  plugins: chunk.plugins,
                  skills: chunk.skills,
                })
              }

              // Clear pending questions ONLY when agent has moved on
              // Don't clear on tool-input-* chunks (still building the question input)
              // Clear when we get tool-output-* (answer received) or text-delta (agent moved on)
              const shouldClearOnChunk =
                chunk.type !== "ask-user-question" &&
                chunk.type !== "ask-user-question-timeout" &&
                chunk.type !== "ask-user-question-result" &&
                !chunk.type.startsWith("tool-input") && // Don't clear while input is being built
                chunk.type !== "start" &&
                chunk.type !== "start-step"

              if (shouldClearOnChunk) {
                const pending = appStore.get(pendingUserQuestionsAtom)
                if (pending && pending.subChatId === this.config.subChatId) {
                  appStore.set(pendingUserQuestionsAtom, null)
                }
              }

              // Handle authentication errors - show Claude login modal
              if (chunk.type === "auth-error") {
                // Store the failed message for retry after successful auth
                // readyToRetry=false prevents immediate retry - modal sets it to true on OAuth success
                appStore.set(pendingAuthRetryMessageAtom, {
                  subChatId: this.config.subChatId,
                  prompt,
                  ...(images.length > 0 && { images }),
                  readyToRetry: false,
                })
                // Show the Claude Code login modal
                appStore.set(agentsLoginModalOpenAtom, true)
                // Use controller.error() instead of controller.close() so that
                // the SDK Chat properly resets status from "streaming" to "ready"
                // This allows user to retry sending messages after failed auth
                console.log(`[SD] R:AUTH_ERR sub=${subId}`)
                isStreamClosed = true
                isStreamErrored = true
                controller.error(new Error("Authentication required"))
                return
              }

              // Handle errors - show toast to user FIRST before anything else
              if (chunk.type === "error") {
                const category = chunk.debugInfo?.category || "UNKNOWN"
                console.log(`[SD] R:ERROR_CHUNK sub=${subId} n=${chunkCount} category=${category} isStreamClosed=${isStreamClosed} isStreamErrored=${isStreamErrored}`)

                // Capture model limit info from SDK error payload (max_tokens > limit)
                if (category === "SDK_ERROR") {
                  // Collect all possible error text sources
                  const errorSources: string[] = []
                  const payload = chunk.debugInfo?.sdkErrorPayload
                  
                  // Extract error texts from various payload locations
                  if (payload?.message) {
                    const msg = payload.message
                    errorSources.push(
                      typeof msg === "string" ? msg : msg.content?.[0]?.text || ""
                    )
                  }
                  if (payload?.error) {
                    const err = payload.error
                    errorSources.push(
                      typeof err === "string" ? err : err.message || ""
                    )
                  }
                  if (chunk.errorText) errorSources.push(chunk.errorText)
                  if (chunk.debugInfo?.sdkError) errorSources.push(chunk.debugInfo.sdkError)
                  
                  // Filter out empty strings
                  const validSources = errorSources.filter((s): s is string => 
                    typeof s === "string" && s.length > 0
                  )
                  
                  // Strategy 1: Try to parse JSON from error text (e.g., "API Error: 400 {...}")
                  for (const errorText of validSources) {
                    const jsonMatch = errorText.match(/\{[\s\S]*\}/)
                    if (jsonMatch) {
                      try {
                        const parsed = JSON.parse(jsonMatch[0])
                        const jsonErrorText = parsed.error?.message || parsed.message
                        if (jsonErrorText) validSources.push(jsonErrorText)
                      } catch {
                        // Not valid JSON, continue
                      }
                    }
                  }
                  
                  // Strategy 2: Parse limit and model from all error texts
                  const patterns = [
                    // Format: "max_tokens: 128000 > 64000 ... maximum allowed number of output tokens for model-name"
                    /max_tokens:\s*(\d+)\s*>\s*(\d+).*maximum allowed number of output tokens for\s+([^\s\"\n,]+)/i,
                    // Format: "max_tokens (128000) exceeds maximum (64000) for model-name"
                    /max_tokens\s*\(?\s*(\d+)\s*\)?\s*exceeds?\s*maximum\s*\(?\s*(\d+)\s*\)?\s*for\s+([^\s\"\n,]+)/i,
                    // Format: "maximum output tokens: 64000" (extract limit only)
                    /maximum\s*(?:allowed\s*)?(?:number\s*of\s*)?output\s*tokens?\s*(?:is\s*|:?\s*)(\d+)/i,
                    // Format: "max_tokens must be <= 64000" (extract limit only)
                    /max_tokens\s+must\s+be\s*<=\s*(\d+)/i,
                  ]
                  
                  let limit: number | undefined
                  let model: string | undefined
                  
                  // Try all patterns on all error sources
                  for (const errorText of validSources) {
                    for (const pattern of patterns) {
                      const match = errorText.match(pattern)
                      if (!match) continue
                      
                      // Pattern 1 & 2: extract limit and model
                      if (match.length >= 4 && match[2] && match[3]) {
                        limit = Number(match[2])
                        model = match[3].trim().toLowerCase()
                      }
                      // Pattern 3 & 4: only limit, use resolvedModel as fallback
                      else if (match[1]) {
                        limit = Number(match[1])
                        if (resolvedModel) model = resolvedModel
                      }
                      
                      if (limit && model && Number.isFinite(limit) && limit > 0) break
                    }
                    if (limit && model) break
                  }
                  
                  // Strategy 3: If we have limit but no model, use resolvedModel
                  if (limit && !model && resolvedModel) {
                    model = resolvedModel
                  }
                  
                  // Store learned limit
                  if (limit && model && Number.isFinite(limit) && limit > 0) {
                    const currentLimits = appStore.get(modelMaxOutputTokensAtom)
                    // Normalize model name: remove version suffixes, normalize separators
                    const normalizedModel = model
                      .replace(/[-_]?v?\d+[.-]\d+.*$/i, "") // Remove version like "v4.5", "4-5", etc.
                      .replace(/[-_]/g, "-") // Normalize separators
                      .toLowerCase()
                      .trim()
                    
                    if (normalizedModel && currentLimits[normalizedModel] !== limit) {
                      appStore.set(modelMaxOutputTokensAtom, {
                        ...currentLimits,
                        [normalizedModel]: limit,
                      })
                      console.log(`[SD] R:MODEL_LIMIT learned model=${normalizedModel} limit=${limit} from error`)
                    }
                  } else if (validSources.length > 0) {
                    // Log raw payload if we couldn't extract limit (for debugging unknown formats)
                    console.warn(`[SD] R:MODEL_LIMIT failed to extract limit from error. Raw payload:`, {
                      errorSources: validSources.slice(0, 3), // Limit to first 3 to avoid spam
                      sdkErrorPayload: chunk.debugInfo?.sdkErrorPayload,
                      resolvedModel,
                    })
                  }
                }
                
                // Don't set isStreamErrored here - let SDK process the error chunk first
                // We'll detect if stream was closed with error when trying to close it in onComplete
                
                // Track error in Sentry
                Sentry.captureException(
                  new Error(chunk.errorText || "Claude transport error"),
                  {
                    tags: {
                      errorCategory: category,
                      mode: currentMode,
                    },
                    extra: {
                      debugInfo: chunk.debugInfo,
                      cwd: this.config.cwd,
                      chatId: this.config.chatId,
                      subChatId: this.config.subChatId,
                    },
                  },
                )

                // Show toast based on error category
                const config = ERROR_TOAST_CONFIG[category]

                if (config) {
                  const debugInfo = chunk.debugInfo || {}
                  const sdkError = debugInfo?.sdkError
                  const description =
                    category === "SDK_ERROR" && sdkError
                      ? `Claude SDK error: ${sdkError}`
                      : config.description

                  const action =
                    category === "SDK_ERROR"
                      ? {
                          label: "Copy error",
                          onClick: () => {
                            navigator.clipboard.writeText(
                              `Error: ${chunk.errorText || "Claude SDK error"}\nCategory: ${category}\nDebug: ${JSON.stringify(debugInfo, null, 2)}`,
                            )
                          },
                        }
                      : config.action

                  toast.error(config.title, {
                    description,
                    duration: 8000,
                    action,
                  })
                } else {
                  // Unknown error category - show generic error with details
                  const errorText = chunk.errorText || "An unexpected error occurred"
                  const debugInfo = chunk.debugInfo || {}
                  
                  // For SDK_ERROR with "unknown" error, provide more helpful message
                  let title = "Something went wrong"
                  let description = errorText
                  
                  if (category === "SDK_ERROR" && debugInfo.sdkError === "unknown") {
                    title = "Claude SDK error"
                    description = "An unexpected error occurred. This might be a temporary issue. Try sending your message again."
                  }
                  
                  toast.error(title, {
                    description: description,
                    duration: 10000,
                    action: {
                      label: "Copy error",
                      onClick: () => {
                        navigator.clipboard.writeText(
                          `Error: ${errorText}\nCategory: ${category}\nDebug: ${JSON.stringify(debugInfo, null, 2)}`
                        )
                      },
                    },
                  })
                }
                
                // IMPORTANT: Always enqueue error chunks normally so SDK can process them
                // Don't use controller.error() here - let the stream close naturally via finish+onComplete
                // This ensures SDK properly handles the error and allows retry
              }

              // Try to enqueue, but don't crash if stream is already closed
              // Exception: Always enqueue error chunks so SDK can handle them properly
              if (isStreamClosed && chunk.type !== "error") {
                // Stream was already closed (by error, abort, or finish+complete)
                // Skip this chunk silently - it's expected after stream closure
                // But allow error chunks through so SDK can reset state
                return
              }
              
              try {
                controller.enqueue(chunk)
                // Log successful enqueue for error chunks to track SDK behavior
                if (chunk.type === "error") {
                  console.log(`[SD] R:ERROR_CHUNK_ENQUEUED sub=${subId} n=${chunkCount} category=${chunk.debugInfo?.category || "UNKNOWN"} - error chunk enqueued successfully`)
                }
              } catch (e: any) {
                // Check if error is due to closed stream
                const errorMsg = e?.message || ""
                const isClosedError = errorMsg.includes("closed") || 
                                      errorMsg.includes("Cannot enqueue") ||
                                      e?.name === "TypeError"
                
                if (isClosedError) {
                  isStreamClosed = true
                  // Check if stream is in errored state (cannot close errored stream)
                  if (errorMsg.includes("errored") || errorMsg.includes("error")) {
                    isStreamErrored = true
                    console.log(`[SD] R:ENQUEUE_DETECTED_ERRORED sub=${subId} type=${chunk.type} n=${chunkCount} - stream is errored`)
                  }
                  // For error chunks, this is critical - log it
                  if (chunk.type === "error") {
                    console.log(`[SD] R:ENQUEUE_ERR_CRITICAL sub=${subId} type=${chunk.type} n=${chunkCount} - failed to enqueue error chunk, stream closed`)
                  } else {
                    // This is expected if stream was closed (e.g., by abort or error)
                    // Don't log as error, just skip this chunk
                    console.log(`[SD] R:ENQUEUE_SKIP sub=${subId} type=${chunk.type} n=${chunkCount} - stream already closed`)
                  }
                } else {
                  // Other errors should be logged
                  console.log(`[SD] R:ENQUEUE_ERR sub=${subId} type=${chunk.type} n=${chunkCount} err=${e}`)
                }
              }

              // Don't close controller on "finish" - let onComplete handle it
              // "finish" is just a signal that data is done, but there might be cleanup chunks after
              if (chunk.type === "finish") {
                console.log(`[SD] R:FINISH sub=${subId} n=${chunkCount}`)
                // Note: Controller will be closed in onComplete callback
              }
            },
            onError: (err: Error) => {
              console.log(`[SD] R:ERROR sub=${subId} n=${chunkCount} last=${lastChunkType} err=${err.message} isStreamClosed=${isStreamClosed} isStreamErrored=${isStreamErrored}`)
              isStreamClosed = true // Mark as closed to prevent further enqueues
              isStreamErrored = true // Mark as errored to prevent close() call
              console.log(`[SD] R:ERROR_SET_FLAGS sub=${subId} - set isStreamClosed=true isStreamErrored=true`)
              
              // Track transport errors in Sentry
              Sentry.captureException(err, {
                tags: {
                  errorCategory: "TRANSPORT_ERROR",
                  mode: currentMode,
                },
                extra: {
                  cwd: this.config.cwd,
                  chatId: this.config.chatId,
                  subChatId: this.config.subChatId,
                },
              })

              // Show user-friendly error toast
              const errorMessage = err.message || "Connection error"
              let errorTitle = "Connection error"
              let errorDescription = errorMessage
              
              // Try to categorize the error for better user experience
              if (errorMessage.includes("authentication") || errorMessage.includes("auth")) {
                errorTitle = "Not logged in"
                errorDescription = "Run 'claude login' in your terminal to authenticate"
              } else if (errorMessage.includes("network") || errorMessage.includes("fetch")) {
                errorTitle = "Network error"
                errorDescription = "Check your internet connection and try again"
              } else if (errorMessage.includes("timeout")) {
                errorTitle = "Request timeout"
                errorDescription = "The request took too long. Please try again"
              }
              
              toast.error(errorTitle, {
                description: errorDescription,
                duration: 8000,
                action: {
                  label: "Copy error",
                  onClick: () => {
                    navigator.clipboard.writeText(`Error: ${errorMessage}\nStack: ${err.stack || "No stack"}`)
                  },
                },
              })

              try {
                controller.error(err)
              } catch {
                // Already closed or error setting error state
              }
            },
            onComplete: () => {
              console.log(`[SD] R:COMPLETE sub=${subId} n=${chunkCount} last=${lastChunkType}`)
              isStreamClosed = true // Mark as closed to prevent further enqueues
              
              // Note: Don't clear pending questions here - let active-chat.tsx handle it
              // via the stream stop detection effect. Clearing here causes race conditions
              // where sync effect immediately restores from messages.
              // Close the stream - this is the proper place to close, not on "finish" chunk
              // BUT: Don't close if stream was already closed with error (controller.error())
              // You cannot close an errored stream
              if (!isStreamErrored) {
                try {
                  controller.close()
                } catch (e: any) {
                  // Check if error is because stream is errored
                  const errorMsg = e?.message || String(e) || ""
                  if (errorMsg.includes("errored") || errorMsg.includes("Cannot close an errored")) {
                    // Stream was closed with error - mark it and don't try again
                    isStreamErrored = true
                    console.log(`[SD] R:CLOSE_SKIP sub=${subId} - stream was errored, cannot close`)
                  } else {
                    // Already closed normally - this is fine
                    console.log(`[SD] R:CLOSE_SKIP sub=${subId} - already closed: ${e}`)
                  }
                }
              } else {
                console.log(`[SD] R:CLOSE_SKIP sub=${subId} - stream was errored, cannot close`)
              }
            },
          },
        )

        // Handle abort
        options.abortSignal?.addEventListener("abort", () => {
          console.log(`[SD] R:ABORT sub=${subId} n=${chunkCount} last=${lastChunkType}`)
          isStreamClosed = true // Mark as closed to prevent further enqueues
          sub.unsubscribe()
          trpcClient.claude.cancel.mutate({ subChatId: this.config.subChatId })
          try {
            controller.close()
          } catch {
            // Already closed
          }
        })
      },
    })
  }

  async reconnectToStream(): Promise<ReadableStream<UIMessageChunk> | null> {
    return null // Not needed for local app
  }

  private extractText(msg: UIMessage | undefined): string {
    if (!msg) return ""
    if (msg.parts) {
      return msg.parts
        .filter((p): p is { type: "text"; text: string } => p.type === "text")
        .map((p) => p.text)
        .join("\n")
    }
    return ""
  }

  /**
   * Extract images from message parts
   * Looks for parts with type "data-image" that have base64Data
   */
  private extractImages(msg: UIMessage | undefined): ImageAttachment[] {
    if (!msg || !msg.parts) return []

    const images: ImageAttachment[] = []

    for (const part of msg.parts) {
      // Check for data-image parts with base64 data
      if (part.type === "data-image" && (part as any).data) {
        const data = (part as any).data
        if (data.base64Data && data.mediaType) {
          images.push({
            base64Data: data.base64Data,
            mediaType: data.mediaType,
            filename: data.filename,
          })
        }
      }
    }

    return images
  }
}
