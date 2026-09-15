import { useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Trash2, CheckCircle2, HelpCircle, XCircle, Wrench, AlertTriangle } from "lucide-react";
import {
  getServiceRequest,
  deleteServiceRequest,
  triageServiceRequest,
  convertServiceRequest,
} from "../../../api/serviceRequests";
import { PageHeader } from "../../../components/PageHeader";
import { ConvertRequestModal } from "./ConvertRequestModal";
import type { ConversaoDaSolicitacao } from "../../../api/types";
import { FullPageSpinner } from "../../../components/Spinner";
import { StatusBadge } from "../../../components/StatusBadge";
import { ConfirmDialog } from "../../../components/ConfirmDialog";
import { ServiceRequestAttachments } from "../../../components/ServiceRequestAttachments";
import { useAuth } from "../../../auth/AuthContext";
import { useToast } from "../../../components/Toast";
import { getApiErrorMessage } from "../../../api/client";
import { clientDisplayName, formatDateTime } from "../../../lib/format";
import { useCmms } from "../../../lib/cmms";

const PRIORITY_LABELS: Record<string, string> = { LOW: "Baixa", MEDIUM: "Média", HIGH: "Alta", CRITICAL: "Crítica" };

export default function ServiceRequestDetail() {
  const { id = "" } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { notify } = useToast();
  const { base } = useCmms();
  // O CMMS e' operado pelo proprio cliente (programa independente) - o backend ja
  // restringe cada um a propria empresa, entao o cliente triagem/converte a propria
  // solicitacao do mesmo jeito que ja gerencia planos, OS e checklist.
  const canTriageOrConvert = user?.role === "ADMIN" || user?.role === "CLIENT";

  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [conversaoAberta, setConversaoAberta] = useState(false);
  const [busy, setBusy] = useState(false);
  const [triageNotes, setTriageNotes] = useState("");
  const [rejectionReason, setRejectionReason] = useState("");
  const [showRejectField, setShowRejectField] = useState(false);

  const { data: request, isLoading } = useQuery({ queryKey: ["service-request", id], queryFn: () => getServiceRequest(id) });

  async function handleTriage(decision: "approve" | "request_info" | "reject") {
    if (decision === "reject" && !showRejectField) {
      setShowRejectField(true);
      return;
    }
    if (decision === "reject" && !rejectionReason.trim()) {
      notify("error", "Informe o motivo da rejeição.");
      return;
    }
    setBusy(true);
    try {
      await triageServiceRequest(id, { decision, notes: triageNotes || undefined, rejectionReason: rejectionReason || undefined });
      notify("success", decision === "approve" ? "Solicitação aprovada." : decision === "reject" ? "Solicitação rejeitada." : "Solicitado mais informação ao solicitante.");
      setTriageNotes("");
      setRejectionReason("");
      setShowRejectField(false);
      queryClient.invalidateQueries({ queryKey: ["service-request", id] });
      queryClient.invalidateQueries({ queryKey: ["service-requests"] });
    } catch (error) {
      notify("error", getApiErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function handleConvert(dados: ConversaoDaSolicitacao) {
    setBusy(true);
    try {
      const updated = await convertServiceRequest(id, dados);
      notify("success", `OS ${updated.workOrder?.number} gerada.`);
      queryClient.invalidateQueries({ queryKey: ["service-request", id] });
      queryClient.invalidateQueries({ queryKey: ["service-requests"] });
      setConversaoAberta(false);
    } catch (error) {
      notify("error", getApiErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      await deleteServiceRequest(id);
      notify("success", "Solicitação removida.");
      navigate(`${base}/solicitacoes`);
    } catch (error) {
      notify("error", getApiErrorMessage(error));
    } finally {
      setDeleting(false);
    }
  }

  if (isLoading || !request) return <FullPageSpinner />;

  const canTriage = canTriageOrConvert && ["OPEN", "IN_TRIAGE", "AWAITING_INFO"].includes(request.status);
  const canConvert = canTriageOrConvert && request.status === "PLANNED";
  const isConverted = request.status === "CONVERTED";
  const canDelete = !isConverted || user?.role === "ADMIN";

  return (
    <div>
      <PageHeader
        title={`Solicitação ${request.number}`}
        description={clientDisplayName(request.client)}
        breadcrumbs={[
          { label: "RLP Maintenance CMMS", to: base },
          { label: "Solicitações", to: `${base}/solicitacoes` },
          { label: request.number },
        ]}
        actions={
          canDelete && (
            <button className="btn-danger" onClick={() => setConfirmDelete(true)}>
              <Trash2 className="h-4 w-4" /> Remover
            </button>
          )
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <StatusBadge status={request.status} label={request.status === "REJECTED" ? "Rejeitada" : undefined} />
        <StatusBadge status={request.suggestedPriority} label={`Prioridade sugerida: ${PRIORITY_LABELS[request.suggestedPriority]}`} />
        {(request.safetyImpact || request.qualityImpact || request.productionImpact) && (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-safety-yellow-dark">
            <AlertTriangle className="h-3.5 w-3.5" />
            Impacto:{" "}
            {[request.safetyImpact && "segurança", request.qualityImpact && "qualidade", request.productionImpact && "produção"]
              .filter(Boolean)
              .join(", ")}
          </span>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <div className="card space-y-4 p-5">
            <dl className="grid gap-4 sm:grid-cols-2">
              <Info label="Área" value={request.area?.name ?? "-"} />
              <Info label="Ativo" value={request.instrument ? `TAG ${request.instrument.tag ?? request.instrument.type}` : "-"} />
              <Info label="Local" value={request.location ?? "-"} />
              <Info label="Categoria" value={request.category?.name ?? "-"} />
              <Info label="Solicitante" value={request.requestedBy?.name ?? "-"} />
              <Info label="Aberta em" value={formatDateTime(request.createdAt)} />
            </dl>
            <div>
              <p className="text-xs uppercase tracking-wide text-graphite-400">Descrição do problema</p>
              <p className="mt-1 whitespace-pre-wrap text-sm text-graphite-800">{request.description}</p>
            </div>
          </div>

          {(request.triageBy || request.triageNotes || request.rejectionReason) && (
            <div className="card space-y-2 p-5">
              <h2 className="font-semibold text-navy-900">Triagem</h2>
              {request.triageBy && <p className="text-sm text-graphite-600">Responsável: {request.triageBy.name}</p>}
              {request.triageNotes && <p className="text-sm text-graphite-600">Parecer: {request.triageNotes}</p>}
              {request.rejectionReason && <p className="text-sm text-safety-red">Motivo da rejeição: {request.rejectionReason}</p>}
            </div>
          )}

          <ServiceRequestAttachments requestId={request.id} canEdit />
        </div>

        <div className="space-y-6">
          {request.workOrder && (
            <div className="card p-5">
              <h2 className="mb-2 font-semibold text-navy-900">OS gerada</h2>
              <Link to={`${base}/ordens/${request.workOrder.id}`} className="flex items-center justify-between text-sm text-navy-700 hover:underline">
                <span className="font-medium">{request.workOrder.number}</span>
                <StatusBadge status={request.workOrder.status} />
              </Link>
            </div>
          )}

          {canConvert && (
            <div className="card p-5">
              <h2 className="mb-3 font-semibold text-navy-900">Planejada</h2>
              <p className="mb-3 text-sm text-graphite-500">
                Aprovada na triagem. Ao gerar a OS você reescreve a descrição e diz como o serviço será executado -
                quem abriu a solicitação relatou o sintoma, não o serviço.
              </p>
              <button className="btn-primary w-full justify-center" onClick={() => setConversaoAberta(true)} disabled={busy}>
                <Wrench className="h-4 w-4" /> Gerar OS
              </button>
            </div>
          )}

          {canTriage && (
            <div className="card space-y-3 p-5">
              <h2 className="font-semibold text-navy-900">Triagem</h2>
              <textarea
                className="input"
                rows={2}
                placeholder="Parecer da triagem (opcional)"
                value={triageNotes}
                onChange={(e) => setTriageNotes(e.target.value)}
              />
              {showRejectField && (
                <textarea
                  className="input"
                  rows={2}
                  placeholder="Motivo da rejeição"
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                />
              )}
              <div className="flex flex-col gap-2">
                <button className="btn-primary justify-center" onClick={() => handleTriage("approve")} disabled={busy}>
                  <CheckCircle2 className="h-4 w-4" /> Aprovar
                </button>
                <button className="btn-outline justify-center" onClick={() => handleTriage("request_info")} disabled={busy}>
                  <HelpCircle className="h-4 w-4" /> Pedir informação
                </button>
                <button className="btn-danger justify-center" onClick={() => handleTriage("reject")} disabled={busy}>
                  <XCircle className="h-4 w-4" /> {showRejectField ? "Confirmar rejeição" : "Rejeitar"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        title="Remover solicitação"
        description={
          isConverted
            ? "Esta solicitação já foi convertida em OS. Removê-la apaga só o registro da solicitação (a OS gerada continua existindo normalmente, sem vínculo com ela). Tem certeza?"
            : "Tem certeza que deseja remover esta solicitação de serviço?"
        }
        confirmLabel="Remover"
        danger
        loading={deleting}
        onConfirm={handleDelete}
        onCancel={() => setConfirmDelete(false)}
      />

      <ConvertRequestModal
        open={conversaoAberta}
        request={request}
        salvando={busy}
        onClose={() => setConversaoAberta(false)}
        onConfirm={(dados) => void handleConvert(dados)}
      />
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-graphite-400">{label}</dt>
      <dd className="mt-0.5 text-sm font-medium text-graphite-800">{value}</dd>
    </div>
  );
}
