import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Search, ShieldAlert, TrendingUp, TrendingDown, Minus, Download, Upload, AlertTriangle, CheckCircle2 } from "lucide-react";
import {
  listCriticalities,
  getCriticalitySummary,
  exportarCriticidades,
  simularImportacaoDeCriticidade,
  confirmarImportacaoDeCriticidade,
  type ResultadoDaImportacao,
} from "../../../api/assetCriticality";
import { listPlants } from "../../../api/plants";
import { listAreas } from "../../../api/areas";
import type { CriticalityClass } from "../../../api/types";
import { ClientFilterSelect } from "../../../components/ClientFilterSelect";
import { PageHeader } from "../../../components/PageHeader";
import { DataTable } from "../../../components/DataTable";
import { CriticalityClassBadge } from "../../../components/CriticalityClassBadge";
import { Modal } from "../../../components/Modal";
import { useToast } from "../../../components/Toast";
import { getApiErrorMessage } from "../../../api/client";
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
  const queryClient = useQueryClient();
  const { notify } = useToast();
  const { assetsBase, isClient, ownClientId } = useCmms();
  const [searchParams, setSearchParams] = useSearchParams();
  const clientId = isClient ? (ownClientId ?? "") : (searchParams.get("clientId") ?? "");

  const [plantId, setPlantId] = useState("");
  const [areaId, setAreaId] = useState("");
  const [classe, setClasse] = useState<CriticalityClass | "">("");
  const [insufficient, setInsufficient] = useState(false);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const [exportando, setExportando] = useState(false);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [arquivoImportacao, setArquivoImportacao] = useState<File | null>(null);
  const [conferencia, setConferencia] = useState<ResultadoDaImportacao | null>(null);
  const [processandoImportacao, setProcessandoImportacao] = useState(false);
  const [importacaoConcluida, setImportacaoConcluida] = useState<ResultadoDaImportacao | null>(null);

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

  async function exportarPlanilha() {
    setExportando(true);
    try {
      const blob = await exportarCriticidades({
        clientId: clientId || undefined,
        plantId: plantId || undefined,
        areaId: areaId || undefined,
        class: classe || undefined,
        insufficient: insufficient || undefined,
        search: search || undefined,
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "criticidade-de-ativos.xlsx";
      a.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      notify("error", getApiErrorMessage(error));
    } finally {
      setExportando(false);
    }
  }

  function abrirImportacao() {
    setArquivoImportacao(null);
    setConferencia(null);
    setImportacaoConcluida(null);
    setImportModalOpen(true);
  }

  async function conferirArquivo(file: File) {
    setArquivoImportacao(file);
    setConferencia(null);
    setImportacaoConcluida(null);
    setProcessandoImportacao(true);
    try {
      setConferencia(await simularImportacaoDeCriticidade(file));
    } catch (error) {
      notify("error", getApiErrorMessage(error));
      setArquivoImportacao(null);
    } finally {
      setProcessandoImportacao(false);
    }
  }

  async function confirmarImportacao() {
    if (!arquivoImportacao) return;
    setProcessandoImportacao(true);
    try {
      const resultado = await confirmarImportacaoDeCriticidade(arquivoImportacao);
      setImportacaoConcluida(resultado);
      setConferencia(null);
      setArquivoImportacao(null);
      notify("success", `${resultado.resumo.alterados} ativo(s) revisado(s).`);
      queryClient.invalidateQueries({ queryKey: ["asset-criticality-lista"] });
      queryClient.invalidateQueries({ queryKey: ["asset-criticality-resumo"] });
    } catch (error) {
      notify("error", getApiErrorMessage(error));
    } finally {
      setProcessandoImportacao(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Criticidade de ativos"
        description="Classificacao dinamica por Seguranca, Producao e historico de quebras/falhas - separada da prioridade da OS"
        breadcrumbs={[{ label: "Ativos", to: assetsBase }, { label: "Criticidade de ativos" }]}
        actions={
          clientId && (
            <>
              <button className="btn-outline" onClick={exportarPlanilha} disabled={exportando}>
                <Download className="h-4 w-4" /> {exportando ? "Exportando..." : "Exportar planilha"}
              </button>
              <button className="btn-primary" onClick={abrirImportacao}>
                <Upload className="h-4 w-4" /> Importar planilha
              </button>
            </>
          )
        }
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

      <Modal
        open={importModalOpen}
        onClose={() => setImportModalOpen(false)}
        title="Importar planilha de criticidade"
        size="lg"
        footer={
          conferencia && !importacaoConcluida ? (
            <>
              <button type="button" className="btn-outline" onClick={() => setImportModalOpen(false)}>Cancelar</button>
              <button
                type="button"
                className="btn-primary"
                onClick={confirmarImportacao}
                disabled={processandoImportacao || conferencia.resumo.alterados === 0}
              >
                {processandoImportacao ? "Gravando..." : `Confirmar ${conferencia.resumo.alterados} alteracao(oes)`}
              </button>
            </>
          ) : (
            <button type="button" className="btn-outline" onClick={() => setImportModalOpen(false)}>Fechar</button>
          )
        }
      >
        {!importacaoConcluida ? (
          <div className="space-y-4">
            <p className="text-sm text-graphite-600">
              Exporte a planilha, revise as colunas <span className="font-medium text-navy-800">Nova Segurança</span>,{" "}
              <span className="font-medium text-navy-800">Nova Produção</span> e <span className="font-medium text-navy-800">MTBF-meta</span>{" "}
              e preencha o <span className="font-medium text-navy-800">Motivo da revisão</span> nas linhas que mudou. Envie de volta aqui - nada e' gravado sem confirmar.
            </p>

            <label className="btn-primary inline-flex cursor-pointer items-center gap-2">
              <Upload className="h-4 w-4" />
              {processandoImportacao ? "Conferindo..." : arquivoImportacao ? "Trocar arquivo" : "Escolher planilha preenchida"}
              <input
                type="file"
                accept=".xlsx"
                className="hidden"
                disabled={processandoImportacao}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void conferirArquivo(f);
                  e.target.value = "";
                }}
              />
            </label>
            {arquivoImportacao && <span className="ml-3 text-sm text-graphite-600">{arquivoImportacao.name}</span>}

            {conferencia && (
              <div className="rounded-lg border border-gray-200">
                <div className="flex flex-wrap gap-4 border-b border-gray-100 px-4 py-3 text-sm">
                  <span><span className="font-semibold text-navy-900">{conferencia.resumo.total}</span> linha(s) lida(s)</span>
                  <span className="text-safety-green-dark"><span className="font-semibold">{conferencia.resumo.alterados}</span> serao alteradas</span>
                  <span className="text-graphite-500"><span className="font-semibold">{conferencia.resumo.semAlteracao}</span> sem mudanca</span>
                  {conferencia.resumo.comErro > 0 && (
                    <span className="text-safety-red"><span className="font-semibold">{conferencia.resumo.comErro}</span> com erro</span>
                  )}
                </div>

                {conferencia.resumo.comErro > 0 && (
                  <div className="border-b border-gray-100 bg-red-50/50 px-4 py-3">
                    <p className="flex items-center gap-2 text-sm font-semibold text-safety-red">
                      <AlertTriangle className="h-4 w-4" /> Corrija estas linhas e envie de novo
                    </p>
                    <ul className="mt-1.5 space-y-0.5 text-sm text-graphite-700">
                      {conferencia.linhas.filter((l) => l.status === "erro").slice(0, 30).map((l) => (
                        <li key={l.numero}>
                          <span className="font-medium text-navy-800">Linha {l.numero} ({l.tag}):</span> {l.mensagem}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {conferencia.resumo.alterados > 0 && (
                  <div className="max-h-64 overflow-y-auto px-4 py-3">
                    <p className="mb-1.5 text-sm font-medium text-graphite-700">O que vai mudar:</p>
                    <ul className="space-y-1 text-sm text-graphite-700">
                      {conferencia.linhas.filter((l) => l.status === "alterado").slice(0, 50).map((l) => (
                        <li key={l.numero}>
                          <span className="font-medium text-navy-800">{l.tag}:</span>{" "}
                          S {l.antes?.safetyScore}→{l.depois?.safetyScore}, P {l.antes?.productionScore}→{l.depois?.productionScore}
                          {l.antes?.mtbfTargetHours !== l.depois?.mtbfTargetHours && `, MTBF-meta ${l.antes?.mtbfTargetHours ?? "familia"}→${l.depois?.mtbfTargetHours ?? "familia"}h`}
                        </li>
                      ))}
                      {conferencia.resumo.alterados > 50 && (
                        <li className="text-xs text-graphite-500">e mais {conferencia.resumo.alterados - 50}...</li>
                      )}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="rounded-lg border border-safety-green/40 bg-green-50/40 p-4">
            <p className="flex items-center gap-2 font-semibold text-safety-green-dark">
              <CheckCircle2 className="h-5 w-5" /> Importacao concluida
            </p>
            <p className="mt-1 text-sm text-graphite-700">
              {importacaoConcluida.resumo.alterados} ativo(s) revisado(s) - o historico de cada um ja mostra a alteracao.
            </p>
          </div>
        )}
      </Modal>
    </div>
  );
}
