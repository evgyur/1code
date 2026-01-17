# 1Code

[1Code.dev](https://1code.dev)

Best UI for Claude Code with local and remote agent execution.

By [21st.dev](https://21st.dev) team

> **Note:** Currently tested on macOS and Linux. Windows support is experimental and may have issues.

## Features

- **Plan & Agent Modes** - Read-only analysis or full code execution permissions
- **Project Management** - Link local folders with automatic Git remote detection
- **Real-time Tool Execution** - See bash commands, file edits, and web searches as they happen
- **Git Worktree Isolation** - Each chat session runs in its own isolated worktree
- **Integrated Terminal** - Full terminal access within the app
- **Change Tracking** - Visual diffs and PR management

## Installation

### Option 1: Build from source (free)

```bash
# Prerequisites: Bun, Python, Xcode Command Line Tools (macOS)
bun install
bun run claude:download  # Download Claude binary (required!)
bun run build
bun run package:mac  # or package:win, package:linux
```

> **Important:** The `claude:download` step downloads the Claude CLI binary which is required for the agent chat to work. If you skip this step, the app will build but agent functionality won't work.

### Option 2: Subscribe to 1code.dev (recommended)

Get pre-built releases + background agents support by subscribing at [1code.dev](https://1code.dev).

Your subscription helps us maintain and improve 1Code.

## Development

```bash
bun install
bun run claude:download  # First time only
bun run dev
```

## Feedback & Community

Join our [Discord](https://discord.gg/8ektTZGnj4) for support and discussions.

## License

Apache License 2.0 - see [LICENSE](LICENSE) for details.
