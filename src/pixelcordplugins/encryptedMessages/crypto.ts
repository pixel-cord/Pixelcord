/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

// New messages: AES-256-GCM with a key derived from the shared passphrase via
// Argon2id (memory-hard, resists GPU/ASIC brute-force). The key is derived once
// per passphrase and cached, so detecting an encrypted message is just a fast
// AES-GCM decrypt — its auth tag tells us whether it's ours, so no marker is added
// and nothing relies on Discord preserving one.
//
// Older messages stay readable through two PBKDF2 fallbacks (fixed-salt and the
// original per-message-salt format).

import { getHashWasm } from "@utils/dependencies";

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

// Fixed salts: a shared-passphrase chat reuses one derived key per algorithm (the
// random IV per message keeps AES-GCM secure) and lets us cache the costly KDF.
const ARGON2_SALT = textEncoder.encode("pixelcord-enc-msg-argon2id-v1");
const PBKDF2_SALT = textEncoder.encode("pixelcord-encrypted-messages-v1");

// Strong Argon2id params (OWASP-style): 64 MiB memory, 3 passes. Paid once per
// passphrase thanks to the cache below.
const ARGON2 = { parallelism: 1, iterations: 3, memorySize: 64 * 1024 /* KiB = 64 MiB */, hashLength: 32 } as const;

const argonKeyCache = new Map<string, Promise<CryptoKey>>();
const pbkdf2KeyCache = new Map<string, Promise<CryptoKey>>();

function importAesKey(raw: BufferSource, usages: KeyUsage[]): Promise<CryptoKey> {
    return crypto.subtle.importKey("raw", raw, "AES-GCM", false, usages);
}

function getArgonKey(passphrase: string): Promise<CryptoKey> {
    let cached = argonKeyCache.get(passphrase);
    if (!cached) {
        cached = (async () => {
            const { argon2id } = await getHashWasm();
            const raw = await argon2id({
                password: passphrase,
                salt: ARGON2_SALT,
                ...ARGON2,
                outputType: "binary"
            });
            return importAesKey(raw, ["encrypt", "decrypt"]);
        })();
        argonKeyCache.set(passphrase, cached);
    }
    return cached;
}

function getPbkdf2Key(passphrase: string): Promise<CryptoKey> {
    let cached = pbkdf2KeyCache.get(passphrase);
    if (!cached) {
        cached = (async () => {
            const baseKey = await crypto.subtle.importKey("raw", textEncoder.encode(passphrase), "PBKDF2", false, ["deriveKey"]);
            return crypto.subtle.deriveKey(
                { name: "PBKDF2", salt: PBKDF2_SALT, iterations: 100_000, hash: "SHA-256" },
                baseKey,
                { name: "AES-GCM", length: 256 },
                false,
                ["decrypt"]
            );
        })();
        pbkdf2KeyCache.set(passphrase, cached);
    }
    return cached;
}

function toBase64(bytes: Uint8Array): string {
    let bin = "";
    for (const b of bytes) bin += String.fromCharCode(b);
    return btoa(bin);
}

// Decrypts our wire format — base64(iv[12] + ciphertext+tag) — with a given key.
// Returns null on any failure (wrong key, not our ciphertext, corrupt data); the
// failing GCM auth tag is exactly how we tell a normal message from an encrypted
// one without a marker.
async function aesDecrypt(b64: string, key: CryptoKey): Promise<string | null> {
    try {
        const raw = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
        if (raw.length < 12 + 16) return null; // iv + minimum GCM tag
        const iv = raw.slice(0, 12);
        const cipher = raw.slice(12);
        const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, cipher);
        return textDecoder.decode(plain);
    } catch {
        return null;
    }
}

export async function encrypt(text: string, passphrase: string): Promise<string> {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await getArgonKey(passphrase);
    const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, textEncoder.encode(text)));

    const out = new Uint8Array(iv.length + cipher.length);
    out.set(iv, 0);
    out.set(cipher, iv.length);
    return toBase64(out);
}

// Current format: Argon2id-derived key.
export async function decrypt(b64: string, passphrase: string): Promise<string | null> {
    return aesDecrypt(b64, await getArgonKey(passphrase));
}

// Previous format: same wire layout, but the key came from fixed-salt PBKDF2.
export async function decryptPbkdf2(b64: string, passphrase: string): Promise<string | null> {
    return aesDecrypt(b64, await getPbkdf2Key(passphrase));
}

// Oldest format: base64(salt[16] + iv[12] + ciphertext), key derived per-message
// from the embedded salt. Kept so the very first messages still decrypt.
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

// Try every known format in order (newest first). Returns plaintext or null.
export async function decryptAny(b64: string, passphrase: string): Promise<string | null> {
    return (await decrypt(b64, passphrase))
        ?? (await decryptPbkdf2(b64, passphrase))
        ?? (await decryptLegacy(b64, passphrase));
}
