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

export class CurrentPasswordInvalidError extends DomainError {
  constructor(cause?: unknown) {
    super('Senha atual incorreta.', 'CURRENT_PASSWORD_INVALID', { cause });
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

export class UnknownTemplateVariableError extends DomainError {
  constructor(message: string, cause?: unknown) {
    super(message, 'UNKNOWN_TEMPLATE_VARIABLE', { cause });
  }
}
