-- Cria um novo usuario ADMIN, pois o acesso ao admin original (cmmsrlp@gmail.com) foi
-- perdido. mustChangePassword=true forca a troca da senha temporaria no primeiro login.
INSERT INTO "users" (id, name, email, "passwordHash", role, active, "mustChangePassword", "createdAt", "updatedAt")
VALUES (
  '7d61c1f4-3edd-4d89-b8ea-51fc9cad8c7e',
  'Administrador RLP Maintenance',
  'admin@rlpmaintenance.com.br',
  '$2a$12$pIOgCj4D4eQDmTrlLXTgUO2jcEwDhh2rfFDRgXbc4YpOFHqxi.G6G',
  'ADMIN',
  true,
  true,
  now(),
  now()
)
ON CONFLICT (email) DO NOTHING;
