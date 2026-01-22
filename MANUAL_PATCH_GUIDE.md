# Manual Patch Guide for Claude Fixes

Since the patch may not apply cleanly due to upstream changes, here are the manual changes needed:

## 1. Fix CWD Path Resolution (`src/main/lib/trpc/routers/claude.ts`)

**Find:** The CWD validation section (around line 247-268)

**Replace with:**
```typescript
// Early validation - check cwd exists before doing anything
console.error(`[BACKEND] Step 1: Validating CWD...`)
console.error(`[BACKEND] Original CWD: ${input.cwd}`)

// Resolve relative paths to absolute
let resolvedCwd: string
try {
  if (path.isAbsolute(input.cwd)) {
    resolvedCwd = input.cwd
  } else {
    // Resolve relative to user's home directory (worktrees are in ~/.21st/worktrees)
    const homeDir = os.homedir()
    resolvedCwd = path.resolve(homeDir, input.cwd)
  }
  console.error(`[BACKEND] Resolved CWD: ${resolvedCwd}`)
} catch (resolveError) {
  const errorMsg = resolveError instanceof Error ? resolveError.message : String(resolveError)
  console.error(`[BACKEND] ✗ CWD RESOLUTION FAILED: ${errorMsg}`)
  emitError(new Error(`Failed to resolve CWD path: ${input.cwd} - ${errorMsg}`), "Workspace path resolution error")
  safeEmit({ type: "finish" } as UIMessageChunk)
  safeComplete()
  return
}

try {
  const cwdStat = await fs.stat(resolvedCwd)
  if (!cwdStat.isDirectory()) {
    console.error(`[BACKEND] ✗ CWD VALIDATION FAILED: Not a directory`)
    emitError(new Error(`CWD is not a directory: ${resolvedCwd}`), "Invalid workspace path")
    safeEmit({ type: "finish" } as UIMessageChunk)
    safeComplete()
    return
  }
  console.error(`[BACKEND] ✓ CWD VALIDATED: ${resolvedCwd}`)
  
  // Update input.cwd to the resolved absolute path for use in query
  input.cwd = resolvedCwd
} catch (cwdError) {
  const errorMsg = cwdError instanceof Error ? cwdError.message : String(cwdError)
  console.error(`[BACKEND] ✗ CWD VALIDATION FAILED: ${errorMsg}`)
  console.error(`[BACKEND] Original CWD: ${input.cwd}`)
  console.error(`[BACKEND] Resolved CWD: ${resolvedCwd}`)
  console.error(`[BACKEND] Error Details:`, cwdError)
  
  // Try to get project path from database as fallback
  try {
    console.error(`[BACKEND] Attempting fallback: Getting project path from database...`)
    const db = getDatabase()
    const chat = db.select().from(chats).where(eq(chats.id, input.chatId)).get()
    if (chat?.projectId) {
      const project = db.select().from(projects).where(eq(projects.id, chat.projectId)).get()
      if (project?.path) {
        const projectPathExists = await fs.stat(project.path).then(() => true).catch(() => false)
        if (projectPathExists) {
          console.error(`[BACKEND] ✓ Found project path: ${project.path}`)
          resolvedCwd = project.path
          input.cwd = project.path
          console.error(`[BACKEND] Using project path as fallback (worktree missing)`)
        } else {
          throw new Error(`Project path exists in DB but is inaccessible: ${project.path}`)
        }
      } else {
        throw new Error(`Project not found in database`)
      }
    } else {
      throw new Error(`Chat has no projectId`)
    }
  } catch (fallbackError) {
    const fallbackMsg = fallbackError instanceof Error ? fallbackError.message : String(fallbackError)
    console.error(`[BACKEND] ✗ Fallback failed: ${fallbackMsg}`)
    emitError(new Error(`CWD does not exist or is inaccessible: ${resolvedCwd} (original: ${input.cwd}) - ${errorMsg}\n\nWorktree may have been deleted. Please recreate the workspace.`), "Workspace path error")
    safeEmit({ type: "finish" } as UIMessageChunk)
    safeComplete()
    return
  }
}
```

**Also add import at top:**
```typescript
import { chats, claudeCodeCredentials, getDatabase, projects, subChats } from "../../db"
```

## 2. Fix Worktree Creation (`src/main/lib/git/worktree.ts`)

**Find:** Line ~908 where it uses `process.env.HOME`

**Replace:**
```typescript
const worktreesDir = join(process.env.HOME || "", ".21st", "worktrees");
```

**With:**
```typescript
const homeDir = os.homedir();
const worktreesDir = join(homeDir, ".21st", "worktrees");
```

**Add import at top:**
```typescript
import * as os from "node:os";
```

## 3. Fix Windows Binary Download (`scripts/download-claude-binary.mjs`)

**Find:** The version detection section (around line 243-255)

**Replace:**
```javascript
// Get version
const version = specifiedVersion || (await getLatestVersion())
console.log(`Version: ${version}`)
```

**With:**
```javascript
// Get version - for Windows, use known working version since 2.1.5 doesn't have Windows binaries
const currentPlatform = downloadAll ? null : `${process.platform}-${process.arch}`
let version = specifiedVersion

if (!version) {
  if (currentPlatform === "win32-x64") {
    // Windows: use known working version (2.1.5 doesn't have Windows binaries)
    console.log("Windows detected - using known working version 2.0.61")
    version = "2.0.61"
  } else {
    version = await getLatestVersion()
  }
}

console.log(`Version: ${version}`)
```

**Find:** The download URL construction (around line 177)

**Replace:**
```javascript
const downloadUrl = `${DIST_BASE}/${version}/${platform.dir}/claude`
```

**With:**
```javascript
// For Windows, the URL needs to use 'claude.exe', not 'claude'
// For other platforms, it's just 'claude'
const binaryUrlName = platformKey === "win32-x64" ? "claude.exe" : "claude"
const downloadUrl = `${DIST_BASE}/${version}/${platform.dir}/${binaryUrlName}`
```

## 4. Add Windows Build Workflow (`.github/workflows/build-windows.yml`)

Create this file if it doesn't exist. See `claude-essential-fixes.patch` for the full workflow file.

**Key addition:** Add this step after "Install dependencies":
```yaml
- name: Download Claude binary
  run: |
    echo "Downloading Claude binary for Windows..."
    echo "Node version: $(node --version)"
    echo "Bun version: $(bun --version)"
    node scripts/download-claude-binary.mjs
    if ($LASTEXITCODE -ne 0) {
      echo "✗ Download script failed with exit code $LASTEXITCODE"
      exit 1
    }
    if (Test-Path "resources\bin\win32-x64\claude.exe") {
      echo "✓ Binary downloaded successfully"
      $file = Get-Item "resources\bin\win32-x64\claude.exe"
      echo "File size: $($file.Length) bytes"
    } else {
      echo "✗ Binary not found after download"
      exit 1
    }
```

## Summary

These 4 changes fix:
1. ✅ CWD path resolution (relative → absolute)
2. ✅ Worktree fallback (use project path if worktree missing)
3. ✅ Windows binary download (version 2.0.61, correct URL)
4. ✅ CI/CD workflow (download binary before build)
