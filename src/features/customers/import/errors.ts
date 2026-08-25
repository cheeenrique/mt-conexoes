import { DomainError } from '@/lib/errors';

export class ImportFileUnreadableError extends DomainError {
  constructor(cause?: unknown) {
    super('Não foi possível ler o arquivo. Confira se é uma planilha .xlsx ou .xlsm válida.', 'IMPORT_FILE_UNREADABLE', {
      cause,
    });
  }
}

export class ImportFileEmptyError extends DomainError {
  constructor(cause?: unknown) {
    super('A planilha não tem nenhuma linha de dado.', 'IMPORT_FILE_EMPTY', { cause });
  }
}

export class ImportSupplierNotFoundError extends DomainError {
  constructor(cause?: unknown) {
    super('Fornecedor não encontrado. Atualize a página e tente de novo.', 'IMPORT_SUPPLIER_NOT_FOUND', { cause });
  }
}
