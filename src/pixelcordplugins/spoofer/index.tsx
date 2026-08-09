/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./styles.css";

import { definePluginSettings } from "@api/Settings";
import { Paragraph } from "@components/Paragraph";
import { IS_MAC, IS_WINDOWS, PixelCordDevs } from "@utils/constants";
import { classNameFactory } from "@utils/css";
import { Logger } from "@utils/Logger";
import definePlugin, { OptionType, PluginNative } from "@utils/types";
import { Button, Modal, openModal, React, showToast } from "@webpack/common";

const Native = VencordNative.pluginHelpers.Spoofer as PluginNative<typeof import("./native")>;

const logger = new Logger("Spoofer");
const cl = classNameFactory("vc-spoof-");

// Per-session canvas noise seed — stable within a session so the fingerprint is
// consistent (not flickering) but differs across restarts.
const seed = Math.floor(Math.random() * 251) + 1;

const settings = definePluginSettings({
    manage: {
        type: OptionType.COMPONENT,
        component: () => (
            <Button onClick={() => openWarpModal()}>
                Abrir painel do WARP (IP / GeoIP)
            </Button>
        )
    },
    warpBinaryPath: {
        type: OptionType.STRING,
        description: "Caminho do warp-cli (opcional — detecta sozinho). Requer o cliente oficial Cloudflare WARP instalado.",
        default: ""
    },
    canvasNoise: {
        type: OptionType.BOOLEAN,
        description: "Ruído em canvas (toDataURL/getImageData) — quebra fingerprint de canvas. Desligue se algum canvas bugar.",
        default: true
    },
    webglSpoof: {
        type: OptionType.BOOLEAN,
        description: "Falsificar o vendor/renderer do WebGL",
        default: true
    },
    webglVendor: {
        type: OptionType.STRING,
        description: "WebGL UNMASKED_VENDOR",
        default: "Google Inc. (Intel)"
    },
    webglRenderer: {
        type: OptionType.STRING,
        description: "WebGL UNMASKED_RENDERER",
        default: "ANGLE (Intel, Intel(R) UHD Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)"
    },
    spoofHardware: {
        type: OptionType.BOOLEAN,
        description: "Falsificar hardwareConcurrency e deviceMemory",
        default: true
    },
    hwConcurrency: {
        type: OptionType.NUMBER,
        description: "navigator.hardwareConcurrency (núcleos)",
        default: 8
    },
    devMemory: {
        type: OptionType.NUMBER,
        description: "navigator.deviceMemory (GB)",
        default: 8
    },
    spoofNavigatorId: {
        type: OptionType.BOOLEAN,
        description: "⚠️ AVANÇADO: falsificar userAgent/plataforma/idioma. Pode quebrar a UI do Discord — deixe desligado se não souber.",
        default: false
    },
    userAgent: {
        type: OptionType.STRING,
        description: "userAgent (vazio = não mexe)",
        default: ""
    },
    platform: {
        type: OptionType.SELECT,
        description: "navigator.platform",
        options: [
            { label: "Não mexer", value: "keep", default: true },
            { label: "Windows (Win32)", value: "Win32" },
            { label: "macOS (MacIntel)", value: "MacIntel" },
            { label: "Linux (Linux x86_64)", value: "Linux x86_64" }
        ] as const
    },
    language: {
        type: OptionType.STRING,
        description: "navigator.language (ex: en-US). Vazio = não mexe.",
        default: ""
    }
});

// ── fingerprint patching ─────────────────────────────────────────────
const restores: Array<() => void> = [];

function override(target: any, prop: string, getter: () => any) {
    const orig = Object.getOwnPropertyDescriptor(target, prop);
    try {
        Object.defineProperty(target, prop, { get: getter, configurable: true });
        restores.push(() => {
            try {
                if (orig) Object.defineProperty(target, prop, orig);
                else delete target[prop];
            } catch { /* */ }
        });
    } catch (e) { logger.warn("override failed", prop, e); }
}

function wrap(target: any, prop: string, factory: (orig: any) => any) {
    const orig = target?.[prop];
    if (typeof orig !== "function") return;
    target[prop] = factory(orig);
    restores.push(() => { target[prop] = orig; });
}

function perturb(data: Uint8ClampedArray) {
    for (let i = 0; i < data.length; i += 4 * 1499) data[i] = data[i] ^ (seed & 3);
}

