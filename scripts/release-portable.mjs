#!/usr/bin/env node
/**
 * Sync upstream and cut a portable Windows release.
 *
 * Steps:
 * 1) fetch upstream
 * 2) merge upstream/main into current main
 * 3) npm run build
 * 4) npm run package:win:portable
 * 5) create and push git tag (vX.Y.Z)
 */

import { execSync } from "child_process"

const tag = process.argv[2]
if (!tag || !/^v\d+\.\d+\.\d+/.test(tag)) {
  console.error("Usage: npm run release:portable -- vX.Y.Z")
  process.exit(1)
}

const run = (cmd) => execSync(cmd, { stdio: "inherit" })

run("git fetch upstream")
run("git checkout main")
run("git merge upstream/main")
run("npm run build")
run("npm run package:win:portable")
run(`git tag ${tag}`)
run("git push origin main")
run(`git push origin ${tag}`)
