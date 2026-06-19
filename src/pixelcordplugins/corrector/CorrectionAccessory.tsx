/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Message } from "@vencord/discord-types";
import { Parser, useEffect, useState } from "@webpack/common";

import { CorrectIcon } from "./CorrectorIcon";
import { cl, CorrectionValue } from "./utils";

const CorrectionSetters = new Map<string, (v: CorrectionValue) => void>();

export function handleCorrection(messageId: string, data: CorrectionValue) {
    CorrectionSetters.get(messageId)?.(data);
}

function Dismiss({ onDismiss }: { onDismiss: () => void; }) {
    return (
        <button onClick={onDismiss} className={cl("dismiss")}>
            Dismiss
        </button>
    );
}

export function CorrectionAccessory({ message }: { message: Message; }) {
    const [correction, setCorrection] = useState<CorrectionValue>();

    useEffect(() => {
        if ((message as any).vencordEmbeddedBy) return;

        CorrectionSetters.set(message.id, setCorrection);
        return () => void CorrectionSetters.delete(message.id);
    }, []);

    if (!correction) return null;

    const summary = correction.fixes === 0
        ? "no corrections needed"
        : `${correction.fixes} correction${correction.fixes === 1 ? "" : "s"}`;

    return (
        <span className={cl("accessory")}>
            <CorrectIcon width={16} height={16} className={cl("accessory-icon")} />
            {Parser.parse(correction.text)}
            <br />
            ({summary} - <Dismiss onDismiss={() => setCorrection(undefined)} />)
        </span>
    );
}
