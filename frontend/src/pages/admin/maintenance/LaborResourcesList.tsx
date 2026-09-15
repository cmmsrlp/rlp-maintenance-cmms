import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Search, Pencil, Trash2, Camera, X } from "lucide-react";
import {
  listLaborResources,
  createLaborResource,
  updateLaborResource,
  deleteLaborResource,
  uploadLaborResourcePhoto,
  deleteLaborResourcePhoto,
} from "../../../api/laborResources";
import { ClientFilterSelect } from "../../../components/ClientFilterSelect";
import type { LaborResource } from "../../../api/types";
import { PageHeader } from "../../../components/PageHeader";
import { DataTable } from "../../../components/DataTable";
import { StatusBadge } from "../../../components/StatusBadge";
import { EmptyState } from "../../../components/EmptyState";
import { Modal } from "../../../components/Modal";
import { ConfirmDialog } from "../../../components/ConfirmDialog";
import { iniciaisDe } from "../../../lib/pessoas";
import { TextInput, SelectInput } from "../../../components/form/Field";
import { LaborTypeInput } from "../../../components/LaborTypeInput";
import { listUsers } from "../../../api/users";
import { useToast } from "../../../components/Toast";
import { getApiErrorMessage } from "../../../api/client";
import { formatCurrency } from "../../../lib/format";
import { useCmms } from "../../../lib/cmms";
import { FORMATOS_DE_IMAGEM, problemaNaImagem } from "../../../lib/imagens";
import { numeroOpcional } from "../../../lib/zodHelpers";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

const schema = z.object({
  type: z.string().min(1, "Selecione o tipo de mão de obra."),
  name: z.string().min(2, "Informe o nome."),
  registrationNumber: z.string().optional(),
  hourlyRate: numeroOpcional(z.coerce.number().nonnegative()),
  userId: z.string().optional(),
});
type FormValues = z.infer<typeof schema>;

