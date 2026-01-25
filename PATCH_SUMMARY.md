# Claude Fixes Patch - Updated for v0.0.44

## Status: ✅ Merged with upstream v0.0.44 (2026-01-25)

Successfully merged upstream v0.0.44 while preserving our Windows and Claude fixes.

## v0.0.44 — Re-apply After Merge

For **v0.0.44**, re-apply manually (patches may not apply cleanly):

1. **`src/main/lib/trpc/routers/claude.ts`** — CWD resolution (`path.resolve(os.homedir(), input.cwd)`) and worktree fallback (project.path from DB when `fs.stat(resolvedCwd)` fails).
2. **`src/main/lib/claude/transform.ts`** — Token usage in `msg.type === "result"`: `usage`/`usage_info`, `modelUsage` (sum), fallbacks, `inputTokens ?? 0`, `outputTokens ?? 0`, `totalTokens`. See `token-usage-fix-complete.patch` or `token-usage-fix.patch`.
3. **`scripts/download-claude-binary.mjs`** — 404: `if (fs.existsSync(destPath)) fs.unlinkSync(destPath)` before reject; same for non-200 and for redirect/stream error handlers.

**Already in upstream (no re-apply):** Windows frame preference, `claude.exe` in PLATFORMS, `app:isPackaged`, `worktree.ts` homedir.

## What Was Merged (v0.0.44)

**Upstream v0.0.44 (kept):** multi-window (windowManager, createWindow, getWindowFromEvent), MCP OAuth, human-readable worktrees, slash-command fixes, voice, kanban, details-sidebar, and related refactors.

**Our fixes (preserved or re-applied):**
- ✅ CWD resolution + worktree fallback — `claude.ts`
- ✅ Token usage (usage, usage_info, modelUsage, fallbacks) — `transform.ts`
- ✅ 404 + `existsSync` before unlink — `download-claude-binary.mjs`
- ✅ `worktree.ts` — `homedir()` for worktreesDir (in upstream)
- ✅ `package` → `package-windows.mjs`, `package:win:portable`, `release:portable`, `build.win`, `build-windows.yml`, `release-portable.yml`

## Files Modified (v0.0.44)

1. `src/main/lib/trpc/routers/claude.ts` — CWD validation + worktree fallback (re-applied)
2. `src/main/lib/claude/transform.ts` — Token usage (re-applied)
3. `src/main/lib/git/worktree.ts` — `homedir()` (already in upstream)
4. `scripts/download-claude-binary.mjs` — 404+existsSync, platform.binary, 2.1.17/2.1.8 (re-applied)
5. `package.json` — our `package`, `package:win:portable`, `release:portable`, `build.win`
6. `.github/workflows/build-windows.yml`, `release-portable.yml` — ours

## Patch Files (reference)

- `token-usage-fix-complete.patch`, `token-usage-fix.patch` — for `transform.ts`
- `claude-fixes-updated.patch`, `claude-essential-fixes.patch` — older; may not apply to v0.0.44
- `MANUAL_PATCH_GUIDE.md` — manual steps

## Verification (v0.0.44)

- CWD + worktree fallback: ✅
- Token usage (usage_info, modelUsage): ✅
- Download 404+existsSync: ✅
- worktree homedir: ✅
- Frame preference, claude.exe: ✅ (upstream)
- Build and package: ✅
