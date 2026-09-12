export class AppError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public code = "APP_ERROR",
  ) {
    super(message);
    this.name = "AppError";
  }
}

export class NotFoundError extends AppError {
  constructor(entity = "Registro") {
    super(404, `${entity} nao encontrado.`, "NOT_FOUND");
  }
}

export class ForbiddenError extends AppError {
  /** O codigo e' opcional: a tela precisa distinguir "sem permissao" de "troque a senha
   * provisoria", que exigem reacoes diferentes. */
  constructor(message = "Voce nao tem permissao para executar esta acao.", code = "FORBIDDEN") {
    super(403, message, code);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "Sessao invalida ou expirada. Faca login novamente.", code = "UNAUTHORIZED") {
    super(401, message, code);
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super(409, message, "CONFLICT");
  }
}

export class ValidationError extends AppError {
  constructor(
    message: string,
    public details?: unknown,
  ) {
    super(422, message, "VALIDATION_ERROR");
  }
}
