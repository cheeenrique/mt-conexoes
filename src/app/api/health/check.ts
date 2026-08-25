/** Resultado do health check, sem nada do erro do banco dentro.
 *
 *  ⚠️ Mensagem de erro do Postgres carrega usuário, host e às vezes o motivo da
 *  recusa de autenticação. Isso não sai num endpoint público. */
export interface HealthResult {
  status: 'ok' | 'degraded';
  httpStatus: 200 | 503;
}

/**
 * Confere se o banco responde.
 *
 * ⚠️ A versão anterior devolvia `{ status: 'ok' }` sem tocar em nada. Com o
 * Postgres parado o endpoint seguia dizendo `ok`, e no Cloud Run isso mantém no
 * balanceador uma instância que não consegue atender requisição nenhuma.
 *
 * A sonda entra por parâmetro para o teste cobrir o caminho de falha sem
 * derrubar banco.
 */
export async function checkHealth(probe: () => Promise<unknown>): Promise<HealthResult> {
  try {
    await probe();
    return { status: 'ok', httpStatus: 200 };
  } catch {
    return { status: 'degraded', httpStatus: 503 };
  }
}
