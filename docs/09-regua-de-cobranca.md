# 09 — Régua de Cobrança

> O coração do produto. Substitui o motor visual de workflow no MVP (ADR-012) entregando ~90% do valor.

## Conceito

Uma **régua** é uma sequência de passos ancorados no vencimento de uma cobrança. Cada passo tem: deslocamento em dias, canal, template, condições e ação.

```
D-3          D0           D+1          D+3          D+7          D+10
 │            │            │            │            │            │
 lembrete   vence hoje   aviso      cobrança     último       suspender
 WhatsApp   WhatsApp     WhatsApp   + link       aviso        (notifica)
```

O sinal do deslocamento inverte entre os modelos:

- **Pós-pago:** ênfase no pós-vencimento (a dívida existe e cresce)
- **Pré-pago:** ênfase no pré-vencimento (o acesso vai acabar)

---

## Réguas padrão

Criadas automaticamente no primeiro acesso, em status `DRAFT`. O passo do onboarding é **revisar e ativar**, não criar.

### Pós-pago (padrão)

| Passo | Canal | Template | Condição |
|---|---|---|---|
| D-3 | WhatsApp | `dunning_before` | — |
| D0 | WhatsApp | `dunning_due_today` | — |
| D+1 | WhatsApp | `dunning_late_1` | — |
| D+3 | WhatsApp + E-mail | `dunning_late_3` | — |
| D+7 | WhatsApp | `dunning_late_7` | — |
| D+10 | — | ação: `SUSPEND` + notifica operador | — |
| D+30 | — | ação: `NOTIFY_OWNER` (sugerir baixa) | — |

### Pré-pago (padrão)

| Passo | Canal | Template | Condição |
|---|---|---|---|
| D-5 | WhatsApp | `renewal_soon` | — |
| D-2 | WhatsApp | `renewal_reminder` (com Pix) | — |
| D0 | WhatsApp | `renewal_today` | — |
| D+1 | WhatsApp | `renewal_late` | — |
| D+2 | — | ação: `SUSPEND` + notifica operador | — |

### Templates padrão

Escritos para **aprovar como `UTILITY` na Meta** — tom transacional, sem promoção. Isso é ~9x mais barato que `MARKETING` e é decisão de copy, não de código.

```
dunning_due_today:
Olá {{customer.first_name}}! Sua mensalidade de {{charge.amount}}
vence hoje ({{charge.due_date}}).

Pix: {{pix.code}}

Qualquer dúvida, é só responder aqui.
{{tenant.display_name}}
```

⚠️ Evitar em templates que buscam categoria UTILITY: emojis em excesso, "aproveite", "oferta", "promoção", "não perca", CTA de venda.

---

## Motor de avaliação

### Fluxo diário

```
Job dunning:evaluate (07:00 local do tenant)
   ↓
Para cada tenant com régua ACTIVE:
   ↓
   Busca cobranças OPEN/OVERDUE/PARTIALLY_PAID
   ↓
   Para cada cobrança, para cada passo da régua:
      ↓
      daysFromDue = diff(hoje, charge.dueAt) no fuso do tenant
      ↓
      daysFromDue == step.offsetDays ?
         ├── Não → pula
         └── Sim ↓
              ↓
      Já existe DunningExecution(chargeId, stepId)?   ⚠️ idempotência
         ├── Sim → pula
         └── Não ↓
              ↓
      Condições do passo satisfeitas?
         ├── Não → cria execution SKIPPED com motivo
         └── Sim ↓
              ↓
      Contato do canal existe, verificado e sem opt-out?  ⚠️
         ├── Não → SKIPPED (motivo: no_contact | opted_out)
         └── Sim ↓
              ↓
      Régua em modo REVIEW?
         ├── Sim → execution PENDING_REVIEW (não envia) ⚠️
         └── Não → enfileira message:send respeitando quiet hours e quota
```

### Condições disponíveis (MVP)

```ts
type StepConditions = {
  minAmountCents?: bigint;
  maxAmountCents?: bigint;
  planIds?: string[];
  isVip?: boolean;
  tagIds?: string[];
  customerCreatedBefore?: number;   // dias de casa
  firstChargeOnly?: boolean;
  hasPartialPayment?: boolean;
};
```

Avaliadas em `packages/core/src/dunning/conditions.ts`, puro e testável. 🔮 O engine futuro estende este mesmo tipo.

### Ações disponíveis (MVP)

