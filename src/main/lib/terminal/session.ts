import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import * as pty from "node-pty"
import { buildTerminalEnv, FALLBACK_SHELL, getDefaultShell } from "./env"
import type { InternalCreateSessionParams, TerminalSession } from "./types"

const DEFAULT_COLS = 80
const DEFAULT_ROWS = 24

function getShellArgs(shell: string): string[] {
	if (shell.includes("zsh")) {
		return ["-l"]
	}
	if (shell.includes("bash")) {
		return []
	}
	return []
}

function validateAndResolveCwd(cwd: string): string {
	// Check if directory exists
	if (!fs.existsSync(cwd)) {
		// Fallback to user home directory
		const homeDir = os.homedir()
		console.warn(`[Terminal] CWD does not exist: ${cwd}, using home directory: ${homeDir}`)
		return homeDir
	}

	// Check if it's actually a directory
	try {
		const stat = fs.statSync(cwd)
		if (!stat.isDirectory()) {
			const homeDir = os.homedir()
			console.warn(`[Terminal] CWD is not a directory: ${cwd}, using home directory: ${homeDir}`)
			return homeDir
		}
	} catch (err) {
		const homeDir = os.homedir()
		console.warn(`[Terminal] Error checking CWD: ${cwd}, using home directory: ${homeDir}`, err)
		return homeDir
	}

	// Resolve to absolute path
	try {
		return path.resolve(cwd)
	} catch (err) {
		const homeDir = os.homedir()
		console.warn(`[Terminal] Error resolving CWD: ${cwd}, using home directory: ${homeDir}`, err)
		return homeDir
	}
}

function resolveShellPath(shell: string): string {
	// On Windows, if shell doesn't contain a path separator, try to find it
	if (os.platform() === "win32" && !shell.includes("\\") && !shell.includes("/")) {
		// Try common Windows shell locations
		const commonPaths = [
			process.env.COMSPEC || "",
			process.env.SystemRoot ? `${process.env.SystemRoot}\\System32\\WindowsPowerShell\\v1.0\\powershell.exe` : "",
			process.env.SystemRoot ? `${process.env.SystemRoot}\\System32\\cmd.exe` : "",
			process.env.SystemRoot ? `${process.env.SystemRoot}\\System32\\WindowsPowerShell\\v1.0\\pwsh.exe` : "",
		].filter(Boolean)

		for (const shellPath of commonPaths) {
			if (fs.existsSync(shellPath)) {
				console.log(`[Terminal] Resolved shell path: ${shellPath}`)
				return shellPath
			}
		}

		// If shell is just "powershell.exe" or "cmd.exe", try to find it in PATH
		if (shell === "powershell.exe" || shell === "cmd.exe") {
			// Return as-is, let node-pty handle PATH resolution
			return shell
		}
	}

	return shell
}

function spawnPty(params: {
	shell: string
	cols: number
	rows: number
	cwd: string
	env: Record<string, string>
}): pty.IPty {
	const { shell, cols, rows, cwd, env } = params
	const shellArgs = getShellArgs(shell)
	const resolvedCwd = validateAndResolveCwd(cwd)
	const resolvedShell = resolveShellPath(shell)

	console.log(`[Terminal] Spawning PTY:`, {
		shell: resolvedShell,
		shellArgs,
		cwd: resolvedCwd,
		cols,
		rows,
	})

	try {
		return pty.spawn(resolvedShell, shellArgs, {
			name: "xterm-256color",
			cols,
			rows,
			cwd: resolvedCwd,
			env,
		})
	} catch (error) {
		console.error(`[Terminal] Failed to spawn PTY:`, error)
		// Try with fallback shell
		const fallbackShell = FALLBACK_SHELL
		console.log(`[Terminal] Retrying with fallback shell: ${fallbackShell}`)
		return pty.spawn(fallbackShell, [], {
			name: "xterm-256color",
			cols,
			rows,
			cwd: resolvedCwd,
			env,
		})
	}
}

export async function createSession(
	params: InternalCreateSessionParams,
	onData: (paneId: string, data: string) => void,
): Promise<TerminalSession> {
	const {
		paneId,
		tabId,
		workspaceId,
		workspaceName,
		workspacePath,
		rootPath,
		cwd,
		cols,
		rows,
		useFallbackShell = false,
	} = params

	const shell = useFallbackShell ? FALLBACK_SHELL : getDefaultShell()
	const workingDir = validateAndResolveCwd(cwd || os.homedir())
	const terminalCols = cols || DEFAULT_COLS
	const terminalRows = rows || DEFAULT_ROWS

	const env = buildTerminalEnv({
		shell,
		paneId,
		tabId,
		workspaceId,
		workspaceName,
		workspacePath,
		rootPath,
	})

	let ptyProcess: pty.IPty
	try {
		ptyProcess = spawnPty({
			shell,
			cols: terminalCols,
			rows: terminalRows,
			cwd: workingDir,
			env,
		})
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : String(error)
		console.error(`[Terminal] Failed to create PTY session:`, {
			shell,
			cwd: workingDir,
			error: errorMessage,
		})
		throw new Error(`Cannot create process, error code: ${errorMessage}`)
	}

	const session: TerminalSession = {
		pty: ptyProcess,
		paneId,
		workspaceId: workspaceId || "",
		cwd: workingDir,
		cols: terminalCols,
		rows: terminalRows,
		lastActive: Date.now(),
		isAlive: true,
		shell,
		startTime: Date.now(),
		usedFallback: useFallbackShell,
	}

	ptyProcess.onData((data) => {
		onData(paneId, data)
	})

	return session
}

/**
 * Set up initial commands to run after shell prompt is ready.
 * Commands are only sent for new sessions (not reattachments).
 */
export function setupInitialCommands(
	session: TerminalSession,
	initialCommands: string[] | undefined,
): void {
	if (!initialCommands || initialCommands.length === 0) {
		return
	}

	const initialCommandString = `${initialCommands.join(" && ")}\n`

	const dataHandler = session.pty.onData(() => {
		dataHandler.dispose()

		setTimeout(() => {
			if (session.isAlive) {
				session.pty.write(initialCommandString)
			}
		}, 100)
	})
}
