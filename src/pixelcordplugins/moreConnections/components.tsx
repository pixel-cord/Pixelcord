/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Paragraph } from "@components/Paragraph";
import { Margins } from "@utils/margins";
import { RenderModalProps } from "@vencord/discord-types";
import { Button, Modal, openModal, showToast, TextInput, Toasts, useEffect, UserStore, useState } from "@webpack/common";

import { Connections, getMyConnections, setMyConnections } from "./lib/api";
import { useAuthorizationStore } from "./lib/auth";
import { PLATFORMS } from "./lib/platforms";
import { useUsersConnectionsStore } from "./lib/store";

// ---------------------------------------------------------------------------
// Settings modal — where the current user adds/edits their own connections.
// ---------------------------------------------------------------------------

function ManageModal({ modalProps }: { modalProps: RenderModalProps; }) {
    const me = UserStore.getCurrentUser();

    const [values, setValues] = useState<Connections>({});
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        getMyConnections()
            .then(setValues)
            .catch(() => showToast("Failed to load your connections.", Toasts.Type.FAILURE))
            .finally(() => setLoading(false));
    }, []);

    function save() {
        setSaving(true);
        const normalized: Connections = {};
        for (const p of PLATFORMS) {
            const v = p.normalize(values[p.id] ?? "");
            if (v) normalized[p.id] = v;
        }
        setMyConnections(normalized)
            .then(saved => {
                setValues(saved);
                useUsersConnectionsStore.getState().setLocal(me.id, saved);
                showToast("Saved your connections.", Toasts.Type.SUCCESS);
            })
            .catch(e => showToast(`Failed to save: ${e instanceof Error ? e.message : e}`, Toasts.Type.FAILURE))
            .finally(() => setSaving(false));
    }

    return (
        <Modal {...modalProps} size="md" title="Your connections">
            <div style={{ padding: 16 }}>
                <Paragraph className={Margins.bottom16}>
                    Add extra connections to your profile. They show up for everyone using Pixelcord.
                </Paragraph>
                {loading
                    ? <Paragraph>Loading…</Paragraph>
                    : PLATFORMS.map(p => (
                        <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "6px 0" }}>
                            <p.Icon size={28} />
                            <div style={{ flex: 1 }}>
                                <TextInput
                                    placeholder={p.placeholder}
                                    value={values[p.id] ?? ""}
                                    onChange={(v: string) => setValues(prev => ({ ...prev, [p.id]: v }))}
                                />
                            </div>
                        </div>
                    ))
                }
                <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 16 }}>
                    <Button onClick={save} disabled={loading || saving}>{saving ? "Saving…" : "Save"}</Button>
                </div>
            </div>
        </Modal>
    );
}

export function SettingsComponent() {
    const auth = useAuthorizationStore();

    if (!auth.isAuthorized()) {
        return <Button onClick={() => auth.authorize().catch(() => { })}>Authorize with Discord</Button>;
    }

    return (
        <div style={{ display: "flex", gap: 8 }}>
            <Button onClick={() => openManageConnections()}>Manage connections</Button>
            <Button color={Button.Colors.RED} onClick={() => auth.remove(UserStore.getCurrentUser().id)}>Log out</Button>
        </div>
    );
}

// Opens the connection editor from anywhere (e.g. Discord's native "Add
// connection" modal), authorizing with Discord first if needed.
export function openManageConnections() {
    const auth = useAuthorizationStore.getState();
    const open = () => openModal(props => <ManageModal modalProps={props} />);
    if (auth.isAuthorized()) open();
    else auth.authorize().then(open).catch(() => { });
}