export default function LaborResourcesList() {
  const queryClient = useQueryClient();
  const { notify } = useToast();
  const { isClient, ownClientId, base } = useCmms();
  const [searchParams, setSearchParams] = useSearchParams();
  const clientId = isClient ? (ownClientId ?? "") : (searchParams.get("clientId") ?? "");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<LaborResource | null>(null);
  const [removendo, setRemovendo] = useState<LaborResource | null>(null);
  // Foto escolhida no formulario: so sobe depois de salvar, porque num cadastro novo o
  // recurso ainda nao tem id pra onde mandar o arquivo.
  const [fotoNova, setFotoNova] = useState<File | null>(null);
  const [tirarFoto, setTirarFoto] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["labor-resources", clientId, search, page],
    queryFn: () => listLaborResources({ clientId: clientId || undefined, search: search || undefined, page, pageSize: 15 }),
    enabled: isClient || !!clientId,
  });

  // Os acessos da propria empresa, para ligar a pessoa ao login dela.
  const { data: acessos } = useQuery({
    queryKey: ["acessos-da-empresa", clientId],
    queryFn: () => listUsers({ clientId: clientId || undefined, pageSize: 200 }),
    enabled: formOpen && (isClient || !!clientId),
  });

  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<FormValues>({
    resolver: zodResolver(schema),
  });

  // Previa da foto escolhida agora; o objeto de URL e' liberado ao trocar/fechar pra nao
  // deixar o blob preso na memoria da aba.
  const [previaLocal, setPreviaLocal] = useState<string | null>(null);
  useEffect(() => {
    if (!fotoNova) { setPreviaLocal(null); return; }
    const url = URL.createObjectURL(fotoNova);
    setPreviaLocal(url);
    return () => URL.revokeObjectURL(url);
  }, [fotoNova]);

  const fotoAtual = previaLocal ?? (tirarFoto ? null : (editing?.photoUrl ?? null));
  const nomeParaIniciais = editing?.name ?? "";

  function abrirFormulario(recurso: LaborResource | null) {
    reset({
      type: recurso?.type ?? "",
      name: recurso?.name ?? "",
      registrationNumber: recurso?.registrationNumber ?? "",
      hourlyRate: recurso?.hourlyRate ?? undefined,
      userId: recurso?.userId ?? "",
    });
    setEditing(recurso);
    setFotoNova(null);
    setTirarFoto(false);
    setFormOpen(true);
  }

  function atualizarListas() {
    queryClient.invalidateQueries({ queryKey: ["labor-resources"] });
    // O quadro do PCM mostra a mesma foto e o mesmo nome - sem isso so mudaria no proximo F5.
    queryClient.invalidateQueries({ queryKey: ["maintenance-schedule"] });
  }

  async function onSubmit(values: FormValues) {
    try {
      const payload = {
        ...values,
        hourlyRate: values.hourlyRate ?? null,
        userId: values.userId || null,
      };
      const recurso = editing
        ? await updateLaborResource(editing.id, payload)
        : await createLaborResource({ ...payload, clientId: clientId || undefined });

      if (fotoNova) await uploadLaborResourcePhoto(recurso.id, fotoNova);
      else if (tirarFoto && editing?.photoUrl) await deleteLaborResourcePhoto(recurso.id);

      notify("success", editing ? "Mão de obra atualizada." : "Mão de obra cadastrada.");
      reset();
      setFormOpen(false);
      setEditing(null);
      setFotoNova(null);
      setTirarFoto(false);
      atualizarListas();
    } catch (error) {
      notify("error", getApiErrorMessage(error));
    }
  }

  async function toggleActive(resource: LaborResource) {
    try {
      await updateLaborResource(resource.id, { active: !resource.active });
      atualizarListas();
    } catch (error) {
      notify("error", getApiErrorMessage(error));
    }
  }

  async function confirmarRemocao() {
    if (!removendo) return;
    try {
      await deleteLaborResource(removendo.id);
      notify("success", "Mão de obra removida.");
      setRemovendo(null);
      atualizarListas();
    } catch (error) {
      notify("error", getApiErrorMessage(error));
    }
  }

  return (
    <div>
      <PageHeader
        title="Mão de obra"
        description="Técnicos, engenheiros e outros recursos que executam as OS - com valor/hora pra apurar custo de manutenção por ativo"
        breadcrumbs={[{ label: "RLP Maintenance CMMS", to: base }, { label: "Mão de obra" }]}
        actions={
          (isClient || clientId) && (
            <button className="btn-primary" onClick={() => abrirFormulario(null)}>
              <Plus className="h-4 w-4" /> Nova mão de obra
            </button>
          )
        }
      />

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
        {(isClient || clientId) && (
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-graphite-400" />
            <input
              className="input pl-9"
              placeholder="Buscar por nome, tipo ou registro..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            />
          </div>
        )}
      </div>

      {!isClient && !clientId ? (
        <EmptyState title="Selecione um cliente" description="A mão de obra é própria de cada empresa - escolha uma acima para ver os recursos dela." />
      ) : (
        <DataTable
          loading={isLoading}
          rows={data?.items ?? []}
          keyField={(r) => r.id}
          pagination={data}
          onPageChange={setPage}
          emptyTitle="Nenhuma mão de obra cadastrada"
          columns={[
            {
              header: "Nome",
              accessor: (r) => (
                <button className="flex items-center gap-2.5 text-left" onClick={() => abrirFormulario(r)} title="Abrir ficha">
                  {r.photoUrl ? (
                    <img src={r.photoUrl} alt="" className="h-9 w-9 rounded-full border border-gray-200 object-cover" />
                  ) : (
                    <span className="flex h-9 w-9 items-center justify-center rounded-full bg-navy-100 text-xs font-semibold text-navy-700">
                      {iniciaisDe(r.name)}
                    </span>
                  )}
                  <span className="font-medium text-navy-900">{r.name}</span>
                </button>
              ),
            },
            { header: "Tipo", accessor: (r) => r.type },
            { header: "DRT", accessor: (r) => r.registrationNumber ?? "-" },
            {
              header: "Acesso",
              accessor: (r) =>
                r.user ? (
                  <span className="text-xs text-graphite-600">{r.user.email}</span>
                ) : (
                  <span className="text-xs text-graphite-400">não entra no sistema</span>
                ),
            },
            { header: "Valor/hora", accessor: (r) => (r.hourlyRate != null ? formatCurrency(r.hourlyRate) : "-") },
            {
              header: "Status",
              accessor: (r) => (
                <button onClick={() => toggleActive(r)} className="cursor-pointer">
                  <StatusBadge status={r.active ? "ACTIVE" : "INACTIVE"} />
                </button>
              ),
            },
            {
              header: "",
              accessor: (r) => (
                <div className="flex items-center gap-2">
                  <button onClick={() => abrirFormulario(r)} className="text-graphite-400 hover:text-navy-700" aria-label="Editar">
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button onClick={() => setRemovendo(r)} className="text-graphite-400 hover:text-safety-red" aria-label="Remover">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ),
            },
          ]}
        />
      )}

      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editing ? "Editar mão de obra" : "Nova mão de obra"}
        size="sm"
        footer={
          <>
            <button type="button" className="btn-outline" onClick={() => setFormOpen(false)}>Cancelar</button>
            <button type="submit" form="labor-resource-form" className="btn-primary" disabled={isSubmitting}>
              {isSubmitting ? "Salvando..." : "Salvar"}
            </button>
          </>
        }
      >
        <form id="labor-resource-form" onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
          {/* A foto vem primeiro porque e' o que identifica a pessoa no quadro do PCM -
              antes ela so existia num clique escondido na miniatura da listagem. */}
          <div className="flex items-center gap-4">
            {fotoAtual ? (
              <img src={fotoAtual} alt="" className="h-16 w-16 rounded-full border border-gray-200 object-cover" />
            ) : (
              <span className="flex h-16 w-16 items-center justify-center rounded-full bg-navy-100 text-lg font-semibold text-navy-700">
                {iniciaisDe(nomeParaIniciais) || <Camera className="h-6 w-6 text-navy-400" />}
              </span>
            )}
            <div>
              <label className="btn-outline inline-flex cursor-pointer items-center gap-2 text-sm">
                <Camera className="h-4 w-4" /> {fotoAtual ? "Trocar foto" : "Adicionar foto"}
                <input
                  type="file"
                  accept={FORMATOS_DE_IMAGEM.join(",")}
                  className="hidden"
                  onChange={(e) => {
                    const arquivo = e.target.files?.[0];
                    e.target.value = "";
                    if (!arquivo) return;
                    const problema = problemaNaImagem(arquivo);
                    if (problema) return notify("error", problema);
                    setFotoNova(arquivo);
                    setTirarFoto(false);
                  }}
                />
              </label>
              {fotoAtual && (
                <button
                  type="button"
                  className="ml-2 inline-flex items-center gap-1 text-sm text-graphite-500 hover:text-safety-red"
                  onClick={() => { setFotoNova(null); setTirarFoto(true); }}
                >
                  <X className="h-3.5 w-3.5" /> Remover
                </button>
              )}
              <p className="mt-1 text-xs text-graphite-500">Aparece em miniatura na programação do PCM.</p>
            </div>
          </div>

          <TextInput label="Nome" required placeholder="Ex.: João Silva" error={errors.name?.message} {...register("name")} />
          <LaborTypeInput required currentValue={editing?.type} error={errors.type?.message} {...register("type")} />
          <div className="grid gap-4 sm:grid-cols-2">
            <TextInput label="DRT (opcional)" hint="Registro profissional (CREA, CFT, DRT...), quando aplicável." {...register("registrationNumber")} />
            <TextInput label="Valor/hora (opcional)" type="number" step="any" {...register("hourlyRate")} />
          </div>
          {/* Sem esta ligacao o proprio mantenedor nao consegue assumir uma OS: o sistema
              nao sabe que aquele login e' esta pessoa da equipe. */}
          <SelectInput
            label="Acesso no sistema (opcional)"
            placeholder="Sem acesso - só aparece na programação"
            hint="Ligue quando esta pessoa entra no sistema. É o que permite ela assumir OS sozinha."
            options={(acessos?.items ?? [])
              .filter((u) => u.active)
              .map((u) => ({ value: u.id, label: `${u.name} - ${u.email}` }))}
            {...register("userId")}
          />

          <p className="text-xs text-graphite-500">
            A função vem do catálogo em{" "}
            <Link to={`${base}/tipos-mao-de-obra`} className="text-navy-700 underline">Tipos de mão de obra</Link>.
          </p>
        </form>
      </Modal>

      <ConfirmDialog
        open={!!removendo}
        title="Remover mão de obra"
        description={`"${removendo?.name ?? ""}" sai da lista e deixa de aparecer na programação. O histórico de OS já executadas por essa pessoa não é apagado.`}
        confirmLabel="Remover"
        danger
        onConfirm={confirmarRemocao}
        onCancel={() => setRemovendo(null)}
      />
    </div>
  );
}
