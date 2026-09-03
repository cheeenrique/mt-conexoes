/**
 * Direito de eliminação (LGPD) — o que é neutro e a trava, puros.
 *
 * Design fechado em `docs/superpowers/specs/2026-08-25-anonimizacao-lgpd-design.md`.
 * A composição (transação, quatro grupos de tabela) mora em `app/(app)/customers/`
 * — este módulo só sabe os valores neutros e se o cliente PODE ser anonimizado, sem
 * tocar em Prisma, `Date` ou qualquer coisa do projeto.
 */

/** Substitui nome, some com telefone/e-mail/documento/observações do cliente. */
export const ANONYMIZED_CUSTOMER_NAME = 'Cliente anonimizado';

/** `leads.name` — mesmo espírito do cliente, texto próprio porque é outra tabela. */
export const ANONYMIZED_LEAD_NAME = 'Lead anonimizado';

/**
 * `leads.phone` — o design (§Valores neutros) pedia `''`, mas
 * `leads_phone_length_check` (`CHECK char_length(phone) BETWEEN 8 AND 20`,
 * migration 00000000000012) recusa string vazia. Achado rodando o teste de
 * integração contra o banco real, não em revisão de código — exatamente o
 * tipo de constraint que só aparece testando contra Postgres de verdade.
 * Texto, não dígitos: mais claro que é placeholder do que uma sequência de
 * zeros que poderia ser confundida com número real malformado.
 */
export const ANONYMIZED_LEAD_PHONE = 'anonimizado';

/** `messages.body` — preserva que uma mensagem foi enviada (relatório, auditoria),
 * apaga o que ela dizia. */
export const ANONYMIZED_MESSAGE_BODY = '[conteúdo removido a pedido do titular]';

/**
 * O que `assertAnonymizable` precisa saber pra decidir — contagens, não os
 * registros inteiros. Quem soma é a camada de composição (I/O); este módulo só
 * decide com o número em mãos.
 */
export type AnonymizableState = {
  activeSubscriptionCount: number;
  /** OPEN + OVERDUE + PARTIALLY_PAID somadas — as três que ainda pedem dinheiro. */
  openChargeCount: number;
};

/**
 * Erro como dado (`.claude/rules/06-composition-errors.md`), não exceção: `core/`
 * não pode depender de `DomainError` (`lib/errors.ts`), e o chamador em `app/`
 * decide o que fazer com o motivo — aqui é sempre lançar `CustomerNotAnonymizableError`.
 */
export type AnonymizationCheck = { ok: true } | { ok: false; reason: string };

/**
 * Recusa com assinatura ativa ou cobrança em aberto. A régua roda todo dia
 * procurando quem cobrar — cliente sem telefone com cobrança viva vira erro
 * diário no cron, ou mensagem disparada pro vazio. Cancelar e anonimizar são
 * duas decisões de negócio; juntá-las numa ação irreversível faz o operador que
 * errou de cliente perder a assinatura junto.
 */
export function assertAnonymizable(state: AnonymizableState): AnonymizationCheck {
  if (state.activeSubscriptionCount === 0 && state.openChargeCount === 0) return { ok: true };

  const parts: string[] = [];
  if (state.activeSubscriptionCount > 0) {
    parts.push(`${state.activeSubscriptionCount} assinatura${state.activeSubscriptionCount === 1 ? '' : 's'} ativa${state.activeSubscriptionCount === 1 ? '' : 's'}`);
  }
  if (state.openChargeCount > 0) {
    parts.push(`${state.openChargeCount} cobrança${state.openChargeCount === 1 ? '' : 's'} em aberto`);
  }

  return { ok: false, reason: `Este cliente tem ${parts.join(' e ')}. Cancele antes de anonimizar.` };
}
