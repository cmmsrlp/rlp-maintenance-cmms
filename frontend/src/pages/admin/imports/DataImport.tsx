import { useState } from "react";
import { Download, Upload, CheckCircle2, AlertTriangle, FileSpreadsheet } from "lucide-react";
import { PageHeader } from "../../../components/PageHeader";
import { EmptyState } from "../../../components/EmptyState";
import { useToast } from "../../../components/Toast";
import { getApiErrorMessage } from "../../../api/client";
import { ClientFilterSelect } from "../../../components/ClientFilterSelect";
import { baixarModeloDeImportacao, simularImportacao, confirmarImportacao } from "../../../api/imports";
import type { ModoDeImportacao, ResultadoDaImportacao } from "../../../api/types";
import { useCmms } from "../../../lib/cmms";

/**
 * Importacao por planilha - o caminho de entrada de uma empresa que ja tem o parque
 * cadastrado noutro lugar (ou num caderno).
 *
 * O fluxo tem tres passos de proposito: baixar o modelo, CONFERIR e so entao confirmar. A
 * conferencia nao grava nada; ela existe para o erro aparecer antes, e nao no meio de uma
 * importacao pela metade que ninguem sabe desfazer.
 */
export default function DataImport() {
  const { notify } = useToast();
  const { isClient, ownClientId, base } = useCmms();
  const [clientId, setClientId] = useState(ownClientId ?? "");
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [conferencia, setConferencia] = useState<ResultadoDaImportacao | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [concluida, setConcluida] = useState<ResultadoDaImportacao | null>(null);
  // O que fazer com quem ja esta cadastrado. Ignorar e' o padrao de proposito: uma
  // importacao repetida por engano nao pode encostar no que a equipe ajustou a mao.
  const [modo, setModo] = useState<ModoDeImportacao>("ignorar");

  const pronto = isClient || !!clientId;

  async function baixarModelo() {
    try {
      const blob = await baixarModeloDeImportacao(clientId || undefined);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "modelo-importacao-cmms.xlsx";
      a.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      notify("error", getApiErrorMessage(error));
    }
  }

  async function trocarModo(novo: ModoDeImportacao) {
    setModo(novo);
    // Reconfere com a nova regra: o numero de "sera criado" e "completado" muda, e mostrar
    // o resumo antigo com a regra nova seria mentir sobre o que o botao vai fazer.
    if (arquivo) await conferir(arquivo, novo);
  }

  async function conferir(file: File, modoAtual: ModoDeImportacao = modo) {
    setArquivo(file);
    setConferencia(null);
    setConcluida(null);
    setOcupado(true);
    try {
      setConferencia(await simularImportacao(file, clientId || undefined, modoAtual));
    } catch (error) {
      notify("error", getApiErrorMessage(error));
      setArquivo(null);
    } finally {
      setOcupado(false);
    }
  }

  async function confirmar() {
    if (!arquivo) return;
    setOcupado(true);
    try {
      const r = await confirmarImportacao(arquivo, clientId || undefined, modo);
      setConcluida(r);
      setConferencia(null);
      setArquivo(null);
      notify("success", "Importação concluída.");
    } catch (error) {
      notify("error", getApiErrorMessage(error));
    } finally {
      setOcupado(false);
    }
  }

  const totalCriar = conferencia ? Object.values(conferencia.resumo).reduce((s, r) => s + r.criados, 0) : 0;
  const totalCompletar = conferencia ? Object.values(conferencia.resumo).reduce((s, r) => s + r.completados, 0) : 0;
  const temErro = (conferencia?.problemas.length ?? 0) > 0;

  return (
    <div>
      <PageHeader
        title="Importar dados por planilha"
        description="Suba ativos, mão de obra, almoxarifado e a estrutura da fábrica de uma vez"
        breadcrumbs={[{ label: "RLP Maintenance CMMS", to: base }, { label: "Importar dados" }]}
      />

      {!isClient && (
        <div className="mb-6">
          <ClientFilterSelect
            className="sm:w-80"
            value={clientId}
            onChange={(id) => { setClientId(id); setArquivo(null); setConferencia(null); setConcluida(null); }}
            service="CMMS_MAINTENANCE"
            allLabel="Selecione a empresa"
          />
        </div>
      )}

      {!pronto ? (
        <EmptyState title="Selecione a empresa" description="A importação entra na base da empresa escolhida." />
      ) : (
        <div className="space-y-6">
          <div className="card p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0">
                <h2 className="flex items-center gap-2 font-semibold text-navy-900">
                  <FileSpreadsheet className="h-5 w-5 text-navy-600" /> 1. Baixe o modelo
                </h2>
                <p className="mt-1 text-sm text-graphite-600">
                  Uma aba por cadastro, na ordem certa de preenchimento, com as colunas obrigatórias marcadas e
                  um exemplo em cada uma. A primeira aba explica como preencher.
                </p>
              </div>
              <button className="btn-outline shrink-0" onClick={baixarModelo}>
                <Download className="h-4 w-4" /> Baixar modelo (.xlsx)
              </button>
            </div>
          </div>

          <div className="card p-5">
            <h2 className="flex items-center gap-2 font-semibold text-navy-900">
              <Upload className="h-5 w-5 text-navy-600" /> 2. Envie a planilha preenchida
            </h2>
            <p className="mt-1 text-sm text-graphite-600">
              O arquivo é conferido inteiro antes de qualquer coisa ser gravada. Nada entra sem a sua confirmação.
            </p>
            <label className="btn-primary mt-3 inline-flex cursor-pointer items-center gap-2">
              <Upload className="h-4 w-4" />
              {ocupado ? "Conferindo..." : arquivo ? "Trocar arquivo" : "Escolher planilha"}
              <input
                type="file"
                accept=".xlsx"
                className="hidden"
                disabled={ocupado}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void conferir(f);
                  e.target.value = "";
                }}
              />
            </label>
            {arquivo && <span className="ml-3 text-sm text-graphite-600">{arquivo.name}</span>}
          </div>

          {conferencia && (
            <div className="card p-5">
              <h2 className="font-semibold text-navy-900">3. Confira antes de gravar</h2>

              <div className="mt-3 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b border-gray-200 bg-gray-50 text-left text-xs uppercase tracking-wide text-graphite-500">
                    <tr>
                      <th className="px-3 py-2">Aba</th>
                      <th className="px-3 py-2 text-right">Será criado</th>
                      <th className="px-3 py-2 text-right">Será completado</th>
                      <th className="px-3 py-2 text-right">Já existe (ignorado)</th>
                      <th className="px-3 py-2 text-right">Com erro</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {Object.entries(conferencia.resumo).map(([aba, r]) => (
                      <tr key={aba}>
                        <td className="px-3 py-2 font-medium text-navy-900">{aba}</td>
                        <td className="px-3 py-2 text-right text-safety-green-dark">{r.criados}</td>
                        <td className="px-3 py-2 text-right text-navy-700">{r.completados > 0 ? r.completados : "-"}</td>
                        <td className="px-3 py-2 text-right text-graphite-500">{r.ignorados}</td>
                        <td className={`px-3 py-2 text-right ${r.comErro > 0 ? "font-semibold text-safety-red" : "text-graphite-400"}`}>
                          {r.comErro}
                        </td>
                      </tr>
                    ))}
                    {Object.keys(conferencia.resumo).length === 0 && (
                      <tr>
                        <td colSpan={5} className="px-3 py-4 text-center text-graphite-500">
                          A planilha não tem nenhuma linha preenchida.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {temErro && (
                <div className="mt-4 rounded-lg border border-safety-red/30 bg-red-50/50 p-4">
                  <p className="flex items-center gap-2 font-semibold text-safety-red">
                    <AlertTriangle className="h-4 w-4" /> {conferencia.problemas.length} linha(s) com erro - corrija e envie de novo
                  </p>
                  <ul className="mt-2 space-y-1 text-sm text-graphite-700">
                    {conferencia.problemas.slice(0, 40).map((p, i) => (
                      <li key={i}>
                        <span className="font-medium text-navy-800">{p.aba}, linha {p.linha}:</span> {p.mensagem}
                      </li>
                    ))}
                  </ul>
                  {conferencia.problemas.length > 40 && (
                    <p className="mt-1 text-xs text-graphite-500">e mais {conferencia.problemas.length - 40}...</p>
                  )}
                </div>
              )}

              {/* A escolha fica AO LADO da conferencia, e nao antes do envio: so aqui a
                  pessoa sabe quantos repetidos existem e o que muda em cada um. */}
              {(conferencia.ignorados.length > 0 || conferencia.completados.length > 0) && (
                <div className="mt-4 rounded-lg border border-gray-200 p-4">
                  <p className="text-sm font-medium text-graphite-700">
                    {conferencia.ignorados.length + conferencia.completados.length} linha(s) já estão cadastradas
                  </p>
                  <p className="mt-0.5 text-xs text-graphite-500">
                    O TAG é a identidade do ativo - maiúscula, minúscula e espaço sobrando não contam. O que fazer com elas:
                  </p>

                  <div className="mt-3 space-y-2">
                    <label className="flex cursor-pointer items-start gap-2 text-sm">
                      <input
                        type="radio"
                        className="mt-1"
                        checked={modo === "ignorar"}
                        onChange={() => void trocarModo("ignorar")}
                        disabled={ocupado}
                      />
                      <span>
                        <span className="font-medium text-navy-900">Ignorar</span>
                        <span className="block text-xs text-graphite-500">
                          Não encosta em nada do que já está cadastrado. A lista abaixo mostra o que ficaria diferente.
                        </span>
                      </span>
                    </label>
                    <label className="flex cursor-pointer items-start gap-2 text-sm">
                      <input
                        type="radio"
                        className="mt-1"
                        checked={modo === "completar"}
                        onChange={() => void trocarModo("completar")}
                        disabled={ocupado}
                      />
                      <span>
                        <span className="font-medium text-navy-900">Completar campos vazios</span>
                        <span className="block text-xs text-graphite-500">
                          Preenche só o que está em branco no sistema (fabricante, modelo, nível...). Um valor já
                          gravado nunca é trocado pelo da planilha.
                        </span>
                      </span>
                    </label>
                  </div>

                  {conferencia.completados.length > 0 && (
                    <ul className="mt-3 space-y-0.5 border-t border-gray-100 pt-3 text-sm text-graphite-600">
                      {conferencia.completados.slice(0, 10).map((x, i) => (
                        <li key={i}>
                          <span className="font-medium text-navy-800">{x.aba}, linha {x.linha}:</span> {x.motivo}
                        </li>
                      ))}
                      {conferencia.completados.length > 10 && (
                        <li className="text-xs text-graphite-500">e mais {conferencia.completados.length - 10}...</li>
                      )}
                    </ul>
                  )}

                  {conferencia.ignorados.length > 0 && (
                    <ul className="mt-3 space-y-0.5 border-t border-gray-100 pt-3 text-sm text-graphite-600">
                      {conferencia.ignorados.slice(0, 10).map((x, i) => (
                        <li key={i}>
                          <span className="font-medium text-navy-800">{x.aba}, linha {x.linha}:</span> {x.motivo}
                        </li>
                      ))}
                      {conferencia.ignorados.length > 10 && (
                        <li className="text-xs text-graphite-500">e mais {conferencia.ignorados.length - 10}...</li>
                      )}
                    </ul>
                  )}
                </div>
              )}

              <div className="mt-5 flex flex-wrap items-center gap-3">
                <button
                  className="btn-primary"
                  onClick={confirmar}
                  disabled={ocupado || temErro || (totalCriar === 0 && totalCompletar === 0)}
                >
                  {ocupado
                    ? "Importando..."
                    : totalCompletar > 0
                      ? `Importar ${totalCriar} novo(s) e completar ${totalCompletar}`
                      : `Importar ${totalCriar} registro(s)`}
                </button>
                {temErro && <span className="text-sm text-graphite-500">Corrija os erros acima para liberar a importação.</span>}
                {!temErro && totalCriar === 0 && totalCompletar === 0 && (
                  <span className="text-sm text-graphite-500">Não há nada novo para importar.</span>
                )}
              </div>
            </div>
          )}

          {concluida && (
            <div className="card border-safety-green/40 bg-green-50/40 p-5">
              <p className="flex items-center gap-2 font-semibold text-safety-green-dark">
                <CheckCircle2 className="h-5 w-5" /> Importação concluída
              </p>
              <ul className="mt-2 space-y-0.5 text-sm text-graphite-700">
                {Object.entries(concluida.resumo).map(([aba, r]) => (
                  <li key={aba}>
                    {aba}: <span className="font-semibold text-navy-900">{r.criados}</span> criado(s)
                    {r.completados > 0 && <span className="text-navy-700"> - {r.completados} completado(s)</span>}
                    {r.ignorados > 0 && <span className="text-graphite-500"> - {r.ignorados} já existia(m)</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
