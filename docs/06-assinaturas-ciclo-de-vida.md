# 06 — Assinaturas e Ciclo de Vida

## Os dois modelos no mesmo motor

A diferença entre pré e pós-pago é **quando o acesso é concedido em relação ao pagamento**. Tudo o mais é compartilhado.

| | Pré-pago | Pós-pago |
|---|---|---|
| Sequência | paga → ganha acesso | usa → recebe cobrança → paga |
| Entidade de acesso | `AccessPeriod` | nenhuma |
| Vencimento | fim do período vigente | data da cobrança emitida |
| Inadimplência | acesso simplesmente expira | dívida em aberto acumula |
| Multa e juros | normalmente não aplicáveis | aplicáveis |
| Régua | dispara **antes** (D-5 … D+2) | dispara **depois** (D-3 … D+15) |
| Corte | automático por expiração | decisão de política |

⚠️ Não construir dois subsistemas. `Charge`, `Payment` e `LedgerEntry` são idênticos nos dois. O que muda é o **efeito da confirmação do pagamento**.

---

## Máquina de estados — `Subscription`

```
                    ┌──────────┐
        (trialDays>0)│ TRIALING │
                    └────┬─────┘
                         │ converteu / pagou
                    ┌────▼─────┐◄──────────────┐
      ┌─────────────┤  ACTIVE  │               │ retomou
      │             └────┬─────┘               │
      │ pausou           │ venceu         ┌────┴────┐
      │             ┌────▼─────┐          │ PAUSED  │
      │             │ PAST_DUE │          └─────────┘
      │             └────┬─────┘
      │                  │ excedeu tolerância
      │             ┌────▼──────┐
      │             │ SUSPENDED │
      │             └────┬──────┘
      │                  │
      └──────────────────┼───────────────┐
                         │               │
                   ┌─────▼─────┐   ┌─────▼─────┐
                   │ CANCELED  │   │  EXPIRED  │  (pré-pago, sem renovação)
                   └───────────┘   └───────────┘
```

### Transições

| De | Para | Gatilho | Efeitos |
|---|---|---|---|
| — | `TRIALING` | criação com `trialDays > 0` | agenda `subscription:trial-ending` |
| — | `ACTIVE` | criação sem trial | pós-pago: agenda 1ª cobrança · pré-pago: aguarda pagamento |
| `TRIALING` | `ACTIVE` | pagamento confirmado | emite `subscription.converted` |
| `TRIALING` | `EXPIRED` | fim do trial sem pagamento | emite `subscription.trial_expired` |
| `ACTIVE` | `PAST_DUE` | cobrança vence sem pagamento | inicia régua pós-vencimento |
| `PAST_DUE` | `ACTIVE` | pagamento confirmado | cancela passos pendentes da régua |
| `PAST_DUE` | `SUSPENDED` | atingiu `suspendAfterDays` | ⚠️ MVP: só status + notificação (ADR-010) |
| `SUSPENDED` | `ACTIVE` | pagamento confirmado | entra na lista de "reativar manualmente" |
| `ACTIVE`/`PAST_DUE` | `PAUSED` | ação do operador, com `pausedUntil` | suspende régua, não gera cobrança |
| `PAUSED` | `ACTIVE` | data atingida ou ação manual | recalcula `nextDueAt` |
| qualquer | `CANCELED` | ação do operador | cancela cobranças `OPEN` futuras; mantém histórico |
| `ACTIVE` | `EXPIRED` | pré-pago sem período vigente e `autoRenew = false` | — |

### Invariantes ⚠️

1. Toda transição grava `SubscriptionEvent` e emite evento de domínio. Sem exceção.
2. Transição inválida lança erro de domínio — nunca é silenciosamente ignorada.
3. `CANCELED` é terminal. Retomar significa **nova assinatura**, preservando o histórico da anterior.
4. Assinatura `PAUSED` ou `CANCELED` nunca gera cobrança nem entra na régua.
5. `SUSPENDED` continua gerando cobrança se pós-pago (a dívida existe), mas não envia mensagens de renovação.

### Implementação

```ts
// packages/core/src/subscription/state-machine.ts
const TRANSITIONS: Record<Status, Status[]> = {
  TRIALING:  ['ACTIVE', 'EXPIRED', 'CANCELED'],
  ACTIVE:    ['PAST_DUE', 'PAUSED', 'SUSPENDED', 'CANCELED', 'EXPIRED'],
  PAST_DUE:  ['ACTIVE', 'SUSPENDED', 'PAUSED', 'CANCELED'],
  SUSPENDED: ['ACTIVE', 'CANCELED'],
  PAUSED:    ['ACTIVE', 'CANCELED'],
  CANCELED:  [],
  EXPIRED:   ['ACTIVE', 'CANCELED'],
};

export function assertTransition(from: Status, to: Status) {
  if (!TRANSITIONS[from].includes(to))
    throw new InvalidTransitionError(from, to);
}
```

---

## Cálculo de vencimento

⚠️ Fonte histórica de bugs. Regras explícitas:

