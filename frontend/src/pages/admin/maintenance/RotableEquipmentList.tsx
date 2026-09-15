import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Search, Upload, Download, Boxes, Wrench, CheckCircle2, type LucideIcon } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { listRotableEquipment, createRotableEquipment, getNextRotableCode, exportarRotable, getRotableSummary } from "../../../api/rotableEquipment";
import type { RotableEquipmentStatus } from "../../../api/types";
import { ClientFilterSelect } from "../../../components/ClientFilterSelect";
import { PageHeader } from "../../../components/PageHeader";
import { DataTable } from "../../../components/DataTable";
import { StatusBadge } from "../../../components/StatusBadge";
import { Modal } from "../../../components/Modal";
import { RotableImportModal } from "../../../components/RotableImportModal";
import { TextInput, SelectInput } from "../../../components/form/Field";
import { RotableTypeInput } from "../../../components/RotableTypeInput";
import { useToast } from "../../../components/Toast";
import { getApiErrorMessage } from "../../../api/client";
import { useCmms } from "../../../lib/cmms";
import { numeroOpcional } from "../../../lib/zodHelpers";
import { camposDoTipo } from "../../../lib/camposPorTipoDeAtivo";
import { rotuloDeStatusRotable } from "../../../lib/rotableStatus";
import { formatCurrency } from "../../../lib/format";

const schema = z.object({
  code: z.string().min(1, "Informe o código do equipamento."),
  type: z.string().min(1, "Informe o tipo."),
  manufacturer: z.string().optional(),
  model: z.string().optional(),
  serialNumber: z.string().optional(),
  acquisitionCost: numeroOpcional(z.coerce.number().nonnegative()),
  weightKg: numeroOpcional(z.coerce.number().nonnegative()),
  notes: z.string().optional(),
  specificAttributes: z.record(z.string(), z.string()).optional(),
});
type FormValues = z.infer<typeof schema>;

const OPCOES_DE_STATUS = [
  { value: "IN_STOCK", label: "Em estoque" },
  { value: "INSTALLED", label: "Instalado" },
  { value: "QUARANTINE", label: "Quarentena" },
  { value: "IN_RECONDITIONING", label: "Em reparo" },
  { value: "SCRAPPED", label: "Sucateado" },
];

/**
 * Catalogo de equipamentos recondicionaveis (motor, redutor, rolo...) - a unidade fisica
 * em si, separada do Ativo/local onde esta instalada agora. Mesmo raciocinio do
 * almoxarifado (SparePartsList), so' que aqui cada linha e' uma peca serializada com
 * identidade e historico proprios, nao um item de estoque generico.
 */
