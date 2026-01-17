# How to Apply Claude Fixes Patch

This patch contains essential fixes for Claude AI integration on Windows:

1. **CWD Path Resolution** - Fixes relative path handling for worktrees
2. **Worktree Fallback** - Uses project path when worktree is missing
3. **Windows Binary Download** - Fixes version and URL for Windows builds
4. **Build Workflow** - Adds binary download step to Windows CI

## To Apply:

```bash
# Make sure you're on the latest main branch
git checkout main
git pull origin main

# Apply the patch
git apply claude-essential-fixes.patch

# If there are conflicts, resolve them and then:
git add -A
git commit -m "Apply Claude fixes: CWD resolution, worktree fallback, Windows binary download"
```

## Files Modified:

- `src/main/lib/trpc/routers/claude.ts` - CWD resolution and worktree fallback
- `src/main/lib/git/worktree.ts` - Use os.homedir() for Windows
- `scripts/download-claude-binary.mjs` - Windows version and URL fixes
- `.github/workflows/build-windows.yml` - Add binary download step

## What These Fixes Do:

1. **CWD Resolution**: Resolves relative worktree paths (`.21st\worktrees\...`) to absolute paths using home directory
2. **Worktree Fallback**: If worktree doesn't exist, automatically falls back to project path from database
3. **Windows Binary**: Uses version 2.0.61 (has Windows support) and correct URL (`claude.exe` not `claude`)
4. **CI/CD**: Downloads Claude binary before building Windows package
