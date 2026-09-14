import type { Request, Response } from "express";
import { z } from "zod";
import { Role } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { asyncHandler } from "../../utils/asyncHandler";
import { parsePageParams, toSkipTake, buildPagedResult } from "../../utils/pagination";
import { hashPassword, generateTemporaryPassword } from "../../lib/password";
import { ForbiddenError, NotFoundError, ValidationError } from "../../utils/errors";
import { writeAuditLog } from "../../utils/audit";
import { assertUserLimitNotExceeded } from "../../lib/planLimits";
import {
  CLIENT_ADMIN,
  PERFIS_DA_EMPRESA,
  ROTULO_DO_PERFIL,
  perfisQuePodeGerenciar,
  podeGerenciarPerfil,
} from "../../lib/perfis";

/** Perfis que pertencem a uma empresa e por isso exigem clientId. */
const PERFIS_DE_CLIENTE: Role[] = PERFIS_DA_EMPRESA;

/** true quando quem esta pedindo e' da equipe do cliente (e nao da OptiProcess). */
function ehDaEmpresa(req: Request): boolean {
  return !!req.user && PERFIS_DA_EMPRESA.includes(req.user.role);
}

/**
 * Cerca de quem administra quem.
 *
 * Vale para criar, editar, desativar, reativar e redefinir senha. A regra e' a mesma da
 * vida real - ninguem administra quem esta acima - e mora em src/lib/perfis.ts, porque a
 * tela, a rota e a API precisam responder a mesma coisa.
 */
function assertPodeAdministrar(req: Request, alvo: { id: string; clientId: string | null; role: Role }) {
  if (!ehDaEmpresa(req) || !req.user) return;

  if (!req.user.clientId || alvo.clientId !== req.user.clientId) {
    throw new ForbiddenError("Voce so administra os acessos da sua propria empresa.");
  }
  if (alvo.id === req.user.sub) {
    // Rebaixar ou desativar o proprio acesso tranca a pessoa para fora sem ninguem para
    // desfazer. Trocar a propria senha continua sendo em "Meu perfil".
    throw new ValidationError("Voce nao pode alterar o proprio acesso por aqui. Use Meu perfil.");
  }
  if (!podeGerenciarPerfil(req.user.role, alvo.role)) {
    throw new ForbiddenError(
      `Como ${ROTULO_DO_PERFIL[req.user.role]}, voce nao administra acessos do perfil ${ROTULO_DO_PERFIL[alvo.role] ?? alvo.role}.`,
    );
  }
}

/**
 * A empresa nao pode ficar sem Administrador.
 *
 * Sem nenhum ativo, ninguem la dentro consegue criar acesso, mexer no contrato nem
 * reativar o proprio time - so abrindo chamado para a OptiProcess.
 */
async function assertNaoEhOUltimoAdmin(alvo: { id: string; clientId: string | null; role: Role }, acao: string) {
  if (alvo.role !== CLIENT_ADMIN || !alvo.clientId) return;
  const outros = await prisma.user.count({
    where: { clientId: alvo.clientId, deletedAt: null, active: true, role: CLIENT_ADMIN, id: { not: alvo.id } },
  });
  if (outros === 0) {
    throw new ValidationError(
      `Este e' o unico Administrador ativo da empresa - ${acao} deixaria a empresa sem quem administre acessos e contrato. Promova outra pessoa antes.`,
    );
  }
}

const userSelect = {
  id: true,
  name: true,
  email: true,
  role: true,
  clientId: true,
  active: true,
  lastLoginAt: true,
  createdAt: true,
  client: { select: { id: true, companyName: true, tradeName: true } },
} as const;


/**
 * Historico de acessos da empresa: quem criou, mudou perfil, desativou, reativou ou gerou
 * senha, e quando.
 *
 * A auditoria ja era gravada; faltava alguem poder ler. Fica aqui e nao no modulo de
 * auditoria porque aquele e' da OptiProcess (registra a plataforma inteira) - este e'
 * recortado na empresa de quem pergunta, e so nos eventos de acesso.
 */
