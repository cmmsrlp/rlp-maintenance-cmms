import { useQuery } from "@tanstack/react-query";
import { Building2, Boxes, ClipboardList, PackageX } from "lucide-react";
import { getAdminDashboard } from "../../api/dashboard";
import { PageHeader } from "../../components/PageHeader";
import { StatCard } from "../../components/StatCard";
import { FullPageSpinner } from "../../components/Spinner";
import { StatusBadge } from "../../components/StatusBadge";
import { formatDate, clientDisplayName } from "../../lib/format";
import { EmptyState } from "../../components/EmptyState";

export default function Dashboard() {
  const { data, isLoading } = useQuery({ queryKey: ["admin-dashboard"], queryFn: getAdminDashboard });

  if (isLoading || !data) return <FullPageSpinner />;

  return (
    <div>
      <PageHeader title="Dashboard" description="Visão geral do CMMS entre todos os clientes" />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Clientes ativos" value={data.kpis.activeClients} icon={Building2} tone="navy" to="/gestao/clientes" />
        <StatCard label="Ativos cadastrados" value={data.kpis.totalInstruments} icon={Boxes} tone="navy" to="/gestao/ativos" />
        <StatCard
          label="Ordens de manutenção em aberto"
          value={data.kpis.openWorkOrders}
          icon={ClipboardList}
          tone="yellow"
          to="/gestao/manutencao/ordens"
        />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <div className="card p-5 lg:col-span-2">
          <h2 className="mb-4 font-semibold text-navy-900">Ordens de manutenção recentes</h2>
          {data.recentWorkOrders.length === 0 ? (
            <EmptyState title="Nada por aqui" description="Nenhuma ordem de manutenção criada ainda." />
          ) : (
            <ul className="divide-y divide-gray-100">
              {data.recentWorkOrders.map((w) => (
                <li key={w.id} className="flex items-center justify-between py-2.5 text-sm">
                  <div>
                    <p className="font-medium text-graphite-800">
                      {w.number} - {clientDisplayName(w.client)}
                    </p>
                    <p className="text-xs text-graphite-400">{w.instrument?.tag ?? w.instrument?.description ?? "Sem ativo"}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-graphite-600">{w.scheduledDate ? formatDate(w.scheduledDate) : "Sem data"}</p>
                    <StatusBadge status={w.status} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="card p-5">
          <h2 className="mb-4 flex items-center gap-2 font-semibold text-navy-900">
            <PackageX className="h-4 w-4 text-safety-red" /> Almoxarifado: estoque baixo
          </h2>
          {data.lowStockSpareParts.length === 0 ? (
            <p className="text-sm text-graphite-500">Nenhuma peça com estoque baixo.</p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {data.lowStockSpareParts.map((p) => (
                <li key={p.id} className="py-2 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-graphite-700">{p.name}</span>
                    <span className="font-semibold text-safety-red">
                      {p.stockQty}/{p.minStock}
                    </span>
                  </div>
                  <span className="text-xs text-graphite-400">{clientDisplayName(p.client)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
