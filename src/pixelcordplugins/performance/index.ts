/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import { PixelCordDevs } from "@utils/constants";
import definePlugin, { OptionType } from "@utils/types";

let styleEl: HTMLStyleElement | null = null;

const settings = definePluginSettings({
    disableBlur: {
        type: OptionType.BOOLEAN,
        description: "Disable background blur (backdrop-filter) — usually the biggest GPU win",
        default: true,
        onChange: () => apply()
    },
    reduceAnimations: {
        type: OptionType.BOOLEAN,
        description: "Make animations and transitions near-instant for a snappier feel",
        default: true,
        onChange: () => apply()
    },
    disableShadows: {
        type: OptionType.BOOLEAN,
        description: "Remove box-shadows (small extra win, flatter look)",
        default: false,
        onChange: () => apply()
    }
});

function buildCss(): string {
    const { disableBlur, reduceAnimations, disableShadows } = settings.store;
    let css = "";
    // Only kill backdrop-filter (the glassy UI backgrounds). filter: blur() is left
    // alone on purpose so spoilers / blurred attachments stay blurred.
    if (disableBlur)
        css += "*{backdrop-filter:none!important;-webkit-backdrop-filter:none!important;}";
    if (reduceAnimations)
        css += "*,*::before,*::after{animation-duration:.01ms!important;animation-delay:0ms!important;transition-duration:.01ms!important;transition-delay:0ms!important;}";
    if (disableShadows)
        css += "*{box-shadow:none!important;}";
    return css;
}

function apply() {
    if (!styleEl) {
        styleEl = document.createElement("style");
        styleEl.id = "pixelcord-performance";
        document.head.appendChild(styleEl);
    }
    styleEl.textContent = buildCss();
}

export default definePlugin({
    name: "Performance",
    description: "Make Discord feel snappier by cutting expensive visual effects (blur, animations, shadows).",
    authors: [PixelCordDevs.myvings],
    settings,

    start() {
        apply();
    },

    stop() {
        styleEl?.remove();
        styleEl = null;
    }
});
