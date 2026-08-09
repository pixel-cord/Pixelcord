/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { spawn } from "child_process";
import { IpcMainInvokeEvent, session, shell } from "electron";
import { existsSync } from "fs";

const isWin = process.platform === "win32";
const isMac = process.platform === "darwin";

const PROXY_PORT = 40000;
const PROXY_RULES = `socks5://127.0.0.1:${PROXY_PORT}`;

function buildEnv(): NodeJS.ProcessEnv {
    const extra = isWin
        ? ["C:\\Program Files\\Cloudflare\\Cloudflare WARP"]
        : ["/usr/local/bin", "/opt/homebrew/bin", "/usr/bin", "/bin"];
    const sep = isWin ? ";" : ":";
    return { ...process.env, PATH: [process.env.PATH, ...extra].filter(Boolean).join(sep) };
}

function binCandidates(): string[] {
    if (isWin) return ["warp-cli.exe", "C:\\Program Files\\Cloudflare\\Cloudflare WARP\\warp-cli.exe", "warp-cli"];
    if (isMac) return ["/usr/local/bin/warp-cli", "/opt/homebrew/bin/warp-cli", "warp-cli"];
    return ["/usr/bin/warp-cli", "/bin/warp-cli", "warp-cli"];
}

interface RunResult { code: number | null; stdout: string; stderr: string; error?: string; }

function capture(bin: string, args: string[], timeout = 30000): Promise<RunResult> {
    return new Promise(resolve => {
        let child;
        try {
            child = spawn(bin, args, { env: buildEnv(), shell: isWin });
        } catch (e) {
            return resolve({ code: -1, stdout: "", stderr: "", error: String(e) });
        }
        let stdout = "", stderr = "";
        const to = setTimeout(() => { try { child.kill(); } catch { /* */ } }, timeout);
        child.stdout?.on("data", d => (stdout += d));
        child.stderr?.on("data", d => (stderr += d));
        child.on("error", e => { clearTimeout(to); resolve({ code: -1, stdout, stderr, error: String(e) }); });
        child.on("close", code => { clearTimeout(to); resolve({ code, stdout, stderr }); });
    });
}

let cachedBin: string | undefined;

async function resolveBin(override?: string): Promise<string | null> {
    if (override && (existsSync(override) || isWin)) {
        const r = await capture(override, ["--version"], 10000);
        if (r.code === 0) { cachedBin = override; return override; }
    }
    if (cachedBin && (isWin || existsSync(cachedBin))) return cachedBin;
    for (const c of binCandidates()) {
        const r = await capture(c, ["--version"], 10000);
        if (r.code === 0) { cachedBin = c; return c; }
    }
    return null;
}

// warp-cli changed its subcommand syntax across versions, so try newer then older.
async function tryVariants(bin: string, variants: string[][]): Promise<RunResult> {
    let last: RunResult = { code: -1, stdout: "", stderr: "" };
    for (const args of variants) {
        last = await capture(bin, args);
        if (last.code === 0) return last;
    }
    return last;
}

function isConnected(statusOut: string): boolean {
    return /connected/i.test(statusOut) && !/disconnected/i.test(statusOut);
}

async function setDiscordProxy(rules: string | null) {
    try {
        const s = session.defaultSession;
        if (rules) await s.setProxy({ proxyRules: rules, proxyBypassRules: "<-loopback>" });
        else await s.setProxy({ mode: "direct" });
        await s.forceReloadProxyConfig?.();
    } catch { /* best effort */ }
}

// ── exported native functions ────────────────────────────────────────

export async function warpStatus(_: IpcMainInvokeEvent, opts?: { binaryPath?: string; }) {
    const bin = await resolveBin(opts?.binaryPath);
    if (!bin) return { installed: false as const };
    const ver = await capture(bin, ["--version"], 10000);
    const st = await capture(bin, ["status"], 10000);
    return {
        installed: true as const,
        version: ver.stdout.trim() || ver.stderr.trim(),
        connected: isConnected(st.stdout + st.stderr)
    };
}

export async function warpConnect(_: IpcMainInvokeEvent, opts?: { binaryPath?: string; }) {
    const bin = await resolveBin(opts?.binaryPath);
    if (!bin) return { ok: false as const, error: "notInstalled" };

    // proxy mode + port (variant syntax across versions)
    await tryVariants(bin, [["--accept-tos", "mode", "proxy"], ["mode", "proxy"], ["set-mode", "proxy"]]);
    await tryVariants(bin, [["--accept-tos", "proxy", "port", String(PROXY_PORT)], ["proxy", "port", String(PROXY_PORT)], ["set-proxy-port", String(PROXY_PORT)]]);

    let conn = await tryVariants(bin, [["--accept-tos", "connect"], ["connect"]]);
    if (conn.code !== 0 && /regist/i.test(conn.stdout + conn.stderr)) {
        // not registered yet — register then retry
        await tryVariants(bin, [["--accept-tos", "registration", "new"], ["registration", "new"], ["register"]]);
        conn = await tryVariants(bin, [["--accept-tos", "connect"], ["connect"]]);
    }

    const st = await capture(bin, ["status"], 10000);
    const connected = isConnected(st.stdout + st.stderr);
    if (!connected) return { ok: false as const, error: (conn.stderr || conn.stdout || "não conectou").trim() };

    await setDiscordProxy(PROXY_RULES);
    return { ok: true as const, proxy: PROXY_RULES };
}

export async function warpDisconnect(_: IpcMainInvokeEvent, opts?: { binaryPath?: string; }) {
    await setDiscordProxy(null);
    const bin = await resolveBin(opts?.binaryPath);
    if (bin) await tryVariants(bin, [["--accept-tos", "disconnect"], ["disconnect"]]);
    return { ok: true as const };
}

// Re-apply the Electron proxy without touching warp-cli (e.g. after a client restart
// while WARP is already up).
export async function applyProxy(_: IpcMainInvokeEvent, on: boolean) {
    await setDiscordProxy(on ? PROXY_RULES : null);
    return { ok: true as const };
}

// Best-effort install of the official Cloudflare WARP client via the OS package
// manager. Linux needs a sudo apt/dnf repo setup, so we don't automate it.
export async function warpInstall(_: IpcMainInvokeEvent) {
    let r: RunResult;
    if (isWin) {
        r = await capture("winget", ["install", "--id", "Cloudflare.Warp", "-e", "--accept-source-agreements", "--accept-package-agreements"], 600000);
    } else if (isMac) {
        r = await capture("brew", ["install", "--cask", "cloudflare-warp"], 600000);
    } else {
        return { ok: false as const, manual: true as const, log: "" };
    }
    cachedBin = undefined; // re-detect after install
    const log = (r.stdout + "\n" + r.stderr + (r.error ? "\n" + r.error : "")).trim();
    return { ok: r.code === 0, manual: false as const, log };
}

export async function warpOpenDownload(_: IpcMainInvokeEvent) {
    try { await shell.openExternal("https://1.1.1.1/"); return { ok: true as const }; }
    catch (e) { return { ok: false as const, error: String(e) }; }
}
