/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { CspPolicies, ImageSrc } from "@main/csp";

// The pet catalog itself is now fetched from our own CORS-enabled API
// (api.pixelcord.com.br/api/codex/pets), so it no longer needs a native helper.
// The sprite images still load straight from codex-pets.net's CDN, so we keep its
// img-src whitelist entry here. This file has no exported functions on purpose —
// it's imported for this side effect alone.
CspPolicies["codex-pets.net"] = ImageSrc;