**Fuso.** Datas são armazenadas em UTC, mas "vencimento em 05/08" é um conceito **local do tenant**. O cálculo acontece no fuso do tenant e só depois converte. Vencimento é sempre `23:59:59` local.

**Fim de mês.** Assinatura ancorada no dia 31 vence no dia 28 (ou 29) em fevereiro, e volta ao 31 no mês seguinte. A âncora original é preservada — nunca sobrescrever `31` por `28`.

```ts
// packages/core/src/billing/next-due.ts
export function nextDueDate(anchor: number, from: DateTime, p: Periodicity): DateTime {
  const base = from.plus(periodToDuration(p));
  const lastDay = base.endOf('month').day;
  return base.set({ day: Math.min(anchor, lastDay) });
}
```

**Periodicidade `CUSTOM_DAYS`.** Comum no nicho (planos de 15, 30, 90 dias). Soma dias corridos, sem lógica de mês.

**Dias não úteis.** Vencimento não desloca. O que desloca é o **envio da mensagem** (ver `skipWeekends` e `quietHours` no doc 09).

---

## Mudança de plano e proração

**Regra padrão do MVP: sem proração automática.** A mudança vale a partir do próximo ciclo. Motivo: proração gera dúvida ("por que essa cobrança tem esse valor quebrado?") e o ICP não pede.

Opções oferecidas ao operador na troca de plano:

| Opção | Efeito |
|---|---|
| A partir do próximo vencimento (padrão) | Só altera `priceCents` e `planId`; ciclo atual intacto |
| Imediato, com crédito proporcional | Calcula dias não usados do valor antigo → gera `Credit`; nova cobrança pelo valor cheio |
| Imediato, sem ajuste | Troca e pronto |

Cálculo do crédito, quando escolhido:

```
diasRestantes = dias entre hoje e nextDueAt
diasCiclo     = dias do ciclo atual
creditoCents  = round(priceAnterior * diasRestantes / diasCiclo)
```

Arredondamento *round half up* em centavos, sempre. Nunca `Math.round` sobre float.

---

## Fluxo do pré-pago em detalhe

```
Pagamento CONFIRMADO
   ↓
Aloca a Charge(s) em aberto
   ↓
Existe AccessPeriod vigente?
   ├── Não  → cria período: [agora, agora + periodicidade)
   └── Sim  → cria período: [fim do vigente, fim + periodicidade)   ← empilha
   ↓
Atualiza subscription.nextDueAt = fim do último período
   ↓
Emite access_period.granted
   ↓
Agenda régua pré-vencimento (D-5, D-2, D0…) ancorada no novo nextDueAt
```

⚠️ O empilhamento é o que permite o cliente pagar 3 meses de uma vez. A constraint `EXCLUDE` garante que nunca haja sobreposição.

Expiração: job diário `subscription:expire-access` busca assinaturas pré-pagas sem período vigente e transiciona para `EXPIRED` (ou `SUSPENDED`, conforme política).

---

## Fluxo do pós-pago em detalhe

```
Job diário charge:generate
   ↓
Busca subscriptions ACTIVE/PAST_DUE com nextDueAt <= hoje + antecedência
   ↓
Já existe Charge para (subscription, competenceMonth)?   ← ⚠️ idempotência
   ├── Sim → pula
   └── Não → cria Charge OPEN
              ├── lança no ledger (AR débito / REVENUE crédito)
              ├── avança nextDueAt
              ├── agenda passos da régua
              └── emite charge.issued
```

⚠️ A chave de idempotência `(subscriptionId, competenceMonth)` evita cobrança duplicada quando o job roda duas vezes — que vai acontecer.

---

## Trial

Estado de primeira classe, comum no nicho ("teste 3 horas", "teste 24h", "7 dias grátis").

- `Plan.trialDays` define a duração; `0` significa sem trial
- Trial curto (< 1 dia): usar `trialHours` em `config` do plano 🔮 — no MVP, granularidade em dias
- Job `subscription:trial-ending` dispara em D-1 do fim
- Fim do trial sem pagamento → `EXPIRED` + evento `subscription.trial_expired`
- Métrica obrigatória no dashboard: **taxa de conversão de trial**

Régua de trial é separada da régua de cobrança: 2 passos (D-1 "seu teste acaba amanhã", D0 "seu teste acabou, assine"). Categoria `MARKETING` na Meta — precisa de opt-in.

---

## Cancelamento

Dois sabores, ambos necessários:

| Tipo | Comportamento |
|---|---|
| **Imediato** | Status `CANCELED` agora; cobranças `OPEN` futuras canceladas; pré-pago perde períodos futuros |
| **Ao fim do período** | Marca `autoRenew = false`; assinatura segue `ACTIVE` até o fim; então `EXPIRED` |

O padrão da UI deve ser **ao fim do período** — é o que o operador quase sempre quer, e evita estorno.

Sempre capturar `cancelReason` (lista fechada + campo livre). É a fonte de dados de churn mais barata que existe.
