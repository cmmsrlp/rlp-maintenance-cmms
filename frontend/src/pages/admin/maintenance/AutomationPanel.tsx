import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { PlayCircle, PauseCircle, Zap } from "lucide-react";
import { getAutomationStatus, updateAutomationStatus, runPlanGeneration } from "../../../api/maintenancePlans";
import { useToast } from "../../../components/Toast";
import { getApiErrorMessage } from "../../../api/client";
import { formatDateTime } from "../../../lib/format";

/**
 * O "start" da geracao automatica de OS da propria empresa: ate aqui a rodada periodica ja
 * existia no servidor, mas era invisivel - ninguem via se estava rodando, nem tinha como
 * pausar sem mexer em codigo. Aqui da pra ver a ultima rodada e ligar/pausar o piloto
 * automatico - decisao de cada cliente, sobre os proprios planos, nao da OptiProcess.
 *
 * Pausar isto NAO desliga a geracao inteira: "Rodar agora" (aqui) e "Gerar OS" (dentro de
 * cada plano) continuam funcionando - o que pausa e' so a varredura periodica sozinha.
 */
export function AutomationPanel({ onRodou }: { onRodou: () => void }) {
  const { notify } = useToast();
  const queryClient = useQueryClient();
  const [alternando, setAlternando] = useState(false);
  const [rodando, setRodando] = useState(false);

  const { data: status, isLoading } = useQuery({
    queryKey: ["automacao-planos"],
    queryFn: getAutomationStatus,
  });

  async function alternar() {
    if (!status) return;
    setAlternando(true);
    try {
      const atualizado = await updateAutomationStatus(!status.planGenerationEnabled);
      queryClient.setQueryData(["automacao-planos"], atualizado);
      notify("success", atualizado.planGenerationEnabled ? "Geração automática retomada." : "Geração automática pausada.");
    } catch (error) {
      notify("error", getApiErrorMessage(error));
    } finally {
      setAlternando(false);
    }
  }

  async function rodarAgora() {
    setRodando(true);
    try {
      const resultado = await runPlanGeneration();
      notify(
        "success",
        resultado.gerados.length > 0
          ? `${resultado.gerados.length} OS gerada(s): ${resultado.gerados.map((g) => g.workOrderNumber).join(", ")}`
          : "Rodada concluída - nenhum plano vencido no momento.",
      );
      queryClient.invalidateQueries({ queryKey: ["automacao-planos"] });
      onRodou();
    } catch (error) {
      notify("error", getApiErrorMessage(error));
    } finally {
      setRodando(false);
    }
  }

  if (isLoading || !status) return null;

  const ativa = status.planGenerationEnabled;

  return (
    <div className={`mb-6 rounded-lg border p-4 ${ativa ? "border-gray-200 bg-white" : "border-safety-yellow/40 bg-safety-yellow/10"}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Zap className={`h-4 w-4 shrink-0 ${ativa ? "text-safety-green-dark" : "text-safety-yellow-dark"}`} />
          <div>
            <p className="text-sm font-medium text-navy-900">
              Geração automática de OS {ativa ? "ativa" : "pausada"}
            </p>
            <p className="text-xs text-graphite-500">
              {status.lastRunAt
                ? `Última rodada: ${formatDateTime(status.lastRunAt)} - ${status.lastRunGeneratedCount ?? 0} gerada(s), ${status.lastRunIgnoredCount ?? 0} ignorada(s)${
                    status.lastRunErrorCount ? `, ${status.lastRunErrorCount} com erro` : ""
                  }`
                : "Ainda não rodou nesta instância."}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className="btn-outline text-sm" onClick={rodarAgora} disabled={rodando}>
            <PlayCircle className="h-4 w-4" /> {rodando ? "Rodando..." : "Rodar agora"}
          </button>
          <button type="button" className={ativa ? "btn-outline text-sm" : "btn-primary text-sm"} onClick={alternar} disabled={alternando}>
            {ativa ? <PauseCircle className="h-4 w-4" /> : <PlayCircle className="h-4 w-4" />}
            {alternando ? "..." : ativa ? "Pausar" : "Retomar"}
          </button>
        </div>
      </div>
      <p className="mt-2 text-xs text-graphite-400">
        Algumas vezes ao dia, gera a OS de cada plano seu que chegou na antecedência configurada. Pausar aqui só afeta
        essa varredura - "Rodar agora" e o botão "Gerar OS" de cada plano continuam funcionando normalmente.
      </p>
    </div>
  );
}
