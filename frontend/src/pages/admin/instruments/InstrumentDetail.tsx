import { useState } from "react";
import { areaComCentroDeCusto } from "../../../lib/centroDeCusto";
import { useNavigate, useParams, Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Trash2, Plus, AlertTriangle, QrCode } from "lucide-react";
import { deleteInstrument, getInstrument, listAssetParts, addAssetPart, removeAssetPart, getInstrumentPartsHistory, getInstrumentCostSummary } from "../../../api/instruments";
import { listMeters, addMeterReading } from "../../../api/meters";
import { listMaintenancePlans } from "../../../api/maintenancePlans";
import { listMaintenanceWorkOrders } from "../../../api/maintenanceWorkOrders";
import { listAuditLogs } from "../../../api/audit";
import { PageHeader } from "../../../components/PageHeader";
import { FullPageSpinner } from "../../../components/Spinner";
import { StatusBadge } from "../../../components/StatusBadge";
import { SparePartPicker } from "../../../components/SparePartPicker";
import { Tabs } from "../../../components/Tabs";
import { InstrumentFormModal } from "./InstrumentFormModal";
import { MeterFormModal } from "./MeterFormModal";
import { TECNICAS_PREDITIVAS } from "../../../lib/maintenanceLabels";
import { AssetPhoto } from "../../../components/AssetPhoto";
import { AssetSetupAlerts } from "../../../components/AssetSetupAlerts";
import { AssetLubricationCard } from "../../../components/AssetLubricationCard";
import { AssetRotableCard } from "../../../components/AssetRotableCard";
import { InstrumentAttachments } from "../../../components/InstrumentAttachments";
import { ConfirmDialog } from "../../../components/ConfirmDialog";
import { AssetQrModal } from "../../../components/AssetQrModal";
import { useAuth } from "../../../auth/AuthContext";
import { useToast } from "../../../components/Toast";
import { getApiErrorMessage } from "../../../api/client";
import { clientDisplayName, formatDate, formatDateTime, formatCurrency } from "../../../lib/format";
import { EmptyState } from "../../../components/EmptyState";

const PRIORITY_LABELS: Record<string, string> = { LOW: "Baixa", MEDIUM: "Media", HIGH: "Alta", CRITICAL: "Critica" };

const TABS = [
  { id: "overview", label: "Visao geral" },
  { id: "structure", label: "Estrutura" },
  { id: "maintenance", label: "Manutencao" },
  { id: "costs", label: "Custos" },
  { id: "documents", label: "Documentos" },
  { id: "history", label: "Historico" },
];