export const listUserAuditTrail = asyncHandler(async (req: Request, res: Response) => {
  const pageParams = parsePageParams(req.query as Record<string, unknown>);

  // Quais usuarios entram no recorte: os da propria empresa, para quem e' do cliente.
  const daEmpresa = await prisma.user.findMany({
    where: {
      // Equipe do cliente ve so a propria empresa; a OptiProcess pode recortar por uma.
      ...(ehDaEmpresa(req)
        ? { clientId: req.user?.clientId ?? "" }
        : req.query.clientId
          ? { clientId: String(req.query.clientId) }
          : {}),
    },
    select: { id: true, name: true, email: true, role: true },
  });
  const porId = new Map(daEmpresa.map((u) => [u.id, u]));

  const where = { entityType: "User", entityId: { in: daEmpresa.map((u) => u.id) } };
  const [items, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      ...toSkipTake(pageParams),
      include: { user: { select: { id: true, name: true, email: true } } },
    }),
    prisma.auditLog.count({ where }),
  ]);

  // O log guarda o id do alvo; a tela precisa do nome de quem sofreu a acao, nao do id.
  const comAlvo = items.map((registro) => ({
    ...registro,
    alvo: porId.get(registro.entityId) ?? null,
  }));

  res.json(buildPagedResult(comAlvo, total, pageParams));
});

