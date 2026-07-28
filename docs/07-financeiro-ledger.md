# 07 — Financeiro e Ledger

> ⚠️ Este é o documento mais sensível do sistema. Bug aqui não gera ticket — gera cancelamento. Um cliente que perde a confiança no número do financeiro não volta.

## Princípios inegociáveis

1. **Saldo é derivado, nunca armazenado.** Não existe `UPDATE ... SET balance = balance + x`. Existe lançamento; saldo é `SUM`.
2. **Documento emitido é imutável.** Correção se faz com documento novo (crédito, desconto, estorno), nunca editando o original.
3. **Dinheiro é `BigInt` de centavos.** Nunca float, em lugar nenhum, nem em variável temporária.
4. **Toda transação é balanceada.** Soma de débitos = soma de créditos, sempre.
5. **Arredondamento é *round half up*, em centavos, uma única vez, no fim do cálculo.**

---

## Ledger de partidas dobradas

### Contas

| Conta | Natureza | Significado |
|---|---|---|
| `AR` | ativo | Contas a receber — o que o customer deve |
| `CASH` | ativo | Dinheiro recebido |
| `CREDIT` | passivo | Saldo a favor do customer |
| `REVENUE` | receita | Receita reconhecida |
| `DISCOUNT` | redutora | Descontos e abonos concedidos |
| `PENALTY` | receita | Multa por atraso |
| `INTEREST` | receita | Juros por atraso |
| `WRITE_OFF` | despesa | Perda por incobrabilidade |
| `REFUND` | redutora | Estornos |
| `COGS` | despesa | Custo da mercadoria vendida — ver doc 17 |
| `AP` | passivo | A pagar ao fornecedor — ver doc 17 |

### Transações canônicas

**Emissão de cobrança** — R$ 50,00

```
AR       DEBIT   5000
REVENUE  CREDIT  5000
```

**Pagamento integral**

```
CASH  DEBIT   5000
AR    CREDIT  5000
```

**Pagamento parcial** — R$ 30,00 de uma cobrança de R$ 50,00

```
CASH  DEBIT   3000
AR    CREDIT  3000
```
Charge vai para `PARTIALLY_PAID`; saldo devedor de 2000 permanece em `AR`.

**Pagamento a maior** — recebeu R$ 60,00 numa cobrança de R$ 50,00

```
CASH    DEBIT   6000
AR      CREDIT  5000
CREDIT  CREDIT  1000
```
O excedente vira saldo do customer e abate a próxima cobrança automaticamente.

**Aplicação de multa e juros** — multa 100, juros 25

```
AR        DEBIT   125
PENALTY   CREDIT  100
INTEREST  CREDIT   25
```

**Abono / desconto** — perdoa R$ 20,00

```
DISCOUNT  DEBIT   2000
AR        CREDIT  2000
```

**Uso de crédito** — abate R$ 10,00 de crédito numa cobrança nova

```
CREDIT  DEBIT   1000
AR      CREDIT  1000
```

**Baixa por incobrabilidade**

```
WRITE_OFF  DEBIT   5000
AR         CREDIT  5000
```

**Estorno de pagamento**

```
REFUND  DEBIT   5000
CASH    CREDIT  5000
AR      DEBIT   5000
REVENUE CREDIT  5000     -- reabre a dívida
```

### Consultas derivadas (TypedSQL)

```sql
-- packages/db/sql/customer_balance.sql
SELECT
  COALESCE(SUM(CASE WHEN account='AR'     AND direction='DEBIT'  THEN amount_cents
                    WHEN account='AR'     AND direction='CREDIT' THEN -amount_cents END), 0) AS ar_cents,
  COALESCE(SUM(CASE WHEN account='CREDIT' AND direction='CREDIT' THEN amount_cents
                    WHEN account='CREDIT' AND direction='DEBIT'  THEN -amount_cents END), 0) AS credit_cents
FROM ledger_entries
WHERE tenant_id = $1 AND customer_id = $2;
```

⚠️ **Job diário `ledger:verify`**: para cada `LedgerTransaction`, soma débitos e créditos. Divergência dispara alerta crítico no Sentry e e-mail. Isso é o seu detector de fumaça — não pule.

---

## Ciclo da cobrança

### Estados

```
DRAFT ──► OPEN ──┬──► PAID
                 ├──► PARTIALLY_PAID ──► PAID
                 ├──► OVERDUE ──┬──► PAID
                 │              ├──► WRITTEN_OFF
                 │              └──► CANCELED
                 └──► CANCELED
```

| Transição | Regra |
|---|---|
| `OPEN` → `OVERDUE` | Job diário, quando `dueAt < hoje` no fuso do tenant |
| `OPEN`/`OVERDUE` → `PAID` | `paidCents >= totalCents` |
| → `PARTIALLY_PAID` | `0 < paidCents < totalCents` |
| → `CANCELED` | Ação do operador; só se `paidCents = 0` |
| → `WRITTEN_OFF` | Ação do operador com permissão `charges:void` |

⚠️ Cobrança com pagamento alocado **não pode ser cancelada**. Precisa estornar o pagamento antes. Sem essa regra, o ledger desbalanceia.

### Alocação de pagamento

Um `Payment` não pertence a uma `Charge` — ele é alocado. Regra padrão (FIFO por vencimento):

