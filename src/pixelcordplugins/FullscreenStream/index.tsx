/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./style.css";

import { definePluginSettings } from "@api/Settings";
import { PixelCordDevs } from "@utils/constants";
import definePlugin, { OptionType } from "@utils/types";

const enum FitMode {
    Cover = "cover",
    Fill = "fill",
    Contain = "contain"
}

const VIDEO_TILE = "[data-selenium-video-tile]";
const ACTIVE_CLASS = "vc-fss-active";

function applyFitMode() {
    document.documentElement.style.setProperty("--vc-fss-fit", settings.store.fitMode || FitMode.Cover);
}

function applyEmbeddedFill() {
    document.documentElement.classList.toggle("vc-fss-fill-embedded", settings.store.fillEmbedded);
}

const settings = definePluginSettings({
    fitMode: {
        type: OptionType.SELECT,
        description: "How the stream fills the screen when in fullscreen",
        options: [
            { label: "Fill screen, crop a little (no black bars, recommended)", value: FitMode.Cover, default: true },
            { label: "Stretch to fill (may look distorted)", value: FitMode.Fill },
            { label: "Keep aspect ratio (may show black bars)", value: FitMode.Contain },
        ],
        onChange: applyFitMode
    },
    doubleClickFullscreen: {
        type: OptionType.BOOLEAN,
        description: "Double-click a stream to toggle real fullscreen",
        default: true
    },
    hotkey: {
        type: OptionType.STRING,
        description: "Key to toggle fullscreen on the hovered/active stream (single key, like on Twitch/YouTube). Leave empty to disable.",
        default: "F"
    },
    fillEmbedded: {
        type: OptionType.BOOLEAN,
        description: "Also remove black bars in the normal (non-fullscreen) call player. Note: this can crop webcams too.",
        default: false,
        onChange: applyEmbeddedFill
    }
});

let hoveredVideo: HTMLVideoElement | null = null;

function getVideoFrom(target: EventTarget | null): HTMLVideoElement | null {
    const el = target as HTMLElement | null;
    if (!el?.closest) return null;

    const tile = el.closest(VIDEO_TILE);
    if (tile) return tile.querySelector("video");

    // Fallback for the floating multitasking popout, which isn't a video tile
    return el.closest("video") as HTMLVideoElement | null;
}

function getLargestStreamVideo(): HTMLVideoElement | null {
    let best: HTMLVideoElement | null = null;
    let bestArea = 0;

    for (const v of document.querySelectorAll<HTMLVideoElement>(`${VIDEO_TILE} video`)) {
        const { width, height } = v.getBoundingClientRect();
        const area = width * height;
        if (area > bestArea) {
            bestArea = area;
            best = v;
        }
    }

    return best;
}

function toggleFullscreen(video: HTMLVideoElement | null) {
    if (!video) return;

    if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => { });
        return;
    }

    // Fullscreen the tile *container*, never the raw <video>. Putting a
    // hardware-accelerated video element straight into fullscreen makes
    // Discord/Electron render it as a green screen, so we fullscreen its
    // wrapper instead and let CSS stretch the video to fill it.
    const target = (video.closest(VIDEO_TILE) as HTMLElement | null) ?? video;
    target.classList.add(ACTIVE_CLASS);
    target.requestFullscreen().catch(() => target.classList.remove(ACTIVE_CLASS));
}

function isTyping() {
    const el = document.activeElement as HTMLElement | null;
    if (!el) return false;
    return el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable;
}

function onDblClick(e: MouseEvent) {
    if (!settings.store.doubleClickFullscreen) return;

    const target = e.target as HTMLElement;
    // Don't hijack double-clicks on overlay buttons (e.g. the tile's own controls)
    if (target.closest?.("button, [role='button']")) return;

    const video = getVideoFrom(target);
    if (!video) return;

    // Replace Discord's own "theater" double-click with true fullscreen
    e.preventDefault();
    e.stopPropagation();
    toggleFullscreen(video);
}

function onMouseOver(e: MouseEvent) {
    if (!settings.store.hotkey?.trim()) return;
    const video = getVideoFrom(e.target);
    if (video) hoveredVideo = video;
}

function onKeyDown(e: KeyboardEvent) {
    const key = settings.store.hotkey?.trim();
    if (!key || e.ctrlKey || e.altKey || e.metaKey || e.repeat) return;
    if (e.key.toLowerCase() !== key.toLowerCase()) return;
    if (isTyping()) return;

    const video = hoveredVideo?.isConnected ? hoveredVideo : getLargestStreamVideo();
    if (!video) return;

    e.preventDefault();
    toggleFullscreen(video);
}

function onFullscreenChange() {
    if (!document.fullscreenElement)
        document.querySelectorAll(`.${ACTIVE_CLASS}`).forEach(el => el.classList.remove(ACTIVE_CLASS));
}

export default definePlugin({
    name: "FullscreenStream",
    description: "Watch screen-share streams in true fullscreen that fills the entire screen with no black bars. Double-click a stream (or press F) to toggle.",
    authors: [PixelCordDevs.outlayer],
    tags: ["Voice", "Media", "Appearance"],
    settings,

    start() {
        applyFitMode();
        applyEmbeddedFill();
        document.addEventListener("dblclick", onDblClick, true);
        document.addEventListener("mouseover", onMouseOver, true);
        document.addEventListener("keydown", onKeyDown, true);
        document.addEventListener("fullscreenchange", onFullscreenChange);
    },

    stop() {
        document.removeEventListener("dblclick", onDblClick, true);
        document.removeEventListener("mouseover", onMouseOver, true);
        document.removeEventListener("keydown", onKeyDown, true);
        document.removeEventListener("fullscreenchange", onFullscreenChange);

        document.documentElement.classList.remove("vc-fss-fill-embedded");
        document.documentElement.style.removeProperty("--vc-fss-fit");
        if (document.fullscreenElement) document.exitFullscreen().catch(() => { });
        document.querySelectorAll(`.${ACTIVE_CLASS}`).forEach(el => el.classList.remove(ACTIVE_CLASS));
        hoveredVideo = null;
    }
});
