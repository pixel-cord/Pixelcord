/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./styles.css";

import { ChatBarButton, ChatBarButtonFactory } from "@api/ChatButtons";
import { PixelCordDevs } from "@utils/constants";
import { classNameFactory } from "@utils/css";
import { classes } from "@utils/misc";
import definePlugin, { IconComponent } from "@utils/types";
import { showToast, Toasts } from "@webpack/common";

import { uploadImageMessage } from "./api";
import { renderTextToImage } from "./render";
import { settings } from "./settings";

const cl = classNameFactory("vc-imgmsg-");

const ImageIcon: IconComponent = ({ height = 20, width = 20, className }) => (
    <svg viewBox="0 0 24 24" height={height} width={width} className={className} fill="currentColor" aria-hidden>
        <path d="M21 3H3a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h18a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2zm0 16-5.5-7-4 5L8 13l-5 6V5h18v14z" />
    </svg>
);

const ChatBarRender: ChatBarButtonFactory = ({ isMainChat }) => {
    const { active } = settings.use(["active"]);
    if (!isMainChat) return null;

    return (
        <ChatBarButton
            tooltip={active ? "Send as image: ON (click to toggle)" : "Send as image: OFF (click to toggle)"}
            onClick={() => {
                const next = !settings.store.active;
                settings.store.active = next;
                showToast(next ? "🖼️ Messages will be sent as images" : "Sending as text again");
            }}
        >
            <ImageIcon className={classes(cl("icon"), active && cl("active"))} />
        </ChatBarButton>
    );
};

export default definePlugin({
    name: "ImageMessages",
    description: "Send your typed messages as an image hosted on Pixelcord — Discord never receives the text content, only an image link. Toggle from the chat button.",
    authors: [PixelCordDevs.myvings],
    dependencies: ["ChatInputButtonAPI"],
    settings,

    chatBarButton: {
        icon: ImageIcon,
        render: ChatBarRender
    },

    async onBeforeMessageSend(_channelId, message, options) {
        if (!settings.store.active || !message.content) return;
        if (options?.uploads?.length) return; // already sending files — leave as-is

        try {
            const png = renderTextToImage(message.content);
            const url = await uploadImageMessage(png);
            message.content = url;
        } catch (e) {
            // Cancel rather than fall back to plaintext, so the typed text never
            // reaches Discord when the user expected it hidden.
            showToast("Image message failed — not sent to avoid leaking the text.", Toasts.Type.FAILURE);
            return { cancel: true };
        }
    }
});
