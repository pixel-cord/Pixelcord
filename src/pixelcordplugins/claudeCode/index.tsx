/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./styles.css";

import { ChatBarButton, ChatBarButtonFactory } from "@api/ChatButtons";
import { definePluginSettings } from "@api/Settings";
import { Paragraph } from "@components/Paragraph";
import { Switch } from "@components/Switch";
import { PixelCordDevs } from "@utils/constants";
import { classNameFactory } from "@utils/css";
import { sendMessage } from "@utils/discord";
import { Logger } from "@utils/Logger";
import { classes } from "@utils/misc";
import definePlugin, { IconComponent, OptionType, PluginNative } from "@utils/types";
import { Button, ChannelStore, MessageActions, MessageStore, Modal, openModal, React, showToast, UserStore } from "@webpack/common";

const Native = VencordNative.pluginHelpers.ClaudeCode as PluginNative<typeof import("./native")>;

const logger = new Logger("ClaudeCode");
const cl = classNameFactory("vc-cc-");

const settings = definePluginSettings({
    binaryPath: {
        type: OptionType.STRING,
        description: "Caminho do executável do Claude Code (opcional — deixe vazio pra detectar automaticamente). Ex: /home/você/.local/bin/claude",
        default: ""
    },
    model: {
        type: OptionType.SELECT,
        description: "Modelo (usa a sua assinatura logada no CLI)",
        options: [
            { label: "Padrão do CLI", value: "default", default: true },
            { label: "Opus (mais capaz)", value: "opus" },
            { label: "Sonnet (rápido)", value: "sonnet" },
            { label: "Haiku (leve)", value: "haiku" }
        ] as const
    },
    readLimit: {
        type: OptionType.NUMBER,
        description: "Quantas mensagens recentes o Claude recebe do canal por pedido",
        default: 50
    },
    allowSend: {
        type: OptionType.BOOLEAN,
        description: "Permitir que o Claude ENVIE mensagens no seu nome",
        default: true
    },
    allowDelete: {
        type: OptionType.BOOLEAN,
        description: "Permitir que o Claude APAGUE mensagens (irreversível)",
        default: true
    },
    allowEdit: {
        type: OptionType.BOOLEAN,
        description: "Permitir que o Claude EDITE suas mensagens",
        default: true
    }
});

// ── read/execute Discord side ────────────────────────────────────────
interface Msg { id: string; author: string; own: boolean; content: string; }

function readMessages(channelId: string, limit: number): Msg[] {
    const arr: any[] = (MessageStore.getMessages(channelId) as any)?._array ?? [];
    const meId = UserStore.getCurrentUser?.()?.id;
    return arr.slice(-Math.max(1, limit)).map(m => ({
        id: m.id,
        author: m.author?.username ?? "?",
        own: m.author?.id === meId,
        content: m.content ?? ""
    }));
}

interface Action { type: string; content?: string; message_id?: string; }

function runAction(channelId: string, a: Action): string {
    try {
        switch (a.type) {
            case "send": {
                if (!settings.store.allowSend) return "envio desativado";
                const content = String(a.content ?? "").slice(0, 2000);
                if (!content.trim()) return "conteúdo vazio";
                sendMessage(channelId, { content });
                return "✅ enviou";
            }
            case "delete": {
                if (!settings.store.allowDelete) return "apagar desativado";
                if (!a.message_id) return "sem message_id";
                MessageActions.deleteMessage(channelId, a.message_id);
                return "🗑️ apagou " + a.message_id;
            }
            case "edit": {
                if (!settings.store.allowEdit) return "editar desativado";
                if (!a.message_id) return "sem message_id";
                MessageActions.editMessage(channelId, a.message_id, { content: String(a.content ?? "").slice(0, 2000) });
                return "✏️ editou " + a.message_id;
            }
            default:
                return "ação desconhecida: " + a.type;
        }
    } catch (e) {
        logger.error("action failed", a, e);
        return "erro: " + String(e);
    }
}

