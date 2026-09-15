import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { KeyRound } from "lucide-react";
import { useAuth } from "../../auth/AuthContext";
import { getOwnClient } from "../../api/clients";
import { PageHeader } from "../../components/PageHeader";
import { FullPageSpinner } from "../../components/Spinner";
import { StatusBadge } from "../../components/StatusBadge";
import { ChangePasswordModal } from "../../components/ChangePasswordModal";
import { ClientLogo } from "../../components/ClientLogo";

export default function PortalProfile() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [passwordOpen, setPasswordOpen] = useState(false);
  const { data: client, isLoading } = useQuery({ queryKey: ["own-client"], queryFn: getOwnClient });
  // So o "Administrador" (perfil CLIENT) mexe na marca da empresa - Planejador e Tecnico
  // veem a ficha, mas nao trocam o logo, mesma linha do "Meu contrato" ao lado.
  const podeEditarLogo = user?.role === "CLIENT";

  if (isLoading || !client) return <FullPageSpinner />;

  return (
    <div>
      <PageHeader title="Meu perfil" description="Dados da sua conta e da sua empresa" />

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="card space-y-3 p-5">
          <h2 className="font-semibold text-navy-900">Sua conta</h2>
          <Info label="Nome" value={user?.name ?? "-"} />
          <Info label="E-mail" value={user?.email ?? "-"} />
          <div className="pt-2">
            <button type="button" className="btn-outline btn-sm" onClick={() => setPasswordOpen(true)}>
              <KeyRound className="h-4 w-4" /> Alterar minha senha
            </button>
          </div>
        </div>

        <div className="card space-y-3 p-5">
          <div className="flex items-center gap-2">
            <h2 className="font-semibold text-navy-900">{client.tradeName || client.companyName}</h2>
            <StatusBadge status={client.status} />
          </div>

          <div>
            <ClientLogo
              companyName={client.tradeName || client.companyName}
              logoUrl={client.logoUrl}
              podeEditar={podeEditarLogo}
              aoMudar={() => queryClient.invalidateQueries({ queryKey: ["own-client"] })}
            />
            {podeEditarLogo && (
              <p className="mt-2 text-xs text-graphite-500">
                Substitui a marca do RLP Maintenance no topo do Painel do CMMS da sua empresa.
              </p>
            )}
          </div>

          <Info label="Razão social" value={client.companyName} />
          <Info label="CNPJ" value={client.cnpj ?? "-"} />
          <Info label="Endereço" value={[client.addressStreet, client.addressNumber, client.addressCity, client.addressState].filter(Boolean).join(", ") || "-"} />
          <Info label="Telefone" value={client.phone ?? "-"} />
          <Info label="E-mail" value={client.email ?? "-"} />
        </div>

        <div className="card p-5 lg:col-span-2">
          <h2 className="mb-3 font-semibold text-navy-900">Contatos cadastrados</h2>
          {client.contacts && client.contacts.length > 0 ? (
            <ul className="divide-y divide-gray-100">
              {client.contacts.map((c) => (
                <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                  <span className="font-medium text-graphite-800">{c.name}</span>
                  <span className="text-graphite-500">{c.role}</span>
                  <span className="text-graphite-500">{c.email || c.phone}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-graphite-500">Nenhum contato adicional cadastrado.</p>
          )}
          <p className="mt-4 text-xs text-graphite-400">
            Para atualizar dados cadastrais ou contatos, fale com nossa equipe comercial.
          </p>
        </div>
      </div>

      <ChangePasswordModal open={passwordOpen} onClose={() => setPasswordOpen(false)} />
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-graphite-400">{label}</dt>
      <dd className="mt-0.5 text-sm font-medium text-graphite-800">{value}</dd>
    </div>
  );
}
