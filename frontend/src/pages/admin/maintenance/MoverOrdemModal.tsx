import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import {
  getMaintenanceWorkOrder,
  definirResponsavel,
  liberarOrdem,
  completeMaintenanceWorkOrder,
  updateMaintenanceWorkOrder,
} from "../../../api/maintenanceWorkOrders";
import { Modal } from "../../../components/Modal";
import { TextInput } from "../../../components/form/Field";
import { LaborResourcePicker } from "../../../components/LaborResourcePicker";
import { useToast } from "../../../components/Toast";
import { getApiErrorMessage } from "../../../api/client";
import type { MaintenanceWorkOrder } from "../../../api/types";

export type FaixaId = "sem-dono" | "pendente" | "liberada" | "concluida";

const NOME_DA_FAIXA: Record<FaixaId, string> = {
  "sem-dono": "Sem responsável",
  pendente: "Pendente",
  liberada: "Liberada",
  concluida: "Concluída",
};

interface Props {
  ordem: MaintenanceWorkOrder;
  destino: FaixaId;
  base: string;
  onClose: () => void;
  onMovida: () => void;
}

/**
 * O que falta para a OS caber na coluna de destino.
 *
 * Arrastar sozinho seria mentira: uma OS nao vira "liberada" porque o cartao mudou de
 * lugar - alguem precisa dizer quem vai fazer, e o sistema precisa cobrar o que sempre
 * cobrou (checklist resolvido, registro de falha na quebra). Este passo e' onde isso
 * acontece, e por isso o cartao so muda de coluna depois que a pendencia foi preenchida.
 */
