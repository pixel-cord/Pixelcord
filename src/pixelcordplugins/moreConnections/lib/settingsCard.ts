/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Logger } from "@utils/Logger";
import { findByProps, findStore } from "@webpack";

import { useAuthorizationStore } from "./auth";
import { getMine, loadMine, onMineChange, removeMine, setVisible } from "./mine";
import { PLATFORMS } from "./platforms";

const logger = new Logger("MoreConnections");
const OUR_TYPES = PLATFORMS.map(p => p.id);

let store: any = null;
let origGetAccounts: ((...args: any[]) => any) | null = null;
let unsubMine: (() => void) | null = null;
let unsubAuth: (() => void) | null = null;
// RestAPI overrides, so the card's toggle/X act on our backend instead of hitting
// Discord (which 404s "Unknown Connection" for our synthetic accounts).
let restApi: any = null;
let origPatch: ((...args: any[]) => any) | null = null;
let origDel: ((...args: any[]) => any) | null = null;
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

// The card's "Show on profile" toggle PATCHes, and the X DELETEs,
// /users/@me/connections/<type>/<id>. For our synthetic accounts Discord 404s,
// so intercept those RestAPI calls: apply the change to our backend and resolve
// with a fake success so Discord's UI never sees an error.
function ourType(url: string): string | null {
    const m = /\/connections\/([^/]+)\//.exec(url || "");
    return m && OUR_TYPES.includes(m[1]) ? m[1] : null;
}

const fakeOk = () => Promise.resolve({ ok: true, status: 200, body: {}, text: "", headers: {} });

function installRestInterception() {
    if (origPatch) return;
    restApi = findByProps("del", "put", "patch");
    if (!restApi?.patch || !restApi?.del) {
        logger.warn("RestAPI not found — card toggle/remove won't sync to our backend.", restApi && Object.keys(restApi));
        return;
    }
    logger.info("RestAPI keys:", Object.keys(restApi));

    origPatch = restApi.patch.bind(restApi);
    restApi.patch = (opts: any) => {
        const url = opts?.url ?? "";
        if (typeof url === "string" && url.includes("/connections/"))
            logger.info("RestAPI.patch connections:", url, JSON.stringify(opts?.body));
        const type = ourType(url);
        if (type) {
            setVisible(type, !!opts?.body?.visibility);
            return fakeOk();
        }
        return origPatch!(opts);
    };

    origDel = restApi.del.bind(restApi);
    restApi.del = (opts: any) => {
        const url = opts?.url ?? "";
        if (typeof url === "string" && url.includes("/connections/"))
            logger.info("RestAPI.del connections:", url);
        const type = ourType(url);
        if (type) {
            removeMine(type);
            return fakeOk();
        }
        return origDel!(opts);
    };
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

    installRestInterception();

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
    if (restApi && origPatch) restApi.patch = origPatch;
    if (restApi && origDel) restApi.del = origDel;
    origPatch = origDel = restApi = null;
    unsubMine?.();
    unsubMine = null;
    unsubAuth?.();
    unsubAuth = null;
    lastToken = null;
    origGetAccounts = null;
    store = null;
}
