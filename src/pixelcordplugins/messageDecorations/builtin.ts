/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

// Decorations bundled with the plugin so it works out of the box, before any backend
// catalog exists. The character art is hand-made flat-design SVG, embedded as a data:
// URI and rendered through <img> (image mode — an <img>-loaded SVG can't run scripts).
//
// These are trusted plugin code, so unlike the remote catalog they are NOT run through
// the https/host allowlist (a data: URI would never pass it). To serve your own from
// the CDN instead, lift the <svg> markup below into a file and point the catalog at it.

import type { Decoration } from "./api";

// Wraps raw SVG markup as an <img>-ready data URI. encodeURIComponent escapes the "#",
// "<", quotes, etc. that a data URI can't carry literally.
function svg(markup: string): string {
    return `data:image/svg+xml,${encodeURIComponent(markup.replace(/\s+/g, " ").trim())}`;
}

// Every character is drawn on a 64x64 grid in a "peeking over the top edge" pose: paws
// near the bottom (they rest on the balloon's rim) and the head above.

const BEAR = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <ellipse cx="19" cy="52" rx="7" ry="5" fill="#a9743f"/><ellipse cx="45" cy="52" rx="7" ry="5" fill="#a9743f"/>
  <circle cx="16" cy="19" r="7.5" fill="#b07a45"/><circle cx="48" cy="19" r="7.5" fill="#b07a45"/>
  <circle cx="16" cy="19" r="3.6" fill="#8a5a2e"/><circle cx="48" cy="19" r="3.6" fill="#8a5a2e"/>
  <circle cx="32" cy="34" r="20" fill="#b07a45"/>
  <ellipse cx="32" cy="40" rx="10.5" ry="8.5" fill="#eccca0"/>
  <circle cx="25" cy="32" r="2.7" fill="#3a2a1a"/><circle cx="39" cy="32" r="2.7" fill="#3a2a1a"/>
  <ellipse cx="32" cy="37.5" rx="3" ry="2.2" fill="#3a2a1a"/>
  <path d="M32 39.5 v3 M32 42.5 q-3 2 -6 0 M32 42.5 q3 2 6 0" stroke="#3a2a1a" stroke-width="1.5" fill="none" stroke-linecap="round"/>
  <circle cx="20" cy="38" r="3" fill="#f0a3a3" opacity=".6"/><circle cx="44" cy="38" r="3" fill="#f0a3a3" opacity=".6"/>
</svg>`;

const CAT = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <ellipse cx="19" cy="52" rx="6.5" ry="5" fill="#f0954a"/><ellipse cx="45" cy="52" rx="6.5" ry="5" fill="#f0954a"/>
  <path d="M14 25 L18 8 L31 19 Z" fill="#f4a64b"/><path d="M50 25 L46 8 L33 19 Z" fill="#f4a64b"/>
  <path d="M17 21 L19 12 L26 19 Z" fill="#f8cfa0"/><path d="M47 21 L45 12 L38 19 Z" fill="#f8cfa0"/>
  <circle cx="32" cy="33" r="19" fill="#f4a64b"/>
  <path d="M32 15 v8 M24 17 l3 7 M40 17 l-3 7" stroke="#e07e2e" stroke-width="2" stroke-linecap="round" fill="none"/>
  <circle cx="25" cy="32" r="2.7" fill="#3a2a1a"/><circle cx="39" cy="32" r="2.7" fill="#3a2a1a"/>
  <path d="M32 36 v2" stroke="#3a2a1a" stroke-width="1.4" stroke-linecap="round"/>
  <ellipse cx="32" cy="35.6" rx="1.7" ry="1.2" fill="#e36b6b"/>
  <path d="M30 38.5 q2 2 4 0" stroke="#3a2a1a" stroke-width="1.5" fill="none" stroke-linecap="round"/>
  <path d="M22 34 h-8 M22 37 h-7 M42 34 h8 M42 37 h7" stroke="#caa37a" stroke-width="1" stroke-linecap="round"/>
  <circle cx="19" cy="37" r="3" fill="#f6b0b0" opacity=".6"/><circle cx="45" cy="37" r="3" fill="#f6b0b0" opacity=".6"/>
</svg>`;

const FROG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <ellipse cx="19" cy="52" rx="6.5" ry="5" fill="#4aa653"/><ellipse cx="45" cy="52" rx="6.5" ry="5" fill="#4aa653"/>
  <circle cx="32" cy="37" r="19" fill="#5bbf63"/>
  <circle cx="22" cy="18" r="9" fill="#5bbf63"/><circle cx="42" cy="18" r="9" fill="#5bbf63"/>
  <circle cx="22" cy="17" r="5" fill="#fff"/><circle cx="42" cy="17" r="5" fill="#fff"/>
  <circle cx="23" cy="18" r="2.7" fill="#1f3a22"/><circle cx="41" cy="18" r="2.7" fill="#1f3a22"/>
  <path d="M22 39 q10 9 20 0" stroke="#2e7a35" stroke-width="2.2" fill="none" stroke-linecap="round"/>
  <circle cx="22" cy="41" r="3" fill="#8fdb98" opacity=".8"/><circle cx="42" cy="41" r="3" fill="#8fdb98" opacity=".8"/>
