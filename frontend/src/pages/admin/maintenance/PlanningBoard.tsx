import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { UserPlus, Clock, PlayCircle, CheckCircle2, Search } from "lucide-react";
import { listMaintenanceWorkOrders } from "../../../api/maintenanceWorkOrders";
import { ClientFilterSelect } from "../../../components/ClientFilterSelect";
import type { MaintenanceWorkOrder } from "../../../api/types";
import { PageHeader } from "../../../components/PageHeader";
import { StatusBadge } from "../../../components/StatusBadge";
import { EmptyState } from "../../../components/EmptyState";
import { FullPageSpinner } from "../../../components/Spinner";
import { formatDate } from "../../../lib/format";
import { TIPOS_DE_OS } from "../../../lib/maintenanceLabels";
import { useCmms } from "../../../lib/cmms";
import { useToast } from "../../../components/Toast";
import { MoverOrdemModal } from "./MoverOrdemModal";

/**
 * Painel de planejamento: onde cada ordem esta na fila, em quatro faixas.
 *
 * A programacao responde "quem faz o que, em que dia". O Kanban responde "em que status
 * cada uma esta", com dez colunas. Faltava a pergunta que o planejador faz primeiro, de
 * manha: o que ainda nao tem dono, o que esta com dono mas parado, o que ja pode ser
 * executado e o que saiu. Quatro faixas, nessa ordem, porque e' a ordem em que o trabalho
 * anda - e a primeira e' a que exige acao dele.
 */
const FAIXAS = [
  {
    id: "sem-dono",
    titulo: "Sem responsavel",
    explicacao: "Ninguem assumiu e ninguem foi atribuido - e' por aqui que o dia comeca.",
    icone: UserPlus,
    tom: "border-safety-yellow/50 bg-safety-yellow/5",
  },
  {
    id: "pendente",
    titulo: "Pendente",
    explicacao: "Tem responsavel, mas ainda nao pode ser executada (aguardando material, parada, liberacao...).",
    icone: Clock,
    tom: "border-gray-200",
  },
  {
    id: "liberada",
    titulo: "Liberada",
    explicacao: "Pode ser executada agora - ou ja esta em execucao.",
    icone: PlayCircle,
    tom: "border-navy-200 bg-navy-50/40",
  },
  {
    id: "concluida",
    titulo: "Concluida",
    explicacao: "Encerrada. Fica aqui como o que saiu da fila no periodo.",
    icone: CheckCircle2,
    tom: "border-green-200 bg-green-50/40",
  },
] as const;

type FaixaId = (typeof FAIXAS)[number]["id"];

/** Em qual faixa a ordem cai. A regra e' de fila, nao de status: "sem responsavel" vence
 * o status, porque uma OS sem dono nao anda por mais bem classificada que esteja. */
function faixaDaOrdem(os: MaintenanceWorkOrder): FaixaId | null {
  if (os.status === "COMPLETED") return "concluida";
  if (os.status === "CANCELED") return null; // cancelada saiu da fila e nao volta
  if (!os.assignedResourceId) return "sem-dono";
  if (os.status === "RELEASED" || os.status === "IN_PROGRESS") return "liberada";
  return "pendente";
}

function Cartao({
  os,
  onAbrir,
  onArrastar,
}: {
  os: MaintenanceWorkOrder;
  onAbrir: () => void;
  onArrastar: () => void;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      draggable
      onDragStart={onArrastar}
      onClick={onAbrir}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onAbrir();
        }
      }}
      className="block cursor-pointer rounded-lg border border-gray-200 bg-white p-3 hover:border-navy-300 hover:shadow-sm active:cursor-grabbing"
    >
      <div className="flex items-start justify-between gap-2">
        <span className="font-medium text-navy-900">{os.number}</span>
        <StatusBadge status={os.priority} />
      </div>
      <p className="mt-0.5 line-clamp-2 text-sm text-graphite-700">{os.title || os.description}</p>
      <p className="mt-1 text-xs text-graphite-400">
        {os.instrument?.tag ?? os.instrument?.description ?? "sem ativo"} - {TIPOS_DE_OS[os.type] ?? os.type}
      </p>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs">
        <span className={os.assignedResource ? "text-graphite-600" : "font-medium text-safety-yellow-dark"}>
          {os.assignedResource?.name ?? "sem responsavel"}
        </span>
        <span className="text-graphite-400">
          {os.scheduledDate ? formatDate(os.scheduledDate) : os.completedAt ? formatDate(os.completedAt) : "sem data"}
        </span>
      </div>
    </div>
  );
}

