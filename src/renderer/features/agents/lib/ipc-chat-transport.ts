import * as Sentry from "@sentry/electron/renderer"
import type { ChatTransport, UIMessage } from "ai"
import { toast } from "sonner"
import {
  agentsLoginModalOpenAtom,
  extendedThinkingEnabledAtom,
} from "../../../lib/atoms"
import { appStore } from "../../../lib/jotai-store"
import { trpcClient } from "../../../lib/trpc"
import {
  askUserQuestionResultsAtom,
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
    title: "Rate limited",
    description: "Too many requests. Please wait a moment and try again.",
  },
  RATE_LIMIT: {
    title: "Rate limited",
    description: "Too many requests. Please wait a moment and try again.",
  },
  OVERLOADED_SDK: {
    title: "Claude is busy",
    description:
      "The service is overloaded. Please try again in a few moments.",
  },
  PROCESS_CRASH: {
    title: "Claude crashed",
    description:
      "The Claude process exited unexpectedly. Try sending your message again.",
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
}

type UIMessageChunk = any // Inferred from subscription

type IPCChatTransportConfig = {
  chatId: string
  subChatId: string
  cwd: string
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
    const maxThinkingTokens = thinkingEnabled ? 128_000 : undefined

    // Read model selection dynamically (so model changes apply to existing chats)
    const selectedModelId = appStore.get(lastSelectedModelIdAtom)
    const modelString = MODEL_ID_MAP[selectedModelId]

    const currentMode =
      useAgentSubChatStore
        .getState()
        .allSubChats.find((subChat) => subChat.id === this.config.subChatId)
        ?.mode || this.config.mode

    // Stream debug logging
    const subId = this.config.subChatId.slice(-8)
    let chunkCount = 0
    let lastChunkType = ""
    console.log(`[SD] R:START sub=${subId}`)

    return new ReadableStream({
      start: (controller) => {
        console.error(`\n========== CREATING SUBSCRIPTION ==========`)
        console.error(`SubChatId: ${this.config.subChatId}`)
        console.error(`ChatId: ${this.config.chatId}`)
        console.error(`Prompt: "${prompt.substring(0, 100)}${prompt.length > 100 ? '...' : ''}"`)
        console.error(`Prompt Length: ${prompt.length}`)
        console.error(`CWD: ${this.config.cwd}`)
        console.error(`Mode: ${currentMode}`)
        console.error(`SessionId: ${sessionId || 'none'}`)
        console.error(`Images: ${images.length}`)
        console.error(`MaxThinkingTokens: ${maxThinkingTokens || 'none'}`)
        console.error(`Model: ${modelString || 'default'}`)
        console.error(`==========================================\n`)
        
        let subscriptionCreated = false
        let subscriptionError: Error | null = null
        
        const sub = trpcClient.claude.chat.subscribe(
          {
            subChatId: this.config.subChatId,
            chatId: this.config.chatId,
            prompt,
            cwd: this.config.cwd,
            mode: currentMode,
            sessionId,
            ...(maxThinkingTokens && { maxThinkingTokens }),
            ...(modelString && { model: modelString }),
            ...(images.length > 0 && { images }),
          },
          {
            onData: (chunk: UIMessageChunk) => {
              if (!subscriptionCreated) {
                subscriptionCreated = true
                console.error(`\n========== FIRST CHUNK RECEIVED ==========`)
                console.error(`Type: ${chunk.type}`)
                console.error(`Full Chunk JSON:\n${JSON.stringify(chunk, null, 2)}`)
                if (chunk.type === "error") {
                  const errorChunk = chunk as any
                  console.error(`\n*** ERROR CHUNK DETAILS ***`)
                  console.error(`Error Text: "${errorChunk.errorText || 'MISSING'}"`)
                  console.error(`Debug Info:`, errorChunk.debugInfo || 'MISSING')
                  console.error(`Category: ${errorChunk.debugInfo?.category || 'MISSING'}`)
                  console.error(`Context: ${errorChunk.debugInfo?.context || 'MISSING'}`)
                  console.error(`CWD: ${errorChunk.debugInfo?.cwd || 'MISSING'}`)
                  console.error(`Mode: ${errorChunk.debugInfo?.mode || 'MISSING'}`)
                  console.error(`Error Message: ${errorChunk.debugInfo?.errorMessage || 'MISSING'}`)
                  console.error(`Error Stack: ${errorChunk.debugInfo?.errorStack || 'MISSING'}`)
                  console.error(`****************************************\n`)
                }
                console.error(`==========================================\n`)
              }
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
                controller.error(new Error("Authentication required"))
                return
              }

              // Handle errors - show toast to user FIRST before anything else
              if (chunk.type === "error") {
                const err = chunk as any
                console.error(`\n╔═══════════════════════════════════════════════════════════╗`)
                console.error(`║ ⚠️  ERROR CHUNK PROCESSED                                  ║`)
                console.error(`╠═══════════════════════════════════════════════════════════╣`)
                console.error(`║ Error Text: ${(err.errorText || 'MISSING').substring(0, 47).padEnd(47)}║`)
                console.error(`║ Category: ${String(err.debugInfo?.category || 'MISSING').padEnd(50)}║`)
                console.error(`║ Context: ${String(err.debugInfo?.context || 'MISSING').padEnd(51)}║`)
                console.error(`║ CWD: ${String(err.debugInfo?.cwd || this.config.cwd).padEnd(54)}║`)
                console.error(`║ Mode: ${String(err.debugInfo?.mode || 'MISSING').padEnd(52)}║`)
                console.error(`╚═══════════════════════════════════════════════════════════╝`)
                console.error(`\nFULL ERROR TEXT:\n"${err.errorText || 'MISSING'}"\n`)
                console.error(`\nDEBUG INFO:\n${JSON.stringify(err.debugInfo, null, 2)}\n`)
                console.error(`\nERROR MESSAGE FROM DEBUG:\n${err.debugInfo?.errorMessage || 'MISSING'}\n`)
                console.error(`\nERROR STACK FROM DEBUG:\n${err.debugInfo?.errorStack || 'MISSING'}\n`)
                console.error(`\nFULL CHUNK OBJECT:\n${JSON.stringify(chunk, null, 2)}\n`)
                
                // Track error in Sentry
                Sentry.captureException(
                  new Error(errorText),
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

                // Show toast with full error message
                const config = ERROR_TOAST_CONFIG[category]
                const description = config 
                  ? `${config.description}\n\n${errorText}`
                  : errorText

                toast.error(config?.title || "Claude Error", {
                  description: description,
                  duration: 15000,
                  action: {
                    label: "Copy Error",
                    onClick: () => {
                      const fullError = `Error: ${errorText}\nCategory: ${category}\nCWD: ${this.config.cwd}\nDebug: ${JSON.stringify(chunk.debugInfo, null, 2)}`
                      navigator.clipboard.writeText(fullError)
                      console.log("Error copied to clipboard:", fullError)
                    },
                  },
                })
                
                // Don't close controller on error - let finish chunk close it
                // This prevents the "stream already closed" error
              }

              // Try to enqueue, but don't crash if stream is already closed
              try {
                controller.enqueue(chunk)
              } catch (e) {
                // Stream is already closed - this is expected after an error
                if (e instanceof TypeError && e.message.includes("closed")) {
                  console.warn(`[SD] R:ENQUEUE_SKIP sub=${subId} type=${chunk.type} - stream already closed (expected after error)`)
                  return
                }
                // Other errors should be logged
                console.error(`[SD] R:ENQUEUE_ERR sub=${subId} type=${chunk.type} n=${chunkCount} err=${e}`)
              }

              if (chunk.type === "finish") {
                console.log(`[SD] R:FINISH sub=${subId} n=${chunkCount}`)
                try {
                  controller.close()
                } catch {
                  // Already closed
                }
              }
            },
            onError: (err: Error) => {
              subscriptionError = err
              console.error(`[SD] R:ERROR sub=${subId} n=${chunkCount} last=${lastChunkType} subscriptionCreated=${subscriptionCreated}`)
              console.error(`[SD] R:ERROR_MESSAGE sub=${subId}:`, err.message)
              console.error(`[SD] R:ERROR_STACK sub=${subId}:`, err.stack)
              console.error(`[SD] R:ERROR_FULL sub=${subId}:`, err)
              
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
                  chunkCount,
                  lastChunkType,
                  subscriptionCreated,
                },
              })

              // Show user-friendly error toast with full error details
              const errorDetails = err.message || err.toString() || "Unknown error"
              toast.error("Claude connection error", {
                description: `${errorDetails}${subscriptionCreated ? "" : " (subscription never received data)"}`,
                duration: 10000,
                action: {
                  label: "Copy error",
                  onClick: () => {
                    navigator.clipboard.writeText(`Error: ${errorDetails}\nStack: ${err.stack || "No stack"}`)
                  },
                },
              })

              // Only error the controller if it's not already closed
              try {
                controller.error(err)
              } catch (e) {
                console.error(`[SD] R:ERROR_CONTROLLER_ALREADY_CLOSED sub=${subId}`, e)
              }
            },
            onComplete: () => {
              console.log(`[SD] R:COMPLETE sub=${subId} n=${chunkCount} last=${lastChunkType}`)
              // Note: Don't clear pending questions here - let active-chat.tsx handle it
              // via the stream stop detection effect. Clearing here causes race conditions
              // where sync effect immediately restores from messages.
              try {
                controller.close()
              } catch {
                // Already closed
              }
            },
          },
        )

        // Handle abort
        options.abortSignal?.addEventListener("abort", () => {
          console.log(`[SD] R:ABORT sub=${subId} n=${chunkCount} last=${lastChunkType}`)
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
