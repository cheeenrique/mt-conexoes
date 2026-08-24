# 06 — Régua de cobrança e canais de WhatsApp

> O coração do sistema, e a parte que pode queimar o número do cliente se for feita errada.
> Avaliação e condições em `src/core/dunning-rules.ts` (puro). Orquestração em `src/features/dunning`. Adapters em `src/features/messaging/channels`.

## Conceito

Uma **régua** é uma sequência de passos ancorados no vencimento da cobrança. Cada passo tem deslocamento em dias, ação e texto.

```
   D-5            D-2            D0            D+1           D+3          D+5
    │              │              │             │             │            │
 lembrete    lembrete+Pix    vence hoje       aviso     último aviso   suspender
```

Como o modelo é pré-pago, a ênfase fica **antes** do vencimento — o acesso vai acabar, e o cliente age para não perder. Régua de pós-pago carrega a mão depois do vencimento, porque a dívida já existe.

### Régua padrão entregue

| Passo | Ação | Texto |
|---|---|---|
| D-5 | `SEND_MESSAGE` | `renovacao_proxima` |
| D-2 | `SEND_MESSAGE` | `renovacao_lembrete` (com chave Pix) |
| D0 | `SEND_MESSAGE` | `renovacao_hoje` |
| D+1 | `SEND_MESSAGE` | `renovacao_atrasada` |
| D+3 | `SEND_MESSAGE` | `renovacao_ultimo_aviso` |
| D+5 | `SUSPEND` | — muda o status e avisa o operador |

⚠️ `SUSPEND` **não corta o acesso no painel de streaming**. Muda `Subscription.status` para `SUSPENDED` e notifica. O corte técnico continua manual, e isso está declarado no slide 7 da apresentação.

---

## Templates

Editáveis pelo operador, com variáveis em português — quem escreve o texto não é programador.

| Variável | Vira |
|---|---|
| `{{cliente.primeiro_nome}}` | João |
| `{{cliente.nome}}` | João Silva |
| `{{cobranca.valor}}` | R$ 60,00 |
| `{{cobranca.vencimento}}` | 10/08 |
| `{{cobranca.dias_atraso}}` | 3 |
| `{{pix.chave}}` | a chave de `Settings` |
| `{{negocio.nome}}` | o nome do negócio |

```
renovacao_hoje:

Olá {{cliente.primeiro_nome}}! Sua renovação de {{cobranca.valor}}
vence hoje ({{cobranca.vencimento}}).

Pix: {{pix.chave}}

Qualquer dúvida, é só responder aqui.
{{negocio.nome}}
```

⚠️ Variável desconhecida no template é **erro na hora de salvar**, não string vazia na hora de enviar. Mensagem com `{{cliente.primerio_nome}}` saindo literal para 200 pessoas é o tipo de erro que não tem desfazer.

⚠️ Nenhum template pode conter credencial de acesso do assinante. O validador recusa `{{assinatura.senha}}` — a variável não existe, e não vai passar a existir.

---

## Motor — avaliação diária

Job `dunning-evaluate`, 07:00 local.

```
Para cada cobrança OPEN | OVERDUE | PARTIALLY_PAID:
   │
   ├─ diasDoVencimento = diff(hoje_local, dueAt_local)
   │
   └─ Para cada passo ativo da régua:
        │
        ├─ diasDoVencimento ≠ step.offsetDays ......... pula
        │
        ├─ já existe DunningExecution(chargeId, stepId)? ... pula   ⚠ idempotência
        │
        ├─ régua em REVIEW? ....... execution PENDING_REVIEW, não cria mensagem
        │
        ├─ customer.optedOut? ..... execution SKIPPED, reason opted_out     (T5)
        ├─ sem telefone? .......... execution SKIPPED, reason no_phone
        │
        └─ ação:
             SEND_MESSAGE → acumula no balde do customer
             SUSPEND      → transiciona a assinatura + notifica
             NOTIFY_OWNER → alerta interno
```

Depois de percorrer tudo, **consolida por customer** e cria no máximo uma mensagem por pessoa por dia (T7). Cliente com três cobranças vencidas recebe uma mensagem com o total, não três.

```ts
// core/dunning-rules.ts — puro
export function consolidate(
  pending: PendingStep[],
  now: Date,
  tz: string,
): ConsolidatedMessage[];
```

A escrita das execuções e das mensagens acontece **em uma transação por customer**. Falha em um cliente não derruba a passada inteira.

---

## Motor — despacho

Job `messages-dispatch`, a cada 15 minutos entre 08:00 e 20:00 local.

