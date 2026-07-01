/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { addMessageAccessory, removeMessageAccessory } from "@api/MessageAccessories";
import { updateMessage } from "@api/MessageUpdater";
import { classNameFactory } from "@utils/css";
import { ChannelStore, IconUtils, MessageStore, SelectedChannelStore, useLayoutEffect } from "@webpack/common";

import { getDecoration } from "./api";
import { decodeMarker, MARKER_HINT } from "./markers";
import { settings } from "./settings";

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

// Rendered once per message by the accessory API. It draws nothing of its own; instead it
// turns the message's real content node into the CSS balloon and tucks the decoration's
// character (plus, in the Pixelcord style, the author's avatar) into a corner. Working on the
// real content node is what makes the balloon stretch with the text for free.
function DecorationAccessory({ message }: { message: any; }) {
    const { style } = settings.use(["style"]);
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
        content.dataset.vcMsgdecoStyle = style || "tiktok";
        // Colours arrive as CSS custom properties. They're validated hex (see api.ts),
        // and setProperty values can't break out of the declaration anyway.
        content.style.setProperty("--vc-msgdeco-border", deco.borderColor);
        content.style.setProperty("--vc-msgdeco-bg", deco.backgroundColor);
        content.style.setProperty("--vc-msgdeco-text", deco.textColor);

        // The figure holds the decoration's character. In the Pixelcord style it ALSO holds
        // the author's real avatar (with the character as a badge on it), tucked inside the
        // bubble; in the TikTok style the avatar stays where Discord draws it (outside the
        // bubble), so we show only the character. It's anchored in the balloon's reserved
        // column (see CSS), out of the text flow, so it never clips. Plain <img>s only — an
        // SVG character loads in image mode with no script execution.
        let figure = content.querySelector<HTMLDivElement>(`:scope > .${cl("figure")}`);
        if (!figure) {
            figure = document.createElement("div");
            figure.className = cl("figure");
            figure.setAttribute("aria-hidden", "true");

            const characterImg = document.createElement("img");
            characterImg.className = cl("character");
            characterImg.alt = "";

            figure.appendChild(characterImg);
            content.appendChild(figure);
        }

        const character = figure.querySelector<HTMLImageElement>(`:scope > .${cl("character")}`)!;

        if (style === "pixelcord") {
            let avatar = figure.querySelector<HTMLImageElement>(`:scope > .${cl("avatar")}`);
            if (!avatar) {
                avatar = document.createElement("img");
                avatar.className = cl("avatar");
                avatar.alt = "";
                figure.prepend(avatar);
            }
            const av = avatar;
            // Server profile avatar in a guild, else the global one; fall back to the user's
            // default avatar if the record can't build a URL or the image fails to load.
            const guildId = ChannelStore.getChannel(message.channel_id)?.guild_id;
            const fallbackAvatar = IconUtils.getDefaultAvatarURL(message.author?.id ?? "0");
            const avatarUrl = message.author?.getAvatarURL?.(guildId, 128) ?? fallbackAvatar;
            av.onerror = () => { av.onerror = null; av.src = fallbackAvatar; };
            if (av.src !== avatarUrl) av.src = avatarUrl;
        } else {
            // TikTok style: Discord's own avatar stays outside the bubble, so drop ours.
            figure.querySelector<HTMLImageElement>(`:scope > .${cl("avatar")}`)?.remove();
        }

        if (character.src !== deco.character) character.src = deco.character;

        return () => {
            content.classList.remove(cl("balloon"));
            delete content.dataset.vcMsgdecoPos;
            delete content.dataset.vcMsgdecoStyle;
            content.style.removeProperty("--vc-msgdeco-border");
            content.style.removeProperty("--vc-msgdeco-bg");
            content.style.removeProperty("--vc-msgdeco-text");
            figure?.remove();
        };
    }, [deco, message.id, style]);

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
