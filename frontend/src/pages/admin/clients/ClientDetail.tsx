import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Trash2, Gauge, ShieldCheck, ClipboardList, KeyRound, UserPlus } from "lucide-react";
import { deleteClient, getClient } from "../../../api/clients";
import { listMaintenancePlans } from "../../../api/maintenancePlans";
import { listMaintenanceWorkOrders } from "../../../api/maintenanceWorkOrders";
import { PageHeader } from "../../../components/PageHeader";
import { FullPageSpinner } from "../../../components/Spinner";
import { StatusBadge } from "../../../components/StatusBadge";
import { ClientFormModal } from "./ClientFormModal";
import { ClientContactsCard } from "./ClientContactsCard";
import { ClientPortalAccessModal } from "./ClientPortalAccessModal";
import { ConfirmDialog } from "../../../components/ConfirmDialog";
import { useAuth } from "../../../auth/AuthContext";
import { useToast } from "../../../components/Toast";
import { getApiErrorMessage } from "../../../api/client";
import { formatServiceCategory, formatDateTime } from "../../../lib/format";

export default function ClientDetail() {
  const { id = "" } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { notify } = useToast();
  const canManage = user?.role === "ADMIN" || user?.role === "COMMERCIAL";

  const [editOpen, setEditOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [portalAccessOpen, setPortalAccessOpen] = useState(false);

  const { data: client, isLoading } = useQuery({ queryKey: ["client", id], queryFn: () => getClient(id) });
  // Indicadores reais de manutencao - substituem os antigos links de Ordens de
  // servico/Contratos/Certificados, que apontavam pra rotas que nao existem mais desde
  // que o CMMS virou produto proprio (o backend nem manda mais essas contagens).
  const { data: plansPage } = useQuery({
    queryKey: ["client-plans-count", id],
    queryFn: () => listMaintenancePlans({ clientId: id, pageSize: 1 }),
    enabled: !!id,
  });
  const { data: workOrdersPage } = useQuery({
    queryKey: ["client-work-orders-count", id],
    queryFn: () => listMaintenanceWorkOrders({ clientId: id, pageSize: 1 }),
    enabled: !!id,
  });

  async function handleDelete() {
    setDeleting(true);
    try {
      await deleteClient(id);
      notify("success", "Cliente removido.");
      navigate("/gestao/clientes");
    } catch (error) {
      notify("error", getApiErrorMessage(error));
    } finally {
      setDeleting(false);
    }
  }

  if (isLoading || !client) return <FullPageSpinner />;

  return (
    <div>
      <PageHeader
        title={client.tradeName || client.companyName}
        description={client.companyName}
        breadcrumbs={[{ label: "Clientes", to: "/gestao/clientes" }, { label: client.tradeName || client.companyName }]}
        actions={
          canManage && (
            <>
              <button className="btn-outline" onClick={() => setEditOpen(true)}>
                <Pencil className="h-4 w-4" /> Editar
              </button>
              <button className="btn-danger" onClick={() => setConfirmDelete(true)}>
                <Trash2 className="h-4 w-4" /> Remover
              </button>
            </>
          )
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="card space-y-4 p-5 lg:col-span-2">
          <div className="flex items-center gap-2">
            <StatusBadge status={client.status} />
            {client.cnpj && <span className="text-sm text-graphite-500">CNPJ {client.cnpj}</span>}
          </div>
          <dl className="grid gap-4 sm:grid-cols-2">
            <Info label="Endereço" value={[client.addressStreet, client.addressNumber, client.addressDistrict].filter(Boolean).join(", ") || "-"} />
            <Info label="Cidade/UF" value={[client.addressCity, client.addressState].filter(Boolean).join("/") || "-"} />
            <Info label="Telefone" value={client.phone ?? "-"} />
            <Info label="WhatsApp" value={client.whatsapp ?? "-"} />
            <Info label="E-mail" value={client.email ?? "-"} />
            <Info label="Inscrição estadual" value={client.stateRegistration ?? "-"} />
            <Info label="Responsável técnico" value={client.technicalContactName ?? "-"} />
            <Info label="Responsável comercial" value={client.commercialContactName ?? "-"} />
          </dl>
          <div>
            <p className="text-xs uppercase tracking-wide text-graphite-400">Serviços contratados</p>
            {client.contractedServices && client.contractedServices.length > 0 ? (
              <ul className="mt-2 flex flex-wrap gap-2">
                {client.contractedServices.map((s) => (
                  <li
                    key={s}
                    className="rounded-full border border-navy-200 bg-navy-50 px-2.5 py-1 text-xs font-medium text-navy-700"
                  >
                    {formatServiceCategory(s)}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-1 text-sm text-graphite-500">Nenhum serviço marcado.</p>
            )}
          </div>

          {client.notes && (
            <div>
              <p className="text-xs uppercase tracking-wide text-graphite-400">Observações</p>
              <p className="mt-1 text-sm text-graphite-700">{client.notes}</p>
            </div>
          )}
        </div>

        <div className="space-y-6">
          <div className="card p-5">
            <h2 className="mb-3 font-semibold text-navy-900">Plano</h2>
            {!client.plan ? (
              <p className="text-sm text-graphite-500">Sem plano atribuído - sem limite de usuários ou ativos.</p>
            ) : (
              <div className="space-y-2">
                <p className="text-sm font-medium text-navy-900">{client.plan.name}</p>
                {client.planUsage && (
                  <>
                    <UsageBar label="Usuários" usage={client.planUsage.users} />
                    <UsageBar label="Ativos" usage={client.planUsage.instruments} />
                  </>
                )}
              </div>
            )}
          </div>

          <div className="card p-5">
            <h2 className="mb-3 font-semibold text-navy-900">Resumo</h2>
            <div className="space-y-2 text-sm">
              <SummaryRow icon={Gauge} label="Ativos" value={client._count?.instruments ?? 0} to={`/gestao/ativos?clientId=${id}`} />
              <SummaryRow icon={ShieldCheck} label="Planos preventivos" value={plansPage?.total ?? 0} to={`/gestao/manutencao/planos?clientId=${id}`} />
              <SummaryRow icon={ClipboardList} label="Ordens de manutenção" value={workOrdersPage?.total ?? 0} to={`/gestao/manutencao/ordens?clientId=${id}`} />
            </div>
          </div>

          <div className={`card p-5 ${(client.users?.length ?? 0) === 0 ? "border-2 border-safety-yellow bg-yellow-50/40" : ""}`}>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-semibold text-navy-900">Portal do cliente</h2>
              {canManage && (
                <button className="btn-primary btn-sm" onClick={() => setPortalAccessOpen(true)}>
                  <UserPlus className="h-4 w-4" /> {(client.users?.length ?? 0) === 0 ? "Liberar acesso" : "Adicionar acesso"}
                </button>
              )}
            </div>
            {!client.users || client.users.length === 0 ? (
              <p className="text-sm text-graphite-600">
                Esta empresa ainda não tem login no portal. Libere o acesso para que ela veja, pela área dos serviços
                contratados, seus ativos, planos preventivos e ordens de manutenção.
              </p>
            ) : (
              <ul className="divide-y divide-gray-100">
                {client.users.map((u) => (
                  <li key={u.id} className="flex items-center justify-between gap-2 py-2.5 text-sm">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-graphite-800">{u.name}</p>
                      <p className="truncate text-xs text-graphite-400">{u.email}</p>
                      <p className="truncate text-xs text-graphite-400">
                        {u.lastLoginAt ? `Último acesso: ${formatDateTime(u.lastLoginAt)}` : "Nunca acessou"}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <StatusBadge status={u.active ? "ACTIVE" : "INACTIVE"} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {client.contractedServices.length === 0 && (
              <p className="mt-3 flex items-center gap-1.5 text-xs text-amber-700">
                <KeyRound className="h-3.5 w-3.5 shrink-0" /> Nenhum serviço contratado marcado: o portal ficará vazio
                até você marcar ao menos um em "Editar".
              </p>
            )}
          </div>

          <ClientContactsCard clientId={id} contacts={client.contacts ?? []} canManage={!!canManage} />
        </div>
      </div>

      <ClientPortalAccessModal
        open={portalAccessOpen}
        onClose={() => setPortalAccessOpen(false)}
        client={client}
        onCreated={() => {
          setPortalAccessOpen(false);
          queryClient.invalidateQueries({ queryKey: ["client", id] });
        }}
      />

      <ClientFormModal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        client={client}
        onSaved={() => {
          setEditOpen(false);
          queryClient.invalidateQueries({ queryKey: ["client", id] });
          queryClient.invalidateQueries({ queryKey: ["clients"] });
        }}
      />

      <ConfirmDialog
        open={confirmDelete}
        title="Remover cliente"
        description={`Tem certeza que deseja remover ${client.companyName}? O histórico será preservado, mas o cliente deixará de aparecer nas listagens.`}
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

function UsageBar({ label, usage }: { label: string; usage: { current: number; limit: number | null } }) {
  if (usage.limit == null) {
    return (
      <p className="text-xs text-graphite-500">
        {label}: {usage.current} (sem limite)
      </p>
    );
  }
  const pct = Math.min(100, Math.round((usage.current / usage.limit) * 100));
  const atLimit = usage.current >= usage.limit;
  return (
    <div>
      <div className="flex items-center justify-between text-xs">
        <span className="text-graphite-500">{label}</span>
        <span className={`font-medium ${atLimit ? "text-safety-red" : "text-graphite-700"}`}>
          {usage.current}/{usage.limit}
        </span>
      </div>
      <div className="mt-1 h-1.5 rounded-full bg-gray-100">
        <div className={`h-1.5 rounded-full ${atLimit ? "bg-safety-red" : "bg-navy-500"}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function SummaryRow({ icon: Icon, label, value, to }: { icon: typeof Gauge; label: string; value: number; to: string }) {
  const navigate = useNavigate();
  return (
    <button
      type="button"
      onClick={() => navigate(to)}
      className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left hover:bg-navy-50"
    >
      <span className="flex items-center gap-2 text-graphite-600">
        <Icon className="h-4 w-4 text-navy-500" /> {label}
      </span>
      <span className="font-semibold text-navy-900">{value}</span>
    </button>
  );
}
