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
        <svg width={size} height={size} viewBox="0 0 640 640" aria-hidden>
            <path fill="#d51007" d="M289.8 431.1L271 380.1C271 380.1 240.5 414.1 194.8 414.1C154.3 414.1 125.6 378.9 125.6 322.6C125.6 250.5 162 224.7 197.7 224.7C264.2 224.7 272.5 278 298.6 359.6C317.4 416.5 352.6 462.2 454 462.2C526.7 462.2 576 439.9 576 381.3C576 308.4 513.3 300.7 461 289.2C435.2 283.3 427.6 272.8 427.6 255.2C427.6 235.3 443.4 223.5 469.2 223.5C497.4 223.5 512.6 234.1 514.9 259.3L573.5 252.3C568.8 199.5 532.4 177.8 472.6 177.8C419.8 177.8 368.2 197.7 368.2 261.7C368.2 301.6 387.6 326.8 436.2 338.5C481.1 349.1 516 352.3 516 384.2C516 405.9 494.9 414.7 455 414.7C395.8 414.7 371.1 383.6 357.1 340.8C325.1 244 313.5 177.8 195.8 177.8C109.7 177.8 64 232.3 64 325C64 414.1 109.7 462.2 191.9 462.2C258.1 462.2 289.8 431.1 289.8 431.1z" />
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