// ── prompt building + parsing ────────────────────────────────────────
function buildPrompt(channelId: string, history: { role: string; text: string; }[], userText: string): string {
    const me = UserStore.getCurrentUser?.();
    const channel = ChannelStore.getChannel?.(channelId);
    const channelName = (channel as any)?.name ? `#${(channel as any).name}` : "DM";
    const msgs = readMessages(channelId, settings.store.readLimit);

    const convo = history.length
        ? "Conversa até agora:\n" + history.map(h => `${h.role === "user" ? "Usuário" : "Você"}: ${h.text}`).join("\n") + "\n\n"
        : "";

    return [
        "Você é um assistente do Claude agindo no lugar do usuário dentro de um canal do Discord.",
        `Usuário atual: ${me?.username ?? "?"} (id ${me?.id ?? "?"}). Canal: ${channelName} (id ${channelId}).`,
        `Mensagens recentes do canal (JSON, "own": true = é do próprio usuário):`,
        JSON.stringify(msgs),
        "",
        convo + `Pedido do usuário: ${userText}`,
        "",
        "Responda SOMENTE com um objeto JSON válido (sem markdown, sem crases, sem texto fora do JSON), no formato:",
        `{"reply":"uma frase curta para o usuário sobre o que você fez/vai fazer","actions":[{"type":"send","content":"..."},{"type":"delete","message_id":"..."},{"type":"edit","message_id":"...","content":"..."}]}`,
        "Regras: use os ids exatos das mensagens acima. Se nenhuma ação for necessária, use \"actions\": []. Nunca apague em massa nem envie spam. Escreva no mesmo idioma do usuário."
    ].join("\n");
}

function parsePlan(text: string): { reply: string; actions: Action[]; } | null {
    let t = text.trim();
    // strip ```json fences if the model added them anyway
    const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fence) t = fence[1].trim();
    const start = t.indexOf("{");
    const end = t.lastIndexOf("}");
    if (start === -1 || end === -1) return null;
    try {
        const obj = JSON.parse(t.slice(start, end + 1));
        return { reply: String(obj.reply ?? ""), actions: Array.isArray(obj.actions) ? obj.actions : [] };
    } catch {
        return null;
    }
}

// ── UI ───────────────────────────────────────────────────────────────
type LineKind = "user" | "assistant" | "tool" | "error";
interface Line { kind: LineKind; text: string; }