export const listUsers = asyncHandler(async (req: Request, res: Response) => {
  const pageParams = parsePageParams(req.query as Record<string, unknown>);
  const { role, active, search, clientId } = req.query as {
    role?: Role;
    active?: string;
    search?: string;
    clientId?: string;
  };

  // Listar nao tinha o mesmo cerco que criar/editar/desativar ja tinham (assertPodeAdministrar) -
  // qualquer perfil autenticado da empresa (ate Solicitante) conseguia enumerar nome, e-mail e
  // ultimo acesso do time inteiro, Administrador incluso (achado numa varredura de perfis de
  // acesso). A visibilidade segue a mesma hierarquia de quem-administra-quem: ve a si mesmo e
  // quem esta autorizado a gerenciar. Cruza com o filtro ?role= pedido, em vez de deixar o
  // filtro pedido sobrepor o cerco (um Planejador pedindo ?role=CLIENT nao pode voltar a ver
  // Administrador so' porque perguntou por esse perfil especifico).
  const perfisVisiveis =
    ehDaEmpresa(req) && req.user ? [req.user.role, ...perfisQuePodeGerenciar(req.user.role)] : null;
  const perfisPermitidos = perfisVisiveis && role ? perfisVisiveis.filter((p) => p === role) : (perfisVisiveis ?? (role ? [role] : null));

  const where = {
    deletedAt: null,
    // A equipe do cliente enxerga a propria empresa; a OptiProcess enxerga todos, e pode
    // filtrar por uma empresa quando a tela precisa (ex.: ligar pessoa da mao de obra ao
    // acesso dela).
    ...(ehDaEmpresa(req) ? { clientId: req.user?.clientId ?? "" } : clientId ? { clientId } : {}),
    ...(perfisPermitidos ? { role: { in: perfisPermitidos } } : {}),
    ...(active !== undefined ? { active: active === "true" } : {}),
    ...(search
      ? {
          OR: [
            { name: { contains: search, mode: "insensitive" as const } },
            { email: { contains: search, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  const [items, total] = await Promise.all([
    prisma.user.findMany({ where, select: userSelect, orderBy: { name: "asc" }, ...toSkipTake(pageParams) }),
    prisma.user.count({ where }),
  ]);

  res.json(buildPagedResult(items, total, pageParams));
});

export const getUser = asyncHandler(async (req: Request, res: Response) => {
  const user = await prisma.user.findFirst({
    where: { id: req.params.id, deletedAt: null, ...(ehDaEmpresa(req) ? { clientId: req.user?.clientId ?? "" } : {}) },
    select: userSelect,
  });
  if (!user) throw new NotFoundError("Usuario");
  // Mesmo cerco do listUsers: so ve a ficha de quem esta autorizado a gerenciar (ou a si
  // mesmo), nao qualquer colega so' por saber o id.
  if (ehDaEmpresa(req) && req.user && user.id !== req.user.sub && !podeGerenciarPerfil(req.user.role, user.role)) {
    throw new ForbiddenError();
  }
  res.json(user);
});

const createUserSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(8, "A senha deve ter pelo menos 8 caracteres."),
  role: z.nativeEnum(Role),
  clientId: z.string().uuid().nullish(),
});

export const createUser = asyncHandler(async (req: Request, res: Response) => {
  const data = createUserSchema.parse(req.body);

  if (ehDaEmpresa(req)) {
    if (!req.user?.clientId) throw new ForbiddenError();
    // A empresa e' sempre a de quem esta criando - nao se escolhe.
    data.clientId = req.user.clientId;
    if (!podeGerenciarPerfil(req.user.role, data.role)) {
      const permitidos = perfisQuePodeGerenciar(req.user.role).map((r) => ROTULO_DO_PERFIL[r] ?? r);
      throw new ForbiddenError(
        permitidos.length > 0
          ? `Voce pode criar apenas acessos do(s) perfil(is): ${permitidos.join(", ")}.`
          : "Seu perfil nao cria acessos.",
      );
    }
  }

  // CLIENT e REQUESTER sao perfis de uma empresa: sem clientId eles nao alcancam dado
  // nenhum (o escopo por empresa e' o que define o que enxergam) - e ficavam com o portal
  // vazio, sem explicacao.
  if (PERFIS_DE_CLIENTE.includes(data.role) && !data.clientId) {
    throw new ValidationError("Usuarios do tipo Cliente precisam estar vinculados a uma empresa.");
  }
  // Solicitante nao ocupa vaga: o limite so vale para os acessos contratados.
  if (data.role === "CLIENT" && data.clientId) await assertUserLimitNotExceeded(data.clientId);

  const passwordHash = await hashPassword(data.password);
  const user = await prisma.user.create({
    data: {
      name: data.name,
      email: data.email.toLowerCase(),
      passwordHash,
      role: data.role,
      clientId: PERFIS_DE_CLIENTE.includes(data.role) ? data.clientId : null,
      // Senha escolhida por outra pessoa e passada por e-mail, WhatsApp ou papel: vale
      // para o primeiro acesso e nada mais.
      mustChangePassword: true,
    },
    select: userSelect,
  });

  await writeAuditLog({
    userId: req.user?.sub,
    action: "CREATE",
    entityType: "User",
    entityId: user.id,
    description: `Usuario ${user.name} criado`,
  });

  res.status(201).json(user);
});

const updateUserSchema = z.object({
  name: z.string().min(2).optional(),
  role: z.nativeEnum(Role).optional(),
  clientId: z.string().uuid().nullish(),
  active: z.boolean().optional(),
});

export const updateUser = asyncHandler(async (req: Request, res: Response) => {
  const data = updateUserSchema.parse(req.body);
  const existing = await prisma.user.findFirst({ where: { id: req.params.id, deletedAt: null } });
  if (!existing) throw new NotFoundError("Usuario");
  assertPodeAdministrar(req, existing);
  if (ehDaEmpresa(req)) {
    delete data.clientId; // nunca transfere alguem para outra empresa
    if (data.role && !podeGerenciarPerfil(req.user!.role, data.role)) {
      throw new ForbiddenError(`Voce nao pode atribuir o perfil ${ROTULO_DO_PERFIL[data.role] ?? data.role}.`);
    }
  }
  // Desativar ou rebaixar o unico Administrador ativo deixaria a empresa sem quem
  // administre - vale para a equipe da OptiProcess tambem.
  if (data.active === false) await assertNaoEhOUltimoAdmin(existing, "desativa-lo");
  if (data.role && data.role !== existing.role) await assertNaoEhOUltimoAdmin(existing, "mudar o perfil dele");

  // So conta contra o limite do plano quando o usuario esta passando a ocupar uma vaga
  // nova naquele cliente (role virando CLIENT, ou mudando de empresa) - reativar
  // (active:true) um usuario que ja pertencia ao cliente nao e' uma vaga nova.
  const ehPerfilDeCliente = PERFIS_DE_CLIENTE.includes(data.role ?? existing.role) || PERFIS_DE_CLIENTE.includes(existing.role);
  const nextClientId = ehPerfilDeCliente ? (data.clientId !== undefined ? data.clientId : existing.clientId) : null;
  const clientChanged = nextClientId && nextClientId !== existing.clientId;
  if (clientChanged) await assertUserLimitNotExceeded(nextClientId);

  const user = await prisma.user.update({
    where: { id: req.params.id },
    data: {
      name: data.name,
      role: data.role,
      active: data.active,
      clientId: ehPerfilDeCliente ? data.clientId : undefined,
    },
    select: userSelect,
  });

  await writeAuditLog({
    userId: req.user?.sub,
    action: "UPDATE",
    entityType: "User",
    entityId: user.id,
    description: `Usuario ${user.name} atualizado`,
  });

  res.json(user);
});

export const deleteUser = asyncHandler(async (req: Request, res: Response) => {
  const existing = await prisma.user.findFirst({ where: { id: req.params.id, deletedAt: null } });
  if (!existing) throw new NotFoundError("Usuario");
  assertPodeAdministrar(req, existing);
  await assertNaoEhOUltimoAdmin(existing, "remove-lo");

  await prisma.user.update({ where: { id: req.params.id }, data: { deletedAt: new Date(), active: false } });

  await writeAuditLog({
    userId: req.user?.sub,
    action: "DELETE",
    entityType: "User",
    entityId: existing.id,
    description: `Usuario ${existing.name} desativado/excluido`,
  });

  res.status(204).send();
});

export const resetPassword = asyncHandler(async (req: Request, res: Response) => {
  const existing = await prisma.user.findFirst({ where: { id: req.params.id, deletedAt: null } });
  if (!existing) throw new NotFoundError("Usuario");
  assertPodeAdministrar(req, existing);

  const temporaryPassword = generateTemporaryPassword();
  const passwordHash = await hashPassword(temporaryPassword);
  await prisma.user.update({ where: { id: req.params.id }, data: { passwordHash, mustChangePassword: true } });

  await writeAuditLog({
    userId: req.user?.sub,
    action: "UPDATE",
    entityType: "User",
    entityId: existing.id,
    description: "Senha redefinida pelo administrador",
  });

  // Sem servico de e-mail: a senha temporaria e devolvida uma unica vez para o
  // administrador repassar ao usuario pelo canal que preferir (WhatsApp, etc).
  res.json({ temporaryPassword });
});

const setPasswordSchema = z.object({
  password: z.string().min(8, "A senha deve ter pelo menos 8 caracteres."),
});

/** Administrador define diretamente a senha de um usuario (sem precisar da atual). */
export const setUserPassword = asyncHandler(async (req: Request, res: Response) => {
  const { password } = setPasswordSchema.parse(req.body);
  const existing = await prisma.user.findFirst({ where: { id: req.params.id, deletedAt: null } });
  if (!existing) throw new NotFoundError("Usuario");
  assertPodeAdministrar(req, existing);

  await prisma.user.update({
    where: { id: existing.id },
    // Definida por outra pessoa: vale so ate o primeiro acesso, como a redefinida.
    data: { passwordHash: await hashPassword(password), mustChangePassword: true },
  });

  await writeAuditLog({
    userId: req.user?.sub,
    action: "UPDATE",
    entityType: "User",
    entityId: existing.id,
    description: `Senha de ${existing.name} definida pelo administrador`,
  });

  res.status(204).send();
});

export const listRoleDefinitions = asyncHandler(async (_req: Request, res: Response) => {
  const roles = await prisma.roleDefinition.findMany({
    include: { permissions: { include: { permission: true } } },
    orderBy: { label: "asc" },
  });

  res.json(
    roles.map((r) => ({
      key: r.key,
      label: r.label,
      description: r.description,
      permissions: r.permissions.map((rp) => rp.permission.label),
    })),
  );
});
