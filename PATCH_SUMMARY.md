# Claude Fixes Patch - Updated for v0.0.19

## Status: ✅ Merged with upstream v0.0.19

Successfully merged upstream changes while preserving all Claude fixes.

## What Was Merged

**Upstream v0.0.19 features (kept):**
- Tool mentions support (`@[tool:name]`)
- MCP servers integration from `~/.claude.json`
- Other upstream improvements

**Our fixes (preserved):**
- ✅ CWD path resolution (relative → absolute)
- ✅ Worktree fallback (uses project path if worktree missing)
- ✅ Windows binary download (version 2.0.61, correct URL `claude.exe`)
- ✅ Worktree creation (uses `os.homedir()` for Windows)

## Files Modified

1. `src/main/lib/trpc/routers/claude.ts` - CWD validation + worktree fallback
2. `src/main/lib/git/worktree.ts` - Use `os.homedir()` instead of `process.env.HOME`
3. `scripts/download-claude-binary.mjs` - Windows version 2.0.61 + `claude.exe` URL
4. `.github/workflows/build-windows.yml` - Add binary download step

## Patch Files

- `claude-fixes-updated.patch` - Patch against upstream v0.0.19 (411 lines)
- `claude-essential-fixes.patch` - Original patch (may not apply cleanly to v0.0.19)
- `MANUAL_PATCH_GUIDE.md` - Step-by-step manual instructions

## To Apply on Next Update

```bash
# After pulling latest upstream
git fetch upstream
git merge upstream/main

# Apply the updated patch
git apply claude-fixes-updated.patch

# Or follow MANUAL_PATCH_GUIDE.md for manual changes
```

## Verification

All essential fixes verified:
- CWD validation: ✅ Present
- Worktree fallback: ✅ Present  
- Windows binary version: ✅ 2.0.61
- Windows binary URL: ✅ claude.exe
- Worktree os.homedir: ✅ Present

Build status: ✅ Successful
