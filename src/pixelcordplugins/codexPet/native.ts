/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { CspPolicies, ImageSrc } from "@main/csp";

// codex-pets.net serves both its /api/pets manifest and the /assets sprites from
// the same host, so one entry covers the API fetch and the spritesheet images.
CspPolicies["codex-pets.net"] = ImageSrc;
