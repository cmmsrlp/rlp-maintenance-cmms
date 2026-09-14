import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Search, ShieldAlert, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { listCriticalities, getCriticalitySummary } from "../../../api/assetCriticality";
import { listPlants } from "../../../api/plants";
import { listAreas } from "../../../api/areas";
import type { CriticalityClass } from "../../../api/types";
import { ClientFilterSelect } from "../../../components/ClientFilterSelect";
import { PageHeader } from "../../../components/PageHeader";
import { DataTable } from "../../../components/DataTable";
import { CriticalityClassBadge } from "../../../components/CriticalityClassBadge";
import { formatDateTime, formatKpi } from "../../../lib/format";
import { useCmms } from "../../../lib/cmms";

function Tendencia({ trend }: { trend: "UP" | "DOWN" | "STABLE" | null | undefined }) {
  if (trend === "UP") return <TrendingUp className="h-4 w-4 text-safety-red" aria-label="Piorando" />;
  if (trend === "DOWN") return <TrendingDown className="h-4 w-4 text-safety-green-dark" aria-label="Melhorando" />;
  if (trend === "STABLE") return <Minus className="h-4 w-4 text-graphite-400" aria-label="Estavel" />;
  return <span className="text-graphite-300">-</span>;
}

/**
 * Criticidade de ativos: classificacao dinamica por Seguranca/Producao/Falhas, calculada
 * automaticamente e revisavel manualmente. Ver backend/src/lib/assetCriticality.ts para a
 * formula completa (Indice = 4 x Consequencia x Q, Consequencia = maior entre S e P).
 */
