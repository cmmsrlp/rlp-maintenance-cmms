import { forwardRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { listUsers } from "../api/users";
import type { Role } from "../api/types";
import { SelectInput } from "./form/Field";

interface UserPickerProps {
  label?: string;
  error?: string;
  required?: boolean;
  roles: Role[];
  name: string;
  onChange?: (e: React.ChangeEvent<HTMLSelectElement>) => void;
  onBlur?: (e: React.FocusEvent<HTMLSelectElement>) => void;
}

export const UserPicker = forwardRef<HTMLSelectElement, UserPickerProps>(function UserPicker(
  { label = "Responsável", error, required, roles, ...rest },
  ref,
) {
  const { data } = useQuery({
    queryKey: ["users-picker", roles.join(",")],
    queryFn: async () => {
      const results = await Promise.all(roles.map((role) => listUsers({ role, active: true, pageSize: 100 })));
      return results.flatMap((r) => r.items);
    },
    staleTime: 60_000,
  });

  return (
    <SelectInput
      ref={ref}
      label={label}
      required={required}
      error={error}
      placeholder="Selecione"
      options={(data ?? []).map((u) => ({ value: u.id, label: u.name }))}
      {...rest}
    />
  );
});
