export const CLAUDE_MODELS = [
  { id: "opus", name: "Opus" },
  { id: "sonnet", name: "Sonnet" },
  { id: "haiku", name: "Haiku" },
  { id: "kimi", name: "Kimi" },
]

/** Claude model ids (excludes third-party like Kimi) for version label e.g. "4.5" */
export const CLAUDE_MODEL_IDS = ["opus", "sonnet", "haiku"]
