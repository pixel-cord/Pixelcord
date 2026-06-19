/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import { UserAreaButton, UserAreaRenderProps } from "@api/UserArea";
import { PixelCordDevs } from "@utils/constants";
import definePlugin, { OptionType } from "@utils/types";
import { MediaEngineStore, showToast, useEffect, useState } from "@webpack/common";

// Master switch. While ON, the local mic keeps transmitting and remote audio
// keeps playing even though Discord's own mute/deafen buttons report muted /
// deafened to the server. The feature is driven entirely by the *normal* mute
// and deafen buttons — this plugin only suppresses the local media gating.
let fakeMode = false;

const settings = definePluginSettings({
    notify: {
        type: OptionType.BOOLEAN,
        description: "Show a toast when toggling fake mode",
        default: true
    }
});

// Tiny pub/sub so the panel button re-renders the moment we toggle.
const subscribers = new Set<() => void>();
const notifySubscribers = () => subscribers.forEach(fn => fn());

// --- connection prototype hook -------------------------------------------
// Discord applies your self-mute / self-deafen to the WebRTC layer via
// MediaEngineConnection.setSelfMute(mute) / setSelfDeaf(deaf). We wrap those on
// the *prototype* so that, while fakeMode is on, the connection is always told
// "not muted / not deafened" — keeping your media live — no matter what the UI
// and the server believe. Patching the prototype (not an instance) means the
// hook survives channel switches and reconnects automatically.

const HOOKED = Symbol.for("pixelcord.fakeMute.hooked");
// The originals are stashed on the prototype too, so a hot-reloaded module (which
// loses its module-level refs but sees proto[HOOKED] already set) can recover them
// instead of leaving reconcile()/unhook() as no-ops with a broken setSelfMute.
const ORIG_MUTE = Symbol.for("pixelcord.fakeMute.origSetSelfMute");
const ORIG_DEAF = Symbol.for("pixelcord.fakeMute.origSetSelfDeaf");
let hookedProto: any = null;
let origSetSelfMute: ((this: any, mute: boolean) => void) | null = null;
let origSetSelfDeaf: ((this: any, deaf: boolean) => void) | null = null;

function getConnections(): any[] {
    const engine = MediaEngineStore.getMediaEngine?.();
    const set = engine?.connections;
    return set ? [...set] : [];
}

// Patch the connection prototype once, as soon as any connection exists.
function ensureHooked() {
    if (hookedProto) return;

    const conn = getConnections()[0];
    if (!conn) return;

    const proto = Object.getPrototypeOf(conn);
    if (proto[HOOKED]) {
        // Already hooked (likely a previous load) — recover the captured originals.
        origSetSelfMute = proto[ORIG_MUTE] ?? null;
        origSetSelfDeaf = proto[ORIG_DEAF] ?? null;
        hookedProto = proto;
        return;
    }

    origSetSelfMute = proto.setSelfMute;
    origSetSelfDeaf = proto.setSelfDeaf;
    proto[ORIG_MUTE] = origSetSelfMute;
    proto[ORIG_DEAF] = origSetSelfDeaf;

    proto.setSelfMute = function (mute: boolean) {
        return origSetSelfMute!.call(this, fakeMode ? false : mute);
    };
    proto.setSelfDeaf = function (deaf: boolean) {
        return origSetSelfDeaf!.call(this, fakeMode ? false : deaf);
    };

    proto[HOOKED] = true;
    hookedProto = proto;
}

function unhook() {
    if (!hookedProto) return;
    const origMute = origSetSelfMute ?? hookedProto[ORIG_MUTE];
    const origDeaf = origSetSelfDeaf ?? hookedProto[ORIG_DEAF];
    if (origMute) hookedProto.setSelfMute = origMute;
    if (origDeaf) hookedProto.setSelfDeaf = origDeaf;
    delete hookedProto[HOOKED];
    delete hookedProto[ORIG_MUTE];
    delete hookedProto[ORIG_DEAF];
    hookedProto = null;
    origSetSelfMute = origSetSelfDeaf = null;
}

// Force live connection(s) to match what we want *right now*, bypassing the
// fakeMode gate via the originals: when enabling we re-open media that the
// buttons may already have cut; when disabling we restore the real state so the
// WebRTC layer matches the buttons again.
function reconcile() {
    for (const conn of getConnections()) {
        origSetSelfMute?.call(conn, fakeMode ? false : MediaEngineStore.isSelfMute());
        origSetSelfDeaf?.call(conn, fakeMode ? false : MediaEngineStore.isSelfDeaf());
    }
}

function setFakeMode(on: boolean) {
    fakeMode = on;
    ensureHooked();
    reconcile();

    notifySubscribers();
    if (settings.store.notify)
        showToast(on
            ? "🫥 Fake mode: ON — mute/deafen now lie to everyone."
            : "🎙️ Fake mode: OFF");
}