function AgentModal({ modalProps, channelId }: { modalProps: any; channelId: string; }) {
    const [lines, setLines] = React.useState<Line[]>([]);
    const [input, setInput] = React.useState("");
    const [busy, setBusy] = React.useState(false);
    const [status, setStatus] = React.useState<{ installed: boolean; version?: string; } | null>(null);
    const historyRef = React.useRef<{ role: string; text: string; }[]>([]);
    const scrollRef = React.useRef<HTMLDivElement>(null);
    const { allowSend, allowDelete, allowEdit } = settings.use(["allowSend", "allowDelete", "allowEdit"]);

    const push = (line: Line) => setLines(prev => [...prev, line]);

    React.useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight }); }, [lines]);
    React.useEffect(() => { void refreshStatus(); }, []);

    async function refreshStatus() {
        if (!Native) { setStatus({ installed: false }); return; }
        try {
            const s = await Native.claudeStatus({ binaryPath: settings.store.binaryPath });
            setStatus(s.installed ? { installed: true, version: (s as any).version } : { installed: false });
        } catch {
            setStatus({ installed: false });
        }
    }

    async function install() {
        if (!Native) return;
        setBusy(true);
        push({ kind: "tool", text: "📦 Instalando o Claude Code CLI (npm i -g @anthropic-ai/claude-code)…" });
        const r = await Native.claudeInstall();
        push({ kind: r.ok ? "tool" : "error", text: r.ok ? "✅ CLI instalado. Agora faça o login." : "Falha ao instalar:\n" + r.log });
        setBusy(false);
        void refreshStatus();
    }

    async function login() {
        if (!Native) return;
        const r = await Native.claudeLogin({ binaryPath: settings.store.binaryPath });
        push({ kind: r.ok ? "tool" : "error", text: r.message });
    }

    async function run() {
        const text = input.trim();
        if (!text || busy) return;
        if (!Native) { push({ kind: "error", text: "Este plugin só funciona no desktop (Vesktop/app)." }); return; }
        setInput("");
        push({ kind: "user", text });
        setBusy(true);

        const prompt = buildPrompt(channelId, historyRef.current, text);
        const res = await Native.claudeRun({ binaryPath: settings.store.binaryPath, prompt, model: settings.store.model });

        if (!res.ok) {
            if (res.error === "notInstalled") push({ kind: "error", text: "Claude Code CLI não encontrado. Clique em \"Instalar CLI\"." });
            else if (res.error === "notLoggedIn") push({ kind: "error", text: "Você não está logado no CLI. Clique em \"Fazer login\"." });
            else push({ kind: "error", text: "Erro: " + res.error });
            setBusy(false);
            return;
        }

        const plan = parsePlan(res.text ?? "");
        if (!plan) {
            push({ kind: "assistant", text: res.text ?? "(sem resposta)" });
            historyRef.current.push({ role: "user", text }, { role: "assistant", text: res.text ?? "" });
            setBusy(false);
            return;
        }

        if (plan.reply) push({ kind: "assistant", text: plan.reply });
        for (const a of plan.actions) {
            push({ kind: "tool", text: "🔧 " + runAction(channelId, a) });
        }
        historyRef.current.push({ role: "user", text }, { role: "assistant", text: plan.reply || "(ações executadas)" });
        setBusy(false);
    }

    const cliReady = status?.installed;

    return (
        <Modal {...modalProps} size="md" title="Claude no chat">
            <div className={cl("wrap")}>
                <Paragraph style={{ color: "var(--text-warning, #f0b232)" }}>
                    ⚠️ Usa o Claude Code CLI logado na sua máquina (sua assinatura, sem API key). Ele pode ler, enviar, editar e apagar mensagens neste canal no seu nome — ações são reais e imediatas.
                </Paragraph>

                <div className={cl("statusbar")}>
                    <span className={cl("toggle")}>
                        {cliReady ? `✅ CLI: ${status?.version ?? "ok"}` : "⚠️ CLI não detectado"}
                    </span>
                    <Button size={Button.Sizes.SMALL} color={Button.Colors.PRIMARY} disabled={busy} onClick={install}>Instalar CLI</Button>
                    <Button size={Button.Sizes.SMALL} color={Button.Colors.PRIMARY} onClick={login}>Fazer login</Button>
                    <Button size={Button.Sizes.SMALL} look={Button.Looks.LINK} color={Button.Colors.PRIMARY} onClick={refreshStatus}>Atualizar</Button>
                </div>

                <div className={cl("transcript")} ref={scrollRef}>
                    {lines.length === 0 && (
                        <Paragraph style={{ color: "var(--text-muted, #949ba4)", padding: 8 }}>
                            Peça algo — ex: "resuma as últimas mensagens", "apague minha última mensagem", "responde o fulano que já vi".
                        </Paragraph>
                    )}
                    {lines.map((l, i) => (
                        <div key={i} className={classes(cl("row"), cl(l.kind))}>{l.text}</div>
                    ))}
                </div>

                <textarea
                    className={cl("input")}
                    value={input}
                    placeholder="O que você quer que o Claude faça neste canal?"
                    onChange={e => setInput(e.currentTarget.value)}
                    onKeyDown={e => {
                        if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); run(); }
                    }}
                />

                <div className={cl("toolbar")}>
                    <label className={cl("toggle")}>
                        <Switch checked={allowSend} onChange={(v: boolean) => (settings.store.allowSend = v)} /> Enviar
                    </label>
                    <label className={cl("toggle")}>
                        <Switch checked={allowEdit} onChange={(v: boolean) => (settings.store.allowEdit = v)} /> Editar
                    </label>
                    <label className={cl("toggle")}>
                        <Switch checked={allowDelete} onChange={(v: boolean) => (settings.store.allowDelete = v)} /> Apagar
                    </label>
                </div>

                <Button color={Button.Colors.BRAND} disabled={busy || !input.trim()} onClick={run}>
                    {busy ? "Pensando…" : "Enviar (Enter)"}
                </Button>
            </div>
        </Modal>
    );
}

function openAgentModal(channelId: string) {
    openModal(props => <AgentModal modalProps={props} channelId={channelId} />);
}

const ClaudeIcon: IconComponent = ({ height = 24, width = 24, className }) => (
    <svg viewBox="0 0 24 24" height={height} width={width} className={className} fill="currentColor" aria-hidden>
        <path d="M12 2l1.9 5.1L19 9l-5.1 1.9L12 16l-1.9-5.1L5 9l5.1-1.9L12 2z" />
        <path d="M18 14l.95 2.55L21.5 17.5l-2.55.95L18 21l-.95-2.55L14.5 17.5l2.55-.95L18 14z" />
    </svg>
);

const ChatBarRender: ChatBarButtonFactory = ({ channel, isMainChat }) => {
    if (!isMainChat) return null;
    return (
        <ChatBarButton
            tooltip="Claude no chat (ler / enviar / editar / apagar)"
            onClick={() => openAgentModal(channel.id)}
        >
            <ClaudeIcon className={cl("icon")} />
        </ChatBarButton>
    );
};

export default definePlugin({
    name: "ClaudeCode",
    description: "Botão na barra de chat que abre um agente do Claude Code capaz de ler, enviar, editar e apagar mensagens no canal atual. Usa o Claude Code CLI instalado e logado na sua máquina (sua assinatura, sem API key). Automatizar a conta viola o ToS do Discord — use por sua conta e risco.",
    authors: [PixelCordDevs.myvings],
    tags: ["Chat", "Utility"],
    settings,

    chatBarButton: {
        icon: ClaudeIcon,
        render: ChatBarRender
    }
});
