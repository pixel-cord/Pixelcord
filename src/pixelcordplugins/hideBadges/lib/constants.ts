/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Logger } from "@utils/Logger";

export const BASE_URL = IS_DEV ? "http://localhost:8088" : "https://pixelcord-api.example";
export const API_URL = `${BASE_URL}/api`;
export let AUTHORIZE_URL = `${API_URL}/authorize`;
export let CLIENT_ID = "";

export const HIDDEN_FETCH_COOLDOWN = 1000 * 60 * 30;

export async function loadApiConfig() {
    try {
        const config = await fetch(`${API_URL}/config`).then(res => res.json());
        if (config.clientId) CLIENT_ID = config.clientId;
        if (config.redirectUri) AUTHORIZE_URL = config.redirectUri;
    } catch (e) {
        new Logger("HideBadges").error("Failed to fetch API config.", e);
    }
}
