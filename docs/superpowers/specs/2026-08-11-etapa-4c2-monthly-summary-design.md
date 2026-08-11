# Etapa 4c-2 — Painel do mês, quebras e export CSV — Design

> Fonte de verdade do domínio: `docs/projeto/tecnico/04-dinheiro-e-margem.md`, seções "Painel do mês", "Quebras" e o item "Export CSV" de `07-plano-de-entrega.md`.

## Objetivo

Uma tela nova, `/reports`, com o resumo financeiro do mês (faturamento, custo, lucro bruto, margem, recebido, em aberto, margem em risco), quatro quebras (fornecedor, plano, cliente top/bottom 20, tendência de 12 meses) e export CSV das três quebras tabulares.

## Arquitetura

```
app/(app)/reports/page.tsx          composição — resolve mês via searchParams, chama as queries
app/api/reports/export/route.ts     Route Handler — devolve text/csv com Content-Disposition
features/reports/
  queries.ts                        + getMonthlySummary, getSupplierBreakdown, getPlanBreakdown,
                                       getCustomerBreakdown, getMonthlyTrend
  sql/monthly-summary.sql           referência versionada (já existe customer-pnl.sql desta feature)
  sql/supplier-breakdown.sql
  sql/plan-breakdown.sql
  sql/customer-breakdown.sql
  components/
    monthly-summary-card.tsx        faturamento/custo/lucro/margem/recebido/em aberto/margem em risco
    monthly-trend-table.tsx         12 meses, sem CSV (sem pedido no doc)
    breakdown-table.tsx             genérico — recebe rows+colunas, usado por fornecedor/plano/cliente
    export-csv-button.tsx           client — dispara download via <a href={rota de export}>
lib/csv.ts                          escapeCsvCell, toCsv — novo, infra sem domínio
```

### Navegação de mês

`searchParams: { year?: string; month?: string }` (mês 1-12, humano). Sem parâmetro, usa o mês corrente no fuso do negócio. Botões "‹ anterior" / "próximo ›" trocam a URL — filtro em URL, não em estado (regra do projeto).

### Painel do mês

Reaproveita exatamente o SQL do doc (`monthly-summary.sql`), com `$1`/`$2` vindos de `monthBoundsUtc(year, month - 1, timezone)` — nunca `date_trunc`. Adiciona `receivedCents` via `db.payment.aggregate({ where: { paidAt: { gte, lt } }, _sum: { amountCents } })`, mesmo padrão já usado em `getDashboardSummary` (`charges/queries.ts`) — Prisma builder aqui porque é uma soma simples sem `FILTER`, sem motivo pra raw SQL.

```
Agosto/2026
  Faturamento   R$ 13.500,00        Custo   R$ 4.900,00
  Lucro bruto   R$  8.600,00  margem 64%
  Recebido      R$ 11.880,00
  Em aberto     R$  1.620,00   ⚠ margem em risco: R$ 590,00
```

### Quebras — fornecedor e plano

Mesma query-base do painel (`SUM`/`FILTER` por status), `GROUP BY`:
- Fornecedor: `charges.supplierId` direto (`Charge.supplierId` já existe, denormalizado — não precisa de JOIN).
- Plano: `charges` → `JOIN subscriptions ON subscriptions.id = charges."subscriptionId"`, `GROUP BY subscriptions."planId"`.

Cada linha: nome (fornecedor/plano), faturado, custo, lucro, margem (calculada no componente via `core/money`, mesmo padrão de 4c-1 — nunca duplicada na query).

### Quebra — cliente (top/bottom 20)

Uma query só, `GROUP BY charges."customerId"`, `ORDER BY (SUM(principal-discount) - SUM(cost)) DESC`, sem `LIMIT` — na escala do projeto (até 1.000 clientes) trazer tudo e fatiar em `queries.ts` (`rows.slice(0, 20)` e `rows.slice(-20).reverse()`) é mais simples que duas queries com `ORDER BY` invertido, e o doc já registra que otimização não é necessária nessa escala.

**Ambiguidade resolvida:** com menos de 40 clientes com cobrança no mês, `top` e `bottom` colidem (ex.: 25 clientes → top 20 e bottom 20 compartilham 15). Decisão: se `rows.length <= 40`, `bottom` é `rows.slice(20)` (só o que sobrou depois do top, sem repetir ninguém) em vez de `rows.slice(-20)` — nunca mostra o mesmo cliente duas vezes na tela.

### Quebra — 12 meses (tendência)