</svg>`;

const PUPPY = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <ellipse cx="19" cy="52" rx="6.5" ry="5" fill="#9fbdda"/><ellipse cx="45" cy="52" rx="6.5" ry="5" fill="#9fbdda"/>
  <ellipse cx="13" cy="35" rx="7" ry="13" fill="#7fa3c8"/><ellipse cx="51" cy="35" rx="7" ry="13" fill="#7fa3c8"/>
  <circle cx="32" cy="33" r="19" fill="#aecbe6"/>
  <ellipse cx="32" cy="41" rx="9" ry="7" fill="#eaf2fc"/>
  <circle cx="25" cy="31" r="2.7" fill="#2a3a4a"/><circle cx="39" cy="31" r="2.7" fill="#2a3a4a"/>
  <ellipse cx="32" cy="38" rx="3" ry="2.3" fill="#2a3a4a"/>
  <path d="M32 40 v3 M32 43 q-3 2 -5 0 M32 43 q3 2 5 0" stroke="#2a3a4a" stroke-width="1.5" fill="none" stroke-linecap="round"/>
  <circle cx="20" cy="38" r="3" fill="#f6b0b0" opacity=".55"/><circle cx="44" cy="38" r="3" fill="#f6b0b0" opacity=".55"/>
</svg>`;

const CAPYBARA = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <ellipse cx="19" cy="53" rx="6.5" ry="5" fill="#a07a45"/><ellipse cx="45" cy="53" rx="6.5" ry="5" fill="#a07a45"/>
  <circle cx="17" cy="20" r="5" fill="#8f6a3a"/><circle cx="47" cy="20" r="5" fill="#8f6a3a"/>
  <rect x="12" y="18" width="40" height="35" rx="14" fill="#b58a52"/>
  <rect x="19" y="38" width="26" height="14" rx="9" fill="#a87d46"/>
  <circle cx="24" cy="30" r="2.7" fill="#3a2a16"/><circle cx="40" cy="30" r="2.7" fill="#3a2a16"/>
  <ellipse cx="27" cy="45" rx="2" ry="2.5" fill="#3a2a16"/><ellipse cx="37" cy="45" rx="2" ry="2.5" fill="#3a2a16"/>
</svg>`;

const BUNNY = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <ellipse cx="20" cy="53" rx="6.5" ry="5" fill="#f3e9e0"/><ellipse cx="44" cy="53" rx="6.5" ry="5" fill="#f3e9e0"/>
  <ellipse cx="24" cy="13" rx="5" ry="14" fill="#f8f0e8"/><ellipse cx="40" cy="13" rx="5" ry="14" fill="#f8f0e8"/>
  <ellipse cx="24" cy="14" rx="2.4" ry="9.5" fill="#f3b9cf"/><ellipse cx="40" cy="14" rx="2.4" ry="9.5" fill="#f3b9cf"/>
  <circle cx="32" cy="37" r="18" fill="#fcf6f0"/>
  <circle cx="25" cy="35" r="2.7" fill="#5a3a3a"/><circle cx="39" cy="35" r="2.7" fill="#5a3a3a"/>
  <ellipse cx="32" cy="39" rx="1.9" ry="1.4" fill="#e88aa6"/>
  <path d="M32 40.5 v2 M32 42.5 q-2.5 2 -4.5 0 M32 42.5 q2.5 2 4.5 0" stroke="#5a3a3a" stroke-width="1.4" fill="none" stroke-linecap="round"/>
  <circle cx="22" cy="40" r="3" fill="#f6b8cd" opacity=".7"/><circle cx="42" cy="40" r="3" fill="#f6b8cd" opacity=".7"/>
</svg>`;

const PANDA = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <ellipse cx="19" cy="52" rx="6.5" ry="5" fill="#2f3338"/><ellipse cx="45" cy="52" rx="6.5" ry="5" fill="#2f3338"/>
  <circle cx="16" cy="19" r="7.5" fill="#2f3338"/><circle cx="48" cy="19" r="7.5" fill="#2f3338"/>
  <circle cx="32" cy="34" r="20" fill="#fbfbfb"/>
  <ellipse cx="24" cy="33" rx="5.5" ry="7.5" fill="#2f3338" transform="rotate(-18 24 33)"/>
  <ellipse cx="40" cy="33" rx="5.5" ry="7.5" fill="#2f3338" transform="rotate(18 40 33)"/>
  <circle cx="25" cy="33" r="2.5" fill="#fff"/><circle cx="39" cy="33" r="2.5" fill="#fff"/>
  <ellipse cx="32" cy="40" rx="2.5" ry="1.9" fill="#2f3338"/>
  <path d="M32 42 v2 M32 44 q-2.5 2 -4 0 M32 44 q2.5 2 4 0" stroke="#2f3338" stroke-width="1.4" fill="none" stroke-linecap="round"/>
