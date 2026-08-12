# Alerta de margem negativa e abaixo do limite — design

> Implementa 2 dos 4 alertas de margem descritos em `docs/projeto/tecnico/04-dinheiro-e-margem.md` e `docs/projeto/design/02-handoff-painel.md`. "Custo do fornecedor subiu" (reajuste em lote) e "cliente bom em atraso" ficam para depois — escopo fechado nesta rodada.
> Aprovado: 2026-08-12.

## Motivação

`Settings.marginAlertPercent` existe e é configurável na tela de Ajustes, mas nada consome esse valor — nenhuma query, nenhuma tela mostra margem negativa nem margem abaixo do limite. O operador só descobre uma assinatura vendendo abaixo do custo se conferir na mão.

## O que entra

### Classificação — pura, `core/`

```ts
// src/core/money.ts — adiciona
export type MarginStatus = 'negative' | 'below_threshold' | 'ok';

/** priceCents ≤ costCents é sempre 'negative', mesmo com margin% indefinido. */
export function classifySubscriptionMargin(
  priceCents: bigint,
  costCents: bigint,
  alertPercent: Decimal,
): MarginStatus {
  if (priceCents - costCents <= 0n) return 'negative';
  const margin = marginPercent(priceCents, costCents)!; // priceCents > 0 aqui, nunca null
  return margin.lessThan(alertPercent) ? 'below_threshold' : 'ok';
}
```

Reaproveita `marginPercent` (já existe, já testado). `alertPercent` decide o limite — vem de `Settings.marginAlertPercent`, nunca hardcoded.

### Query — uma busca, classificação em memória

```ts
// src/features/subscriptions/queries.ts — adiciona
export type MarginAlertSummary = { negativeCount: number; belowThresholdCount: number };

export async function getMarginAlertSummary(): Promise<MarginAlertSummary> {
  const [subscriptions, settings] = await Promise.all([
    db.subscription.findMany({
      where: { status: 'ACTIVE' },
      select: { priceCents: true, costCents: true },
    }),
    getSettings(),
  ]);

  const alertPercent = new Decimal(settings.marginAlertPercent);
  const statuses = subscriptions.map((s) => classifySubscriptionMargin(s.priceCents, s.costCents, alertPercent));

  return {
    negativeCount: statuses.filter((s) => s === 'negative').length,
    belowThresholdCount: statuses.filter((s) => s === 'below_threshold').length,
  };
}
```

Só `ACTIVE` — assinatura suspensa/cancelada não gera alerta de margem (não está mais gerando cobrança).

### UI — duas faixas independentes, sem link (ainda)

```tsx
// src/features/subscriptions/components/margin-alert-banner.tsx
export function MarginAlertBanner({ summary }: { summary: MarginAlertSummary }) {
  if (summary.negativeCount === 0 && summary.belowThresholdCount === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      {summary.negativeCount > 0 && (
        <div className="rounded-sm border border-danger/40 bg-danger/[.08] p-4">
          <p className="text-sm font-bold text-foreground">
            {summary.negativeCount} assinatura{summary.negativeCount > 1 ? 's' : ''} com margem negativa
          </p>
          <p className="text-sm text-foreground-muted">Vendendo abaixo do custo. Revisar preço ou custo.</p>
        </div>
      )}
      {summary.belowThresholdCount > 0 && (
        <div className="rounded-sm border border-warning/40 bg-warning/[.08] p-4">
          <p className="text-sm font-bold text-foreground">
            {summary.belowThresholdCount} assinatura{summary.belowThresholdCount > 1 ? 's' : ''} com margem abaixo do limite
          </p>
        </div>
      )}
    </div>
  );
}
```

Tokens (`border-danger`/`bg-danger`, `border-warning`/`bg-warning`) já existem no tema, mesmo padrão usado em `ReviewPreview` (régua) e no `due-date-strip`. Sem link clicável — não existe tela de lista de assinaturas hoje; vira trabalho futuro quando essa tela existir.

### Wiring

`src/app/(app)/page.tsx`: busca `getMarginAlertSummary()` em paralelo com o resto, renderiza `<MarginAlertBanner>` logo antes do `<OperatorAlerts>` (ambos são a seção de alertas, no fim da página).

## Testes

- `core/money.test.ts` — `classifySubscriptionMargin`: `priceCents === costCents` → `negative`; `priceCents < costCents` → `negative`; margem exatamente no limite (`margin === alertPercent`) → `ok` (não é `below_threshold`, o corte é estrito "<"); margem um ponto abaixo do limite → `below_threshold`; margem bem acima → `ok`.
- `features/subscriptions/queries.integration.test.ts` — `getMarginAlertSummary` contra Postgres real: mistura de assinaturas `ACTIVE` (negativa, abaixo, ok) e uma `SUSPENDED` com margem negativa (não deve contar); confirma os dois contadores batem.

## Fora de escopo

- Link clicável pro balde de assinaturas afetadas (precisa de tela `/assinaturas` que não existe).
- "Custo do fornecedor subiu" → reajuste em lote (próximo item do backlog, feature própria).
- "Cliente bom em atraso" (precisa de cálculo de faturado médio, mais complexo).
- Qualquer alteração em `Settings` ou na tela de Ajustes — `marginAlertPercent` já existe, só passa a ser usado.
