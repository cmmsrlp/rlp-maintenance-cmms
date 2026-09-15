import { useQuery } from "@tanstack/react-query";
import { Link, Navigate } from "react-router-dom";
import { Gauge, TimerReset, Activity, Wrench, Boxes, ClipboardList, ListChecks, GitBranch, Radar, HardHat, ShieldCheck } from "lucide-react";
import { getClientDashboard } from "../../api/dashboard";
import { listMaintenanceWorkOrders, getMaintenanceDashboard } from "../../api/maintenanceWorkOrders";
import { useAuth } from "../../auth/AuthContext";
import { FullPageSpinner } from "../../components/Spinner";
import { StatCard } from "../../components/StatCard";
import { StatusBadge } from "../../components/StatusBadge";
import { clientDisplayName, formatKpi } from "../../lib/format";
import { EmptyState } from "../../components/EmptyState";

import { TIPOS_DE_OS as TYPE_LABELS } from "../../lib/maintenanceLabels";

export default function PortalDashboard() {
  const { user } = useAuth();
  const hasCmms = !!user?.client?.contractedServices?.includes("CMMS_MAINTENANCE");

  // Todo cliente deste produto e' do CMMS - sem o servico contratado, nao ha o que mostrar
  // aqui (nenhum outro modulo sobrevive na tela inicial do portal).
  if (hasCmms) return <Navigate to="/portal/manutencao" replace />;

  const { data, isLoading } = useQuery({ queryKey: ["client-dashboard"], queryFn: getClientDashboard });
  const { data: cmmsDashboard, isLoading: cmmsLoading } = useQuery({
    queryKey: ["portal-maintenance-dashboard-home"],
    queryFn: () => getMaintenanceDashboard({}),
    enabled: hasCmms,
  });
  const { data: workOrders } = useQuery({
    queryKey: ["portal-maintenance-work-orders-home"],
    queryFn: () => listMaintenanceWorkOrders({ pageSize: 6 }),
    enabled: hasCmms,
  });

  if (isLoading || !data || (hasCmms && (cmmsLoading || !cmmsDashboard))) return <FullPageSpinner />;

  if (hasCmms) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-navy-900">RLP Maintenance CMMS</h1>
        <p className="mt-1 text-graphite-500">Gestão de manutenção de {clientDisplayName(user?.client)}</p>

        <div className="mt-4 flex flex-wrap gap-3">
          <Link to="/portal/ativos" className="btn-outline">
            <Gauge className="h-4 w-4" /> Meus ativos
          </Link>
          <Link to="/portal/manutencao/arvore" className="btn-outline">
            <GitBranch className="h-4 w-4" /> Árvore de ativos
          </Link>
          <Link to="/portal/manutencao/ordens" className="btn-outline">
            <ClipboardList className="h-4 w-4" /> Ordem de manutenção
          </Link>
          <Link to="/portal/manutencao/planos" className="btn-outline">
            <ShieldCheck className="h-4 w-4" /> Planos de manutenção
          </Link>
          <Link to="/portal/manutencao/ordens?type=PREDICTIVE" className="btn-outline">
            <Radar className="h-4 w-4" /> Manutenção preditiva
          </Link>
          <Link to="/portal/manutencao/falhas" className="btn-outline">
            <ListChecks className="h-4 w-4" /> Códigos de falha
          </Link>
          <Link to="/portal/almoxarifado" className="btn-outline">
            <Boxes className="h-4 w-4" /> Meu almoxarifado
          </Link>
          <Link to="/portal/manutencao/mao-de-obra" className="btn-outline">
            <HardHat className="h-4 w-4" /> Mão de obra
          </Link>
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="MTTR (horas)" value={formatKpi(cmmsDashboard!.kpis.mttrHours)} icon={TimerReset} tone="navy" to="/portal/manutencao" />
          <StatCard label="MTBF (horas)" value={formatKpi(cmmsDashboard!.kpis.mtbfHours)} icon={Activity} tone="navy" to="/portal/manutencao" />
          <StatCard label="Disponibilidade" value={formatKpi(cmmsDashboard!.kpis.availabilityPct, "%")} icon={Gauge} tone="green" to="/portal/manutencao" />
          <StatCard label="Cumprimento do plano" value={formatKpi(cmmsDashboard!.kpis.planComplianceRatePct, "%")} icon={Wrench} tone="yellow" to="/portal/manutencao" />
        </div>

        <div className="mt-6 card p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold text-navy-900">Ordens de manutenção recentes</h2>
            <Link to="/portal/manutencao/ordens" className="text-sm text-navy-700 hover:underline">Ver todas</Link>
          </div>
          {!workOrders || workOrders.items.length === 0 ? (
            <EmptyState title="Nenhuma ordem de manutenção" description="Ainda não há ordens de manutenção registradas." />
          ) : (
            <ul className="divide-y divide-gray-100">
              {workOrders.items.map((w) => (
                <li key={w.id}>
                  <Link to={`/portal/manutencao/ordens/${w.id}`} className="flex items-center justify-between py-2.5 text-sm hover:text-navy-700">
                    <div>
                      <p className="font-medium text-graphite-800">{w.number}</p>
                      <p className="text-xs text-graphite-400">{TYPE_LABELS[w.type]} - {w.instrument?.tag ?? "-"}</p>
                    </div>
                    <StatusBadge status={w.status} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-navy-900">Olá, {clientDisplayName(user?.client)}</h1>
      <p className="mt-1 text-graphite-500">Sua empresa ainda não tem o CMMS ativado.</p>
      <div className="mt-6">
        <EmptyState
          title="Nenhum serviço contratado"
          description="Fale com o RLP Maintenance para ativar o CMMS na sua empresa."
        />
      </div>
    </div>
  );
}