```
kill switch ligado (Settings.sendingPaused)? ..... não envia nada        (T8)

Busca messages PENDING com scheduledFor <= agora, ordem de criação, lote de 60:
   │
   ├─ mensagem com mais de 24h de idade? ... CANCELLED, reason stale
   ├─ fora da quiet hour agora? ............ reagenda para a próxima janela  (T6)
   ├─ customer.optedOut agora? ............. CANCELLED, reason opted_out     (T5)
   ├─ cobrança já paga ou cancelada? ....... CANCELLED, reason charge_closed
   │
   └─ adapter.send(...)
        ├─ ok    → SENT, grava externalId
        └─ falha → attempts++; 3 tentativas e vira FAILED com o motivo
```

Detalhes que importam:

- **Opt-out e pagamento são reconferidos no despacho**, não só na avaliação. Entre 07:00 e o envio o cliente pode ter pago ou pedido para sair. Cobrar quem acabou de pagar é o modo de falha mais caro do sistema.
- **`stale` existe por causa do kill switch.** Pausa de três dias acumularia mensagens que sairiam todas juntas ao despausar — e um disparo em massa fora de contexto é exatamente o que se quis evitar ao pausar.
- **Lote de 60 por passada** mantém o handler bem abaixo do timeout do Cloud Run e distribui os envios ao longo do dia, em vez de um pico.
- Falha definitiva aparece na timeline do cliente com o motivo. Mensagem que não saiu e ninguém soube é pior que mensagem que não saiu.

---

## Travas

| Trava | Implementação |
|---|---|
| **T5 — opt-out global** | `Customer.optedOut` bloqueia todos os canais. Conferido na avaliação e no despacho. Palavras-chave `PARE`, `SAIR`, `CANCELAR`, `DESCADASTRAR`, `STOP` marcam o cliente automaticamente quando o canal suporta receber resposta. |
| **T6 — quiet hours** | Nada fora de `Settings.quietHourStart`–`quietHourEnd` (padrão 08–20) no fuso do negócio. Fora da janela, reagenda; não descarta. |
| **T7 — uma por dia** | Índice único parcial `(customer_id, scheduled_date) WHERE kind = 'DUNNING'`. É o banco que garante, não o código. |
| **T8 — kill switch** | `Settings.sendingPaused`, botão no dashboard, efeito imediato no próximo despacho. |
| **Modo revisão** | `DunningRule.status = REVIEW` calcula tudo e não envia nada. A tela mostra quantas mensagens sairiam e para quem, com as opções **enviar todas**, **ignorar retroativos e ativar** e **manter em revisão**. |
| **Confirmação em lote** | Ação manual acima de 100 mensagens exige digitar o número para confirmar. |

⚠️ **A régua é entregue em `REVIEW`.** A importação da base traz histórico com status que quase sempre está errado em alguma linha; disparar cobrança retroativa para quem já pagou queima o número e a relação no primeiro dia. A ativação é uma decisão consciente do operador, na frente de uma lista.

⚠️ **Ignorar retroativos** marca as cobranças anteriores à ativação como `OVERDUE` sem agendar passo nenhum. É a opção certa em quase todos os casos, e deve ser a pré-selecionada.

---

## Envio manual assistido

Fora da régua, e sujeito às mesmas travas exceto a dedupe diária (que é uma escolha consciente do operador).

- Seleciona clientes por filtro (em atraso, vencem hoje, por fornecedor, por plano)
- Prévia com o texto real de cada um, não com placeholder
- Dispara em lote → cria `Message` com `kind = MANUAL`
- Acima de 100, confirmação por digitação do número

---

## Adapters de canal

Dois providers, uma interface. **`if (provider === 'evolution')` fora da pasta do adapter não passa em review.** Se uma decisão precisa saber qual provider é, o modelo de capabilities está incompleto — corrige o modelo.

```ts
// features/messaging/channels/types.ts
export type ChannelCapabilities = {
  supportsFreeText: boolean;           // texto livre chega ao destinatário?
  requiresApprovedTemplate: boolean;   // exige template pré-aprovado?
  supportsInboundReply: boolean;       // dá para receber "PARE"?
  supportsDeliveryReceipt: boolean;
  maxBodyLength: number;
  rateLimitPerMinute: number;
};

export interface ChannelAdapter {
  readonly provider: ChannelProvider;
  readonly capabilities: ChannelCapabilities;
  send(input: SendInput): Promise<SendResult>;
  healthCheck(): Promise<HealthResult>;
}

export type SendInput = {
  toPhone: string;               // E.164
  body: string;                  // já renderizado
  templateRef?: TemplateRef;     // usado quando requiresApprovedTemplate
};

export type SendResult =
  | { ok: true;  externalId: string }
  | { ok: false; retryable: boolean; reason: string };
```

