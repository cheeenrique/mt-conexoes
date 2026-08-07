export class DomainError extends Error {
  constructor(message: string, readonly code: string, options?: { cause?: unknown }) {
    super(message, options);
  }
}

export class InvalidCredentialsError extends DomainError {
  constructor(cause?: unknown) {
    super('E-mail ou senha não conferem.', 'INVALID_CREDENTIALS', { cause });
  }
}

export class TooManyLoginAttemptsError extends DomainError {
  constructor(cause?: unknown) {
    super('Muitas tentativas. Aguarde alguns minutos e tente de novo.', 'TOO_MANY_ATTEMPTS', { cause });
  }
}

export class UnauthorizedError extends DomainError {
  constructor(cause?: unknown) {
    super('Sessão expirada. Entre novamente.', 'UNAUTHORIZED', { cause });
  }
}
