/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Button } from "@components/Button";
import { Paragraph } from "@components/Paragraph";
import { Switch } from "@components/Switch";
import { Margins } from "@utils/margins";
import { RenderModalProps } from "@vencord/discord-types";
import { Modal, openModal, showToast, TextInput, Toasts, useState } from "@webpack/common";

import { redecryptVisible } from "./messages";
import { settings } from "./settings";

function KeyModal({ modalProps }: { modalProps: RenderModalProps; }) {
    const { enabled, key } = settings.use(["enabled", "key"]);
    const [input, setInput] = useState(key);

    return (
        <Modal {...modalProps} size="sm" title="Encrypted messages">
            <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 14 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <Paragraph>Encrypt my messages</Paragraph>
                    <Switch checked={enabled} onChange={v => (settings.store.enabled = v)} />
                </div>

                <div>
                    <Paragraph className={Margins.bottom8}>
                        Shared key — you and the other person must set the exact same one. Anyone without it only sees ciphertext.
                    </Paragraph>
                    <TextInput type="password" value={input} onChange={(v: string) => setInput(v)} placeholder="your secret key" />
                </div>

                <div style={{ display: "flex", justifyContent: "flex-end" }}>
                    <Button
                        onClick={() => {
                            settings.store.key = input.trim();
                            redecryptVisible();
                            showToast("Key saved.", Toasts.Type.SUCCESS);
                        }}
                    >
                        Save key
                    </Button>
                </div>
            </div>
        </Modal>
    );
}

export function openKeyModal() {
    openModal(props => <KeyModal modalProps={props} />);
}
