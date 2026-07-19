/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import { PixelCordDevs } from "@utils/constants";
import { Logger } from "@utils/Logger";
import definePlugin, { OptionType } from "@utils/types";

import { Jungle } from "./jungle";

const logger = new Logger("VoiceChanger");

function applyLiveToAll() { active.forEach(apply); }

const settings = definePluginSettings({
    pitch: {
        type: OptionType.SLIDER,
        description: "Pitch da voz em semitons — esquerda = mais grave (grossa), direita = mais aguda (fina), 0 = normal. Muda ao vivo.",
        default: 0,
        markers: [-12, -9, -6, -3, 0, 3, 6, 9, 12],
        stickToMarkers: false,
        onChange: applyLiveToAll
    }
});

function semitones(): number {
    const v = settings.store.pitch;
    return typeof v === "number" ? Math.round(v) : 0;
}

// -12..+12 semitones → -1..+1 (≈ ∓1 octave for the Jungle shifter)
function pitchMult(): number {
    return Math.max(-1, Math.min(1, semitones() / 12));
}

interface ActiveNode { ctx: AudioContext; jungle: Jungle; dry: GainNode; wet: GainNode; }
const active = new Set<ActiveNode>();

function apply(node: ActiveNode) {
    const on = semitones() !== 0;
    node.jungle.setPitchOffset(pitchMult());
    // Normal = pass the dry (direct, ~no latency) signal; effect on = the wet
    // (pitch-shifted) signal. Switching gains live avoids re-acquiring the mic.
    node.dry.gain.value = on ? 0 : 1;
    node.wet.gain.value = on ? 1 : 0;
}

function processStream(stream: MediaStream): MediaStream {
    const ctx = new AudioContext();
    ctx.resume?.().catch(() => { /* */ });

    const source = ctx.createMediaStreamSource(stream);
    const dest = ctx.createMediaStreamDestination();
    const jungle = new Jungle(ctx);
    const dry = ctx.createGain();
    const wet = ctx.createGain();

    source.connect(dry);
    dry.connect(dest);
    source.connect(jungle.input);
    jungle.output.connect(wet);
    wet.connect(dest);

    const node: ActiveNode = { ctx, jungle, dry, wet };
    apply(node);
    active.add(node);

    const result = new MediaStream();
    dest.stream.getAudioTracks().forEach(t => result.addTrack(t));
    stream.getVideoTracks().forEach(t => result.addTrack(t));

    const cleanup = () => {
        if (!active.delete(node)) return;
        try { ctx.close(); } catch { /* */ }
    };
    stream.getAudioTracks()[0]?.addEventListener("ended", cleanup);
    return result;
}

let origGUM: MediaDevices["getUserMedia"] | null = null;

export default definePlugin({
    name: "VoiceChanger",
    description: "Muda o pitch da sua voz no microfone em tempo real — mais grave (grossa) ou mais aguda (fina). Efeito estilo voice changer (distorce um pouco, como todo pitch-shift em tempo real).",
    authors: [PixelCordDevs.myvings],
    tags: ["Voice", "Fun"],
    settings,

    start() {
        const md = navigator.mediaDevices;
        if (!md?.getUserMedia) return;

        origGUM = md.getUserMedia.bind(md);
        md.getUserMedia = async (constraints?: MediaStreamConstraints) => {
            const stream = await origGUM!(constraints);
            // Only the mic (getDisplayMedia — screenshare — is a different method).
            if (constraints?.audio) {
                try {
                    return processStream(stream);
                } catch (e) {
                    logger.error("Failed to process mic stream", e);
                }
            }
            return stream;
        };
    },

    stop() {
        if (origGUM) navigator.mediaDevices.getUserMedia = origGUM;
        origGUM = null;
        active.forEach(n => { try { n.ctx.close(); } catch { /* */ } });
        active.clear();
    }
});
