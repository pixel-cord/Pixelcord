/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { spawn } from "child_process";
import { IpcMainInvokeEvent } from "electron";
import { existsSync } from "fs";
import { homedir, tmpdir } from "os";
import { join } from "path";

const isWin = process.platform === "win32";
const isMac = process.platform === "darwin";
const home = homedir();

// GUI-launched Electron often has a minimal PATH, so augment it with the usual
// places the `claude` binary and npm globals live.
function buildEnv(): NodeJS.ProcessEnv {
    const extra = isWin
        ? [join(process.env.APPDATA ?? "", "npm")]
        : [
            join(home, ".local/bin"),
            join(home, ".claude/local"),
            "/usr/local/bin",
            "/opt/homebrew/bin",
            join(home, ".npm-global/bin"),
            join(home, ".bun/bin")
        ];
    const sep = isWin ? ";" : ":";
    return { ...process.env, PATH: [process.env.PATH, ...extra].filter(Boolean).join(sep) };
}

function binCandidates(): string[] {
    if (isWin) {
        const appdata = process.env.APPDATA ?? "";
        return ["claude.cmd", "claude.exe", "claude", join(appdata, "npm", "claude.cmd")];
    }
    return [
        join(home, ".local/bin/claude"),
        join(home, ".claude/local/claude"),
        "/opt/homebrew/bin/claude",
        "/usr/local/bin/claude",
        join(home, ".npm-global/bin/claude"),
        "claude"
    ];
}

interface RunResult { code: number | null; stdout: string; stderr: string; error?: string; }

// spawn + capture. Prompt/large input is fed via stdin (never argv) so we never
// have to quote user text into a command line.
function capture(bin: string, args: string[], input?: string, timeout = 120000): Promise<RunResult> {
    return new Promise(resolve => {
        let child;
        try {
            child = spawn(bin, args, { env: buildEnv(), shell: isWin, cwd: tmpdir() });
        } catch (e) {
            return resolve({ code: -1, stdout: "", stderr: "", error: String(e) });
        }
        let stdout = "", stderr = "";
        const to = setTimeout(() => { try { child.kill(); } catch { /* */ } }, timeout);
        child.stdout?.on("data", d => (stdout += d));
        child.stderr?.on("data", d => (stderr += d));
        child.on("error", e => { clearTimeout(to); resolve({ code: -1, stdout, stderr, error: String(e) }); });
        child.on("close", code => { clearTimeout(to); resolve({ code, stdout, stderr }); });
        if (input != null) { try { child.stdin?.write(input); child.stdin?.end(); } catch { /* */ } }
    });
}

let cachedBin: string | undefined;

async function resolveBin(override?: string): Promise<string | null> {
    if (override) {
        if (existsSync(override) || isWin) {
            const r = await capture(override, ["--version"], undefined, 15000);
            if (r.code === 0) { cachedBin = override; return override; }
        }
    }
    if (cachedBin && (isWin || existsSync(cachedBin))) return cachedBin;
    for (const c of binCandidates()) {
        const r = await capture(c, ["--version"], undefined, 15000);
        if (r.code === 0) { cachedBin = c; return c; }
    }
    return null;
}

// ── exported native functions ────────────────────────────────────────

export async function claudeStatus(_: IpcMainInvokeEvent, opts?: { binaryPath?: string; }) {
    const bin = await resolveBin(opts?.binaryPath);
    if (!bin) return { installed: false as const };
    const r = await capture(bin, ["--version"], undefined, 15000);
    return { installed: true as const, path: bin, version: r.stdout.trim() || r.stderr.trim() };
}

export async function claudeInstall(_: IpcMainInvokeEvent) {
    const r = await capture("npm", ["install", "-g", "@anthropic-ai/claude-code"], undefined, 300000);
    cachedBin = undefined; // force re-resolve after install
    const log = (r.stdout + "\n" + r.stderr + (r.error ? "\n" + r.error : "")).trim();
    if (r.code !== 0) return { ok: false as const, log: log || "Falha ao instalar. Verifique se o Node/npm está instalado." };
    const bin = await resolveBin();
    return { ok: true as const, log, path: bin };
}

// Opens a real terminal window running `claude` so the user can complete the
// interactive OAuth login once. Auth then persists for the CLI itself.
export async function claudeLogin(_: IpcMainInvokeEvent, opts?: { binaryPath?: string; }) {
    const bin = (await resolveBin(opts?.binaryPath)) ?? "claude";
    try {
        if (isWin) {
            spawn("cmd", ["/c", "start", "", "cmd", "/k", bin], { env: buildEnv(), shell: true, detached: true }).unref();
        } else if (isMac) {
            spawn("osascript", [
                "-e", "tell application \"Terminal\" to activate",
                "-e", `tell application "Terminal" to do script ${JSON.stringify(bin)}`
            ], { env: buildEnv(), detached: true }).unref();
        } else {
            const terms = ["x-terminal-emulator", "gnome-terminal", "konsole", "xterm"];
            let launched = false;
            for (const t of terms) {
                try {
                    const argv = t === "gnome-terminal" ? ["--", bin] : ["-e", bin];
                    spawn(t, argv, { env: buildEnv(), detached: true }).unref();
                    launched = true;
                    break;
                } catch { /* try next */ }
            }
            if (!launched) return { ok: false as const, message: `Abra um terminal e rode: ${bin}` };
        }
        return { ok: true as const, message: "Terminal aberto — faça o login por lá e volta aqui." };
    } catch (e) {
        return { ok: false as const, message: `Não consegui abrir o terminal. Rode manualmente: ${bin}\n${String(e)}` };
    }
}

// Runs the CLI in headless print mode. Prompt goes through stdin. One turn only —
// the renderer supplies the message context and expects a JSON action plan back.
export async function claudeRun(_: IpcMainInvokeEvent, opts: { binaryPath?: string; prompt: string; model?: string; }) {
    const bin = await resolveBin(opts?.binaryPath);
    if (!bin) return { ok: false as const, error: "notInstalled" };

    const args = ["-p", "--output-format", "json", "--max-turns", "1"];
    if (opts.model && opts.model !== "default") args.push("--model", opts.model);

    const r = await capture(bin, args, opts.prompt, 120000);
    if (r.error && !r.stdout) return { ok: false as const, error: r.error };

    let parsed: any = null;
    try { parsed = JSON.parse(r.stdout.trim()); } catch { /* not json */ }

    if (parsed) {
        if (parsed.is_error || parsed.subtype === "error_during_execution") {
            return { ok: false as const, error: String(parsed.result ?? parsed.error ?? "erro na execução"), raw: r.stdout };
        }
        return { ok: true as const, text: String(parsed.result ?? "") };
    }

    // Non-JSON output: surface stderr (often the auth/login error) so the UI can react.
    const err = (r.stderr || r.stdout || "").trim();
    if (/log ?in|authenticat|unauthor|not logged|api key/i.test(err))
        return { ok: false as const, error: "notLoggedIn", raw: err };
    return { ok: false as const, error: err || "Sem saída do CLI.", raw: r.stdout };
}
