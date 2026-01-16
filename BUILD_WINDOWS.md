# Building 1Code for Windows

## Issue: Cross-Compilation Limitation

Building Windows packages from Linux/WSL is not supported because the project uses native modules (`better-sqlite3` and `node-pty`) that require platform-specific compilation.

## Solutions

### Option 1: Build on Windows (Recommended)

1. **Clone the repository on Windows:**
   ```powershell
   git clone https://github.com/21st-dev/1code.git
   cd 1code
   ```

2. **Install Bun on Windows:**
   - Download from: https://bun.sh/
   - Or use: `powershell -c "irm bun.sh/install.ps1 | iex"`

3. **Install dependencies:**
   ```powershell
   bun install
   ```

4. **Build the app:**
   ```powershell
   bun run build
   bun run package:win
   ```

5. **Output location:**
   - Windows installer (NSIS): `release/1Code Setup 0.0.14.exe`
   - Portable version: `release/1Code-0.0.14-win.zip`

### Option 2: Use GitHub Actions / CI/CD

Create a GitHub Actions workflow to build Windows packages automatically:

```yaml
name: Build Windows
on: [push, pull_request]
jobs:
  build:
    runs-on: windows-latest
    steps:
      - uses: actions/checkout@v3
      - uses: oven-sh/setup-bun@v1
      - run: bun install
      - run: bun run build
      - run: bun run package:win
      - uses: actions/upload-artifact@v3
        with:
          name: windows-build
          path: release/*
```

### Option 3: Use Docker with Windows Container

If you have Docker Desktop with Windows containers enabled:

```dockerfile
FROM mcr.microsoft.com/windows/servercore:ltsc2022
# Install Node.js, Bun, and build tools
# Then run the build commands
```

### Option 4: Use WSL2 with Windows Access

If you're on WSL2, you can:

1. Access Windows filesystem from WSL: `/mnt/c/`
2. Copy the built source code to Windows
3. Run the build commands in Windows PowerShell

## Current Status

✅ **Source code compiled** - The TypeScript has been built successfully  
❌ **Windows packaging failed** - Native modules need Windows build environment

## Next Steps

1. **Transfer to Windows machine** or use CI/CD
2. **Run `bun run package:win`** on Windows
3. **Find installer** in `release/` directory

---

**Note:** The built source code is in `/root/github-repos/1code/out/` and can be transferred to Windows for packaging.
