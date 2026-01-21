#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

const args = new Set(process.argv.slice(2));
if (args.has("--help") || args.has("-h")) {
  console.log(`Secret scan (lightweight, repo-local)\n\nUsage:\n  node scripts/secret-scan.mjs --all    Scan tracked files (default)\n  node scripts/secret-scan.mjs --staged Scan staged files only\n`);
  process.exit(0);
}

const scanStaged = args.has("--staged");
const scanAll = args.has("--all") || !scanStaged;

const skipPrefixes = [
  ".git/",
  "node_modules/",
  "out/",
  "dist/",
  "release/",
  "resources/bin/",
  "downloads/",
  "build/",
];

const patterns = [
  { name: "Anthropic API key", regex: /sk-ant-[A-Za-z0-9_-]{20,}/g },
  { name: "Anthropic OAuth token", regex: /sk-ant-oat01-[A-Za-z0-9_-]{20,}/g },
  { name: "GitHub token", regex: /gh[opusr]_[A-Za-z0-9]{20,}/g },
  { name: "GitHub fine-grained token", regex: /github_pat_[A-Za-z0-9_]{20,}/g },
  { name: "AWS access key", regex: /(?:AKIA|ASIA)[0-9A-Z]{16}/g },
  { name: "Google API key", regex: /AIza[0-9A-Za-z\-_]{35}/g },
  { name: "Slack token", regex: /xox[baprs]-[A-Za-z0-9-]{10,}/g },
  { name: "Stripe live key", regex: /(sk_live|rk_live|pk_live)_[A-Za-z0-9]{10,}/g },
  { name: "SendGrid API key", regex: /SG\.[A-Za-z0-9_-]{22,}/g },
  { name: "Private key", regex: /-----BEGIN (?:RSA|EC|DSA|OPENSSH|PRIVATE) KEY-----/g },
];

function runGit(argsList, options = {}) {
  const result = spawnSync("git", argsList, { encoding: null, ...options });
  if (result.status !== 0) {
    const message = result.stderr ? result.stderr.toString("utf8").trim() : "";
    throw new Error(message || `git ${argsList.join(" ")} failed`);
  }
  return result.stdout ?? Buffer.alloc(0);
}

function getFileList() {
  if (scanStaged) {
    const output = runGit(["diff", "--cached", "--name-only", "-z", "--diff-filter=ACM"]);
    return output.toString("utf8").split("\0").filter(Boolean);
  }
  if (scanAll) {
    const output = runGit(["ls-files", "-z"]);
    return output.toString("utf8").split("\0").filter(Boolean);
  }
  return [];
}

function isBinary(buffer) {
  return buffer.includes(0);
}

function shouldSkip(file) {
  return skipPrefixes.some((prefix) => file.startsWith(prefix));
}

function readFileFromIndex(path) {
  const output = runGit(["show", `:${path}`]);
  return Buffer.isBuffer(output) ? output : Buffer.from(output);
}

function readFileFromFs(path) {
  return readFileSync(path);
}

function mask(value) {
  if (!value) return "";
  if (value.length <= 12) return value;
  return `${value.slice(0, 6)}…${value.slice(-4)}`;
}

function scanContent(content, filePath, results) {
  const lines = content.split(/\r?\n/);
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    for (const pattern of patterns) {
      pattern.regex.lastIndex = 0;
      const match = pattern.regex.exec(line);
      if (match) {
        results.push({
          filePath,
          line: i + 1,
          pattern: pattern.name,
          sample: mask(match[0]),
        });
      }
    }
  }
}

function main() {
  const files = getFileList();
  const results = [];

  for (const file of files) {
    if (shouldSkip(file)) continue;

    let buffer;
    try {
      buffer = scanStaged ? readFileFromIndex(file) : readFileFromFs(file);
    } catch {
      continue;
    }

    if (!buffer || isBinary(buffer)) {
      continue;
    }

    const content = buffer.toString("utf8");
    scanContent(content, file, results);
  }

  if (results.length) {
    console.error("Secret scan failed. Potential secrets found:");
    for (const hit of results) {
      const sample = hit.sample ? ` (${hit.sample})` : "";
      console.error(`- ${hit.filePath}:${hit.line}: ${hit.pattern}${sample}`);
    }
    process.exit(1);
  }

  console.log("Secret scan passed.");
}

main();
