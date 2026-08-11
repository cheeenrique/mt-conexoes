# Dashboard — faixa de vencimento — design

> Substitui os 4 `SummaryCard` genéricos do dashboard (`/`) pela faixa horizontal por balde de vencimento descrita em `docs/projeto/design/02-handoff-painel.md` ("Elemento de assinatura — a linha de vencimento").
> Aprovado: 2026-08-11.

## Motivação

O dashboard real (`src/features/charges/components/dashboard-panel.tsx`) é hoje um grid de 4 cards de estatística ("Vencem hoje", "Próximos 7 dias", "Em atraso", "Recebido no mês") linkando pra `/charges`. É exatamente o padrão que o handoff de design argumenta contra: "não é a resposta template, e não é o que ele pergunta ao abrir". O handoff original especificava uma faixa horizontal ancorada em hoje, com colunas clicáveis por proximidade do vencimento, que filtram uma lista na própria tela. Essa versão nunca foi construída — o dashboard foi implementado com o padrão genérico antes ou sem essa referência.

## Estado atual (o que sai)

```ts
// src/features/charges/queries.ts — getDashboardSummary, hoje
{
  dueToday: ChargeDTO[];       // 1 query, status IN (OPEN, OVERDUE, PARTIALLY_PAID), dueAt = hoje
  dueNext7Days: ChargeDTO[];   // 1 query, mesmo status, dueAt em (hoje, hoje+7]
  overdue: ChargeDTO[];        // 1 query, status = OVERDUE, sem limite de dias
  receivedThisMonthCents: string;
}
```

`DashboardPanel` renderiza 4 `SummaryCard` (grid-cols-4) + 3 `ChargePreviewList` (5 linhas cada, sem filtro cruzado). `page.tsx` renderiza `<OperatorAlerts>` **antes** do painel.

## O que entra

### Balde de vencimento — cálculo puro

```ts
// src/core/due-date-buckets.ts
import { daysFromDue } from './dunning-rules';

export type DueDateBucket = 'D-5' | 'D-2' | 'D0' | 'D+1' | 'D+3' | 'D+5';

export const DUE_DATE_BUCKETS: readonly DueDateBucket[] = ['D-5', 'D-2', 'D0', 'D+1', 'D+3', 'D+5'];

export function resolveDueDateBucket(dueAt: Date, now: Date, timezone: string): DueDateBucket {
  const offset = daysFromDue(dueAt, now, timezone); // negativo = antes do vencimento, positivo = depois
  if (offset <= -4) return 'D-5';
  if (offset <= -1) return 'D-2';
  if (offset === 0) return 'D0';
  if (offset <= 2) return 'D+1';
  if (offset <= 4) return 'D+3';
  return 'D+5';
}
```

Tabela de intervalo (fechado, sem gap, sem sobreposição):

| Balde | `offset` (dias) | Rótulo na tela | Significado |
|---|---|---|---|
| `D-5` | `≤ -4` | "D-5" | A vencer em 4+ dias |
| `D-2` | `-3 … -1` | "D-2" | A vencer em 1 a 3 dias |
| `D0` | `0` | "HOJE" | Vence hoje |
| `D+1` | `1 … 2` | "D+1" | Atrasada há 1 a 2 dias |
| `D+3` | `3 … 4` | "D+3" | Atrasada há 3 a 4 dias |
| `D+5` | `≥ 5` | "D+5+" | Atrasada há 5+ dias |

Função pura, sem I/O, `now`/`timezone` por parâmetro — segue a regra de `core/`. Cobertura de teste faz par com o comportamento de fronteira em cada um dos 5 limites (`-4/-3`, `-1/0`, `0/1`, `2/3`, `4/5`) e com um caso bem distante de cada ponta (`-30`, `+30`) pra confirmar que o catch-all não perde nada.

### Query — uma busca, bucket em memória

