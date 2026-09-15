import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Wrench, LogOut, LogIn, CheckCircle2, XCircle, PackageCheck, FileDown } from "lucide-react";
import {
  getRotableEquipment,
  updateRotableEquipment,
  installRotableEquipment,
  removeRotableEquipment,
  createRepairOrder,
  approveRepairBudget,
  rejectRepairBudget,
  returnFromRepair,
  baixarFichaDeEnvio,
} from "../../../api/rotableEquipment";
import { listFailureCodes } from "../../../api/failureCodes";
import type { RotableEquipment, RotableRepairOutcome, RotableRepairOrder, RotableRepairPurpose } from "../../../api/types";
import { PageHeader } from "../../../components/PageHeader";
import { FullPageSpinner } from "../../../components/Spinner";
import { StatusBadge } from "../../../components/StatusBadge";
import { Modal } from "../../../components/Modal";
import { Tabs } from "../../../components/Tabs";
import { TextInput, SelectInput, TextareaInput } from "../../../components/form/Field";
import { InstrumentPicker } from "../../../components/InstrumentPicker";
import { RotableTypeInput } from "../../../components/RotableTypeInput";
import { useToast } from "../../../components/Toast";
import { getApiErrorMessage } from "../../../api/client";
import { useCmms } from "../../../lib/cmms";
import { formatDate, formatDateTime, formatCurrency } from "../../../lib/format";
import { camposDoTipo } from "../../../lib/camposPorTipoDeAtivo";
import { rotuloDeStatusRotable } from "../../../lib/rotableStatus";

const OPCOES_DE_RESULTADO: { value: RotableRepairOutcome; label: string }[] = [
  { value: "REPAIRED", label: "Reparado" },
  { value: "PARTIALLY_REPAIRED", label: "Reparo parcial" },
  { value: "SCRAPPED", label: "Sucateado" },
];

const OPCOES_DE_MOTIVO: { value: RotableRepairPurpose; label: string }[] = [
  { value: "REPAIR", label: "Conserto / reparo" },
  { value: "WARRANTY", label: "Garantia" },
  { value: "SIMPLE_SHIPMENT", label: "Remessa simples" },
];

/** Ficha de envio em PDF. Baixa em vez de abrir aba nova: window.open depois de um await
 * perde o "gesto do usuario" e cai no bloqueador de pop-up do navegador - mesmo padrao de
 * download ja usado no exportar/importar desta tela. */
