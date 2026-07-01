/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./styles.css";

import { definePluginSettings } from "@api/Settings";
import { PixelCordDevs } from "@utils/constants";
import definePlugin, { OptionType } from "@utils/types";
import { Checkbox, Forms, SearchableSelect, Slider, Text, useEffect, useMemo, useRef, useState } from "@webpack/common";

// codex-pets.net renders every pet from one canonical atlas: an 8-wide / 9-tall
// grid where row 0 is the idle loop and row 1 is the walk cycle facing RIGHT. We
// only ever use those two rows. The dedicated "walk left" row 2 is unreliable —
// plenty of pets ship it as a duplicate of row 1 instead of a real mirror, which
// is why some pets used to moonwalk or only animate one way. Instead we play row 1
// and flip it horizontally (CSS transform) for leftward travel, so every pet faces
// the direction it moves regardless of how its sheet was authored.
const DEFAULT_COLS = 8;
const DEFAULT_ROWS = 9;
const ROW_IDLE = 0;
const ROW_WALK = 1;
const IDLE_FRAMES = 6;
const WALK_FRAMES = 8;

// First-run default before the user picks a pet. The non-versioned /assets path is
// stable, so it's safe to hardcode.
const DEFAULT_PET = {
    slug: "airi-white-v2",
    name: "Airi",
    url: "https://codex-pets.net/assets/pets/airi-white-v2/spritesheet.webp",
    cols: DEFAULT_COLS,
    rows: DEFAULT_ROWS
};

interface Pet {
    slug: string;
    name: string;
    url: string;
    desc?: string;
    cols?: number;
    rows?: number;
}

// The whole catalog is mirrored by our own API (api.pixelcord.com.br), which pulls
// every codex-pets.net page once a day and serves it as a single, CORS-enabled JSON
// array. That removes both the ~45-page pagination the client used to do on every
// open and codex-pets.net's missing Access-Control-Allow-Origin header.
const CATALOG_URL = "https://api.pixelcord.com.br/api/codex/pets";

let petCache: Pet[] | null = null;
let petInflight: Promise<Pet[]> | null = null;

function fetchPets(): Promise<Pet[]> {
    if (petCache) return Promise.resolve(petCache);
    if (petInflight) return petInflight;

    petInflight = fetch(CATALOG_URL, { headers: { accept: "application/json" } })
        .then(res => {
            if (!res.ok) throw new Error("HTTP " + res.status);
            return res.json();
        })
        .then((pets: Pet[]) => {
            if (!Array.isArray(pets) || !pets.length) throw new Error("empty catalog");
            petCache = pets;
            return pets;
        })
        .finally(() => { petInflight = null; });

    return petInflight;
}

interface CodexPetOptions {
    url: string;
    cols: number;
    rows: number;
    size: number;
    speed: number;
    fps: number;
    pixelated: boolean;
}

class CodexPet {
    private readonly el = document.createElement("div");
    private posX = window.innerWidth / 2;
    private posY = window.innerHeight / 2;
    private mouseX = this.posX;
    private mouseY = this.posY;
    private dispW = 0;
    private dispH = 0;
    private cols = DEFAULT_COLS;
    private rows = DEFAULT_ROWS;
    private walkFrames = WALK_FRAMES;
    private idleFrames = IDLE_FRAMES;
    private walkFrame = 0;
    private idleFrame = 0;
    private idleTicks = 0;
    private facing = 1; // 1 = right (atlas default), -1 = left (mirrored)
    private raf = 0;
    private lastStep = 0;
    private destroyed = false;

    constructor(private readonly opts: CodexPetOptions) {
        this.load();
    }

    private readonly onMouseMove = (e: MouseEvent) => {
        this.mouseX = e.clientX;
        this.mouseY = e.clientY;
    };

