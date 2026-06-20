/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { updateMessage } from "@api/MessageUpdater";
import { findStoreLazy } from "@webpack";
import { MessageStore, SelectedChannelStore } from "@webpack/common";

import { decryptAny, encrypt } from "./crypto";
import { settings } from "./settings";

// Holds the small "replied to" preview copies of messages, separate from the main
// MessageStore — so a decrypted reply preview needs to be updated here too.
const ReferencedMessageStore = findStoreLazy("ReferencedMessageStore");

// An encrypted message is just its base64 ciphertext — no marker. We only try to
// decrypt content that looks like pure base64 of plausible length, so normal
// messages are skipped cheaply.
const LOOKS_BASE64 = /^[A-Za-z0-9+/]{32,}={0,2}$/;
// Strip a leading marker left by older versions (🔐 or zero-width chars).
const LEADING_MARKER = /^[\u200B-\u200F\uFEFF\u{1F510}]+/u;

// Built-in shared key, used when encryption is on but the user set no personal key.
// It lives in the source, so a "global" message is only hidden from Discord and
// people without the plugin — every Pixelcord user can read it. A personal key is
// what gives real privacy.
const GLOBAL_KEY = "pixelcord-global-encrypted-messages-v1";

// Key used to encrypt outgoing messages: the personal one if set, else the global.
function encryptionKey(): string {
    return settings.store.key || GLOBAL_KEY;
}

// Keys to try when decrypting: the personal one (if any) first, then the global —
// so you can always read global messages even with a personal key set.
function candidateKeys(): string[] {
    const { key } = settings.store;
    return key ? [key, GLOBAL_KEY] : [GLOBAL_KEY];
}

export async function encryptContent(text: string): Promise<string | null> {
    return encrypt(text, encryptionKey());
}

// Returns the plaintext for an encrypted-looking content string, or null. Tries the
// personal key then the global one.
async function decryptContent(content: string): Promise<string | null> {
    const cleaned = content.replace(LEADING_MARKER, "").trim();
    if (!LOOKS_BASE64.test(cleaned)) return null;

    for (const key of candidateKeys()) {
        const plain = await decryptAny(cleaned, key);
        if (plain != null) return plain;
    }
    return null;
}

export async function tryDecrypt(message: any) {
    if (typeof message?.content !== "string") return;

    // A reply carries a snapshot of the message it answers (in the gateway payload
    // and in ReferencedMessageStore) — decrypt those previews too.
    void tryDecryptReply(message);

    const plain = await decryptContent(message.content);
    if (plain == null) return; // not our ciphertext / wrong key

    updateMessage(message.channel_id, message.id, { content: plain });
}

// Decrypts the "replied to" preview shown above a reply. The preview is rendered
// from ReferencedMessageStore, a cache separate from MessageStore, so decrypting
// the original bubble doesn't update it on its own.
async function tryDecryptReply(message: any) {
    const reference = message?.messageReference ?? message?.message_reference;
    if (!reference) return;

    const record = ReferencedMessageStore?.getMessageByReference?.(reference);
    const refMsg = record?.message;
    if (!refMsg || typeof refMsg.content !== "string") return;

    const plain = await decryptContent(refMsg.content);
    if (plain == null) return;

    const channelId = reference.channel_id ?? refMsg.channel_id;
    const newMsg = typeof refMsg.merge === "function" ? refMsg.merge({ content: plain }) : { ...refMsg, content: plain };
    try {
        const cache = ReferencedMessageStore.getOrCreate(channelId);
        cache.set(refMsg.id, { ...record, message: newMsg });
        ReferencedMessageStore.commit?.(cache);
        ReferencedMessageStore.emitChange?.();
    } catch {
        // store internals changed — best effort, the main message still decrypts
    }
}

// Re-decrypt the already-loaded messages in the open channel — used after the key
// is set, so old messages decrypt without needing to reopen the channel.
export function redecryptVisible() {
    const channelId = SelectedChannelStore.getChannelId();
    if (!channelId) return;

    const messages: any[] = (MessageStore.getMessages(channelId) as any)?._array ?? [];
    for (const message of messages) tryDecrypt(message);
}