const toggleFakeMode = () => setFakeMode(!fakeMode);

// If fake mode is on, a fresh connection (just joined / reconnected) may have
// come up muted or deafened before the prototype was patched — re-open it.
function onMediaChange() {
    if (!fakeMode) return;
    ensureHooked();
    reconcile();
}

function FakeMuteIcon({ className }: { className?: string; }) {
    return (
        <svg className={className} width="20" height="20" viewBox="0 0 13 13" fill="currentColor" aria-hidden="true">
            <path d="M8.46094 8.31445C7.27148 8.31445 6.39844 7.42969 6.39844 6.12891V2.18555C6.39844 0.890625 7.27148 0 8.46094 0C9.64453 0 10.5176 0.890625 10.5176 2.18555V6.12891C10.5176 7.42969 9.64453 8.31445 8.46094 8.31445ZM1.01953 3.14062C0.457031 3.14062 0 2.68359 0 2.12695C0 1.56445 0.457031 1.10742 1.01953 1.10742C1.58203 1.10742 2.03906 1.56445 2.03906 2.12695C2.03906 2.68359 1.58203 3.14062 1.01953 3.14062ZM1.01953 6.24023C0.457031 6.24023 0 5.7832 0 5.22656C0 4.66406 0.457031 4.20703 1.01953 4.20703C1.58203 4.20703 2.03906 4.66406 2.03906 5.22656C2.03906 5.7832 1.58203 6.24023 1.01953 6.24023ZM5.77148 12.8438C5.4668 12.8438 5.21484 12.5977 5.21484 12.2988C5.21484 11.9941 5.4668 11.748 5.77148 11.748H7.92188V10.541C5.60156 10.3242 4.00781 8.66602 4.00781 6.26367V5.10352C4.00781 4.79883 4.25391 4.55859 4.55859 4.55859C4.86328 4.55859 5.11523 4.79883 5.11523 5.10352V6.22266C5.11523 8.21484 6.46289 9.5332 8.46094 9.5332C10.459 9.5332 11.8066 8.21484 11.8066 6.22266V5.10352C11.8066 4.79883 12.0527 4.55859 12.3574 4.55859C12.6621 4.55859 12.9082 4.79883 12.9082 5.10352V6.26367C12.9082 8.66602 11.3145 10.3242 8.99414 10.541V11.748H11.1504C11.4492 11.748 11.7012 11.9941 11.7012 12.2988C11.7012 12.5977 11.4492 12.8438 11.1504 12.8438H5.77148ZM1.01953 9.35156C0.457031 9.35156 0 8.89453 0 8.33203C0 7.76953 0.457031 7.3125 1.01953 7.3125C1.58203 7.3125 2.03906 7.76953 2.03906 8.33203C2.03906 8.89453 1.58203 9.35156 1.01953 9.35156ZM1.01953 12.4512C0.457031 12.4512 0 11.9941 0 11.4316C0 10.8691 0.457031 10.4121 1.01953 10.4121C1.58203 10.4121 2.03906 10.8691 2.03906 11.4316C2.03906 11.9941 1.58203 12.4512 1.01953 12.4512Z" />
        </svg>
    );
}

function FakeMuteButton({ iconForeground, hideTooltips }: UserAreaRenderProps) {
    const [active, setActive] = useState(fakeMode);

    useEffect(() => {
        const onChange = () => setActive(fakeMode);
        subscribers.add(onChange);
        return () => void subscribers.delete(onChange);
    }, []);

    return (
        <UserAreaButton
            role="switch"
            aria-checked={active}
            aria-label="Fake Mode"
            tooltipText={hideTooltips ? undefined : (active ? "Fake mute/deafen: on" : "Fake mute/deafen")}
            redGlow={active}
            icon={<FakeMuteIcon className={iconForeground} />}
            onClick={toggleFakeMode}
        />
    );
}

export default definePlugin({
    name: "FakeMute",
    description: "Master toggle for a fake mute/deafen: turn it on, then use Discord's normal mute & deafen buttons — others see you muted/deafened while your mic keeps transmitting and you keep hearing.",
    authors: [PixelCordDevs.myvings],
    settings,

    userAreaButton: {
        icon: FakeMuteIcon,
        render: FakeMuteButton,
        priority: 0
    },

    start() {
        MediaEngineStore.addChangeListener(onMediaChange);
    },

    // Restore the real mute/deafen state to the connection and remove the hook,
    // so disabling the plugin never leaves you secretly transmitting.
    stop() {
        MediaEngineStore.removeChangeListener(onMediaChange);
        fakeMode = false;
        reconcile();
        unhook();
        notifySubscribers();
    }
});
