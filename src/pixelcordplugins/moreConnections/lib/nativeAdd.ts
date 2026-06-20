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
        const s = url != null ? String(url) : "";
        // Diagnostic: surface any connection-related open so we can see what the
        // Last.fm click actually triggers.
        if (/connection|authorize|oauth/i.test(s)) logger.info("window.open ->", s);
        if (url != null && isOurConnectUrl(s)) {
            logger.info("Intercepted connect URL:", s);
            openManageConnections();
            return null;
        }
        return origWindowOpen!(url as any, ...(rest as []));
    } as typeof window.open;
}

// Discord's connect does nothing for our custom types (no OAuth config, no URL),
// so we catch the click on the platform tile itself (capture phase) and open our
// editor before Discord's no-op handler runs.
let clickListener: ((e: MouseEvent) => void) | null = null;

function installClickInterception() {
    if (clickListener) return;
    clickListener = (e: MouseEvent) => {
        const el = (e.target as HTMLElement | null)?.closest?.('button,[role="button"]') as HTMLElement | null;
        if (!el) return;

        const label = (el.getAttribute("aria-label") || el.getAttribute("title") || "")
            .toLowerCase().replace(/[^a-z]/g, "");
        if (label && OUR_TYPES.some(t => label.includes(t))) {
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();
            openManageConnections();
        }
    };
    document.addEventListener("click", clickListener, true);
}

function uninstallClickInterception() {
    if (clickListener) {
        document.removeEventListener("click", clickListener, true);
        clickListener = null;
    }
}

const LASTFM_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640">'
    + '<path fill="#d51007" d="M289.8 431.1L271 380.1C271 380.1 240.5 414.1 194.8 414.1C154.3 414.1 125.6 378.9 125.6 322.6C125.6 250.5 162 224.7 197.7 224.7C264.2 224.7 272.5 278 298.6 359.6C317.4 416.5 352.6 462.2 454 462.2C526.7 462.2 576 439.9 576 381.3C576 308.4 513.3 300.7 461 289.2C435.2 283.3 427.6 272.8 427.6 255.2C427.6 235.3 443.4 223.5 469.2 223.5C497.4 223.5 512.6 234.1 514.9 259.3L573.5 252.3C568.8 199.5 532.4 177.8 472.6 177.8C419.8 177.8 368.2 197.7 368.2 261.7C368.2 301.6 387.6 326.8 436.2 338.5C481.1 349.1 516 352.3 516 384.2C516 405.9 494.9 414.7 455 414.7C395.8 414.7 371.1 383.6 357.1 340.8C325.1 244 313.5 177.8 195.8 177.8C109.7 177.8 64 232.3 64 325C64 414.1 109.7 462.2 191.9 462.2C258.1 462.2 289.8 431.1 289.8 431.1z"/></svg>';

function lastfmIconDataUri(): string {
    return "data:image/svg+xml;base64," + btoa(LASTFM_SVG);
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
        installClickInterception();
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
        // Mirror Instagram's icon format exactly, swapping in the Last.fm artwork:
        // raw SVG markup if Discord stores inline SVG, otherwise a data-URI.
        const swapIcon = (v: any) =>
            typeof v === "string" && v.trim().startsWith("<svg") ? LASTFM_SVG : lastfmIconDataUri();
        try {
            if (instagram.icon && typeof instagram.icon === "object") {
                lastfm.icon = Array.isArray(instagram.icon) ? [] : {};
                for (const k of Object.keys(instagram.icon)) lastfm.icon[k] = swapIcon(instagram.icon[k]);
            } else {
                lastfm.icon = swapIcon(instagram.icon);
            }
        } catch { /* keep cloned icon */ }

        // 3) get("lastfm") returns our descriptor (so it renders on profiles).
        const origGet = registry.get.bind(registry);
        registry.get = (type: string, ...rest: any[]) => (type === "lastfm" ? lastfm : origGet(type, ...rest));
        restore.push(() => { registry.get = origGet; });

        // 4) The platform list lives in a closure, reached only through the
        // registry's own map/filter/find. Wrap them so Last.fm is included wherever
        // it would qualify (e.g. the modal's "enabled & connectable" filter).
        const accepts = (fn: any) => {
            try { return !!fn(lastfm); } catch { return false; }
        };
        const wrap = (name: string, make: (orig: any) => any) => {
            if (typeof registry[name] === "function") {
                const orig = registry[name].bind(registry);
                registry[name] = make(orig);
                restore.push(() => { registry[name] = orig; });
            }
        };
        wrap("filter", orig => (fn: any, ...rest: any[]) => {
            const out = orig(fn, ...rest);
            if (Array.isArray(out) && accepts(fn)) out.push(lastfm);
            return out;
        });
        wrap("map", orig => (fn: any, ...rest: any[]) => {
            const out = orig(fn, ...rest);
            if (Array.isArray(out)) {
                try {
                    const mapped = fn(lastfm, out.length, []);
                    if (mapped != null) out.push(mapped);
                } catch { /* skip */ }
            }
            return out;
        });
        wrap("find", orig => (fn: any, ...rest: any[]) => orig(fn, ...rest) ?? (accepts(fn) ? lastfm : undefined));

        // 5) isSupported override for both.
        if (typeof registry.isSupported === "function") {
            const origSupported = registry.isSupported.bind(registry);
            registry.isSupported = (type: string, ...rest: any[]) =>
                (OUR_TYPES.includes(type) ? true : origSupported(type, ...rest));
            restore.push(() => { registry.isSupported = origSupported; });
        }

        // 6) Intercept the connect navigation for both.
        installWindowOpenHook();
        installClickInterception();
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
    uninstallClickInterception();
    patched = false;
}
