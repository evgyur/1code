#!/usr/bin/env node
/**
 * Windows portable packaging script that suppresses winCodeSign extraction errors.
 * This mirrors package-windows.mjs but produces a portable .exe.
 */

import { spawn } from "child_process"
import { fileURLToPath } from "url"
import { dirname, join } from "path"
import { existsSync } from "fs"

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const projectRoot = join(__dirname, "..")

// Set environment variables to prevent code signing attempts
const env = {
  ...process.env,
  CSC_IDENTITY_AUTO_SELECT: "false",
  WIN_CSC_LINK: "",
  WIN_CSC_KEY_PASSWORD: "",
}

// Track if we detect file lock errors
let hasFileLockError = false

// Filter out winCodeSign/darwin symlink errors from output
const filterOutput = (data) => {
  const lines = data.toString().split("\n")
  const filtered = lines.filter((line) => {
    const lower = line.toLowerCase()

    // Detect file lock/overwrite errors in stdout too
    if (
      lower.includes("ebusy") ||
      lower.includes("eacces") ||
      lower.includes("eperm") ||
      lower.includes("file is in use") ||
      lower.includes("cannot overwrite") ||
      lower.includes("access is denied") ||
      lower.includes("the process cannot access the file") ||
      lower.includes("being used by another process") ||
      lower.includes("file is locked") ||
      lower.includes("cannot delete") ||
      lower.includes("sharing violation")
    ) {
      hasFileLockError = true
    }

    return (
      !lower.includes("wincodesign") &&
      !lower.includes("darwin") &&
      !lower.includes("symbolic link") &&
      !lower.includes("libcrypto.dylib") &&
      !lower.includes("libssl.dylib") &&
      !lower.includes("cannot create symbolic link")
    )
  })
  if (filtered.length > 0) {
    process.stdout.write(filtered.join("\n"))
  }
}

const electronBuilder = spawn("npx", ["electron-builder", "--win", "portable"], {
  cwd: projectRoot,
  shell: true,
  env,
})

// Filter stdout
electronBuilder.stdout?.on("data", filterOutput)

// Filter stderr but keep important errors
electronBuilder.stderr?.on("data", (data) => {
  const text = data.toString()
  const lower = text.toLowerCase()

  // Detect file lock/overwrite errors in stderr too
  if (
    lower.includes("ebusy") ||
    lower.includes("eacces") ||
    lower.includes("eperm") ||
    lower.includes("file is in use") ||
    lower.includes("cannot overwrite") ||
    lower.includes("access is denied") ||
    lower.includes("the process cannot access the file") ||
    lower.includes("being used by another process") ||
    lower.includes("file is locked") ||
    lower.includes("cannot delete") ||
    lower.includes("sharing violation")
  ) {
    hasFileLockError = true
  }

  // Only show errors that aren't related to winCodeSign/darwin
  if (
    !lower.includes("wincodesign") &&
    !lower.includes("darwin") &&
    !lower.includes("symbolic link") &&
    !lower.includes("libcrypto.dylib") &&
    !lower.includes("libssl.dylib")
  ) {
    process.stderr.write(data)
  }
})

electronBuilder.on("error", (error) => {
  console.error("Failed to start electron-builder:", error)
  process.exit(1)
})

electronBuilder.on("close", (code) => {
  const releaseDir = join(projectRoot, "release")
  const exeCandidates = [
    join(releaseDir, "1Code.exe"),
  ]
  const exePath = exeCandidates.find((p) => existsSync(p))

  if (hasFileLockError) {
    console.log("\n❌ Build failed: Cannot overwrite files (app may be running)")
    console.log("   Please close 1Code.exe and try again")
    process.exit(1)
  } else if (exePath) {
    console.log("\n✅ Build completed successfully!")
    console.log(`   Executable: ${exePath}`)
    process.exit(0)
  } else if (code === 0) {
    console.log("\n⚠️  Build completed but executable not found in release/")
    process.exit(1)
  } else {
    process.exit(code || 1)
  }
})
