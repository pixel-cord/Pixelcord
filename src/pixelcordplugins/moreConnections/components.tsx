/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import ErrorBoundary from "@components/ErrorBoundary";
import { Flex } from "@components/Flex";
import { Paragraph } from "@components/Paragraph";
import { Margins } from "@utils/margins";
import { RenderModalProps } from "@vencord/discord-types";
import { Button, Modal, openModal, showToast, TextInput, Toasts, Tooltip, useEffect, UserStore, useState } from "@webpack/common";

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
            <Button onClick={() => openModal(props => <ManageModal modalProps={props} />)}>Manage connections</Button>
            <Button color={Button.Colors.RED} onClick={() => auth.remove(UserStore.getCurrentUser().id)}>Log out</Button>
        </div>
    );
}

// ---------------------------------------------------------------------------
// Profile popout — renders a user's custom connections as clickable chips.
// ---------------------------------------------------------------------------

function ConnectionsProfile({ id }: { id: string; }) {
    const connections = useUsersConnectionsStore((s: any) => s.users.get(id)?.connections) as Connections | undefined;

    useEffect(() => {
        useUsersConnectionsStore.getState().request(id);
    }, [id]);

    if (!connections) return null;

    const entries = PLATFORMS
        .map(p => [p, connections[p.id]] as const)
        .filter(([, value]) => !!value);

    if (!entries.length) return null;

    return (
        <Flex gap={8} flexWrap="wrap" style={{ marginTop: 8 }}>
            {entries.map(([platform, value]) => (
                <Tooltip key={platform.id} text={`${platform.name}: ${value}`}>
                    {tooltipProps => (
                        <a
                            {...tooltipProps}
                            href={platform.profileUrl(value)}
                            target="_blank"
                            rel="noreferrer"
                            style={{ display: "inline-flex", alignItems: "center", lineHeight: 0 }}
                        >
                            <platform.Icon size={32} />
                        </a>
                    )}
                </Tooltip>
            ))}
        </Flex>
    );
}

export const profileConnectionsComponent = ErrorBoundary.wrap(
    (props: { user?: { id: string; }; }) => props.user ? <ConnectionsProfile id={props.user.id} /> : null,
    { noop: true }
);
