/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

// Renders the user's text into a PNG (base64, no data: prefix) using a canvas, so
// the message can be sent as an image instead of as text Discord can read.

const MAX_WIDTH = 560;
const PADDING = 18;
const FONT_SIZE = 16;
const LINE_HEIGHT = 24;
const FONT = `${FONT_SIZE}px "gg sans", "Helvetica Neue", Helvetica, Arial, sans-serif`;
const BG = "#313338";
const FG = "#dbdee1";
const SCALE = 2; // render at 2x for crisp text

// Wraps a single paragraph to maxWidth, hard-breaking words (e.g. long URLs) that
// don't fit on their own.
function wrapParagraph(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
    const lines: string[] = [];
    let line = "";

    const flush = () => { if (line) { lines.push(line); line = ""; } };

    for (const word of text.split(" ")) {
        let w = word;
        while (ctx.measureText(w).width > maxWidth && w.length > 1) {
            let i = 1;
            while (i < w.length && ctx.measureText(w.slice(0, i + 1)).width <= maxWidth) i++;
            flush();
            lines.push(w.slice(0, i));
            w = w.slice(i);
        }
        const test = line ? `${line} ${w}` : w;
        if (ctx.measureText(test).width <= maxWidth || !line) line = test;
        else { lines.push(line); line = w; }
    }
    flush();
    return lines;
}

export function renderTextToImage(text: string): string {
    const measure = document.createElement("canvas").getContext("2d")!;
    measure.font = FONT;

    const maxTextWidth = MAX_WIDTH - PADDING * 2;
    const lines: string[] = [];
    for (const paragraph of text.split("\n")) {
        if (paragraph === "") lines.push("");
        else lines.push(...wrapParagraph(measure, paragraph, maxTextWidth));
    }

    let contentWidth = 0;
    for (const l of lines) contentWidth = Math.max(contentWidth, measure.measureText(l).width);

    const width = Math.min(MAX_WIDTH, Math.ceil(contentWidth) + PADDING * 2);
    const height = PADDING * 2 + lines.length * LINE_HEIGHT;

    const canvas = document.createElement("canvas");
    canvas.width = width * SCALE;
    canvas.height = height * SCALE;

    const ctx = canvas.getContext("2d")!;
    ctx.scale(SCALE, SCALE);
    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, width, height);
    ctx.font = FONT;
    ctx.fillStyle = FG;
    ctx.textBaseline = "top";
    lines.forEach((l, i) => ctx.fillText(l, PADDING, PADDING + i * LINE_HEIGHT));

    return canvas.toDataURL("image/png").split(",")[1];
}
