-- Catalogo padrao de tipos de equipamento recondicionavel (motor, redutor, bomba, rolo,
-- unidade compressora, trocador de calor) - sem "level" porque nao sao nivel de hierarquia
-- de ativo, sao o tipo do equipamento em si (mesmo raciocinio do "Motor"/"Compressor" que
-- ja existiam no catalogo antes da hierarquia de niveis). Com codePrefix para sugerir o
-- proximo codigo ao cadastrar um equipamento recondicionavel deste tipo. So insere quem
-- ainda nao existe no catalogo global (case-insensitive) - nao mexe em nenhum tipo que a
-- RLP Maintenance ou os clientes ja cadastraram.
INSERT INTO "asset_types" ("id", "clientId", "name", "codePrefix", "active", "createdAt")
SELECT '22222222-2222-4222-8222-222222222201', NULL, 'Motor', 'MOT', true, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "asset_types" WHERE "clientId" IS NULL AND lower("name") = lower('Motor'));

INSERT INTO "asset_types" ("id", "clientId", "name", "codePrefix", "active", "createdAt")
SELECT '22222222-2222-4222-8222-222222222202', NULL, 'Redutor', 'RED', true, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "asset_types" WHERE "clientId" IS NULL AND lower("name") = lower('Redutor'));

INSERT INTO "asset_types" ("id", "clientId", "name", "codePrefix", "active", "createdAt")
SELECT '22222222-2222-4222-8222-222222222203', NULL, 'Bomba', 'BMB', true, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "asset_types" WHERE "clientId" IS NULL AND lower("name") = lower('Bomba'));

INSERT INTO "asset_types" ("id", "clientId", "name", "codePrefix", "active", "createdAt")
SELECT '22222222-2222-4222-8222-222222222204', NULL, 'Rolo', 'ROL', true, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "asset_types" WHERE "clientId" IS NULL AND lower("name") = lower('Rolo'));

INSERT INTO "asset_types" ("id", "clientId", "name", "codePrefix", "active", "createdAt")
SELECT '22222222-2222-4222-8222-222222222205', NULL, 'Unidade compressora', 'UCM', true, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "asset_types" WHERE "clientId" IS NULL AND lower("name") = lower('Unidade compressora'));

INSERT INTO "asset_types" ("id", "clientId", "name", "codePrefix", "active", "createdAt")
SELECT '22222222-2222-4222-8222-222222222206', NULL, 'Trocador de calor', 'TRC', true, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "asset_types" WHERE "clientId" IS NULL AND lower("name") = lower('Trocador de calor'));
