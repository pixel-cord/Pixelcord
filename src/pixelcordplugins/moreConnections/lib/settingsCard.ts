/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Logger } from "@utils/Logger";
import { findStore } from "@webpack";

import { useAuthorizationStore } from "./auth";
import { getMine, loadMine, onMineChange, removeMine, setVisible } from "./mine";
import { PLATFORMS } from "./platforms";

const logger = new Logger("MoreConnections");
const OUR_TYPES = PLATFORMS.map(p => p.id);

let store: any = null;
let origGetAccounts: ((...args: any[]) => any) | null = null;
let unsubMine: (() => void) | null = null;
let unsubAuth: (() => void) | null = null;
// Network-level overrides, so the card's toggle/X act on our backend instead of
// hitting Discord (which 404s "Unknown Connection" for our synthetic accounts).
// Property-patching RestAPI didn't work (the consumer holds a direct reference),
// so we intercept fetch + XHR — whichever transport the request actually uses.
let origFetch: typeof window.fetch | null = null;
let origXhrOpen: any = null;
let origXhrSend: any = null;
// The auth token rehydrates asynchronously, so load our connections once it's
// available (and again if it changes), guarded so we never load in a loop.
let lastToken: string | null = null;

// Build account objects (the shape the Connections settings list renders into
// cards) from the current user's configured connections, reflecting visibility.
function ourAccounts(): any[] {
    const { connections, hidden } = getMine();
    const out: any[] = [];
    for (const p of PLATFORMS) {
        const name = connections[p.id];
        if (!name) continue;
        out.push({
            type: p.id,
            id: `${p.id}:${name}`,
            name,
            verified: false,
            visibility: hidden.includes(p.id) ? 0 : 1,
            revoked: false,
            friendSync: false,
            showActivity: false,
            twoWayLink: false,
            metadata: undefined,
            integrations: []
        });
    }
    return out;
}

// The card's "Show on profile" toggle PATCHes, the X DELETEs, and "show again"
// GETs /users/@me/connections/<type>/<id>(/authorize). Apply the change to our
// backend and return the body to fake back, or null if it isn't one of ours.
function handleOurRequest(method: string, url: string, body: any): Record<string, any> | null {
    const m = /\/connections\/([^/?]+)\//.exec(url);
    if (!m || !OUR_TYPES.includes(m[1])) return null;

    if (method === "DELETE") {
        removeMine(m[1]);
        return {};
    }
    if (method === "PATCH") {
        let parsed: any = {};
        try { parsed = typeof body === "string" ? JSON.parse(body) : (body ?? {}); } catch { /* ignore */ }
        setVisible(m[1], !!parsed.visibility);
        return {};
    }
    // Discord re-shows a hidden connection through its connect/authorize flow. For
    // our synthetic connection just make it visible again and return no OAuth url,
    // so Discord doesn't open a window / our editor.
    if (method === "GET" && url.includes("/authorize")) {
        setVisible(m[1], true);
        return { url: null };
    }
    return null;
}

function installNetworkInterception() {
    if (origFetch) return;

    origFetch = window.fetch.bind(window);
    window.fetch = (input: any, init?: any) => {
        const url = typeof input === "string" ? input : input?.url ?? "";
        const method = (init?.method || input?.method || "GET").toUpperCase();
        const fake = typeof url === "string" ? handleOurRequest(method, url, init?.body) : null;
        if (fake) {
            logger.info("Intercepted connection request (fetch):", method, url);
            return Promise.resolve(new Response(JSON.stringify(fake), { status: 200, headers: { "content-type": "application/json" } }));
        }
        return origFetch!(input, init);
    };

    origXhrOpen = XMLHttpRequest.prototype.open;
    origXhrSend = XMLHttpRequest.prototype.send;

    XMLHttpRequest.prototype.open = function (method: string, url: string, ...rest: any[]) {
        (this as any).__mcMethod = (method || "").toUpperCase();
        (this as any).__mcUrl = url;
        return origXhrOpen.call(this, method, url, ...rest);
    };

    XMLHttpRequest.prototype.send = function (body?: any) {
        const method = (this as any).__mcMethod || "";
        const url = (this as any).__mcUrl || "";
        const fake = typeof url === "string" ? handleOurRequest(method, url, body) : null;
        if (fake) {
            logger.info("Intercepted connection request (xhr):", method, url);

            const xhr = this as any;
            const text = JSON.stringify(fake);
            Object.defineProperty(xhr, "readyState", { configurable: true, get: () => 4 });
            Object.defineProperty(xhr, "status", { configurable: true, get: () => 200 });
            Object.defineProperty(xhr, "statusText", { configurable: true, get: () => "OK" });
            Object.defineProperty(xhr, "responseText", { configurable: true, get: () => text });
            Object.defineProperty(xhr, "response", { configurable: true, get: () => text });
            xhr.getAllResponseHeaders = () => "content-type: application/json\r\n";
            xhr.getResponseHeader = (n: string) => (n?.toLowerCase() === "content-type" ? "application/json" : null);

            setTimeout(() => {
                try {
                    xhr.onreadystatechange?.(new Event("readystatechange"));
                    xhr.dispatchEvent(new Event("readystatechange"));
                    xhr.onload?.(new Event("load"));
                    xhr.dispatchEvent(new Event("load"));
                    xhr.dispatchEvent(new Event("loadend"));
                } catch { /* ignore */ }
            }, 0);
            return;
        }
        return origXhrSend.call(this, body);
    };
}

function uninstallNetworkInterception() {
    if (origFetch) { window.fetch = origFetch; origFetch = null; }
    if (origXhrOpen) { XMLHttpRequest.prototype.open = origXhrOpen; origXhrOpen = null; }
    if (origXhrSend) { XMLHttpRequest.prototype.send = origXhrSend; origXhrSend = null; }
}

export function installSettingsCard() {
    if (origGetAccounts) return;

    store = findStore("ConnectedAccountsStore");
    if (typeof store?.getAccounts !== "function") {
        logger.warn("ConnectedAccountsStore.getAccounts not found — settings cards unavailable.", store && Object.keys(store));
        return;
    }
    logger.info("ConnectedAccountsStore keys:", Object.keys(store));

    origGetAccounts = store.getAccounts.bind(store);
    store.getAccounts = (...args: any[]) => {
        const accounts = origGetAccounts!(...args) ?? [];
        const ours = ourAccounts().filter(a => !accounts.some((x: any) => x.type === a.type && x.name === a.name));
        return ours.length ? [...accounts, ...ours] : accounts;
    };

    // Re-render the list whenever our data changes.
    unsubMine = onMineChange(() => { try { store?.emitChange?.(); } catch { /* ignore */ } });

    installNetworkInterception();

    const tryLoad = () => {
        const { token } = useAuthorizationStore.getState();
        if (token && token !== lastToken) {
            lastToken = token;
            loadMine();
        }
    };
    tryLoad();
    unsubAuth = (useAuthorizationStore as any).subscribe(tryLoad);
}

export function refreshSettingsCard() {
    loadMine();
}

export function uninstallSettingsCard() {
    if (store && origGetAccounts) store.getAccounts = origGetAccounts;
    uninstallNetworkInterception();
    unsubMine?.();
    unsubMine = null;
    unsubAuth?.();
    unsubAuth = null;
    lastToken = null;
    origGetAccounts = null;
    store = null;
}
