import { useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Trash2, CornerLeftUp, AlertTriangle, QrCode } from "lucide-react";
import { getInstrument, listAssetParts, addAssetPart, removeAssetPart, getInstrumentPartsHistory, getInstrumentCostSummary, deleteInstrument, getImpactoDaRemocao } from "../../api/instruments";
import type { ImpactoDaRemocao } from "../../api/instruments";
import { listMeters, addMeterReading } from "../../api/meters";
import { listMaintenancePlans } from "../../api/maintenancePlans";
import { listMaintenanceWorkOrders } from "../../api/maintenanceWorkOrders";
import { PageHeader } from "../../components/PageHeader";
import { FullPageSpinner } from "../../components/Spinner";
import { StatusBadge } from "../../components/StatusBadge";
import { SparePartPicker } from "../../components/SparePartPicker";
import { Tabs } from "../../components/Tabs";
import { formatDate, formatCurrency } from "../../lib/format";
import { TIPOS_DE_OS, TECNICAS_PREDITIVAS } from "../../lib/maintenanceLabels";
import { areaComCentroDeCusto } from "../../lib/centroDeCusto";
import { EmptyState } from "../../components/EmptyState";
import { PortalInstrumentFormModal } from "./PortalInstrumentFormModal";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { AssetQrModal } from "../../components/AssetQrModal";
import { MeterFormModal } from "../admin/instruments/MeterFormModal";
import { InstrumentAttachments } from "../../components/InstrumentAttachments";
import { AssetPhoto } from "../../components/AssetPhoto";
import { AssetSetupAlerts } from "../../components/AssetSetupAlerts";
import { AssetLubricationCard } from "../../components/AssetLubricationCard";
import { AssetRotableCard } from "../../components/AssetRotableCard";
import { useAuth } from "../../auth/AuthContext";
import { useToast } from "../../components/Toast";
import { getApiErrorMessage } from "../../api/client";
import { camposDoTipo } from "../../lib/camposPorTipoDeAtivo";

const PRIORITY_LABELS: Record<string, string> = { LOW: "Baixa", MEDIUM: "Media", HIGH: "Alta", CRITICAL: "Critica" };

/**
 * O texto da confirmacao diz o TAMANHO do que esta pendurado no ativo.
 *
 * "Tem certeza?" sozinho nao ajuda a decidir: o que muda a resposta e' saber que o ativo
 * tem 3 planos e 12 ordens no historico, ou que nao tem nada.
 */
function descricaoDaRemocao(tag: string | null, impacto?: ImpactoDaRemocao): string {
  const nome = tag ? `O ativo ${tag}` : "O ativo";
  const base = `${nome} sai das listas, da arvore e da programacao. Nada e' apagado: o historico continua guardado.`;
  if (!impacto) return base;

  const ligados = [
    impacto.planos > 0 ? `${impacto.planos} plano(s)` : null,
    impacto.pontos > 0 ? `${impacto.pontos} ponto(s) de lubrificacao` : null,
    impacto.ordens > 0 ? `${impacto.ordens} ordem(ns) no historico` : null,
  ].filter(Boolean);

  return ligados.length > 0 ? `${base} Estao ligados a ele: ${ligados.join(", ")}.` : base;
}