    private load() {
        const img = new Image();
        img.onload = () => {
            if (this.destroyed) return;

            this.cols = Math.max(1, Math.round(this.opts.cols) || DEFAULT_COLS);
            this.rows = Math.max(1, Math.round(this.opts.rows) || DEFAULT_ROWS);
            // Each state's frames are left-aligned in its row; never step past the
            // real frame count or we'd flash the row's empty padding cells.
            this.walkFrames = Math.min(WALK_FRAMES, this.cols);
            this.idleFrames = Math.min(IDLE_FRAMES, this.cols);

            const cellW = img.naturalWidth / this.cols;
            const cellH = img.naturalHeight / this.rows;
            this.dispH = this.opts.size;
            this.dispW = Math.max(1, Math.round(this.opts.size * (cellW / cellH)));

            const s = this.el.style;
            this.el.id = "vc-codexpet";
            this.el.setAttribute("aria-hidden", "true");
            s.position = "fixed";
            s.left = "0px";
            s.top = "0px";
            s.width = `${this.dispW}px`;
            s.height = `${this.dispH}px`;
            s.backgroundImage = `url("${this.opts.url}")`;
            s.backgroundRepeat = "no-repeat";
            s.backgroundSize = `${this.cols * this.dispW}px ${this.rows * this.dispH}px`;
            s.imageRendering = this.opts.pixelated ? "pixelated" : "auto";
            s.pointerEvents = "none";
            s.zIndex = "2147483647";
            s.willChange = "left, top, background-position, transform";

            document.body.appendChild(this.el);
            document.addEventListener("mousemove", this.onMouseMove);
            this.raf = requestAnimationFrame(this.tick);
        };
        img.onerror = () => console.error("[CodexPet] Failed to load spritesheet:", this.opts.url);
        img.src = this.opts.url;
    }

    private setCell(col: number, row: number) {
        // scaleX(facing) flips the whole element so the pet faces its travel
        // direction; the background-position stays in unflipped atlas coords.
        this.el.style.transform = `scaleX(${this.facing})`;
        this.el.style.backgroundPosition = `-${col * this.dispW}px -${row * this.dispH}px`;
    }

    private readonly tick = (t: number) => {
        if (this.destroyed) return;
        if (!this.lastStep) this.lastStep = t;
        if (t - this.lastStep >= 1000 / Math.max(1, this.opts.fps)) {
            this.lastStep = t;
            this.step();
        }
        this.raf = requestAnimationFrame(this.tick);
    };

    private step() {
        const dx = this.posX - this.mouseX;
        const dy = this.posY - this.mouseY;
        const dist = Math.hypot(dx, dy);

        const stopRadius = Math.max(this.opts.speed, this.dispH * 0.5);
        if (dist < stopRadius) {
            this.idleTicks++;
            if (this.idleTicks % 8 === 0) this.idleFrame++;
            // Keep facing the last travel direction while idle.
            this.setCell(this.idleFrame % this.idleFrames, ROW_IDLE);
            return;
        }

        this.idleTicks = 0;

        // Face the way we're about to move. dx = pet − cursor, so dx < 0 means the
        // cursor is to our right and we chase right (atlas default, no flip). Only
        // flip on a real horizontal component so near-vertical chases don't jitter.
        if (Math.abs(dx) > 1) this.facing = dx < 0 ? 1 : -1;

        this.setCell(this.walkFrame++ % this.walkFrames, ROW_WALK);

        this.posX -= (dx / dist) * this.opts.speed;
        this.posY -= (dy / dist) * this.opts.speed;
        this.posX = Math.min(Math.max(this.dispW / 2, this.posX), window.innerWidth - this.dispW / 2);
        this.posY = Math.min(Math.max(this.dispH / 2, this.posY), window.innerHeight - this.dispH / 2);

        this.el.style.left = `${this.posX - this.dispW / 2}px`;
        this.el.style.top = `${this.posY - this.dispH / 2}px`;
    }

    public destroy() {
        this.destroyed = true;
        cancelAnimationFrame(this.raf);
        document.removeEventListener("mousemove", this.onMouseMove);
        this.el.remove();
    }
}

let current: CodexPet | null = null;
let started = false;
let reloadTimer: ReturnType<typeof setTimeout> | undefined;

function doReload() {
    current?.destroy();
    current = null;

    if (!started) return;

    const url = settings.store.selectedUrl;
    if (!url) return;

    current = new CodexPet({
        url,
        cols: Math.max(1, settings.store.selectedCols) || DEFAULT_COLS,
        rows: Math.max(1, settings.store.selectedRows) || DEFAULT_ROWS,
        size: Math.max(16, settings.store.size),
        speed: Math.max(1, settings.store.speed),
        fps: Math.max(1, settings.store.fps),
        pixelated: settings.store.pixelated
    });
}