| Ação | Efeito |
|---|---|
| `SEND_MESSAGE` | Envia template pelo canal do passo |
| `SUSPEND` | Transiciona assinatura para `SUSPENDED` + notifica operador (ADR-010: sem corte técnico) |
| `NOTIFY_OWNER` | Alerta interno para o operador, sem tocar o customer |
| `APPLY_TAG` | Marca o customer (ex.: "inadimplente crônico") |

🔮 Fase 4: `APPLY_DISCOUNT`, `CALL_WEBHOOK`, `CREATE_TASK`, `HTTP_REQUEST`.

---

## ⚠️ Travas de segurança

Esta seção não é negociável por prazo. É o que separa "sistema útil" de "sistema que queimou o número do cliente no primeiro dia".

### T1 — Modo de revisão pós-importação

Após qualquer `import.completed`, a régua do tenant entra em `REVIEW` automaticamente.

Nesse estado ela **calcula tudo e não envia nada**. A UI mostra:

```
⚠️ 247 mensagens seriam enviadas hoje

  183 cobranças vencidas (média de 34 dias de atraso)
   41 vencem hoje
   23 vencem em 3 dias

  [Ver lista completa]
  [ Enviar todas ]  [ Ignorar retroativos e ativar ]  [ Manter em revisão ]
```

Sem confirmação explícita, nada sai. Motivo: planilha importada quase sempre traz histórico com status errado; disparar cobrança para quem já pagou é o modo de falha mais caro do produto.

### T2 — Limite para tenant novo

Nas primeiras 48h após o primeiro envio: **máximo 50 mensagens/dia**. Protege contra queda de quality rating e banimento antes do tenant sequer entender o sistema.

### T3 — Confirmação em duas etapas

Qualquer ação que dispare mais de 100 mensagens de uma vez exige confirmação com digitação do número ("digite 247 para confirmar").

### T4 — Ignorar retroativos

Opção oferecida no preview da importação e na ativação da régua: "considerar apenas vencimentos a partir de hoje". Marca cobranças anteriores como `OVERDUE` sem agendar passos.

### T5 — Opt-out global

`contact.opted_out` bloqueia envio em **todos** os canais daquele customer, para **todas** as réguas do tenant. Palavras-chave processadas automaticamente: `PARE`, `SAIR`, `CANCELAR`, `DESCADASTRAR`, `STOP`.

### T6 — Quiet hours

Nada enviado fora de 08:00–20:00 no fuso do tenant. Job reagenda para a próxima janela. Cobrança às 23h é denúncia de spam garantida e infração ao CDC.

### T7 — Deduplicação por customer

Um mesmo customer não recebe mais de uma mensagem de cobrança por dia, mesmo com várias cobranças vencidas. Consolida em uma mensagem com a soma. ⚠️ Isso também economiza custo de mensagem.

### T8 — Kill switch

Botão "pausar todos os envios" visível no dashboard, com efeito imediato. Quando algo dá errado, o operador precisa de um freio que não dependa de editar régua por régua.

---

## Conformidade de cobrança

Regras do CDC embutidas no sistema, não deixadas como conselho:

- **Art. 42:** cobrança não pode expor o consumidor a ridículo nem constrangimento. Templates padrão são neutros; validador alerta sobre linguagem coercitiva em templates customizados.
- **Horário:** quiet hours (T6).
- **Frequência:** deduplicação diária (T7) e limite de passos por régua.
- **Terceiros:** o sistema nunca envia cobrança para contato que não seja do próprio devedor.

---

## Timeline do cliente

Toda execução da régua aparece na ficha do customer:

```
05/08  ✓ Enviado  D-3 lembrete           WhatsApp   entregue 14:02, lido 14:31
08/08  ✓ Enviado  D0 vence hoje          WhatsApp   entregue 09:01
09/08  ⊘ Pulado   D+1 aviso              motivo: pagamento confirmado
09/08  ✓ Pago     R$ 50,00 via Pix       Mercado Pago
```

Isso é a resposta para "por que meu cliente recebeu essa mensagem?" — a pergunta de suporte mais comum que você vai receber.

---

## 🔮 Evolução para o engine visual (Fase 4)

O que já estará pronto quando o momento chegar:

- Catálogo de eventos completo (doc 08) = lista de triggers
- Sistema de condições tipado e testável = nós de condição
- Sistema de ações plugável = nós de ação
- Graphile Worker com `jobKey` = esperas duráveis
- `DunningExecution` = modelo de execução com idempotência

O que faltará construir: canvas visual (React Flow), versionamento de definição com execução pinada na versão, detecção de ciclo, quota de execução por tenant, e replay/debug de execução.

⚠️ Não começar isso antes de ter ~30 tenants pagantes reclamando de rigidez. Antes disso, a régua parametrizável resolve.
