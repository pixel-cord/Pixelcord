/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./DonateModal.css";

import { HeadingTertiary } from "@components/Heading";
import { useAuthorizationStore } from "@pixelcordplugins/hideBadges/lib/auth";
import { API_URL } from "@pixelcordplugins/hideBadges/lib/constants";
import { classNameFactory } from "@utils/css";
import { copyWithToast } from "@utils/discord";
import { classes } from "@utils/misc";
import { RenderModalProps } from "@vencord/discord-types";
import { Button, Modal, openModal, TextInput, useEffect, UserStore, useState } from "@webpack/common";

const cl = classNameFactory("vc-px-donate-");

const MIN_REAIS = 10;
const QUICK = [10, 25, 50, 100];
const DONE_STATES = ["paid", "failed", "cancelled", "expired", "psp_failed"];

interface PixResult {
    id: string;
    status: string;
    amountCents: number;
    totalCents: number;
    pixCopyPaste: string;
    qrImage: string;
}

interface LtcResult {
    id: string;
    status: string;
    address: string;
    amountLtc: number;
    amountBrl: number;
    expiresAt: string;
    qrImage: string;
}

type PayMethod = "pix" | "ltc";
type PayResult = (PixResult & { kind: "pix"; }) | (LtcResult & { kind: "ltc"; });

interface Donation {
    id: string;
    amountCents: number;
    totalCents: number;
    status: string;
    createdAt: number;
    paidAt?: number | null;
}

function parseReais(input: string): number {
    const n = parseFloat(input.replace(",", "."));
    return Number.isFinite(n) ? n : 0;
}

