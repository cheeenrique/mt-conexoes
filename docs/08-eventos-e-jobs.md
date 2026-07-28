# 08 — Eventos e Jobs

> Este é o documento que sustenta a visão "automação primeiro". O motor visual de workflow está fora do MVP (ADR-012), mas o **barramento de eventos existe desde o dia 1** — é ele que permite plugar o engine depois sem reescrever regra de negócio.

## Princípio

Toda mudança de estado relevante:

1. Acontece dentro de uma transação
2. Grava um `OutboxEvent` **na mesma transação**
3. É publicada por um dispatcher que enfileira os handlers

Isso garante que **nenhum efeito colateral se perde** e **nenhum efeito acontece sem a mudança ter sido persistida**.

```ts
await prisma.$transaction(async (tx) => {
  const charge = await tx.charge.create({ data });
  await tx.ledgerEntry.createMany({ data: entries });
  await tx.outboxEvent.create({
    data: { tenantId, type: 'charge.issued', aggregateId: charge.id, payload: {...} },
  });
});
```

O dispatcher (job recorrente a cada 5s) lê `OutboxEvent` não publicados, enfileira os handlers e marca `publishedAt`. Alternativamente, enfileirar direto na transação com `graphile_worker.add_job` — ver seção "Enfileirar transacionalmente".

---

## Catálogo de eventos

Nomenclatura: `entidade.acao` no passado. Payload sempre inclui `tenantId`, `occurredAt` e os ids necessários — **nunca o objeto inteiro** (ele pode ter mudado quando o handler rodar).

### Tenant e usuários

| Evento | Quando |
|---|---|
| `tenant.created` | Cadastro concluído |
| `tenant.plan_changed` | Upgrade/downgrade do plano do SaaS |
| `user.invited` | Convite enviado |
| `user.joined` | Convite aceito |
| `onboarding.step_completed` | Passo do onboarding concluído |
| `onboarding.completed` | Todos os passos mínimos concluídos |
| `onboarding.stalled` | 48h sem progresso com passos pendentes |

### Clientes e assinaturas

| Evento | Quando |
|---|---|
| `customer.created` | Cadastro manual ou importação |
| `customer.updated` | Alteração de dados relevantes |
| `customer.archived` | Arquivamento |
| `subscription.created` | Nova assinatura |
| `subscription.activated` | Entrou em `ACTIVE` |
| `subscription.trial_ending` | D-1 do fim do trial |
| `subscription.trial_expired` | Trial acabou sem conversão |
| `subscription.converted` | Trial virou pagante |
| `subscription.past_due` | Entrou em atraso |
| `subscription.suspended` | Suspensa |
| `subscription.reactivated` | Voltou a `ACTIVE` |
| `subscription.paused` / `resumed` | Pausa |
| `subscription.canceled` | Cancelamento |
| `subscription.plan_changed` | Troca de plano |
| `access_period.granted` | Pré-pago: novo período concedido |
| `access_period.expiring` | Pré-pago: D-N do fim |
| `access_period.expired` | Pré-pago: acesso acabou |

### Financeiro

| Evento | Quando |
|---|---|
| `charge.issued` | Cobrança emitida |
| `charge.due_soon` | D-N do vencimento |
| `charge.overdue` | Venceu sem pagamento |
| `charge.partially_paid` | Pagamento parcial alocado |
| `charge.paid` | Quitada |
| `charge.canceled` | Cancelada |
| `charge.written_off` | Baixa por incobrabilidade |
| `charge.late_fees_applied` | Multa/juros aplicados |
| `payment.received` | Pagamento registrado |
| `payment.confirmed` | Confirmado pelo gateway |
| `payment.failed` | Falhou |
| `payment.refunded` | Estornado |
| `payment.charged_back` | Chargeback |
| `credit.granted` / `credit.applied` | Crédito criado / usado |

### Comunicação

| Evento | Quando |
|---|---|
| `message.queued` | Enfileirada |
| `message.sent` | Aceita pelo provider |
| `message.delivered` | Entregue |
| `message.read` | Lida |
| `message.failed` | Falhou |
| `message.inbound_received` | Customer respondeu (abre janela de 24h) |
| `contact.opted_out` | Customer pediu para parar |

### Integrações e importação

| Evento | Quando |
|---|---|
| `integration.connected` / `disconnected` | Conexão |
| `integration.error` | Falha de comunicação |
| `integration.health_degraded` | Quality rating caiu, token expirando |
| `import.started` / `completed` / `failed` / `undone` | Ciclo de importação |

---

## Handlers no MVP

Cada evento pode ter N handlers. Os do MVP:

| Evento | Handler | Ação |
|---|---|---|
| `charge.issued` | `ScheduleDunningHandler` | Agenda passos da régua |
| `charge.paid` | `CancelPendingDunningHandler` | Cancela passos futuros da cobrança |
| `charge.paid` | `SendReceiptHandler` | Mensagem de confirmação |
| `charge.paid` | `GrantAccessPeriodHandler` | Pré-pago: concede período |
| `charge.overdue` | `UpdateSubscriptionStatusHandler` | `ACTIVE` → `PAST_DUE` |
| `customer.created` | `SendWelcomeHandler` | Boas-vindas (se ativado) |
| `contact.opted_out` | `SuppressAllChannelsHandler` | ⚠️ Bloqueia envio em todos os canais |
| `import.completed` | `EnterDunningReviewHandler` | ⚠️ Coloca régua em modo revisão |
| `onboarding.stalled` | `NudgeOwnerHandler` | E-mail de ajuda (dogfooding) |

