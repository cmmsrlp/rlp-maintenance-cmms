import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Layers3, AlertTriangle, Building2, ShieldAlert, Package } from "lucide-react";
import { getPlatformDashboard } from "../../../api/dashboard";
import { PageHeader } from "../../../components/PageHeader";
import { StatCard } from "../../../components/StatCard";
import { FullPageSpinner } from "../../../components/Spinner";
import { EmptyState } from "../../../components/EmptyState";

/** Visao "Super Admin" da plataforma: distribuicao de clientes por plano e clientes perto
 * do limite do proprio plano (usuarios/ativos). Sem integracao de cobranca. */
export default function PlatformDashboard() {
  const { data, isLoading } = useQuery({ queryKey: ["platform-dashboard"], queryFn: getPlatformDashboard });

  return (
    <div>
      <PageHeader
        title="Administração da plataforma"
        description="Planos, assinaturas e limites de uso dos clientes"
        actions={
          <Link to="/gestao/plataforma/planos" className="btn-outline">
            <Layers3 className="h-4 w-4" /> Gerenciar planos
          </Link>
        }
      />

      {isLoading || !data ? (
        <FullPageSpinner />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <StatCard label="Clientes ativos" value={data.totalActiveClients} icon={Building2} tone="navy" />
            <StatCard label="Sem plano atribuído" value={data.clientsWithoutPlan} icon={ShieldAlert} tone="yellow" />
            <StatCard label="Planos cadastrados" value={data.plans.length} icon={Package} tone="navy" />
          </div>

          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <div className="card p-5">
              <h2 className="mb-3 font-semibold text-navy-900">Distribuição por plano</h2>
              {data.plans.length === 0 ? (
                <EmptyState title="Nenhum plano cadastrado" description="Crie planos para atribuir aos clientes." />
              ) : (
                <ul className="divide-y divide-gray-100">
                  {data.plans.map((p) => (
                    <li key={p.id} className="flex items-center justify-between py-2.5 text-sm">
                      <p className="font-medium text-graphite-800">{p.name}</p>
                      <span className="font-semibold text-navy-900">{p.clientCount} {p.clientCount === 1 ? "cliente" : "clientes"}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="card p-5">
              <h2 className="mb-3 flex items-center gap-2 font-semibold text-navy-900">
                <AlertTriangle className="h-4 w-4 text-safety-yellow" /> Clientes perto do limite (80%+)
              </h2>
              {data.nearLimitClients.length === 0 ? (
                <EmptyState title="Nenhum cliente perto do limite" description="Todos os clientes com plano estão com folga de uso." />
              ) : (
                <ul className="divide-y divide-gray-100">
                  {data.nearLimitClients.map((c) => (
                    <li key={c.clientId} className="py-2.5">
                      <Link to={`/gestao/clientes/${c.clientId}`} className="text-sm font-medium text-navy-900 hover:underline">{c.name}</Link>
                      <p className="text-xs text-graphite-400">{c.planName}</p>
                      <div className="mt-1 flex gap-4 text-xs">
                        {c.users.limit != null && (
                          <span className={c.users.pct != null && c.users.pct >= 100 ? "font-medium text-safety-red" : "text-graphite-600"}>
                            Usuários: {c.users.current}/{c.users.limit} ({c.users.pct}%)
                          </span>
                        )}
                        {c.instruments.limit != null && (
                          <span className={c.instruments.pct != null && c.instruments.pct >= 100 ? "font-medium text-safety-red" : "text-graphite-600"}>
                            Ativos: {c.instruments.current}/{c.instruments.limit} ({c.instruments.pct}%)
                          </span>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
