/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./styles.css";

import { ChatBarButton, ChatBarButtonFactory } from "@api/ChatButtons";
import { updateMessage } from "@api/MessageUpdater";
import { PixelCordDevs } from "@utils/constants";
import { classNameFactory } from "@utils/css";
import { classes } from "@utils/misc";
import definePlugin, { IconComponent } from "@utils/types";
import { showToast } from "@webpack/common";

import { decrypt, encrypt } from "./crypto";
import { openKeyModal } from "./KeyModal";
import { settings } from "./settings";

const cl = classNameFactory("vc-encmsg-");

// Invisible (zero-width) prefix marking an encrypted message; the rest is base64
// ciphertext. No visible lock is added to the message.
const MARKER = "\u200b\u200c";

const KeyIcon: IconComponent = ({ height = 20, width = 20, className }) => (
    <svg viewBox="0 0 24 24" height={height} width={width} className={className} fill="currentColor" aria-hidden>
        <path d="M12.65 10C11.83 7.67 9.61 6 7 6c-3.31 0-6 2.69-6 6s2.69 6 6 6c2.61 0 4.83-1.67 5.65-4H17v4h4v-4h2v-4H12.65zM7 14c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2z" />
    </svg>
);

const ChatBarRender: ChatBarButtonFactory = ({ isMainChat }) => {
    const { enabled, key } = settings.use(["enabled", "key"]);
    if (!isMainChat) return null;

    const active = enabled && !!key;
    return (
        <ChatBarButton
            tooltip={active ? "Encryption: ON (right-click to toggle)" : "Encrypted messages (right-click to toggle)"}
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

async function tryDecrypt(message: any) {
    const { key } = settings.store;
    if (!key || typeof message?.content !== "string" || !message.content.startsWith(MARKER)) return;

    const plain = await decrypt(message.content.slice(MARKER.length), key);
    if (plain == null) return; // wrong key / unreadable

    updateMessage(message.channel_id, message.id, { content: plain });
}

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
        const { enabled, key } = settings.store;
        if (!enabled || !key || !message.content) return;
        if (message.content.startsWith(MARKER)) return;
        message.content = MARKER + await encrypt(message.content, key);
    }
});
