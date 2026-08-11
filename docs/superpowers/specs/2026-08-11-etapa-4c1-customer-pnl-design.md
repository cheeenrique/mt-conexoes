# Etapa 4c-1 — Fundação de lucro: painel por cliente — Design

> Fonte de verdade do domínio: `docs/projeto/tecnico/04-dinheiro-e-margem.md`.

## Estado atual

`core/money.ts` (`divRoundHalfUp`, `applyPercent`, `marginPercent`) já existe e já está testado — implementado numa etapa anterior a esta sessão, fora do escopo aqui. `CustomerProfileHeader` já tem o layout dos 5 números (Faturado/Recebido/Custo/Lucro/Margem), todos zerados com um `TODO` apontando exatamente pra este trabalho.

O que falta: a query real por trás desses números, e dois campos do mockup do doc que a UI atual ainda não tem (Renovações, Histórico).

## Objetivo

Substituir os zeros do header do cliente pelos números reais — faturado, recebido, custo, lucro bruto, margem, renovações, histórico de atraso/em aberto — via uma query nova em `features/reports/`.

## Arquitetura

Primeira instância de `features/reports/` no projeto — local definido pela arquitetura (`01-arquitetura.md`) e pelo doc de domínio. SQL versionado em `features/reports/sql/*.sql` (regra de `03-dados.md`: "relatório e agregação vivem em `features/reports/sql/*.sql`, não em template string dentro do service").

```
features/reports/
  sql/
    customer-pnl.sql          referência versionada, revisável — mesmo texto das duas queries abaixo
  queries.ts                  getCustomerPnl(customerId) — executa via $queryRaw parametrizado (Prisma.sql)
features/customers/components/
  customer-profile-header.tsx modificado — recebe pnl real, computa lucro/margem no componente
app/(app)/customers/[id]/page.tsx  modificado — chama getCustomerPnl, passa pro header
```

### Por que `$queryRaw` em vez de `db.charge.aggregate`

A agregação (SUM condicional por status, JOIN com payments) dá pra fazer com Prisma puro, mas o doc de domínio já entrega o SQL exato e o local exato (`features/reports/sql/customer-pnl.sql`) — regra de domínio, que tem precedência sobre preferência de estilo. `Prisma.sql` com template tagged é parametrização real (nunca `$queryRawUnsafe`). O arquivo `.sql` é o texto de referência revisável; `queries.ts` executa o mesmo texto via `Prisma.sql` — os dois ficam sincronizados manualmente, decisão aceita porque são duas queries curtas, sem geração de código nem I/O de arquivo em runtime.

### DTO

```ts
export interface CustomerPnlDTO {
  billedCents: string;
  receivedCents: string;
  costCents: string;
  chargesCount: number;
  paidCount: number;      // renovações completas
  overdueCount: number;   // atrasos
  openCount: number;      // OPEN + PARTIALLY_PAID, ainda em aberto
}
```

Lucro (`billedCents - costCents`) e margem (`marginPercent(billed, cost)`) **não** entram no DTO — seguem o padrão já usado em `plan-table.tsx`/`subscription-commercial-fields.tsx`: o componente recebe os centavos brutos e chama `core/money` diretamente (função pura, sem I/O, import permitido em Server Component). Evita duplicar a fórmula em dois lugares (query e componente).

### Mudança no `CustomerProfileHeader`

- Label "Lucro" → **"Lucro bruto"** — regra dura do doc (`⚠️ Rotular na UI como "lucro bruto" enquanto não houver módulo de despesas fixas`). Chamar de "lucro" o que é margem bruta é enganoso — hoje o componente já viola essa regra com o placeholder zerado.
- Margem some do grid de 5 colunas (`—` fixo) e ganha o valor real: `pct === null ? '—' : `margem ${pct.toFixed(0)}%``, ao lado do "Lucro bruto" — layout do mockup do doc (`Lucro bruto R$ 1.960,00 margem 74%`), não uma 6ª coluna separada.
- Nova linha abaixo do grid: `Renovações {paidCount}` e `Histórico {overdueCount} atraso(s) · {openCount} em aberto`, com pluralização simples (1 atraso vs 2 atrasos; "em aberto" não varia — é substantivo composto, fica igual no singular/plural do contexto aqui).
- Se `chargesCount === 0` (cliente sem nenhuma cobrança emitida ainda): mostra o grid zerado normalmente — `formatCents(0n)` e margem `—`, sem seção de Renovações/Histórico (nada a mostrar, não é um "vazio" que precise de EmptyState — é só um cliente novo).

## Erros

Nenhum `DomainError` novo. `getCustomerPnl` nunca lança para "cliente sem cobrança" — `COALESCE(..., 0)` no SQL cobre isso, mesmo padrão do doc.

## Testes obrigatórios

Do doc de domínio (`04-dinheiro-e-margem.md`, já cobertos por `money.test.ts` existente — não repetir):
- `divRoundHalfUp`, `applyPercent`, `marginPercent` — já testados, fora de escopo.

Novos, específicos desta implementação:
- `getCustomerPnl`: cliente sem nenhuma cobrança → todos os campos zerados/COALESCE, sem lançar.
- `getCustomerPnl`: cobrança `CANCELLED` não entra na soma (`billedCents`, `costCents`, `chargesCount`) — regra do SQL do doc (`AND ch.status <> 'CANCELLED'`).
- `getCustomerPnl`: `receivedCents` soma pagamentos de todas as cobranças do cliente, incluindo cobranças já `PAID` de assinaturas diferentes (isolamento por `customerId`, não por `subscriptionId`).
- `getCustomerPnl`: `paidCount`/`overdueCount`/`openCount` somam exatamente `chargesCount` quando não há `CANCELLED` no meio (nenhuma cobrança "sobra" fora das três categorias).
- `getCustomerPnl`: desconto reduz `billedCents` mas não `costCents` (fórmula `principal - discount`, custo é bruto).
- Component/UI: label é "Lucro bruto", nunca "Lucro" puro (grep/snapshot).
- Component/UI: margem `null` (sem cobrança) renderiza `—`, não `NaN%` nem exceção.
- Component/UI: pluralização de "atraso"/"atrasos" no Histórico.

## Fora de escopo

- 🔮 Painel do mês, quebras por fornecedor/plano, export CSV — Etapa 4c-2.
- 🔮 Alertas de margem — Etapa 4c-3.
- `core/money.ts` — já existe, não é tocado aqui além de import.
