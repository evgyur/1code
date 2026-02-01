# Claude Fixes Patch - Updated Feb 2026

## Status: ✅ Evgyur fixes applied (2026-02-01)

Fixes for EADDRINUSE, folder dialog, CWD/UNC, PROCESS_CRASH diagnostic, and Copy Error. Use this as reference for next /1codeupd.

## Re-apply After Merge

After merging upstream, re-apply manually (patches may not apply cleanly):

1. **`src/main/lib/trpc/routers/claude.ts`** — CWD resolution; **UNC retry** (paths starting with `\\`: retry fs.stat once after 500ms); **CWD sanitization** (`input.cwd.replace(/[/\\\\.:]/g, "-")` for session path); worktree fallback (project.path from DB); **PROCESS_CRASH diagnostic** (spawn binary `--version`, same cwd/env, capture stdout/stderr, set diagnosticOutput); `import { spawn } from "node:child_process"`.
2. **`src/main/lib/claude/transform.ts`** — Token usage in `msg.type === "result"`: `usage`/`usage_info`, `modelUsage` (sum), fallbacks, `inputTokens ?? 0`, `outputTokens ?? 0`, `totalTokens`. See `token-usage-fix-complete.patch` or `token-usage-fix.patch`.
3. **`scripts/download-claude-binary.mjs`** — 404: `if (fs.existsSync(destPath)) fs.unlinkSync(destPath)` before reject; same for non-200 and for redirect/stream error handlers.
4. **`src/main/index.ts`** — Auth server **after** single-instance lock and app ready; `reuseAddress: true`; on EADDRINUSE dialog and quit.
5. **`src/main/lib/trpc/routers/projects.ts`** — openFolder: getWindowForDialog; Windows: dialog without parent + setAlwaysOnTop; windowManager import.
6. **`src/renderer/features/agents/lib/ipc-chat-transport.ts`** — errorDetails with diagnosticOutput first; PROCESS_CRASH 20s toast + Copy Error/main-logs hint.

**Build:** Use `npm run package` (package-windows.mjs) for Windows unpacked; avoid `npm run package:win` for unpacked (better-sqlite3).

**Already in upstream (no re-apply):** Windows frame preference, `claude.exe` in PLATFORMS, `app:isPackaged`, `worktree.ts` homedir.

## Our Fixes (preserved or re-applied)

- ✅ CWD resolution + UNC retry + CWD sanitization + worktree fallback + PROCESS_CRASH diagnostic — `claude.ts`
- ✅ Token usage — `transform.ts`
- ✅ 404 + existsSync before unlink — `download-claude-binary.mjs`
- ✅ EADDRINUSE + auth server order — `main/index.ts`
- ✅ Folder dialog (getWindowForDialog, Windows setAlwaysOnTop) — `projects.ts`
- ✅ Copy Error + diagnosticOutput + PROCESS_CRASH toast — `ipc-chat-transport.ts`
- ✅ `package` → package-windows.mjs, build.win, etc.

## Patch Files (reference)

- `token-usage-fix-complete.patch`, `token-usage-fix.patch` — for `transform.ts`
- `claude-fixes-updated.patch`, `claude-essential-fixes.patch` — older; may not apply
- `MANUAL_PATCH_GUIDE.md` — manual steps
- **1codeupd skill:** `d:\.github\.cursor\skills\1codeupd\SKILL.md` — full verify/re-apply list for next update