export default function AssetCriticalityList() {
  const navigate = useNavigate();
  const { assetsBase, isClient, ownClientId } = useCmms();
  const [searchParams, setSearchParams] = useSearchParams();
  const clientId = isClient ? (ownClientId ?? "") : (searchParams.get("clientId") ?? "");

  const [plantId, setPlantId] = useState("");
  const [areaId, setAreaId] = useState("");
  const [classe, setClasse] = useState<CriticalityClass | "">("");
  const [insufficient, setInsufficient] = useState(false);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const { data: plants } = useQuery({
    queryKey: ["plants-filtro-criticidade", clientId],
    queryFn: () => listPlants({ clientId: clientId || undefined, active: true }),
    enabled: !!clientId,
  });
  const { data: areas } = useQuery({
    queryKey: ["areas-filtro-criticidade", clientId, plantId],
    queryFn: () => listAreas({ clientId: clientId || undefined, plantId: plantId || undefined, active: true }),
    enabled: !!clientId,
  });

  const { data: summary } = useQuery({
    queryKey: ["asset-criticality-resumo", clientId],
    queryFn: () => getCriticalitySummary({ clientId: clientId || undefined }),
    enabled: !!clientId,
  });

  const { data, isLoading } = useQuery({
    queryKey: ["asset-criticality-lista", clientId, plantId, areaId, classe, insufficient, search, page],
    queryFn: () =>
      listCriticalities({
        clientId: clientId || undefined,
        plantId: plantId || undefined,
        areaId: areaId || undefined,
        class: classe || undefined,
        insufficient: insufficient || undefined,
        search: search || undefined,
        page,
        pageSize: 15,
      }),
    enabled: !!clientId,
  });

  return (
    <div>
      <PageHeader
        title="Criticidade de ativos"
        description="Classificacao dinamica por Seguranca, Producao e historico de quebras/falhas - separada da prioridade da OS"
        breadcrumbs={[{ label: "Ativos", to: assetsBase }, { label: "Criticidade de ativos" }]}
      />

      {clientId && (
        <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-xl border border-red-200 bg-red-50 p-4">
            <p className="text-xs font-medium text-safety-red">Classe A - Critico</p>
            <p className="mt-1 text-2xl font-bold text-navy-900">{summary?.classA ?? "-"}</p>
          </div>
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
            <p className="text-xs font-medium text-safety-yellow-dark">Classe B - Importante</p>
            <p className="mt-1 text-2xl font-bold text-navy-900">{summary?.classB ?? "-"}</p>
          </div>
          <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
            <p className="text-xs font-medium text-graphite-600">Classe C - Comum</p>
            <p className="mt-1 text-2xl font-bold text-navy-900">{summary?.classC ?? "-"}</p>
          </div>
          <div className="rounded-xl border border-navy-100 bg-navy-50 p-4">
            <p className="text-xs font-medium text-navy-700">Dados insuficientes</p>
            <p className="mt-1 text-2xl font-bold text-navy-900">{summary?.insufficient ?? "-"}</p>
          </div>
        </div>
      )}

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
        {!isClient && (
          <ClientFilterSelect
            className="sm:w-64"
            value={clientId}
            onChange={(id) => setSearchParams(id ? { clientId: id } : {})}
            service="CMMS_MAINTENANCE"
            allLabel="Selecione o cliente"
          />
        )}
        {clientId && (
          <>
            <div className="relative sm:w-64">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-graphite-400" />
              <input
                className="input pl-9"
                placeholder="Buscar por tag ou descricao..."
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              />
            </div>
            <select className="input sm:w-48" value={plantId} onChange={(e) => { setPlantId(e.target.value); setAreaId(""); setPage(1); }}>
              <option value="">Todas as plantas</option>
              {(plants ?? []).map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
            <select className="input sm:w-48" value={areaId} onChange={(e) => { setAreaId(e.target.value); setPage(1); }}>
              <option value="">Todas as areas</option>
              {(areas ?? []).map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
            <select
              className="input sm:w-48"
              value={insufficient ? "insufficient" : classe}
              onChange={(e) => {
                const v = e.target.value;
                setInsufficient(v === "insufficient");
                setClasse(v === "insufficient" ? "" : (v as CriticalityClass | ""));
                setPage(1);
              }}
            >
              <option value="">Todas as classes</option>
              <option value="A">Classe A - Critico</option>
              <option value="B">Classe B - Importante</option>
              <option value="C">Classe C - Comum</option>
              <option value="insufficient">Dados insuficientes</option>
            </select>
          </>
        )}
      </div>

      {!clientId ? (
        <p className="text-sm text-graphite-500">Selecione um cliente para ver a criticidade dos ativos dele.</p>
      ) : (
        <DataTable
          loading={isLoading}
          rows={data?.items ?? []}
          keyField={(r) => r.id}
          onRowClick={(r) => navigate(`${assetsBase}/criticidade/${r.id}`)}
          pagination={data}
          onPageChange={setPage}
          emptyTitle="Nenhum ativo encontrado"
          emptyDescription="Ajuste os filtros ou cadastre ativos para ver a criticidade deles aqui."
          columns={[
            {
              header: "Ativo",
              accessor: (r) => (
                <div className="flex items-center gap-2.5">
                  <ShieldAlert className="h-4 w-4 shrink-0 text-graphite-300" />
                  <div className="min-w-0">
                    <p className="font-medium text-navy-900">{r.tag ?? r.description ?? r.type}</p>
                    <p className="text-xs text-graphite-400">{r.description || r.type}</p>
                  </div>
                </div>
              ),
            },
            { header: "Local", accessor: (r) => [r.plant?.name, r.area?.name].filter(Boolean).join(" / ") || "-" },
            { header: "S", accessor: (r) => r.assetCriticality?.safetyScore ?? "-" },
            { header: "P", accessor: (r) => r.assetCriticality?.productionScore ?? "-" },
            { header: "Q", accessor: (r) => r.assetCriticality?.failureScore ?? formatKpi(null) },
            { header: "MTBF", accessor: (r) => (r.assetCriticality?.mtbfHours != null ? `${Math.round(r.assetCriticality.mtbfHours)} h` : "-") },
            { header: "Indice", accessor: (r) => r.assetCriticality?.criticalityIndex ?? "-" },
            { header: "Classe", accessor: (r) => <CriticalityClassBadge criticalityClass={r.assetCriticality?.criticalityClass} size="sm" /> },
            { header: "Tendencia", accessor: (r) => <Tendencia trend={r.assetCriticality?.trend} /> },
            { header: "Atualizado em", accessor: (r) => formatDateTime(r.assetCriticality?.lastCalculatedAt) },
          ]}
        />
      )}
    </div>
  );
}
