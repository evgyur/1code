# 1Code

[1Code.dev](https://1code.dev)

Best UI for Claude Code with local and remote agent execution.

By [21st.dev](https://21st.dev) team

> **Platforms:** macOS, Linux, and Windows. Windows support improved thanks to community contributions from [@jesus-mgtc](https://github.com/jesus-mgtc) and [@evgyur](https://github.com/evgyur).

## Features

### Run Claude agents the right way

Run agents locally, in worktrees, in background — without touching main branch.

![Worktree Demo](assets/worktree.gif)

- **Git Worktree Isolation** - Each chat session runs in its own isolated worktree
- **Background Execution** - Run agents in background while you continue working
- **Local-first** - All code stays on your machine, no cloud sync required
- **Branch Safety** - Never accidentally commit to main branch

---

### UI that finally respects your code

Cursor-like UI for Claude Code with diff previews, built-in git client, and the ability to see changes before they land.

![Cursor UI Demo](assets/cursor-ui.gif)

- **Diff Previews** - See exactly what changes Claude is making in real-time
- **Built-in Git Client** - Stage, commit, and manage branches without leaving the app
- **Change Tracking** - Visual diffs and PR management
- **Real-time Tool Execution** - See bash commands, file edits, and web searches as they happen

---

### Plan mode that actually helps you think

Claude asks clarifying questions, builds structured plans, and shows clean markdown preview — all before execution.

![Plan Mode Demo](assets/plan-mode.gif)

- **Clarifying Questions** - Claude asks what it needs to know before starting
- **Structured Plans** - See step-by-step breakdown of what will happen
- **Clean Markdown Preview** - Review plans in readable format
- **Review Before Execution** - Approve or modify the plan before Claude acts

---

### More Features

- **Plan & Agent Modes** - Read-only analysis or full code execution permissions
- **Project Management** - Link local folders with automatic Git remote detection
- **Integrated Terminal** - Full terminal access within the app

## Installation

### Option 1: Build from source (free)

#### macOS/Linux

```bash
# Prerequisites: Bun, Python, Xcode Command Line Tools (macOS)
bun install
bun run claude:download  # Download Claude binary (required!)
bun run build
bun run package:mac  # or package:linux
```

#### Windows

This fork includes Windows-specific patches. To build on Windows:

```bash
# Prerequisites: Node.js, Python 3.11+ with setuptools
npm install --legacy-peer-deps --ignore-scripts
npm run claude:download  # Download Claude binary (required! Auto-downloads 2.1.8+ with Windows support)
npm run build
npm run package:win
```

> **Important:** The `claude:download` step downloads the Claude CLI binary which is required for the agent chat to work. If you skip this step, the app will build but agent functionality won't work.
>
> **Windows Note:** This fork automatically downloads Claude Code version 2.1.8+ (latest with Windows support). All Windows patches are already applied in the codebase.

### Option 2: Subscribe to 1code.dev (recommended)

Get pre-built releases + background agents support by subscribing at [1code.dev](https://1code.dev).

Your subscription helps us maintain and improve 1Code.

## Development

#### macOS/Linux

```bash
bun install
bun run claude:download  # First time only
bun run dev
```

#### Windows

```bash
npm install --legacy-peer-deps --ignore-scripts
npm run claude:download  # First time only
npm run dev
```

## How to Use 1Code

### First Time Setup

1. **Launch the application**:
   - Run the executable (`1Code.exe` on Windows, or `1Code.app` on macOS)
   - Or run `bun run dev` for development mode

2. **Sign in to 21st.dev**:
   - On first launch, you'll be prompted to sign in
   - This authenticates you with the 1Code service

3. **Connect Claude Code** (Required for AI features):
   - Go to **Settings** → **Profile** tab
   - Find the "Claude Code" section
   - Click **"Connect"** button
   - Follow the OAuth flow to authenticate with Claude Code
   - Your token is stored securely locally (encrypted)

### Creating Your First Chat

1. **Create or select a project**:
   - Click **"New Project"** or select an existing one
   - Choose a local folder on your computer
   - The app will detect Git remotes automatically

2. **Start a new chat**:
   - Click **"New Chat"** button
   - Choose between:
     - **Agent Mode**: Full code execution permissions (can edit files, run commands)
     - **Plan Mode**: Read-only analysis (creates plans without executing)

3. **Interact with Claude**:
   - Type your request in the chat input
   - Use `@` to mention files or tools
   - Use `/` for commands (e.g., `/plan`, `/agent`, `/clear`)
   - Watch real-time tool execution (bash commands, file edits, etc.)

### Key Features

- **File Mentions**: Type `@filename` to reference files in your project
- **Slash Commands**: 
  - `/plan` - Switch to plan mode
  - `/agent` - Switch to agent mode
  - `/clear` - Clear chat history
- **Context Window Indicator**: Shows token usage (click to compact if needed)
- **Sub-chats**: Create multiple conversation threads in the same project
- **Git Worktrees**: Each chat runs in an isolated worktree for safety

### Modes Explained

**Plan Mode** (Read-only):
- Claude analyzes code and creates plans
- No file modifications or command execution
- Safe for exploring codebases

**Agent Mode** (Full permissions):
- Claude can edit files, run commands, search the web
- Real-time execution visible in the UI
- Use with caution on important projects

### Troubleshooting

**"Claude Code not connected"**:
- Go to Settings → Profile → Claude Code section
- Click "Connect" and complete OAuth flow
- Ensure you have a valid Claude Code account

**Agent features not working**:
- Verify Claude Code is connected (Settings → Profile)
- Check that `claude.exe` binary is downloaded (`resources/bin/win32-x64/claude.exe`)
- Restart the application

**Build/package issues**:
- See [Merging Upstream Updates](#merging-upstream-updates) section for common issues
- Ensure all dependencies are installed: `npm install --legacy-peer-deps --ignore-scripts`

## Feedback & Community

Join our [Discord](https://discord.gg/8ektTZGnj4) for support and discussions.

## Windows Support

This repository is a **fork with Windows-specific patches** that enable full Windows support:

- ✅ **Windows frame preference** - Native or frameless window option
- ✅ **CWD resolution** - Proper path handling using `os.homedir()`
- ✅ **Windows binary support** - Automatic download of Claude Code 2.1.8+ (latest with Windows support)
- ✅ **Binary URL fix** - Correct `claude.exe` URL handling for Windows

All patches are already applied in the codebase. When you clone this repository and run `npm run claude:download`, it will automatically download the correct Windows-compatible version.

## Merging Upstream Updates

This repository is a fork with Windows-specific patches. When merging updates from upstream (`21st-dev/1code`), follow this guide to avoid common issues.

### Pre-Merge Checklist

1. **Stash local changes**:
   ```bash
   git stash push -m "Local changes before merge"
   ```

2. **Fetch latest upstream**:
   ```bash
   git fetch upstream
   ```

3. **Check merge base**:
   ```bash
   git merge-base HEAD upstream/main
   ```

### Merge Process

```bash
# Merge upstream
git merge upstream/main --no-edit
```

### Common Merge Conflicts & Resolutions

#### 1. `src/main/windows/main.ts`
**Conflict**: Windows frame preference handlers vs upstream's `app:isPackaged` handler

**Resolution**: Keep BOTH - add upstream's handler AND preserve local Windows frame handlers:
```typescript
ipcMain.handle("app:version", () => app.getVersion())
ipcMain.handle("app:isPackaged", () => app.isPackaged)  // From upstream

// Window frame preference (local Windows feature)
ipcMain.handle("window:set-frame-preference", ...)
ipcMain.handle("window:get-frame-state", ...)
```

#### 2. `src/renderer/features/agents/main/active-chat.tsx`
**Conflict**: Old inline input code vs upstream's `ChatInputArea` component refactor

**Resolution**: Accept upstream's refactor completely. Remove ALL old input code (lines with `<<<<<<< HEAD` through the old input div). Keep only:
```typescript
<ChatInputArea
  editorRef={editorRef}
  // ... all props
/>
```

**⚠️ CRITICAL**: After resolving, search for leftover conflict markers:
```bash
grep -r "<<<<<<< HEAD" src/
grep -r "=======" src/
grep -r ">>>>>>> upstream" src/
```

#### 3. `src/renderer/features/agents/ui/agent-context-indicator.tsx`
**Conflict**: Local token calculation from messages vs upstream's `tokenData` prop

**Resolution**: Accept upstream's simpler approach. Remove all local calculation logic and use:
```typescript
interface AgentContextIndicatorProps {
  tokenData: MessageTokenData  // From upstream
  // ... other props
}
```

### Post-Merge Verification

1. **Check for leftover conflict markers**:
   ```bash
   git diff --check
   # Fix any trailing whitespace issues
   ```

2. **Verify patches are still applied**:
   - Check `src/main/lib/trpc/routers/claude.ts` for CWD resolution
   - Check `src/main/lib/git/worktree.ts` for `os.homedir()` usage
   - Check `scripts/download-claude-binary.mjs` for Windows version handling (uses 2.1.8+ with fallback)

3. **Install dependencies** (if needed):
   ```bash
   npm install --legacy-peer-deps --ignore-scripts
   ```

4. **Build and test**:
   ```bash
   npm run build
   npm run package
   ```

### Common Issues After Merge

#### Issue: Build fails with "Expected identifier but found '<'"
**Cause**: Leftover merge conflict marker (`<<<<<<< HEAD`)

**Fix**: Search and remove all conflict markers:
```bash
grep -r "<<<<<<< HEAD" src/
# Manually remove conflict sections
```

#### Issue: Build fails with "Rollup failed to resolve import 'marked'"
**Cause**: Missing dependencies after merge

**Fix**: Install dependencies:
```bash
npm install --legacy-peer-deps --ignore-scripts
```

#### Issue: Trailing whitespace warnings
**Fix**: Clean up whitespace:
```bash
git diff --check
# Fix files manually or use: git diff --check | grep trailing
```

### Merge History

#### v0.0.22 → v0.0.24 (2026-01-XX)

**Conflicts Resolved**:
- ✅ `scripts/download-claude-binary.mjs` - Preserved Windows binary URL fix (claude.exe)
- ✅ `src/preload/index.ts` - Merged Git watcher APIs from upstream
- ✅ `src/renderer/features/agents/main/active-chat.tsx` - Accepted upstream's keep-alive tabs refactor
- ✅ `bun.lock` - Accepted upstream version

**Updates**:
- Updated Windows version handling: now uses 2.1.8+ (latest with Windows support) instead of hardcoded 2.0.61
- Added automatic Windows support verification before downloading

**Patches Status**: All Windows patches preserved:
- ✅ Windows frame preference handlers in `main.ts`
- ✅ CWD resolution using `os.homedir()` in `claude.ts` and `worktree.ts`
- ✅ Windows binary URL fix (claude.exe) in `download-claude-binary.mjs`

#### v0.0.19 → v0.0.22 (2026-01-18)

**Conflicts Resolved**:
- ✅ `src/main/windows/main.ts` - Preserved Windows frame handlers
- ✅ `src/renderer/features/agents/main/active-chat.tsx` - Accepted ChatInputArea refactor
- ✅ `src/renderer/features/agents/ui/agent-context-indicator.tsx` - Accepted tokenData approach

**Issues Encountered**:
1. Leftover conflict marker in `active-chat.tsx` caused build failure
2. Missing `marked` dependency required `npm install`
3. Trailing whitespace in `package-windows.mjs`

**Patches Status**: All Windows patches (Claude fixes) were already present in codebase, no re-application needed.

## License

Apache License 2.0 - see [LICENSE](LICENSE) for details.
