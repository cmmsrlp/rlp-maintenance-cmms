import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Users, Gauge, BadgeCheck, CircleSlash, Plus, KeyRound, UserX, AlertTriangle, History } from "lucide-react";
import { createUser, updateUser, resetUserPassword, listarHistoricoDeAcessos } from "../../api/users";
import { Modal } from "../../components/Modal";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { TextInput, SelectInput } from "../../components/form/Field";
import { useToast } from "../../components/Toast";
import { getApiErrorMessage } from "../../api/client";
import { useAuth } from "../../auth/AuthContext";
import {
  DESCRICAO_DO_PERFIL,
  PERFIS_QUE_OCUPAM_VAGA,
  ROTULO_DO_PERFIL,
  perfisQuePodeGerenciar,
} from "../../lib/perfis";
import type { Role } from "../../api/types";
import { getOwnClient } from "../../api/clients";
import { PageHeader } from "../../components/PageHeader";
import { FullPageSpinner } from "../../components/Spinner";
import { EmptyState } from "../../components/EmptyState";
import { formatCurrency, formatDate, formatDateTime } from "../../lib/format";

/** Barra de uso de um limite do contrato. Sem limite definido nao existe percentual - e'
 * "ilimitado", nao 0% nem 100%. */
function Uso({
  rotulo,
  atual,
  limite,
  unidade,
  semPlano,
  icone: Icone,
}: {
  rotulo: string;
  atual: number;
  limite: number | null;
  unidade: string;
  semPlano: boolean;
  icone: typeof Users;
}) {
  const semLimite = limite == null;
  const restantes = semLimite ? null : Math.max(0, limite - atual);
  const pct = semLimite ? null : Math.min(100, Math.round((atual / Math.max(1, limite)) * 100));

  // Tres faixas, e nao so "cheio": a 80% ainda da tempo de conversar sobre o plano sem
  // pressa; a 100% o cadastro ja esta bloqueado e o aviso precisa dizer isso.
  const faixa = pct == null ? "ok" : pct >= 100 ? "cheio" : pct >= 90 ? "critico" : pct >= 80 ? "atencao" : "ok";
  const cor = {
    ok: { borda: "", barra: "bg-navy-600", texto: "text-graphite-500" },
    atencao: { borda: "border-safety-yellow/40", barra: "bg-safety-yellow", texto: "text-safety-yellow-dark" },
    critico: { borda: "border-safety-yellow/60", barra: "bg-safety-yellow", texto: "font-medium text-safety-yellow-dark" },
    cheio: { borda: "border-safety-red/50", barra: "bg-safety-red", texto: "font-medium text-safety-red" },
  }[faixa];

  const mensagem =
    faixa === "cheio"
      ? `Limite atingido - contrate um plano superior para incluir mais ${unidade}.`
      : faixa === "critico"
        ? `Ainda cabem ${restantes} ${unidade} - o limite está perto.`
        : faixa === "atencao"
          ? `Ainda cabem ${restantes} ${unidade} (${pct}% do plano em uso).`
          : `Ainda cabem ${restantes} ${unidade}.`;

  return (
    <div className={`card p-5 ${cor.borda}`}>
      <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-graphite-400">
        <Icone className="h-4 w-4" /> {rotulo}
      </div>
      <p className="mt-1 text-2xl font-bold text-navy-900">
        {atual}
        {!semLimite && <span className="text-base font-medium text-graphite-400"> / {limite}</span>}
      </p>

      {semLimite ? (
        // "Ilimitado no plano" e "sem plano definido" parecem a mesma coisa na tela e sao
        // opostos: um e' escolha contratada, o outro e' ausencia de contrato.
        <p className="mt-1 text-xs text-graphite-500">{semPlano ? "Sem plano definido - nenhum limite aplicado." : "Ilimitado no seu plano."}</p>
      ) : (
        <>
          <div className="mt-2 h-2 rounded-full bg-gray-100">
            <div className={`h-2 rounded-full ${cor.barra}`} style={{ width: `${Math.max(2, pct ?? 0)}%` }} />
          </div>
          <p className={`mt-1.5 flex items-center gap-1.5 text-xs ${cor.texto}`}>
            {faixa !== "ok" && <AlertTriangle className="h-3.5 w-3.5 shrink-0" />}
            {mensagem}
          </p>
        </>
      )}
    </div>
  );
}

