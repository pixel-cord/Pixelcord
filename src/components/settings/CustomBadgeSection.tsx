/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./CustomBadgeSection.css";

import { Heading } from "@components/Heading";
import { Paragraph } from "@components/Paragraph";
import { useAuthorizationStore } from "@pixelcordplugins/hideBadges/lib/auth";
import { API_URL } from "@pixelcordplugins/hideBadges/lib/constants";
import { classNameFactory } from "@utils/css";
import { Margins } from "@utils/margins";
import { classes } from "@utils/misc";
import { RenderModalProps } from "@vencord/discord-types";
import { Button, Modal, openModal, showToast, TextInput, Toasts, useEffect, UserStore, UserUtils, useState } from "@webpack/common";

const cl = classNameFactory("vc-px-badge-");

const MAX_BYTES = 5 * 1024 * 1024;

interface Gifted {
    id: string;
    targetId: string;
    imageUrl: string;
    tooltip: string;
    status: string;
}

interface ReceivedBadge {
    id: string;
    imageUrl: string;
    tooltip: string;
    status: string;
    editStatus?: string | null;
}

function authHeader(token: string) {
    return { Authorization: `Bearer ${token}` };
}

function statusLabel(s: string): string {
    switch (s) {
        case "pending": return "Pendente";
        case "approved": return "Aprovada";
        case "rejected": return "Recusada";
        case "removed": return "Removida";
        default: return s;
    }
}

// Avatar + name for a user id, fetching the user if it isn't cached yet.
function FriendChip({ id }: { id: string; }) {
    const [user, setUser] = useState(() => UserStore.getUser(id));

    useEffect(() => {
        let alive = true;
        if (!user && id) UserUtils.getUser(id).then(u => { if (alive) setUser(u); }).catch(() => { });
        return () => { alive = false; };
    }, [id]);

    return (
        <span className={cl("friend-chip")}>
            {user
                ? <img className={cl("friend-avatar")} src={user.getAvatarURL(undefined, 64)} alt="" />
                : <span className={cl("friend-avatar")} />}
            <span className={cl("friend-cname")}>{user?.username ?? id}</span>
        </span>
    );
}

