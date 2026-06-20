/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { JSX } from "react";

export interface CustomPlatform {
    /** Stable id stored on the backend and whitelisted there. */
    id: string;
    name: string;
    placeholder: string;
    /** Rounded icon tile shown in the profile and the settings UI. */
    Icon: (props: { size?: number; }) => JSX.Element;
    /** Builds the public profile URL for a handle. */
    profileUrl: (value: string) => string;
    /** Cleans user input to the canonical handle (no @, no spaces). */
    normalize: (raw: string) => string;
}

function InstagramIcon({ size = 32 }: { size?: number; }) {
    const id = "pc-ig-grad";
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
            <defs>
                <radialGradient id={id} cx="30%" cy="107%" r="135%">
                    <stop offset="0%" stopColor="#fdf497" />
                    <stop offset="5%" stopColor="#fdf497" />
                    <stop offset="45%" stopColor="#fd5949" />
                    <stop offset="60%" stopColor="#d6249f" />
                    <stop offset="90%" stopColor="#285AEB" />
                </radialGradient>
            </defs>
            <rect x="1" y="1" width="22" height="22" rx="6" fill={`url(#${id})`} />
            <rect x="5.5" y="5.5" width="13" height="13" rx="4" fill="none" stroke="#fff" strokeWidth="1.8" />
            <circle cx="12" cy="12" r="3.2" fill="none" stroke="#fff" strokeWidth="1.8" />
            <circle cx="16.4" cy="7.6" r="1.1" fill="#fff" />
        </svg>
    );
}

function LastfmIcon({ size = 32 }: { size?: number; }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
            <rect x="1" y="1" width="22" height="22" rx="6" fill="#d51007" />
            <rect x="6.6" y="13" width="2.4" height="5" rx="1" fill="#fff" />
            <rect x="10.8" y="9" width="2.4" height="9" rx="1" fill="#fff" />
            <rect x="15" y="11" width="2.4" height="7" rx="1" fill="#fff" />
        </svg>
    );
}

export const PLATFORMS: CustomPlatform[] = [
    {
        id: "instagram",
        name: "Instagram",
        placeholder: "your.handle",
        Icon: InstagramIcon,
        profileUrl: value => `https://www.instagram.com/${value}`,
        normalize: raw => raw.trim().replace(/^@+/, "").replace(/[^A-Za-z0-9._-]/g, "").slice(0, 100),
    },
    {
        id: "lastfm",
        name: "Last.fm",
        placeholder: "your-username",
        Icon: LastfmIcon,
        profileUrl: value => `https://www.last.fm/user/${value}`,
        normalize: raw => raw.trim().replace(/^@+/, "").replace(/[^A-Za-z0-9._-]/g, "").slice(0, 100),
    },
];

export const getPlatform = (id: string): CustomPlatform | undefined => PLATFORMS.find(p => p.id === id);
