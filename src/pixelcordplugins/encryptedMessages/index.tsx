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

import { openKeyModal } from "./KeyModal";
import { encryptContent, tryDecrypt } from "./messages";
import { settings } from "./settings";

const cl = classNameFactory("vc-encmsg-");

const KeyIcon: IconComponent = ({ height = 20, width = 20, className }) => (
    <svg viewBox="0 0 24 24" height={height} width={width} className={className} fill="currentColor" aria-hidden>
        <path d="M12.65 10C11.83 7.67 9.61 6 7 6c-3.31 0-6 2.69-6 6s2.69 6 6 6c2.61 0 4.83-1.67 5.65-4H17v4h4v-4h2v-4H12.65zM7 14c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2z" />
    </svg>
);

const ChatBarRender: ChatBarButtonFactory = ({ isMainChat }) => {
    const { enabled, key } = settings.use(["enabled", "key"]);
    if (!isMainChat) return null;

    const active = enabled;
    const tooltip = !active
        ? "Encrypted messages (right-click to toggle)"
        : key
            ? "Encryption: ON · personal key (right-click to toggle)"
            : "Encryption: ON · global key (right-click to toggle)";
    return (
        <ChatBarButton
            tooltip={tooltip}
            onClick={() => openKeyModal()}
            onContextMenu={() => {
                const next = !settings.store.enabled;
                settings.store.enabled = next;
                showToast(next ? "🔒 Encryption on" : "Encryption off");
            }}
            buttonProps={{ "aria-haspopup": "dialog" }}
        >
            <KeyIcon className={classes(cl("icon"), active && cl("active"))} />
        </ChatBarButton>
    );
};

export default definePlugin({
    name: "EncryptedMessages",
    description: "Encrypt messages with a shared key — only people with the same key can read them. Toggle and set the key from the chat button.",
    authors: [PixelCordDevs.myvings],
    dependencies: ["ChatInputButtonAPI", "MessageUpdaterAPI"],
    settings,

    chatBarButton: {
        icon: KeyIcon,
        render: ChatBarRender
    },

    flux: {
        MESSAGE_CREATE: ({ message }: any) => { tryDecrypt(message); },
        MESSAGE_UPDATE: ({ message }: any) => { tryDecrypt(message); },
        LOAD_MESSAGES_SUCCESS: ({ messages }: any) => { messages?.forEach((m: any) => tryDecrypt(m)); }
    },

    async onBeforeMessageSend(_channelId, message) {
        if (!settings.store.enabled || !message.content) return;
        const encrypted = await encryptContent(message.content);
        if (encrypted) message.content = encrypted;
    }
});
