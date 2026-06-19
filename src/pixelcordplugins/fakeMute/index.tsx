/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import { UserAreaButton, UserAreaRenderProps } from "@api/UserArea";
import { PixelCordDevs } from "@utils/constants";
import definePlugin, { OptionType } from "@utils/types";
import { MediaEngineStore, showToast, useEffect, useState, VoiceActions } from "@webpack/common";

// Whether we're currently faking a muted mic. Exported so the patched
// voiceStateUpdate can read it through $self.muteValue.
export let fakeMuted = false;

const settings = definePluginSettings({
    notify: {
        type: OptionType.BOOLEAN,
        description: "Show a toast when toggling",
        default: true
    }
});

// Tiny pub/sub so the panel button re-renders the moment we toggle.
const subscribers = new Set<() => void>();
const notifySubscribers = () => subscribers.forEach(fn => fn());

// A voiceStateUpdate is only emitted when the local mute/deaf state changes, and
// that update is what carries our patched self_mute flag to the server. So we
// flip self-mute (reading isSelfMute) to (re)apply our state without leaving the
// user stuck muted.

function enableFakeMute() {
    fakeMuted = true;

    // Always end UNMUTED locally (mic live) while the patch reports muted.
    if (MediaEngineStore.isSelfMute()) {
        VoiceActions.toggleSelfMute();
    } else {
        VoiceActions.toggleSelfMute();
        setTimeout(() => VoiceActions.toggleSelfMute(), 300);
    }
}

function disableFakeMute() {
    fakeMuted = false;

    // Net-zero toggle: same local state, but emits a voiceStateUpdate so the
    // server resyncs to our real (now un-patched) self_mute.
    VoiceActions.toggleSelfMute();
    setTimeout(() => VoiceActions.toggleSelfMute(), 300);
}

function toggleFakeMute() {
    if (fakeMuted) disableFakeMute();
    else enableFakeMute();

    notifySubscribers();
    if (settings.store.notify)
        showToast(fakeMuted ? "🔇 Fake mute: ON — others see you muted." : "🎙️ Fake mute: OFF");
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
    const [active, setActive] = useState(fakeMuted);

    useEffect(() => {
        const onChange = () => setActive(fakeMuted);
        subscribers.add(onChange);
        return () => void subscribers.delete(onChange);
    }, []);

    return (
        <UserAreaButton
            role="switch"
            aria-checked={active}
            aria-label="Fake Mute"
            tooltipText={hideTooltips ? undefined : (active ? "Fake Mute: on" : "Fake Mute")}
            redGlow={active}
            icon={<FakeMuteIcon className={iconForeground} />}
            onClick={toggleFakeMute}
        />
    );
}

export default definePlugin({
    name: "FakeMute",
    description: "Appear muted to everyone while your mic keeps transmitting. Toggle from the voice panel button.",
    authors: [PixelCordDevs.myvings],
    settings,

    patches: [
        {
            find: "}voiceStateUpdate(",
            replacement: {
                // Only override self_mute; leave self_deaf and self_video untouched.
                match: /self_mute:([^,]+),self_deaf:([^,]+),self_video:([^,]+)/,
                replace: "self_mute:$self.muteValue($1),self_deaf:$2,self_video:$3"
            }
        }
    ],

    userAreaButton: {
        icon: FakeMuteIcon,
        render: FakeMuteButton,
        priority: 0
    },

    // Called from the patched voiceStateUpdate: report muted while faking.
    muteValue: (realMute: boolean) => (fakeMuted ? true : realMute),

    // Don't leave the server thinking we're muted if the plugin is disabled
    // while fake mute is active.
    stop() {
        if (fakeMuted) {
            disableFakeMute();
            notifySubscribers();
        }
    }
});