</svg>`;

// Cheeky frog whose tongue curls up — shown as a normal inline avatar like the rest.
const FROG_TONGUE = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <path d="M33 38 C 45 34, 54 26, 51 14 C 49 7, 40 7, 40 14 C 40 19, 46 19, 47 14" fill="none" stroke="#ec6f87" stroke-width="4.5" stroke-linecap="round"/>
  <ellipse cx="11" cy="55" rx="8" ry="4.5" fill="#4aa653"/><ellipse cx="44" cy="55" rx="8" ry="4.5" fill="#4aa653"/>
  <ellipse cx="27" cy="46" rx="22" ry="15" fill="#5bbf63"/>
  <circle cx="18" cy="31" r="8.5" fill="#5bbf63"/><circle cx="35" cy="31" r="8.5" fill="#5bbf63"/>
  <circle cx="18" cy="30" r="4.6" fill="#fff"/><circle cx="35" cy="30" r="4.6" fill="#fff"/>
  <circle cx="19" cy="31" r="2.5" fill="#1f3a22"/><circle cx="36" cy="31" r="2.5" fill="#1f3a22"/>
  <path d="M17 44 q10 7 20 0" stroke="#2e7a35" stroke-width="2.2" fill="none" stroke-linecap="round"/>
  <circle cx="13" cy="47" r="3" fill="#8fdb98" opacity=".75"/><circle cx="41" cy="47" r="3" fill="#8fdb98" opacity=".75"/>
</svg>`;

const DUCK = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <ellipse cx="19" cy="53" rx="6" ry="4.5" fill="#f2a93c"/><ellipse cx="45" cy="53" rx="6" ry="4.5" fill="#f2a93c"/>
  <circle cx="32" cy="34" r="20" fill="#ffd54a"/>
  <path d="M29 14 q3 -7 6 0" stroke="#f2c200" stroke-width="3" fill="none" stroke-linecap="round"/>
  <circle cx="26" cy="32" r="2.9" fill="#3a2e10"/><circle cx="40" cy="32" r="2.9" fill="#3a2e10"/>
  <ellipse cx="32" cy="40" rx="8.5" ry="5" fill="#f59331"/><path d="M24 40 h16" stroke="#d97a1f" stroke-width="1.3"/>
  <circle cx="21" cy="38" r="3" fill="#f79b9b" opacity=".55"/><circle cx="43" cy="38" r="3" fill="#f79b9b" opacity=".55"/>
</svg>`;

export const BUILTIN_DECORATIONS: Decoration[] = [
    { id: "bear-cub", name: "Ursinho", character: svg(BEAR), borderColor: "#d39a5a", backgroundColor: "#fff3e3", textColor: "#5a3a1a", position: "left" },
    { id: "orange-cat", name: "Gatinho", character: svg(CAT), borderColor: "#f0a23c", backgroundColor: "#fff6d9", textColor: "#6b4512", position: "right" },
    { id: "green-frog", name: "Sapinho", character: svg(FROG), borderColor: "#4fae57", backgroundColor: "#e7f7e2", textColor: "#1f5a28", position: "left" },
    { id: "blue-puppy", name: "Cachorrinho", character: svg(PUPPY), borderColor: "#84acd8", backgroundColor: "#e9f2fc", textColor: "#234a73", position: "right" },
    { id: "capybara", name: "Capivara", character: svg(CAPYBARA), borderColor: "#b0894f", backgroundColor: "#f3e8d5", textColor: "#5a3f1e", position: "left" },
    { id: "bunny", name: "Coelhinho", character: svg(BUNNY), borderColor: "#f192b2", backgroundColor: "#ffeaf2", textColor: "#7a2c4a", position: "right" },
    { id: "panda", name: "Panda", character: svg(PANDA), borderColor: "#5a636e", backgroundColor: "#f1f3f5", textColor: "#2b3138", position: "left" },
    { id: "duck", name: "Patinho", character: svg(DUCK), borderColor: "#f2c21f", backgroundColor: "#fff7da", textColor: "#6b5200", position: "right" },
    { id: "frog-tongue", name: "Sapo Língua", character: svg(FROG_TONGUE), borderColor: "#4fae57", backgroundColor: "#e7f7e2", textColor: "#1f5a28", position: "left" }
];
