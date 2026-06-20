/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

// AES-256-GCM with a key derived from the shared passphrase (PBKDF2). The key is
// derived once per passphrase and cached, so detecting an encrypted message is
// just a fast AES-GCM decrypt (its auth tag tells us whether it's ours) — no
// marker is added to the message, so nothing relies on Discord preserving one.

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

// Fixed salt: a shared-passphrase chat reuses one derived key (the random IV per
// message keeps AES-GCM secure) and lets us cache it.
const SALT = textEncoder.encode("pixelcord-encrypted-messages-v1");

const keyCache = new Map<string, Promise<CryptoKey>>();

function getKey(passphrase: string): Promise<CryptoKey> {
    let cached = keyCache.get(passphrase);
    if (!cached) {
        cached = (async () => {
            const baseKey = await crypto.subtle.importKey("raw", textEncoder.encode(passphrase), "PBKDF2", false, ["deriveKey"]);
            return crypto.subtle.deriveKey(
                { name: "PBKDF2", salt: SALT, iterations: 100_000, hash: "SHA-256" },
                baseKey,
                { name: "AES-GCM", length: 256 },
                false,
                ["encrypt", "decrypt"]
            );
        })();
        keyCache.set(passphrase, cached);
    }
    return cached;
}

function toBase64(bytes: Uint8Array): string {
    let bin = "";
    for (const b of bytes) bin += String.fromCharCode(b);
    return btoa(bin);
}

export async function encrypt(text: string, passphrase: string): Promise<string> {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await getKey(passphrase);
    const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, textEncoder.encode(text)));

    const out = new Uint8Array(iv.length + cipher.length);
    out.set(iv, 0);
    out.set(cipher, iv.length);
    return toBase64(out);
}

// Returns null on any failure (wrong key, not our ciphertext, corrupt data) — the
// failing GCM auth tag is exactly how we tell a normal message from an encrypted
// one without a marker.
export async function decrypt(b64: string, passphrase: string): Promise<string | null> {
    try {
        const raw = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
        if (raw.length < 12 + 16) return null; // iv + minimum GCM tag
        const iv = raw.slice(0, 12);
        const cipher = raw.slice(12);
        const key = await getKey(passphrase);
        const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, cipher);
        return textDecoder.decode(plain);
    } catch {
        return null;
    }
}

// Older format: base64(salt[16] + iv[12] + ciphertext), key derived per-message
// from the salt. Kept so messages encrypted before the format change still decrypt.
export async function decryptLegacy(b64: string, passphrase: string): Promise<string | null> {
    try {
        const raw = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
        if (raw.length < 16 + 12 + 16) return null;
        const salt = raw.slice(0, 16);
        const iv = raw.slice(16, 28);
        const cipher = raw.slice(28);
        const baseKey = await crypto.subtle.importKey("raw", textEncoder.encode(passphrase), "PBKDF2", false, ["deriveKey"]);
        const key = await crypto.subtle.deriveKey(
            { name: "PBKDF2", salt, iterations: 100_000, hash: "SHA-256" },
            baseKey,
            { name: "AES-GCM", length: 256 },
            false,
            ["decrypt"]
        );
        const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, cipher);
        return textDecoder.decode(plain);
    } catch {
        return null;
    }
}