const SITUACAO_DO_CONTRATO: Record<string, { rotulo: string; classe: string }> = {
  TRIAL: { rotulo: "Em teste", classe: "border-navy-200 bg-navy-50 text-navy-700" },
  ACTIVE: { rotulo: "Ativo", classe: "border-green-200 bg-green-50 text-safety-green-dark" },
  SUSPENDED: { rotulo: "Suspenso", classe: "border-yellow-200 bg-yellow-50 text-safety-yellow-dark" },
  CANCELED: { rotulo: "Cancelado", classe: "border-red-200 bg-red-50 text-safety-red" },
};

/** Contrato do cliente: qual plano, o que ele da direito, quem ja usa e quanto ainda cabe.
 * Antes o cliente so descobria o limite quando um cadastro era recusado. */
export default function PortalContract() {
  const { data: empresa, isLoading } = useQuery({ queryKey: ["own-client"], queryFn: getOwnClient });
  const queryClient = useQueryClient();
  const { notify } = useToast();
  const { user: eu } = useAuth();

  const [novoAberto, setNovoAberto] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", password: "", role: "REQUESTER" as Role });
  const [desativando, setDesativando] = useState<{ id: string; name: string } | null>(null);
  const [senhaGerada, setSenhaGerada] = useState<{ email: string; senha: string } | null>(null);
  const [filtroPerfil, setFiltroPerfil] = useState<"" | Role>("");
  const [filtroStatus, setFiltroStatus] = useState<"" | "ativos" | "inativos">("");
  const [historicoAberto, setHistoricoAberto] = useState(false);

  // O historico so e' buscado quando alguem abre: numa empresa antiga sao milhares de
  // linhas que ninguem pediu para ver ao entrar na tela.
  const { data: historico } = useQuery({
    queryKey: ["historico-de-acessos"],
    queryFn: () => listarHistoricoDeAcessos({ pageSize: 50 }),
    enabled: historicoAberto,
  });

  function recarregar() {
    queryClient.invalidateQueries({ queryKey: ["own-client"] });
  }

  /** Senha inicial forte, gerada aqui: e' melhor do que a pessoa escolher "123456" as
   * pressas, e ela troca no primeiro acesso. */
  function senhaForte(): string {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789@#$%&*";
    const bytes = new Uint32Array(14);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (b) => chars[b % chars.length]).join("");
  }

  function abrirNovo() {
    setForm({ name: "", email: "", password: senhaForte(), role: "REQUESTER" });
    setNovoAberto(true);
  }

  async function criarAcesso() {
    setSalvando(true);
    try {
      await createUser({ name: form.name, email: form.email, password: form.password, role: form.role });
      setSenhaGerada({ email: form.email, senha: form.password });
      setNovoAberto(false);
      notify("success", "Acesso liberado.");
      recarregar();
    } catch (error) {
      notify("error", getApiErrorMessage(error));
    } finally {
      setSalvando(false);
    }
  }

  async function alternarAtivo(id: string, ativo: boolean) {
    try {
      await updateUser(id, { active: ativo });
      notify("success", ativo ? "Acesso reativado." : "Acesso desativado.");
      recarregar();
    } catch (error) {
      notify("error", getApiErrorMessage(error));
    }
  }

  async function redefinirSenha(id: string, email: string) {
    try {
      const temporaryPassword = await resetUserPassword(id);
      setSenhaGerada({ email, senha: temporaryPassword });
      notify("success", "Senha redefinida.");
    } catch (error) {
      notify("error", getApiErrorMessage(error));
    }
  }

  if (isLoading) return <FullPageSpinner />;
  if (!empresa) return <EmptyState title="Empresa não encontrada" description="Não foi possível carregar os dados do seu contrato." />;

  const plano = empresa.plan;
  const uso = empresa.planUsage;
  const usuarios = empresa.users ?? [];
  // Limite atingido: a API recusa e a tela precisa dizer antes, e nao depois de preencher
  // o formulario inteiro.
  const semVaga = uso?.users.limit != null && uso.users.current >= uso.users.limit;

  const usuariosFiltrados = usuarios.filter(
    (u) =>
      (!filtroPerfil || u.role === filtroPerfil) &&
      (!filtroStatus || (filtroStatus === "ativos" ? u.active : !u.active)),
  );

  return (
    <div>
      <PageHeader
        title="Meu contrato"
        description="Plano contratado, acessos liberados e quanto ainda cabe"
        breadcrumbs={[{ label: "Portal", to: "/portal" }, { label: "Meu contrato" }]}
      />

      <div className="card mb-6 p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-graphite-400">Plano contratado</p>
            <div className="mt-0.5 flex flex-wrap items-center gap-2">
              <p className="text-xl font-bold text-navy-900">{plano?.name ?? "Sem plano atribuído"}</p>
              {empresa.contractStatus && SITUACAO_DO_CONTRATO[empresa.contractStatus] && (
                <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${SITUACAO_DO_CONTRATO[empresa.contractStatus].classe}`}>
                  {SITUACAO_DO_CONTRATO[empresa.contractStatus].rotulo}
                </span>
              )}
            </div>
            {plano?.description && <p className="mt-1 text-sm text-graphite-600">{plano.description}</p>}
            {!plano && (
              <p className="mt-1 text-sm text-graphite-500">
                Sua empresa está sem plano definido no sistema - não há limite de acessos nem de ativos aplicado.
                Para contratar ou ajustar, fale com a OptiProcess.
              </p>
            )}
          </div>
          {plano?.priceMonthly != null && (
            <div className="text-right">
              <p className="text-xs uppercase tracking-wide text-graphite-400">Mensalidade</p>
              <p className="mt-0.5 text-lg font-semibold text-navy-900">{formatCurrency(plano.priceMonthly)}</p>
            </div>
          )}
        </div>

        {plano && plano.features.length > 0 && (
          <ul className="mt-4 grid gap-1.5 sm:grid-cols-2">
            {plano.features.map((f) => (
              <li key={f} className="flex items-start gap-2 text-sm text-graphite-700">
                <BadgeCheck className="mt-0.5 h-4 w-4 shrink-0 text-safety-green" /> {f}
              </li>
            ))}
          </ul>
        )}

        {empresa.contractedServices?.length > 0 && (
          <p className="mt-4 text-xs text-graphite-500">
            Serviços contratados: {empresa.contractedServices.length} área(s) liberada(s) no seu portal.
          </p>
        )}
      </div>

      {uso && (
        <div className="mb-8 grid gap-4 sm:grid-cols-2">
          <Uso rotulo="Acessos (usuários)" atual={uso.users.current} limite={uso.users.limit} unidade="acessos" semPlano={!plano} icone={Users} />
          <Uso rotulo="Ativos cadastrados" atual={uso.instruments.current} limite={uso.instruments.limit} unidade="ativos" semPlano={!plano} icone={Gauge} />
        </div>
      )}

      {uso?.requesters != null && (
        <div className="mb-8 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
          <p className="text-sm text-graphite-700">
            <span className="font-semibold text-navy-900">{uso.requesters}</span> solicitante(s) cadastrado(s) - eles
            abrem e acompanham as próprias solicitações de serviço e <span className="font-medium">não consomem vaga</span>{" "}
            do plano, em qualquer plano.
          </p>
        </div>
      )}

      <div>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="font-semibold text-navy-900">Acessos da sua empresa</h2>
            <p className="text-xs text-graphite-500">
              Gestor usa o CMMS inteiro e ocupa vaga do plano. Solicitante só abre e acompanha as próprias
              solicitações - e não ocupa vaga, em nenhum plano.
            </p>
          </div>
          <button className="btn-primary shrink-0" onClick={abrirNovo}>
            <Plus className="h-4 w-4" /> Novo acesso
          </button>
        </div>

        <div className="mb-3 flex flex-wrap items-center gap-3">
          <select
            className="input sm:w-56"
            value={filtroPerfil}
            onChange={(e) => setFiltroPerfil(e.target.value as "" | Role)}
          >
            <option value="">Todos os perfis</option>
            {(["CLIENT", "CLIENT_PLANNER", "CLIENT_TECHNICIAN", "REQUESTER"] as Role[]).map((r) => (
              <option key={r} value={r}>{ROTULO_DO_PERFIL[r]}</option>
            ))}
          </select>
          <select
            className="input sm:w-44"
            value={filtroStatus}
            onChange={(e) => setFiltroStatus(e.target.value as "" | "ativos" | "inativos")}
          >
            <option value="">Ativos e inativos</option>
            <option value="ativos">Somente ativos</option>
            <option value="inativos">Somente inativos</option>
          </select>
          {(filtroPerfil || filtroStatus) && (
            <span className="text-xs text-graphite-500">
              {usuariosFiltrados.length} de {usuarios.length} acesso(s)
            </span>
          )}
          <button
            className="btn-ghost ml-auto text-sm"
            onClick={() => setHistoricoAberto((v) => !v)}
          >
            <History className="h-4 w-4" /> {historicoAberto ? "Ocultar histórico" : "Ver histórico"}
          </button>
        </div>

        {usuariosFiltrados.length === 0 ? (
          <EmptyState
            title={usuarios.length === 0 ? "Nenhum acesso cadastrado" : "Nenhum acesso com esses filtros"}
            description={
              usuarios.length === 0
                ? "Nenhum acesso ao portal foi liberado ainda."
                : "Mude o perfil ou o status acima para ver os demais."
            }
          />
        ) : (
          <div className="card divide-y divide-gray-100">
            {usuariosFiltrados.map((u) => (
              <div key={u.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div className="min-w-0">
                  <p className="font-medium text-navy-900">
                    {u.name}
                    {u.id === eu?.id && <span className="ml-2 text-xs font-normal text-graphite-400">(você)</span>}
                  </p>
                  <p className="text-xs text-graphite-500">
                    {u.email} - {u.role ? ROTULO_DO_PERFIL[u.role] : "-"}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-4">
                  {/* O proprio acesso nao se mexe daqui: desativar a si mesmo trancaria a
                      empresa para fora do portal, sem ninguem la dentro para desfazer. */}
                  {u.id !== eu?.id && (
                    <div className="flex items-center gap-2">
                      <button
                        className="text-graphite-400 hover:text-navy-700"
                        title="Gerar nova senha"
                        aria-label="Gerar nova senha"
                        onClick={() => void redefinirSenha(u.id, u.email)}
                      >
                        <KeyRound className="h-4 w-4" />
                      </button>
                      <button
                        className="text-graphite-400 hover:text-safety-red"
                        title={u.active ? "Desativar acesso" : "Reativar acesso"}
                        aria-label={u.active ? "Desativar acesso" : "Reativar acesso"}
                        onClick={() =>
                          u.active ? setDesativando({ id: u.id, name: u.name }) : void alternarAtivo(u.id, true)
                        }
                      >
                        <UserX className="h-4 w-4" />
                      </button>
                    </div>
                  )}
                <div className="text-right">
                  {u.active ? (
                    <span className="rounded-full border border-green-200 bg-green-50 px-2 py-0.5 text-xs font-medium text-safety-green-dark">
                      Ativo
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-full border border-gray-200 bg-gray-50 px-2 py-0.5 text-xs font-medium text-graphite-500">
                      <CircleSlash className="h-3 w-3" /> Inativo
                    </span>
                  )}
                  <p className="mt-1 text-xs text-graphite-400">
                    {/* "Nunca acessou" e' informacao util: acesso liberado e nao usado
                        ocupa uma vaga do contrato sem entregar nada. */}
                    {u.lastLoginAt ? `Último acesso: ${formatDate(u.lastLoginAt)}` : "Nunca acessou"}
                  </p>
                  {u.createdAt && (
                    <p className="text-xs text-graphite-400">Criado em {formatDate(u.createdAt)}</p>
                  )}
                </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {historicoAberto && (
        <div className="card mt-4 p-5">
          <h3 className="flex items-center gap-2 font-semibold text-navy-900">
            <History className="h-4 w-4 text-navy-600" /> Histórico de acessos
          </h3>
          <p className="mt-0.5 text-xs text-graphite-500">
            Quem criou, mudou perfil, desativou, reativou ou gerou senha - e quando.
          </p>

          {!historico || historico.items.length === 0 ? (
            <p className="mt-3 text-sm text-graphite-500">Nenhum evento registrado ainda.</p>
          ) : (
            <ul className="mt-3 divide-y divide-gray-100 text-sm">
              {historico.items.map((e) => (
                <li key={e.id} className="flex flex-wrap items-baseline justify-between gap-2 py-2">
                  <span className="text-graphite-700">
                    {e.description ?? e.action}
                    {e.alvo && <span className="text-graphite-500"> - {e.alvo.name}</span>}
                  </span>
                  <span className="text-xs text-graphite-400">
                    {e.user?.name ?? "sistema"} - {formatDateTime(e.createdAt)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <Modal
        open={novoAberto}
        onClose={() => setNovoAberto(false)}
        title="Novo acesso"
        size="sm"
        footer={
          <>
            <button type="button" className="btn-outline" onClick={() => setNovoAberto(false)}>Cancelar</button>
            <button
              type="button"
              className="btn-primary"
              disabled={
                salvando ||
                form.name.trim().length < 2 ||
                !form.email.includes("@") ||
                (PERFIS_QUE_OCUPAM_VAGA.includes(form.role) && semVaga)
              }
              onClick={() => void criarAcesso()}
            >
              {salvando ? "Liberando..." : "Liberar acesso"}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <TextInput label="Nome" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <TextInput
            label="E-mail"
            required
            type="email"
            hint="É com ele que a pessoa entra no portal."
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />
          {/* So os perfis que ESTE usuario pode criar - a mesma lista que a API aceita.
              Um Tecnico so cadastra Solicitante; oferecer mais so geraria um 403. */}
          <SelectInput
            label="Perfil"
            hint="Solicitante não ocupa vaga do plano; os demais ocupam."
            options={perfisQuePodeGerenciar(eu?.role).map((r) => ({
              value: r,
              label: `${ROTULO_DO_PERFIL[r]} - ${DESCRICAO_DO_PERFIL[r] ?? ""}`,
            }))}
            value={form.role}
            onChange={(e) => setForm({ ...form, role: e.target.value as Role })}
          />
          {PERFIS_QUE_OCUPAM_VAGA.includes(form.role) && semVaga && (
            <p className="rounded-lg border border-safety-red/30 bg-red-50/50 px-3 py-2 text-xs text-safety-red">
              O limite de acessos do plano foi atingido. Contrate um plano superior, ou desative um acesso que não
              esteja em uso - Solicitante continua liberado, porque não ocupa vaga.
            </p>
          )}
          <div>
            <TextInput
              label="Senha inicial"
              required
              hint="Gerada automaticamente. Passe para a pessoa - ela troca no primeiro acesso, em Meu perfil."
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
            />
            <button type="button" className="btn-ghost mt-1 text-xs" onClick={() => setForm({ ...form, password: senhaForte() })}>
              Gerar outra
            </button>
          </div>
        </div>
      </Modal>

      {/* A senha aparece UMA vez e nao fica guardada em lugar nenhum legivel: depois daqui,
          so redefinindo. */}
      <Modal
        open={!!senhaGerada}
        onClose={() => setSenhaGerada(null)}
        title="Anote a senha agora"
        size="sm"
        footer={<button type="button" className="btn-primary" onClick={() => setSenhaGerada(null)}>Já anotei</button>}
      >
        <p className="text-sm text-graphite-700">
          Passe estes dados para <span className="font-medium text-navy-900">{senhaGerada?.email}</span>. Esta senha não
          será mostrada de novo - se perder, gere outra pelo ícone da chave.
        </p>
        <p className="mt-3 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 font-mono text-lg text-navy-900">
          {senhaGerada?.senha}
        </p>
      </Modal>

      <ConfirmDialog
        open={!!desativando}
        title="Desativar este acesso"
        description={`${desativando?.name ?? ""} deixa de entrar no portal. O histórico do que ela fez continua guardado, e o acesso pode ser reativado depois.`}
        confirmLabel="Desativar"
        danger
        onConfirm={() => {
          if (desativando) void alternarAtivo(desativando.id, false);
          setDesativando(null);
        }}
        onCancel={() => setDesativando(null)}
      />
    </div>
  );
}
