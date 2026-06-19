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
    if (proto[HOOKED]) { hookedProto = proto; return; }

    origSetSelfMute = proto.setSelfMute;
    origSetSelfDeaf = proto.setSelfDeaf;

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
    if (origSetSelfMute) hookedProto.setSelfMute = origSetSelfMute;
    if (origSetSelfDeaf) hookedProto.setSelfDeaf = origSetSelfDeaf;
    delete hookedProto[HOOKED];
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
        <svg className={className} width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M12 2.5a3 3 0 0 0-3 3V11a3 3 0 0 0 6 0V5.5a3 3 0 0 0-3-3Z" />
            <path d="M5.5 10.25a1 1 0 0 1 2 0 4.5 4.5 0 0 0 9 0 1 1 0 1 1 2 0 6.5 6.5 0 0 1-5.5 6.42v2.08a1 1 0 1 1-2 0v-2.08A6.5 6.5 0 0 1 5.5 10.25Z" />
            <path d="M3.8 3.1a1 1 0 0 0-1.4 1.4l17 17a1 1 0 0 0 1.4-1.4l-17-17Z" />
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