function CreateBadgeModal({ modalProps, token, onDone }: { modalProps: RenderModalProps; token: string; onDone: () => void; }) {
    const [dataUrl, setDataUrl] = useState<string | null>(null);
    const [fileName, setFileName] = useState("");
    const [tooltip, setTooltip] = useState("");
    const [mode, setMode] = useState<"self" | "gift">("self");
    const [friendId, setFriendId] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [done, setDone] = useState(false);

    function pickFile(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        if (!file) return;
        if (!file.type.startsWith("image/")) return setError("Selecione um arquivo de imagem.");
        if (file.size > MAX_BYTES) return setError("Imagem maior que 5 MB.");
        const reader = new FileReader();
        reader.onload = () => {
            setDataUrl(reader.result as string);
            setFileName(file.name);
            setError(null);
        };
        reader.readAsDataURL(file);
    }

    const giftValid = mode === "self" || /^\d{5,25}$/.test(friendId.trim());
    const canSubmit = !!dataUrl && giftValid && !loading;

    async function submit() {
        if (!canSubmit) return;
        setLoading(true);
        setError(null);
        try {
            const res = await fetch(`${API_URL}/badges`, {
                method: "POST",
                headers: { "Content-Type": "application/json", ...authHeader(token) },
                body: JSON.stringify({
                    imageBase64: dataUrl,
                    tooltip: tooltip.trim() || undefined,
                    targetId: mode === "gift" ? friendId.trim() : undefined
                })
            });
            if (!res.ok) {
                const txt = await res.text().catch(() => "");
                if (res.status === 403) throw new Error("Você não tem créditos. Doe R$10 para ganhar 1 badge.");
                throw new Error(txt || `Erro ${res.status}`);
            }
            setDone(true);
            onDone();
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        } finally {
            setLoading(false);
        }
    }

    if (done) {
        return (
            <Modal {...modalProps} size="sm" title="Custom Badge">
                <div className={cl("modal")}>
                    <div className={cl("done")}>
                        <div className={cl("check")}>✓</div>
                        <Heading>Enviada para aprovação!</Heading>
                        <Paragraph>Sua badge foi enviada e você será avisado por DM quando for aprovada ou recusada.</Paragraph>
                        <Button color={Button.Colors.BRAND} onClick={modalProps.onClose}>Fechar</Button>
                    </div>
                </div>
            </Modal>
        );
    }

    return (
        <Modal {...modalProps} size="sm" title="Criar Custom Badge">
            <div className={cl("modal")}>
                <label className={cl("upload")}>
                    {dataUrl ? "Trocar imagem" : "Escolher imagem"}
                    <input
                        type="file"
                        accept="image/png,image/jpeg,image/gif,image/webp"
                        style={{ display: "none" }}
                        onChange={pickFile}
                    />
                </label>
                {dataUrl && (
                    <div className={cl("preview-row")}>
                        <img className={cl("preview")} src={dataUrl} alt="" />
                        <span className={cl("file-name")}>{fileName}</span>
                    </div>
                )}
                <span className={cl("hint")}>PNG, JPG, GIF ou WEBP — até 5 MB.</span>

                <div className={cl("field")}>
                    <Heading tag="h5">Nome da badge</Heading>
                    <TextInput value={tooltip} onChange={setTooltip} placeholder="Ex.: Apoiador PixelCord" />
                </div>

                <div className={cl("field")}>
                    <Heading tag="h5">Para quem?</Heading>
                    <div className={cl("mode-row")}>
                        <button className={classes(cl("mode-btn"), mode === "self" && cl("mode-on"))} onClick={() => setMode("self")}>
                            Para mim
                        </button>
                        <button className={classes(cl("mode-btn"), mode === "gift" && cl("mode-on"))} onClick={() => setMode("gift")}>
                            Presentear amigo
                        </button>
                    </div>
                    {mode === "gift" && (
                        <div className={cl("friend")}>
                            <TextInput
                                value={friendId}
                                onChange={v => setFriendId(v.replace(/\D/g, ""))}
                                placeholder="ID do usuário que vai receber"
                            />
                            {friendId && !giftValid && <span className={cl("error")}>ID inválido.</span>}
                            {giftValid && (
                                <div className={cl("receiver")}>
                                    <span className={cl("receiver-label")}>Vai receber:</span>
                                    <FriendChip id={friendId.trim()} />
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {error && <span className={cl("error")}>{error}</span>}

                <Button color={Button.Colors.BRAND} className={cl("submit")} disabled={!canSubmit} onClick={submit}>
                    {loading ? "Enviando…" : "Enviar para aprovação"}
                </Button>
            </div>
        </Modal>
    );
}

function EditBadgeModal({ modalProps, token, badge, onDone }: { modalProps: RenderModalProps; token: string; badge: ReceivedBadge; onDone: () => void; }) {
    const [dataUrl, setDataUrl] = useState<string | null>(null);
    const [fileName, setFileName] = useState("");
    const [tooltip, setTooltip] = useState(badge.tooltip);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [done, setDone] = useState(false);

    function pickFile(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        if (!file) return;
        if (!file.type.startsWith("image/")) return setError("Selecione um arquivo de imagem.");
        if (file.size > MAX_BYTES) return setError("Imagem maior que 5 MB.");
        const reader = new FileReader();
        reader.onload = () => {
            setDataUrl(reader.result as string);
            setFileName(file.name);
            setError(null);
        };
        reader.readAsDataURL(file);
    }

    const nameChanged = !!tooltip.trim() && tooltip.trim() !== badge.tooltip;
    const canSubmit = (!!dataUrl || nameChanged) && !loading;

    async function submit() {
        if (!canSubmit) return;
        setLoading(true);
        setError(null);
        try {
            const res = await fetch(`${API_URL}/badges/${badge.id}/edit`, {
                method: "POST",
                headers: { "Content-Type": "application/json", ...authHeader(token) },
                body: JSON.stringify({
                    imageBase64: dataUrl || undefined,
                    tooltip: nameChanged ? tooltip.trim() : undefined
                })
            });
            if (!res.ok) {
                const txt = await res.text().catch(() => "");
                throw new Error(txt || `Erro ${res.status}`);
            }
            setDone(true);
            onDone();
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        } finally {
            setLoading(false);
        }
    }

    if (done) {
        return (
            <Modal {...modalProps} size="sm" title="Editar Custom Badge">
                <div className={cl("modal")}>
                    <div className={cl("done")}>
                        <div className={cl("check")}>✓</div>
                        <Heading>Edição enviada!</Heading>
                        <Paragraph>A alteração passa por aprovação. A badge atual continua valendo até lá, e você será avisado por DM.</Paragraph>
                        <Button color={Button.Colors.BRAND} onClick={modalProps.onClose}>Fechar</Button>
                    </div>
                </div>
            </Modal>
        );
    }

    return (
        <Modal {...modalProps} size="sm" title="Editar Custom Badge">
            <div className={cl("modal")}>
                <div className={cl("preview-row")}>
                    <img className={cl("preview")} src={dataUrl ?? badge.imageUrl} alt="" />
                    <span className={cl("file-name")}>{dataUrl ? fileName : "imagem atual"}</span>
                </div>
                <label className={cl("upload")}>
                    {dataUrl ? "Trocar imagem" : "Nova imagem (opcional)"}
                    <input
                        type="file"
                        accept="image/png,image/jpeg,image/gif,image/webp"
                        style={{ display: "none" }}
                        onChange={pickFile}
                    />
                </label>
                <span className={cl("hint")}>PNG, JPG, GIF ou WEBP — até 5 MB.</span>

                <div className={cl("field")}>
                    <Heading tag="h5">Nome da badge</Heading>
                    <TextInput value={tooltip} onChange={setTooltip} placeholder="Nome da badge" />
                </div>

                {error && <span className={cl("error")}>{error}</span>}

                <Button color={Button.Colors.BRAND} className={cl("submit")} disabled={!canSubmit} onClick={submit}>
                    {loading ? "Enviando…" : "Enviar edição para aprovação"}
                </Button>
            </div>
        </Modal>
    );
}

export function CustomBadgeSection() {
    const token = useAuthorizationStore(s => s.token);
    const [credits, setCredits] = useState<number | null>(null);
    const [gifted, setGifted] = useState<Gifted[]>([]);
    const [received, setReceived] = useState<ReceivedBadge[]>([]);

    async function refresh(tok: string) {
        try {
            const [credRes, giftRes, mineRes] = await Promise.all([
                fetch(`${API_URL}/me/badge-credits`, { headers: authHeader(tok) }),
                fetch(`${API_URL}/me/gifted`, { headers: authHeader(tok) }),
                fetch(`${API_URL}/me/badges`, { headers: authHeader(tok) })
            ]);
            if (credRes.ok) setCredits((await credRes.json()).available ?? 0);
            if (giftRes.ok) setGifted((await giftRes.json()).badges ?? []);
            if (mineRes.ok) setReceived((await mineRes.json()).badges ?? []);
        } catch { /* ignore */ }
    }

    useEffect(() => {
        if (token) refresh(token);
    }, [token]);

    async function removeGift(id: string) {
        if (!token) return;
        try {
            const res = await fetch(`${API_URL}/me/gifted/${id}`, { method: "DELETE", headers: authHeader(token) });
            if (res.ok) {
                showToast("Badge removida.", Toasts.Type.SUCCESS);
                refresh(token);
            } else {
                showToast("Não foi possível remover.", Toasts.Type.FAILURE);
            }
        } catch {
            showToast("Erro ao remover a badge.", Toasts.Type.FAILURE);
        }
    }

    if (!token) {
        return (
            <div className={cl("section")}>
                <Heading className={Margins.top16}>Custom Badge</Heading>
                <Paragraph>Entre com o Discord (no card de doação acima) para criar e gerenciar suas Custom Badges.</Paragraph>
            </div>
        );
    }

    const hasCredits = (credits ?? 0) >= 1;

    return (
        <>
            <div className={cl("section")}>
                <Heading className={Margins.top16}>Custom Badge</Heading>
                <Paragraph>
                    A cada R$10,00 doados você ganha 1 Custom Badge. Envie uma imagem (até 5 MB) — toda badge passa por aprovação.
                </Paragraph>
                <div className={cl("credits")}>
                    <span className={cl("credits-num")}>{credits ?? "—"}</span>
                    <span className={cl("credits-text")}>badge(s) disponível(is)</span>
                </div>
                <Button color={Button.Colors.BRAND} disabled={!hasCredits} onClick={() => token && openModal(props =>
                    <CreateBadgeModal modalProps={props} token={token} onDone={() => refresh(token)} />
                )}>
                    Criar Custom Badge
                </Button>
                {!hasCredits && <Paragraph className={cl("hint")}>Doe R$10 no card acima para ganhar 1 badge.</Paragraph>}
            </div>

            {received.length > 0 && (
                <div className={cl("section")}>
                    <Heading className={Margins.top16}>Minhas Custom Badges</Heading>
                    <Paragraph>Badges que estão na sua conta. Você pode mudar a foto ou o nome — a alteração passa por aprovação.</Paragraph>
                    <div className={cl("gift-list")}>
                        {received.map(b => (
                            <div key={b.id} className={cl("gift")}>
                                <img className={cl("gift-img")} src={b.imageUrl} alt="" />
                                <div className={cl("gift-info")}>
                                    <span className={cl("gift-name")}>{b.tooltip}</span>
                                    <span className={cl("gift-target")}>
                                        {statusLabel(b.status)}{b.editStatus === "pending" ? " · edição pendente" : ""}
                                    </span>
                                </div>
                                {b.status === "approved" && b.editStatus !== "pending" && (
                                    <Button color={Button.Colors.PRIMARY} size={Button.Sizes.SMALL} onClick={() => token && openModal(props =>
                                        <EditBadgeModal modalProps={props} token={token} badge={b} onDone={() => refresh(token)} />
                                    )}>
                                        Editar
                                    </Button>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {gifted.length > 0 && (
                <div className={cl("section")}>
                    <Heading className={Margins.top16}>Badges Presenteadas</Heading>
                    <Paragraph>Badges que você enviou para amigos. Você pode remover apenas as que você presenteou.</Paragraph>
                    <div className={cl("gift-list")}>
                        {gifted.map(g => (
                            <div key={g.id} className={cl("gift")}>
                                <img className={cl("gift-img")} src={g.imageUrl} alt="" />
                                <div className={cl("gift-info")}>
                                    <span className={cl("gift-name")}>{g.tooltip}</span>
                                    <span className={cl("gift-target")}>
                                        para <FriendChip id={g.targetId} />
                                    </span>
                                </div>
                                <span className={classes(cl("gift-status"), cl(`gift-status-${g.status}`))}>{statusLabel(g.status)}</span>
                                {g.status === "approved" && (
                                    <Button color={Button.Colors.RED} size={Button.Sizes.SMALL} onClick={() => removeGift(g.id)}>
                                        Remover
                                    </Button>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </>
    );
}
