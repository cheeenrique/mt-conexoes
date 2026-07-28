# 10 — Integrações de Pagamento

## Modelo BYO (ADR-009)

O tenant conecta a **conta dele**. Não intermediamos dinheiro, não somos PSP, não temos receita de transação. O dinheiro vai direto do assinante para o tenant.

Consequências: onboarding mais trabalhoso (wizard por provider é obrigatório) e responsabilidade do tenant sobre a conta dele.

---

## Abstração

```ts
// packages/core/src/payments/provider.ts
export interface PaymentProviderCapabilities {
  autoReconciliation: boolean;   // confirma pagamento por webhook
  dynamicPix: boolean;           // BR Code com txid por cobrança
  staticPix: boolean;
  boleto: boolean;
  creditCard: boolean;
  recurring: boolean;            // assinatura no lado do gateway
  refund: boolean;
  split: boolean;
}

export interface PaymentProvider {
  readonly code: string;
  readonly capabilities: PaymentProviderCapabilities;

  validateCredentials(creds: unknown): Promise<ValidationResult>;
  createCharge(input: CreateChargeInput): Promise<ProviderCharge>;
  getCharge(externalId: string): Promise<ProviderCharge>;
  cancelCharge(externalId: string): Promise<void>;
  refund(paymentId: string, amountCents: bigint): Promise<RefundResult>;
  verifyWebhook(headers: Headers, rawBody: string): boolean;
  parseWebhook(rawBody: string): PaymentEvent[];
  healthCheck(): Promise<HealthStatus>;
}
```

⚠️ O restante do sistema consulta `capabilities`. **Nunca** `if (provider === 'mercadopago')`. Se uma feature precisa de galho por provider fora do módulo de integração, o modelo de capabilities está incompleto.

---

## Provider: Pix manual

O caminho de menor atrito — funciona sem aprovação de terceiro, o que é essencial dado o risco R1.

```ts
capabilities = {
  autoReconciliation: false,   // ⚠️ o operador dá baixa na mão
  dynamicPix: false,
  staticPix: true,
  boleto: false, creditCard: false, recurring: false, refund: false, split: false,
}
```

### Configuração

| Campo | Regra |
|---|---|
| Tipo de chave | CPF, CNPJ, e-mail, telefone ou aleatória |
| Chave | Validada por formato conforme o tipo |
| Nome do recebedor | Obrigatório no BR Code. Máx. 25 chars, sem acento |
| Cidade | Obrigatória. ⚠️ Máx. 15 chars, sem acento — senão o QR não valida |

Gera BR Code estático (EMV) conforme spec do Bacen. Preview do QR na tela antes de salvar.

### ⚠️ Aviso obrigatório na UI

> Com Pix manual você continuará conferindo o extrato e marcando os pagamentos manualmente. Para baixa automática, conecte um gateway.

Isso é honestidade e é o melhor gancho de upsell que existe: o operador sente a dor e migra sozinho.

---

## Provider: Mercado Pago

```ts
capabilities = {
  autoReconciliation: true, dynamicPix: true, staticPix: false,
  boleto: true, creditCard: true, recurring: true, refund: true, split: false,
}
```

### Wizard passo a passo

1. **Criar aplicação** — link direto para o painel de desenvolvedor, com screenshot
2. **Copiar Access Token** — ⚠️ distinguir claramente token de **produção** e de **teste**; badge de sandbox visível no sistema inteiro quando em teste
3. **Colar no sistema** → **botão "Testar conexão"** (chamada de leitura que valida escopo)
4. **Configurar webhook** — mostramos a URL pronta com botão copiar:
   `https://api.meusaas.com/webhooks/mercadopago/{tenantSlug}`
5. **Cobrança de teste de R$ 0,01** — valida o ciclo completo: criação → pagamento → webhook → baixa
6. **Diagnóstico** — tela de saúde com último erro legível

### Webhook

```
POST /webhooks/mercadopago/:tenantSlug
   ↓
Verifica assinatura (x-signature + x-request-id) ⚠️
   ↓
UNIQUE(providerCode, externalId) → dedupe ⚠️
   ↓
Responde 200 imediatamente
   ↓
Job webhook:process resolve a Charge e concilia (ver doc 07)
```

⚠️ Conferir `transaction_amount` contra `charge.totalCents`. Divergência → alerta, não baixa automática.

---

## Provider: PagBank (PagSeguro)

```ts
capabilities = {
  autoReconciliation: true, dynamicPix: true, staticPix: false,
  boleto: true, creditCard: true, recurring: true, refund: true, split: false,
}
```

Wizard com a mesma estrutura: gerar token no painel → colar → testar → configurar notificação → cobrança de teste → diagnóstico.

Diferenças a tratar no adapter: formato de notificação distinto do Mercado Pago, e necessidade de consultar o recurso após a notificação (a notificação nem sempre traz o estado completo).

---

## ⚠️ Nota sobre elegibilidade

Mercado Pago e PagBank listam venda de conteúdo audiovisual sem licenciamento entre as atividades vedadas em seus termos. Contas de tenants nessa situação **serão encerradas** em algum momento, e o tenant abrirá chamado conosco.

Providências no produto:

- Pix manual sempre disponível como caminho independente de terceiro
- Aviso no wizard: "confirme que sua atividade é permitida pelos termos do gateway"
- AUP nossa proibindo uso para atividade ilícita, com direito de encerramento
- Runbook de suporte pronto para "meu gateway foi bloqueado"

---

## Tela de saúde da integração

Para todo provider conectado:

| Item | Origem |
|---|---|
| Status da conexão | `healthCheck()` a cada 6h + sob demanda |
| Última sincronização | `lastTestedAt` |
| Validade do token | quando o provider expõe |
| Cobranças criadas (30d) | agregação local |
| Webhooks recebidos (7d) | `WebhookEvent` |
| Taxa de erro | `IntegrationLog` |
| Último erro | mensagem legível, não código HTTP cru |
| Botão | "Testar conexão" · "Criar cobrança de teste" · "Desconectar" |

---

## Segurança de credenciais ⚠️

```
Credencial em texto
      ↓
AES-256-GCM com DEK (chave de dados por tenant)
      ↓
DEK criptografada com KEK (chave mestra em KMS / variável de ambiente)
      ↓
Armazena: ciphertext + IV + tag + DEK criptografada
```

Regras:
- Credencial **nunca** volta para o front, nem mascarada com valor real. Mostrar apenas `••••1234` a partir dos 4 últimos dígitos guardados separadamente
- Credencial nunca aparece em log, Sentry ou mensagem de erro
- Rotação de KEK documentada em runbook
- Desconectar apaga a credencial de fato — não é soft delete