export default function RotableEquipmentList() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { notify } = useToast();
  const { base, isClient, ownClientId } = useCmms();
  const [searchParams, setSearchParams] = useSearchParams();
  const clientId = isClient ? (ownClientId ?? "") : (searchParams.get("clientId") ?? "");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<RotableEquipmentStatus | "">("");
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [exportando, setExportando] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["rotable-equipment", clientId, search, status, page],
    queryFn: () => listRotableEquipment({ clientId, search: search || undefined, status: status || undefined, page, pageSize: 15 }),
    enabled: !!clientId,
  });

  const { data: resumo } = useQuery({
    queryKey: ["rotable-equipment-resumo", clientId],
    queryFn: () => getRotableSummary(clientId),
    enabled: !!clientId,
  });

  /** Clicar de novo no indicador ja ativo limpa o filtro - senao a unica forma de "ver
   * tudo" de novo seria mexer no select. */
  function alternarStatus(valor: RotableEquipmentStatus) {
    setStatus((atual) => (atual === valor ? "" : valor));
    setPage(1);
  }

  const { register, handleSubmit, reset, watch, setValue, formState: { errors, isSubmitting, dirtyFields } } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const tipoEscolhido = watch("type");
  const camposEspecificos = camposDoTipo(tipoEscolhido);

  // Sugere o proximo codigo (ex.: "MOT-004") ao escolher um tipo com prefixo cadastrado -
  // so enquanto a pessoa nao tiver digitado um codigo na mao, pra nao sobrescrever o que
  // ela ja escreveu.
  useEffect(() => {
    if (!tipoEscolhido || !clientId || dirtyFields.code) return;
    let cancelado = false;
    getNextRotableCode({ type: tipoEscolhido, clientId }).then(({ code }) => {
      if (!cancelado && code && !dirtyFields.code) setValue("code", code);
    }).catch(() => {});
    return () => { cancelado = true; };
  }, [tipoEscolhido, clientId, dirtyFields.code, setValue]);

  async function onSubmit(values: FormValues) {
    try {
      const attrsPreenchidos = Object.fromEntries(
        Object.entries(values.specificAttributes ?? {}).filter(([, v]) => v?.trim()),
      );
      const created = await createRotableEquipment({
        ...values,
        clientId,
        specificAttributes: Object.keys(attrsPreenchidos).length > 0 ? attrsPreenchidos : null,
      });
      notify("success", `Equipamento ${created.code} cadastrado.`);
      reset();
      setCreateOpen(false);
      queryClient.invalidateQueries({ queryKey: ["rotable-equipment"] });
      queryClient.invalidateQueries({ queryKey: ["rotable-equipment-resumo"] });
      navigate(`${base}/equipamentos-recondicionaveis/${created.id}`);
    } catch (error) {
      notify("error", getApiErrorMessage(error));
    }
  }

  async function exportar() {
    setExportando(true);
    try {
      const blob = await exportarRotable(clientId, status || undefined);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const sufixo = status ? `-${OPCOES_DE_STATUS.find((o) => o.value === status)?.label.toLowerCase().replace(/\s+/g, "-")}` : "";
      a.download = `equipamentos-recondicionaveis${sufixo}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      notify("error", getApiErrorMessage(error));
    } finally {
      setExportando(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Equipamentos recondicionaveis"
        description="Motor, redutor, rolo... unidades físicas que se movem entre ativos, o estoque e o reparo - separadas do local onde estão instaladas agora"
        breadcrumbs={[{ label: "RLP Maintenance CMMS", to: base }, { label: "Equipamentos recondicionaveis" }]}
        actions={
          clientId && (
            <>
              <button
                className="btn-outline"
                onClick={exportar}
                disabled={exportando}
                title={status ? `Exporta só os equipamentos com status "${OPCOES_DE_STATUS.find((o) => o.value === status)?.label}"` : "Exporta todos os equipamentos"}
              >
                <Upload className="h-4 w-4" />
                {exportando ? "Exportando..." : status ? `Exportar (${OPCOES_DE_STATUS.find((o) => o.value === status)?.label})` : "Exportar"}
              </button>
              <button className="btn-outline" onClick={() => setImportOpen(true)}>
                <Download className="h-4 w-4" /> Importar
              </button>
              <button className="btn-primary" onClick={() => setCreateOpen(true)}>
                <Plus className="h-4 w-4" /> Novo equipamento
              </button>
            </>
          )
        }
      />

      {clientId && (
        <div className="mb-4 grid gap-4 sm:grid-cols-3">
          <IndicadorDeStatus
            label="Em estoque"
            value={resumo?.porStatus.IN_STOCK ?? 0}
            icon={Boxes}
            tone="navy"
            ativo={status === "IN_STOCK"}
            onClick={() => alternarStatus("IN_STOCK")}
          />
          <IndicadorDeStatus
            label="Instalados"
            value={resumo?.porStatus.INSTALLED ?? 0}
            icon={CheckCircle2}
            tone="green"
            ativo={status === "INSTALLED"}
            onClick={() => alternarStatus("INSTALLED")}
          />
          <IndicadorDeStatus
            label="Em reparo"
            value={resumo?.porStatus.IN_RECONDITIONING ?? 0}
            hint={resumo?.custoPorStatus.IN_RECONDITIONING ? `${formatCurrency(resumo.custoPorStatus.IN_RECONDITIONING)} em equipamentos` : undefined}
            icon={Wrench}
            tone="yellow"
            ativo={status === "IN_RECONDITIONING"}
            onClick={() => alternarStatus("IN_RECONDITIONING")}
          />
        </div>
      )}

      <div className="mb-4 flex flex-col gap-3 sm:flex-row">
        {!isClient && (
          <ClientFilterSelect
            className="sm:w-72"
            value={clientId}
            onChange={(id) => setSearchParams(id ? { clientId: id } : {})}
            service="CMMS_MAINTENANCE"
            allLabel="Selecione o cliente"
          />
        )}
        {clientId && (
          <>
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-graphite-400" />
              <input
                className="input pl-9"
                placeholder="Buscar por código, número de série, fabricante..."
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              />
            </div>
            <select className="input sm:w-56" value={status} onChange={(e) => { setStatus(e.target.value as RotableEquipmentStatus | ""); setPage(1); }}>
              <option value="">Todos os status</option>
              {OPCOES_DE_STATUS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </>
        )}
      </div>

      {!clientId ? (
        <p className="text-sm text-graphite-500">Selecione um cliente para ver os equipamentos recondicionaveis dele.</p>
      ) : (
        <DataTable
          loading={isLoading}
          rows={data?.items ?? []}
          keyField={(r) => r.id}
          pagination={data}
          onPageChange={setPage}
          emptyTitle="Nenhum equipamento cadastrado"
          emptyDescription="Cadastre motores, redutores e outras peças recondicionáveis para vincular aos ativos."
          columns={[
            {
              header: "Equipamento",
              accessor: (r) => (
                <Link to={`${base}/equipamentos-recondicionaveis/${r.id}`} className="flex items-center gap-2 font-medium text-navy-900 hover:underline">
                  {r.photoUrl && <img src={r.photoUrl} alt="" className="h-9 w-9 shrink-0 rounded-md border border-gray-200 object-cover" />}
                  {r.code}
                </Link>
              ),
            },
            { header: "Tipo", accessor: (r) => r.type },
            { header: "Fabricante / modelo", accessor: (r) => [r.manufacturer, r.model].filter(Boolean).join(" - ") || "-" },
            { header: "Número de série", accessor: (r) => r.serialNumber ?? "-" },
            { header: "Status", accessor: (r) => <StatusBadge status={r.status} label={rotuloDeStatusRotable(r)} /> },
            {
              header: "Instalado em",
              accessor: (r) =>
                r.currentInstrument ? (
                  <span className="text-graphite-700">{r.currentInstrument.tag ?? r.currentInstrument.description}</span>
                ) : (
                  <span className="text-graphite-400">-</span>
                ),
            },
          ]}
        />
      )}

      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Novo equipamento recondicionável"
        size="md"
        footer={
          <>
            <button type="button" className="btn-outline" onClick={() => setCreateOpen(false)}>Cancelar</button>
            <button type="submit" form="rotable-form" className="btn-primary" disabled={isSubmitting}>
              {isSubmitting ? "Salvando..." : "Salvar"}
            </button>
          </>
        }
      >
        <form id="rotable-form" onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
          <div className="grid gap-4 sm:grid-cols-2">
            <RotableTypeInput label="Tipo" required clientId={clientId} error={errors.type?.message} {...register("type")} />
            <TextInput
              label="Código"
              required
              placeholder="Ex.: MOT-ROT-014"
              hint={tipoEscolhido ? "Sugerido a partir do prefixo do tipo - pode editar." : undefined}
              error={errors.code?.message}
              {...register("code")}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <TextInput label="Fabricante" placeholder="Opcional" {...register("manufacturer")} />
            <TextInput label="Modelo" placeholder="Opcional" {...register("model")} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <TextInput label="Número de série" placeholder="Opcional" {...register("serialNumber")} />
            <TextInput label="Custo de aquisição (opcional)" type="number" step="any" {...register("acquisitionCost")} />
          </div>
          <TextInput
            label="Peso (opcional)"
            type="number"
            step="any"
            hint="Usado na ficha de envio, para calcular o frete."
            {...register("weightKg")}
          />
          <TextInput label="Observações (opcional)" {...register("notes")} />

          {camposEspecificos.length > 0 && (
            <div className="rounded-lg border border-gray-200 p-4">
              <p className="text-sm font-medium text-graphite-700">Ficha tecnica de {tipoEscolhido}</p>
              <p className="mt-0.5 text-xs text-graphite-500">Campos próprios deste tipo de equipamento - todos opcionais.</p>
              <div className="mt-3 grid gap-4 sm:grid-cols-2">
                {camposEspecificos.map((campo) =>
                  campo.tipo === "select" ? (
                    <SelectInput
                      key={campo.chave}
                      label={campo.rotulo}
                      options={(campo.opcoes ?? []).map((o) => ({ value: o, label: o }))}
                      {...register(`specificAttributes.${campo.chave}` as "specificAttributes.string")}
                    />
                  ) : (
                    <TextInput
                      key={campo.chave}
                      label={campo.rotulo}
                      placeholder={campo.placeholder}
                      {...register(`specificAttributes.${campo.chave}` as "specificAttributes.string")}
                    />
                  ),
                )}
              </div>
            </div>
          )}

          <p className="text-xs text-graphite-500">O equipamento nasce em estoque - instale num ativo na própria ficha dele, depois de salvar.</p>
        </form>
      </Modal>

      <RotableImportModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        clientId={clientId}
        onImported={() => {
          queryClient.invalidateQueries({ queryKey: ["rotable-equipment"] });
          queryClient.invalidateQueries({ queryKey: ["rotable-equipment-resumo"] });
        }}
      />
    </div>
  );
}

function IndicadorDeStatus({
  label,
  value,
  hint,
  icon: Icon,
  tone,
  ativo,
  onClick,
}: {
  label: string;
  value: number;
  /** Linha extra abaixo do rotulo - usada pro custo total em "Em reparo", pra saber o
   * valor que esta fora sem precisar abrir cada equipamento. */
  hint?: string;
  icon: LucideIcon;
  tone: "navy" | "green" | "yellow";
  ativo: boolean;
  onClick: () => void;
}) {
  const TONE_CLASSES: Record<typeof tone, string> = {
    navy: "bg-navy-50 text-navy-700",
    green: "bg-green-50 text-safety-green-dark",
    yellow: "bg-amber-50 text-safety-yellow-dark",
  };
  return (
    <button
      type="button"
      onClick={onClick}
      className={`card flex items-center gap-4 p-5 text-left transition-shadow hover:shadow-md ${
        ativo ? "ring-2 ring-navy-500" : ""
      }`}
    >
      <div className={`rounded-lg p-3 ${TONE_CLASSES[tone]}`}>
        <Icon className="h-6 w-6" aria-hidden="true" />
      </div>
      <div>
        <p className="text-2xl font-bold text-navy-900">{value}</p>
        <p className="text-sm text-graphite-500">{label}{ativo && " - filtrado"}</p>
        {hint && <p className="mt-0.5 text-xs text-graphite-400">{hint}</p>}
      </div>
    </button>
  );
}