function applyPatches() {
    const origGetImageData = CanvasRenderingContext2D.prototype.getImageData;

    // WebGL vendor / renderer
    const glProtos = [
        (window as any).WebGLRenderingContext?.prototype,
        (window as any).WebGL2RenderingContext?.prototype
    ].filter(Boolean);
    for (const proto of glProtos) {
        wrap(proto, "getParameter", (orig: any) => function (this: any, p: number) {
            if (settings.store.webglSpoof) {
                if (p === 37445) return settings.store.webglVendor; // UNMASKED_VENDOR_WEBGL
                if (p === 37446) return settings.store.webglRenderer; // UNMASKED_RENDERER_WEBGL
            }
            return orig.call(this, p);
        });
    }

    // Canvas read noise
    wrap(CanvasRenderingContext2D.prototype, "getImageData", (orig: any) => function (this: any, ...a: any[]) {
        const r = orig.apply(this, a);
        if (settings.store.canvasNoise && r?.data) perturb(r.data);
        return r;
    });

    const noisify = (canvas: HTMLCanvasElement) => {
        if (!settings.store.canvasNoise) return;
        try {
            const ctx = canvas.getContext("2d") as CanvasRenderingContext2D | null;
            if (!ctx || !canvas.width || !canvas.height) return;
            const img = origGetImageData.call(ctx, 0, 0, canvas.width, canvas.height);
            perturb(img.data);
            ctx.putImageData(img, 0, 0);
        } catch { /* */ }
    };
    wrap(HTMLCanvasElement.prototype, "toDataURL", (orig: any) => function (this: HTMLCanvasElement, ...a: any[]) { noisify(this); return orig.apply(this, a); });
    wrap(HTMLCanvasElement.prototype, "toBlob", (orig: any) => function (this: HTMLCanvasElement, ...a: any[]) { noisify(this); return orig.apply(this, a); });

    // Hardware
    if (settings.store.spoofHardware) {
        override(navigator, "hardwareConcurrency", () => settings.store.hwConcurrency || 8);
        override(navigator, "deviceMemory", () => settings.store.devMemory || 8);
    }

    // Advanced identity (risky)
    if (settings.store.spoofNavigatorId) {
        if (settings.store.userAgent) override(navigator, "userAgent", () => settings.store.userAgent);
        if (settings.store.platform && settings.store.platform !== "keep") override(navigator, "platform", () => settings.store.platform);
        if (settings.store.language) {
            override(navigator, "language", () => settings.store.language);
            override(navigator, "languages", () => [settings.store.language]);
        }
    }
}

function removePatches() {
    while (restores.length) restores.pop()!();
}

// ── WARP UI ──────────────────────────────────────────────────────────
interface Trace { ip?: string; loc?: string; colo?: string; warp?: string; }

async function getTrace(): Promise<Trace | null> {
    try {
        const res = await fetch("https://www.cloudflare.com/cdn-cgi/trace", { cache: "no-store" });
        const t = await res.text();
        const m: Record<string, string> = {};
        for (const line of t.split("\n")) {
            const i = line.indexOf("=");
            if (i > 0) m[line.slice(0, i)] = line.slice(i + 1);
        }
        return { ip: m.ip, loc: m.loc, colo: m.colo, warp: m.warp };
    } catch (e) {
        logger.error("trace failed", e);
        return null;
    }
}

