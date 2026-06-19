/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { classNameFactory } from "@utils/css";
import { useEffect, useState } from "@webpack/common";

import { useFocusStore } from "./store";

const cl = classNameFactory("vc-focusmode-");

const PRESETS: { label: string; minutes: number | null; }[] = [
    { label: "25 min", minutes: 25 },
    { label: "50 min", minutes: 50 },
    { label: "90 min", minutes: 90 },
    { label: "No timer", minutes: null }
];

function formatRemaining(endsAt: number | null): string {
    if (endsAt == null) return "On";
    const ms = Math.max(0, endsAt - Date.now());
    const total = Math.round(ms / 1000);
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function FocusPanel() {
    const store = useFocusStore();
    const [, forceTick] = useState(0);

    // Re-render once a second so the countdown stays live.
    useEffect(() => {
        if (!store.active || store.endsAt == null) return;
        const id = setInterval(() => forceTick(t => t + 1), 1000);
        return () => clearInterval(id);
    }, [store.active, store.endsAt]);

    return (
        <div className={cl("panel")}>
            <div className={cl("head")}>
                <span className={cl("title")}>Focus Mode</span>
                {store.active && <span className={cl("badge")}>{formatRemaining(store.endsAt)}</span>}
            </div>

            {store.active ? (
                <>
                    <span className={cl("hint")}>
                        Distractions are hidden. Stay in the zone.
                    </span>
                    <button className={cl("stop")} onClick={() => store.stop()}>
                        End session
                    </button>
                </>
            ) : (
                <>
                    <span className={cl("hint")}>Pick a length to start focusing.</span>
                    <div className={cl("presets")}>
                        {PRESETS.map(preset => (
                            <button
                                key={preset.label}
                                className={cl("preset")}
                                onClick={() => store.start(preset.minutes)}
                            >
                                {preset.label}
                            </button>
                        ))}
                    </div>
                </>
            )}
        </div>
    );
}