export default function InstrumentDetail() {
  const { id = "" } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { notify } = useToast();
  const canManage = user?.role === "ADMIN" || user?.role === "TECHNICIAN";
  const isAdmin = user?.role === "ADMIN";

  const [tab, setTab] = useState("overview");
  const [editOpen, setEditOpen] = useState(false);
  const [addChildOpen, setAddChildOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [meterModalOpen, setMeterModalOpen] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);
  const [selectedSparePartId, setSelectedSparePartId] = useState("");

  const { data: instrument, isLoading, refetch } = useQuery({ queryKey: ["instrument", id], queryFn: () => getInstrument(id) });
  const { data: meters } = useQuery({
    queryKey: ["instrument-meters", id],
    queryFn: () => listMeters({ instrumentId: id }),
    enabled: !!id,
  });
  const { data: plans } = useQuery({
    queryKey: ["instrument-maintenance-plans", id],
    queryFn: () => listMaintenancePlans({ instrumentId: id, pageSize: 10 }),
    enabled: !!id,
  });
  const { data: workOrders } = useQuery({
    queryKey: ["instrument-maintenance-work-orders", id],
    queryFn: () => listMaintenanceWorkOrders({ instrumentId: id, pageSize: 10 }),
    enabled: !!id,
  });
  const { data: assetParts } = useQuery({
    queryKey: ["instrument-asset-parts", id],
    queryFn: () => listAssetParts(id),
    enabled: !!id,
  });
  const { data: partsHistory } = useQuery({
    queryKey: ["instrument-parts-history", id],
    queryFn: () => getInstrumentPartsHistory(id),
    enabled: !!id,
  });
  const { data: costSummary } = useQuery({
    queryKey: ["instrument-cost-summary", id],
    queryFn: () => getInstrumentCostSummary(id),
    enabled: !!id,
  });
  const { data: history } = useQuery({
    queryKey: ["instrument-history", id],
    queryFn: () => listAuditLogs({ entityType: "Instrument", entityId: id, pageSize: 50 }),
    enabled: !!id && isAdmin && tab === "history",
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
      queryClient.invalidateQueries({ queryKey: ["instrument-meters", id] });
      queryClient.invalidateQueries({ queryKey: ["instrument-maintenance-work-orders", id] });
    } catch (error) {
      notify("error", getApiErrorMessage(error));
    }
  }

  async function handleAddAssetPart() {
    if (!selectedSparePartId) return;
    try {
      await addAssetPart(id, selectedSparePartId);
      notify("success", "Peca vinculada ao ativo.");
      setSelectedSparePartId("");
      queryClient.invalidateQueries({ queryKey: ["instrument-asset-parts", id] });
    } catch (error) {
      notify("error", getApiErrorMessage(error));
    }
  }

  async function handleRemoveAssetPart(linkId: string) {
    try {
      await removeAssetPart(id, linkId);
      queryClient.invalidateQueries({ queryKey: ["instrument-asset-parts", id] });
    } catch (error) {
      notify("error", getApiErrorMessage(error));
    }
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      await deleteInstrument(id);
      notify("success", "Ativo removido.");
      navigate("/gestao/ativos");
    } catch (error) {
      notify("error", getApiErrorMessage(error));
    } finally {
      setDeleting(false);
    }
  }

  if (isLoading || !instrument) return <FullPageSpinner />;

  const tabs = isAdmin ? TABS : TABS.filter((t) => t.id !== "history");

  return (
    <div>
      <PageHeader
        title={`TAG ${instrument.tag ?? "sem TAG"}`}
        description={`${instrument.description || instrument.type} · Cliente: ${clientDisplayName(instrument.client)}`}
        breadcrumbs={[{ label: "Ativos", to: "/gestao/ativos" }, { label: instrument.tag ?? instrument.type }]}
        actions={
          <>
            <button className="btn-outline" onClick={() => setQrOpen(true)}>
              <QrCode className="h-4 w-4" /> QR Code
            </button>
            {canManage && (
              <>
                <button className="btn-outline" onClick={() => setEditOpen(true)}>
                  <Pencil className="h-4 w-4" /> Editar
                </button>
                <button className="btn-danger" onClick={() => setConfirmDelete(true)}>
                  <Trash2 className="h-4 w-4" /> Remover
                </button>
              </>
            )}
          </>
        }
      />

      <AssetQrModal
        open={qrOpen}
        onClose={() => setQrOpen(false)}
        tag={instrument.tag}
        description={instrument.description}
        path={`/gestao/ativos/${instrument.id}`}
      />

      {instrument.parent && (
        <p className="-mt-3 mb-2 text-sm text-graphite-500">
          Componente de:{" "}
          <Link to={`/gestao/ativos/${instrument.parent.id}`} className="font-medium text-navy-700 hover:underline">
            TAG {instrument.parent.tag ?? instrument.parent.type}
          </Link>
        </p>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <AssetPhoto
          instrumentId={instrument.id}
          tag={instrument.tag}
          photoUrl={instrument.photoUrl}
          podeEditar={canManage}
          aoMudar={refetch}
        />
        <StatusBadge status={instrument.derivedStatus ?? instrument.status} />
        <StatusBadge status={instrument.criticality} label={`Criticidade: ${PRIORITY_LABELS[instrument.criticality]}`} />
        <StatusBadge status={instrument.operationalStatus} />
      </div>

      {/* Cadastro rapido deixa o tipo pendente de proposito - aqui e' o lugar de lembrar
          que a ficha ainda nao esta completa, sem impedir nada. */}
      {instrument.type === "A definir" && canManage && (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-safety-yellow/40 bg-safety-yellow/10 px-4 py-3">
          <p className="text-sm text-graphite-700">
            Este ativo foi cadastrado pelo caminho rapido e ainda nao tem tipo definido.
          </p>
          <button className="btn-outline ml-auto text-sm" onClick={() => setEditOpen(true)}>
            Completar ficha
          </button>
        </div>
      )}

      <AssetSetupAlerts instrument={instrument} base="/gestao/manutencao" />

      <Tabs tabs={tabs} active={tab} onChange={setTab} />

      {tab === "overview" && (
        <div className="card p-5">
          <dl className="grid gap-4 sm:grid-cols-3">
            <Info label="Fabricante" value={instrument.manufacturer ?? "-"} />
            <Info label="Numero de serie" value={instrument.serialNumber ?? "-"} />
            <Info label="Faixa de medicao" value={instrument.measurementRange ?? "-"} />
            <Info label="Resolucao" value={instrument.resolution ?? "-"} />
            <Info label="Unidade" value={instrument.unit ?? "-"} />
            <Info label="Local de instalacao" value={instrument.installationLocation ?? "-"} />
            {/* Herdados do ativo raiz - o rotulo diz isso para ninguem procurar onde editar
                num ativo filho. "Sistema" saiu: era um nivel da propria arvore repetido aqui. */}
            <Info label={instrument.parentId ? "Planta (herdada)" : "Planta"} value={instrument.plant?.name ?? "-"} />
            <Info
              label={
                instrument.costCenterOverride
                  ? "Area / Centro de custo (excecao no centro)"
                  : instrument.parentId
                    ? "Area / Centro de custo (herdado do pai)"
                    : "Area / Centro de custo"
              }
              value={areaComCentroDeCusto(instrument.area, instrument.costCenter)}
            />
            <Info label="Periodicidade" value={instrument.calibrationFrequencyMonths ? `${instrument.calibrationFrequencyMonths} meses` : "Nao rastreada"} />
            <Info label="Ultima calibracao" value={formatDate(instrument.lastCalibrationDate)} />
            <Info label="Proxima calibracao" value={formatDate(instrument.nextDueDate)} />
          </dl>
        </div>
      )}

      {tab === "structure" && (
        <div className="space-y-6">
          <div className="card p-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-semibold text-navy-900">Ativos filhos</h2>
              {canManage && (
                <button className="btn-ghost btn-sm" onClick={() => setAddChildOpen(true)}>
                  <Plus className="h-4 w-4" /> Adicionar filho
                </button>
              )}
            </div>
            {!instrument.children || instrument.children.length === 0 ? (
              <EmptyState title="Nenhum componente" description="Ex.: motor, valvula, painel - componentes deste ativo com ficha propria." />
            ) : (
              <ul className="divide-y divide-gray-100">
                {instrument.children.map((c) => (
                  <li key={c.id}>
                    <Link to={`/gestao/ativos/${c.id}`} className="flex items-center justify-between py-2.5 text-sm hover:text-navy-700">
                      <span className="font-medium text-graphite-800">TAG {c.tag ?? c.type}</span>
                      <span className="text-xs text-graphite-400">{c.type}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="card p-5">
            <h2 className="mb-3 font-semibold text-navy-900">Pecas compativeis (BOM)</h2>
            {canManage && (
              <div className="mb-3 flex gap-2">
                <SparePartPicker
                  className="flex-1"
                  name="selectedSparePartId"
                  value={selectedSparePartId}
                  onChange={(e) => setSelectedSparePartId(e.target.value)}
                  clientId={instrument.clientId}
                />
                <button type="button" className="btn-outline" onClick={handleAddAssetPart} disabled={!selectedSparePartId}>
                  <Plus className="h-4 w-4" />
                </button>
              </div>
            )}
            {!assetParts || assetParts.length === 0 ? (
              <EmptyState title="Nenhuma peca vinculada" description="Vincule as pecas do almoxarifado usadas neste ativo." />
            ) : (
              <ul className="divide-y divide-gray-100">
                {assetParts.map((link) => (
                  <li key={link.id} className="flex items-center justify-between py-2.5 text-sm">
                    <span className="text-graphite-800">{link.sparePart?.name}</span>
                    {canManage && (
                      <button onClick={() => handleRemoveAssetPart(link.id)} className="text-graphite-400 hover:text-safety-red" aria-label="Remover vinculo">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {tab === "maintenance" && (
        <div className="space-y-6">
          <AssetRotableCard instrumentId={instrument.id} clientId={instrument.clientId} base="/gestao/manutencao" />
          <AssetLubricationCard instrumentId={instrument.id} clientId={instrument.clientId} raiz="/gestao" />
          <div className="card p-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-semibold text-navy-900">Medidores</h2>
              {canManage && (
                <button className="btn-ghost btn-sm" onClick={() => setMeterModalOpen(true)}>
                  <Plus className="h-4 w-4" /> Novo
                </button>
              )}
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
                      {canManage && (
                        <button className="btn-ghost btn-sm" onClick={() => handleAddReading(m.id)}>Registrar leitura</button>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="card p-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-semibold text-navy-900">RLP Maintenance CMMS</h2>
              {canManage && (
                <Link to={`/gestao/manutencao/planos/novo?instrumentId=${instrument.id}&clientId=${instrument.clientId}`} className="btn-ghost btn-sm">
                  <Plus className="h-4 w-4" /> Novo plano
                </Link>
              )}
            </div>
            {(!plans || plans.items.length === 0) && (!workOrders || workOrders.items.length === 0) ? (
              <EmptyState title="Nenhuma manutencao" description="Nenhum plano ou ordem de manutencao para este ativo ainda." />
            ) : (
              <>
                {plans && plans.items.length > 0 && (
                  <ul className="divide-y divide-gray-100">
                    {plans.items.map((p) => (
                      <li key={p.id}>
                        <Link to={`/gestao/manutencao/planos/${p.id}`} className="flex items-center justify-between py-2.5 text-sm hover:text-navy-700">
                          <span className="font-medium text-graphite-800">{p.name}</span>
                          <StatusBadge status={p.active ? (p.derivedStatus ?? "VALID") : "INACTIVE"} />
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
                {workOrders && workOrders.items.length > 0 && (
                  <>
                    <p className="mt-3 text-xs uppercase tracking-wide text-graphite-400">Ordens de manutencao recentes</p>
                    <ul className="divide-y divide-gray-100">
                      {workOrders.items.map((w) => (
                        <li key={w.id}>
                          <Link to={`/gestao/manutencao/ordens/${w.id}`} className="flex items-center justify-between py-2.5 text-sm hover:text-navy-700">
                            <span className="font-medium text-graphite-800">{w.number}</span>
                            <StatusBadge status={w.status} />
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {tab === "costs" && (
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
            <p className="mb-3 text-xs text-graphite-500">O que ja foi baixado do almoxarifado nas OS deste ativo - diferente do BOM (aba Estrutura), que so lista o que e' compativel.</p>
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
                          <Link to={`/gestao/manutencao/ordens/${entry.lastWorkOrder.id}`} className="hover:underline">{entry.lastWorkOrder.number}</Link>
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

      {tab === "documents" && <InstrumentAttachments instrumentId={instrument.id} canEdit={!!canManage} />}

      {tab === "history" && isAdmin && (
        <div className="card p-5">
          <h2 className="mb-3 font-semibold text-navy-900">Historico de alteracoes</h2>
          {!history || history.items.length === 0 ? (
            <EmptyState title="Nenhum registro" description="Alteracoes neste ativo aparecem aqui conforme forem feitas." />
          ) : (
            <ul className="divide-y divide-gray-100">
              {history.items.map((entry) => (
                <li key={entry.id} className="py-2.5 text-sm">
                  <p className="text-graphite-800">{entry.description ?? entry.action}</p>
                  <p className="text-xs text-graphite-400">
                    {formatDateTime(entry.createdAt)}{entry.user && <> · {entry.user.name}</>}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <InstrumentFormModal
        open={addChildOpen}
        onClose={() => setAddChildOpen(false)}
        initialParentId={instrument.id}
        initialClientId={instrument.clientId}
        initialTagPrefix={instrument.tag ? `${instrument.tag}-` : undefined}
        onSaved={() => {
          setAddChildOpen(false);
          queryClient.invalidateQueries({ queryKey: ["instrument", id] });
        }}
      />

      <MeterFormModal
        open={meterModalOpen}
        onClose={() => setMeterModalOpen(false)}
        instrumentId={instrument.id}
        onSaved={() => {
          setMeterModalOpen(false);
          queryClient.invalidateQueries({ queryKey: ["instrument-meters", id] });
        }}
      />

      <InstrumentFormModal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        instrument={instrument}
        onSaved={() => {
          setEditOpen(false);
          queryClient.invalidateQueries({ queryKey: ["instrument", id] });
          queryClient.invalidateQueries({ queryKey: ["instruments"] });
        }}
      />

      <ConfirmDialog
        open={confirmDelete}
        title="Remover ativo"
        description="Tem certeza que deseja remover este ativo? O historico de manutencao sera preservado."
        confirmLabel="Remover"
        danger
        loading={deleting}
        onConfirm={handleDelete}
        onCancel={() => setConfirmDelete(false)}
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