```ts
export function allocate(payment: Payment, openCharges: Charge[]): Allocation[] {
  const sorted = [...openCharges].sort((a, b) => +a.dueAt - +b.dueAt);
  let remaining = payment.amountCents;
  const out: Allocation[] = [];

  for (const charge of sorted) {
    if (remaining <= 0n) break;
    const owed = charge.totalCents - charge.paidCents;
    const applied = remaining < owed ? remaining : owed;
    out.push({ chargeId: charge.id, amountCents: applied });
    remaining -= applied;
  }
  if (remaining > 0n) out.push({ toCredit: remaining });   // excedente vira crédito
  return out;
}
```

O operador pode sobrescrever a alocação manualmente na UI (caso "esse pagamento é da fatura de março, não de janeiro").

---

## Multa e juros

### Defaults legais

```
multa:  2% sobre o principal, aplicada uma única vez
juros:  1% ao mês, pro rata die (0,0333% ao dia)
carência: 0 dias
aplicar a partir de: D+1
teto de juros: 12 meses
```

Esses são os limites usuais para relação de consumo. São **configuráveis para menos**; o sistema alerta se o tenant configurar acima.

### Cálculo

```ts
// packages/core/src/billing/late-fees.ts
export function calcLateFees(
  principalCents: bigint,
  daysLate: number,
  policy: DunningPolicy
): { penaltyCents: bigint; interestCents: bigint } {
  if (daysLate <= policy.graceDays) return { penaltyCents: 0n, interestCents: 0n };

  const effectiveDays = Math.min(daysLate - policy.graceDays, policy.maxInterestMonths * 30);

  const penaltyCents  = roundHalfUp(principalCents * policy.penaltyPercent / 100);
  const dailyRate     = policy.interestPercent / 100 / 30;
  const interestCents = roundHalfUp(principalCents * dailyRate * effectiveDays);

  return { penaltyCents, interestCents };
}
```

⚠️ Detalhes que importam:
- Base de cálculo é o **principal**, nunca o total com encargos (senão vira juros sobre juros)
- Multa aplica **uma vez**; recalcular no dia seguinte não pode duplicar
- Recalcular encargos é operação **idempotente**: sempre recomputa do zero e ajusta o delta no ledger
- Job `charge:apply-late-fees` roda diário e é seguro rodar N vezes no mesmo dia

---

## Conciliação

### Manual (Pix chave estática)

O operador vê a lista de cobranças em aberto e marca como paga, informando valor e data. Gera `Payment` com `method = PIX`, `providerCode = 'manual'`, `registeredBy = userId`.

**Sempre auditado.** Marcar cobrança como paga é a ação mais sensível do sistema.

### Automática (gateway)

```
Webhook do gateway
   ↓
Verifica assinatura ⚠️ (rejeita se inválida)
   ↓
Grava WebhookEvent — UNIQUE(providerCode, externalId) ⚠️ idempotência
   ├── já existe e processado → responde 200 e sai
   └── novo → enfileira processing:webhook
   ↓
Job: resolve a Charge por externalId
   ↓
Cria Payment CONFIRMED + Allocations + LedgerTransaction   ← tudo em uma transação
   ↓
Atualiza Charge, cancela passos pendentes da régua
   ↓
Emite charge.paid → dispara mensagem de confirmação
```

⚠️ **Responder 200 rápido.** O processamento pesado vai para a fila. Gateway que recebe timeout reenvia e você tem tempestade de webhook.

⚠️ **Nunca confiar no valor do payload sem conferir** contra a cobrança. Divergência gera alerta, não baixa automática.

---

## Relatórios (TypedSQL)

| Relatório | Conteúdo |
|---|---|
| **MRR** | Soma de `priceCents` de assinaturas ativas, normalizada por periodicidade para base mensal |
| **Aging de recebíveis** | Faixas 1–15, 16–30, 31–60, 61–90, 90+ dias de atraso |
| **DSO** | Média ponderada de dias entre `dueAt` e `paidAt` |
| **Taxa de recuperação** | % de cobranças `OVERDUE` que viraram `PAID` após a régua |
| **Churn** | Assinaturas canceladas ÷ ativas no início do período |
| **Fluxo de caixa** | `CASH` por dia, com previsão baseada em cobranças em aberto |
| **Receita em risco** | Soma de `totalCents` de cobranças vencendo nos próximos 7 dias |
| **Lucro bruto** | Receita − custo − descontos − perdas. Por cliente e agregado — ver doc 17 |
| **Margem por fornecedor** | Quebra de lucro por `supplierId` — ver doc 17 |
| **Margem em risco** | Custo reconhecido de cobranças ainda não recebidas — ver doc 17 |

Normalização de MRR:

```
WEEKLY      → valor * 4.345
MONTHLY     → valor
QUARTERLY   → valor / 3
SEMIANNUAL  → valor / 6
ANNUAL      → valor / 12
CUSTOM_DAYS → valor * 30 / customDays
```

⚠️ Todo relatório respeita o fuso do tenant no corte de datas. Relatório "de julho" que inclui 31/07 21h UTC (que é 30/07 18h em São Paulo) é bug de confiança.

---

## Exportação

CSV e PDF (fase 2 para PDF). ⚠️ Ao exportar CSV, prefixar com `'` toda célula iniciada por `=`, `+`, `-` ou `@` — CSV injection é vetor real, e os dados vieram de planilha de terceiro.
