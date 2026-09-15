import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { RefreshCw, Plus, LogIn, LogOut } from "lucide-react";
import { listRotableEquipment, installRotableEquipment, removeRotableEquipment } from "../api/rotableEquipment";
import { StatusBadge } from "./StatusBadge";
import { EmptyState } from "./EmptyState";
import { Modal } from "./Modal";
import { TextInput, SelectInput } from "./form/Field";
import { useToast } from "./Toast";
import { getApiErrorMessage } from "../api/client";
import { rotuloDeStatusRotable } from "../lib/rotableStatus";

interface Props {
  instrumentId: string;
  clientId?: string;
  /** Prefixo das rotas do portal/gestao ("/portal/manutencao" ou "/gestao/manutencao"). */
  base: string;
}

/**
 * O equipamento recondicionavel instalado neste ativo agora, na propria ficha dele.
 *
 * O Ativo e' o local/posicao; o motor/redutor/rolo que ocupa esse local hoje e' uma peca
 * fisica separada, que pode ter passado por outras maquinas antes e vai passar por outras
 * depois. Aqui aparece so o estado atual - o historico completo (instalacoes, reparos) fica
 * na ficha do proprio equipamento, um clique adiante. Instalar/remover tambem funciona
 * direto daqui (antes so' dava pelo lado do equipamento - pedido do usuario: vincular
 * direto na ficha do ativo, que e' por onde a maioria chega primeiro).
 */
export function AssetRotableCard({ instrumentId, clientId, base }: Props) {
  const queryClient = useQueryClient();
  const [installOpen, setInstallOpen] = useState(false);
  const [removeOpen, setRemoveOpen] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["rotable-equipment-do-ativo", instrumentId],
    queryFn: () => listRotableEquipment({ instrumentId, clientId, pageSize: 5 }),
    enabled: !!instrumentId,
  });

  const instalado = data?.items?.[0] ?? null;
  const catalogo = `${base}/equipamentos-recondicionaveis`;

  function invalidar() {
    queryClient.invalidateQueries({ queryKey: ["rotable-equipment-do-ativo", instrumentId] });
    queryClient.invalidateQueries({ queryKey: ["rotable-equipment"] });
  }

  return (
    <div className="card p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 font-semibold text-navy-900">
          <RefreshCw className="h-5 w-5 text-navy-600" /> Equipamento recondicionável
        </h2>
        <div className="flex items-center gap-2">
          {!isLoading && !instalado && (
            <button className="btn-primary text-sm" onClick={() => setInstallOpen(true)}>
              <LogIn className="h-4 w-4" /> Instalar equipamento
            </button>
          )}
          {instalado && (
            <button className="btn-outline text-sm" onClick={() => setRemoveOpen(true)}>
              <LogOut className="h-4 w-4" /> Remover
            </button>
          )}
          <Link className="btn-outline text-sm" to={catalogo}>
            <Plus className="h-4 w-4" /> Catálogo
          </Link>
        </div>
      </div>

      {!instalado ? (
        <div className="mt-3">
          <EmptyState
            title="Nenhum equipamento instalado"
            description="Motor, redutor, rolo... cadastre no catálogo (se ainda não existir) e instale aqui."
          />
        </div>
      ) : (
        <Link to={`${catalogo}/${instalado.id}`} className="mt-3 flex items-center justify-between gap-3 rounded-lg border border-gray-200 px-3 py-2.5 text-sm hover:bg-gray-50">
          <div className="min-w-0">
            <p className="font-medium text-navy-900">{instalado.code}</p>
            <p className="truncate text-xs text-graphite-400">
              {instalado.type}
              {instalado.manufacturer ? ` - ${instalado.manufacturer}` : ""}
              {instalado.serialNumber ? ` - S/N ${instalado.serialNumber}` : ""}
            </p>
          </div>
          <StatusBadge status={instalado.status} label={rotuloDeStatusRotable(instalado)} />
        </Link>
      )}

      {installOpen && (
        <InstallFromAssetModal
          instrumentId={instrumentId}
          clientId={clientId}
          onClose={() => setInstallOpen(false)}
          onDone={() => {
            setInstallOpen(false);
            invalidar();
          }}
        />
      )}

      {removeOpen && instalado && (
        <RemoveFromAssetModal
          rotableId={instalado.id}
          rotableCode={instalado.code}
          onClose={() => setRemoveOpen(false)}
          onDone={() => {
            setRemoveOpen(false);
            invalidar();
          }}
        />
      )}
    </div>
  );
}

function InstallFromAssetModal({
  instrumentId,
  clientId,
  onClose,
  onDone,
}: {
  instrumentId: string;
  clientId?: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const { notify } = useToast();
  const [rotableId, setRotableId] = useState("");
  const [meterReading, setMeterReading] = useState("");
  const [saving, setSaving] = useState(false);

  const { data: emEstoque, isLoading } = useQuery({
    queryKey: ["rotable-em-estoque-todos", clientId],
    queryFn: () => listRotableEquipment({ clientId, status: "IN_STOCK", pageSize: 100 }),
    enabled: !!clientId,
  });

  async function submit() {
    if (!rotableId) {
      notify("error", "Falta preencher: Equipamento.");
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

  const opcoes = (emEstoque?.items ?? []).map((r) => ({
    value: r.id,
    label: `${r.code} - ${r.type}${r.serialNumber ? ` (S/N ${r.serialNumber})` : ""}`,
  }));

  return (
    <Modal
      open
      onClose={onClose}
      title="Instalar equipamento"
      size="sm"
      footer={
        <>
          <button type="button" className="btn-outline" onClick={onClose}>Cancelar</button>
          <button type="button" className="btn-primary" disabled={saving} onClick={submit}>
            {saving ? "Instalando..." : "Instalar"}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <SelectInput
          label="Equipamento (em estoque)"
          required
          placeholder={isLoading ? "Carregando..." : opcoes.length ? "Selecione" : "Nenhum equipamento em estoque"}
          options={opcoes}
          value={rotableId}
          onChange={(e) => setRotableId(e.target.value)}
        />
        {!isLoading && opcoes.length === 0 && (
          <p className="text-xs text-graphite-500">
            Nenhum equipamento em estoque - cadastre um no catálogo de Equipamentos recondicionáveis primeiro.
          </p>
        )}
        <TextInput label="Horímetro na instalação (opcional)" type="number" value={meterReading} onChange={(e) => setMeterReading(e.target.value)} />
      </div>
    </Modal>
  );
}

function RemoveFromAssetModal({
  rotableId,
  rotableCode,
  onClose,
  onDone,
}: {
  rotableId: string;
  rotableCode: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const { notify } = useToast();
  const [reason, setReason] = useState("");
  const [condition, setCondition] = useState("");
  const [meterReading, setMeterReading] = useState("");
  const [destination, setDestination] = useState<"QUARANTINE" | "IN_STOCK">("QUARANTINE");
  const [saving, setSaving] = useState(false);

  async function submit() {
    setSaving(true);
    try {
      await removeRotableEquipment(rotableId, {
        removalReason: reason || null,
        conditionAtRemoval: condition || null,
        meterReading: meterReading ? Number(meterReading) : null,
        destinationStatus: destination,
      });
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
      title={`Remover ${rotableCode} do ativo`}
      size="sm"
      footer={
        <>
          <button type="button" className="btn-outline" onClick={onClose}>Cancelar</button>
          <button type="button" className="btn-primary" disabled={saving} onClick={submit}>
            {saving ? "Removendo..." : "Remover"}
          </button>
        </>
      }
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
