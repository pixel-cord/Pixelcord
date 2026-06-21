/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import ErrorBoundary from "@components/ErrorBoundary";
import { ChannelType } from "@vencord/discord-types/enums";
import { ChannelStore, createRoot, React } from "@webpack/common";
import type { Root } from "react-dom/client";

import { VoiceChannelLogPopover } from "./components/VoiceChannelLogPopover";
import { getVcLogs } from "./logs";
import settings from "./settings";

// Voice channels in the sidebar are list items tagged `data-list-item-id="channels___<id>"`
// — a stable Discord DOM attribute, so we hook hover here instead of patching the
// (class) voice channel component, which is fragile to craft blind.
const PREFIX = "channels___";
const ROW_SELECTOR = `[data-list-item-id^="${PREFIX}"]`;
const POPOVER_SELECTOR = ".vc-voice-channel-log-popover";
const VOICE_TYPES = new Set([ChannelType.GUILD_VOICE, ChannelType.GUILD_STAGE_VOICE]);

const POPOVER_WIDTH = 340;
const POPOVER_MAX_HEIGHT = 360;
const GAP = 8;
const HIDE_DELAY = 200;

type HoverState = { channelId: string; rect: DOMRect; } | null;

let state: HoverState = null;
let listeners: (() => void)[] = [];

const subscribe = (listener: () => void) => {
    listeners = [...listeners, listener];
    return () => { listeners = listeners.filter(l => l !== listener); };
};
const getState = () => state;
const setState = (next: HoverState) => {
    state = next;
    listeners.forEach(l => l());
};

let hideTimer: ReturnType<typeof setTimeout> | undefined;
const cancelHide = () => clearTimeout(hideTimer);
const scheduleHide = () => {
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => setState(null), HIDE_DELAY);
};

// Anchor to the right of the row, flipping to the left edge if it would overflow,
// and clamp vertically so the popover stays on screen.
function computeStyle(rect: DOMRect): React.CSSProperties {
    let left = rect.right + GAP;
    if (left + POPOVER_WIDTH > window.innerWidth) {
        left = Math.max(GAP, rect.left - POPOVER_WIDTH - GAP);
    }
    const top = Math.max(GAP, Math.min(rect.top, window.innerHeight - POPOVER_MAX_HEIGHT - GAP));
    return { top, left };
}

function PopoverRoot() {
    const current = React.useSyncExternalStore(subscribe, getState);
    if (!current) return null;

    const channel = ChannelStore.getChannel(current.channelId);
    if (!channel) return null;

    return (
        <ErrorBoundary noop>
            <VoiceChannelLogPopover
                channel={channel}
                style={computeStyle(current.rect)}
                onMouseEnter={cancelHide}
                onMouseLeave={scheduleHide}
            />
        </ErrorBoundary>
    );
}

function onMouseOver(e: MouseEvent) {
    if (!settings.store.hoverPopover) return;

    const row = (e.target as HTMLElement | null)?.closest?.(ROW_SELECTOR) as HTMLElement | null;
    if (!row) return;

    const channelId = row.getAttribute("data-list-item-id")!.slice(PREFIX.length);
    if (!/^\d+$/.test(channelId)) return; // skip nested voice-user rows

    const channel = ChannelStore.getChannel(channelId);
    if (!channel || !VOICE_TYPES.has(channel.type)) return;
    if (getVcLogs(channelId).length === 0) return; // nothing to show

    cancelHide();
    if (state?.channelId === channelId) return; // already showing this one
    setState({ channelId, rect: row.getBoundingClientRect() });
}

function onMouseOut(e: MouseEvent) {
    if (!state) return;

    const to = e.relatedTarget as HTMLElement | null;
    if (to?.closest?.(ROW_SELECTOR) || to?.closest?.(POPOVER_SELECTOR)) return;

    scheduleHide();
}

let root: Root | null = null;
let container: HTMLDivElement | null = null;

export function mountHoverPopover() {
    if (container) return;

    container = document.createElement("div");
    container.className = "vc-voice-channel-log-hover-root";
    document.body.appendChild(container);

    root = createRoot(container);
    root.render(<PopoverRoot />);

    document.addEventListener("mouseover", onMouseOver);
    document.addEventListener("mouseout", onMouseOut);
}

export function unmountHoverPopover() {
    document.removeEventListener("mouseover", onMouseOver);
    document.removeEventListener("mouseout", onMouseOut);
    clearTimeout(hideTimer);
    setState(null);

    root?.unmount();
    root = null;
    container?.remove();
    container = null;
}