**Decisão de implementação:** `Promise.all` de 12 chamadas independentes à mesma agregação mensal (uma por `monthBoundsUtc` do mês corrente e dos 11 anteriores), não um `GROUP BY` de intervalo variável em SQL — porque limite de mês respeita fuso local (`monthBoundsUtc`), e computar 12 pares de fronteira em SQL puro reintroduziria o `date_trunc` que o projeto proíbe. É paralelo (`Promise.all`), não sequencial dentro de um loop — 12 chamadas fixas, não proporcional ao volume de dados, o mesmo raciocínio de escala que o doc já aceita para as outras queries desta etapa. Cada mês retorna só `billedCents`/`costCents`/margem — não repete `openCents`/`overdueCents`, que só fazem sentido pro mês corrente.

```
Mar  Abr  Mai  Jun  Jul  Ago
64%  58%  71%  69%  74%  64%      ← margem, não faturamento — é o que o doc pede pra enfatizar
```

Tabela simples (mês + faturado + custo + margem), sem biblioteca de gráfico nova — YAGNI, ninguém pediu visualização, e uma tabela de 12 linhas é legível.

### Export CSV

Route Handler `GET /api/reports/export?type=supplier|plan|customer&year=&month=`. Sem Server Action porque download de arquivo é fundamentalmente uma navegação/GET, não uma mutação — `<a href="/api/reports/export?...">` client-side, sem JS extra.

`lib/csv.ts`:
```ts
/** Escapa célula que começa com =, +, -, @ — CSV injection (regra dura do projeto). */
export function escapeCsvCell(value: string): string {
  return /^[=+\-@]/.test(value) ? `'${value}` : value;
}

export function toCsv(headers: string[], rows: string[][]): string {
  const escapeField = (v: string) => {
    const escaped = escapeCsvCell(v);
    return /[",\n]/.test(escaped) ? `"${escaped.replace(/"/g, '""')}"` : escaped;
  };
  const lines = [headers, ...rows].map((row) => row.map(escapeField).join(','));
  return lines.join('\r\n');
}
```

`type=customer` exporta as 40 linhas (20+20) numa tabela só, com coluna extra indicando "top"/"bottom" — evita duplicar a rota pra dois exports quase idênticos.

## Erros

Nenhum `DomainError` novo — leitura pura, sem mutação. `year`/`month` fora de faixa (ex. `month=13`) cai no `notFound()` do Next ou é normalizado pro mês corrente — decisão de implementação, sem novo código de erro de domínio.

## Testes obrigatórios

Do doc de domínio, já cobertos indiretamente pela query de 4c-1 (não repetir): exclusão de `CANCELLED`, `BigInt` nunca vira `number`.

Novos, específicos desta implementação:
- `getMonthlySummary`: soma de `billedCents` de todos os clientes do período bate com o `billed_cents` do painel geral do mesmo período — caso de teste explícito do doc (`04-dinheiro-e-margem.md` linha 210), verificado comparando o resultado desta query com a soma das linhas de `getSupplierBreakdown` no mesmo mês.
- `getMonthlySummary`: `openCents`/`costAtRiskCents` somam só cobranças `OPEN`/`OVERDUE`/`PARTIALLY_PAID`, cobrança `PAID` não entra nesses dois campos mas entra em `billedCents`/`costCents`.
- `getMonthlySummary`: limites de mês vêm de `monthBoundsUtc`, não de `date_trunc` — teste de virada de mês em fuso não-UTC (cobrança com `dueAt` às 23h59 local do último dia do mês entra no mês certo, não no seguinte por causa do UTC).
- `getSupplierBreakdown`/`getPlanBreakdown`: fornecedor/plano sem nenhuma cobrança no mês não aparece na lista (não é uma linha zerada — `GROUP BY` natural já resolve, teste confirma).
- `getCustomerBreakdown`: com mais de 20 clientes com cobrança no mês, `top` tem exatamente 20 e `bottom` tem exatamente 20, sem sobreposição quando há ≥ 40 clientes distintos.
- `getMonthlyTrend`: 12 meses, cada um com o `monthBoundsUtc` correto — teste que o mês de fevereiro (bissexto e não bissexto) e o mês de virada de ano (dezembro→janeiro) calculam o intervalo certo.
- `escapeCsvCell`: célula começando com `=`, `+`, `-`, `@` ganha prefixo `'`; célula normal não muda.
- `toCsv`: célula com vírgula ou aspas é envolvida em aspas duplas, com aspas internas duplicadas (`"` → `""`).
- Export route: `type` inválido devolve 400, não 500 nem CSV vazio silencioso.

## Fora de escopo

- 🔮 Gráfico/visualização da tendência de 12 meses — tabela simples cobre o requisito do doc sem dependência nova.
- 🔮 Export CSV da tendência de 12 meses — doc não pede especificamente, só das quebras.
- Alertas de margem (negativa, abaixo do limite, custo do fornecedor subiu, cliente bom em atraso) — Etapa 4c-3.
- Backup diário + restore — Etapa 4c-4, infra/ops.
