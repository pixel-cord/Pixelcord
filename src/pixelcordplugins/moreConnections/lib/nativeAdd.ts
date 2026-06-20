/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Logger } from "@utils/Logger";
import { findByProps } from "@webpack";

import { openManageConnections } from "../components";

const logger = new Logger("MoreConnections");

// Connection types we expose: Instagram is a real (disabled) Discord type, so we
// just re-enable it; Last.fm doesn't exist in Discord, so we register a clone.
const OUR_TYPES = ["instagram", "lastfm"];

let patched = false;
const restore: Array<() => void> = [];
let origWindowOpen: typeof window.open | null = null;

// --- connect interception (Discord navigates to .../connections/<type>/authorize) ---
function isOurConnectUrl(url: string): boolean {
    const u = url.toLowerCase();
    return /(authorize|\/connections\/)/.test(u) && OUR_TYPES.some(t => u.includes(t));
}

function installWindowOpenHook() {
    if (origWindowOpen) return;
    origWindowOpen = window.open.bind(window);
    window.open = function (url?: string | URL, ...rest: any[]) {
        if (url != null && isOurConnectUrl(String(url))) {
            logger.info("Intercepted connect URL:", String(url));
            openManageConnections();
            return null;
        }
        return origWindowOpen!(url as any, ...(rest as []));
    } as typeof window.open;
}

function lastfmIconDataUri(): string {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">'
        + '<rect width="24" height="24" rx="6" fill="#d51007"/>'
        + '<rect x="6.6" y="13" width="2.4" height="5" rx="1" fill="#fff"/>'
        + '<rect x="10.8" y="9" width="2.4" height="9" rx="1" fill="#fff"/>'
        + '<rect x="15" y="11" width="2.4" height="7" rx="1" fill="#fff"/></svg>';
    return "data:image/svg+xml;base64," + btoa(svg);
}

export function installNativeConnections() {
    if (patched) return;
    patched = true;

    try {
        // Real module (not the lazy proxy) — the proxy doesn't forward `set`, so we
        // need the real object to override registry methods.
        const registry: any = findByProps("isSupported", "getByUrl");
        const instagram: any = registry?.get?.("instagram");
        if (!instagram) {
            logger.warn("Connection registry / Instagram descriptor not found — native add unavailable.");
            installWindowOpenHook();
            return;
        }

        logger.info("instagram descriptor:", { keys: Object.keys(instagram), icon: instagram.icon, enabled: instagram.enabled });
        logger.info("registry own props:", Object.getOwnPropertyNames(registry));

        // 1) Re-enable Instagram in the Add Connection modal.
        if ("enabled" in instagram) {
            const prev = instagram.enabled;
            instagram.enabled = true;
            restore.push(() => { instagram.enabled = prev; });
        }

        // 2) Build a Last.fm descriptor cloned from Instagram's shape.
        const lastfm: any = {
            ...instagram,
            type: "lastfm",
            name: "Last.fm",
            enabled: true,
            getPlatformUserUrl: (conn: any) => `https://www.last.fm/user/${conn?.name ?? ""}`,
        };
        try {
            const uri = lastfmIconDataUri();
            if (instagram.icon && typeof instagram.icon === "object") {
                lastfm.icon = { ...instagram.icon };
                for (const k of Object.keys(lastfm.icon)) lastfm.icon[k] = uri;
            } else if (typeof instagram.icon === "string") {
                lastfm.icon = uri;
            }
        } catch { /* keep cloned icon */ }

        // 3) get("lastfm") returns our descriptor (so it renders on profiles).
        const origGet = registry.get.bind(registry);
        registry.get = (type: string, ...rest: any[]) => (type === "lastfm" ? lastfm : origGet(type, ...rest));
        restore.push(() => { registry.get = origGet; });

        // 4) Add it to whatever container the modal iterates for its platform list.
        let added = false;
        for (const key of Object.getOwnPropertyNames(registry)) {
            let v: any;
            try { v = registry[key]; } catch { continue; }
            if (v instanceof Map && v.has("instagram")) {
                v.set("lastfm", lastfm);
                restore.push(() => v.delete("lastfm"));
                added = true; break;
            }
            if (v && typeof v === "object" && !Array.isArray(v) && v.instagram?.type === "instagram") {
                v.lastfm = lastfm;
                restore.push(() => { delete v.lastfm; });
                added = true; break;
            }
            if (Array.isArray(v) && v.some((p: any) => p?.type === "instagram")) {
                v.push(lastfm);
                restore.push(() => { const i = v.indexOf(lastfm); if (i >= 0) v.splice(i, 1); });
                added = true; break;
            }
        }
        logger.info("Last.fm added to modal list container:", added);

        // 5) isSupported override for both.
        if (typeof registry.isSupported === "function") {
            const origSupported = registry.isSupported.bind(registry);
            registry.isSupported = (type: string, ...rest: any[]) =>
                (OUR_TYPES.includes(type) ? true : origSupported(type, ...rest));
            restore.push(() => { registry.isSupported = origSupported; });
        }

        // 6) Intercept the connect navigation for both.
        installWindowOpenHook();
    } catch (e) {
        logger.error("Failed to install native connections", e);
    }
}

export function uninstallNativeConnections() {
    if (!patched) return;

    for (const fn of restore.splice(0).reverse()) {
        try { fn(); } catch { /* ignore */ }
    }
    if (origWindowOpen) {
        window.open = origWindowOpen;
        origWindowOpen = null;
    }
    patched = false;
}
