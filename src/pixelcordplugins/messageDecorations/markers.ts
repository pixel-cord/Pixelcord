/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { DEFAULT_STYLE, STYLE_VALUES } from "./settings";

// We sync the chosen decoration + style per-message without a real Discord field: the payload
// `id|style` is hidden inside the message content as a run of zero-width characters appended
// after the visible text. Discord stores and forwards these verbatim, so anyone with the
// plugin can recover them, while the text the user typed looks completely unchanged. This
// mirrors EncryptedMessages' habit of embedding data in the content — here the payload is just
// a tiny id + style slug, not ciphertext.
//
// The four markers are built with String.fromCharCode so the source stays pure ASCII: the
// characters themselves are invisible, and spelling out the code points keeps the file
// readable and tamper-evident.

const BIT0 = String.fromCharCode(0x200B); // ZERO WIDTH SPACE       -> bit 0
const BIT1 = String.fromCharCode(0x200C); // ZERO WIDTH NON-JOINER  -> bit 1
const START = String.fromCharCode(0x2062); // INVISIBLE TIMES        -> opening sentinel
const END = String.fromCharCode(0x2063); // INVISIBLE SEPARATOR    -> closing sentinel

// Decoration ids are short kebab slugs; the style is a short lowercase slug. Both the encoder
// and decoder enforce this, so a hostile message can never smuggle a long or weird value
// through the marker channel.
const ID_RE = /^[a-z0-9-]{1,32}$/;
const SEP = "|"; // separates the id from the style in the payload

// Hard cap on how many bit-characters we'll read out of one marker. `id` (≤32) + SEP + style
// fits comfortably in 64 bytes; this bounds the decoder's work even if a message is stuffed
// with zero-width chars.
const MAX_PAYLOAD_BITS = 64 * 8;

// One marker block: START, then only bit characters, then END. Global + unicode so we can find
// and strip every copy in a message.
const MARKER_RE = new RegExp(`${START}[${BIT0}${BIT1}]{0,${MAX_PAYLOAD_BITS}}${END}`, "gu");

// Cheap pre-check: skip the regex entirely on the overwhelming majority of messages that don't
// carry a marker. Exported so callers can gate before doing any work.
export const MARKER_HINT = START;

const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true });

/** Encodes a decoration id + style into a zero-width marker string. Returns "" for a bad id. */
export function encodeMarker(id: string, style: string): string {
    if (!ID_RE.test(id)) return "";

    const st = STYLE_VALUES.has(style) ? style : DEFAULT_STYLE;
    const payload = `${id}${SEP}${st}`;

    let out = START;
    for (const byte of encoder.encode(payload))
        for (let bit = 7; bit >= 0; bit--)
            out += (byte >> bit) & 1 ? BIT1 : BIT0;
    return out + END;
}

/**
 * Extracts the decoration id + style from a message and returns the content with every marker
 * block stripped out, so the displayed text never shows our hidden payload. `id` is the first
 * valid id found (or null); `style` defaults sensibly, including for old id-only markers.
 */
export function decodeMarker(content: string): { id: string | null; style: string; cleaned: string; } {
    let id: string | null = null;
    let style: string = DEFAULT_STYLE;

    const cleaned = content.replace(MARKER_RE, match => {
        if (id == null) {
            const parsed = parsePayload(match);
            if (parsed) { id = parsed.id; style = parsed.style; }
        }
        return ""; // strip the marker whether or not it parsed
    });

    return { id, style, cleaned };
}

function parsePayload(block: string): { id: string; style: string; } | null {
    // Drop the START/END sentinels (one code unit each) to get just the bit run.
    const bits = block.slice(START.length, block.length - END.length);
    if (bits.length === 0 || bits.length % 8 !== 0) return null;

    const bytes = new Uint8Array(bits.length / 8);
    for (let i = 0; i < bytes.length; i++) {
        let value = 0;
        for (let j = 0; j < 8; j++)
            value = (value << 1) | (bits[i * 8 + j] === BIT1 ? 1 : 0);
        bytes[i] = value;
    }

    try {
        const text = decoder.decode(bytes); // throws on invalid UTF-8 (fatal)
        // Old, id-only markers have no separator; treat the whole thing as the id.
        const sep = text.indexOf(SEP);
        const id = sep === -1 ? text : text.slice(0, sep);
        const rawStyle = sep === -1 ? DEFAULT_STYLE : text.slice(sep + 1);
        if (!ID_RE.test(id)) return null;
        return { id, style: STYLE_VALUES.has(rawStyle) ? rawStyle : DEFAULT_STYLE };
    } catch {
        return null;
    }
}
