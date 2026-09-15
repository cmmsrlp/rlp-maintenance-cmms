import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, KeyRound, Info, RefreshCw } from "lucide-react";
import { listUsers, resetUserPassword, updateUser } from "../../../api/users";
import type { Role, UserAccount } from "../../../api/types";
import { PageHeader } from "../../../components/PageHeader";
import { DataTable } from "../../../components/DataTable";
import { StatusBadge } from "../../../components/StatusBadge";
import { formatDateTime, formatRole } from "../../../lib/format";
import { UserFormModal } from "./UserFormModal";
import { RolesInfoModal } from "./RolesInfoModal";
import { SetPasswordModal } from "./SetPasswordModal";
import { useToast } from "../../../components/Toast";
import { getApiErrorMessage } from "../../../api/client";
import { Modal } from "../../../components/Modal";
import { ConfirmDialog } from "../../../components/ConfirmDialog";

const ROLE_OPTIONS: { value: Role; label: string }[] = [
  { value: "ADMIN", label: "Administrador" },
  { value: "TECHNICIAN", label: "Técnico" },
  { value: "COMMERCIAL", label: "Comercial" },
  { value: "CLIENT", label: "Cliente" },
];

export default function UsersList() {
  const queryClient = useQueryClient();
  const { notify } = useToast();

  const [role, setRole] = useState<Role | "">("");
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserAccount | undefined>();
  const [passwordUser, setPasswordUser] = useState<UserAccount | undefined>();
  // Gerar senha aleatoria descarta a senha atual: exige confirmacao explicita,
  // para ninguem perder o proprio acesso com um clique sem querer.
  const [resetUser, setResetUser] = useState<UserAccount | undefined>();
  const [resetting, setResetting] = useState(false);
  const [rolesOpen, setRolesOpen] = useState(false);
  const [tempPassword, setTempPassword] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["users", role, page],
    queryFn: () => listUsers({ role: role || undefined, page, pageSize: 15 }),
  });

  async function handleToggleActive(id: string, active: boolean) {
    try {
      await updateUser(id, { active: !active });
      queryClient.invalidateQueries({ queryKey: ["users"] });
    } catch (error) {
      notify("error", getApiErrorMessage(error));
    }
  }

  async function handleResetPassword() {
    if (!resetUser) return;
    setResetting(true);
    try {
      const password = await resetUserPassword(resetUser.id);
      setResetUser(undefined);
      setTempPassword(password);
    } catch (error) {
      notify("error", getApiErrorMessage(error));
    } finally {
      setResetting(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Usuários e perfis"
        description="Contas de acesso à gestão interna e ao portal do cliente"
        actions={
          <>
            <button className="btn-outline" onClick={() => setRolesOpen(true)}>
              <Info className="h-4 w-4" /> Perfis e permissões
            </button>
            <button className="btn-primary" onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4" /> Novo usuário
            </button>
          </>
        }
      />

      <div className="mb-4 max-w-xs">
        <select className="input" value={role} onChange={(e) => { setRole(e.target.value as Role | ""); setPage(1); }}>
          <option value="">Todos os perfis</option>
          {ROLE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>

      <DataTable
        loading={isLoading}
        rows={data?.items ?? []}
        keyField={(u) => u.id}
        pagination={data}
        onPageChange={setPage}
        onRowClick={(u) => setEditingUser(u)}
        emptyTitle="Nenhum usuário cadastrado"
        columns={[
          { header: "Nome", accessor: (u) => <span className="font-medium text-navy-900">{u.name}</span> },
          { header: "E-mail", accessor: (u) => u.email },
          { header: "Perfil", accessor: (u) => formatRole(u.role) },
          { header: "Empresa", accessor: (u) => u.client?.tradeName || u.client?.companyName || "-" },
          { header: "Último acesso", accessor: (u) => formatDateTime(u.lastLoginAt) },
          {
            header: "Ativo",
            accessor: (u) => (
              <button onClick={(e) => { e.stopPropagation(); handleToggleActive(u.id, u.active); }}>
                <StatusBadge status={u.active ? "ACTIVE" : "INACTIVE"} />
              </button>
            ),
          },
          {
            header: "Senha",
            accessor: (u) => (
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={(e) => { e.stopPropagation(); setPasswordUser(u); }}
                  className="btn-outline btn-sm whitespace-nowrap"
                  title="Você digita a nova senha"
                >
                  <KeyRound className="h-3.5 w-3.5" /> Definir senha
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); setResetUser(u); }}
                  className="btn-ghost btn-sm whitespace-nowrap text-graphite-500"
                  title="Substitui a senha atual por uma aleatória"
                >
                  <RefreshCw className="h-3.5 w-3.5" /> Gerar aleatória
                </button>
              </div>
            ),
          },
        ]}
      />

      <UserFormModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onSaved={() => {
          setCreateOpen(false);
          queryClient.invalidateQueries({ queryKey: ["users"] });
        }}
      />
      <UserFormModal
        open={!!editingUser}
        user={editingUser}
        onClose={() => setEditingUser(undefined)}
        onSaved={() => {
          setEditingUser(undefined);
          queryClient.invalidateQueries({ queryKey: ["users"] });
        }}
      />
      <RolesInfoModal open={rolesOpen} onClose={() => setRolesOpen(false)} />
      <SetPasswordModal user={passwordUser} onClose={() => setPasswordUser(undefined)} />

      <ConfirmDialog
        open={!!resetUser}
        title="Gerar senha aleatória"
        description={
          `A senha atual de ${resetUser?.name ?? ""} será descartada e substituída por uma senha aleatória, ` +
          `exibida uma única vez. Use isto só quando a senha foi esquecida. Para escolher a senha você mesmo, ` +
          `use "Definir senha".`
        }
        confirmLabel="Gerar senha aleatória"
        danger
        loading={resetting}
        onConfirm={handleResetPassword}
        onCancel={() => setResetUser(undefined)}
      />

      <Modal open={!!tempPassword} onClose={() => setTempPassword(null)} title="Senha temporária gerada" size="sm">
        <p className="text-sm font-medium text-safety-red">
          Anote agora: esta senha não será exibida novamente.
        </p>
        <p className="mt-2 text-sm text-graphite-600">
          A senha anterior deixou de funcionar. Repasse esta ao usuário por um canal seguro.
        </p>
        <p className="mt-3 select-all rounded-md bg-navy-50 px-3 py-2 text-center font-mono text-lg font-bold text-navy-900">
          {tempPassword}
        </p>
      </Modal>
    </div>
  );
}