export default function PlanningBoard() {
  const { isClient, ownClientId, base } = useCmms();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { notify } = useToast();
  const [clientId, setClientId] = useState(ownClientId ?? "");
  const [busca, setBusca] = useState("");
  // Arrastar so muda o cartao de lugar depois que a pendencia da coluna de destino for
  // preenchida - por isso o drop abre um passo, e nao move direto.
  const [arrastando, setArrastando] = useState<MaintenanceWorkOrder | null>(null);
  const [sobre, setSobre] = useState<FaixaId | null>(null);
  const [movendo, setMovendo] = useState<{ ordem: MaintenanceWorkOrder; destino: FaixaId } | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["planejamento", clientId],
    // pageSize alto de proposito: o painel so faz sentido com a fila inteira a vista -
    // paginar um quadro de planejamento esconderia justamente o que falta fazer.
    queryFn: () => listMaintenanceWorkOrders({ clientId: clientId || undefined, pageSize: 300 }),
    enabled: isClient || !!clientId,
  });

  const termo = busca.trim().toLowerCase();
  const ordens = (data?.items ?? []).filter(
    (os) =>
      !termo ||
      [os.number, os.title, os.description, os.instrument?.tag, os.assignedResource?.name]
        .some((campo) => campo?.toLowerCase().includes(termo)),
  );

  function soltar(destino: FaixaId) {
    const ordem = arrastando;
    setArrastando(null);
    setSobre(null);
    if (!ordem) return;
    if (faixaDaOrdem(ordem) === destino) return; // soltou na mesma coluna: nada a fazer

    // OS concluida nao volta arrastando: reabrir e' decisao com motivo, feita na propria
    // OS - aqui seria um arrasto acidental desfazendo um encerramento.
    if (ordem.status === "COMPLETED") {
      notify("error", "Esta OS ja foi concluida. Para reabrir, entre na OS e mude a situacao.");
      return;
    }
    setMovendo({ ordem, destino });
  }

  const porFaixa = new Map<FaixaId, MaintenanceWorkOrder[]>();
  for (const os of ordens) {
    const faixa = faixaDaOrdem(os);
    if (!faixa) continue;
    porFaixa.set(faixa, [...(porFaixa.get(faixa) ?? []), os]);
  }

  return (
    <div>
      <PageHeader
        title="Planejamento"
        description="Onde cada ordem esta na fila - o que falta ter dono, o que esta parado, o que pode ser executado e o que saiu"
        breadcrumbs={[{ label: "RLP Maintenance CMMS", to: base }, { label: "Planejamento" }]}
      />

      <div className="mb-6 flex flex-col gap-3 sm:flex-row">
        {!isClient && (
          <ClientFilterSelect
            className="sm:w-72"
            value={clientId}
            onChange={setClientId}
            service="CMMS_MAINTENANCE"
            allLabel="Selecione o cliente"
          />
        )}
        {(isClient || clientId) && (
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-graphite-400" />
            <input
              className="input pl-9"
              placeholder="Buscar por numero, ativo, servico ou responsavel..."
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
            />
          </div>
        )}
      </div>

      {(isClient || clientId) && (
        <p className="mb-3 text-xs text-graphite-500">
          Arraste um cartao para a proxima coluna - o sistema abre o que falta para a OS caber la.
        </p>
      )}

      {!isClient && !clientId ? (
        <EmptyState title="Selecione um cliente" description="O planejamento e' da fila de cada empresa." />
      ) : isLoading ? (
        <FullPageSpinner />
      ) : (
        // Quatro colunas lado a lado: a fila inteira cabe numa olhada, e a altura de cada
        // coluna ja diz onde o trabalho esta empilhado. Em tela estreita elas empilham,
        // porque quatro colunas de 200px nao seriam colunas, seriam tiras.
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {FAIXAS.map((faixa) => {
            const lista = porFaixa.get(faixa.id) ?? [];
            const Icone = faixa.icone;
            return (
              <section
                key={faixa.id}
                onDragOver={(e) => {
                  // Sem preventDefault o navegador nao aceita o drop - e o cartao "volta".
                  e.preventDefault();
                  if (sobre !== faixa.id) setSobre(faixa.id);
                }}
                onDragLeave={() => setSobre((atual) => (atual === faixa.id ? null : atual))}
                onDrop={() => soltar(faixa.id)}
                className={`flex flex-col rounded-xl border p-3 transition-colors ${faixa.tom} ${
                  sobre === faixa.id ? "border-navy-500 ring-2 ring-navy-200" : ""
                }`}
              >
                <h2 className="flex items-center gap-2 font-semibold text-navy-900">
                  <Icone className="h-4 w-4 shrink-0 text-navy-600" />
                  <span className="min-w-0 truncate">{faixa.titulo}</span>
                  <span className="ml-auto shrink-0 rounded-full bg-white px-2 py-0.5 text-xs font-medium text-graphite-600">
                    {lista.length}
                  </span>
                </h2>
                <p className="mt-1 text-xs text-graphite-500">{faixa.explicacao}</p>

                {lista.length === 0 ? (
                  <p className="mt-3 text-sm text-graphite-400">Nenhuma ordem aqui.</p>
                ) : (
                  // A coluna rola sozinha: uma fila de 80 ordens nao pode empurrar as
                  // outras tres para fora da tela.
                  <div className="mt-3 flex max-h-[calc(100vh-20rem)] flex-col gap-3 overflow-y-auto pr-0.5">
                    {lista.map((os) => (
                      <Cartao
                        key={os.id}
                        os={os}
                        onAbrir={() => navigate(`${base}/ordens/${os.id}`)}
                        onArrastar={() => setArrastando(os)}
                      />
                    ))}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}

      {movendo && (
        <MoverOrdemModal
          ordem={movendo.ordem}
          destino={movendo.destino}
          base={base}
          onClose={() => setMovendo(null)}
          onMovida={() => queryClient.invalidateQueries({ queryKey: ["planejamento"] })}
        />
      )}
    </div>
  );
}
