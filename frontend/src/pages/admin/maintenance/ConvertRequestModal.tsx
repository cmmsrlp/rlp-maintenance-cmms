import { useEffect, useState } from "react";
import { Modal } from "../../../components/Modal";
import { TextInput, SelectInput, CheckboxInput } from "../../../components/form/Field";
import { OPCOES_DE_TIPO } from "../../../lib/maintenanceLabels";
import { useToast } from "../../../components/Toast";
import type { ConversaoDaSolicitacao, ServiceRequest } from "../../../api/types";

interface Props {
  open: boolean;
  request: ServiceRequest;
  salvando: boolean;
  onClose: () => void;
  onConfirm: (dados: ConversaoDaSolicitacao) => void;
}

/**
 * O passo do planejador entre a solicitacao e a OS.
 *
 * Quem escreve a solicitacao e' o operador, e ele descreve o SINTOMA ("maquina fazendo
 * barulho"). A OS precisa dizer o SERVICO a executar, quem decide isso e' quem planeja, e
 * antes essa passagem era um clique: a OS nascia corretiva com o texto do operador dentro.
 *
 * Aqui o planejador reescreve a descricao, diz o tipo de servico, se precisa comprar algo
 * e - o que mais muda o planejamento - em que condicao o servico sera feito: com a maquina
 * rodando, na proxima parada de oportunidade ou so na parada programada.
 */
export function ConvertRequestModal({ open, request, salvando, onClose, onConfirm }: Props) {
  const { notify } = useToast();
  const [dados, setDados] = useState<ConversaoDaSolicitacao>({});
  const [tipo, setTipo] = useState("CORRECTIVE_BREAKDOWN");

  useEffect(() => {
    if (!open) return;
    // A descricao do operador entra como ponto de partida - reescrever e' mais rapido do
    // que redigitar, e o que ele relatou nao pode se perder no caminho.
    setDados({
      title: request.instrument?.description ? `Atender ${request.instrument.description}` : "",
      description: request.description,
      priority: request.suggestedPriority,
      needsPurchase: false,
      purchaseNotes: "",
      executionCondition: "MACHINE_RUNNING",
    });
    setTipo("CORRECTIVE_BREAKDOWN");
  }, [open, request]);

  const opcao = OPCOES_DE_TIPO.find((o) => o.valor === tipo);

  // O botao so ficava desabilitado, sem dizer o motivo - quem testava via nao acontecer
  // nada e nao sabia se era trava de validacao ou falha silenciosa (achado em auditoria).
  // Em vez de so desabilitar, o clique sempre reage: com o formulario incompleto, avisa
  // exatamente o que falta em vez de nao fazer nada.
  function handleConfirmClick() {
    if (!request.instrumentId) {
      notify("error", "Esta solicitação não tem um ativo selecionado - defina o ativo antes de gerar a OS.");
      return;
    }
    const faltando: string[] = [];
    if ((dados.title ?? "").trim().length < 3) faltando.push("Título da OS (mínimo 3 caracteres)");
    if ((dados.description ?? "").trim().length < 5) faltando.push("Descrição do serviço (mínimo 5 caracteres)");
    if (faltando.length > 0) {
      notify("error", `Falta preencher: ${faltando.join(", ")}.`);
      return;
    }
    onConfirm({ ...dados, type: opcao?.type, correctiveType: opcao?.correctiveType ?? null });
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Gerar OS a partir desta solicitação"
      size="lg"
      footer={
        <>
          <button type="button" className="btn-outline" onClick={onClose} disabled={salvando}>Cancelar</button>
          <button type="button" className="btn-primary" disabled={salvando} onClick={handleConfirmClick}>
            {salvando ? "Gerando..." : "Gerar OS"}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-graphite-400">
            Relato de quem abriu ({request.number})
          </p>
          <p className="mt-1 whitespace-pre-wrap text-sm text-graphite-700">{request.description}</p>
          {request.instrument && (
            <p className="mt-2 text-xs text-graphite-500">
              Ativo: {request.instrument.tag ?? request.instrument.description}
              {request.area ? ` - ${request.area.name}` : ""}
            </p>
          )}
        </div>

        <TextInput
          label="Título da OS"
          required
          placeholder="Ex.: Trocar rolamento do mancal LA"
          hint="O que será feito, em uma linha - é o que aparece na programação."
          value={dados.title ?? ""}
          onChange={(e) => setDados({ ...dados, title: e.target.value })}
        />

        <div>
          <label className="mb-1 block text-sm font-medium text-graphite-700">
            Descrição do serviço <span className="text-safety-red">*</span>
          </label>
          <textarea
            className="input"
            rows={4}
            placeholder="O que a equipe deve executar, escrito por quem planeja."
            value={dados.description ?? ""}
            onChange={(e) => setDados({ ...dados, description: e.target.value })}
          />
          <p className="mt-1 text-xs text-graphite-500">
            Começa com o texto do relato. Reescreva no vocabulário da manutenção - o relato original fica guardado
            na solicitação.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <SelectInput
            label="Tipo de serviço"
            options={OPCOES_DE_TIPO.map((o) => ({ value: o.valor, label: o.rotulo }))}
            value={tipo}
            onChange={(e) => setTipo(e.target.value)}
          />
          <SelectInput
            label="Prioridade"
            options={[
              { value: "LOW", label: "Baixa" },
              { value: "MEDIUM", label: "Média" },
              { value: "HIGH", label: "Alta" },
              { value: "CRITICAL", label: "Crítica" },
            ]}
            value={dados.priority ?? "MEDIUM"}
            onChange={(e) => setDados({ ...dados, priority: e.target.value as ConversaoDaSolicitacao["priority"] })}
          />
        </div>

        <SelectInput
          label="Condição de execução"
          hint="Escolher 'parada programada' já abre a OS aguardando a parada, em vez de ela ficar na fila como se pudesse ser feita hoje."
          options={[
            { value: "MACHINE_RUNNING", label: "Com a máquina em operação" },
            { value: "OPPORTUNITY_STOP", label: "Na próxima parada de oportunidade" },
            { value: "PLANNED_SHUTDOWN", label: "Só na parada programada" },
          ]}
          value={dados.executionCondition ?? "MACHINE_RUNNING"}
          onChange={(e) =>
            setDados({ ...dados, executionCondition: e.target.value as ConversaoDaSolicitacao["executionCondition"] })
          }
        />

        <div className="rounded-lg border border-gray-200 p-4">
          <CheckboxInput
            label="Precisa comprar material para executar"
            checked={dados.needsPurchase ?? false}
            onChange={(e) => setDados({ ...dados, needsPurchase: e.target.checked })}
          />
          {dados.needsPurchase && (
            <>
              <textarea
                className="input mt-3"
                rows={2}
                placeholder="O que precisa ser comprado - peça, quantidade, fornecedor, prazo..."
                value={dados.purchaseNotes ?? ""}
                onChange={(e) => setDados({ ...dados, purchaseNotes: e.target.value })}
              />
              <p className="mt-1 text-xs text-graphite-500">
                A OS nasce em "Aguardando material": ela não entra na programação como se pudesse ser executada.
              </p>
            </>
          )}
        </div>

        <TextInput
          label="Data prevista (opcional)"
          type="date"
          hint="Deixe em branco se ainda depende da compra ou da parada."
          value={dados.scheduledDate ?? ""}
          onChange={(e) => setDados({ ...dados, scheduledDate: e.target.value })}
        />
      </div>
    </Modal>
  );
}
