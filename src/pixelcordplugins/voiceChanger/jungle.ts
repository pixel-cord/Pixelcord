/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

// Real-time pitch shifter for Web Audio, adapted from Chris Wilson's "Jungle"
// (github.com/cwilso/Audio-Input-Effects, MIT). Uses two crossfaded, delay-line
// modulated voices to shift pitch without changing tempo — good enough for a
// voice-changer effect (warbles a bit, like all real-time pitch shifters).

const delayTime = 0.100;
const fadeTime = 0.050;
const bufferTime = 0.100;

function createFadeBuffer(context: BaseAudioContext, activeTime: number, fadeT: number): AudioBuffer {
    const length1 = activeTime * context.sampleRate;
    const length2 = (activeTime - 2 * fadeT) * context.sampleRate;
    const length = length1 + length2;
    const buffer = context.createBuffer(1, length, context.sampleRate);
    const p = buffer.getChannelData(0);

    const fadeLength = fadeT * context.sampleRate;
    const fadeIndex1 = fadeLength;
    const fadeIndex2 = length1 - fadeLength;

    for (let i = 0; i < length1; ++i) {
        let value: number;
        if (i < fadeIndex1) value = Math.sqrt(i / fadeLength);
        else if (i >= fadeIndex2) value = Math.sqrt(1 - (i - fadeIndex2) / fadeLength);
        else value = 1;
        p[i] = value;
    }
    for (let i = length1; i < length; ++i) p[i] = 0;
    return buffer;
}

function createDelayTimeBuffer(context: BaseAudioContext, activeTime: number, fadeT: number, shiftUp: boolean): AudioBuffer {
    const length1 = activeTime * context.sampleRate;
    const length2 = (activeTime - 2 * fadeT) * context.sampleRate;
    const length = length1 + length2;
    const buffer = context.createBuffer(1, length, context.sampleRate);
    const p = buffer.getChannelData(0);

    for (let i = 0; i < length1; ++i) {
        if (shiftUp) p[i] = (length1 - i) / length;
        else p[i] = i / length1;
    }
    for (let i = length1; i < length; ++i) p[i] = 0;
    return buffer;
}

export class Jungle {
    context: BaseAudioContext;
    input: GainNode;
    output: GainNode;

    private mod1Gain: GainNode;
    private mod2Gain: GainNode;
    private mod3Gain: GainNode;
    private mod4Gain: GainNode;
    private modGain1: GainNode;
    private modGain2: GainNode;

    constructor(context: BaseAudioContext) {
        this.context = context;
        const input = context.createGain();
        const output = context.createGain();

        const shiftDownBuffer = createDelayTimeBuffer(context, bufferTime, fadeTime, false);
        const shiftUpBuffer = createDelayTimeBuffer(context, bufferTime, fadeTime, true);

        const mod1 = context.createBufferSource();
        const mod2 = context.createBufferSource();
        const mod3 = context.createBufferSource();
        const mod4 = context.createBufferSource();
        mod1.buffer = shiftDownBuffer;
        mod2.buffer = shiftDownBuffer;
        mod3.buffer = shiftUpBuffer;
        mod4.buffer = shiftUpBuffer;
        mod1.loop = mod2.loop = mod3.loop = mod4.loop = true;

        const mod1Gain = context.createGain();
        const mod2Gain = context.createGain();
        const mod3Gain = context.createGain(); mod3Gain.gain.value = 0;
        const mod4Gain = context.createGain(); mod4Gain.gain.value = 0;
        mod1.connect(mod1Gain);
        mod2.connect(mod2Gain);
        mod3.connect(mod3Gain);
        mod4.connect(mod4Gain);

        const modGain1 = context.createGain();
        const modGain2 = context.createGain();
        const delay1 = context.createDelay();
        const delay2 = context.createDelay();
        mod1Gain.connect(modGain1);
        mod3Gain.connect(modGain1);
        mod2Gain.connect(modGain2);
        mod4Gain.connect(modGain2);
        modGain1.connect(delay1.delayTime);
        modGain2.connect(delay2.delayTime);

        const fadeBuffer = createFadeBuffer(context, bufferTime, fadeTime);
        const fade1 = context.createBufferSource();
        const fade2 = context.createBufferSource();
        fade1.buffer = fadeBuffer;
        fade2.buffer = fadeBuffer;
        fade1.loop = fade2.loop = true;

        const mix1 = context.createGain(); mix1.gain.value = 0;
        const mix2 = context.createGain(); mix2.gain.value = 0;
        fade1.connect(mix1.gain);
        fade2.connect(mix2.gain);

        input.connect(delay1);
        input.connect(delay2);
        delay1.connect(mix1);
        delay2.connect(mix2);
        mix1.connect(output);
        mix2.connect(output);

        const t = context.currentTime + 0.050;
        const t2 = t + bufferTime - fadeTime;
        mod1.start(t); mod2.start(t2); mod3.start(t); mod4.start(t2);
        fade1.start(t); fade2.start(t2);

        this.input = input;
        this.output = output;
        this.mod1Gain = mod1Gain;
        this.mod2Gain = mod2Gain;
        this.mod3Gain = mod3Gain;
        this.mod4Gain = mod4Gain;
        this.modGain1 = modGain1;
        this.modGain2 = modGain2;
    }

    private setDelay(dt: number) {
        this.modGain1.gain.setTargetAtTime(0.5 * dt, this.context.currentTime, 0.010);
        this.modGain2.gain.setTargetAtTime(0.5 * dt, this.context.currentTime, 0.010);
    }

    /** mult in [-1, 1] ≈ [-1 octave, +1 octave]. */
    setPitchOffset(mult: number) {
        if (mult > 0) { // pitch up
            this.mod1Gain.gain.value = 0;
            this.mod2Gain.gain.value = 0;
            this.mod3Gain.gain.value = 1;
            this.mod4Gain.gain.value = 1;
        } else { // pitch down
            this.mod1Gain.gain.value = 1;
            this.mod2Gain.gain.value = 1;
            this.mod3Gain.gain.value = 0;
            this.mod4Gain.gain.value = 0;
        }
        this.setDelay(delayTime * Math.abs(mult));
    }
}