🔮 **Ponto de extensão para o engine futuro:** um `WorkflowTriggerHandler` genérico que, para qualquer evento, consulta workflows ativos com aquele trigger e inicia execução. O catálogo acima já é a lista de triggers disponíveis.

---

## Jobs

### Recorrentes (crontab do Graphile Worker)

```
*/5  * * * *   outbox:dispatch            publica eventos pendentes
0    6 * * *   charge:generate            gera cobranças do dia (06:00 local do tenant)
15   6 * * *   charge:mark-overdue        marca vencidas
30   6 * * *   charge:apply-late-fees     recalcula multa e juros
0    7 * * *   dunning:evaluate           avalia e agenda passos do dia
0    8 * * *   subscription:expire-access pré-pago sem período vigente
0    9 * * *   subscription:trial-ending  avisa fim de trial
0    3 * * *   ledger:verify              ⚠️ verifica balanceamento
0    4 * * *   integration:health-check    testa conexões, checa validade de token
0    2 * * 0   cleanup:retention          expurgo conforme política de retenção
```

⚠️ Jobs "às 06:00" rodam por **fuso do tenant**, não do servidor. Implementação: o job varre tenants cujo horário local seja o alvo. Alternativa mais simples no MVP: rodar às 09:00 UTC (06:00 em São Paulo) e aceitar a limitação enquanto todos os tenants forem BR.

### Sob demanda

| Job | Disparo | Retry |
|---|---|---|
| `message:send` | Passo da régua ou envio manual | 5x, backoff exponencial |
| `webhook:process` | Recebimento de webhook | 3x |
| `import:analyze` | Upload de planilha | 1x |
| `import:validate` | Confirmação de mapeamento | 1x |
| `import:execute` | Confirmação do preview | 0 (lotes idempotentes) |
| `import:undo` | Rollback | 1x |
| `integration:test` | Botão "testar conexão" | 0 |
| `export:generate` | Solicitação de relatório | 2x |

### Enfileirar transacionalmente

```ts
// packages/db/src/queue.ts
export async function enqueue(
  tx: Prisma.TransactionClient,
  task: string,
  payload: unknown,
  opts?: { runAt?: Date; jobKey?: string; maxAttempts?: number },
) {
  await tx.$executeRaw`
    SELECT graphile_worker.add_job(
      ${task}::text,
      payload   => ${JSON.stringify(payload)}::json,
      run_at    => ${opts?.runAt ?? new Date()}::timestamptz,
      job_key   => ${opts?.jobKey ?? null}::text,
      max_attempts => ${opts?.maxAttempts ?? 3}::int
    )
  `;
}
```

⚠️ `jobKey` é a chave de deduplicação. Usar sempre que o job puder ser agendado mais de uma vez para o mesmo alvo — ex.: `dunning:{chargeId}:{stepId}`. Reagendar com o mesmo `jobKey` substitui, não duplica.

---

## Garantias e idempotência

**Entrega:** at-least-once. Todo handler **precisa** ser idempotente.

Padrões de idempotência usados:

| Situação | Mecanismo |
|---|---|
| Geração de cobrança | `UNIQUE(subscriptionId, competenceMonth)` |
| Passo da régua | `UNIQUE(chargeId, stepId)` em `DunningExecution` |
| Webhook | `UNIQUE(providerCode, externalId)` em `WebhookEvent` |
| Envio de mensagem | Verifica `Message` já existente para `(dunningStepId, chargeId)` |
| Requisição da API | Header `Idempotency-Key` → tabela `IdempotencyKey` |
| Job agendado | `jobKey` do Graphile Worker |

**Ordem:** não garantida. Nenhum handler pode assumir que outro já rodou. Se houver dependência, encadeie explicitamente (handler A enfileira B) ou verifique estado.

**Falha:** após esgotar retries, o job vai para a tabela de falhas do Graphile Worker. ⚠️ Alerta no Sentry e visibilidade na UI para jobs falhos que afetam o tenant (ex.: mensagem não enviada aparece na timeline do cliente com o motivo).

**Loop:** o engine futuro precisará de detecção de ciclo e limite de profundidade. No MVP, os handlers são finitos e não reentrantes por construção — documentar isso como restrição a ser revisitada.

---

## Rate limiting de envio

Sem Redis, o token bucket vive no Postgres:

```sql
CREATE TABLE send_quotas (
  tenant_id     uuid,
  window_start  timestamptz,
  channel       text,
  sent_count    int DEFAULT 0,
  PRIMARY KEY (tenant_id, channel, window_start)
);
```

O job `message:send` incrementa com `INSERT ... ON CONFLICT DO UPDATE ... RETURNING` e reagenda para a próxima janela se estourou o limite.

⚠️ Limites obrigatórios:
- **Tenant novo (< 48h):** máximo 50 mensagens/dia
- **Global por tenant:** configurável por plano (ver doc 15)
- **Quiet hours:** nada enviado fora de 08:00–20:00 no fuso do tenant — job reagenda para a próxima janela válida
