import { Link } from "react-router-dom";
import { Droplets, Gauge } from "lucide-react";
import type { Instrument } from "../api/types";

interface Props {
  instrument: Instrument;
  /** Prefixo das rotas do CMMS ("/portal/manutencao" ou "/gestao/manutencao"). */
  base: string;
}

/**
 * O que falta para as marcas do ativo virarem trabalho de verdade.
 *
 * Marcar "calibravel" ou "lubrificavel" e' so metade: sem plano de calibracao o ativo
 * nunca e' chamado para calibrar, e sem ponto cadastrado ele nunca entra numa rota de
 * lubrificacao. Sem este aviso a marca parecia ter resolvido, e o ativo ficava anos sem
 * ninguem notar - por isso a pendencia aparece na ficha, com o atalho que a resolve.
 */
export function AssetSetupAlerts({ instrument, base }: Props) {
  const pendencias = instrument.pendencias;
  if (!pendencias?.planoDeCalibracao && !pendencias?.pontoDeLubrificacao) return null;

  return (
    <div className="mb-4 space-y-2">
      {pendencias.planoDeCalibracao && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-safety-yellow/40 bg-safety-yellow/10 px-4 py-3">
          <Gauge className="h-4 w-4 shrink-0 text-safety-yellow-dark" />
          <p className="text-sm text-graphite-700">
            Este ativo está marcado como <strong>calibrável</strong>, mas ainda não tem plano de calibração -
            é o plano que diz de quanto em quanto tempo calibrar.
          </p>
          <Link
            className="btn-outline ml-auto text-sm"
            to={`${base}/planos/novo?instrumentId=${instrument.id}&planType=CALIBRATION`}
          >
            Criar plano de calibração
          </Link>
        </div>
      )}

      {pendencias.pontoDeLubrificacao && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-safety-yellow/40 bg-safety-yellow/10 px-4 py-3">
          <Droplets className="h-4 w-4 shrink-0 text-safety-yellow-dark" />
          <p className="text-sm text-graphite-700">
            Este ativo está marcado como <strong>lubrificável</strong>, mas ainda não tem ponto cadastrado -
            falta dizer qual lubrificante, quanto e de quanto em quanto tempo.
          </p>
          <Link
            className="btn-outline ml-auto text-sm"
            to={`${base.replace(/\/manutencao$/, "")}/lubrificacao/pontos?instrumentId=${instrument.id}&novo=1`}
          >
            Cadastrar ponto
          </Link>
        </div>
      )}

    </div>
  );
}
