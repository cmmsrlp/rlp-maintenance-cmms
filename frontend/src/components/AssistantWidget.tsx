import { useRef, useState, useEffect } from "react";
import { Bot, X, Send, Loader2 } from "lucide-react";
import { sendAssistantMessage, type ChatMessage } from "../api/assistant";
import { getApiErrorMessage } from "../api/client";

const MENSAGEM_INICIAL: ChatMessage = {
  role: "assistant",
  content: "Oi! Sou o Assistente RLP. Posso ajudar com dúvidas sobre como usar o CMMS - ordens, planos preventivos, lubrificação, almoxarifado e mais. O que você precisa?",
};

/**
 * Assistente tecnico virtual do portal do cliente - responde duvidas de uso do sistema e
 * conceitos de manutencao via IA. Nao tem acesso aos dados da conta (numeros, ordens
 * especificas): e' orientacao, nao consulta.
 *
 * O botao fica no cabecalho, do lado do badge de plano/acessos (pedido do usuario - antes
 * era um pill flutuante solto no canto da tela, que em telas menores chegava a tampar
 * botao de outra tela). So' o painel do chat continua fixed, ancorado no canto do botao,
 * porque ele precisa flutuar por cima do conteudo quando aberto.
 */
export function AssistantWidget() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([MENSAGEM_INICIAL]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages, open]);

  async function enviar() {
    const texto = input.trim();
    if (!texto || sending) return;

    const historico = [...messages, { role: "user", content: texto } satisfies ChatMessage];
    setMessages(historico);
    setInput("");
    setError(null);
    setSending(true);
    try {
      // So manda os ultimos turnos (sem a mensagem de boas-vindas, que e' so decorativa
      // pra tela, nao faz parte da conversa de verdade com o modelo).
      const reply = await sendAssistantMessage(historico.slice(1));
      setMessages((atual) => [...atual, { role: "assistant", content: reply }]);
    } catch (err) {
      setError(getApiErrorMessage(err, "Não consegui responder agora. Tente de novo em instantes."));
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex shrink-0 items-center gap-2 rounded-full bg-navy-900 py-1.5 pl-1.5 pr-3 text-xs font-semibold text-white shadow-sm transition-transform hover:scale-105"
        aria-label={open ? "Fechar Assistente RLP" : "Abrir Assistente RLP"}
      >
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-lime text-navy-950">
          <Bot className="h-3.5 w-3.5" />
        </span>
        <span className="hidden sm:inline">Assistente RLP</span>
      </button>

      {open && (
        <div
          className="fixed right-4 top-16 z-40 flex h-[min(32rem,calc(100vh-8rem))] w-[22rem] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl"
        >
          <div className="flex items-center justify-between bg-navy-900 px-4 py-3">
            <div className="flex items-center gap-2 text-white">
              <Bot className="h-4.5 w-4.5" />
              <p className="text-sm font-semibold">Assistente RLP</p>
            </div>
            <button type="button" onClick={() => setOpen(false)} className="text-navy-300 hover:text-white" aria-label="Fechar">
              <X className="h-4.5 w-4.5" />
            </button>
          </div>

          <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                <p
                  className={`max-w-[85%] whitespace-pre-wrap rounded-xl px-3 py-2 text-sm ${
                    m.role === "user" ? "bg-navy-900 text-white" : "bg-gray-100 text-graphite-800"
                  }`}
                >
                  {m.content}
                </p>
              </div>
            ))}
            {sending && (
              <div className="flex justify-start">
                <span className="flex items-center gap-1.5 rounded-xl bg-gray-100 px-3 py-2 text-xs text-graphite-500">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Digitando...
                </span>
              </div>
            )}
            {error && <p className="text-xs text-safety-red">{error}</p>}
          </div>

          <form
            className="flex items-center gap-2 border-t border-gray-100 p-3"
            onSubmit={(e) => {
              e.preventDefault();
              void enviar();
            }}
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Digite sua dúvida..."
              className="min-w-0 flex-1 rounded-full border border-gray-200 px-3.5 py-2 text-sm outline-none focus:border-navy-400"
              disabled={sending}
            />
            <button
              type="submit"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-navy-900 text-white disabled:opacity-40"
              disabled={sending || !input.trim()}
              aria-label="Enviar"
            >
              <Send className="h-4 w-4" />
            </button>
          </form>
        </div>
      )}
    </>
  );
}
