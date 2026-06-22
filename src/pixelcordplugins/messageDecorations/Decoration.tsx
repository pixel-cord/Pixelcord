/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { addMessageAccessory, removeMessageAccessory } from "@api/MessageAccessories";
import { updateMessage } from "@api/MessageUpdater";
import { classNameFactory } from "@utils/css";
import { MessageStore, SelectedChannelStore, useLayoutEffect } from "@webpack/common";

import { getDecoration } from "./api";
import { decodeMarker, MARKER_HINT } from "./markers";

const cl = classNameFactory("vc-msgdeco-");
const ACCESSORY_ID = "MessageDecorations";

// messageId -> decorationId, filled as messages carrying a marker arrive. Bounded so a
// long-running session can't grow it without limit; oldest entries fall off first.
const MAX_CACHE = 5000;
const cache = new Map<string, string>();

function remember(messageId: string, decorationId: string) {
    cache.delete(messageId); // re-insert to bump it to newest in insertion order
    cache.set(messageId, decorationId);
    if (cache.size > MAX_CACHE) cache.delete(cache.keys().next().value as string);
}

/**
 * Handles an incoming message off the flux events: pulls the hidden decoration id out
 * of the content, remembers it, and re-renders the message with the marker stripped so
 * the accessory can style it and the displayed text stays clean. Mirrors the
 * EncryptedMessages receive flow. Idempotent — a message with no marker does nothing.
 */
export function handleIncoming(message: any) {
    if (typeof message?.content !== "string" || !message.content.includes(MARKER_HINT)) return;

    const { id, cleaned } = decodeMarker(message.content);
    if (id) remember(message.id, id); // set before the re-render so the accessory sees it
    if (cleaned !== message.content)
        updateMessage(message.channel_id, message.id, { content: cleaned });
}

// Rendered once per message by the accessory API. It draws nothing of its own; instead
// it turns the message's real content node into the CSS balloon and drops the character
// art next to it. Working on the real content node is what makes the balloon stretch
// with the text for free, short messages and long ones alike.
function DecorationAccessory({ message }: { message: any; }) {
    const decoId = message?.id ? cache.get(message.id) : undefined;
    const deco = decoId ? getDecoration(decoId) : undefined;

    useLayoutEffect(() => {
        if (!deco) return;

        // Both ids are long-standing, stable Discord DOM conventions (the same ones
        // messageLogger and quickReply rely on).
        const content = document.getElementById(`message-content-${message.id}`);
        if (!content) return;

        content.classList.add(cl("balloon"));
        content.dataset.vcMsgdecoPos = deco.position;
        // Colours arrive as CSS custom properties. They're validated hex (see api.ts),
        // and setProperty values can't break out of the declaration anyway.
        content.style.setProperty("--vc-msgdeco-border", deco.borderColor);
        content.style.setProperty("--vc-msgdeco-bg", deco.backgroundColor);
        content.style.setProperty("--vc-msgdeco-text", deco.textColor);

        // The character is a plain <img>, never inline SVG, so even an SVG asset loads in
        // image mode with no script execution. It's anchored to a bottom corner of the
        // balloon (see CSS) — out of the text flow — so it stays put on short and long
        // messages alike and is never clipped. CSS handles which side via data-pos, so
        // here we just make sure it exists as a child.
        let character = content.querySelector<HTMLImageElement>(`:scope > .${cl("character")}`);
        if (!character) {
            character = document.createElement("img");
            character.className = cl("character");
            character.alt = "";
            character.setAttribute("aria-hidden", "true");
            content.appendChild(character);
        }
        if (character.src !== deco.character) character.src = deco.character;

        return () => {
            content.classList.remove(cl("balloon"));
            delete content.dataset.vcMsgdecoPos;
            content.style.removeProperty("--vc-msgdeco-border");
            content.style.removeProperty("--vc-msgdeco-bg");
            content.style.removeProperty("--vc-msgdeco-text");
            character?.remove();
        };
    }, [deco, message.id]);

    return null;
}

export function registerAccessory() {
    // The accessory renders nothing visible (it styles the content node via an effect),
    // so its position among the real accessories doesn't matter.
    addMessageAccessory(ACCESSORY_ID, (props: any) => <DecorationAccessory message={props.message} />);
}

export function unregisterAccessory() {
    removeMessageAccessory(ACCESSORY_ID);
}

/**
 * Re-renders the decorated messages currently loaded in the open channel. Used after
 * the catalog finishes loading so already-received messages get their decoration
 * without needing to reopen the channel.
 */
export function rerenderVisible() {
    const channelId = SelectedChannelStore.getChannelId();
    if (!channelId) return;

    const messages: any[] = (MessageStore.getMessages(channelId) as any)?._array ?? [];
    for (const m of messages) if (cache.has(m.id)) updateMessage(channelId, m.id);
}
