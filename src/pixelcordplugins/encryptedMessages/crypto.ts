/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

// AES-256-GCM with a key derived from the shared passphrase (PBKDF2). The salt
// and IV are random per message and packed in front of the ciphertext, so two
// people only need to agree on the passphrase.

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

async function deriveKey(passphrase: string, salt: BufferSource): Promise<CryptoKey> {
    const baseKey = await crypto.subtle.importKey("raw", textEncoder.encode(passphrase), "PBKDF2", false, ["deriveKey"]);
    return crypto.subtle.deriveKey(
        { name: "PBKDF2", salt, iterations: 100_000, hash: "SHA-256" },
        baseKey,
        { name: "AES-GCM", length: 256 },
        false,
        ["encrypt", "decrypt"]
    );
}

function toBase64(bytes: Uint8Array): string {
    let bin = "";
    for (const b of bytes) bin += String.fromCharCode(b);
    return btoa(bin);
}

export async function encrypt(text: string, passphrase: string): Promise<string> {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await deriveKey(passphrase, salt);
    const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, textEncoder.encode(text)));

    const out = new Uint8Array(salt.length + iv.length + cipher.length);
    out.set(salt, 0);
    out.set(iv, salt.length);
    out.set(cipher, salt.length + iv.length);
    return toBase64(out);
}

// Returns null on any failure (wrong key, corrupt data) — the caller treats that
// as "can't read this message".
export async function decrypt(b64: string, passphrase: string): Promise<string | null> {
    try {
        const raw = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
        const salt = raw.slice(0, 16);
        const iv = raw.slice(16, 28);
        const cipher = raw.slice(28);
        const key = await deriveKey(passphrase, salt);
        const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, cipher);
        return textDecoder.decode(plain);
    } catch {
        return null;
    }
}