function brl(cents: number): string {
    return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function statusLabel(status: string): string {
    switch (status) {
        case "paid": return "Pago";
        case "pending": return "Pendente";
        case "expired": return "Expirado";
        case "cancelled": return "Cancelado";
        case "failed":
        case "psp_failed": return "Falhou";
        default: return status;
    }
}

function formatDate(unix: number): string {
    return new Date(unix * 1000).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function formatTime(iso: string): string {
    return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function DonateModal({ modalProps }: { modalProps: RenderModalProps; }) {
    const token = useAuthorizationStore(s => s.token);

    const [method, setMethod] = useState<PayMethod>("pix");
    const [amount, setAmount] = useState("10");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [result, setResult] = useState<PayResult | null>(null);
    const [status, setStatus] = useState<string | null>(null);
    const [history, setHistory] = useState<Donation[]>([]);

    const reais = parseReais(amount);
    const valid = reais >= MIN_REAIS;

    function clearAuth() {
        const id = UserStore.getCurrentUser()?.id;
        if (id) useAuthorizationStore.getState().remove(id);
    }

    async function loadHistory(tok: string) {
        try {
            const res = await fetch(`${API_URL}/me/donations`, { headers: { Authorization: `Bearer ${tok}` } });
            if (res.status === 401) { clearAuth(); return; }
            if (res.ok) {
                const data = await res.json();
                setHistory(Array.isArray(data.donations) ? data.donations : []);
            }
        } catch { /* ignore */ }
    }

    useEffect(() => {
        if (token) loadHistory(token);
    }, [token]);

    async function login() {
        try {
            await useAuthorizationStore.getState().authorize();
        } catch { /* cancelled */ }
    }

    async function generate() {
        if (!valid || loading || !token) return;
        setLoading(true);
        setError(null);
        try {
            const me = UserStore.getCurrentUser();
            const res = await fetch(`${API_URL}/${method}`, {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                body: JSON.stringify({
                    amountCents: Math.round(reais * 100),
                    donorName: me?.username,
                    donorId: me?.id
                })
            });
            if (!res.ok) {
                const txt = await res.text().catch(() => "");
                if (res.status === 401) { clearAuth(); return; }
                throw new Error(res.status === 503
                    ? "Esse método de pagamento não está configurado no servidor."
                    : (txt || `Erro ${res.status}`));
            }
            const data = await res.json();
            setResult({ ...data, kind: method });
            setStatus(data.status);
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        } finally {
            setLoading(false);
        }
    }

    const payId = result?.id;
    const payKind = result?.kind;
    useEffect(() => {
        if (!payId || !payKind || (status != null && DONE_STATES.includes(status))) return;
        const iv = setInterval(async () => {
            try {
                const res = await fetch(`${API_URL}/${payKind}/${payId}`);
                if (!res.ok) return;
                const data = await res.json();
                setStatus(data.status);
                if (data.status === "paid" && token) loadHistory(token);
            } catch { /* keep polling */ }
        }, 4000);
        return () => clearInterval(iv);
    }, [payId, payKind, status, token]);

    if (!token) {
        return (
            <Modal {...modalProps} size="sm" title="Apoiar o PixelCord">
                <div className={cl("body")}>
                    <p className={cl("intro")}>
                        Pra registrar e mostrar suas doações, entre com sua conta do Discord. É o mesmo login que o PixelCord já usa. 💜
                    </p>
                    <Button color={Button.Colors.BRAND} className={cl("submit")} onClick={login}>
                        Entrar com Discord
                    </Button>
                </div>
            </Modal>
        );
    }

    return (
        <Modal {...modalProps} size="sm" title="Apoiar o PixelCord">
            <div className={cl("body")}>
                {!result ? (
                    <>
                        <p className={cl("intro")}>
                            Sua doação ajuda no desenvolvimento do PixelCord — via PIX ou Litecoin. Cada R$ 10,00 dá direito a 1 Custom Badge. 💜
                        </p>

                        <HeadingTertiary className={cl("label")}>Método</HeadingTertiary>
                        <div className={cl("method-row")}>
                            <button className={classes(cl("method-btn"), method === "pix" && cl("method-on"))} onClick={() => setMethod("pix")}>
                                PIX
                            </button>
                            <button className={classes(cl("method-btn"), method === "ltc" && cl("method-on"))} onClick={() => setMethod("ltc")}>
                                Litecoin
                            </button>
                        </div>

                        <HeadingTertiary className={cl("label")}>Valor da doação</HeadingTertiary>
                        <div className={cl("amount-row")}>
                            <span className={cl("currency")}>R$</span>
                            <div className={cl("input-wrap")}>
                                <TextInput
                                    value={amount}
                                    onChange={v => setAmount(v.replace(/[^\d.,]/g, ""))}
                                    placeholder="10,00"
                                />
                            </div>
                        </div>

                        <div className={cl("quick")}>
                            {QUICK.map(v => (
                                <button
                                    key={v}
                                    className={classes(cl("quick-btn"), reais === v && cl("quick-on"))}
                                    onClick={() => setAmount(String(v))}
                                >
                                    R$ {v}
                                </button>
                            ))}
                        </div>

                        {!valid && <span className={cl("hint")}>Mínimo de R$ 10,00.</span>}
                        {error && <span className={cl("error")}>{error}</span>}

                        <Button
                            color={Button.Colors.BRAND}
                            className={cl("submit")}
                            disabled={!valid || loading}
                            onClick={generate}
                        >
                            {loading ? "Gerando…" : (method === "ltc" ? "Gerar Litecoin" : "Gerar PIX")}
                        </Button>

                        {history.length > 0 && (
                            <div className={cl("history")}>
                                <HeadingTertiary className={cl("label")}>Suas doações</HeadingTertiary>
                                <div className={cl("history-list")}>
                                    {history.map(d => (
                                        <div key={d.id} className={cl("history-row")}>
                                            <span className={cl("history-date")}>{formatDate(d.paidAt ?? d.createdAt)}</span>
                                            <span className={cl("history-amount")}>{brl(d.amountCents)}</span>
                                            <span className={classes(cl("history-status"), cl(`history-status-${d.status}`))}>
                                                {statusLabel(d.status)}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </>
                ) : status === "paid" ? (
                    <div className={cl("done")}>
                        <div className={cl("check")}>✓</div>
                        <HeadingTertiary>Pagamento confirmado!</HeadingTertiary>
                        <p>Muito obrigado pelo apoio ao PixelCord. 💜</p>
                        <Button color={Button.Colors.BRAND} onClick={() => { setResult(null); setStatus(null); }}>
                            Voltar
                        </Button>
                    </div>
                ) : (status != null && DONE_STATES.includes(status)) ? (
                    <div className={cl("done")}>
                        <HeadingTertiary>Pagamento não concluído</HeadingTertiary>
                        <p>A cobrança expirou ou foi cancelada. Você pode gerar outra.</p>
                        <Button color={Button.Colors.PRIMARY} onClick={() => { setResult(null); setStatus(null); }}>
                            Gerar outra
                        </Button>
                    </div>
                ) : result.kind === "ltc" ? (
                    <div className={cl("result")}>
                        {result.qrImage && <img className={cl("qr")} src={result.qrImage} alt="QR Litecoin" />}

                        <div className={cl("total")}>
                            Envie <strong>{result.amountLtc.toFixed(8)} LTC</strong> <span className={cl("muted")}>(≈ {brl(result.amountBrl)})</span>
                        </div>
                        <span className={cl("scan-hint")}>Escaneie o QR na sua carteira Litecoin ou copie o endereço. Envie o valor exato.</span>

                        <div className={cl("code-box")}>{result.address}</div>
                        <Button
                            color={Button.Colors.BRAND}
                            className={cl("copy")}
                            onClick={() => copyWithToast(result.address, "Endereço LTC copiado!")}
                        >
                            Copiar endereço LTC
                        </Button>
                        {result.expiresAt && <span className={cl("hint")}>Expira às {formatTime(result.expiresAt)}.</span>}

                        <div className={cl("waiting")}>
                            <span className={cl("spinner")} />
                            <span>Aguardando confirmação na rede…</span>
                        </div>
                    </div>
                ) : (
                    <div className={cl("result")}>
                        {result.qrImage && <img className={cl("qr")} src={result.qrImage} alt="QR Code PIX" />}

                        <div className={cl("total")}>Total a pagar: <strong>{brl(result.totalCents)}</strong></div>
                        <span className={cl("scan-hint")}>Escaneie o QR no app do seu banco ou use o código copia e cola.</span>

                        <div className={cl("code-box")}>{result.pixCopyPaste}</div>
                        <Button
                            color={Button.Colors.BRAND}
                            className={cl("copy")}
                            onClick={() => copyWithToast(result.pixCopyPaste, "Código PIX copiado!")}
                        >
                            Copiar código PIX
                        </Button>

                        <div className={cl("waiting")}>
                            <span className={cl("spinner")} />
                            <span>Aguardando pagamento…</span>
                        </div>
                    </div>
                )}
            </div>
        </Modal>
    );
}

export function openDonateModal() {
    openModal(props => <DonateModal modalProps={props} />);
}