```ts
// src/features/charges/queries.ts
export type DueDateOverview = {
  buckets: { key: DueDateBucket; label: string; count: number; amountCents: string }[];
  charges: (ChargeDTO & { bucket: DueDateBucket })[];
  receivedThisMonthCents: string;
};

export async function getDueDateOverview(now: Date, timezone: string): Promise<DueDateOverview> {
  const [rows, monthPayments] = await Promise.all([
    db.charge.findMany({
      where: { status: { in: ['OPEN', 'OVERDUE', 'PARTIALLY_PAID'] } },
      include: CHARGE_INCLUDE,
      orderBy: { dueAt: 'asc' },
    }),
    (() => {
      const { from, to } = monthBoundsUtc(now.getUTCFullYear(), now.getUTCMonth(), timezone);
      return db.payment.aggregate({ where: { paidAt: { gte: from, lt: to } }, _sum: { amountCents: true } });
    })(),
  ]);

  const charges = rows.map((r) => ({ ...toChargeDTO(r), bucket: resolveDueDateBucket(r.dueAt, now, timezone) }));

  const buckets = DUE_DATE_BUCKETS.map((key) => {
    const inBucket = charges.filter((c) => c.bucket === key);
    return {
      key,
      label: DUE_DATE_BUCKET_LABELS[key],
      count: inBucket.length,
      amountCents: inBucket.reduce((sum, c) => sum + (BigInt(c.netCents) - BigInt(c.paidCents)), 0n).toString(),
    };
  });

  return { buckets, charges, receivedThisMonthCents: (monthPayments._sum.amountCents ?? 0n).toString() };
}
```

Substitui `getDashboardSummary` (removido — nenhum outro caller além de `page.tsx`, confirmar no plano de implementação antes de apagar).

### Componentes

`DueDateStrip` — Server Component, sem estado próprio. Recebe `buckets`, `selected: DueDateBucket`. Cada coluna é `<Link href={`?bucket=${key}`}>`. Coluna ativa marcada por estilo (não só cor — texto "selecionado" via `aria-current`), seguindo o mesmo princípio de acessibilidade do resto do painel.

`DashboardPanel` — recebe `overview: DueDateOverview`, `selectedBucket: DueDateBucket`, `timezone`. Renderiza, nessa ordem: `DueDateStrip` → `ChargePreviewList` filtrada (`overview.charges.filter(c => c.bucket === selectedBucket)`, cap 20, nota "mostrando 20 de N" se `length > 20`) → linha de "Recebido no mês" (texto + valor, não card isolado).

`page.tsx` — ganha `searchParams: Promise<{ bucket?: string }>`, valida contra `DUE_DATE_BUCKETS` (bucket inválido ou ausente cai em `'D0'`). Ordem trocada: `DashboardPanel` primeiro, `OperatorAlerts` por último.

### Link "ver mais" por balde

Cada balde manda pra `/charges` com o status dominante daquele grupo — não filtra por dia lá (fora de escopo, `/charges` não ganha filtro de data nesta mudança):

| Balde | `status` no link |
|---|---|
| `D-5`, `D-2`, `D0` | `OPEN` |
| `D+1`, `D+3`, `D+5` | `OVERDUE` |

## Testes

- `core/due-date-buckets.test.ts` — os 5 limites de fronteira + 2 casos catch-all distantes, seguindo o padrão de teste financeiro do projeto (valor exato em cada lado do limite).
- `features/charges/queries.integration.test.ts` — `getDueDateOverview` contra Postgres real: soma de `amountCents` por balde bate com a soma manual das cobranças esperadas; cobrança `PAID`/`CANCELLED` não aparece em nenhum balde; `receivedThisMonthCents` inalterado em relação ao comportamento atual.
- Sem mudança nos testes de `daysFromDue` (reaproveitado, não alterado).

## Fora de escopo

- `/charges` não ganha filtro por dia de vencimento — só por status, como já é.
- Nenhuma métrica nova no "Recebido no mês" (Faturado/Custo/Lucro/Margem fica pra uma tela de relatórios futura, se vier a existir — `src/features/reports/` hoje só tem a query de P&L por cliente).
- Nenhuma mudança em `OperatorAlerts` além da reordenação na página.
- Mobile: a faixa de 6 colunas usa scroll horizontal abaixo do breakpoint de tabela-vira-cartão (mesma regra de "funciona no celular" do resto do painel) — não é uma tela nova, é a mesma faixa com overflow-x.