function WarpModal({ modalProps }: { modalProps: any; }) {
    const [status, setStatus] = React.useState<{ installed: boolean; connected?: boolean; version?: string; } | null>(null);
    const [trace, setTrace] = React.useState<Trace | null>(null);
    const [busy, setBusy] = React.useState(false);

    async function refresh() {
        if (!Native) { setStatus({ installed: false }); return; }
        const s = await Native.warpStatus({ binaryPath: settings.store.warpBinaryPath });
        setStatus(s.installed ? { installed: true, connected: (s as any).connected, version: (s as any).version } : { installed: false });
    }

    React.useEffect(() => { void refresh(); void getTrace().then(setTrace); }, []);

    async function connect() {
        if (!Native) return;
        setBusy(true);
        const r = await Native.warpConnect({ binaryPath: settings.store.warpBinaryPath });
        if (!r.ok) showToast(r.error === "notInstalled" ? "Cliente Cloudflare WARP não encontrado" : "Falha ao conectar: " + r.error);
        else showToast("WARP conectado (só o Discord)");
        await refresh();
        setTrace(await getTrace());
        setBusy(false);
    }

    async function disconnect() {
        if (!Native) return;
        setBusy(true);
        await Native.warpDisconnect({ binaryPath: settings.store.warpBinaryPath });
        showToast("WARP desconectado");
        await refresh();
        setTrace(await getTrace());
        setBusy(false);
    }

    async function install() {
        if (!Native) return;
        setBusy(true);
        showToast("Instalando o Cloudflare WARP… pode demorar um pouco");
        const r = await Native.warpInstall();
        if (r.manual) showToast("No Linux, instale pelo repositório/página oficial");
        else showToast(r.ok ? "WARP instalado! Clique em Atualizar" : "Falha ao instalar — use a página de download");
        await refresh();
        setBusy(false);
    }

    const connected = status?.connected;
    const notInstalled = status?.installed === false;
    const installHint = IS_WINDOWS
        ? "Windows: instala via winget (Cloudflare.Warp)."
        : IS_MAC
            ? "macOS: instala via Homebrew (cask cloudflare-warp)."
            : "Linux: adicione o repositório oficial da Cloudflare e instale cloudflare-warp (precisa de sudo) — veja a página de download.";

    return (
        <Modal {...modalProps} size="sm" title="Cloudflare WARP — IP / GeoIP">
            <div className={cl("wrap")}>
                <Paragraph style={{ color: "var(--text-warning, #f0b232)" }}>
                    Roteia só o tráfego do Discord pelo WARP (proxy SOCKS). Requer o cliente oficial Cloudflare WARP instalado. No WARP grátis você não escolhe o país.
                </Paragraph>

                <div className={cl("card")}>
                    <div>Cliente: {status == null ? "…" : status.installed ? `✅ ${status.version ?? "ok"}` : "⚠️ não encontrado"}</div>
                    <div>WARP (Discord): {connected == null ? "…" : connected ? "🟢 conectado" : "⚪ desligado"}</div>
                </div>

                {notInstalled && (
                    <div className={cl("card")}>
                        <div>O cliente oficial Cloudflare WARP não foi encontrado.</div>
                        <div className={cl("row")}>
                            {(IS_WINDOWS || IS_MAC) && (
                                <Button color={Button.Colors.GREEN} disabled={busy} onClick={install}>Instalar automaticamente</Button>
                            )}
                            <Button look={Button.Looks.LINK} color={Button.Colors.PRIMARY} disabled={busy} onClick={() => Native?.warpOpenDownload()}>Abrir página de download</Button>
                        </div>
                        <div style={{ fontSize: 12, color: "var(--text-muted, #949ba4)" }}>{installHint}</div>
                    </div>
                )}

                <div className={cl("card")}>
                    <div><b>IP atual:</b> {trace?.ip ?? "…"}</div>
                    <div><b>País (GeoIP):</b> {trace?.loc ?? "…"}</div>
                    <div><b>Datacenter:</b> {trace?.colo ?? "…"}</div>
                    <div><b>WARP ativo:</b> {trace?.warp ?? "…"}</div>
                </div>

                <div className={cl("row")}>
                    <Button color={Button.Colors.BRAND} disabled={busy} onClick={connect}>Conectar</Button>
                    <Button color={Button.Colors.RED} disabled={busy} onClick={disconnect}>Desconectar</Button>
                    <Button look={Button.Looks.LINK} color={Button.Colors.PRIMARY} disabled={busy} onClick={async () => { await refresh(); setTrace(await getTrace()); }}>Atualizar</Button>
                </div>
            </div>
        </Modal>
    );
}

function openWarpModal() {
    openModal(props => <WarpModal modalProps={props} />);
}

export default definePlugin({
    name: "Spoofer",
    description: "Privacidade: falsifica o fingerprint web (WebGL, canvas, hardware) e roteia só o Discord pelo Cloudflare WARP (proxy SOCKS) pra trocar IP/GeoIP. Requer o cliente oficial WARP instalado. Automatizar/evadir no Discord viola o ToS — use por sua conta e risco.",
    authors: [PixelCordDevs.myvings],
    tags: ["Privacy", "Utility"],
    settings,

    start() {
        applyPatches();
    },

    stop() {
        removePatches();
        // desligar a proxy do Discord ao desativar o plugin
        Native?.applyProxy(false).catch(() => { /* */ });
    }
});
