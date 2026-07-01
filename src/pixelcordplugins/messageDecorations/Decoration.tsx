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
import { DEFAULT_STYLE } from "./settings";

const cl = classNameFactory("vc-msgdeco-");
const ACCESSORY_ID = "MessageDecorations";

// messageId -> { deco id, style }, filled as messages carrying a marker arrive. Bounded so a
// long-running session can't grow it without limit; oldest entries fall off first.
const MAX_CACHE = 5000;
const cache = new Map<string, { deco: string; style: string; }>();

function remember(messageId: string, deco: string, style: string) {
    cache.delete(messageId); // re-insert to bump it to newest in insertion order
    cache.set(messageId, { deco, style });
    if (cache.size > MAX_CACHE) cache.delete(cache.keys().next().value as string);
}

/**
 * Handles an incoming message off the flux events: pulls the hidden decoration id + style out
 * of the content, remembers them, and re-renders the message with the marker stripped so the
 * accessory can style it and the displayed text stays clean. Mirrors the EncryptedMessages
 * receive flow. Idempotent — a message with no marker does nothing.
 */
export function handleIncoming(message: any) {
    if (typeof message?.content !== "string" || !message.content.includes(MARKER_HINT)) return;

    const { id, style, cleaned } = decodeMarker(message.content);
    if (id) remember(message.id, id, style); // set before the re-render so the accessory sees it
    if (cleaned !== message.content)
        updateMessage(message.channel_id, message.id, { content: cleaned });
}

// Points an <img> at the message author's avatar: server profile avatar in a guild, else the
// global one, falling back to the user's default avatar if the record can't build a URL or the
// image fails to load.
function applyAvatar(avatar: HTMLImageElement, message: any) {
    const guildId = ChannelStore.getChannel(message.channel_id)?.guild_id;
    const fallback = IconUtils.getDefaultAvatarURL(message.author?.id ?? "0");
    const url = message.author?.getAvatarURL?.(guildId, 128) ?? fallback;
    avatar.onerror = () => { avatar.onerror = null; avatar.src = fallback; };
    if (avatar.src !== url) avatar.src = url;
}

// Rendered once per message by the accessory API. It draws nothing of its own; instead it turns
// the message's real content node into the CSS balloon and, per the message's own style, tucks
// the decoration's character (and maybe the author's avatar) into a corner — or onto Discord's
// native avatar. Working on the real content node makes the balloon stretch with the text for
// free. The style is read from the per-message cache, so each message keeps the look its sender
// chose regardless of the viewer's own setting.
function DecorationAccessory({ message }: { message: any; }) {
    const entry = message?.id ? cache.get(message.id) : undefined;
    const deco = entry ? getDecoration(entry.deco) : undefined;
    const style = entry?.style ?? DEFAULT_STYLE;

    useLayoutEffect(() => {
        if (!deco) return;

        // Both ids are long-standing, stable Discord DOM conventions (the same ones
        // messageLogger and quickReply rely on).
        const content = document.getElementById(`message-content-${message.id}`);
        if (!content) return;
        const contents = content.parentElement;

        content.classList.add(cl("balloon"));
        content.dataset.vcMsgdecoPos = deco.position;
        content.dataset.vcMsgdecoStyle = style;
        // Colours arrive as CSS custom properties. They're validated hex (see api.ts), and
        // setProperty values can't break out of the declaration anyway.
        content.style.setProperty("--vc-msgdeco-border", deco.borderColor);
        content.style.setProperty("--vc-msgdeco-bg", deco.backgroundColor);
        content.style.setProperty("--vc-msgdeco-text", deco.textColor);

        // In-bubble figure: the character, plus the author's avatar in the Pixelcord style.
        // "minimal" shows no character; "badge" puts the character on the native avatar instead
        // (below), so neither uses the figure. Everything is a plain <img>, so an SVG character
        // loads in image mode with no script execution.
        const wantsFigure = style !== "minimal" && style !== "badge";
        let figure = content.querySelector<HTMLDivElement>(`:scope > .${cl("figure")}`);
        if (wantsFigure) {
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
                applyAvatar(avatar, message);
            } else {
                figure.querySelector<HTMLImageElement>(`:scope > .${cl("avatar")}`)?.remove();
            }
            if (character.src !== deco.character) character.src = deco.character;
        } else {
            figure?.remove();
            figure = null;
        }

        // "badge" style: stick the character onto Discord's own avatar out in the gutter. The
        // badge lives in the contents container (next to the balloon) and is positioned over the
        // native avatar's corner from that avatar's live offsets, so it tracks Discord's layout
        // rather than hard-coded pixels.
        let navBadge = contents?.querySelector<HTMLImageElement>(`:scope > .${cl("navbadge")}`) ?? null;
        const native = style === "badge"
            ? contents?.querySelector<HTMLElement>(`:scope > img[class*="avatar"]`)
            : null;
        if (native && contents) {
            if (!navBadge) {
                navBadge = document.createElement("img");
                navBadge.className = cl("navbadge");
                navBadge.alt = "";
                navBadge.setAttribute("aria-hidden", "true");
                contents.appendChild(navBadge);
            }
            navBadge.style.left = `${native.offsetLeft + native.offsetWidth - 20}px`;
            navBadge.style.top = `${native.offsetTop + native.offsetHeight - 20}px`;
            if (navBadge.src !== deco.character) navBadge.src = deco.character;
        } else {
            navBadge?.remove();
            navBadge = null;
        }

        return () => {
            content.classList.remove(cl("balloon"));
            delete content.dataset.vcMsgdecoPos;
            delete content.dataset.vcMsgdecoStyle;
            content.style.removeProperty("--vc-msgdeco-border");
            content.style.removeProperty("--vc-msgdeco-bg");
            content.style.removeProperty("--vc-msgdeco-text");
            figure?.remove();
            navBadge?.remove();
        };
    }, [deco, message.id, style]);

    return null;
}

export function registerAccessory() {
    // The accessory renders nothing visible (it styles the content node via an effect), so its
    // position among the real accessories doesn't matter.
    addMessageAccessory(ACCESSORY_ID, (props: any) => <DecorationAccessory message={props.message} />);
}

export function unregisterAccessory() {
    removeMessageAccessory(ACCESSORY_ID);
}

/**
 * Re-renders the decorated messages currently loaded in the open channel. Used after the catalog
 * finishes loading so already-received messages get their decoration without needing to reopen
 * the channel.
 */
export function rerenderVisible() {
    const channelId = SelectedChannelStore.getChannelId();
    if (!channelId) return;

    const messages: any[] = (MessageStore.getMessages(channelId) as any)?._array ?? [];
    for (const m of messages) if (cache.has(m.id)) updateMessage(channelId, m.id);
}
