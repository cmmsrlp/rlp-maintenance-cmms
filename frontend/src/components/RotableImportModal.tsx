import { useState } from "react";
import { Download, Upload, AlertTriangle, CheckCircle2 } from "lucide-react";
import { Modal } from "./Modal";
import { useToast } from "./Toast";
import { getApiErrorMessage } from "../api/client";
import { baixarModeloImportacaoRotable, simularImportacaoRotable, confirmarImportacaoRotable } from "../api/rotableEquipment";
import type { ModoDeImportacao, ResultadoDaImportacao } from "../api/types";

interface Props {
  open: boolean;
  onClose: () => void;
  clientId: string;
  onImported: () => void;
}

/**
 * Importacao de equipamentos recondicionaveis por planilha - uma aba por tipo (Motor,
 * Redutor, Bomba...). Mesmo fluxo de tres passos da importacao geral (baixar modelo,
 * conferir, so' entao confirmar), so' que dentro da propria tela de Equipamentos
 * recondicionaveis em vez de uma pagina separada.
 */
export function RotableImportModal({ open, onClose, clientId, onImported }: Props) {
  const { notify } = useToast();
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [conferencia, setConferencia] = useState<ResultadoDaImportacao | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [concluida, setConcluida] = useState<ResultadoDaImportacao | null>(null);
  const [modo, setModo] = useState<ModoDeImportacao>("ignorar");

  function fechar() {
    setArquivo(null);
    setConferencia(null);
    setConcluida(null);
    setModo("ignorar");
    onClose();
  }

  async function baixarModelo() {
    try {
      const blob = await baixarModeloImportacaoRotable(clientId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "modelo-equipamentos-recondicionaveis.xlsx";
      a.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      notify("error", getApiErrorMessage(error));
    }
  }

  async function conferir(file: File, modoAtual: ModoDeImportacao = modo) {
    setArquivo(file);
    setConferencia(null);
    setConcluida(null);
    setOcupado(true);
    try {
      setConferencia(await simularImportacaoRotable(file, clientId, modoAtual));
    } catch (error) {
      notify("error", getApiErrorMessage(error));
      setArquivo(null);
    } finally {
      setOcupado(false);
    }
  }

  async function trocarModo(novo: ModoDeImportacao) {
    setModo(novo);
    if (arquivo) await conferir(arquivo, novo);
  }

  async function confirmar() {
    if (!arquivo) return;
    setOcupado(true);
    try {
      const r = await confirmarImportacaoRotable(arquivo, clientId, modo);
      setConcluida(r);
      setConferencia(null);
      setArquivo(null);
      notify("success", "Importação concluída.");
      onImported();
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
    <Modal open={open} onClose={fechar} title="Importar equipamentos por planilha" size="lg">
      <div className="space-y-5">
        <div className="rounded-lg border border-gray-200 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-navy-900">1. Baixe o modelo</h3>
              <p className="mt-1 text-xs text-graphite-600">
                Uma aba por tipo de equipamento (Motor, Redutor, Bomba...), com as colunas técnicas de cada um e um exemplo preenchido.
              </p>
            </div>
            <button className="btn-outline shrink-0 text-sm" onClick={baixarModelo}>
              <Download className="h-4 w-4" /> Baixar modelo
            </button>
          </div>
        </div>

        <div className="rounded-lg border border-gray-200 p-4">
          <h3 className="text-sm font-semibold text-navy-900">2. Envie a planilha preenchida</h3>
          <p className="mt-1 text-xs text-graphite-600">O arquivo é conferido inteiro antes de qualquer coisa ser gravada.</p>
          <label className="btn-primary mt-3 inline-flex cursor-pointer items-center gap-2 text-sm">
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
          <div className="rounded-lg border border-gray-200 p-4">
            <h3 className="text-sm font-semibold text-navy-900">3. Confira antes de gravar</h3>

            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-gray-200 bg-gray-50 text-left text-xs uppercase tracking-wide text-graphite-500">
                  <tr>
                    <th className="px-3 py-2">Tipo</th>
                    <th className="px-3 py-2 text-right">Será criado</th>
                    <th className="px-3 py-2 text-right">Será completado</th>
                    <th className="px-3 py-2 text-right">Já existe</th>
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
                      <td className={`px-3 py-2 text-right ${r.comErro > 0 ? "font-semibold text-safety-red" : "text-graphite-400"}`}>{r.comErro}</td>
                    </tr>
                  ))}
                  {Object.keys(conferencia.resumo).length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-3 py-4 text-center text-graphite-500">A planilha não tem nenhuma linha preenchida.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {temErro && (
              <div className="mt-4 rounded-lg border border-safety-red/30 bg-red-50/50 p-4">
                <p className="flex items-center gap-2 text-sm font-semibold text-safety-red">
                  <AlertTriangle className="h-4 w-4" /> {conferencia.problemas.length} linha(s) com erro - corrija e envie de novo
                </p>
                <ul className="mt-2 space-y-1 text-sm text-graphite-700">
                  {conferencia.problemas.slice(0, 30).map((p, i) => (
                    <li key={i}><span className="font-medium text-navy-800">{p.aba}, linha {p.linha}:</span> {p.mensagem}</li>
                  ))}
                </ul>
                {conferencia.problemas.length > 30 && <p className="mt-1 text-xs text-graphite-500">e mais {conferencia.problemas.length - 30}...</p>}
              </div>
            )}

            {(conferencia.ignorados.length > 0 || conferencia.completados.length > 0) && (
              <div className="mt-4 rounded-lg border border-gray-200 p-4">
                <p className="text-sm font-medium text-graphite-700">
                  {conferencia.ignorados.length + conferencia.completados.length} linha(s) já estão cadastradas
                </p>
                <p className="mt-0.5 text-xs text-graphite-500">O Código é a identidade do equipamento. O que fazer com elas:</p>

                <div className="mt-3 space-y-2">
                  <label className="flex cursor-pointer items-start gap-2 text-sm">
                    <input type="radio" className="mt-1" checked={modo === "ignorar"} onChange={() => void trocarModo("ignorar")} disabled={ocupado} />
                    <span>
                      <span className="font-medium text-navy-900">Ignorar</span>
                      <span className="block text-xs text-graphite-500">Não encosta em nada do que já está cadastrado.</span>
                    </span>
                  </label>
                  <label className="flex cursor-pointer items-start gap-2 text-sm">
                    <input type="radio" className="mt-1" checked={modo === "completar"} onChange={() => void trocarModo("completar")} disabled={ocupado} />
                    <span>
                      <span className="font-medium text-navy-900">Completar campos vazios</span>
                      <span className="block text-xs text-graphite-500">Preenche só o que está em branco no sistema. Nunca troca um valor já gravado.</span>
                    </span>
                  </label>
                </div>
              </div>
            )}

            <div className="mt-5 flex flex-wrap items-center gap-3">
              <button className="btn-primary" onClick={confirmar} disabled={ocupado || temErro || (totalCriar === 0 && totalCompletar === 0)}>
                {ocupado ? "Importando..." : totalCompletar > 0 ? `Importar ${totalCriar} novo(s) e completar ${totalCompletar}` : `Importar ${totalCriar} registro(s)`}
              </button>
              {temErro && <span className="text-sm text-graphite-500">Corrija os erros acima para liberar a importação.</span>}
              {!temErro && totalCriar === 0 && totalCompletar === 0 && <span className="text-sm text-graphite-500">Não há nada novo para importar.</span>}
            </div>
          </div>
        )}

        {concluida && (
          <div className="rounded-lg border border-safety-green/40 bg-green-50/40 p-4">
            <p className="flex items-center gap-2 text-sm font-semibold text-safety-green-dark">
              <CheckCircle2 className="h-4 w-4" /> Importação concluída
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
    </Modal>
  );
}
