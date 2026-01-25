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

## v0.0.44 re-apply (after merge)

For **v0.0.44**, the following must be re-applied after taking upstream as base (upstream does not include them):

1. **`src/main/lib/trpc/routers/claude.ts`** — CWD resolution (`path.resolve(os.homedir(), input.cwd)` for relative paths) and worktree fallback (chat → project → `project.path` from DB when `fs.stat(resolvedCwd)` fails).
2. **`src/main/lib/claude/transform.ts`** — Token usage in `msg.type === "result"`: `usage` / `usage_info`, `modelUsage` (sum over models), fallbacks for `inputTokens`/`outputTokens`, and `inputTokens ?? 0`, `outputTokens ?? 0`, `totalTokens`.
3. **`scripts/download-claude-binary.mjs`** — On 404: explicit error and `if (fs.existsSync(destPath)) fs.unlinkSync(destPath)` before `reject`. On non-200 and on redirect/stream errors: `existsSync` before `unlinkSync`.

**Already in upstream (no re-apply):** Windows frame preference (`window:set-frame-preference`, `window:get-frame-state`, `getUseNativeFramePreference`), `claude.exe` in `PLATFORMS["win32-x64"].binary`, `app:isPackaged`.
