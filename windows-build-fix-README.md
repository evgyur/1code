# Windows Build Fix Patch

This patch enables building 1Code for Windows **without requiring Visual Studio Build Tools**.

## What This Patch Does

1. **Fixes duplicate "win" key in package.json** - Removes the duplicate Windows build configuration
2. **Disables npmRebuild** - Sets `npmRebuild: false` to use pre-built native modules instead of compiling them
3. **Updates BUILD_WINDOWS.md** - Adds comprehensive documentation on:
   - Step-by-step build process
   - How 1Code.exe is created
   - Building without Visual Studio Build Tools
   - Troubleshooting guide

## How to Apply This Patch

### Prerequisites
- Git installed
- Cloned repository: `https://github.com/21st-dev/1code`

### Apply the Patch

```bash
cd 1code
git apply windows-build-fix.patch
```

Or if you want to test first (dry-run):

```bash
git apply --check windows-build-fix.patch
```

### Verify the Changes

After applying, you should see:
- `package.json` has `"npmRebuild": false` (line 125)
- `package.json` has no duplicate "win" key
- `BUILD_WINDOWS.md` has updated build instructions

## Building After Applying the Patch

1. Install dependencies (skip native module compilation):
   ```powershell
   bun install --ignore-scripts
   ```

2. Download Claude binary:
   ```powershell
   bun run claude:download
   ```

3. Build the application:
   ```powershell
   bun run build
   ```

4. Package for Windows:
   ```powershell
   bun run package
   ```

The executable will be created at: `release/win-unpacked/1Code.exe`

## Why This Works

- `better-sqlite3` and `node-pty` include pre-built binaries for Windows
- By setting `npmRebuild: false`, electron-builder uses these pre-built modules
- No Visual Studio Build Tools are needed for compilation

## Compatibility

This patch should work with future versions of the repository as long as:
- The `package.json` structure remains similar
- The `BUILD_WINDOWS.md` file exists (or can be created)

If the patch fails to apply due to conflicts, you can manually apply the changes:
1. Set `"npmRebuild": false` in `package.json` → `build` section
2. Remove duplicate `"win"` key if it exists
3. Update `BUILD_WINDOWS.md` with the new documentation

## Files Modified

- `package.json` - Build configuration changes
- `BUILD_WINDOWS.md` - Updated build documentation