function reloadPet() {
    clearTimeout(reloadTimer);
    reloadTimer = setTimeout(doReload, 120);
}

function save(key: "size" | "speed" | "fps" | "pixelated", value: number | boolean) {
    (settings.store as any)[key] = value;
    reloadPet();
}

function SliderRow({ label, value, min, max, onChange }: {
    label: string;
    value: number;
    min: number;
    max: number;
    onChange: (v: number) => void;
}) {
    return (
        <div className="vc-codexpet-slider-row">
            <span className="vc-codexpet-slider-label">{label}</span>
            <Slider
                className="vc-codexpet-slider"
                initialValue={Math.round(value)}
                minValue={min}
                maxValue={max}
                onValueChange={v => onChange(Math.round(v))}
                onValueRender={(v: number) => String(Math.round(v))}
            />
            <span className="vc-codexpet-slider-value">{Math.round(value)}</span>
        </div>
    );
}

function PetPreview({ url, cols = DEFAULT_COLS, rows = DEFAULT_ROWS }: { url: string; cols?: number; rows?: number; }) {
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const el = ref.current;
        if (!el || !url) return;

        let raf = 0;
        let frame = 0;
        let last = 0;
        let alive = true;

        const c = Math.max(1, Math.round(cols) || DEFAULT_COLS);
        const r = Math.max(1, Math.round(rows) || DEFAULT_ROWS);
        const frames = Math.min(WALK_FRAMES, c);

        const img = new Image();
        img.onload = () => {
            if (!alive || !ref.current) return;
            const node = ref.current;
            const cellW = img.naturalWidth / c;
            const cellH = img.naturalHeight / r;
            const dispH = 110;
            const dispW = Math.max(1, Math.round(dispH * (cellW / cellH)));

            node.style.width = `${dispW}px`;
            node.style.height = `${dispH}px`;
            node.style.backgroundImage = `url("${url}")`;
            node.style.backgroundSize = `${c * dispW}px ${r * dispH}px`;

            const loop = (t: number) => {
                if (!alive) return;
                if (t - last >= 1000 / 12) {
                    last = t;
                    const col = frame++ % frames;
                    node.style.backgroundPosition = `-${col * dispW}px -${ROW_WALK * dispH}px`;
                }
                raf = requestAnimationFrame(loop);
            };
            raf = requestAnimationFrame(loop);
        };
        img.src = url;

        return () => {
            alive = false;
            cancelAnimationFrame(raf);
        };
    }, [url, cols, rows]);

    return <div ref={ref} className="vc-codexpet-sprite" />;
}

function PetPicker() {
    const { selectedSlug, size, speed, fps, pixelated } = settings.use([
        "selectedSlug", "size", "speed", "fps", "pixelated"
    ]);
    const [pets, setPets] = useState<Pet[]>([]);
    const [status, setStatus] = useState<"loading" | "ok" | "error">("loading");

    useEffect(() => {
        let alive = true;
        fetchPets()
            .then(p => { if (alive) { setPets(p); setStatus("ok"); } })
            .catch(() => { if (alive) setStatus("error"); });
        return () => { alive = false; };
    }, []);

    const options = useMemo(() => pets.map(p => ({ label: p.name, value: p.slug })), [pets]);

    function selectSlug(slug: string) {
        const p = pets.find(x => x.slug === slug);
        if (!p) return;
        settings.store.selectedSlug = p.slug;
        settings.store.selectedName = p.name;
        settings.store.selectedUrl = p.url;
        settings.store.selectedCols = p.cols || DEFAULT_COLS;
        settings.store.selectedRows = p.rows || DEFAULT_ROWS;
        reloadPet();
    }

    const selected = pets.find(p => p.slug === selectedSlug);

    return (
        <div className="vc-codexpet-picker">
            <Forms.FormTitle tag="h3">Pet</Forms.FormTitle>

            {status === "error" ? (
                <Forms.FormText className="vc-codexpet-empty">
                    Couldn't reach the pet catalog (api.pixelcord.com.br). Check your connection and try
                    reopening settings.
                </Forms.FormText>
            ) : (
                <SearchableSelect
                    placeholder={status === "loading" ? "Loading pets…" : `Search ${pets.length} pets…`}
                    options={options}
                    value={options.find(o => o.value === selectedSlug)}
                    onChange={(v: any) => selectSlug(typeof v === "string" ? v : v?.value)}
                    maxVisibleItems={8}
                    closeOnSelect
                />
            )}
            <Forms.FormText className="vc-codexpet-hint">
                {pets.length ? `${pets.length} pets from codex-pets.net` : "Characters from codex-pets.net"}
            </Forms.FormText>
            {selected?.desc
                ? <Text variant="text-xs/normal" className="vc-codexpet-desc">{selected.desc}</Text>
                : null}

            <div className="vc-codexpet-controls">
                <SliderRow label="Size" value={size} min={24} max={160} onChange={v => save("size", v)} />
                <SliderRow label="Speed" value={speed} min={3} max={30} onChange={v => save("speed", v)} />
                <SliderRow label="FPS" value={fps} min={4} max={30} onChange={v => save("fps", v)} />
                <div className="vc-codexpet-toggles">
                    <Checkbox value={pixelated} onChange={(_, v) => save("pixelated", v)} size={18}>
                        <span className="vc-codexpet-check-label">Pixelated</span>
                    </Checkbox>
                </div>
            </div>
        </div>
    );
}

