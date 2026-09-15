import { useQuery } from "@tanstack/react-query";
import { listRoleDefinitions } from "../../../api/users";
import { Modal } from "../../../components/Modal";
import { InlineSpinner } from "../../../components/Spinner";

export function RolesInfoModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data, isLoading } = useQuery({ queryKey: ["role-definitions"], queryFn: listRoleDefinitions, enabled: open });

  return (
    <Modal open={open} onClose={onClose} title="Perfis e permissões" size="lg">
      {isLoading && <InlineSpinner />}
      <div className="space-y-4">
        {data?.map((role) => (
          <div key={role.key} className="rounded-lg border border-gray-200 p-4">
            <h3 className="font-semibold text-navy-900">{role.label}</h3>
            {role.description && <p className="mt-1 text-sm text-graphite-500">{role.description}</p>}
            <ul className="mt-3 flex flex-wrap gap-2">
              {role.permissions.map((p) => (
                <li key={p} className="rounded-full bg-navy-50 px-2.5 py-1 text-xs font-medium text-navy-700">{p}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </Modal>
  );
}
