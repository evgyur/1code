# Upstream Sync Guide

This repository tracks `21st-dev/1code` with additional Windows fixes.

## Remotes

```bash
git remote add upstream https://github.com/21st-dev/1code.git
```

## Sync upstream into main

```bash
git fetch upstream
git checkout main
git merge upstream/main
git push origin main
```

## Release flow

Use the helper script:

```bash
npm run release:portable
```

This will:
1) Fetch upstream
2) Merge upstream/main into current main
3) Build + package portable
4) Tag and push the release

## Notes

- If you have local fixes, make sure they are committed before syncing.
- If conflicts appear, resolve them and continue with the merge before releasing.

## Re-apply after merge (evgyur fixes, Feb 2026)

After taking upstream as base, re-apply the following (upstream does not include them):

1. **`src/main/lib/trpc/routers/claude.ts`** — CWD resolution (`path.resolve(os.homedir(), input.cwd)` for relative paths); UNC retry (paths starting with `\\`: retry `fs.stat` once after 500ms); CWD sanitization for session path (`input.cwd.replace(/[/\\\\.:]/g, "-")`); worktree fallback (chat → project → `project.path` from DB when stat fails); PROCESS_CRASH diagnostic (when no stderr, spawn binary `--version` with same cwd/env, capture stdout/stderr, set `diagnosticOutput`); `import { spawn } from "node:child_process"`.
2. **`src/main/lib/claude/transform.ts`** — Token usage in `msg.type === "result"`: `usage` / `usage_info`, `modelUsage` (sum over models), fallbacks for `inputTokens`/`outputTokens`, and `inputTokens ?? 0`, `outputTokens ?? 0`, `totalTokens`.
3. **`scripts/download-claude-binary.mjs`** — On 404: explicit error and `if (fs.existsSync(destPath)) fs.unlinkSync(destPath)` before `reject`. On non-200 and on redirect/stream errors: `existsSync` before `unlinkSync`.
4. **`src/main/index.ts`** — Auth server started **after** single-instance lock and app ready; `reuseAddress: true` on listen; on EADDRINUSE show dialog and quit.
5. **`src/main/lib/trpc/routers/projects.ts`** — openFolder: use `getWindowForDialog(ctx)`; on Windows dialog without parent + `setAlwaysOnTop(true, "floating")`; import windowManager directly.
6. **`src/renderer/features/agents/lib/ipc-chat-transport.ts`** — errorDetails: put `diagnosticOutput` first when present; PROCESS_CRASH toast 20s + description hint (Copy Error, run 1Code from terminal for main logs).

**Build:** Use `npm run package` (package-windows.mjs) for Windows unpacked so better-sqlite3 is copied correctly; avoid `npm run package:win` for unpacked.

**Already in upstream (no re-apply):** Windows frame preference, `claude.exe` in `PLATFORMS["win32-x64"].binary`, `app:isPackaged`.
