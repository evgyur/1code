import * as Sentry from "@sentry/electron/renderer"
import type { ChatTransport, UIMessage } from "ai"
import { toast } from "sonner"
import {
  agentsLoginModalOpenAtom,
  customClaudeConfigAtom,
  extendedThinkingEnabledAtom,
  historyEnabledAtom,
  sessionInfoAtom,
  selectedOllamaModelAtom,
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
    description:
      "An unexpected error occurred in the Claude SDK. Try sending your message again.",
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
    // Cap below 64k to avoid SDK limit errors on some models.
    const thinkingEnabled = appStore.get(extendedThinkingEnabledAtom)
    const maxThinkingTokens = thinkingEnabled ? 63_800 : undefined
    const historyEnabled = appStore.get(historyEnabledAtom)

    // Read model selection dynamically (so model changes apply to existing chats)
    const selectedModelId = appStore.get(lastSelectedModelIdAtom)
    const modelString = MODEL_ID_MAP[selectedModelId]

    const storedCustomConfig = appStore.get(
      customClaudeConfigAtom,
    ) as CustomClaudeConfig
    const customConfig = normalizeCustomClaudeConfig(storedCustomConfig)

    // Get selected Ollama model for offline mode
    const selectedOllamaModel = appStore.get(selectedOllamaModelAtom)
    console.log(`[SD] selectedOllamaModel from atom: ${selectedOllamaModel || "(null)"}`)

    const currentMode =
      useAgentSubChatStore
        .getState()
        .allSubChats.find((subChat) => subChat.id === this.config.subChatId)
        ?.mode || this.config.mode

    // Stream debug logging
    const subId = this.config.subChatId.slice(-8)
    let chunkCount = 0
    let lastChunkType = ""
    let isStreamClosed = false
    let isStreamErrored = false
    console.log(`[SD] R:START sub=${subId} cwd=${this.config.cwd} projectPath=${this.config.projectPath || "(not set)"} customConfig=${customConfig ? "set" : "not set"}`)

    return new ReadableStream({
      start: (controller) => {
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
            ...(selectedOllamaModel && { selectedOllamaModel }),
            historyEnabled,
            ...(images.length > 0 && { images }),
          },
          {
            onData: (chunk: UIMessageChunk) => {
              chunkCount++
              lastChunkType = chunk.type

              // Handle AskUserQuestion - show question UI
              if (chunk.type === "ask-user-question") {
                const currentMap = appStore.get(pendingUserQuestionsAtom)
                const newMap = new Map(currentMap)
                newMap.set(this.config.subChatId, {
                  subChatId: this.config.subChatId,
                  parentChatId: this.config.chatId,
                  toolUseId: chunk.toolUseId,
                  questions: chunk.questions,
                })
                appStore.set(pendingUserQuestionsAtom, newMap)
              }

              // Handle AskUserQuestion timeout - clear pending question immediately
              if (chunk.type === "ask-user-question-timeout") {
                const currentMap = appStore.get(pendingUserQuestionsAtom)
                const pending = currentMap.get(this.config.subChatId)
                if (pending && pending.toolUseId === chunk.toolUseId) {
                  const newMap = new Map(currentMap)
                  newMap.delete(this.config.subChatId)
                  appStore.set(pendingUserQuestionsAtom, newMap)
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
                const currentMap = appStore.get(pendingUserQuestionsAtom)
                if (currentMap.has(this.config.subChatId)) {
                  const newMap = new Map(currentMap)
                  newMap.delete(this.config.subChatId)
                  appStore.set(pendingUserQuestionsAtom, newMap)
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
                console.log(
                  `[SD] R:ERROR_CHUNK sub=${subId} n=${chunkCount} category=${category} isStreamClosed=${isStreamClosed} isStreamErrored=${isStreamErrored}`,
                )

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
                  const errorText =
                    chunk.errorText || "An unexpected error occurred"
                  const debugInfo = chunk.debugInfo || {}

                  let title = "Something went wrong"
                  let description = errorText

                  if (
                    category === "SDK_ERROR" &&
                    debugInfo.sdkError === "unknown"
                  ) {
                    title = "Claude SDK error"
                    description =
                      "An unexpected error occurred. This might be a temporary issue. Try sending your message again."
                  }

                  toast.error(title, {
                    description,
                    duration: 10000,
                    action: {
                      label: "Copy error",
                      onClick: () => {
                        navigator.clipboard.writeText(
                          `Error: ${errorText}\nCategory: ${category}\nDebug: ${JSON.stringify(debugInfo, null, 2)}`,
                        )
                      },
                    },
                  })
                }

                // IMPORTANT: Always enqueue error chunks so SDK can handle them.
              }

              // Try to enqueue, but don't crash if stream is already closed
              if (isStreamClosed && chunk.type !== "error") {
                return
              }

              try {
                controller.enqueue(chunk)
                if (chunk.type === "error") {
                  console.log(
                    `[SD] R:ERROR_CHUNK_ENQUEUED sub=${subId} n=${chunkCount} category=${chunk.debugInfo?.category || "UNKNOWN"} - error chunk enqueued successfully`,
                  )
                }
              } catch (e: any) {
                const errorMsg = e?.message || ""
                const isClosedError =
                  errorMsg.includes("closed") ||
                  errorMsg.includes("Cannot enqueue") ||
                  e?.name === "TypeError"

                if (isClosedError) {
                  isStreamClosed = true
                  if (errorMsg.includes("errored") || errorMsg.includes("error")) {
                    isStreamErrored = true
                    console.log(
                      `[SD] R:ENQUEUE_DETECTED_ERRORED sub=${subId} type=${chunk.type} n=${chunkCount} - stream is errored`,
                    )
                  }

                  if (chunk.type === "error") {
                    console.log(
                      `[SD] R:ENQUEUE_ERR_CRITICAL sub=${subId} type=${chunk.type} n=${chunkCount} - failed to enqueue error chunk, stream closed`,
                    )
                  }
                } else {
                  console.log(
                    `[SD] R:ENQUEUE_ERR sub=${subId} type=${chunk.type} n=${chunkCount} err=${e}`,
                  )
                }
              }

              // Don't close controller on "finish" - let onComplete handle it
              if (chunk.type === "finish") {
                console.log(`[SD] R:FINISH sub=${subId} n=${chunkCount}`)
              }
            },
            onError: (err: Error) => {
              console.log(
                `[SD] R:ERROR sub=${subId} n=${chunkCount} last=${lastChunkType} err=${err.message} isStreamClosed=${isStreamClosed} isStreamErrored=${isStreamErrored}`,
              )
              isStreamClosed = true
              isStreamErrored = true

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

              const errorMessage = err.message || "Connection error"
              let errorTitle = "Connection error"
              let errorDescription = errorMessage

              if (
                errorMessage.includes("authentication") ||
                errorMessage.includes("auth")
              ) {
                errorTitle = "Not logged in"
                errorDescription =
                  "Run 'claude login' in your terminal to authenticate"
              } else if (
                errorMessage.includes("network") ||
                errorMessage.includes("fetch")
              ) {
                errorTitle = "Network error"
                errorDescription =
                  "Check your internet connection and try again"
              } else if (errorMessage.includes("timeout")) {
                errorTitle = "Request timeout"
                errorDescription =
                  "The request took too long. Please try again"
              }

              toast.error(errorTitle, {
                description: errorDescription,
                duration: 8000,
                action: {
                  label: "Copy error",
                  onClick: () => {
                    navigator.clipboard.writeText(
                      `Error: ${errorMessage}\nStack: ${err.stack || "No stack"}`,
                    )
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
              isStreamClosed = true
              // Note: Don't clear pending questions here - let active-chat.tsx handle it
              // via the stream stop detection effect. Clearing here causes race conditions
              // where sync effect immediately restores from messages.
              if (!isStreamErrored) {
                try {
                  controller.close()
                } catch (e: any) {
                  const errorMsg = e?.message || String(e) || ""
                  if (
                    errorMsg.includes("errored") ||
                    errorMsg.includes("Cannot close an errored")
                  ) {
                    isStreamErrored = true
                    console.log(
                      `[SD] R:CLOSE_SKIP sub=${subId} - stream was errored, cannot close`,
                    )
                  }
                }
              } else {
                console.log(
                  `[SD] R:CLOSE_SKIP sub=${subId} - stream was errored, cannot close`,
                )
              }
            },
          },
        )

        // Handle abort
        options.abortSignal?.addEventListener("abort", () => {
          console.log(`[SD] R:ABORT sub=${subId} n=${chunkCount} last=${lastChunkType}`)
          isStreamClosed = true
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
