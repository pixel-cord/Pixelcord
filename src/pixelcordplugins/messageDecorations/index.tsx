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
import { showToast } from "@webpack/common";

import { loadCatalog } from "./api";
import { handleIncoming, registerAccessory, rerenderVisible, unregisterAccessory } from "./Decoration";
import { encodeMarker } from "./markers";
import { openPicker } from "./Picker";
import { settings } from "./settings";

const cl = classNameFactory("vc-msgdeco-");

const DecoIcon: IconComponent = ({ height = 20, width = 20, className }) => (
    <svg viewBox="0 0 24 24" height={height} width={width} className={className} fill="currentColor" aria-hidden>
        <path d="M12 2l1.6 4.4L18 8l-4.4 1.6L12 14l-1.6-4.4L6 8l4.4-1.6L12 2zm6.5 10.5l.85 2.65 2.65.85-2.65.85-.85 2.65-.85-2.65L15 16.5l2.65-.85.85-2.65zM5.5 13l.7 2.3 2.3.7-2.3.7L5.5 19l-.7-2.3L2.5 16l2.3-.7L5.5 13z" />
    </svg>
);

const ChatBarRender: ChatBarButtonFactory = ({ isMainChat }) => {
    const { activeDecorationId } = settings.use(["activeDecorationId"]);
    if (!isMainChat) return null;

    const active = !!activeDecorationId;
    return (
        <ChatBarButton
            tooltip={active ? "Message decoration: ON (right-click to clear)" : "Pick a message decoration"}
            onClick={() => openPicker()}
            onContextMenu={() => {
                if (!settings.store.activeDecorationId) return;
                settings.store.activeDecorationId = "";
                showToast("Decoration off");
            }}
            buttonProps={{ "aria-haspopup": "dialog" }}
        >
            <DecoIcon className={classes(cl("icon"), active && cl("active"))} />
        </ChatBarButton>
    );
};

export default definePlugin({
    name: "MessageDecorations",
    description: "Wrap your messages in a TikTok-style frame with a character — chosen per message and visible to everyone using Pixelcord. Pick one from the chat button.",
    authors: [PixelCordDevs.myvings, PixelCordDevs.outlayer],
    // ChatInputButtonAPI: the picker button. MessageUpdaterAPI: re-render a message once
    // we've decoded its marker. MessageAccessoriesAPI: the per-message render hook that
    // turns the message into the decorated balloon.
    dependencies: ["ChatInputButtonAPI", "MessageUpdaterAPI", "MessageAccessoriesAPI"],
    settings,

    chatBarButton: {
        icon: DecoIcon,
        render: ChatBarRender
    },

    // On every inbound path we decode the hidden marker, cache messageId -> decorationId,
    // strip the marker, and re-render so the decoration shows.
    flux: {
        MESSAGE_CREATE: ({ message }: any) => handleIncoming(message),
        MESSAGE_UPDATE: ({ message }: any) => handleIncoming(message),
        LOAD_MESSAGES_SUCCESS: ({ messages }: any) => messages?.forEach((m: any) => handleIncoming(m))
    },

    start() {
        registerAccessory();
        // Warm the catalog so decorations can render, then refresh anything already on
        // screen. Fire-and-forget so a slow network never blocks plugin startup.
        loadCatalog().then(rerenderVisible).catch(() => { });
    },

    stop() {
        unregisterAccessory();
    },

    onBeforeMessageSend(_channelId, message) {
        const id = settings.store.activeDecorationId;
        if (!id || !message.content) return;

        const marker = encodeMarker(id, settings.store.activeStyle);
        if (!marker) return;

        // Stay within Discord's 2000-char limit — if the marker wouldn't fit, send the
        // message plain rather than have Discord reject it.
        if (message.content.length + marker.length > 2000) return;

        // Append the invisible marker; the visible text is untouched.
        message.content += marker;
    }
});
