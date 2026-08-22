export class DomainError extends Error {
  constructor(message: string, readonly code: string, options?: { cause?: unknown }) {
    super(message, options);
  }
}

export class InvalidCredentialsError extends DomainError {
  constructor(cause?: unknown) {
    super('E-mail ou senha incorretos.', 'INVALID_CREDENTIALS', { cause });
  }
}

export class CurrentPasswordInvalidError extends DomainError {
  constructor(cause?: unknown) {
    super('Senha atual incorreta.', 'CURRENT_PASSWORD_INVALID', { cause });
  }
}

// waitSeconds vem do atraso progressivo (core/login-backoff.ts) — sem ele,
// a mensagem genérica de 15 minutos fixos.
export class TooManyLoginAttemptsError extends DomainError {
  constructor(waitSeconds?: number, cause?: unknown) {
    const message =
      waitSeconds && waitSeconds > 0
        ? `Muitas tentativas. Aguarde ${formatWaitTime(waitSeconds)} e tente de novo.`
        : 'Muitas tentativas. Aguarde alguns minutos e tente de novo.';
    super(message, 'TOO_MANY_ATTEMPTS', { cause });
  }
}

function formatWaitTime(seconds: number): string {
  if (seconds < 60) return `${seconds} segundo${seconds === 1 ? '' : 's'}`;
  const minutes = Math.ceil(seconds / 60);
  return `${minutes} minuto${minutes === 1 ? '' : 's'}`;
}

export class UnauthorizedError extends DomainError {
  constructor(cause?: unknown) {
    super('Sessão expirada. Entre novamente.', 'UNAUTHORIZED', { cause });
  }
}

export class UnknownTemplateVariableError extends DomainError {
  constructor(message: string, cause?: unknown) {
    super(message, 'UNKNOWN_TEMPLATE_VARIABLE', { cause });
  }
}

/**
 * Códigos de erro do Prisma que viram decisão de domínio em mais de uma
 * feature (`customers`, `leads`, e a composição da conversão em `app/`).
 * Ficam em `lib/` porque são infra — o mapeamento para `DomainError` continua
 * sendo de quem chama.
 */
function prismaErrorCode(err: unknown): string | null {
  if (typeof err !== 'object' || err === null || !('code' in err)) return null;
  const code = (err as { code: unknown }).code;
  return typeof code === 'string' ? code : null;
}

/** `P2002` — violação de índice único (ex.: `Customer.phone`). */
export function isUniqueViolation(err: unknown): boolean {
  return prismaErrorCode(err) === 'P2002';
}

/** `P2025` — o registro alvo do update/delete não existe. */
export function isRecordNotFound(err: unknown): boolean {
  return prismaErrorCode(err) === 'P2025';
}