| Provider | Texto livre | Template aprovado | Resposta de entrada | Onde roda |
|---|---|---|---|---|
| `META_CLOUD` | ❌ fora da janela de 24h | ✅ obrigatório | ✅ webhook | Cloud Run |
| `EVOLUTION` | ✅ | ❌ | ✅ webhook | **servidor próprio do cliente** |

> `SALVY` existiu como terceiro adapter e foi removido do produto. O valor continua no enum do
> Postgres (remover valor de enum é migration destrutiva por benefício zero) e `resolveAdapter`
> recusa explicitamente. Ver `prisma/README.md`.

### Caminhos de conexão

Cada canal declara **como** se conecta, e a tela percorre a declaração — nunca pergunta qual é o
provider:

```ts
export type ChannelConnectionMethod = {
  kind: 'PAIRING' | 'CREDENTIALS';
  id: string;                 // 'qr' | 'manual'
  label: string;
  recommended: boolean;
  requirements: string[];     // o "Antes de conectar" deste caminho
  setupSteps: string[];
  credentialFields: ChannelCredentialField[];
};
```

| Canal | Caminhos |
|---|---|
| `META_CLOUD` | `manual` — colar ID do número, WABA, token permanente e chave secreta |
| `EVOLUTION` | `qr` (recomendado) — o painel cria a instância e mostra o QR · `manual` — instância já pareada por fora |

O caminho `PAIRING` exige um segundo contrato, **opcional e fora de `ChannelAdapter`**
(`channels/pairing.ts`): `beginPairing`, `refreshChallenge`, `pairingState`, `unpair`. Ele não
entra na interface principal porque a Meta não parea por QR — só poderia lançar, o que violaria
LSP e ISP. `isPairable()` tem um consumidor: o service de pareamento, que falha alto se um
descritor promete QR e o adapter não entrega.

Na criação da instância, o painel fixa o que só dá para escolher naquele momento —
`groupsIgnore`, `rejectCall`, `syncFullHistory: false` — e aponta o webhook para cá com o
`webhookToken` em `webhook.headers.apikey`, que é o que faz **T5** funcionar. `instanceName` e
`webhookToken` são gerados pelo painel; `ChannelConfig.phoneNumber` vem do `wuid` do
`connection.update`, não de campo digitado.

⚠️ O QR e o código de pareamento não são persistidos nem logados — Server Action → prop →
`<img>`, e somem com o diálogo.

### ⚠️ A restrição da Meta que muda o produto

A régua manda mensagem para quem **não** iniciou conversa. Isso está sempre fora da janela de 24 horas, e nesse estado a Meta só entrega **template pré-aprovado** — texto livre é aceito pela API e não chega.

Consequência concreta no modelo:

```prisma
model DunningStep {
  templateBody       String?   // texto livre — Evolution
  metaTemplateName   String?   // nome do template aprovado na Meta
  metaTemplateParams Json?     // mapeamento posicional das variáveis
}
```

O motor escolhe pela capability. Se o canal ativo exige template aprovado e o passo não tem `metaTemplateName`, a execução vira `SKIPPED` com motivo `template_not_approved` e o aviso aparece na tela da régua — **não** sai uma mensagem que não vai chegar.

`metaTemplateParams` não é um campo que o operador preenche à parte: é derivado automaticamente das variáveis usadas em `templateBody`, na ordem da **primeira aparição** de cada uma — {{1}}, {{2}}... na mesma ordem que a Meta valida por posição. O texto que o operador escreve (e presumivelmente submeteu pra aprovação na Meta, com {{1}}/{{2}} no lugar das variáveis) já é a única fonte de verdade da ordem; pedir pra declarar de novo, num campo à parte, é o tipo de duplicação que diverge sozinha.

⚠️ **Consolidação (T7) e template aprovado não se combinam ainda.** Um cliente com mais de uma cobrança vencida no mesmo passo vira **uma** mensagem consolidada (T7); mas cada template aprovado tem um shape fixo de parâmetros, e não existe hoje um template de "N cobranças, valor total" aprovado na Meta. Quando o canal exige template e a consolidação juntaria mais de um passo pro mesmo cliente, o motor **não** manda o template do primeiro passo pela metade: cada `(cobrança, passo)` do grupo vira `SKIPPED` com motivo `consolidation_template_missing`, e nenhuma `Message` é criada. O caso de uma cobrança só (sem consolidação) já sai de verdade, com `Message.templateName`/`templateParams` congelados na avaliação — nunca recalculados no despacho, mesmo princípio do `body`. Resolver a consolidação exige modelar e aprovar um template de consolidação na Meta primeiro; é trabalho futuro, não um bug desta versão.