export default function PortalInstrumentDetail() {
  const { id = "" } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { user } = useAuth();
  const hasCmms = !!user?.client?.contractedServices?.includes("CMMS_MAINTENANCE");
  const { notify } = useToast();
  const [tab, setTab] = useState("overview");
  const [editOpen, setEditOpen] = useState(false);
  const [addChildOpen, setAddChildOpen] = useState(false);
  const [meterModalOpen, setMeterModalOpen] = useState(false);
  const [selectedSparePartId, setSelectedSparePartId] = useState("");
  const [qrOpen, setQrOpen] = useState(false);
  const [confirmarRemocao, setConfirmarRemocao] = useState(false);
  const [removendo, setRemovendo] = useState(false);
  const { data: instrument, isLoading } = useQuery({ queryKey: ["portal-instrument", id], queryFn: () => getInstrument(id) });
  // O que esta pendurado no ativo. Buscado so ao abrir a confirmacao: a ficha nao
  // precisa desses numeros para nada alem de avisar antes de remover.
  const { data: impacto } = useQuery({
    queryKey: ["impacto-remocao", id],
    queryFn: () => getImpactoDaRemocao(id),
    enabled: confirmarRemocao && !!id,
  });
  const { data: meters } = useQuery({
    queryKey: ["portal-instrument-meters", id],
    queryFn: () => listMeters({ instrumentId: id }),
    enabled: !!id && hasCmms,
  });
  const { data: plans } = useQuery({
    queryKey: ["portal-instrument-maintenance-plans", id],
    queryFn: () => listMaintenancePlans({ instrumentId: id, pageSize: 10 }),
    enabled: !!id && hasCmms,
  });
  // "Todas as ordens relacionadas ao ativo": as dele e as dos componentes abaixo. Numa
  // linha, o servico acontece nas maquinas do galho - listar so as proprias diria
  // "nenhuma ordem" numa linha com dezenas delas.
  const [incluirComponentes, setIncluirComponentes] = useState(true);
  const { data: workOrders } = useQuery({
    queryKey: ["portal-instrument-work-orders", id, incluirComponentes],
    queryFn: () => listMaintenanceWorkOrders({ instrumentId: id, incluirComponentes, pageSize: 100 }),
    enabled: !!id && hasCmms,
  });

  const { data: assetParts } = useQuery({
    queryKey: ["portal-instrument-asset-parts", id],
    queryFn: () => listAssetParts(id),
    enabled: !!id && hasCmms,
  });
  const { data: partsHistory } = useQuery({
    queryKey: ["portal-instrument-parts-history", id],
    queryFn: () => getInstrumentPartsHistory(id),
    enabled: !!id && hasCmms,
  });
  const { data: costSummary } = useQuery({
    queryKey: ["portal-instrument-cost-summary", id],
    queryFn: () => getInstrumentCostSummary(id),
    enabled: !!id && hasCmms,
  });

  async function handleAddReading(meterId: string) {
    const value = window.prompt("Nova leitura do medidor:");
    if (!value || Number.isNaN(Number(value))) return;
    try {
      const reading = await addMeterReading(meterId, Number(value));
      if (reading.triggeredWorkOrder) {
        notify("error", `Leitura fora da faixa! OS ${reading.triggeredWorkOrder.number} (preditiva) aberta automaticamente.`);
      } else {
        notify("success", "Leitura registrada.");
      }
      queryClient.invalidateQueries({ queryKey: ["portal-instrument-meters", id] });
      queryClient.invalidateQueries({ queryKey: ["portal-instrument-maintenance-work-orders", id] });
    } catch (error) {
      notify("error", getApiErrorMessage(error));
    }
  }

  async function handleAddAssetPart() {
    if (!selectedSparePartId) return;
    try {
      await addAssetPart(id, selectedSparePartId);
      setSelectedSparePartId("");
      queryClient.invalidateQueries({ queryKey: ["portal-instrument-asset-parts", id] });
    } catch (error) {
      notify("error", getApiErrorMessage(error));
    }
  }

  async function removerAtivo() {
    setRemovendo(true);
    try {
      await deleteInstrument(id);
      notify("success", "Ativo removido.");
      queryClient.invalidateQueries({ queryKey: ["portal-instruments"] });
      navigate("/portal/ativos");
    } catch (error) {
      notify("error", getApiErrorMessage(error));
    } finally {
      setRemovendo(false);
      setConfirmarRemocao(false);
    }
  }

  async function handleRemoveAssetPart(linkId: string) {
    try {
      await removeAssetPart(id, linkId);
      queryClient.invalidateQueries({ queryKey: ["portal-instrument-asset-parts", id] });
    } catch (error) {
      notify("error", getApiErrorMessage(error));
    }
  }

  if (isLoading || !instrument) return <FullPageSpinner />;

  const tabs = [
    { id: "overview", label: "Visao geral" },
    { id: "structure", label: "Estrutura" },
    ...(hasCmms ? [{ id: "maintenance", label: "Manutencao" }, { id: "costs", label: "Custos" }] : []),
    { id: "documents", label: "Documentos" },
  ];

  return (
    <div>
      <PageHeader
        title={`TAG ${instrument.tag ?? "sem TAG"}`}
        description={instrument.description || instrument.type}
        breadcrumbs={[{ label: "Meus ativos", to: "/portal/ativos" }, { label: instrument.tag ?? instrument.type }]}
        actions={
          <>
            <button className="btn-outline" onClick={() => setQrOpen(true)}>
              <QrCode className="h-4 w-4" /> QR Code
            </button>
            <button className="btn-outline" onClick={() => setEditOpen(true)}>
              <Pencil className="h-4 w-4" /> Editar
            </button>
            <button className="btn-danger" onClick={() => setConfirmarRemocao(true)}>
              <Trash2 className="h-4 w-4" /> Remover
            </button>
          </>
        }
      />

      <AssetQrModal
        open={qrOpen}
        onClose={() => setQrOpen(false)}
        tag={instrument.tag}
        description={instrument.description}
        path={`/portal/ativos/${instrument.id}`}
      />

      {instrument.parent && (
        <Link
          to={`/portal/ativos/${instrument.parent.id}`}
          className="mb-2 inline-flex items-center gap-1.5 text-sm text-navy-700 hover:underline"
        >
          <CornerLeftUp className="h-4 w-4" /> Componente de: TAG {instrument.parent.tag ?? instrument.parent.type}
        </Link>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <AssetPhoto
          instrumentId={instrument.id}
          tag={instrument.tag}
          photoUrl={instrument.photoUrl}
          podeEditar
          aoMudar={() => queryClient.invalidateQueries({ queryKey: ["portal-instrument", id] })}
        />
        <StatusBadge status={instrument.derivedStatus ?? instrument.status} />
        <StatusBadge status={instrument.criticality} label={`Criticidade: ${PRIORITY_LABELS[instrument.criticality]}`} />
        <StatusBadge status={instrument.operationalStatus} />
      </div>

      <ConfirmDialog
        open={confirmarRemocao}
        title="Remover este ativo"
        description={descricaoDaRemocao(instrument.tag, impacto)}
        confirmLabel="Remover"
        danger
        loading={removendo}
        onConfirm={() => void removerAtivo()}
        onCancel={() => setConfirmarRemocao(false)}
      />

      <AssetSetupAlerts instrument={instrument} base="/portal/manutencao" />

      <Tabs tabs={tabs} active={tab} onChange={setTab} />

      {tab === "overview" && (
        <div className="card p-5">
          <dl className="grid gap-4 sm:grid-cols-3">
            <Info label="Fabricante" value={instrument.manufacturer ?? "-"} />
            <Info label="Numero de serie" value={instrument.serialNumber ?? "-"} />
            <Info label="Faixa de medicao" value={instrument.measurementRange ?? "-"} />
            <Info label="Local de instalacao" value={instrument.installationLocation ?? "-"} />
            <Info label="Planta" value={instrument.plant?.name ?? "-"} />
            {/* Um campo so: o centro de custo vem da area e nao se escolhe separado.
                "Sistema" saiu - era um nivel da propria arvore repetido aqui. */}
            <Info
              label={instrument.parentId ? "Area / Centro de custo (herdado do pai)" : "Area / Centro de custo"}
              value={areaComCentroDeCusto(instrument.area, instrument.costCenter)}
            />
            <Info label="Periodicidade" value={instrument.calibrationFrequencyMonths ? `${instrument.calibrationFrequencyMonths} meses` : "Nao rastreada"} />
            <Info label="Ultima calibracao" value={formatDate(instrument.lastCalibrationDate)} />
            <Info label="Proxima calibracao" value={formatDate(instrument.nextDueDate)} />
          </dl>

          {camposDoTipo(instrument.type).length > 0 && (
            <div className="mt-6 border-t border-gray-100 pt-5">
              <h3 className="mb-3 text-sm font-semibold text-navy-900">Ficha tecnica de {instrument.type}</h3>
              <dl className="grid gap-4 sm:grid-cols-3">
                {camposDoTipo(instrument.type).map((campo) => (
                  <Info key={campo.chave} label={campo.rotulo} value={instrument.specificAttributes?.[campo.chave] || "-"} />
                ))}
              </dl>
            </div>
          )}
        </div>
      )}

      {tab === "structure" && (
        <div className="space-y-6">
          <div className="card p-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-semibold text-navy-900">Ativos filhos</h2>
              <button className="btn-ghost btn-sm" onClick={() => setAddChildOpen(true)}>
                <Plus className="h-4 w-4" /> Adicionar filho
              </button>
            </div>
            {!instrument.children || instrument.children.length === 0 ? (
              <EmptyState title="Nenhum componente" description="Ex.: motor, valvula, painel - componentes deste ativo com ficha propria." />
            ) : (
              <ul className="divide-y divide-gray-100">
                {instrument.children.map((c) => (
                  <li key={c.id}>
                    <Link to={`/portal/ativos/${c.id}`} className="flex items-center justify-between py-2.5 text-sm hover:text-navy-700">
                      <span className="font-medium text-graphite-800">TAG {c.tag ?? c.type}</span>
                      <span className="text-xs text-graphite-400">{c.type}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {hasCmms && (
            <div className="card p-5">
              <h2 className="mb-3 font-semibold text-navy-900">Pecas compativeis (BOM)</h2>
              <div className="mb-3 flex gap-2">
                <SparePartPicker
                  className="flex-1"
                  name="selectedSparePartId"
                  value={selectedSparePartId}
                  onChange={(e) => setSelectedSparePartId(e.target.value)}
                />
                <button type="button" className="btn-outline" onClick={handleAddAssetPart} disabled={!selectedSparePartId}>
                  <Plus className="h-4 w-4" />
                </button>
              </div>
              {!assetParts || assetParts.length === 0 ? (
                <EmptyState title="Nenhuma peca vinculada" description="Vincule as pecas do seu almoxarifado usadas neste ativo." />
              ) : (
                <ul className="divide-y divide-gray-100">
                  {assetParts.map((link) => (
                    <li key={link.id} className="flex items-center justify-between py-2.5 text-sm">
                      <span className="text-graphite-800">{link.sparePart?.name}</span>
                      <button onClick={() => handleRemoveAssetPart(link.id)} className="text-graphite-400 hover:text-safety-red" aria-label="Remover vinculo">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}

      {tab === "maintenance" && hasCmms && (
        <div className="space-y-6">
          <AssetRotableCard instrumentId={instrument.id} clientId={instrument.clientId} base="/portal/manutencao" />
          <AssetLubricationCard instrumentId={instrument.id} clientId={instrument.clientId} raiz="/portal" />
          <div className="card p-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-semibold text-navy-900">Medidores</h2>
              <button className="btn-ghost btn-sm" onClick={() => setMeterModalOpen(true)}>
                <Plus className="h-4 w-4" /> Novo
              </button>
            </div>
            {!meters || meters.length === 0 ? (
              <EmptyState title="Nenhum medidor" description="Cadastre um horimetro ou odometro para manutencao por uso ou condicao (preditiva)." />
            ) : (
              <ul className="divide-y divide-gray-100">
                {meters.map((m) => {
                  const outOfRange = (m.minThreshold != null && m.currentValue < m.minThreshold) || (m.maxThreshold != null && m.currentValue > m.maxThreshold);
                  return (
                    <li key={m.id} className="flex items-center justify-between py-2.5 text-sm">
                      <div>
                        <p className="flex items-center gap-1.5 font-medium text-graphite-800">
                          {m.name}
                          <span className="rounded-full bg-navy-50 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-navy-700">
                            {TECNICAS_PREDITIVAS[m.technique]}
                          </span>
                          {outOfRange && <AlertTriangle className="h-3.5 w-3.5 text-safety-red" aria-label="Fora da faixa normal" />}
                        </p>
                        <p className={`text-xs ${outOfRange ? "font-medium text-safety-red" : "text-graphite-400"}`}>
                          {m.currentValue} {m.unit}
                          {(m.minThreshold != null || m.maxThreshold != null) && (
                            <> · faixa normal: {m.minThreshold ?? "-"} a {m.maxThreshold ?? "-"} {m.unit}</>
                          )}
                        </p>
                      </div>
                      <button className="btn-ghost btn-sm" onClick={() => handleAddReading(m.id)}>Registrar leitura</button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="card p-5">
            <h2 className="mb-3 font-semibold text-navy-900">Planos preventivos</h2>
            {!plans || plans.items.length === 0 ? (
              <EmptyState title="Nenhum plano" description="Este ativo ainda nao tem plano de manutencao." />
            ) : (
              <ul className="divide-y divide-gray-100">
                {plans.items.map((p) => (
                  <li key={p.id} className="flex items-center justify-between py-2.5 text-sm">
                    <span className="font-medium text-graphite-800">{p.name}</span>
                    <StatusBadge status={p.active ? (p.derivedStatus ?? "VALID") : "INACTIVE"} />
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="card p-5">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <h2 className="font-semibold text-navy-900">
                Ordens de manutencao
                {workOrders && <span className="ml-2 text-sm font-normal text-graphite-500">({workOrders.total})</span>}
              </h2>
              {/* Numa linha, o servico acontece nas maquinas abaixo dela: o historico util
                  e' o do galho, nao so o da propria linha. Da para restringir. */}
              <label className="flex cursor-pointer items-center gap-2 text-sm text-graphite-600">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-gray-300"
                  checked={incluirComponentes}
                  onChange={(e) => setIncluirComponentes(e.target.checked)}
                />
                Incluir os componentes abaixo
              </label>
            </div>

            {!workOrders || workOrders.items.length === 0 ? (
              <EmptyState
                title="Nenhuma ordem"
                description={
                  incluirComponentes
                    ? "Nem este ativo nem os componentes abaixo dele tem ordem de manutencao."
                    : "Este ativo nao tem ordem propria - marque acima para incluir os componentes."
                }
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b border-gray-200 bg-gray-50 text-left text-xs uppercase tracking-wide text-graphite-500">
                    <tr>
                      <th className="px-3 py-2">Ordem</th>
                      <th className="px-3 py-2">Tipo</th>
                      <th className="px-3 py-2">Ativo</th>
                      <th className="px-3 py-2">Abertura</th>
                      <th className="px-3 py-2">Conclusao</th>
                      <th className="px-3 py-2">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {workOrders.items.map((w) => (
                      <tr key={w.id} className="hover:bg-gray-50">
                        <td className="px-3 py-2">
                          <Link to={`/portal/manutencao/ordens/${w.id}`} className="font-medium text-navy-800 hover:underline">
                            {w.number}
                          </Link>
                          <span className="block text-xs text-graphite-400">{w.title}</span>
                        </td>
                        <td className="px-3 py-2 text-graphite-700">{TIPOS_DE_OS[w.type] ?? w.type}</td>
                        <td className="px-3 py-2 text-graphite-600">
                          {w.instrumentId === id ? (
                            <span className="text-graphite-400">este ativo</span>
                          ) : (
                            w.instrument?.tag ?? w.instrument?.description ?? "-"
                          )}
                        </td>
                        <td className="px-3 py-2 text-graphite-600">{formatDate(w.createdAt)}</td>
                        <td className="px-3 py-2 text-graphite-600">{w.completedAt ? formatDate(w.completedAt) : "-"}</td>
                        <td className="px-3 py-2"><StatusBadge status={w.status} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {tab === "costs" && hasCmms && (
        <div className="space-y-6">
          {costSummary && (costSummary.partsCost != null || costSummary.laborCost != null || costSummary.thirdPartyCost != null) ? (
            <div className="card p-5">
              <h2 className="mb-3 font-semibold text-navy-900">Gastos deste ativo</h2>
              <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <Info label="Pecas" value={costSummary.partsCost != null ? formatCurrency(costSummary.partsCost) : "Nao rastreado"} />
                <Info
                  label="Mao de obra"
                  value={costSummary.laborCost != null ? `${formatCurrency(costSummary.laborCost)} (${costSummary.totalLaborHours}h)` : `Nao rastreado (${costSummary.totalLaborHours}h)`}
                />
                <Info label="Terceiros" value={costSummary.thirdPartyCost != null ? formatCurrency(costSummary.thirdPartyCost) : "Nao rastreado"} />
                <Info label="Total" value={costSummary.totalCost != null ? formatCurrency(costSummary.totalCost) : "-"} />
              </dl>
            </div>
          ) : (
            <EmptyState title="Nenhum custo rastreado" description="Aparece aqui assim que uma OS deste ativo lancar pecas ou mao de obra." />
          )}

          <div className="card p-5">
            <h2 className="mb-1 font-semibold text-navy-900">Historico de pecas consumidas</h2>
            <p className="mb-3 text-xs text-graphite-500">O que ja foi baixado do seu almoxarifado nas OS deste ativo.</p>
            {!partsHistory || partsHistory.length === 0 ? (
              <EmptyState title="Nenhum consumo registrado" description="Aparece aqui assim que uma OS deste ativo consumir uma peca do almoxarifado." />
            ) : (
              <ul className="divide-y divide-gray-100">
                {partsHistory.map((entry) => (
                  <li key={entry.sparePart.id} className="py-2.5 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-graphite-800">{entry.sparePart.name}</span>
                      <span className="text-graphite-600">
                        {entry.totalQuantity} {entry.sparePart.unit}
                        {entry.totalCost != null && <span className="ml-1.5 text-graphite-400">({formatCurrency(entry.totalCost)})</span>}
                      </span>
                    </div>
                    <p className="text-xs text-graphite-400">
                      Usada {entry.timesUsed}x · ultima vez {formatDate(entry.lastUsedAt)}
                      {entry.lastWorkOrder && (
                        <>
                          {" "}·{" "}
                          <Link to={`/portal/manutencao/ordens/${entry.lastWorkOrder.id}`} className="hover:underline">{entry.lastWorkOrder.number}</Link>
                        </>
                      )}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {tab === "documents" && <InstrumentAttachments instrumentId={instrument.id} canEdit />}

      <MeterFormModal
        open={meterModalOpen}
        onClose={() => setMeterModalOpen(false)}
        instrumentId={instrument.id}
        onSaved={() => {
          setMeterModalOpen(false);
          queryClient.invalidateQueries({ queryKey: ["portal-instrument-meters", id] });
        }}
      />

      <PortalInstrumentFormModal
        open={addChildOpen}
        onClose={() => setAddChildOpen(false)}
        initialParentId={instrument.id}
        initialTagPrefix={instrument.tag ? `${instrument.tag}-` : undefined}
        onSaved={() => {
          setAddChildOpen(false);
          queryClient.invalidateQueries({ queryKey: ["portal-instrument", id] });
        }}
      />

      <PortalInstrumentFormModal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        instrument={instrument}
        onSaved={() => {
          setEditOpen(false);
          queryClient.invalidateQueries({ queryKey: ["portal-instrument", id] });
          queryClient.invalidateQueries({ queryKey: ["portal-instruments"] });
        }}
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
