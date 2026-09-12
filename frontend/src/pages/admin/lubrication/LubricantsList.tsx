import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Plus, AlertTriangle } from "lucide-react";
import { PageHeader } from "../../../components/PageHeader";
import { DataTable } from "../../../components/DataTable";
import { EmptyState } from "../../../components/EmptyState";
import { Modal } from "../../../components/Modal";
import { TextInput, SelectInput } from "../../../components/form/Field";
import { useToast } from "../../../components/Toast";
import { getApiErrorMessage } from "../../../api/client";
import { ClientFilterSelect } from "../../../components/ClientFilterSelect";
import { listSpareParts } from "../../../api/spareParts";
import { listLubricants, createLubricant } from "../../../api/lubrication";
import type { Lubricant } from "../../../api/types";
import { useCmms } from "../../../lib/cmms";
import { TIPOS_DE_LUBRIFICANTE, BASES_DE_LUBRIFICANTE } from "../../../lib/lubricationLabels";

const schema = z.object({
  sparePartId: z.string().uuid("Selecione a peca do almoxarifado."),
  type: z.enum(["GREASE", "OIL", "OTHER"]),
  specification: z.string().optional(),
  base: z.enum(["MINERAL", "SYNTHETIC", "SEMI_SYNTHETIC"]).optional().or(z.literal("")),
  manufacturer: z.string().optional(),
  application: z.string().optional(),
});
type FormValues = z.infer<typeof schema>;

/** Lubrificantes = pecas do almoxarifado com ficha tecnica. O saldo e o custo continuam
 * sendo os da peca: aqui nao existe um segundo estoque. */
export default function LubricantsList() {
  const queryClient = useQueryClient();
  const { notify } = useToast();
  const { isClient, ownClientId, base } = useCmms();
  const [searchParams, setSearchParams] = useSearchParams();
  const clientId = isClient ? ownClientId ?? "" : searchParams.get("clientId") ?? "";
  const [createOpen, setCreateOpen] = useState(false);

  const { data: lubricants, isLoading } = useQuery({
    queryKey: ["lubrificantes", clientId],
    queryFn: () => listLubricants({ clientId }),
    enabled: !!clientId,
  });

  // Só as peças que ainda não viraram lubrificante - evita o erro depois de preencher tudo.
  const { data: spareParts } = useQuery({
    queryKey: ["spare-parts-para-lubrificante", clientId],
    queryFn: () => listSpareParts({ clientId, pageSize: 300 }),
    enabled: !!clientId && createOpen,
  });
  const jaCadastradas = new Set((lubricants ?? []).map((l) => l.sparePartId));
  const disponiveis = (spareParts?.items ?? []).filter((p) => !jaCadastradas.has(p.id));

  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { type: "GREASE" },
  });

  async function onSubmit(values: FormValues) {
    try {
      await createLubricant({
        ...values,
        clientId,
        base: values.base || null,
        specification: values.specification || null,
        manufacturer: values.manufacturer || null,
        application: values.application || null,
      });
      notify("success", "Lubrificante cadastrado.");
      reset({ type: "GREASE" });
      setCreateOpen(false);
      queryClient.invalidateQueries({ queryKey: ["lubrificantes"] });
    } catch (error) {
      notify("error", getApiErrorMessage(error));
    }
  }

  return (
    <div>
      <PageHeader
        title="Lubrificantes"
        description="Ficha tecnica das graxas e oleos - o saldo e o custo vem do almoxarifado"
        breadcrumbs={[
          { label: "RLP Maintenance CMMS", to: base },
          { label: "Lubrificacao", to: `${base}/lubrificacao` },
          { label: "Lubrificantes" },
        ]}
        actions={
          <button className="btn-primary" onClick={() => setCreateOpen(true)} disabled={!clientId}>
            <Plus className="h-4 w-4" /> Novo lubrificante
          </button>
        }
      />

      {!isClient && (
        <div className="mb-6">
          <ClientFilterSelect
            className="sm:w-72"
            value={clientId}
            onChange={(id) => setSearchParams(id ? { clientId: id } : {})}
            service="CMMS_MAINTENANCE"
            allLabel="Selecione o cliente"
          />
        </div>
      )}

      {!clientId ? (
        <EmptyState title="Selecione o cliente" description="Os lubrificantes sao do almoxarifado de cada empresa." />
      ) : (
        <DataTable<Lubricant>
          rows={lubricants ?? []}
          loading={isLoading}
          keyField={(l) => l.id}
          emptyTitle="Nenhum lubrificante cadastrado"
          columns={[
            {
              header: "Lubrificante",
              accessor: (l) => (
                <div>
                  <p className="font-medium text-navy-900">{l.sparePart.name}</p>
                  <p className="text-xs text-graphite-400">
                    {[l.sparePart.code, l.specification, l.manufacturer].filter(Boolean).join(" - ") || "sem especificacao"}
                  </p>
                </div>
              ),
            },
            { header: "Tipo", accessor: (l) => TIPOS_DE_LUBRIFICANTE[l.type] },
            { header: "Base", accessor: (l) => (l.base ? BASES_DE_LUBRIFICANTE[l.base] : "-") },
            { header: "Aplicacao", accessor: (l) => l.application ?? "-" },
            {
              header: "Saldo",
              accessor: (l) => (
                <span className={l.sparePart.stockQty <= l.sparePart.minStock ? "font-medium text-safety-red" : ""}>
                  {l.sparePart.stockQty <= l.sparePart.minStock && <AlertTriangle className="mr-1 inline h-3.5 w-3.5" />}
                  {l.sparePart.stockQty} {l.sparePart.unit}
                </span>
              ),
            },
          ]}
        />
      )}

      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Novo lubrificante"
        footer={
          <>
            <button type="button" className="btn-outline" onClick={() => setCreateOpen(false)}>Cancelar</button>
            <button type="submit" form="lubricant-form" className="btn-primary" disabled={isSubmitting}>
              {isSubmitting ? "Salvando..." : "Salvar"}
            </button>
          </>
        }
      >
        <form id="lubricant-form" onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
          <SelectInput
            label="Peca do almoxarifado"
            required
            hint="O lubrificante e' uma peca do estoque - o saldo e o custo ficam la."
            placeholder={disponiveis.length ? "Selecione a peca" : "Nenhuma peca disponivel"}
            options={disponiveis.map((p) => ({ value: p.id, label: `${p.name} (${p.stockQty} ${p.unit})` }))}
            error={errors.sparePartId?.message}
            {...register("sparePartId")}
          />
          {disponiveis.length === 0 && (
            <p className="text-xs text-graphite-500">
              Cadastre a graxa ou o oleo no Almoxarifado primeiro; aqui ele ganha a ficha tecnica.
            </p>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <SelectInput
              label="Tipo"
              required
              options={Object.entries(TIPOS_DE_LUBRIFICANTE).map(([valor, rotulo]) => ({ value: valor, label: rotulo }))}
              {...register("type")}
            />
            <SelectInput
              label="Base"
              placeholder="Nao informada"
              options={Object.entries(BASES_DE_LUBRIFICANTE).map(([valor, rotulo]) => ({ value: valor, label: rotulo }))}
              {...register("base")}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <TextInput label="Especificacao" placeholder="Ex.: NLGI 2, ISO VG 220" {...register("specification")} />
            <TextInput label="Fabricante" {...register("manufacturer")} />
          </div>
          <TextInput label="Aplicacao" placeholder="Ex.: mancais de rolamento ate 120 C" {...register("application")} />
        </form>
      </Modal>
    </div>
  );
}