export function MoverOrdemModal({ ordem, destino, base, onClose, onMovida }: Props) {
  const { notify } = useToast();
  const [responsavelId, setResponsavelId] = useState(ordem.assignedResourceId ?? "");
  const [observacoes, setObservacoes] = useState("");
  const [leitura, setLeitura] = useState("");
  const [salvando, setSalvando] = useState(false);

  // A ficha completa: o cartao da lista nao traz checklist nem registro de falha, e sao
  // eles que dizem se a OS pode ser concluida.
  const { data: ficha } = useQuery({
    queryKey: ["maintenance-work-order", ordem.id],
    queryFn: () => getMaintenanceWorkOrder(ordem.id),
  });

  useEffect(() => setResponsavelId(ordem.assignedResourceId ?? ""), [ordem.assignedResourceId]);

  const checklistPendente = (ficha?.checklist ?? []).filter((c) => c.result === "PENDING").length;
  const ehQuebra = ficha?.type === "CORRECTIVE" && ficha?.correctiveType === "BREAKDOWN";
  const faltaNaFalha = ehQuebra
    ? [
        !ficha?.failureStartedAt ? "início da falha" : null,
        !ficha?.failureEndedAt ? "fim da falha" : null,
        !ficha?.failureCodeId ? "código de falha" : null,
      ].filter(Boolean)
    : [];

  /** Impedimentos que esta tela NAO resolve - a pessoa precisa abrir a OS. */
  const impedimentos: string[] = [];
  if (destino === "concluida") {
    if (checklistPendente > 0) impedimentos.push(`${checklistPendente} item(ns) do checklist ainda pendente(s)`);
    if (ficha?.type === "CORRECTIVE" && !ficha?.correctiveType) impedimentos.push("dizer se a corretiva foi em operação ou de quebra");
    if (faltaNaFalha.length > 0) impedimentos.push(`registro da falha (falta: ${faltaNaFalha.join(", ")})`);
  }
  if (destino === "pendente" && ordem.startedAt) {
    impedimentos.push("esta OS já foi iniciada - voltar para pendente apagaria o início da execução");
  }

  const precisaDeResponsavel = destino === "pendente" || destino === "liberada";
  const pronto =
    impedimentos.length === 0 && (!precisaDeResponsavel || !!responsavelId);

  async function confirmar() {
    setSalvando(true);
    try {
      if (destino === "sem-dono") {
        await definirResponsavel(ordem.id, null);
        notify("success", `${ordem.number} voltou para "Sem responsável".`);
      } else if (destino === "pendente") {
        if (responsavelId !== (ordem.assignedResourceId ?? "")) await definirResponsavel(ordem.id, responsavelId);
        // Sai de "liberada" quando o arrasto e' para tras: a OS volta a esperar.
        if (ordem.status === "RELEASED") await updateMaintenanceWorkOrder(ordem.id, { status: "PLANNED" });
        notify("success", `${ordem.number} está em "Pendente".`);
      } else if (destino === "liberada") {
        if (responsavelId !== (ordem.assignedResourceId ?? "")) await definirResponsavel(ordem.id, responsavelId);
        await liberarOrdem(ordem.id);
        notify("success", `${ordem.number} liberada para execução.`);
      } else {
        await completeMaintenanceWorkOrder(ordem.id, leitura ? Number(leitura) : undefined, observacoes || undefined);
        notify("success", `${ordem.number} concluída.`);
      }
      onMovida();
      onClose();
    } catch (error) {
      notify("error", getApiErrorMessage(error));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`Mover ${ordem.number} para "${NOME_DA_FAIXA[destino]}"`}
      size="sm"
      footer={
        <>
          <button type="button" className="btn-outline" onClick={onClose} disabled={salvando}>Cancelar</button>
          <button type="button" className="btn-primary" onClick={() => void confirmar()} disabled={!pronto || salvando}>
            {salvando ? "Movendo..." : "Confirmar"}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="rounded-lg bg-gray-50 p-3">
          <p className="text-sm font-medium text-navy-900">{ordem.title || ordem.description}</p>
          <p className="mt-0.5 text-xs text-graphite-500">
            {ordem.instrument?.tag ?? ordem.instrument?.description ?? "sem ativo"}
          </p>
        </div>

        {impedimentos.length > 0 ? (
          <div className="rounded-lg border border-safety-yellow/40 bg-safety-yellow/10 p-3">
            <p className="flex items-center gap-2 text-sm font-medium text-graphite-800">
              <AlertTriangle className="h-4 w-4 shrink-0 text-safety-yellow-dark" /> Falta para poder mover
            </p>
            <ul className="mt-1 list-disc space-y-0.5 pl-8 text-sm text-graphite-700">
              {impedimentos.map((i) => (
                <li key={i}>{i}</li>
              ))}
            </ul>
            <Link className="btn-outline mt-3 text-sm" to={`${base}/ordens/${ordem.id}`} onClick={onClose}>
              Abrir a OS para resolver
            </Link>
          </div>
        ) : (
          <>
            {precisaDeResponsavel && (
              <LaborResourcePicker
                label="Responsável"
                required
                placeholder="Escolha quem vai executar"
                hint={
                  destino === "liberada"
                    ? "Liberar sem dono deixaria a OS pronta e parada - alguém precisa pegar."
                    : "É o que tira a OS da fila dos sem responsável."
                }
                name="responsavelId"
                clientId={ordem.clientId}
                value={responsavelId}
                onChange={(e) => setResponsavelId(e.target.value)}
              />
            )}

            {destino === "concluida" && (
              <>
                <p className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50/50 px-3 py-2 text-sm text-safety-green-dark">
                  <CheckCircle2 className="h-4 w-4 shrink-0" /> Tudo o que a OS exige para fechar já está preenchido.
                </p>
                <div>
                  <label className="mb-1 block text-sm font-medium text-graphite-700">Observações de fechamento</label>
                  <textarea
                    className="input"
                    rows={3}
                    placeholder="O que foi feito, o que ficou pendente para uma próxima..."
                    value={observacoes}
                    onChange={(e) => setObservacoes(e.target.value)}
                  />
                </div>
                <TextInput
                  label="Leitura do medidor (opcional)"
                  type="number"
                  hint="Horímetro, contador de ciclos - alimenta os planos por medidor."
                  value={leitura}
                  onChange={(e) => setLeitura(e.target.value)}
                />
              </>
            )}

            {destino === "sem-dono" && (
              <p className="text-sm text-graphite-700">
                A OS fica sem responsável e volta para a primeira coluna. O que já foi lançado nela não se perde.
              </p>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}
