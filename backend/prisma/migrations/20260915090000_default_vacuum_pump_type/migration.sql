-- Faltou no catalogo padrao anterior (20260915080000): Bomba de vacuo tem ficha tecnica
-- propria (frontend/src/lib/camposPorTipoDeAtivo.ts), diferente da Bomba generica.
INSERT INTO "asset_types" ("id", "clientId", "name", "codePrefix", "active", "createdAt")
SELECT '22222222-2222-4222-8222-222222222207', NULL, 'Bomba de vácuo', 'BVA', true, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "asset_types" WHERE "clientId" IS NULL AND lower("name") = lower('Bomba de vácuo'));