function AboutPreview() {
    const { selectedUrl, selectedName, selectedCols, selectedRows } = settings.use([
        "selectedUrl", "selectedName", "selectedCols", "selectedRows"
    ]);
    if (!selectedUrl) return null;

    return (
        <div className="vc-codexpet-about">
            <div className="vc-codexpet-floating">
                <PetPreview key={selectedUrl} url={selectedUrl} cols={selectedCols} rows={selectedRows} />
                <Text variant="text-sm/semibold">{selectedName || "—"}</Text>
            </div>
        </div>
    );
}

const settings = definePluginSettings({
    petPicker: {
        type: OptionType.COMPONENT,
        component: PetPicker
    },
    selectedSlug: { type: OptionType.STRING, description: "Selected pet slug", default: DEFAULT_PET.slug, hidden: true },
    selectedName: { type: OptionType.STRING, description: "Selected pet name", default: DEFAULT_PET.name, hidden: true },
    selectedUrl: { type: OptionType.STRING, description: "Selected pet spritesheet", default: DEFAULT_PET.url, hidden: true },
    selectedCols: { type: OptionType.NUMBER, description: "Selected pet atlas columns", default: DEFAULT_PET.cols, hidden: true },
    selectedRows: { type: OptionType.NUMBER, description: "Selected pet atlas rows", default: DEFAULT_PET.rows, hidden: true },
    size: { type: OptionType.NUMBER, description: "Pet height in px", default: 50, hidden: true },
    speed: { type: OptionType.NUMBER, description: "Movement speed", default: 10, hidden: true },
    fps: { type: OptionType.NUMBER, description: "Animation FPS", default: 16, hidden: true },
    pixelated: { type: OptionType.BOOLEAN, description: "Pixelated rendering", default: false, hidden: true }
});

export default definePlugin({
    name: "CodexPet",
    description: "A pet that follows your cursor, with thousands of characters from codex-pets.net. Pick one and preview it right in the settings.",
    authors: [PixelCordDevs.myvings],
    tags: ["Fun", "Appearance", "Customisation"],
    settings,
    settingsAboutComponent: AboutPreview,

    start() {
        started = true;
        // Selections saved by the old codex-pet.com build point at sprites that
        // are no longer whitelisted, so fall back to the current default.
        if (settings.store.selectedUrl?.includes("codex-pet.com")) {
            settings.store.selectedSlug = DEFAULT_PET.slug;
            settings.store.selectedName = DEFAULT_PET.name;
            settings.store.selectedUrl = DEFAULT_PET.url;
            settings.store.selectedCols = DEFAULT_PET.cols;
            settings.store.selectedRows = DEFAULT_PET.rows;
        }
        // The pet itself only needs the stored URL + grid; the full catalog is
        // fetched lazily when the settings picker opens, not on every launch.
        doReload();
    },

    stop() {
        started = false;
        clearTimeout(reloadTimer);
        current?.destroy();
        current = null;
    }
});