async function abrirFichaDeEnvio(repairOrderId: string, codigo: string, notify: (variant: "error", text: string) => void) {
  try {
    const blob = await baixarFichaDeEnvio(repairOrderId);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ficha-de-envio-${codigo}.pdf`;
    a.click();
    URL.revokeObjectURL(url);
  } catch (error) {
    notify("error", getApiErrorMessage(error));
  }
}

export default function RotableEquipmentDetail() {
  const { id = "" } = useParams<{ id: string }>();
  const { base, canManage } = useCmms();
  const { notify } = useToast();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<"instalacoes" | "reparos">("instalacoes");
  const [editOpen, setEditOpen] = useState(false);
  const [installOpen, setInstallOpen] = useState(false);
  const [removeOpen, setRemoveOpen] = useState(false);
  const [repairOpen, setRepairOpen] = useState(false);
  const [returnOpen, setReturnOpen] = useState<string | null>(null);

  const { data: rotable, isLoading } = useQuery({ queryKey: ["rotable-equipment", id], queryFn: () => getRotableEquipment(id) });
  const { data: failureCodes } = useQuery({ queryKey: ["failure-codes-picker"], queryFn: () => listFailureCodes({ active: true }) });

  function invalidar() {
    queryClient.invalidateQueries({ queryKey: ["rotable-equipment", id] });
    queryClient.invalidateQueries({ queryKey: ["rotable-equipment"] });
  }

  if (isLoading || !rotable) return <FullPageSpinner />;

  return (
    <div>
      <PageHeader
        title={rotable.code}
        description={`${rotable.type}${rotable.manufacturer ? ` - ${rotable.manufacturer}` : ""}${rotable.model ? ` ${rotable.model}` : ""}`}
        breadcrumbs={[
          { label: "RLP Maintenance CMMS", to: base },
          { label: "Equipamentos recondicionáveis", to: `${base}/equipamentos-recondicionaveis` },
          { label: rotable.code },
        ]}
        actions={
          canManage && (
            <>
              <button className="btn-outline" onClick={() => setEditOpen(true)}>
                <Pencil className="h-4 w-4" /> Editar
              </button>
              {rotable.status === "IN_STOCK" && (
                <button className="btn-primary" onClick={() => setInstallOpen(true)}>
                  <LogIn className="h-4 w-4" /> Instalar em um ativo
                </button>
              )}
              {rotable.status === "INSTALLED" && (
                <button className="btn-outline" onClick={() => setRemoveOpen(true)}>
                  <LogOut className="h-4 w-4" /> Remover do ativo
                </button>
              )}
              {(rotable.status === "QUARANTINE" || rotable.status === "IN_STOCK") && (
                <button className="btn-outline" onClick={() => setRepairOpen(true)}>
                  <Wrench className="h-4 w-4" /> Enviar para reparo
                </button>
              )}
            </>
          )
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <div className="card p-5">
          <p className="text-xs uppercase tracking-wide text-graphite-400">Status</p>
          <div className="mt-1"><StatusBadge status={rotable.status} label={rotuloDeStatusRotable(rotable)} /></div>
        </div>
        <div className="card p-5">
          <p className="text-xs uppercase tracking-wide text-graphite-400">Instalado em</p>
          <p className="mt-1 font-medium text-navy-900">
            {rotable.currentInstrument ? (
              <Link to={`${base.replace("/manutencao", "")}/ativos/${rotable.currentInstrument.id}`} className="hover:underline">
                {rotable.currentInstrument.tag ?? rotable.currentInstrument.description}
              </Link>
            ) : "-"}
          </p>
        </div>
        <div className="card p-5">
          <p className="text-xs uppercase tracking-wide text-graphite-400">Número de série</p>
          <p className="mt-1 font-medium text-navy-900">{rotable.serialNumber ?? "-"}</p>
        </div>
        <div className="card p-5">
          <p className="text-xs uppercase tracking-wide text-graphite-400">Custo de aquisicao</p>
          <p className="mt-1 font-medium text-navy-900">{rotable.acquisitionCost != null ? formatCurrency(rotable.acquisitionCost) : "-"}</p>
        </div>
        <div className="card p-5">
          <p className="text-xs uppercase tracking-wide text-graphite-400">Peso</p>
          <p className="mt-1 font-medium text-navy-900">{rotable.weightKg != null ? `${rotable.weightKg} kg` : "-"}</p>
        </div>
      </div>

      {rotable.notes && (
        <div className="card mb-6 p-5">
          <p className="text-xs uppercase tracking-wide text-graphite-400">Observacoes</p>
          <p className="mt-1 whitespace-pre-wrap text-sm text-graphite-700">{rotable.notes}</p>
        </div>
      )}

      <Tabs
        tabs={[
          { id: "instalacoes", label: `Instalacoes (${rotable.installations?.length ?? 0})` },
          { id: "reparos", label: `Reparos (${rotable.repairOrders?.length ?? 0})` },
        ]}
        active={tab}
        onChange={(t) => setTab(t as typeof tab)}
      />

      {tab === "instalacoes" && (
        <div className="card p-5">
          {!rotable.installations || rotable.installations.length === 0 ? (
            <p className="text-sm text-graphite-500">Este equipamento nunca foi instalado em nenhum ativo.</p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {rotable.installations.map((inst) => (
                <li key={inst.id} className="py-3 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium text-navy-900">
                      {inst.instrument?.tag ?? inst.instrument?.description ?? inst.instrumentId}
                    </span>
                    <StatusBadge status={inst.removedAt ? "INACTIVE" : "ACTIVE"} label={inst.removedAt ? "Encerrada" : "Em andamento"} />
                  </div>
                  <p className="mt-1 text-xs text-graphite-500">
                    Instalado em {formatDateTime(inst.installedAt)}
                    {inst.meterReadingAtInstall != null && ` (horimetro ${inst.meterReadingAtInstall})`}
                    {inst.removedAt && (
                      <>
                        {" - retirado em "}{formatDateTime(inst.removedAt)}
                        {inst.meterReadingAtRemoval != null && ` (horimetro ${inst.meterReadingAtRemoval})`}
                      </>
                    )}
                    {inst.workOrder && (
                      <>
                        {" - OS "}
                        <Link to={`${base}/ordens/${inst.workOrder.id}`} className="text-navy-700 hover:underline">{inst.workOrder.number}</Link>
                      </>
                    )}
                  </p>
                  {(inst.removalReason || inst.conditionAtRemoval) && (
                    <p className="mt-0.5 text-xs text-graphite-500">
                      {inst.removalReason && `Motivo: ${inst.removalReason}. `}
                      {inst.conditionAtRemoval && `Condicao na retirada: ${inst.conditionAtRemoval}.`}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {tab === "reparos" && (
        <div className="space-y-3">
          {!rotable.repairOrders || rotable.repairOrders.length === 0 ? (
            <div className="card p-5"><p className="text-sm text-graphite-500">Nenhuma ordem de reparo registrada ainda.</p></div>
          ) : (
            rotable.repairOrders.map((order) => (
              <div key={order.id} className="card space-y-3 p-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-medium text-navy-900">
                      {order.vendor ?? "Fornecedor não informado"}
                      {order.budgetNumber && ` - orçamento ${order.budgetNumber}`}
                    </p>
                    <p className="text-xs text-graphite-500">
                      {OPCOES_DE_MOTIVO.find((o) => o.value === order.purpose)?.label ?? order.purpose} - enviado em {formatDate(order.sentAt)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button className="btn-outline btn-sm" onClick={() => void abrirFichaDeEnvio(order.id, rotable.code, notify)}>
                      <FileDown className="h-4 w-4" /> Ficha de envio
                    </button>
                    <StatusBadge status={order.budgetStatus} />
                    {order.outcome && <StatusBadge status={order.outcome} />}
                  </div>
                </div>

                {order.defectReported && <p className="text-sm text-graphite-700"><span className="font-medium">Defeito informado:</span> {order.defectReported}</p>}
                {order.diagnosis && <p className="text-sm text-graphite-700"><span className="font-medium">Diagnóstico:</span> {order.diagnosis}</p>}
                {order.failureCode && <p className="text-sm text-graphite-700"><span className="font-medium">Código de falha:</span> {order.failureCode.code} - {order.failureCode.description}</p>}
                {order.budgetValue != null && <p className="text-sm text-graphite-700"><span className="font-medium">Valor orçado:</span> {formatCurrency(order.budgetValue)}</p>}
                {order.promisedReturnAt && <p className="text-sm text-graphite-700"><span className="font-medium">Prazo prometido:</span> {formatDate(order.promisedReturnAt)}</p>}

                {order.returnedAt ? (
                  <div className="rounded-lg bg-gray-50 p-3 text-sm text-graphite-700">
                    <p className="font-medium text-navy-900">Retornou em {formatDate(order.returnedAt)}</p>
                    {order.serviceDone && <p className="mt-1"><span className="font-medium">Serviço executado:</span> {order.serviceDone}</p>}
                    {order.partsReplacedNotes && <p><span className="font-medium">Peças substituídas:</span> {order.partsReplacedNotes}</p>}
                    {order.laborNotes && <p><span className="font-medium">Mão de obra:</span> {order.laborNotes}</p>}
                    {order.testsPerformed && <p><span className="font-medium">Ensaios:</span> {order.testsPerformed}</p>}
                    {order.finalReport && <p><span className="font-medium">Laudo final:</span> {order.finalReport}</p>}
                    {order.conditionAfterRepair && <p><span className="font-medium">Condição após reparo:</span> {order.conditionAfterRepair}</p>}
                    {order.warrantyMonths != null && <p><span className="font-medium">Garantia:</span> {order.warrantyMonths} mes(es){order.warrantyNotes ? ` - ${order.warrantyNotes}` : ""}</p>}
                    {order.finalCost != null && <p><span className="font-medium">Valor final:</span> {formatCurrency(order.finalCost)}</p>}
                  </div>
                ) : canManage ? (
                  <div className="flex flex-wrap gap-2 border-t border-gray-100 pt-3">
                    {order.budgetStatus === "PENDING" && (
                      <>
                        <button
                          className="btn-outline btn-sm"
                          onClick={async () => {
                            try { await approveRepairBudget(order.id); notify("success", "Orcamento aprovado."); invalidar(); }
                            catch (error) { notify("error", getApiErrorMessage(error)); }
                          }}
                        >
                          <CheckCircle2 className="h-4 w-4" /> Aprovar orcamento
                        </button>
                        <button
                          className="btn-outline btn-sm"
                          onClick={async () => {
                            try { await rejectRepairBudget(order.id); notify("success", "Orcamento reprovado."); invalidar(); }
                            catch (error) { notify("error", getApiErrorMessage(error)); }
                          }}
                        >
                          <XCircle className="h-4 w-4" /> Reprovar orcamento
                        </button>
                      </>
                    )}
                    <button className="btn-primary btn-sm" onClick={() => setReturnOpen(order.id)}>
                      <PackageCheck className="h-4 w-4" /> Registrar retorno
                    </button>
                  </div>
                ) : null}
              </div>
            ))
          )}
        </div>
      )}

      {editOpen && (
        <EditModal rotable={rotable} onClose={() => setEditOpen(false)} onSaved={() => { setEditOpen(false); invalidar(); }} />
      )}

      {installOpen && (
        <InstallModal
          rotableId={rotable.id}
          clientId={rotable.clientId}
          onClose={() => setInstallOpen(false)}
          onDone={() => { setInstallOpen(false); invalidar(); }}
        />
      )}

      {removeOpen && (
        <RemoveModal
          rotableId={rotable.id}
          onClose={() => setRemoveOpen(false)}
          onDone={() => { setRemoveOpen(false); invalidar(); }}
        />
      )}

      {repairOpen && (
        <RepairOrderModal
          rotableId={rotable.id}
          rotableCode={rotable.code}
          failureCodes={failureCodes ?? []}
          onClose={() => setRepairOpen(false)}
          onDone={() => { setRepairOpen(false); invalidar(); }}
        />
      )}

      {returnOpen && (
        <ReturnModal
          orderId={returnOpen}
          onClose={() => setReturnOpen(null)}
          onDone={() => { setReturnOpen(null); invalidar(); }}
        />
      )}
    </div>
  );
}

function EditModal({ rotable, onClose, onSaved }: { rotable: RotableEquipment; onClose: () => void; onSaved: () => void }) {
  const { notify } = useToast();
  const [values, setValues] = useState({
    code: rotable.code,
    type: rotable.type,
    manufacturer: rotable.manufacturer ?? "",
    model: rotable.model ?? "",
    serialNumber: rotable.serialNumber ?? "",
    weightKg: rotable.weightKg != null ? String(rotable.weightKg) : "",
    acquisitionCost: rotable.acquisitionCost != null ? String(rotable.acquisitionCost) : "",
    notes: rotable.notes ?? "",
  });
  const [specificAttributes, setSpecificAttributes] = useState<Record<string, string>>(
    (rotable.specificAttributes as Record<string, string> | null) ?? {},
  );
  const [saving, setSaving] = useState(false);
  const camposEspecificos = camposDoTipo(values.type);

  function setAtributo(chave: string, valor: string) {
    setSpecificAttributes((prev) => ({ ...prev, [chave]: valor }));
  }

  async function submit() {
    if (!values.code.trim() || !values.type.trim()) {
      notify("error", "Falta preencher: Código, Tipo.");
      return;
    }
    setSaving(true);
    try {
      const attrsPreenchidos = Object.fromEntries(Object.entries(specificAttributes).filter(([, v]) => v?.trim()));
      await updateRotableEquipment(rotable.id, {
        code: values.code,
        type: values.type,
        manufacturer: values.manufacturer.trim() || null,
        model: values.model.trim() || null,
        serialNumber: values.serialNumber.trim() || null,
        notes: values.notes.trim() || null,
        weightKg: values.weightKg ? Number(values.weightKg) : null,
        acquisitionCost: values.acquisitionCost ? Number(values.acquisitionCost) : null,
        specificAttributes: Object.keys(attrsPreenchidos).length > 0 ? attrsPreenchidos : null,
      });
      notify("success", "Equipamento atualizado.");
      onSaved();
    } catch (error) {
      notify("error", getApiErrorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Editar equipamento"
      size="md"
      footer={<><button type="button" className="btn-outline" onClick={onClose}>Cancelar</button><button type="button" className="btn-primary" disabled={saving} onClick={submit}>{saving ? "Salvando..." : "Salvar"}</button></>}
    >
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <RotableTypeInput
            label="Tipo"
            required
            name="type"
            clientId={rotable.clientId}
            currentValue={rotable.type}
            value={values.type}
            onChange={(e) => setValues({ ...values, type: e.target.value })}
          />
          <TextInput label="Código" required value={values.code} onChange={(e) => setValues({ ...values, code: e.target.value })} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextInput label="Fabricante" value={values.manufacturer} onChange={(e) => setValues({ ...values, manufacturer: e.target.value })} />
          <TextInput label="Modelo" value={values.model} onChange={(e) => setValues({ ...values, model: e.target.value })} />
        </div>
        <TextInput label="Número de série" value={values.serialNumber} onChange={(e) => setValues({ ...values, serialNumber: e.target.value })} />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextInput
            label="Custo de aquisição"
            type="number"
            step="any"
            value={values.acquisitionCost}
            onChange={(e) => setValues({ ...values, acquisitionCost: e.target.value })}
          />
          <TextInput
            label="Peso (kg)"
            type="number"
            step="any"
            hint="Usado na ficha de envio, para calcular o frete."
            value={values.weightKg}
            onChange={(e) => setValues({ ...values, weightKg: e.target.value })}
          />
        </div>
        <TextInput label="Observações" value={values.notes} onChange={(e) => setValues({ ...values, notes: e.target.value })} />

        {camposEspecificos.length > 0 && (
          <div className="rounded-lg border border-gray-200 p-4">
            <p className="text-sm font-medium text-graphite-700">Ficha tecnica de {values.type}</p>
            <p className="mt-0.5 text-xs text-graphite-500">Campos próprios deste tipo de equipamento - todos opcionais.</p>
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              {camposEspecificos.map((campo) =>
                campo.tipo === "select" ? (
                  <SelectInput
                    key={campo.chave}
                    label={campo.rotulo}
                    options={(campo.opcoes ?? []).map((o) => ({ value: o, label: o }))}
                    value={specificAttributes[campo.chave] ?? ""}
                    onChange={(e) => setAtributo(campo.chave, e.target.value)}
                  />
                ) : (
                  <TextInput
                    key={campo.chave}
                    label={campo.rotulo}
                    placeholder={campo.placeholder}
                    value={specificAttributes[campo.chave] ?? ""}
                    onChange={(e) => setAtributo(campo.chave, e.target.value)}
                  />
                ),
              )}
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}

function InstallModal({ rotableId, clientId, onClose, onDone }: { rotableId: string; clientId: string; onClose: () => void; onDone: () => void }) {
  const { notify } = useToast();
  const [instrumentId, setInstrumentId] = useState("");
  const [meterReading, setMeterReading] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (!instrumentId) {
      notify("error", "Falta preencher: Ativo.");
      return;
    }
    setSaving(true);
    try {
      await installRotableEquipment(rotableId, { instrumentId, meterReading: meterReading ? Number(meterReading) : null });
      notify("success", "Equipamento instalado.");
      onDone();
    } catch (error) {
      notify("error", getApiErrorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Instalar equipamento"
      size="sm"
      footer={<><button type="button" className="btn-outline" onClick={onClose}>Cancelar</button><button type="button" className="btn-primary" disabled={saving} onClick={submit}>{saving ? "Instalando..." : "Instalar"}</button></>}
    >
      <div className="space-y-4">
        <InstrumentPicker label="Ativo" required clientId={clientId} name="instrumentId" value={instrumentId} onChange={(e) => setInstrumentId(e.target.value)} />
        <TextInput label="Horímetro na instalação (opcional)" type="number" value={meterReading} onChange={(e) => setMeterReading(e.target.value)} />
      </div>
    </Modal>
  );
}

function RemoveModal({ rotableId, onClose, onDone }: { rotableId: string; onClose: () => void; onDone: () => void }) {
  const { notify } = useToast();
  const [reason, setReason] = useState("");
  const [condition, setCondition] = useState("");
  const [meterReading, setMeterReading] = useState("");
  const [destination, setDestination] = useState<"QUARANTINE" | "IN_STOCK">("QUARANTINE");
  const [saving, setSaving] = useState(false);

  async function submit() {
    setSaving(true);
    try {
      await removeRotableEquipment(rotableId, { removalReason: reason || null, conditionAtRemoval: condition || null, meterReading: meterReading ? Number(meterReading) : null, destinationStatus: destination });
      notify("success", "Equipamento removido do ativo.");
      onDone();
    } catch (error) {
      notify("error", getApiErrorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Remover equipamento do ativo"
      size="sm"
      footer={<><button type="button" className="btn-outline" onClick={onClose}>Cancelar</button><button type="button" className="btn-primary" disabled={saving} onClick={submit}>{saving ? "Removendo..." : "Remover"}</button></>}
    >
      <div className="space-y-4">
        <TextInput label="Motivo (opcional)" placeholder="Ex.: falha, preventiva, troca programada" value={reason} onChange={(e) => setReason(e.target.value)} />
        <TextInput label="Condição na retirada (opcional)" placeholder="Ex.: rolamento gripado" value={condition} onChange={(e) => setCondition(e.target.value)} />
        <TextInput label="Horímetro na retirada (opcional)" type="number" value={meterReading} onChange={(e) => setMeterReading(e.target.value)} />
        <SelectInput
          label="Destino"
          options={[{ value: "QUARANTINE", label: "Quarentena (vai avaliar/reparar)" }, { value: "IN_STOCK", label: "Estoque (peça boa, sem reparo)" }]}
          value={destination}
          onChange={(e) => setDestination(e.target.value as "QUARANTINE" | "IN_STOCK")}
        />
      </div>
    </Modal>
  );
}

function RepairOrderModal({ rotableId, rotableCode, failureCodes, onClose, onDone }: { rotableId: string; rotableCode: string; failureCodes: { id: string; code: string; description: string }[]; onClose: () => void; onDone: () => void }) {
  const { notify } = useToast();
  const [values, setValues] = useState({
    defectReported: "",
    diagnosis: "",
    failureCodeId: "",
    vendor: "",
    purpose: "REPAIR" as RotableRepairPurpose,
    budgetNumber: "",
    budgetValue: "",
  });
  const [saving, setSaving] = useState(false);
  // Depois de aberta, a ordem fica visivel aqui so' para oferecer a ficha de envio - fechar
  // o modal nesse momento (como antes) faria a pessoa procurar a ordem de novo na aba
  // Reparos so' para baixar o PDF que acabou de gerar o motivo de estar aqui.
  const [criada, setCriada] = useState<RotableRepairOrder | null>(null);

  async function submit() {
    setSaving(true);
    try {
      const order = await createRepairOrder(rotableId, {
        defectReported: values.defectReported || null,
        diagnosis: values.diagnosis || null,
        failureCodeId: values.failureCodeId || null,
        vendor: values.vendor || null,
        purpose: values.purpose,
        budgetNumber: values.budgetNumber || null,
        budgetValue: values.budgetValue ? Number(values.budgetValue) : null,
      });
      notify("success", "Ordem de reparo aberta.");
      setCriada(order);
    } catch (error) {
      notify("error", getApiErrorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  if (criada) {
    return (
      <Modal
        open
        onClose={onDone}
        title="Ordem de reparo aberta"
        size="sm"
        footer={<button type="button" className="btn-primary" onClick={onDone}>Concluir</button>}
      >
        <div className="space-y-4">
          <p className="text-sm text-graphite-700">
            Quer gerar a ficha de envio (PDF) agora, com os dados do equipamento (código, tipo, peso, valor, ficha
            técnica) para encaminhar à área que emite a nota fiscal de remessa?
          </p>
          <button className="btn-outline w-full justify-center" onClick={() => void abrirFichaDeEnvio(criada.id, rotableCode, notify)}>
            <FileDown className="h-4 w-4" /> Gerar ficha de envio (PDF)
          </button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Enviar para reparo"
      size="md"
      footer={<><button type="button" className="btn-outline" onClick={onClose}>Cancelar</button><button type="button" className="btn-primary" disabled={saving} onClick={submit}>{saving ? "Salvando..." : "Abrir ordem de reparo"}</button></>}
    >
      <div className="space-y-4">
        <TextareaInput label="Defeito informado" rows={2} value={values.defectReported} onChange={(e) => setValues({ ...values, defectReported: e.target.value })} />
        <TextareaInput label="Diagnóstico (se já houver)" rows={2} value={values.diagnosis} onChange={(e) => setValues({ ...values, diagnosis: e.target.value })} />
        <SelectInput
          label="Código de falha (opcional)"
          options={failureCodes.map((f) => ({ value: f.id, label: `${f.code} - ${f.description}` }))}
          placeholder="Não especificar"
          value={values.failureCodeId}
          onChange={(e) => setValues({ ...values, failureCodeId: e.target.value })}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextInput label="Empresa reparadora" value={values.vendor} onChange={(e) => setValues({ ...values, vendor: e.target.value })} />
          <SelectInput
            label="Motivo do envio"
            options={OPCOES_DE_MOTIVO}
            value={values.purpose}
            onChange={(e) => setValues({ ...values, purpose: e.target.value as RotableRepairPurpose })}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextInput label="Número do orçamento" value={values.budgetNumber} onChange={(e) => setValues({ ...values, budgetNumber: e.target.value })} />
          <TextInput label="Valor orçado" type="number" step="any" value={values.budgetValue} onChange={(e) => setValues({ ...values, budgetValue: e.target.value })} />
        </div>
      </div>
    </Modal>
  );
}

function ReturnModal({ orderId, onClose, onDone }: { orderId: string; onClose: () => void; onDone: () => void }) {
  const { notify } = useToast();
  const [values, setValues] = useState({
    outcome: "REPAIRED" as RotableRepairOutcome,
    serviceDone: "",
    partsReplacedNotes: "",
    laborNotes: "",
    testsPerformed: "",
    finalReport: "",
    warrantyMonths: "",
    finalCost: "",
    conditionAfterRepair: "",
  });
  const [saving, setSaving] = useState(false);

  async function submit() {
    setSaving(true);
    try {
      await returnFromRepair(orderId, {
        outcome: values.outcome,
        serviceDone: values.serviceDone || null,
        partsReplacedNotes: values.partsReplacedNotes || null,
        laborNotes: values.laborNotes || null,
        testsPerformed: values.testsPerformed || null,
        finalReport: values.finalReport || null,
        warrantyMonths: values.warrantyMonths ? Number(values.warrantyMonths) : null,
        finalCost: values.finalCost ? Number(values.finalCost) : null,
        conditionAfterRepair: values.conditionAfterRepair || null,
      });
      notify("success", "Retorno registrado.");
      onDone();
    } catch (error) {
      notify("error", getApiErrorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Registrar retorno do reparo"
      size="md"
      footer={<><button type="button" className="btn-outline" onClick={onClose}>Cancelar</button><button type="button" className="btn-primary" disabled={saving} onClick={submit}>{saving ? "Salvando..." : "Registrar retorno"}</button></>}
    >
      <div className="space-y-4">
        <SelectInput label="Resultado" required options={OPCOES_DE_RESULTADO} value={values.outcome} onChange={(e) => setValues({ ...values, outcome: e.target.value as RotableRepairOutcome })} />
        <TextareaInput label="Serviço executado" rows={2} value={values.serviceDone} onChange={(e) => setValues({ ...values, serviceDone: e.target.value })} />
        <TextareaInput label="Peças substituídas" rows={2} value={values.partsReplacedNotes} onChange={(e) => setValues({ ...values, partsReplacedNotes: e.target.value })} />
        <TextInput label="Mão de obra" value={values.laborNotes} onChange={(e) => setValues({ ...values, laborNotes: e.target.value })} />
        <TextInput label="Ensaios realizados" value={values.testsPerformed} onChange={(e) => setValues({ ...values, testsPerformed: e.target.value })} />
        <TextareaInput label="Laudo final" rows={2} value={values.finalReport} onChange={(e) => setValues({ ...values, finalReport: e.target.value })} />
        <TextInput label="Condição depois do reparo" value={values.conditionAfterRepair} onChange={(e) => setValues({ ...values, conditionAfterRepair: e.target.value })} />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextInput label="Garantia (meses)" type="number" value={values.warrantyMonths} onChange={(e) => setValues({ ...values, warrantyMonths: e.target.value })} />
          <TextInput label="Valor final" type="number" step="any" value={values.finalCost} onChange={(e) => setValues({ ...values, finalCost: e.target.value })} />
        </div>
      </div>
    </Modal>
  );
}