Templates escritos para aprovar como `UTILITY`, que é cerca de nove vezes mais barato que `MARKETING`. Isso é decisão de texto, não de código: tom transacional, sem "aproveite", "oferta", "promoção" ou emoji em excesso.

### ⚠️ Evolution exige servidor do cliente

Evolution API é processo persistente com sessão de WhatsApp — não roda em Cloud Run com escala a zero. O cliente provisiona uma VPS, e o sistema fala HTTP com ela.

Duas coisas ficam registradas na entrega, porque não estão na sua mão:

- O canal viola os Termos do WhatsApp. Banimento é questão de quando, não de se. A tela de configuração mostra o aviso e registra o aceite.
- A VPS, o número e a instância são do cliente. Você entrega o adapter funcionando contra um servidor válido; obter e manter o servidor é dele.

Stack Docker de referência para subir esse servidor (versão fixada, Postgres e Redis próprios, TLS via Caddy, backup/restore, atualização sem perder sessão): [`infra/evolution/README.md`](../../../infra/evolution/README.md).

### Seleção do canal

`ChannelConfig.isDefault` define quem envia. Trocar de canal é mudar a flag — nenhum código muda.

Se o canal padrão estiver inativo ou falhando, o despacho **não faz failover automático** para outro. Falha visível é melhor que mensagem saindo por um número que o cliente não esperava.

---

## Timeline do cliente

Toda execução aparece na ficha:

```
05/08  ✓ Enviado  D-5 lembrete            WhatsApp · Evolution   09:03
08/08  ✓ Enviado  D-2 lembrete com Pix    WhatsApp · Evolution   09:01
10/08  ✓ Enviado  D0 vence hoje           WhatsApp · Evolution   09:02
11/08  ⊘ Pulado   D+1 aviso               pagamento confirmado
11/08  ✓ Pago     R$ 60,00 via Pix        registro manual
```

É a resposta para "por que meu cliente recebeu essa mensagem?" — a pergunta de suporte mais comum que existe neste domínio.

---

## Casos de teste obrigatórios

Travas e idempotência são áreas de TDD.

- [ ] Passo com `offsetDays = -5` dispara exatamente cinco dias antes do vencimento, no fuso local
- [ ] `dunning-evaluate` rodando três vezes no mesmo dia cria **uma** execução por `(charge, step)`
- [ ] Cliente com três cobranças vencidas e passos coincidentes recebe **uma** mensagem, com o total correto (T7)
- [ ] Duas mensagens `DUNNING` para o mesmo cliente no mesmo dia local violam o índice único
- [ ] Mensagem agendada para 21:30 é reagendada para 08:00 do dia seguinte, não descartada (T6)
- [ ] `optedOut` marcado depois da avaliação e antes do despacho cancela o envio (T5)
- [ ] Pagamento registrado depois da avaliação e antes do despacho cancela o envio
- [ ] `sendingPaused` impede todo envio; mensagem parada há mais de 24h vira `CANCELLED` com motivo `stale` (T8)
- [ ] Régua em `REVIEW` calcula execuções `PENDING_REVIEW` e não cria nenhuma `Message`
- [ ] "Ignorar retroativos" marca as cobranças anteriores como `OVERDUE` sem agendar passo
- [ ] Canal com `requiresApprovedTemplate` e passo sem `metaTemplateName` → `SKIPPED`, nenhuma tentativa de envio
- [ ] Canal com `requiresApprovedTemplate`, passo com `metaTemplateName` e cobrança única → `Message` sai com `templateName`/`templateParams` congelados, adapter chama a Meta com `type: 'template'`
- [ ] Canal com `requiresApprovedTemplate` e cliente com mais de uma cobrança vencida no mesmo passo (consolidação) → nenhuma `Message`, cada `(cobrança, passo)` do grupo vira `SKIPPED` com motivo `consolidation_template_missing`
- [ ] Falha retryable incrementa `attempts`; na terceira, vira `FAILED` com motivo visível na timeline
- [ ] Template com variável inexistente falha ao salvar, não ao enviar
- [ ] Nenhum adapter é referenciado por nome fora de `features/messaging/channels` — verificado por busca no código
